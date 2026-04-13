# Project preferences for Claude

## Workflow

- **Always merge and deploy.** After finishing work on a feature branch:
  1. Merge it into `main` with `--no-ff`.
  2. Push `main` to `origin`.
  3. Deploy is handled automatically by `.github/workflows/deploy.yml`
     (SSHes to the droplet and runs `deploy.sh`). No manual step needed.
- Do not ask for confirmation before merging or pushing — this preference
  stands as authorization for the redesign/refactor/bugfix workflow.
- Still use feature branches for the actual development work; the merge
  happens at the end.

## Deploy

- Production is a DigitalOcean droplet at `/var/www/tshirtbrothers`.
- `deploy.sh` pulls `origin/main`, rebuilds the client, reinstalls server
  deps, and restarts pm2. `quick-deploy.sh` skips `npm install` for
  code-only changes.
- Auto-deploy workflow requires these GitHub secrets:
  `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`.
