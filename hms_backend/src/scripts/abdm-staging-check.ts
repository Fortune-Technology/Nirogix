import { config as loadEnv } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  ABHA_PATHS,
  GATEWAY_PATHS,
  HIP_CALLBACK_PATHS,
  HIP_CONSENT_NOTIFY_PATH,
  HIP_DATA_REQUEST_PATH,
  HIP_DISCOVERY_CALLBACK_PATHS,
  HIP_PROFILE_SHARE_PATH,
  HIU_CALLBACK_PATHS,
  BRIDGE_ADMIN,
} from '../modules/abdm/abdm.constants';

/**
 * ABDM readiness on a deployed environment — `npm run abdm:staging` (ADR-141).
 *
 * **The one ABDM check that runs on staging.** Everything else either refuses there or answers a
 * different question:
 *
 * - `abdm:m2check` / `abdm:m3check` write fictional patients and correctly refuse outside
 *   development. They prove the *logic* works; they cannot prove a deployment does.
 * - `abdm:check` proves two outbound calls succeed. That is M1's foundation and nothing else.
 * - `abdm:fidelius-check` proves encryption, and contacts nothing.
 *
 * None of them answers the question that actually decides M2 and M3: **can ABDM reach us?** Every
 * M1 flow is outbound, which is why M1 works from a laptop. Every M2 and M3 flow is a round trip —
 * linking confirmations, discovery, consent notifications, records requests and the four
 * acknowledgements all arrive as webhooks on the URL registered with NHA. A deployment where those
 * routes 404 fails silently: the gateway posts, gets nothing it recognises, and the hospital sees a
 * feature that does not work rather than an error anybody can search for.
 *
 * So this script checks both directions, from wherever it is run:
 *
 *   1. **Outbound** — session, ABHA certificate, HFR master data. Can we reach ABDM from here?
 *   2. **Bridge** — what NHA currently holds, and whether it points at the host being probed.
 *   3. **Inbound** — every callback route, over the public URL, exactly as the gateway would.
 *
 * ── WHY A 401 IS THE PASS ─────────────────────────────────────────────────
 * The probes send no credentials, so a correctly deployed route answers **401** — the JWKS guard
 * refusing an unauthenticated caller (ADR-109). That single response proves two things at once: the
 * path is mounted, and the guard is live. The failures are the interesting part:
 *
 *   404  the path is wrong or the app is not deployed — the gateway's calls go nowhere
 *   2xx  the guard is OFF, which is a complete unauthenticated path to patient data
 *
 * A 429 also proves the route exists: `authLimiter` is mounted *on the route*, so a request that
 * never matched a route can never be rate-limited. The limiter allows ten failures per quarter hour
 * per IP, and there are more routes than that, so later probes will legitimately report 429.
 *
 * ── SAFETY ────────────────────────────────────────────────────────────────
 * **Writes nothing, anywhere.** No database connection, no patient, no tenant, no registration at
 * NHA. It reads two ABDM endpoints, reads the bridge record, and posts empty bodies to our own
 * callback routes, which are refused before any handler runs. Safe on staging and on production.
 *
 * It never prints a secret: the client secret is shown as a length and the access token as a
 * fingerprint, so the output can be pasted into an NHA support ticket or a chat.
 *
 *   npm run abdm:staging -w hms_backend                       (from anywhere in the repo)
 *   npm run abdm:staging -w hms_backend -- --url https://api-staging.nirogix.com
 *   npm run abdm:staging -w hms_backend -- --inbound-only
 *   npx tsx hms_backend/src/scripts/abdm-staging-check.ts    (no npm exit-code wrapper)
 */

/**
 * The backend's own `.env`, resolved from THIS FILE rather than from the working directory.
 *
 * `import 'dotenv/config'` reads `.env` relative to `process.cwd()`, which is right for every other
 * script here because they are only ever launched by `npm run -w hms_backend`. This one is typed by
 * hand on a server, and from the repository root there is no `.env` at all — so the credentials came
 * back `(not set)` and the provider read `mock`, which looks exactly like a misconfigured node and is
 * really a wrong directory. A check that misreports its own configuration is worse than no check.
 */
loadEnv({ path: join(__dirname, '..', '..', '.env') });
// Then the working directory, so an override placed beside the invocation still wins nothing it
// should not: dotenv never replaces a variable that is already set.
loadEnv();

