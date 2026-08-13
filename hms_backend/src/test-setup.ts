// Loads hms_backend/.env so integration tests (e.g. tenant-isolation) can read DATABASE_URL
// when run locally via `npm run test`. In CI, env vars are provided directly by the workflow.
import { config } from 'dotenv';

config();
