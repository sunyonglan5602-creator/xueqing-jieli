#!/usr/bin/env bash
# 本地一键启动：PocketBase v0.40.6 + Vite。只监听本机，不部署。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

bash "$ROOT/scripts/download-pocketbase.sh"

if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  npm install --prefix "$ROOT/frontend"
fi

PB_HTTP="${PB_HTTP:-127.0.0.1:8090}"
case "$PB_HTTP" in
  127.0.0.1:*|localhost:*) ;;
  *)
    echo "PB_HTTP 只能是本机地址，当前是 ${PB_HTTP}" >&2
    exit 1
    ;;
esac

PB_DIR="$ROOT/pocketbase/pb_data"
mkdir -p "$PB_DIR" "$ROOT/pocketbase/pb_migrations" "$ROOT/pocketbase/pb_hooks" "$ROOT/pocketbase/pb_public"

BIN="$ROOT/pocketbase/bin/pocketbase"
PB_COMMON=(--dir "$PB_DIR" --migrationsDir "$ROOT/pocketbase/pb_migrations" --hooksDir "$ROOT/pocketbase/pb_hooks" --publicDir "$ROOT/pocketbase/pb_public")

if [[ -n "${PB_ENCRYPTION_KEY:-}" && ${#PB_ENCRYPTION_KEY} -ne 32 ]]; then
  echo "PB_ENCRYPTION_KEY 必须恰好 32 个字符，或留空。" >&2
  exit 1
fi

if [[ -n "${PB_SUPERUSER_EMAIL:-}" && -n "${PB_SUPERUSER_PASSWORD:-}" ]]; then
  "$BIN" superuser upsert "$PB_SUPERUSER_EMAIL" "$PB_SUPERUSER_PASSWORD" "${PB_COMMON[@]}" --dev=false >/dev/null
fi

ENC_ARGS=()
if [[ -n "${PB_ENCRYPTION_KEY:-}" ]]; then
  ENC_ARGS=(--encryptionEnv PB_ENCRYPTION_KEY)
fi

"$BIN" "${ENC_ARGS[@]}" serve --http "$PB_HTTP" "${PB_COMMON[@]}" --dev --hooksWatch=false &
PB_PID=$!

cleanup() {
  kill "$PB_PID" >/dev/null 2>&1 || true
  if [[ -n "${VITE_PID:-}" ]]; then
    kill "$VITE_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 50); do
  if curl -fsS "http://${PB_HTTP}/api/health" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$PB_PID" >/dev/null 2>&1; then
    echo "PocketBase 没有启动成功" >&2
    exit 1
  fi
  sleep 0.2
done

echo "PocketBase: http://${PB_HTTP}"
echo "前端:       http://127.0.0.1:5173"
cd "$ROOT/frontend"
npm run dev -- --host 127.0.0.1 --port 5173 &
VITE_PID=$!
wait "$VITE_PID"
