Blueprint UI – Deployment Checklist (Production)
Prereqs (one-time)

Web root: /var/www/blueprint

Nginx site: /etc/nginx/sites-available/blueprint.fencify.io → enabled

TLS via Certbot already installed and working

Build source: ~/fencify-python-app (Vite app)

0. (Optional) Update code
   cd ~/fencify-python-app
   git pull

1. Build the frontend

(Use the newer Node you installed with nvm use 22 if needed.)

cd ~/fencify-python-app
npm ci || npm install
npm run build

2. Deploy build to web root
   sudo rsync -a --delete ~/fencify-python-app/dist/ /var/www/blueprint/
   sudo chown -R www-data:www-data /var/www/blueprint
   sudo find /var/www/blueprint -type d -exec chmod 755 {} \;
   sudo find /var/www/blueprint -type f -exec chmod 644 {} \;

3. Reload Nginx (config sanity + reload)
   sudo nginx -t && sudo systemctl reload nginx

4. Quick health checks

# SPA entry

curl -I https://blueprint.fencify.io

# A real asset (replace with one that exists)

ls -1 /var/www/blueprint/assets | head -n1 | xargs -I{} curl -I -H "Accept-Encoding: gzip" https://blueprint.fencify.io/assets/{}

# Optional API proxy (adjust path)

curl -I https://blueprint.fencify.io/api/health

5. Logs (troubleshooting)
   sudo tail -n 100 /var/log/nginx/error.log
   sudo tail -n 100 /var/log/nginx/access.log

6. TLS renewals (sanity)
   systemctl status certbot.timer
   sudo certbot renew --dry-run

One-command deploy helper (optional)

Create /usr/local/bin/deploy-blueprint-ui:

sudo tee /usr/local/bin/deploy-blueprint-ui >/dev/null <<'SH'
#!/usr/bin/env bash
set -euo pipefail
cd /root/fencify-python-app
npm run build
rsync -a --delete dist/ /var/www/blueprint/
chown -R www-data:www-data /var/www/blueprint
nginx -t && systemctl reload nginx
echo "Deployed blueprint UI → https://blueprint.fencify.io"
SH
sudo chmod +x /usr/local/bin/deploy-blueprint-ui

Use it:

sudo /usr/local/bin/deploy-blueprint-ui

Nginx reference (already configured)

Inside server { ... } for blueprint.fencify.io:

root /var/www/blueprint;
index index.html;

# SPA routing

location / { try_files $uri /index.html; }

# Cache static assets

location ~\* \.(?:js|mjs|css|svg|woff2?|ttf|eot|ico|png|jpe?g|gif)$ {
expires 1y;
add_header Cache-Control "public, immutable";
}

# Don’t cache SPA entry

location = /index.html { add_header Cache-Control "no-store"; }

# API proxy (adjust port if needed)

location /api/ {
proxy_pass http://127.0.0.1:3000;
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
}

Global gzip (already added)

In /etc/nginx/nginx.conf → http { ... }:

gzip on; gzip_vary on; gzip_min_length 256; gzip_proxied any;
gzip_comp_level 5;
gzip_types text/plain text/css text/javascript application/javascript application/json application/xml image/svg+xml font/ttf font/otf application/vnd.ms-fontobject application/font-woff application/font-woff2;

Rollback (simple)

Keep a dated backup of the last dist:

sudo rsync -a --delete /var/www/blueprint/ /var/backups/blueprint-$(date +%F-%H%M)/

# To rollback:

sudo rsync -a --delete /var/backups/blueprint-YYYY-MM-DD-HHMM/ /var/www/blueprint/
sudo nginx -t && sudo systemctl reload nginx

That’s everything you need to redeploy in under a minute.
