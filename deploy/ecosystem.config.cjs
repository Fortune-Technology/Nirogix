// PM2 process definitions for the Nirogix staging/production VM (Nginx + PM2, dedicated service
// user — resources/development-plan.md §16/§18). Versioned config so environments are
// reproducible and the later container migration has a documented baseline.
//
// ── THE FILENAME MATTERS — do not rename ─────────────────────────────────────
// PM2 only parses the `apps` array from files matching its ecosystem pattern
// (`*.config.{js,cjs,mjs}`, or `.json`/`.yml`). This file was once `pm2.ecosystem.cjs`, which does
// NOT match — so `pm2 start`/`pm2 reload` silently ran it as a single plain Node script (ONE inert
// process, not the six real apps). Keep the `ecosystem.config.cjs` name (2026-08-18 OOM/deploy
// incident — see deploy/README.md § Incidents).
//
// ── PORTS ON A SHARED VM ─────────────────────────────────────────────────────
// The staging VM hosts OTHER projects (see deploy/README.md → "Shared VM: audit
// ports first"). Every port below is therefore a VARIABLE with a default, set in
// ONE place — the service user's environment (e.g. /home/<user>/.nirogix-ports.env,
// sourced by the shell, or PM2's --update-env) — and NOWHERE else. Application
// code never hard-codes a port (`next start` reads PORT; the API reads PORT).
//
//   Run the audit in deploy/README.md, pick free ports, export them, THEN:
//   pm2 start deploy/ecosystem.config.cjs --env staging
//   pm2 reload deploy/ecosystem.config.cjs --update-env   # zero-downtime redeploy
//   pm2 logs nirogix-backend
//
// Secrets come from each app's `.env`/`.env.local` on the VM (never committed) or
// the service user's environment — NOT from this file. App names are prefixed
// `nirogix-` so `pm2 ls` never collides with the other projects' process names.

// One place to resolve every port. Defaults match resources/domains.md's local
// matrix; on a shared VM export overrides BEFORE pm2 start (audit first!).
const PORTS = {
  api: process.env.NIROGIX_PORT_API ?? '4000',
  marketing: process.env.NIROGIX_PORT_MARKETING ?? '3000',
  portal: process.env.NIROGIX_PORT_PORTAL ?? '3001',
  patient: process.env.NIROGIX_PORT_PATIENT ?? '3002',
  admin: process.env.NIROGIX_PORT_ADMIN ?? '3003',
  aiportal: process.env.NIROGIX_PORT_AIPORTAL ?? '3004',
};

// `next start` (no -p flag anywhere) binds to PORT — the only port source is here.
const next = (name, cwd, port) => ({
  name,
  cwd,
  script: 'npm',
  args: 'run start',
  instances: 1,
  exec_mode: 'fork',
  max_memory_restart: '512M',
  env: { NODE_ENV: 'production', PORT: port },
  env_staging: { NODE_ENV: 'staging', PORT: port },
});

module.exports = {
  apps: [
    {
      name: 'nirogix-backend',
      cwd: './hms_backend',
      // Built output from `npm run build` (tsc → dist/). Runs the compiled server.
      script: 'dist/server.js',
      instances: 1, // modular monolith; scale via cluster/containers later, not now
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production', PORT: PORTS.api },
      env_staging: { NODE_ENV: 'staging', PORT: PORTS.api },
    },
    next('nirogix-portal', './hms_frontend', PORTS.portal),
    next('nirogix-marketing', './marketing', PORTS.marketing),
    // admin-staging is live (Nginx block + DNS resolve), so the console MUST be
    // ecosystem-managed: a hand-started `next start` outside this file is invisible to
    // the deploy's `pm2 reload --only …`, keeps serving a stale build after the files
    // under it are replaced, and every route dies with ChunkLoadError (2026-08-19
    // incident — deploy/README.md). If PM2 shows a hand-run admin process, delete it
    // before starting this entry, or the port is taken (EADDRINUSE crash-loop).
    next('nirogix-admin', './admin', PORTS.admin),
    // Live since BACKLOG F-5 (28/08/2026), landed in one change with their Nginx server blocks
    // and the `certbot --expand` covering patient-staging + ai-staging. Same rule the admin
    // entry above was written for: a surface goes live only WITH its ecosystem entry — never
    // hand-started beside it, or the next deploy replaces the files under a process this file
    // does not name and every route dies with ChunkLoadError (2026-08-19 incident).
    next('nirogix-patient', './patient', PORTS.patient),
    next('nirogix-aiportal', './aiportal', PORTS.aiportal),
  ],
};
