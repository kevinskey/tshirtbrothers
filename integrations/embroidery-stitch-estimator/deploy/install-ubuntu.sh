#!/usr/bin/env bash
set -euo pipefail
# Run from a checkout of the feature branch on Ubuntu/Debian as root.
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
id tsbstitch >/dev/null 2>&1 || useradd --system --home /opt/tsb-stitch-estimator --shell /usr/sbin/nologin tsbstitch
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y python3 python3-venv python3-pip
install -d -o tsbstitch -g tsbstitch /opt/tsb-stitch-estimator
cp "$SOURCE_DIR/app.py" "$SOURCE_DIR/index.html" "$SOURCE_DIR/requirements.txt" /opt/tsb-stitch-estimator/
python3 -m venv /opt/tsb-stitch-estimator/.venv
/opt/tsb-stitch-estimator/.venv/bin/pip install --no-cache-dir -r /opt/tsb-stitch-estimator/requirements.txt
chown -R tsbstitch:tsbstitch /opt/tsb-stitch-estimator
install -m 0644 "$SOURCE_DIR/deploy/tsb-stitch-estimator.service" /etc/systemd/system/tsb-stitch-estimator.service
systemctl daemon-reload
systemctl enable --now tsb-stitch-estimator
systemctl --no-pager status tsb-stitch-estimator
echo 'Local endpoint: http://127.0.0.1:8765/api/v1/embroidery/estimate'
