#!/bin/bash
# Pack the Chrome extension into a zip for Web Store submission

OUTPUT="avalisa-extension-v2.zip"

echo "Packing Chrome extension..."
cd "$(dirname "$0")"

# Remove old zip if exists
rm -f "$OUTPUT"

# Create zip from extension folder, excluding dev files
zip -r "$OUTPUT" extension/ \
  --exclude "*.DS_Store" \
  --exclude "*/__MACOSX/*" \
  --exclude "*/.*"

echo "✅ Created: $OUTPUT"
echo "Upload this file at: https://chrome.google.com/webstore/devconsole"
