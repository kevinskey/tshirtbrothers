# DigitalOcean Ubuntu Droplet deployment

This is a **manual** deployment. No DigitalOcean server has been modified by this pull request.

1. SSH into your Droplet and check whether it uses Ubuntu/Debian, which ports are in use, and whether Python 3.10+ is installed.
2. Back up your current application configuration. Do not change your existing Nginx/Node processes.
3. Check out the `feature/embroidery-stitch-estimator` branch on the Droplet in a temporary location.
4. From the repository root run:
   ```bash
   sudo bash integrations/embroidery-stitch-estimator/deploy/install-ubuntu.sh
   ```
5. Verify: `curl -s http://127.0.0.1:8765/openapi.json | head -c 150`
6. Inspect logs: `sudo journalctl -u tsb-stitch-estimator -n 100 --no-pager`.

Service listens on **127.0.0.1:8765 only**. It is not reachable externally and does not yet integrate with the existing Express pricing flow. Do not publish the estimator directly to the internet; add an authenticated server-side proxy and rate limiting before use in customer quotes. Validate against digitized DST stitch counts before using for pricing.

Rollback: `sudo systemctl disable --now tsb-stitch-estimator`; remove the systemd unit and `/opt/tsb-stitch-estimator` only if no longer needed.
