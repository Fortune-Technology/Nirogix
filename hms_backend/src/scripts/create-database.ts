import 'dotenv/config';
import { Client } from 'pg';

// Creates the target database named in DATABASE_URL if it does not already exist, by connecting
// to the server's default `postgres` database. Handy for first-time local setup. Idempotent.
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // eslint-disable-next-line no-console
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const parsed = new URL(url);
  const target = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!target) {
    // eslint-disable-next-line no-console
    console.error('DATABASE_URL has no database name.');
    process.exit(1);
  }

  // Connect to the always-present `postgres` maintenance DB to run CREATE DATABASE.
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [target]);
  if (rowCount === 0) {
    try {
      await client.query(`CREATE DATABASE "${target}"`);
      // eslint-disable-next-line no-console
      console.log(`Created database "${target}".`);
    } catch (err) {
      // 42P04 = duplicate_database — created concurrently; treat as success.
      if ((err as { code?: string }).code === '42P04') {
        // eslint-disable-next-line no-console
        console.log(`Database "${target}" already exists.`);
      } else {
        throw err;
      }
    }
  } else {
    // eslint-disable-next-line no-console
    console.log(`Database "${target}" already exists.`);
  }
  await client.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('create-database failed:', (err as Error).message);
  process.exit(1);
});
