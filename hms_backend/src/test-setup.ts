// Loads hms_backend/.env so integration tests (e.g. tenant-isolation) can read DATABASE_URL
// when run locally via `npm run test`. In CI, env vars are provided directly by the workflow.
import { config } from 'dotenv';

config();

/**
 * Never let the suite reach a real communications provider.
 *
 * Provider selection is by configuration — `MSG91_API_KEY` present means MSG91, absent means the
 * dev log provider (`modules/notification/providers/index.ts`). A developer who has put a real
 * authkey in `.env` would otherwise have `npm run test` send live email/SMS and spend real
 * credits, and would see notification assertions fail on their machine while CI (which has no
 * key) stays green. Tests must be hermetic and give the same answer everywhere, so the key is
 * cleared here — after dotenv, before `config/env.ts` is first imported and validated.
 *
 * It is set to an empty string rather than deleted: `config/env.ts` runs dotenv again on import,
 * and dotenv does not overwrite a variable that already exists — deleting it would simply let
 * the real key reappear. Empty is falsy, so provider selection picks the log provider.
 *
 * This only affects this process; the developer's .env file is untouched.
 */
process.env.MSG91_API_KEY = '';

/**
 * Never let the suite reach ABDM either, and always exercise encryption.
 *
 * Same reasoning as the MSG91 key above, with one addition specific to ABDM: a developer with
 * real sandbox credentials in `.env` would otherwise burn the sandbox's small daily OTP
 * allowance on every `npm run test`, and the suite would pass or fail depending on how many OTPs
 * that number had left today. The mock provider makes the flows deterministic.
 *
 * `ENCRYPTION_KEY` is set to a fixed test key so the encrypt-at-rest path is genuinely executed
 * rather than skipped as unconfigured — a token that is silently dropped in tests would hide the
 * bug where it is silently dropped in production. This value is a test fixture and must never
 * appear in any deployed environment.
 */
process.env.ABDM_PROVIDER = 'mock';
process.env.ABDM_CLIENT_ID = '';
process.env.ABDM_CLIENT_SECRET = '';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
}

/**
 * A push URL, so the M3 receive path is exercised rather than refused.
 *
 * `dataPushUrl()` throws when this is unset — deliberately, because ABDM accepts a data request
 * naming an unreachable endpoint and then delivers nothing (ADR-093). That refusal is correct
 * behaviour and is asserted in its own test; leaving it unset here would instead make every other
 * M3 test fail for a configuration reason rather than a behavioural one.
 */
process.env.ABDM_HIU_PUSH_BASE_URL = 'https://api-test.example.org';
