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
    --exclude "*/.*" \
    --exclude "test/*" \
    --exclude "*/test/*"
)

# Guard, not a comment. extension/test/ exists so the claim-reachability checks live beside
# the code they cover, but pack zips the WHOLE extension directory - so on 2026-08-30 the test
# file was verifiably inside the package headed for 670 users. An --exclude is silent when it
# stops matching (a renamed dir, a new spec suffix), so the package is inspected after the fact
# and the build FAILS rather than shipping something that only a human eyeball would catch.
# NOTE the shape here, it is not stylistic. The first version of this guard used
#   if unzip -l "$OUTPUT" | grep -qiE ... ; then
# and it SHIPPED a planted test file while exiting 0. Under `set -o pipefail`, grep -q exits
# the moment it matches, unzip takes SIGPIPE, and the PIPELINE reports that failure rather than
# grep's success - so a match reads as "clean". A guard against silent shipping, silently broken.
# Caught only by planting a file and watching it sail through. Capture first, then test.
ZIP_CONTENTS="$(unzip -l "$OUTPUT")"
OFFENDERS="$(printf '%s\n' "$ZIP_CONTENTS" | grep -iE '(^|/)(test|tests|spec|__tests__)/|\.test\.|\.spec\.' || true)"
if [ -n "$OFFENDERS" ]; then
  echo "REFUSING TO SHIP: test files found inside $OUTPUT" >&2
  printf '%s\n' "$OFFENDERS" >&2
  rm -f "$OUTPUT"
  exit 1
fi

echo "Created: $OUTPUT"
echo "Upload this file at: https://chromewebstore.google.com/devconsole"