const GATEWAY = process.env.ABDM_GATEWAY_BASE_URL ?? 'https://dev.abdm.gov.in';
const ABHA = process.env.ABDM_ABHA_BASE_URL ?? 'https://abhasbx.abdm.gov.in/abha/api';
const HFR = process.env.ABDM_HFR_BASE_URL ?? 'https://apihspsbx.abdm.gov.in/v4/int';
const CM_ID = process.env.ABDM_CM_ID ?? 'sbx';

/** Blank means "not configured" and behaves exactly like unset — the rule `config/env.ts` applies. */
const notBlank = (v: string | undefined): string | undefined =>
  v && v.trim() !== '' ? v.trim() : undefined;

const CLIENT_ID = notBlank(process.env.ABDM_CLIENT_ID);
const CLIENT_SECRET = notBlank(process.env.ABDM_CLIENT_SECRET);

let passed = 0;
let failed = 0;
let warned = 0;

const ok = (m: string) => {
  passed += 1;
  console.log(`  ✓ ${m}`);
};
const bad = (m: string) => {
  failed += 1;
  console.log(`  ✗ ${m}`);
};
const warn = (m: string) => {
  warned += 1;
  console.log(`  ! ${m}`);
};
const note = (m: string) => console.log(`    ${m}`);
const step = (n: number, m: string) => console.log(`\n${n}. ${m}`);

function arg(name: string): string | undefined {
  const exact = process.argv.find((a) => a === `--${name}`);
  const withValue = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (withValue) return withValue.split('=').slice(1).join('=');
  if (exact) {
    const next = process.argv[process.argv.indexOf(exact) + 1];
    return next && !next.startsWith('--') ? next : '';
  }
  return undefined;
}

/** Every path ABDM posts to us, with the milestone that stops working when it 404s. */
const INBOUND: Array<{ path: string; milestone: string; what: string }> = [
  {
    path: HIP_PROFILE_SHARE_PATH,
    milestone: 'M1',
    what: 'Scan and Share — a patient shares their profile',
  },
  { path: HIP_CALLBACK_PATHS.onGenerateToken, milestone: 'M2', what: 'the link token arrives' },
  { path: HIP_CALLBACK_PATHS.onLinkCareContext, milestone: 'M2', what: 'linking outcome' },
  {
    path: HIP_CALLBACK_PATHS.contextOnNotify,
    milestone: 'M2',
    what: 'care-context update acknowledged',
  },
  { path: HIP_CALLBACK_PATHS.smsOnNotify, milestone: 'M2', what: 'deep-link SMS acknowledged' },
  {
    path: HIP_DISCOVERY_CALLBACK_PATHS.discover,
    milestone: 'M2',
    what: 'a patient discovers their records',
  },
  {
    path: HIP_DISCOVERY_CALLBACK_PATHS.linkInit,
    milestone: 'M2',
    what: 'user-initiated linking begins',
  },
  {
    path: HIP_DISCOVERY_CALLBACK_PATHS.linkConfirm,
    milestone: 'M2',
    what: 'user-initiated linking confirmed',
  },
  { path: HIP_CONSENT_NOTIFY_PATH, milestone: 'M2', what: 'consent granted, revoked or expired' },
  { path: HIP_DATA_REQUEST_PATH, milestone: 'M2', what: 'a consented request for records' },
  { path: HIU_CALLBACK_PATHS.onInit, milestone: 'M3', what: 'our consent request was raised' },
  { path: HIU_CALLBACK_PATHS.onFetch, milestone: 'M3', what: 'a granted artefact arrives' },
  { path: HIU_CALLBACK_PATHS.onNotify, milestone: 'M3', what: 'consent revoked or expired' },
  { path: HIU_CALLBACK_PATHS.onConsentStatus, milestone: 'M3', what: 'consent request status' },
  {
    path: HIU_CALLBACK_PATHS.onDataRequest,
    milestone: 'M3',
    what: 'the transaction id for a records request',
  },
  { path: HIU_CALLBACK_PATHS.dataPush, milestone: 'M3', what: 'a hospital delivers records' },
];

