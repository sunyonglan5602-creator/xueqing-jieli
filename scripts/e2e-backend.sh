#!/usr/bin/env bash
# 给 Playwright 用的本机 PocketBase。数据放在临时目录。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/download-pocketbase.sh"
DIR="$(mktemp -d)"
BIN="$ROOT/pocketbase/bin/pocketbase"
COMMON=(
  --dir "$DIR"
  --migrationsDir "$ROOT/pocketbase/pb_migrations"
  --hooksDir "$ROOT/pocketbase/pb_hooks"
  --publicDir "$ROOT/pocketbase/pb_public"
  --automigrate=false
)
"$BIN" superuser upsert superuser@example.invalid Super-Pass-0000 "${COMMON[@]}" >/dev/null
"$BIN" serve --http 127.0.0.1:8095 --hooksWatch=false "${COMMON[@]}" &
PID=$!
cleanup() {
  kill "$PID" >/dev/null 2>&1 || true
  rm -rf "$DIR"
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 50); do
  if curl -fsS http://127.0.0.1:8095/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

PB_HTTP=127.0.0.1:8095 \
  PB_SUPERUSER_EMAIL=superuser@example.invalid \
  PB_SUPERUSER_PASSWORD=Super-Pass-0000 \
  SEED_PASSWORD=Demo-Pass-0000 \
  node "$ROOT/scripts/seed.mjs"
wait "$PID"
