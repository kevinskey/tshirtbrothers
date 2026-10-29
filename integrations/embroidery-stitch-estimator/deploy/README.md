# DigitalOcean Ubuntu Droplet deployment

The deploy-embroidery-estimator.yml workflow deploys on estimator changes pushed to main, or manually from the Actions tab on main. It reuses the existing production repository secrets DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY and optional DEPLOY_PORT (default 22). No separate embroidery environment or TSB_DROPLET_* secrets are required.

The SSH user must have passwordless sudo, and /var/www/tshirtbrothers must retain its existing GitHub read access. The workflow exports its exact commit into a temporary directory, installs the isolated systemd service, restarts it on updates, and waits up to 60 seconds for its local API. It shares the deploy-production concurrency group with the existing application workflow to serialize deployments.

Service: tsb-stitch-estimator. Installation: /opt/tsb-stitch-estimator. Endpoint: http://127.0.0.1:8765/api/v1/embroidery/estimate. Logs: sudo journalctl -u tsb-stitch-estimator -n 100 --no-pager.

The estimator listens only on loopback and is not yet connected to the Express quote flow. Validate heuristic estimates against digitized DST files before customer pricing.

Rollback: sudo systemctl disable --now tsb-stitch-estimator. Redeploy a corrected main commit to restore service. The installer updates in place; it does not automatically restore earlier code on failure.