async function session(): Promise<string | null> {
  const res = await fetch(`${GATEWAY}${GATEWAY_PATHS.sessions}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'REQUEST-ID': randomUUID(),
      TIMESTAMP: new Date().toISOString(),
      'X-CM-ID': CM_ID,
    },
    body: JSON.stringify({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      grantType: 'client_credentials',
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    bad(`session refused: HTTP ${res.status}`);
    // The one failure worth naming, because it looks like a credential problem and is not.
    if (/cloudfront|request blocked/i.test(`${res.headers.get('server') ?? ''} ${body}`)) {
      note('Blocked at the CDN before reaching ABDM — this host’s IP range is refused.');
      note('Every ABDM call from here will fail the same way, whatever the credentials are.');
      note('An India-resident host is the fix; see BACKLOG.md I-6.');
    } else {
      note(body);
    }
    return null;
  }
  const data = (await res.json()) as { accessToken?: string; expiresIn?: number };
  const token = data.accessToken ?? null;
  if (!token) {
    bad('session answered 200 but carried no accessToken');
    return null;
  }
  ok(`session issued: ${token.slice(0, 6)}…${token.slice(-4)} (${token.length} chars)`);
  return token;
}

async function outbound(token: string): Promise<void> {
  const cert = await fetch(`${ABHA}${ABHA_PATHS.publicCertificate}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'REQUEST-ID': randomUUID(),
      TIMESTAMP: new Date().toISOString(),
      'X-CM-ID': CM_ID,
    },
  });
  if (cert.ok) ok('ABHA public certificate fetched — M1 can encrypt Aadhaar and OTPs');
  else bad(`ABHA host refused the certificate: HTTP ${cert.status}`);

  // The third host. Reached with the same session token, and the thing HFR registration needs.
  const states = await fetch(`${HFR}/v1.5/facility/lgd/states`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'REQUEST-ID': randomUUID(),
      TIMESTAMP: new Date().toISOString(),
      'Content-Type': 'application/json',
    },
  });
  if (states.ok) ok('HFR master data reachable — facility registration can run from here');
  else warn(`HFR refused master data: HTTP ${states.status} — M4 registration would fail here`);
}

