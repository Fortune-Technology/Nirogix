import 'dotenv/config';
import { randomUUID } from 'node:crypto';

/**
 * ABDM connectivity check — `npm run abdm:check` (ADR-084).
 *
 * Proves, against the real gateway, that the credentials work and that the two hosts we depend on
 * answer: a session token from the gateway host, and the RSA public certificate from the ABHA host.
 * Those two calls are the foundation of every M1 flow — nothing else can work until they do, and
 * everything else fails with a confusing downstream error when they silently do not.
 *
 * It exists because NHA asks a new bridge to "verify the integration and revert within a day", and
 * a screenshot of a working session call is the evidence that closes that ticket. It is also the
 * fastest way to tell a credential problem apart from a code problem later.
 *
 * **It never prints a secret.** The client secret is read from the environment and shown only as a
 * length, and the access token only as a fingerprint — so the output can be pasted into a support
 * ticket or a chat without leaking anything.
 *
 * Read-only: it requests a token and reads a certificate. It registers nothing, changes nothing at
 * NHA, and creates no ABHA. Bridge registration (`PATCH /gateway/v1/bridges`) and service
 * registration are deliberately NOT automated here — they publish a URL under our name and are a
 * decision, not a health check.
 */

const GATEWAY = process.env.ABDM_GATEWAY_BASE_URL ?? 'https://dev.abdm.gov.in';
const ABHA = process.env.ABDM_ABHA_BASE_URL ?? 'https://abhasbx.abdm.gov.in/abha/api';
const CM_ID = process.env.ABDM_CM_ID ?? 'sbx';
/**
 * Blank means "not configured" and behaves exactly like unset — the same rule `config/env.ts`
 * applies, and the reason `.env.example` ships every key live with an empty value. Reading these
 * with `??` would treat an empty string as configured and produce a 401 from NHA instead of a
 * clear "you have not filled this in".
 */
const notBlank = (v: string | undefined): string | undefined => (v && v.trim() !== '' ? v.trim() : undefined);

const CLIENT_ID = notBlank(process.env.ABDM_CLIENT_ID);
const CLIENT_SECRET = notBlank(process.env.ABDM_CLIENT_SECRET);

const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad = (m: string) => console.log(`  ✗ ${m}`);
const note = (m: string) => console.log(`    ${m}`);

/**
 * Says what a failure actually was, rather than guessing at credentials.
 *
 * This exists because the previous version printed "a 401 here is almost always the credential
 * pair" underneath a **403**, and sent somebody looking for a bad secret when the real answer was
 * that a CDN in front of NHA had blocked the host outright. A diagnostic that names the wrong cause
 * is worse than none: it spends someone's afternoon.
 *
 * The distinction is easy to make and worth making. An application rejection is JSON from ABDM. An
 * edge block is HTML from a CDN, arrives with `server: CloudFront` or similar, and answers the same
 * way to an unauthenticated request to the bare domain — which is the one-line test printed below.
 */
export function explainFailure(res: Response, body: string): void {
  const server = res.headers.get('server') ?? '';
  const viaCdn = /cloudfront|akamai|cloudflare|fastly/i.test(`${server} ${res.headers.get('via') ?? ''}`);
  const looksLikeHtml = /^\s*<(!doctype|html)/i.test(body) || /request blocked|could not be satisfied/i.test(body);

  if (res.status === 403 && (viaCdn || looksLikeHtml)) {
    console.log('');
    bad('This is a NETWORK-level block, not a credential problem.');
    note(`The response is HTML from a CDN${server ? ` (server: ${server})` : ''}, so it never reached ABDM.`);
    note('NHA’s sandbox is known to refuse foreign and hosting-provider IP ranges; a host outside');
    note('India will be blocked before any request of ours is evaluated.');
    note('');
    note('Confirm in one line — this needs no credentials and should also return 403:');
    note(`  curl -sS -o /dev/null -w '%{http_code}\n' ${GATEWAY}`);
    note('');
    note('If it does, no change to .env, code or credentials will help. The host has to reach ABDM.');
    console.log('');
    return;
  }

  console.log('');
  // NHA answers bad credentials with **400**, not 401 — observed, not assumed. Matching on the
  // status alone would drop the most common real failure into the "unexpected" branch, which is
  // how the previous version of this diagnostic managed to be unhelpful twice over.
  if (res.status === 401 || /invalid user credentials|invalid client/i.test(body)) {
    note('This is the credential pair, not the code.');
    note('Check ABDM_CLIENT_ID / ABDM_CLIENT_SECRET against the bridge NHA created for you.');
    note('They come from NHA’s bridge-creation email, not from the sandbox portal login.');
  } else if (res.status === 403) {
    note('A 403 that is genuine JSON usually means the client lacks a role for this call.');
    note('`npm run abdm:bridge` prints the roles the session token actually carries.');
  } else if (res.status >= 500) {
    note('A 5xx is NHA’s side. Worth retrying before investigating anything here.');
  } else {
    note('Unexpected. The body above is what NHA returned.');
  }
  console.log('');
}

