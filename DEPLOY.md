# TShirt Brothers - Deployment Guide

Deploy to DigitalOcean Droplet (134.199.194.178)

## 1. Copy Project to Droplet

```bash
# From your local machine:
rsync -avz --exclude node_modules --exclude dist \
  ./tshirtbrothers/ root@134.199.194.178:/var/www/tshirtbrothers/
```

## 2. SSH Into Droplet

```bash
ssh root@134.199.194.178
```

## 3. Install System Dependencies

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# PostgreSQL 16
apt-get install -y postgresql postgresql-contrib

# Nginx
apt-get install -y nginx

# PM2 (process manager)
npm install -g pm2

# Certbot (SSL)
apt-get install -y certbot python3-certbot-nginx
```

## 4. Set Up PostgreSQL

```bash
# Start PostgreSQL
systemctl start postgresql
systemctl enable postgresql

# Create database and user
sudo -u postgres psql << 'EOF'
CREATE USER tsbadmin WITH PASSWORD 'YOUR_SECURE_PASSWORD_HERE';
CREATE DATABASE tshirtbrothers OWNER tsbadmin;
GRANT ALL PRIVILEGES ON DATABASE tshirtbrothers TO tsbadmin;
\c tshirtbrothers
GRANT ALL ON SCHEMA public TO tsbadmin;
EOF

# Run schema
sudo -u postgres psql -d tshirtbrothers -f /var/www/tshirtbrothers/server/schema.sql

# Create admin user (change password!)
sudo -u postgres psql -d tshirtbrothers << 'EOF'
INSERT INTO users (email, password_hash, role, name)
VALUES ('kevin@tshirtbrothers.com',
  '$2a$10$placeholder', 'admin', 'Kevin');
EOF
```

Note: The password_hash above is a placeholder. After the server is running,
register via the /auth page or use this Node.js snippet to generate a hash:
```bash
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('YOUR_PASSWORD', 10).then(h => console.log(h))"
```
Then update the users table with the real hash.

## 5. Configure Environment

```bash
cd /var/www/tshirtbrothers/server

cp .env.example .env
nano .env
```

Fill in your actual values:
```env
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tshirtbrothers
DB_USER=tsbadmin
DB_PASSWORD=YOUR_SECURE_PASSWORD_HERE
JWT_SECRET=generate-a-random-64-char-string
SS_ACCOUNT_NUMBER=your-ss-account-number
SS_API_KEY=your-ss-api-key
OPENAI_API_KEY=sk-your-openai-key
SPACES_KEY=your-do-spaces-key
SPACES_SECRET=your-do-spaces-secret
SPACES_REGION=nyc3
SPACES_BUCKET=tshirtbrothers
SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
DOMAIN=https://tshirtbrothers.com
```

## 6. Install Dependencies & Build

```bash
# Backend
cd /var/www/tshirtbrothers/server
npm install

# Frontend
cd /var/www/tshirtbrothers/client
npm install
npm run build
```

## 7. Configure Nginx

```bash
nano /etc/nginx/sites-available/tshirtbrothers
```

Paste this config:
```nginx
server {
    listen 80;
    server_name tshirtbrothers.com www.tshirtbrothers.com;

    # Frontend (static files from Vite build)
    root /var/www/tshirtbrothers/client/dist;
    index index.html;

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # SPA fallback - all routes serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

Enable the site:
```bash
ln -s /etc/nginx/sites-available/tshirtbrothers /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default  # remove default site
nginx -t  # test config
systemctl restart nginx
```

## 8. SSL Certificate

```bash
certbot --nginx -d tshirtbrothers.com -d www.tshirtbrothers.com
```

Follow the prompts. Certbot will auto-configure Nginx for HTTPS.

## 9. Start Backend with PM2

```bash
cd /var/www/tshirtbrothers/server
pm2 start index.js --name tshirtbrothers-api
pm2 save
pm2 startup  # auto-start on boot
```

## 10. Update DNS

Point your domain to the droplet IP:
- A record: `tshirtbrothers.com` → `134.199.194.178`
- A record: `www.tshirtbrothers.com` → `134.199.194.178`

## 11. Verify

```bash
# Check API is running
curl http://localhost:3001/api/health

# Check Nginx is serving frontend
curl -I https://tshirtbrothers.com

# Check PM2 status
pm2 status

# View logs
pm2 logs tshirtbrothers-api
```

## Useful Commands

```bash
# Restart API after code changes
pm2 restart tshirtbrothers-api

# Rebuild frontend after changes
cd /var/www/tshirtbrothers/client && npm run build

# View API logs
pm2 logs tshirtbrothers-api --lines 50

# Sync products from S&S Activewear
curl -X POST https://tshirtbrothers.com/api/admin/sync-products \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## File Structure on Server

```
/var/www/tshirtbrothers/
├── server/           # Express API (port 3001)
│   ├── index.js
│   ├── db.js
│   ├── .env
│   ├── routes/
│   ├── services/
│   └── middleware/
├── client/
│   ├── src/          # React source
│   └── dist/         # Built static files (served by Nginx)
└── DEPLOY.md
```
