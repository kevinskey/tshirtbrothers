#!/usr/bin/env bash
# Deploy latest main to the droplet.
# Usage (on the droplet): sudo bash /var/www/tshirtbrothers/deploy.sh
set -euo pipefail

APP_DIR="/var/www/tshirtbrothers"
PM2_APP="tshirtbrothers-api"
APP_USER="tsb"

cd "$APP_DIR"

echo "==> Pulling latest from origin/main..."
git fetch origin
git checkout main
# npm install on the droplet rewrites lockfiles (different npm/OS), and a
# dirty lockfile aborts the pull the next time the repo's copy changes.
# They're regenerated below anyway — discard local drift before pulling.
git checkout -- package-lock.json client/package-lock.json server/package-lock.json 2>/dev/null || true
if ! git pull --ff-only origin main; then
  # Local main diverged from origin/main (someone committed directly on the
  # droplet). Preserve the divergent HEAD as a tag so nothing is lost, then
  # hard-reset to origin/main so the deploy can proceed.
  ts=$(date +%Y%m%d-%H%M%S)
  echo "==> Local main diverged; tagging current HEAD as droplet-backup-$ts before resetting to origin/main"
  git tag "droplet-backup-$ts" HEAD
  git reset --hard origin/main
fi

echo "==> Installing client deps and building frontend..."
cd "$APP_DIR/client"

# Guard against npm bug #4828: a lockfile generated on macOS (dev)
# doesn't list the Linux rollup native binary as an optional dep, so
# on Linux the build fails deep in vite. Symptoms include a missing
# @rollup/rollup-linux-x64-gnu module OR the dir existing but empty
# (no package.json inside).
#
# We restore package-lock.json from git if it was deleted on the
# droplet, run npm install, then check the actual package.json of
# the Linux rollup binary. If it's missing, do the recommended npm
# recovery: nuke lockfile + node_modules + reinstall.
if [ ! -f package-lock.json ]; then
  echo "==> client/package-lock.json missing; restoring from git"
  git checkout -- package-lock.json || true
fi

npm install

if [ ! -f node_modules/@rollup/rollup-linux-x64-gnu/package.json ]; then
  echo "==> rollup native binary missing or empty; nuking lockfile + node_modules and reinstalling"
  rm -rf node_modules package-lock.json
  npm install
fi

npm run build

echo "==> Installing server deps..."
cd "$APP_DIR/server"
npm install

# Re-chown the tree to the app user. Root pulled the new code from git
# (so freshly-written files are root-owned), but at runtime the API runs
# as $APP_USER via pm2 --uid. Without this, writable paths and any new
# build artifacts would be unowned by the runtime user.
echo "==> Restoring ownership to $APP_USER..."
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> Restarting API..."
if pm2 list | grep -q "$PM2_APP"; then
  pm2 restart "$PM2_APP" --update-env
else
  # First-time start: drop privileges + pin cwd so dotenv finds .env.
  pm2 start "$APP_DIR/server/index.js" \
    --name "$PM2_APP" \
    --uid "$APP_USER" --gid "$APP_USER" \
    --cwd "$APP_DIR/server" \
    --update-env
fi

# npm install above rewrites lockfiles; left dirty they abort the NEXT
# deploy's git pull (the workflow-level one, which runs before this
# script's own pre-pull guard can help). Leave the tree clean.
cd "$APP_DIR"
git checkout -- package-lock.json client/package-lock.json server/package-lock.json 2>/dev/null || true

# Tell IndexNow (Bing/Copilot's index) the site changed, so recrawl happens
# in hours, not weeks. Reads the live sitemap, so it runs after the restart.
echo "==> Pinging IndexNow..."
node "$APP_DIR/client/scripts/indexnow-ping.mjs" || true

echo "==> Done."
pm2 status
