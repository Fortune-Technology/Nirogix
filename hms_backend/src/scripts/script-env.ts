/**
 * Environment defaults for the report-style self-test scripts.
 *
 * A side-effect module rather than lines inside each script, because **import order is the whole
 * point**: imports are evaluated before any statement in the importing file, so anything set in a
 * script body lands after `config/env.ts` has already read and frozen `process.env`. Imported here,
 * ahead of everything that pulls in config, it lands in time.
 *
 * Both values below are presentation and fixture concerns, never behaviour under test.
 */

/** The script's own output IS the report; `--logs` opts the application log back in. */
if (!process.argv.includes('--logs')) process.env.LOG_LEVEL = 'fatal';

/**
 * A push URL for the M3 self-test.
 *
 * `dataPushUrl()` throws when this is unset — correctly, because ABDM accepts a data request naming
 * an unreachable endpoint and then silently delivers nothing (ADR-093). That refusal is real
 * behaviour with its own test; leaving it unset here would make the self-test fail for a
 * configuration reason rather than a behavioural one. A real value in the environment wins.
 */
process.env.ABDM_HIU_PUSH_BASE_URL ||= 'https://api-selftest.example.org';
