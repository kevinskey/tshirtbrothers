#!/usr/bin/env bash
# Fast deploy: pull, rebuild frontend, restart API.
# Skips npm install — use deploy.sh if package.json changed.
# Usage (on the droplet): sudo bash /var/www/tshirtbrothers/quick-deploy.sh
#
# MUST run as root, like deploy.sh. The pm2 daemon that owns the API runs as
# root (the API process itself runs as $APP_USER via pm2 --uid), and tsb has
# no sudo rights — so `sudo -u tsb bash quick-deploy.sh`, which is how this
# was invoked for a long time, reached an empty tsb-owned pm2 daemon:
#
#     [PM2][ERROR] Process or Namespace tshirtbrothers-api not found
#
# The frontend deployed, the restart silently did not, and server-side
# changes went live only when something else happened to restart pm2. The
# root check below fails before the build rather than after it, and the
# restart is verified rather than assumed.
set -euo pipefail

APP_DIR="/var/www/tshirtbrothers"
PM2_APP="tshirtbrothers-api"
APP_USER="tsb"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: quick-deploy.sh must run as root (the pm2 daemon owning $PM2_APP is root's)." >&2
  echo "       Run:  sudo bash $APP_DIR/quick-deploy.sh" >&2
  exit 1
fi

cd "$APP_DIR"

# Git and the build run as the app user so build artifacts stay $APP_USER-
# owned. Root-owned files under client/dist are what made the prerender step
# fail with EACCES on routes left behind by an earlier root-run build.
echo "==> Pulling latest from origin/main..."
sudo -u "$APP_USER" git fetch origin
sudo -u "$APP_USER" git checkout main
sudo -u "$APP_USER" git pull --ff-only origin main

echo "==> Rebuilding frontend..."
sudo -u "$APP_USER" bash -c "cd '$APP_DIR/client' && npm run build"

# Any file the build could not replace (left root-owned by a previous run as
# root) would break the NEXT build too. Cheap to correct every time.
chown -R "$APP_USER:$APP_USER" "$APP_DIR/client/dist" 2>/dev/null || true

echo "==> Restarting API..."
if ! pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  echo "ERROR: pm2 has no process named $PM2_APP." >&2
  echo "       Not starting one here — quick-deploy only restarts. Use deploy.sh." >&2
  exit 1
fi
pm2 restart "$PM2_APP" --update-env

# Trust nothing: confirm the process actually came back up. A restart that
# crashes on boot (a bad import, a missing env var) leaves pm2 reporting
# 'errored' or flapping, and the old silent-failure mode taught us not to
# assume this step worked.
sleep 3
status=$(pm2 jlist | PM2_APP="$PM2_APP" node -e "
  let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{
    const p = JSON.parse(s).find(p => p.name === process.env.PM2_APP);
    console.log(p ? p.pm2_env.status : 'missing');
  });
")
if [ "$status" != "online" ]; then
  echo "ERROR: $PM2_APP is '$status' after restart — the API is NOT serving the new code." >&2
  echo "       Check: pm2 logs $PM2_APP --lines 50" >&2
  exit 1
fi
echo "    $PM2_APP is online."

# Tell IndexNow (Bing/Copilot's index) the site changed — see deploy.sh.
echo "==> Pinging IndexNow..."
sudo -u "$APP_USER" node "$APP_DIR/client/scripts/indexnow-ping.mjs" || true

echo "==> Done."
pm2 status
