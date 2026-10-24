#!/usr/bin/env bash
# Builds dist/<slug>-v<version>.zip containing only the shipped files.
set -euo pipefail
cd "$(dirname "$0")/.."

SLUG="blitzfill-ttd"
VERSION="$(node -p "require('./manifest.json').version")"
OUT="dist/${SLUG}-v${VERSION}.zip"

for f in src/popup/popup.js icons/icon-16.png icons/icon-32.png icons/icon-48.png icons/icon-128.png; do
  [ -f "$f" ] || { echo "missing $f" >&2; exit 1; }
done
for f in $(find src -name '*.js'); do node --check "$f"; done

mkdir -p dist
rm -f "$OUT"
zip -q -X -r "$OUT" manifest.json _locales src icons/icon-*.png LICENSE -x '*.DS_Store'

echo "built $OUT"
unzip -l "$OUT" | tail -n +4 | sed '$d' | sed '$d' | awk '{print "  " $4 "  " $1 " B"}'
echo "zip size: $(wc -c < "$OUT" | tr -d ' ') bytes"
echo "unpacked size excluding icons: $(unzip -l "$OUT" | awk '$4 ~ /\// && $4 !~ /^icons\// && $4 !~ /\/$/ {s+=$1} $4=="manifest.json"||$4=="LICENSE" {s+=$1} END {print s}') bytes"
