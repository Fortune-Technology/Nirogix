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
