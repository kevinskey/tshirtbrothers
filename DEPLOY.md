# TShirt Brothers — Deployment Guide

_Last rewritten 2026-08-16. The previous version of this file described the
original droplet at 134.199.194.178, which no longer exists._

## Where production lives

| Thing | Value |
|---|---|
| Droplet | `198.211.113.144` (shared "gleeworld" droplet) |
| App dir | `/var/www/tshirtbrothers` |
| Frontend | nginx serves `client/dist` statically (vhost `/etc/nginx/sites-enabled/tshirtbrothers`) |
| API | pm2 app `tshirtbrothers-api` → `server/index.js` on **:3001**, runs as user `tsb` |
| Database | local PostgreSQL 16, db `tshirtbrothers`, app user `tsbadmin` (env in `server/.env` as `DB_*`, not `DATABASE_URL`) |
| File storage | DigitalOcean Spaces bucket `tshirtbrothers` (region `atl1`); gang-sheet customer files are **private** ACL |
| Analytics | self-hosted Umami (docker `umami`, port 3070) at https://stats.tshirtbrothers.com |
| Stripe webhook | `POST /api/payments/webhook` (raw-body route; quote deposits, invoices, store orders, gang-sheet orders) |

## Routine deploys — just push to main

Every push to `main` auto-deploys via GitHub Actions
(`.github/workflows/deploy.yml`): it SSHes into the droplet and runs
`/var/www/tshirtbrothers/deploy.sh`, which

1. fast-forwards the checkout to `origin/main` (a diverged droplet `main` is
   tagged `droplet-backup-<ts>` and hard-reset — nothing is lost),
2. `npm install` + `npm run build` in `client/` (the build is gated by
   `tsc -b`; on a type error the old `dist/` keeps serving),
3. `npm install` in `server/` (so new server dependencies just work),
4. re-chowns the tree to `tsb` and restarts pm2.

**Do not** also run a manual deploy after pushing — the Action already did it.
GitHub emails on failure only; a "Deploy to droplet failed" email means a
real problem (start with the workflow logs, then `pm2 logs tshirtbrothers-api`).

Secrets used by the workflow (repo → Settings → Secrets → Actions):
`DEPLOY_HOST` = 198.211.113.144, `DEPLOY_USER` = root, `DEPLOY_SSH_KEY` = the
dedicated key whose public half sits in the droplet's
`/root/.ssh/authorized_keys` (comment `github-actions-deploy-tshirtbrothers`).

## Manual deploy (fallback)

If Actions is down or you need to deploy a non-main ref:

```bash
ssh root@198.211.113.144
sudo bash /var/www/tshirtbrothers/deploy.sh        # full deploy (recommended)
# or, quick client-only rebuild + restart (skips server npm install):
bash /var/www/tshirtbrothers/quick-deploy.sh
```

## Database migrations

`server/migrations/*.sql` are applied automatically at API boot by the
runner in `server/index.js` — **as the `tsbadmin` user**. Consequences:

- Write migrations idempotently (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).
- If you ever apply DDL by hand as `postgres`, transfer ownership afterwards
  (`ALTER TABLE x OWNER TO tsbadmin;`) or the boot runner will log
  `permission denied` forever and future ALTERs will fail.

Ad-hoc queries:

```bash
ssh root@198.211.113.144
sudo -u postgres psql tshirtbrothers
# or through the app's own pool:
cd /var/www/tshirtbrothers/server && node --input-type=module -e \
  "import 'dotenv/config'; import pool from './db.js'; /* … */"
```

## Local development notes

- `client/ npm ci` fails on macOS (lockfile lacks the mac rollup binary);
  `npm install --legacy-peer-deps` works and lets you run the real
  `npx tsc -b --force` locally. Don't commit the resulting lockfile churn.
- The droplet is the source of truth for builds; `deploy.sh` self-heals the
  Linux rollup-binary variant of the same npm bug.

## Gotchas that have bitten before

- pm2 restarts must run as **root** (`sudo -u tsb pm2 …` fails).
- `server/.env` holds the Stripe key (`rk_live_…`, per-business key policy),
  Spaces credentials, `DOMAIN`, and `DB_*` — it is not in git; back it up
  before touching it (`cp -n`).
- nginx vhost has exact-match locations `/stats-script.js` and `/api/send`
  proxying to Umami (:3070) that must stay ABOVE the general `/api/` proxy
  to :3001.
- The sale/product pages price from live S&S data via
  `/api/products/pricing/:styleId` (6-hour in-process cache);
  `products.base_price` in the DB is mostly 0 and not trustworthy.
- Boot-log noise that is pre-existing and harmless-ish: expired Google
  Places API key (reviews), `stores.slug` GROUP BY error (sitemap group
  stores enumeration).

## Provisioning a fresh droplet (disaster recovery sketch)

The full original step-by-step lived in this file's git history
(`git log --follow DEPLOY.md`, versions before 2026-08-16). Short form:
Node 20 + PostgreSQL 16 + nginx + pm2 + certbot; clone the repo to
`/var/www/tshirtbrothers`; create db `tshirtbrothers` + user `tsbadmin`;
restore `server/.env` from backup; run `deploy.sh`; recreate the nginx
vhosts (tshirtbrothers + stats.tshirtbrothers.com → :3070) and certbot
certs; `docker run` Umami (postgres `umami` db, `--network host`, port
3070, creds in droplet `/root/umami-credentials.txt`); re-add the GitHub
Actions deploy key. Note `gang_sheets` predates the tracked migrations —
its DDL is not in the repo; recover it from a DB backup.
