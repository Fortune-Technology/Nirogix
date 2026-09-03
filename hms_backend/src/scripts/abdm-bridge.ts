import 'dotenv/config';
import { randomUUID } from 'node:crypto';

/**
 * ABDM bridge registration — `npm run abdm:bridge` (ADR-091).
 *
 * The two calls that make ABDM able to *reach us*. Every M1 flow is outbound, which is why it works
 * from a laptop with no infrastructure; every M2 flow is the reverse — linking confirmations,
 * discovery, consent notifications and records requests all arrive as webhooks. Until the gateway
 * knows our URL, none of the M2 code can be spoken to, and the symptom is silence rather than an
 * error.
 *
 * Two things make this worth a script rather than a curl in a runbook:
 *
 * 1. **Registering an unreachable URL is the worst outcome.** It succeeds, and then every flow fails
 *    silently for as long as nobody thinks to re-check. So a URL is proved reachable — real DNS,
 *    real TLS, a real answer from `/health` — *before* it is registered, and refused otherwise.
 * 2. **NHA's own instructions contradict the V3 collection.** The onboarding email quotes V1 paths
 *    (`/gateway/v1/bridges`, `/gateway/v1/bridges/addUpdateServices`) and a `HEALTH_LOCKER` example;
 *    the V3 collection supersedes them, and service registration may live on the facility registry
 *    host instead. Rather than pick one and be wrong, each call **tries the candidates in order and
 *    reports which one answered** — the same approach that settled the RSA padding question.
 *
 * **Read-only by default.** Bare `npm run abdm:bridge` reports what NHA currently holds and changes
 * nothing. Writing takes an explicit flag, because it publishes a URL under our name.
 *
 * It never prints the client secret — only its length — so the output is safe to paste into an NHA
 * support ticket, which is exactly what closes their "verify the integration" request.
 *
 *   npm run abdm:bridge                                     (read-only, safe anywhere)
 *   npx tsx src/scripts/abdm-bridge.ts --set-url https://api-staging.nirogix.com
 *   npx tsx src/scripts/abdm-bridge.ts --set-url <url> --register-service --service-id … --name …
 *   npx tsx src/scripts/abdm-bridge.ts --set-url <url> --skip-reachability-check   (parking only)
 *
 * The writes are shown invoked **directly rather than through `npm run`**: PowerShell strips
 * `--flag` tokens passed after `--`, so `npm run abdm:bridge -- --set-url <url>` reaches the
 * script as a bare URL and would otherwise have degraded into another read-only run.
 */

const GATEWAY = process.env.ABDM_GATEWAY_BASE_URL ?? 'https://dev.abdm.gov.in';
/**
 * `facilitysbx.abdm.gov.in` is GONE, and nothing here uses it any more (03/09/2026, ADR-142).
 *
 * The M1 collection put bridge-service registration on that host. The M2 and M3 collections put
 * it on the HFR host below, and `facilitysbx` now fails to connect at all — verified from the
 * staging VM in India **and** from a developer machine in India, so it is retirement rather than
 * a network problem at either end. The constant stays only to explain its own absence: an
 * operator who finds the old host in NHA's onboarding email should not spend an afternoon
 * proving it is dead a second time.
 */
const RETIRED_FACILITY_REGISTRY = 'https://facilitysbx.abdm.gov.in';
/** The HFR/HPR host (M4). A third base URL — neither the ABHA host nor the HIE-CM gateway. */
const FACILITY_SERVICES = process.env.ABDM_HFR_BASE_URL ?? 'https://apihspsbx.abdm.gov.in/v4/int';
const CM_ID = process.env.ABDM_CM_ID ?? 'sbx';

/** Blank means "not configured" and behaves exactly like unset — the rule `config/env.ts` applies. */
const notBlank = (v: string | undefined): string | undefined =>
  v && v.trim() !== '' ? v.trim() : undefined;
const CLIENT_ID = notBlank(process.env.ABDM_CLIENT_ID);
const CLIENT_SECRET = notBlank(process.env.ABDM_CLIENT_SECRET);

const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad = (m: string) => console.log(`  ✗ ${m}`);
const note = (m: string) => console.log(`    ${m}`);

/**
 * `--flag value`, `--flag=value`, `--flag` alone → '', absent → undefined.
 *
 * Both forms are supported because **PowerShell strips `--flag` tokens** passed through
 * `npm run … -- --flag value`: the flag never reaches the script and only its value arrives. That
 * turned a write command into a silent read-only run once, which is the exact failure this script
 * exists to prevent — see `assertFlagsSurvived` below.
 */
function arg(name: string): string | undefined {
  const equals = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (equals) return equals.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : '';
}

