# Avalisa Webapp Bot

Mobile-first WKWebView shell for running Avalisa against PO mobile web without requiring the Chrome extension.

## What It Does

- Opens `https://m.po.trade/en/cabinet?source=pwa` inside `WKWebView`.
- Lets the user log in directly on PO's own mobile page.
- Lets the user log in to Avalisa from the bot panel.
- Checks Avalisa backend access before manual trades or bot start.
- Uses the same backend plan/license rules as the extension: paid users get their purchased plan, and new users get the configured free tier.
- Supports confirmed Demo and confirmed Real PO account modes.
- Keeps unknown or unreadable PO account mode locked.
- Injects `ProofRuntime.js` at document start.
- Reports page state, account mode, pair, candles, duration, balance, payout, backend access, and bot status.

## Backend Access

The webapp bot does not connect directly to Supabase from the client. It calls the Avalisa production backend, and the backend uses the existing Supabase/Postgres-backed user, plan, license, and trade usage records.

Runtime endpoints used by the webapp bot:

- `POST /api/auth/login`
- `POST /api/license/check`
- `POST /api/license/increment`
- `POST /api/trades/log`

Browser origins required by the backend CORS allowlist:

- `https://m.po.trade`
- `https://m.po.cash`
- `https://avalisabot.vercel.app`

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

## Run Local Mac Webapp Bot

The repo also includes a local macOS WKWebView runner that uses the same injected runtime and an iPhone user agent. It is the quickest way to test the webapp bot on this machine.

```bash
mobile-proof/mac/run-mac-proof.sh
```

## Test Flow

1. Start the app.
2. Log in to Avalisa in the bot panel, or continue as a free-tier user.
3. Log in to PO inside the WebView.
4. Confirm PO account mode is Demo or Real.
5. Tap `Scan`.
6. Confirm backend access is active and the account badge is not unknown.
7. Start bot or place a manual `$1 CALL` / `$1 PUT`.
8. Stop if account mode, backend access, amount input, payout, or buttons cannot be confirmed.

## Notes

Real execution is intentionally allowed when both checks pass: Avalisa backend access and confirmed PO Real account mode. Unknown account mode remains locked.
