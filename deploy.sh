#!/usr/bin/env bash
# Deploy latest main to the droplet.
# Usage (on the droplet): sudo bash /var/www/tshirtbrothers/deploy.sh
set -euo pipefail

APP_DIR="/var/www/tshirtbrothers"
PM2_APP="tshirtbrothers-api"

cd "$APP_DIR"

echo "==> Pulling latest from origin/main..."
git fetch origin
git checkout main
git pull --ff-only origin main

echo "==> Installing client deps and building frontend..."
cd "$APP_DIR/client"
npm install
npm run build

echo "==> Installing server deps..."
cd "$APP_DIR/server"
npm install

echo "==> Restarting API..."
pm2 restart "$PM2_APP" --update-env

echo "==> Done."
pm2 status
