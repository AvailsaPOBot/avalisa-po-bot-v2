# Website UI + PWA fixes — brief for Codex (2026-08-15)

Findings are from live testing of https://avalisabot.vercel.app on Mr. Oil's iPhone
(via iPhone Mirroring) and in a browser at 375 / 768 / 1440 px. Every item below was
reproduced — do not re-litigate whether they are real, just fix them.

Scope: `dashboard/` only. Do NOT deploy. Do NOT touch `extension/` or `mobile-proof/`.

## 1. The "webapp bot / PWA" does not exist (highest priority)
Evidence:
- `dashboard/public/manifest.json` has `"start_url": "/app"`, but `src/App.js` has NO
  `/app` route and NO catch-all route. Live check: `https://avalisabot.vercel.app/app`
  renders the navbar and nothing else — a blank page.
- `public/index.html` never links the manifest. Live DOM check:
  `document.querySelector('link[rel=manifest]')` → null, apple-touch-icon → null,
  service worker → none registered. So the site is not installable as a PWA at all.
- On a real iPhone, Share → "Add to Home Screen" produces a generic letter-"A" icon
  pointing at whatever page is open (we landed on `/register`), and the suggested name
  loses the brand ("– Automated Trading for Pocket Option").
- Every "Webapp Bot" entry point is marketing only: `Navbar.jsx` → `/#webapp` (an anchor
  to a landing section), and that section's CTA "Open Webapp Bot Access" → `/register`.

Fix:
- `public/index.html`: add `<link rel="manifest" href="%PUBLIC_URL%/manifest.json">`,
  `<link rel="apple-touch-icon" href="%PUBLIC_URL%/icon-192.png">`,
  `<meta name="apple-mobile-web-app-capable" content="yes">`,
  `<meta name="apple-mobile-web-app-title" content="Avalisa">`,
  `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`.
- Replace the leftover CRA description ("Web site created using create-react-app") with
  real copy about Avalisa PO Bot.
- `public/manifest.json`: set `start_url` to `/dashboard`, keep `display: standalone`,
  set `name` to "Avalisa PO Bot" and `short_name` to "Avalisa".
- `src/App.js`: add a catch-all `<Route path="*" element={<NotFound />} />` so an unknown
  URL shows a real page with a link home, never a blank screen. Keep it on-brand.
- Do NOT invent a bot UI. The actual webapp bot is the Mac WKWebView shell in
  `mobile-proof/`, which is out of scope here.

## 2. Floating chat button covers the primary CTA on mobile
At 375px the `.floating-chat-button` (48x48, fixed) sits at x 313-361 / y 414-462 and
overlaps the "Start Free Demo" gold CTA — measured by rect intersection, not by eye.
Fix so the FAB can never overlap a primary CTA: keep it bottom-anchored with
`bottom: max(16px, env(safe-area-inset-bottom) + 16px)`, and verify at 375 / 390 / 414
that it intersects no `<a>`/`<button>`.

## 3. Tap targets below the 44px minimum (mobile)
Measured: "Open PO signup" 39px, "Ask Avalisa support" 24px, one unnamed control 42px.
Give interactive elements a min-height of 44px (padding, not font-size inflation).
"Open PO signup →" also wraps so the arrow lands on its own line — keep the arrow with
the last word (nowrap on the label+icon).

## 4. Mobile hero drops the product/mascot visual entirely
On desktop the hero shows `hero-product-composite.png` (trading UI + the Avalisa girl).
At 375px that figure is not rendered at all, so mobile visitors see only text. The
mascot is the brand's main visual hook and mobile is the phone-first audience — show a
suitably cropped version on mobile too, below the CTAs, without pushing them off-screen.

## 5. Mascot art: gold-dress slot, swap-ready
A new "gold dress" mascot image is being produced separately. Do NOT fabricate or
placeholder-generate it. Instead make the swap a one-file drop:
- Reference the hero/pricing mascot through a single constant or CSS variable so one
  edit changes it everywhere (currently the path is repeated across Landing, Login,
  Register, ForgotPassword, ResetPassword).
- Target filename for the new asset: `/images/landing/generated/avalisa-girl-gold-highres.png`.
- Until that file exists, keep rendering the current
  `/images/landing/generated/avalisa-girl-cutout-highres.png`, and make the swap a
  single-line change. Never ship a broken <img>.
- Keep it tasteful and premium — elegant luxury brand, not suggestive.

## 6. Mobile menu polish
In the open hamburger menu, the links are left-aligned but "Logout" is centered. Make
alignment consistent.

## Verification required before you finish
- `cd dashboard && CI=true npx react-scripts test --watchAll=false` (existing tests must pass).
- `cd dashboard && npm run build` must succeed.
- State in your final message exactly which files you changed and what you verified.