/**
 * Refuses to continue when a URL was clearly supplied but its flag was eaten by the shell.
 *
 * Registering a URL under our name at a national registry is not something to infer from an
 * ambiguous argv — so a bare URL is neither ignored nor obeyed. It stops, says what happened, and
 * gives invocations that survive PowerShell. Silently falling through to a read-only run let
 * somebody believe they had registered when they had not.
 */
function assertFlagsSurvived(): void {
  const bareUrl = process.argv.slice(2).find((a) => /^https?:\/\//i.test(a));
  const hasAction = process.argv.slice(2).some((a) => a.startsWith('--'));
  if (!bareUrl || hasAction) return;

  bad(`Received a bare URL (${bareUrl}) with no flag — your shell stripped it.`);
  note(
    'PowerShell drops `--flag` tokens passed through `npm run … -- --flag value`, so the script',
  );
  note('saw only the value. NOTHING was sent to NHA; the bridge is unchanged.');
  note('');
  note('Either of these survives PowerShell:');
  note(`  npx tsx src/scripts/abdm-bridge.ts --set-url ${bareUrl}`);
  note(`  npm run abdm:bridge -- "--set-url=${bareUrl}"`);
  note('');
  process.exit(1);
}

/**
 * One attempt against a candidate path, reported rather than thrown.
 *
 * A 404 is meaningful here — it means "this API version is not the one" — so it is a *result*, not
 * an error, and the caller moves to the next candidate.
 */
type Attempt = { url: string; status: number; body: string; ok: boolean; reached: boolean };

async function call(url: string, method: string, token: string, body?: unknown): Promise<Attempt> {
  const headers: Record<string, string> = {
    accept: '*/*',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'REQUEST-ID': randomUUID(),
    TIMESTAMP: new Date().toISOString(),
    'X-CM-ID': CM_ID,
  };
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { url, status: res.status, body: text, ok: res.ok, reached: true };
  } catch (err) {
    return { url, status: 0, body: (err as Error).message, ok: false, reached: false };
  }
}

/**
 * Walks candidate paths until one answers, and says which.
 *
 * A 404 or 405 means the version is wrong and the next candidate is tried. Any other status — even
 * a failure — means we found the right endpoint and it had something to say, so the walk stops
 * rather than firing the same write at three URLs.
 */
async function firstThatAnswers(
  candidates: Array<{ label: string; url: string }>,
  method: string,
  token: string,
  body?: unknown,
): Promise<Attempt & { label: string }> {
  let last: (Attempt & { label: string }) | undefined;
  for (const candidate of candidates) {
    const result = await call(candidate.url, method, token, body);
    last = { ...result, label: candidate.label };
    if (result.ok) return last;
    if (result.reached && result.status !== 404 && result.status !== 405) return last;
    note(
      `${candidate.label} → ${result.reached ? `HTTP ${result.status}` : result.body}, trying the next`,
    );
  }
  return last!;
}

/**
 * Proves NHA will be able to reach this URL, before we ask them to try.
 *
 * The checks are ordered by how badly each failure would be misread later. A `http://` or a
 * localhost URL registers happily and then never works; a self-signed certificate is refused by
 * NHA with no diagnostic reaching us; a URL with a path silently doubles the path, because the
 * gateway appends its own.
 */
async function verifyReachable(raw: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    bad(`"${raw}" is not a URL.`);
    return false;
  }

  if (url.protocol !== 'https:') {
    bad(
      'NHA requires HTTPS with a valid certificate. A http:// URL registers and then never works.',
    );
    return false;
  }
  if (url.pathname !== '/' || url.search) {
    bad(`Register the BASE URL only — "${url.origin}", with no path.`);
    note(
      'The gateway appends its own paths, which is why our callback routes sit outside /api/v1.',
    );
    return false;
  }
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)) {
    bad('That host is not reachable from the internet, so the gateway could never call it.');
    return false;
  }

  // The real proof: a live request. Node's fetch validates the certificate chain, so an expired or
  // self-signed certificate fails here rather than silently at NHA.
  //
  // Both health paths are tried because the versioned one is what this API actually serves; `/health`
  // is checked second only so a differently-configured deployment still passes. Getting this wrong
  // once meant the probe would have refused a host that was working perfectly.
  const candidates = [`${url.origin}/api/v1/health`, `${url.origin}/health`];
  let lastStatus: number | null = null;

  for (const health of candidates) {
    try {
      const res = await fetch(health, { method: 'GET', signal: AbortSignal.timeout(15_000) });
      if (res.ok) {
        ok(`${health} answers over TLS — DNS, certificate and the API are all live.`);
        return true;
      }
      lastStatus = res.status;
    } catch (err) {
      // A transport failure is conclusive for the whole origin, so it stops here rather than
      // trying the second path against a host that cannot be reached at all.
      const message = (err as Error).message;
      bad(`Could not reach ${url.origin}: ${message}`);
      if (/certificate|SSL|TLS/i.test(message)) {
        note('That is a certificate problem. Issue one with certbot first — deploy/README.md.');
      } else {
        note('Check DNS, the firewall, and that Nginx and PM2 are actually running on the VM.');
      }
      return false;
    }
  }

  // TLS and DNS are fine — something answered — but our API is not the thing answering. Registering
  // anyway would mean the gateway reaches Nginx and gets a 404 for every callback.
  bad(
    `${url.origin} is reachable over TLS, but no health endpoint answered (last status ${lastStatus}).`,
  );
  note('The certificate is fine; the API is not serving on that host. Check PM2 and the Nginx');
  note('server block before registering, or every ABDM callback will 404 into nothing.');
  return false;
}

