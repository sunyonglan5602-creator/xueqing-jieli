#!/usr/bin/env bash
# 下载并校验锁定版本的 PocketBase。二进制不进仓库。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/pocketbase/VERSION")"
if [[ "$VERSION" != "0.40.6" ]]; then
  echo "本仓库只锁定 PocketBase v0.40.6，当前 VERSION 文件是 ${VERSION}" >&2
  exit 1
fi

EXPECTED_SHA="$(grep -E '^[0-9a-f]{64}$' "$ROOT/pocketbase/checksums.txt" | head -n 1)"
DEST="$ROOT/pocketbase/bin"
BIN="$DEST/pocketbase"

if [[ -x "$BIN" ]]; then
  current="$("$BIN" --version 2>/dev/null || true)"
  if [[ "$current" == *"$VERSION"* ]]; then
    exit 0
  fi
fi

mkdir -p "$DEST"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

archive="pocketbase_${VERSION}_linux_amd64.zip"
url="https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}/${archive}"
curl -fsSL -o "$tmp/pb.zip" "$url"
echo "${EXPECTED_SHA}  $tmp/pb.zip" | sha256sum -c -
unzip -q -o "$tmp/pb.zip" -d "$tmp"
install -m 755 "$tmp/pocketbase" "$BIN"
"$BIN" --version
