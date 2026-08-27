#!/usr/bin/env bash
# Safely build and restart an already-provisioned /zbxt release.
# First-time provisioning, Nginx changes, backups, and rollback are documented in
# DEPLOYMENT_TENCENT_CLOUD.md and are intentionally not automated here.

set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROCESS_NAME="${PROCESS_NAME:-zhiban-server-v2}"
EXPECTED_PORT="${EXPECTED_PORT:-3011}"
ENV_FILE="$APP_DIR/server/.env"

fail() {
  echo "[error] $*" >&2
  exit 1
}

info() {
  echo "[ok] $*"
}

read_env() {
  local key="$1"
  awk -F= -v key="$key" '
    $0 !~ /^[[:space:]]*#/ && $1 == key {
      print substr($0, index($0, "=") + 1)
      exit
    }
  ' "$ENV_FILE"
}

if [ "$(id -un)" != "ubuntu" ]; then
  fail "run as the ubuntu PM2 owner: sudo -iu ubuntu"
fi

for command_name in git node npm pm2 curl; do
  command -v "$command_name" >/dev/null 2>&1 || fail "missing command: $command_name"
done

test -d "$APP_DIR/.git" || fail "not a Git checkout: $APP_DIR"
test -f "$ENV_FILE" || fail "missing production environment file: $ENV_FILE"
test -f "$APP_DIR/client/package-lock.json" || fail "missing client lockfile"
test -f "$APP_DIR/server/package-lock.json" || fail "missing server lockfile"

if ! git -C "$APP_DIR" diff --quiet || ! git -C "$APP_DIR" diff --cached --quiet; then
  fail "working tree is not clean; review local changes before deployment"
fi

host_value="$(read_env HOST)"
port_value="$(read_env PORT)"
base_path_value="$(read_env PUBLIC_BASE_PATH)"
frontend_url_value="$(read_env FRONTEND_URL)"
cors_origin_value="$(read_env CORS_ORIGIN)"
upload_dir_value="$(read_env UPLOAD_DIR)"
admin_username_value="$(read_env ADMIN_USERNAME)"
admin_password_value="$(read_env ADMIN_PASSWORD)"

[ "$host_value" = "127.0.0.1" ] || fail "HOST must be 127.0.0.1"
[ "$port_value" = "$EXPECTED_PORT" ] || fail "PORT must be $EXPECTED_PORT"
[ "$base_path_value" = "/zbxt" ] || fail "PUBLIC_BASE_PATH must be /zbxt"
[ "$frontend_url_value" = "https://vincentt.xyz/zbxt" ] || fail "FRONTEND_URL is incorrect"
[ "$cors_origin_value" = "https://vincentt.xyz" ] || fail "CORS_ORIGIN is incorrect"
case "$upload_dir_value" in
  /*) ;;
  *) fail "UPLOAD_DIR must be an absolute persistent path" ;;
esac
[ -n "$admin_username_value" ] || fail "ADMIN_USERNAME is not configured"
[ -n "$admin_password_value" ] || fail "ADMIN_PASSWORD is not configured"
[ "$admin_password_value" != "replace_with_a_strong_password" ] || fail "replace the example admin password"

mkdir -p "$upload_dir_value"
test -w "$upload_dir_value" || fail "UPLOAD_DIR is not writable by ubuntu"

info "configuration validated"

cd "$APP_DIR/server"
npm ci --omit=dev --no-audit --no-fund
node --check app.js
node --check config/paths.js

cd "$APP_DIR/client"
npm ci --no-audit --no-fund
npm run build
test -s dist/index.html || fail "frontend build did not produce dist/index.html"

if pm2 describe "$PROCESS_NAME" >/dev/null 2>&1; then
  pm2 restart "$PROCESS_NAME" --update-env
else
  pm2 start "$APP_DIR/server/app.js" \
    --name "$PROCESS_NAME" \
    --cwd "$APP_DIR/server"
fi

health_ok=0
for attempt in $(seq 1 20); do
  if curl --fail --silent "http://127.0.0.1:$EXPECTED_PORT/api/health" \
    > /tmp/zhiban-health.json; then
    health_ok=1
    break
  fi
  sleep 1
done

if [ "$health_ok" -ne 1 ]; then
  pm2 logs "$PROCESS_NAME" --nostream --lines 80 || true
  fail "backend health check failed"
fi

pm2 save
info "backend health check passed: $(cat /tmp/zhiban-health.json)"
info "frontend build ready at $APP_DIR/client/dist"
info "complete the versioned static-file and Nginx steps in DEPLOYMENT_TENCENT_CLOUD.md"