/** A session token. Identical to the one `abdm:check` proves, so a failure here is a credential problem. */
async function session(): Promise<string> {
  const url = `${GATEWAY}/api/hiecm/gateway/v3/sessions`;
  const res = await fetch(url, {
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
  const text = await res.text();
  if (!res.ok) {
    bad(`session failed: HTTP ${res.status}`);
    note(text.slice(0, 300));
    note('A 401 here is the credential pair, not the code. Run `npm run abdm:check` first.');
    process.exit(1);
  }
  const token = (JSON.parse(text) as { accessToken?: string }).accessToken;
  if (!token) {
    bad('200 OK but no accessToken — the session contract has changed.');
    process.exit(1);
  }
  ok('session issued');
  return token;
}

async function main(): Promise<void> {
  console.log('\nABDM bridge registration');
  console.log('------------------------');
  console.log(`  gateway   ${GATEWAY}`);
  console.log(`  registry  ${FACILITY_SERVICES}   (${RETIRED_FACILITY_REGISTRY} is retired)`);
  console.log(`  X-CM-ID   ${CM_ID}`);
  console.log(`  client id ${CLIENT_ID ?? '(not set)'}`);
  console.log(
    `  secret    ${CLIENT_SECRET ? `set, ${CLIENT_SECRET.length} chars` : '(not set)'}\n`,
  );

  if (!CLIENT_ID || !CLIENT_SECRET) {
    bad('ABDM_CLIENT_ID / ABDM_CLIENT_SECRET are empty or unset.');
    note('Fill them in hms_backend/.env — they come from the bridge NHA created for you.\n');
    process.exit(1);
  }

  assertFlagsSurvived();

  const token = await session();
  const setUrl = arg('set-url');
  const registerService = process.argv.includes('--register-service');

  // --- 1. What NHA currently holds --------------------------------------------------------
  console.log('\n1. Registered services');
  const listed = await firstThatAnswers(
    [
      {
        label: 'V3 /api/hiecm/gateway/v3/bridge-services',
        url: `${GATEWAY}/api/hiecm/gateway/v3/bridge-services`,
      },
      {
        label: 'V1 /gateway/v1/bridges/getServices',
        url: `${GATEWAY}/gateway/v1/bridges/getServices`,
      },
    ],
    'GET',
    token,
  );
  if (listed.ok) {
    ok(`answered by ${listed.label}`);
    console.log(indent(listed.body));
  } else {
    bad(`no candidate answered (last: HTTP ${listed.status})`);
    note(listed.body.slice(0, 300));
    note(
      'Nothing is registered yet, or both API versions have moved. Not fatal — writes below still run.',
    );
  }

  // --- 2. Set the bridge URL --------------------------------------------------------------
  if (setUrl !== undefined) {
    console.log('\n2. Set the bridge URL');
    if (!setUrl) {
      bad('--set-url needs a value, e.g. --set-url https://api-staging.nirogix.com');
      process.exit(1);
    }
    // The escape hatch exists for exactly one legitimate case: restoring an intentionally inert
    // placeholder, which is what NHA themselves set a new bridge to. It is not the failure the
    // check guards against — that is registering a dead URL by ACCIDENT — so it is allowed, named
    // plainly, and shouted about rather than hidden behind a terse flag.
    const skipCheck = process.argv.includes('--skip-reachability-check');
    if (skipCheck) {
      bad('Reachability check SKIPPED at your explicit request.');
      note('If this URL cannot serve ABDM callbacks, every inbound flow will fail in silence.');
      note('Only correct when deliberately parking the bridge on an inert placeholder.');
    }

    console.log(`  checking ${setUrl} before asking NHA to trust it`);
    if (!skipCheck && !(await verifyReachable(setUrl))) {
      console.log('\n  Nothing was registered. Registering an unreachable URL is worse than not');
      console.log('  registering one: it succeeds, and then every M2 flow fails in silence.\n');
      process.exit(1);
    }

    const patched = await firstThatAnswers(
      [
        {
          label: 'V3 PATCH /api/hiecm/gateway/v3/bridge/url',
          url: `${GATEWAY}/api/hiecm/gateway/v3/bridge/url`,
        },
        { label: 'V1 PATCH /gateway/v1/bridges', url: `${GATEWAY}/gateway/v1/bridges` },
      ],
      'PATCH',
      token,
      { url: setUrl },
    );
    if (patched.ok) {
      ok(`registered via ${patched.label}`);
      ok(`ABDM will now call ${setUrl} — the gateway appends its own paths.`);
    } else {
      bad(`registration failed: HTTP ${patched.status} at ${patched.url}`);
      note(patched.body.slice(0, 400));
      process.exit(1);
    }
  }

  // --- 3. Register the HIP service --------------------------------------------------------
  if (registerService) {
    console.log('\n3. Register the HIP service');
    const serviceId = arg('service-id');
    const name = arg('name');
    if (!serviceId || !name) {
      bad('--register-service needs --service-id and --name.');
      note(
        '--service-id is the HFR **facility id**, not a name of our choosing: the facility must',
      );
      note(
        'already be registered in the Health Facility Registry (M4, Part A) for this to succeed.',
      );
      note('It is also what a hospital enters in Hospital configuration → ABDM / ABHA.');
      process.exit(1);
    }
    // The real V4 contract, read from the published HFR spec — NOT the shape NHA's onboarding email
    // shows. The email quotes an ARRAY of `{id, name, type, alias, endpoints}`; the actual endpoint
    // takes an OBJECT of `{facilityId, facilityName, HRP[{bridgeId, hipName, type, active}]}` with
    // no endpoints and no alias. The email's shape would simply have been rejected.
    //
    // `facilityId` is an INPUT here, which carries a dependency worth knowing: the facility must
    // already exist in the Health Facility Registry before a bridge service can be attached to it.
    // That is M4's job, and its HFR-issued id is what belongs in `abdm_facility_config.hipId`.
    //
    // `type: HIP` — the email's `HEALTH_LOCKER` example is a different participant type entirely.
    const payload = {
      facilityId: serviceId,
      facilityName: name,
      HRP: [{ bridgeId: CLIENT_ID, hipName: name, type: 'HIP', active: true }],
    };
    console.log('  sending:');
    console.log(indent(JSON.stringify(payload, null, 2)));

    // One candidate now, not two: the published HFR V4 spec puts this on the facility-registry
    // host, so the old gateway fallback was guesswork that can only produce a confusing error.
    const registered = await firstThatAnswers(
      [
        {
          label: 'HFR V4 /v1/bridges/MutipleHRPAddUpdateServices',
          url: `${FACILITY_SERVICES}/v1/bridges/MutipleHRPAddUpdateServices`,
        },
      ],
      'POST',
      token,
      payload,
    );
    if (registered.ok) {
      ok(`registered via ${registered.label}`);
      ok(`facility id for Hospital configuration → ABDM / ABHA: ${serviceId}`);
    } else {
      bad(`service registration failed: HTTP ${registered.status} at ${registered.url}`);
      note(registered.body.slice(0, 400));
      process.exit(1);
    }
  }

  if (setUrl === undefined && !registerService) {
    console.log('\nRead-only run — nothing was changed at NHA. To register:');
    console.log('  npm run abdm:bridge -- --set-url https://api-staging.nirogix.com');
    console.log('  npm run abdm:bridge -- --set-url https://api-staging.nirogix.com \\');
    console.log('      --register-service --service-id IN0710-XXXX --name "Nirogix HIP"');
  } else {
    console.log('\nDone. Re-run without flags to see what NHA now holds.');
    console.log(
      'Then set ABDM_PROVIDER=gateway on the VM and watch for the first inbound callback.',
    );
  }
  console.log('');
}

/** Pretty-prints a response body, JSON where it is JSON, so the output is readable in a ticket. */
function indent(body: string): string {
  let text = body;
  try {
    text = JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    /* not JSON — print as-is */
  }
  return text
    .split('\n')
    .slice(0, 40)
    .map((line) => `      ${line}`)
    .join('\n');
}

main().catch((err: unknown) => {
  bad(`unexpected failure: ${(err as Error).message}`);
  process.exit(1);
});
