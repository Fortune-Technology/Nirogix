// PM2 process definitions for the Nirogix staging/production VM (Nginx + PM2, dedicated service
// user — resources/development-plan.md §16/§18). Versioned config so environments are
// reproducible and the later container migration has a documented baseline.
//
// Deploy flow (see deploy/README.md): build all apps, then `pm2 reload deploy/pm2.ecosystem.cjs`
// for zero-downtime restart. Secrets come from each app's `.env`/`.env.local` on the VM (never
// committed) or the service user's environment — NOT from this file.
//
//   pm2 start deploy/pm2.ecosystem.cjs --env production
//   pm2 reload deploy/pm2.ecosystem.cjs           # zero-downtime redeploy
//   pm2 logs nirogix-backend

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
      env: { NODE_ENV: 'production', PORT: '4000' },
      env_staging: { NODE_ENV: 'staging', PORT: '4000' },
    },
    {
      name: 'nirogix-portal',
      cwd: './hms_frontend',
      // `next start` serves the production build on :3001.
      script: 'npm',
      args: 'run start',
      env: { NODE_ENV: 'production' },
      env_staging: { NODE_ENV: 'staging' },
    },
    {
      name: 'nirogix-marketing',
      cwd: './marketing',
      script: 'npm',
      args: 'run start',
      env: { NODE_ENV: 'production' },
      env_staging: { NODE_ENV: 'staging' },
    },
  ],
};
