#!/usr/bin/env bash
# Fast deploy: pull, rebuild frontend, restart API.
# Skips npm install — use deploy.sh if package.json changed.
# Usage (on the droplet): bash /var/www/tshirtbrothers/quick-deploy.sh
set -euo pipefail

APP_DIR="/var/www/tshirtbrothers"
PM2_APP="tshirtbrothers-api"

cd "$APP_DIR"

echo "==> Pulling latest from origin/main..."
git fetch origin
git checkout main
git pull --ff-only origin main

echo "==> Rebuilding frontend..."
cd "$APP_DIR/client"
npm run build

echo "==> Restarting API..."
pm2 restart "$PM2_APP" --update-env

echo "==> Done."
pm2 status
