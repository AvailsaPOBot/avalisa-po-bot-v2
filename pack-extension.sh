#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
VERSION="$(node -e "console.log(require('$ROOT/extension/manifest.json').version)")"
OUTPUT="${HOME}/Desktop/avalisa-v${VERSION}.zip"

echo "Packing Chrome extension v${VERSION}..."

rm -f "$OUTPUT"

(
  cd "$ROOT/extension"
  zip -r "$OUTPUT" . \
    --exclude "*.DS_Store" \
    --exclude "__MACOSX/*" \
    --exclude "*/__MACOSX/*" \
    --exclude ".*" \
    --exclude "*/.*"
)

echo "Created: $OUTPUT"
echo "Upload this file at: https://chrome.google.com/webstore/devconsole"
