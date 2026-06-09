# Avalisa Mobile Proof

Local iOS WebView prototype for proving whether Avalisa can run against PO mobile web before any production backend or website work.

## What It Does

- Opens `https://m.po.trade/en/cabinet?source=pwa` inside `WKWebView`.
- Lets the user log in directly on PO's own mobile page.
- Injects `ProofRuntime.js` at document start.
- Reports local status for page state, demo mode, pair, candles, duration, balance, payout, amount input, and Call/Put buttons.
- Allows `$1 CALL` / `$1 PUT` only when the injected runtime reports `DEMO MODE CONFIRMED`.

## What It Does Not Do

- It does not call the Avalisa production backend.
- It does not write to the Avalisa database.
- It does not load the Avalisa dashboard or website.
- It blocks trade clicks unless demo mode is locally detected.

## Run iOS With Full Xcode

Open `AvalisaMobileProof.xcodeproj` in Xcode, select an iPhone simulator, then run the `AvalisaMobileProof` scheme.

CLI build example:

```bash
xcodebuild \
  -project mobile-proof/ios/AvalisaMobileProof.xcodeproj \
  -scheme AvalisaMobileProof \
  -sdk iphonesimulator \
  -configuration Debug \
  build
```

This Mac currently has Command Line Tools selected, not full Xcode, so simulator build/run needs full Xcode installed and selected with `xcode-select`.

## Run Local Mac Proof Now

The repo also includes a local macOS WKWebView runner that uses the same injected runtime and an iPhone user agent. It is for immediate login/demo-mode testing on this machine while the iOS simulator toolchain is unavailable.

```bash
mobile-proof/mac/run-mac-proof.sh
```

## Test Flow

1. Start the app.
2. Log in to PO inside the WebView.
3. Switch PO to demo balance.
4. Tap `Scan`.
5. Confirm the top badge says `DEMO MODE CONFIRMED`.
6. Confirm pair, duration, balance, payout, amount field, and buttons are detected.
7. Tap `$1 CALL` or `$1 PUT` for one demo trade.
8. Stop if demo mode is not confirmed or any selector is missing.

## Notes

This is a proof app, not a release app. Store policy for binary-options execution is a separate blocker and should not be evaluated from this prototype alone.
