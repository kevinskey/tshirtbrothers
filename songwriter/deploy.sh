#!/usr/bin/env bash
# Songwriter deploy script — runs on the DigitalOcean droplet.
# Pulls main, rebuilds client, reinstalls server deps, restarts pm2.

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/songwriter}"
PM2_NAME="${PM2_NAME:-songwriter}"

cd "$APP_DIR"

echo "→ Fetching latest"
git fetch origin main
git reset --hard origin/main

echo "→ Installing server deps"
npm --prefix server ci --omit=dev

echo "→ Installing client deps + building"
npm --prefix client ci
npm --prefix client run build

echo "→ Restarting pm2"
if pm2 list | grep -q "$PM2_NAME"; then
  pm2 restart "$PM2_NAME" --update-env
else
  cd "$APP_DIR/server"
  NODE_ENV=production pm2 start index.js --name "$PM2_NAME"
fi

pm2 save
echo "✓ Deployed"
