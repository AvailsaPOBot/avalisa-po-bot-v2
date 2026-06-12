#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD_DIR="$ROOT/mobile-proof/mac/build"
APP_DIR="$BUILD_DIR/AvalisaMobileProofMac.app"
mkdir -p "$BUILD_DIR"
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"

swiftc \
  "$ROOT/mobile-proof/mac/AvalisaMobileProofMac.swift" \
  -o "$APP_DIR/Contents/MacOS/AvalisaMobileProofMac" \
  -framework AppKit \
  -framework WebKit

cp "$ROOT/mobile-proof/ios/AvalisaMobileProof/ProofRuntime.js" "$APP_DIR/Contents/Resources/ProofRuntime.js"
cp "$ROOT/extension/icons/avalisa-signature-logo-transparent.png" "$APP_DIR/Contents/Resources/avalisa-signature-logo-transparent.png"

plutil -create xml1 "$APP_DIR/Contents/Info.plist"
plutil -insert CFBundleExecutable -string AvalisaMobileProofMac "$APP_DIR/Contents/Info.plist"
plutil -insert CFBundleIdentifier -string com.avalisa.mobileproof.mac "$APP_DIR/Contents/Info.plist"
plutil -insert CFBundleName -string "Avalisa Mobile Proof" "$APP_DIR/Contents/Info.plist"
plutil -insert CFBundlePackageType -string APPL "$APP_DIR/Contents/Info.plist"
plutil -insert CFBundleShortVersionString -string 1.02 "$APP_DIR/Contents/Info.plist"
plutil -insert CFBundleVersion -string 101 "$APP_DIR/Contents/Info.plist"

open -n "$APP_DIR"
