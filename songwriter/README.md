# Songwriter

AI-assisted lyric writer with Google sign-in and cloud-saved songs.

- **Frontend**: Vite + React + TypeScript + Tailwind
- **Backend**: Node + Express + Passport (Google OAuth) + JWT cookies
- **DB**: PostgreSQL
- **AI**: DeepSeek (OpenAI-compatible) for rhymes, next-line suggestions, rewrites
- **Hosting**: DigitalOcean droplet (reuse existing or fresh), served at `focusotp.com`

## Features

- Section-based lyric editor (verse / pre-chorus / chorus / bridge / intro / outro)
- Live syllable count per line
- AI rhyme finder — perfect, near, and multi-syllable, with optional style/mood context
- AI next-line suggestions — matches your meter and rhyme scheme
- AI line rewriter — 3 alternatives per request
- Google sign-in, songs saved to your account
- Autosave (debounced, 800ms)

## Local development

```bash
# one-time install
npm run install:all

# create your Postgres database
createdb songwriter
psql songwriter -f server/schema.sql

# configure env
cp .env.example server/.env     # fill in GOOGLE_*, DEEPSEEK_API_KEY, secrets

# run both client + server
npm run dev
# → client on http://localhost:5173, server on http://localhost:4000
```

### Google OAuth setup

1. Go to https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Authorized redirect URIs:
   - `http://localhost:4000/api/auth/google/callback` (dev)
   - `https://focusotp.com/api/auth/google/callback` (prod)
4. Copy Client ID + Secret into `server/.env`

## Production deploy (DigitalOcean)

### One-time server setup

On the droplet:

```bash
# Create app directory and DB
sudo mkdir -p /var/www/songwriter
sudo chown $USER:$USER /var/www/songwriter
git clone git@github.com:kevinskey/songwriter.git /var/www/songwriter

sudo -u postgres psql -c "CREATE USER songwriter WITH PASSWORD 'CHANGE_ME';"
sudo -u postgres psql -c "CREATE DATABASE songwriter OWNER songwriter;"
psql -U songwriter -d songwriter -f /var/www/songwriter/server/schema.sql

# Create server/.env with production values
# DATABASE_URL, GOOGLE_CLIENT_ID/SECRET, JWT_SECRET, DEEPSEEK_API_KEY,
# CLIENT_URL=https://focusotp.com, NODE_ENV=production, PORT=4010
```

### Nginx vhost

```nginx
server {
    listen 80;
    server_name focusotp.com www.focusotp.com;
    return 301 https://focusotp.com$request_uri;
}

server {
    listen 443 ssl http2;
    server_name focusotp.com;

    # certbot-managed certs
    ssl_certificate     /etc/letsencrypt/live/focusotp.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/focusotp.com/privkey.pem;

    location / {
        proxy_pass http://localhost:4010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Then: `sudo certbot --nginx -d focusotp.com -d www.focusotp.com`

### Deploy

```bash
# On droplet, first time:
cd /var/www/songwriter
bash deploy.sh

# After that, either SSH + run deploy.sh or wire up a GitHub Action
# (copy the .github/workflows/deploy.yml pattern from tshirtbrothers).
```

## Environment variables

See `.env.example`. Required at minimum:

- `DATABASE_URL` — Postgres connection string
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `JWT_SECRET`, `SESSION_SECRET` — long random strings
- `CLIENT_URL` — where the browser runs (`https://focusotp.com` in prod)
- `DEEPSEEK_API_KEY` — reuse the one from the t-shirt site

## Schema

See `server/schema.sql`. Three tables: `users`, `songs` (with JSONB `sections`), `ai_logs` (for cost tracking).
