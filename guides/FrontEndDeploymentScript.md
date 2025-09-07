## Build from ~/fencify-python-app and publish to /var/www/blueprint.

# Create the deploy helper

sudo tee /usr/local/bin/deploy-blueprint-ui >/dev/null <<'SH'
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/root/fencify-python-app"
WEB_ROOT="/var/www/blueprint"

echo "[1/4] Build UI"
cd "$APP_DIR"

# If you use nvm, uncomment the next line to force Node 22

# . "$HOME/.nvm/nvm.sh" && nvm use 22 >/dev/null

npm ci || npm install
npm run build

echo "[2/4] Sync to web root: $WEB_ROOT"
sudo mkdir -p "$WEB_ROOT"
sudo rsync -a --delete "$APP_DIR/dist/" "$WEB_ROOT/"

echo "[3/4] Fix ownership & perms"
sudo chown -R www-data:www-data "$WEB_ROOT"
sudo find "$WEB_ROOT" -type d -exec chmod 755 {} \;
sudo find "$WEB_ROOT" -type f -exec chmod 644 {} \;

echo "[4/4] Nginx sanity + reload"
sudo nginx -t
sudo systemctl reload nginx

echo "✅ Deployed UI → https://blueprint.fencify.io"
SH
sudo chmod +x /usr/local/bin/deploy-blueprint-ui

## Optional: quick UI rollback

# This snapshots the current /var/www/blueprint before overwrite.

# Make a timestamped backup

sudo rsync -a --delete /var/www/blueprint/ "/var/backups/blueprint-$(date +%F-%H%M)/"

# To rollback later:

# sudo rsync -a --delete "/var/backups/blueprint-YYYY-MM-DD-HHMM/" /var/www/blueprint/

# sudo nginx -t && sudo systemctl reload nginx