/** A short, non-reversible fingerprint — enough to tell two tokens apart, useless to anyone else. */
function fingerprint(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)} (${value.length} chars)`;
}

async function main(): Promise<void> {
  console.log('\nABDM connectivity check');
  console.log('-----------------------');
  console.log(`  gateway   ${GATEWAY}`);
  console.log(`  abha      ${ABHA}`);
  console.log(`  X-CM-ID   ${CM_ID}`);
  console.log(`  client id ${CLIENT_ID ?? '(not set)'}`);
  console.log(`  secret    ${CLIENT_SECRET ? `set, ${CLIENT_SECRET.length} chars` : '(not set)'}`);
  console.log(`  provider  ${process.env.ABDM_PROVIDER ?? 'mock'}\n`);

  if (!CLIENT_ID || !CLIENT_SECRET) {
    bad('ABDM_CLIENT_ID / ABDM_CLIENT_SECRET are empty or unset — nothing to check.');
    console.log('    Fill them in hms_backend/.env (gitignored; the keys are already there, blank).');
    console.log('    They come from the bridge NHA created for you, not from the portal login.\n');
    process.exit(1);
  }

  // --- 1. Session token -------------------------------------------------------------------
  const sessionUrl = `${GATEWAY}/api/hiecm/gateway/v3/sessions`;
  console.log(`1. POST ${sessionUrl}`);
  let accessToken = '';
  try {
    const res = await fetch(sessionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'REQUEST-ID': randomUUID(),
        TIMESTAMP: new Date().toISOString(),
        'X-CM-ID': CM_ID,
      },
      body: JSON.stringify({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, grantType: 'client_credentials' }),
    });
    const text = await res.text();
    if (!res.ok) {
      bad(`HTTP ${res.status}`);
      // The body can echo the request back, so it is printed truncated and never parsed for secrets.
      console.log(`    ${text.slice(0, 300)}`);
      explainFailure(res, text);
      process.exit(1);
    }
    const data = JSON.parse(text) as { accessToken?: string; expiresIn?: number; tokenType?: string };
    if (!data.accessToken) {
      bad('200 OK but no accessToken in the response — the contract has changed.');
      process.exit(1);
    }
    accessToken = data.accessToken;
    ok(`session issued: ${fingerprint(accessToken)}`);
    ok(`expires in ${data.expiresIn ?? 'unknown'}s, type ${data.tokenType ?? 'unspecified'}`);
  } catch (err) {
    bad(`could not reach the gateway: ${(err as Error).message}`);
    process.exit(1);
  }

  // --- 2. Public certificate --------------------------------------------------------------
  const certUrl = `${ABHA}/v3/profile/public/certificate`;
  console.log(`\n2. GET ${certUrl}`);
  try {
    const res = await fetch(certUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'REQUEST-ID': randomUUID(),
        TIMESTAMP: new Date().toISOString(),
        'X-CM-ID': CM_ID,
      },
    });
    const text = await res.text();
    if (!res.ok) {
      bad(`HTTP ${res.status}`);
      console.log(`    ${text.slice(0, 300)}`);
      console.log('\n    The session works but the ABHA host refused — check ABDM_ABHA_BASE_URL.\n');
      process.exit(1);
    }
    const key = (JSON.parse(text) as Record<string, string>).publicKey ?? text;
    ok(`public certificate received (${key.length} chars)`);
    ok('Aadhaar numbers and OTPs can be encrypted — the M1 flows have what they need.');
  } catch (err) {
    bad(`could not reach the ABHA host: ${(err as Error).message}`);
    process.exit(1);
  }

  // --- 3. Optional enrolment probe --------------------------------------------------------
  //
  // `--probe` sends the first enrolment call under three RSA paddings, with a checksum-valid but
  // UNASSIGNED Aadhaar, and prints NHA's raw response to each. It exists because the failure mode
  // of a wrong padding is indistinguishable from a bad Aadhaar (`400 Invalid LoginId`) — this is
  // the experiment that told the two apart, and it is worth keeping for the next time the
  // counterparty changes something.
  //
  // No OTP is sent (the number belongs to nobody) and no personal data is involved.
  if (process.argv.includes('--probe')) {
    await probeEnrolment(accessToken);
  }

  // Advice, only when it is actually advice. Telling someone to "set ABDM_PROVIDER=gateway" when
  // they already have reads as though the check found a problem — the same class of misdirection
  // as the old "a 401 is almost always the credential pair" line printed under a CDN block.
  const provider = notBlank(process.env.ABDM_PROVIDER) ?? 'mock';
  console.log(
    provider === 'gateway'
      ? '\nBoth calls succeeded, and ABDM_PROVIDER is already gateway — the real flows will run.'
      : `\nBoth calls succeeded. ABDM_PROVIDER is '${provider}'; set it to gateway to run the real flows.`,
  );
  console.log('Still separate from this check: registering the bridge URL and the HIP service,');
  console.log('which need a public HTTPS endpoint with a valid certificate.\n');
}

/**
 * Verhoeff checksum — the algorithm UIDAI uses for the 12th digit of an Aadhaar.
 *
 * Needed so the probe can send a **structurally valid** number that does not belong to anybody.
 * That distinction is the whole experiment: if NHA can read our ciphertext, a valid-format unknown
 * Aadhaar produces a different error than a malformed one. If both say "invalid", they are not
 * reading it at all, and the problem is our encryption rather than the value.
 */
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const VERHOEFF_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/** Appends the check digit to an 11-digit stem, yielding a Verhoeff-valid 12-digit number. */
function withVerhoeffCheckDigit(stem: string): string {
  let c = 0;
  const reversed = stem.split('').reverse().map(Number);
  reversed.forEach((digit, i) => {
    c = VERHOEFF_D[c]![VERHOEFF_P[(i + 1) % 8]![digit]!]!;
  });
  return stem + String(VERHOEFF_INV[c]!);
}

async function probeEnrolment(accessToken: string): Promise<void> {
  const { constants, publicEncrypt } = await import('node:crypto');
  const { getPublicKey } = await import('../modules/abdm/abdm.crypto');
  const { AbdmGatewayProvider } = await import('../modules/abdm/providers/gatewayProvider');

  console.log('\n3. Encryption probe — which padding can NHA actually read?');

  const pem = await getPublicKey(new AbdmGatewayProvider());
  ok(`certificate normalised to PEM (${pem.trim().split('\n').length} lines)`);

  // Structurally valid, belongs to nobody. If NHA decrypts our ciphertext they will say something
  // about the ACCOUNT; if they cannot, they will say the value itself is invalid.
  const aadhaar = withVerhoeffCheckDigit('99999999999');
  console.log(`    probing with a checksum-valid, unassigned test Aadhaar (ends ${aadhaar.slice(-4)})`);

  const paddings = [
    { name: 'RSA/ECB/PKCS1Padding', options: { key: pem, padding: constants.RSA_PKCS1_PADDING } },
    {
      name: 'RSA/ECB/OAEPWithSHA-1AndMGF1Padding (what we send)',
      options: { key: pem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' as const },
    },
    {
      name: 'RSA/ECB/OAEPWithSHA-256AndMGF1Padding',
      options: { key: pem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' as const },
    },
  ];

  for (const { name, options } of paddings) {
    let encrypted: string;
    try {
      encrypted = publicEncrypt(options, Buffer.from(aadhaar, 'utf8')).toString('base64');
    } catch (err) {
      bad(`${name}: could not encrypt — ${(err as Error).message}`);
      continue;
    }
    const res = await fetch(`${ABHA}/v3/enrollment/request/otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'REQUEST-ID': randomUUID(),
        TIMESTAMP: new Date().toISOString(),
        'X-CM-ID': CM_ID,
      },
      body: JSON.stringify({
        txnId: '',
        scope: ['abha-enrol'],
        loginHint: 'aadhaar',
        loginId: encrypted,
        otpSystem: 'aadhaar',
      }),
    });
    const body = (await res.text()).slice(0, 300);
    console.log(`
    ${name}`);
    console.log(`      HTTP ${res.status}  ${body}`);
  }

  console.log('\n    A DIFFERENT message from one padding is the answer: that is the one NHA can read.');
}

/**
 * Run only when invoked as a script, never on import.
 *
 * `explainFailure` is imported by its tests, and an unguarded `main()` would fire a real network
 * call — and then `process.exit(1)` — the moment the module loaded. A diagnostic helper should be
 * testable without the CLI around it.
 */
if (process.argv[1] && /abdm-check\.(ts|js)$/.test(process.argv[1])) {
  void main();
}