/** What NHA holds for this bridge, read-only. */
async function bridge(token: string): Promise<string | null> {
  const res = await fetch(`${GATEWAY}${BRIDGE_ADMIN.listBridgeServices}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'REQUEST-ID': randomUUID(),
      TIMESTAMP: new Date().toISOString(),
      'X-CM-ID': CM_ID,
    },
  });
  if (!res.ok) {
    warn(`could not read the bridge record: HTTP ${res.status}`);
    return null;
  }
  const data = (await res.json()) as {
    bridge?: { url?: string; active?: boolean; blocklisted?: boolean };
    services?: unknown[];
  };
  const url = data.bridge?.url ?? null;

  if (data.bridge?.active) ok(`bridge is active at ${url ?? '(no url)'}`);
  else bad(`bridge is NOT active${url ? ` (${url})` : ''} — ABDM will route nothing to us`);

  if (data.bridge?.blocklisted) bad('bridge is BLOCKLISTED at NHA');

  const services = data.services ?? [];
  if (services.length > 0) {
    ok(`${services.length} bridge service(s) registered`);
  } else {
    bad('services: [] — no HIP or HIU service is attached to this bridge');
    note('The routes below can be perfect and ABDM will still call none of them.');
    note('Registering one needs an HFR facility id: npm run abdm:bridge');
  }
  return url;
}

/**
 * Does our deployment answer where ABDM will call?
 *
 * A control probe runs first, against a path that is deliberately not mounted, so a host that
 * answers 200 to everything (a catch-all, a login redirect, a parked page) is caught before its
 * answers are read as sixteen passing routes.
 */
async function inbound(base: string): Promise<void> {
  const probe = async (path: string): Promise<{ status: number; body: string } | null> => {
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      return { status: res.status, body: (await res.text()).slice(0, 120) };
    } catch (err) {
      bad(`${path} — could not be reached: ${(err as Error).message}`);
      return null;
    }
  };

  const control = await probe('/api/v3/__nirogix_control_not_a_route');
  if (!control) {
    note('The host itself is unreachable. Nothing below can be checked.');
    return;
  }
  if (control.status === 404) {
    ok('control probe 404s — this host distinguishes a missing route from a real one');
  } else {
    warn(`control probe answered ${control.status}, not 404`);
    note('Something answers every path here — a catch-all, a proxy or a login page.');
    note('The results below cannot be trusted until that is understood.');
  }

  let missing = 0;
  let unguarded = 0;
  let limited = 0;

  for (const route of INBOUND) {
    const res = await probe(route.path);
    if (!res) {
      missing += 1;
      continue;
    }
    if (res.status === 404) {
      missing += 1;
      bad(`${route.milestone}  ${route.path}  — 404, so ${route.what} never reaches us`);
    } else if (res.status >= 200 && res.status < 300) {
      // The serious one. An unauthenticated caller was accepted, which is a complete path to
      // patient data (ADR-109): plant a consent, then request the records against it.
      unguarded += 1;
      bad(`${route.milestone}  ${route.path}  — HTTP ${res.status} WITHOUT CREDENTIALS`);
    } else if (res.status === 429) {
      limited += 1;
      ok(`${route.milestone}  ${route.path}  — 429 (rate-limited, so the route exists)`);
    } else {
      ok(`${route.milestone}  ${route.path}  — ${res.status}`);
    }
  }

  console.log('');
  if (unguarded > 0) {
    bad(`${unguarded} route(s) accepted an unauthenticated POST — fix before anything else`);
    note(
      'Set ABDM_CALLBACK_AUTH=enforce and redeploy. It is the default; something has overridden it.',
    );
  }
  if (missing > 0) {
    note(`${missing} route(s) are not mounted here. Is the deployed build current?`);
  }
  if (limited > 0) {
    note(`${limited} probe(s) were rate-limited. That still proves the route exists — a request`);
    note(
      'that matched no route is never rate-limited. Re-run in 15 minutes to see their real codes.',
    );
  }
}

async function main(): Promise<void> {
  console.log('\nABDM readiness — deployed environment');
  console.log('-------------------------------------');
  console.log(`  gateway   ${GATEWAY}`);
  console.log(`  abha      ${ABHA}`);
  console.log(`  hfr       ${HFR}`);
  console.log(`  X-CM-ID   ${CM_ID}`);
  console.log(`  client id ${CLIENT_ID ?? '(not set)'}`);
  console.log(`  secret    ${CLIENT_SECRET ? `set, ${CLIENT_SECRET.length} chars` : '(not set)'}`);
  console.log(`  provider  ${notBlank(process.env.ABDM_PROVIDER) ?? 'mock'}`);
  console.log(`  NODE_ENV  ${process.env.NODE_ENV ?? '(unset)'}`);
  console.log('\n  Read-only. No database, no patient, no registration at NHA.');

  const inboundOnly = arg('inbound-only') !== undefined;
  let registeredUrl: string | null = null;

  if (!inboundOnly) {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      step(1, 'Outbound — can this host reach ABDM?');
      bad('ABDM_CLIENT_ID or ABDM_CLIENT_SECRET is not set');
      note('Nothing outbound can be checked. Use --inbound-only to check the callbacks alone.');
    } else {
      step(1, `Outbound — can this host reach ABDM?  (${GATEWAY})`);
      const token = await session();
      if (token) {
        await outbound(token);
        step(2, 'The bridge — what NHA holds for us');
        registeredUrl = await bridge(token);
      }
    }
  }

  const base = (arg('url') || registeredUrl || notBlank(process.env.ABDM_HIU_PUSH_BASE_URL) || '')
    .trim()
    .replace(/\/+$/, '');

  step(inboundOnly ? 1 : 3, 'Inbound — can ABDM reach us?');
  if (!base) {
    bad('no public URL to probe');
    note('Pass one with --url https://api-staging.nirogix.com, or register the bridge URL first.');
  } else {
    console.log(`    probing ${base}`);
    console.log('    No credentials are sent, so a correctly deployed route answers 401.\n');
    await inbound(base);
  }

  // ── verdict ───────────────────────────────────────────────────────────
  console.log(`\n${'-'.repeat(62)}`);
  console.log(`  ${passed} passed, ${failed} failed, ${warned} warning(s)`);
  console.log('');
  console.log('  What this does NOT prove:');
  console.log('   · that encryption works here — that is npm run abdm:fidelius-check,');
  console.log('     which contacts nothing and is also safe on this host');
  console.log('   · that a real ABHA can be created or verified — that needs a real');
  console.log('     Aadhaar and a real OTP, so it belongs to NHA functional testing');
  console.log('   · that a real HIP or PHR app has ever called these routes. A route that');
  console.log('     answers 401 to us answers correctly to ABDM; it has still never been used');
  if (failed > 0) {
    // Said out loud, because npm wraps a non-zero exit in its own "Lifecycle script failed"
    // noise and that reads as a broken script rather than as the finding it is.
    console.log('');
    console.log(
      `  Exiting 1 because ${failed} check(s) failed. That is the finding, not a crash —`,
    );
    console.log(
      '  npm will print its own "Lifecycle script failed" wrapper underneath. To see the',
    );
    console.log('  report without it: npx tsx hms_backend/src/scripts/abdm-staging-check.ts');
  }
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

void main().catch((err: unknown) => {
  console.error(`\n  ! ${(err as Error).message}`);
  process.exit(1);
});
