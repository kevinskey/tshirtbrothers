# Group Stores — wildcard subdomains

Every group store can be reached at `<subdomain>.tshirtbrothers.com`
(e.g. `sandycreekpto.tshirtbrothers.com`). This is done with **one**
wildcard DNS record + **one** wildcard TLS cert on the droplet.
After that, adding a new store is zero DNS steps — you just set the
`subdomain` field in the TSB admin.

## One-time setup (do this once, on the droplet)

### 1. DNS

Add a wildcard A record at your DNS provider:

```
*.tshirtbrothers.com   A   198.211.113.144
```

Verify from a laptop:

```
$ dig +short foo.tshirtbrothers.com
198.211.113.144
```

### 2. Wildcard TLS via Let's Encrypt (DNS-01)

Wildcard certs require the DNS-01 challenge. If DNS is on Cloudflare:

```bash
sudo apt-get install python3-certbot-dns-cloudflare

# Create /etc/letsencrypt/cloudflare.ini with a scoped API token:
#   dns_cloudflare_api_token = ...
sudo chmod 600 /etc/letsencrypt/cloudflare.ini

sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  -d tshirtbrothers.com -d '*.tshirtbrothers.com' \
  --agree-tos -m kevin@tshirtbrothers.com --no-eff-email
```

Auto-renewal: the cron/systemd timer certbot installs handles it.

For DigitalOcean DNS use `python3-certbot-dns-digitalocean` and the
same shape.

### 3. Nginx server block

Point the wildcard cert at a `server` block that matches both the
apex and any subdomain:

```
server {
    listen 443 ssl http2;
    server_name tshirtbrothers.com *.tshirtbrothers.com;

    ssl_certificate     /etc/letsencrypt/live/tshirtbrothers.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tshirtbrothers.com/privkey.pem;

    root /var/www/tshirtbrothers/client/dist;
    index index.html;

    # API → Node
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SPA fallback — same bundle for every host. The client inspects
    # window.location.hostname and, if it's a store subdomain, mounts
    # the storefront routes at "/".
    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 80;
    server_name tshirtbrothers.com *.tshirtbrothers.com;
    return 301 https://$host$request_uri;
}
```

Reload nginx: `sudo nginx -t && sudo systemctl reload nginx`.

## How it works end-to-end

1. Browser hits `sandycreekpto.tshirtbrothers.com`.
2. Wildcard DNS resolves to the droplet.
3. Wildcard TLS cert covers `*.tshirtbrothers.com`, so no cert error.
4. Nginx serves the same SPA bundle it serves for the main site.
5. `getStoreSubdomain()` in the SPA sees the hostname, extracts
   `sandycreekpto`, and mounts `<SubdomainApp>` — routes are `/`,
   `/product/:slug`, `/admin`, `/success`.
6. Storefront `fetch('/api/store-shop/sandycreekpto')` hits the API,
   which matches either `stores.slug` OR `stores.subdomain` (case-
   insensitive), and returns the store.
7. Reserved labels (`www`, `admin`, `api`, `staging`, `blog`, …) are
   never treated as store handles by the SPA.

## Adding a new store

1. Create the store in TSB admin at `/admin/group-stores`.
2. Set the `Subdomain` field to something short (e.g. `sandycreekpto`).
3. Save. That's it — the store is immediately live at
   `sandycreekpto.tshirtbrothers.com`.

## Custom domains (later)

For an org that wants `sandycreekpto.com`:
- They point a CNAME at `stores.tshirtbrothers.com`.
- On the droplet: `sudo certbot --nginx -d sandycreekpto.com`.
- Store row gets `brand_json.custom_domain = 'sandycreekpto.com'`.
- Extend `getStoreSubdomain()` to also match custom domains
  (server-side, via the `/api/store-shop-by-host?host=…` endpoint).

That's a follow-up; wildcard subdomains cover the pilot.
