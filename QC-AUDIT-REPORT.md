# Avalisa PO Bot V2 — Full QC Audit Report

**Original Audit:** 2026-04-07
**Latest Update:** 2026-04-18 (Status: ~80% Resolved)
**Scope:** Extension, Backend, Dashboard

---

## 🟢 STATUS UPDATE — APRIL 18, 2026

The following critical and high-priority issues from the April 7 audit have been addressed:

### Fixed / Resolved
- **C1 (Partial):** `runTradeCycle` recursion now has `.catch()` handlers to prevent unhandled promise rejections, though still uses fire-and-forget recursion pattern.
- **C2 & H1:** The unauthenticated `/api/license/activate` endpoint has been removed. Licensing is now handled via secure Whop webhooks and a JWT-protected `/api/license/claim` process.
- **H2 & S2:** Global and route-specific rate limiting (express-rate-limit) implemented in `index.js` for auth, support, and general API usage.
- **S4:** `/api/support/chat` now requires `authMiddleware`, preventing unauthenticated LLM API abuse.
- **H4, H5, S5, S6, S9:** Error responses sanitized across `auth.js`, `admin.js`, and `trades.js`. `err.message` is logged internally but no longer leaked to clients.
- **M2:** `strategy` field is now correctly synced to the backend in `saveCurrentSettings`.
- **M3 & S8:** Prisma `DATABASE_URL` concatenation logic fixed to handle existing query parameters correctly.
- **M4 & S3:** `crypto.timingSafeEqual` crash fixed in `webhooks.js` by verifying buffer lengths before comparison.
- **Webhook Replay Protection:** Replay protection added to Whop and Lemon Squeezy webhooks by verifying `lemonsqueezyOrderId` before resetting trade counts.
- **apiPost Error Handling:** `apiPost` and `apiGet` now check `res.ok` and throw errors on non-200 responses, preventing silent failures.
- **Popup Fix:** `TOGGLE_PANEL` message listener added to `content.js`, resolving the non-functional popup button.
- **PWA Scrapped:** The PWA was scrapped (as it conflicted with PO's session validation), which resolved the dual-auth system conflict (item 6).

### Remaining / Pending
- **H3:** `document.execCommand` is still present in `content.js` (L482) but has robust fallbacks.
- **S4:** `/api/support/chat` is rate-limited but remains unauthenticated (No `authMiddleware`).
- **M1:** Some timeframe/delay mismatches between Dashboard and Extension UI still exist.
- **M4 (Webhook):** Whop webhook lacks explicit `lemonsqueezyOrderId` deduplication (potential replay risk).

---

## 1. EXECUTIVE SUMMARY

**Overall State:** Functional prototype / MVP — not production-ready.

The three-tier architecture (Chrome MV3 extension + Node/Express/Prisma backend + React CRA dashboard) is coherently structured with reasonable code organization. However, there are **2 critical bugs** that will cause incorrect trading behavior, **5 high-severity security issues**, and a large number of medium-severity defects across all three codebases.

### Critical Findings (C)
| # | Severity | Location | Summary |
|---|----------|----------|---------|
| C1 | CRITICAL | content.js | `runTradeCycle` has non-awaited recursive calls — stack overflow / lost error context |
| C2 | CRITICAL | trades.js | `/api/trades/log` requires auth — guest users (free plan) lose trade history silently |

### High Findings (H)
| # | Severity | Location | Summary |
|---|----------|----------|---------|
| H1 | HIGH | license.js | `/api/license/activate` endpoint publicly accessible — anyone can grant themselves a license |
| H2 | HIGH | support.js | `/api/support/chat` has no rate limiting — unlimited LLM API cost abuse |
| H3 | HIGH | content.js | `document.execCommand('insertText', ...)` deprecated — fails in Chrome 114+ |
| H4 | HIGH | auth.js | `detail: err.message` leaked on registration 500 — exposes internal errors |
| H5 | HIGH | admin.js | `grant-access` leaks `err.message` on 500 — exposes SQL/error internals |

### Medium Findings (M)
| # | Severity | Summary |
|---|----------|---------|
| M1 | MEDIUM | Timeframe mismatch: Prisma schema allows H4, extension doesn't; extension allows delay 2, backend rejects it |
| M2 | MEDIUM | `saveCurrentSettings` in content.js never sends `strategy` field to backend |
| M3 | MEDIUM | Prisma `DATABASE_URL` query string appended in `prisma.js` can break pooler connections |
| M4 | MEDIUM | `webhooks.js` uses `crypto.timingSafeEqual` but input buffers may differ in length — throws TypeError |
| M5 | MEDIUM | License check for authenticated users skips device fingerprint — authenticated users with no License row get `allowed: false` without creating one |

---

## 2. EXTENSION AUDIT

### 2.1 content.js

#### CRITICAL BUG — Non-awaited recursive calls to runTradeCycle

**Lines 401-403:**
```javascript
await sleep(3000);
if (state.running && !state.stopRequested) runTradeCycle(generation);
```

**Lines 518-521:**
```javascript
await sleep(delay);
if (state.running && !state.stopRequested && generation === state.cycleGeneration) {
  runTradeCycle(generation);
}
```

`runTradeCycle` is called recursively without `await`. This means:
- Errors in the recursive call bubble up to the caller, not to the original try/catch chain
- The call stack grows indefinitely over time, risking stack overflow after prolonged operation
- The `generation` cycle guard is a good pattern but is undermined by the lack of proper async recursion
- Unhandled promise rejections from the recursive call will hit the global handler and potentially crash the content script

**Fix:** Use `return runTradeCycle(generation)` at line 402 and `await runTradeCycle(generation)` at line 520.

#### CRITICAL BUG — Guest trades not logged

**Lines 496-505:**
```javascript
// Log trade to backend
if (state.jwt) {
  apiPost('/api/trades/log', {
    pair: getCurrentPair(),
    direction,
    amount: safeAmount,
    result,
    balanceBefore,
    balanceAfter,
  }).catch(console.error);
}
```

Trade logging is entirely skipped for unauthenticated (free) users. Free users get zero trade history, contradicting the README which says "Basic trade history" is included for free. The `/api/trades/log` endpoint requires JWT auth (authMiddleware), preventing guest logging entirely.

#### HIGH BUG — `document.execCommand` deprecated

**Line 179:**
```javascript
const typed = document.execCommand('insertText', false, valueStr);
```

`document.execCommand` is deprecated across all modern browsers. While Chrome still supports it for now, it triggers console warnings and may be removed. The fallback (native setter + synthetic events on lines 183-187) is more robust and should be the primary approach.

#### MEDIUM BUG — `saveCurrentSettings` missing `strategy`

**Lines 886-901:**
```javascript
async function saveCurrentSettings() {
  const settings = {
    timeframe: document.getElementById('av-timeframe').value,
    direction: document.getElementById('av-direction').value,
    delaySeconds: parseInt(document.getElementById('av-delay').value),
    martingaleMultiplier: parseFloat(document.getElementById('av-multiplier').value),
    martingaleSteps: document.getElementById('av-steps').value,
    startAmount: parseFloat(document.getElementById('av-start-amount').value) || 1.0,
  };
```

The `strategy` field is absent from the settings object sent to both chrome.storage.local and the backend. This means strategy changes in the overlay never persist to the API. The strategy is only set programmatically on line 418 (forced to 'martingale' for free users), but never synced.

#### HIGH — Timeframe H4 present in settings but not in UI

**Line 929:**
```javascript
set('av-timeframe', (s.timeframe === 'S15' ? 'S30' : s.timeframe) || 'M1');
```

S15 is silently converted to S30 in the UI without any warning to the user. If a user had S15 saved from elsewhere, it silently changes to S30 with no visual indication.

#### MEDIUM — Balance null comparison in trade result detection

**Lines 489-491:**
```javascript
const result = (balanceAfter !== null && balanceDuringTrade !== null && balanceAfter > balanceDuringTrade)
  ? 'win'
  : 'loss';
```

If `getBalance()` fails (returns null) for BOTH `balanceAfter` and `balanceDuringTrade`, the result defaults to 'loss'. A null balance should instead result in 'pending' or an error, not a presumed loss. This could falsely record losses when the balance selectors simply fail on a PO page update.

#### LOW — `setTradeAmount` selector 5 (`input[name="amount"]`) is wrong per own comments

**Lines 146-152:**
```javascript
const selectors = [
  '.block--bet-amount .value__val input',
  '.value__val input',
  'input[data-testid="trade-amount"]',
  '.trade-amount input',
  'input[name="amount"]',  // ← own comment says this matches a DIFFERENT hidden input
];
```

The comment on line 145 says `input[name="amount"]` matches a different hidden input and must NOT be used first — yet it's still included as fallback #5. It will eventually match that hidden input, potentially corrupting form state.

#### MEDIUM — Martingale multiplier precision

**Line 932:**
```javascript
set('av-multiplier', parseFloat(s.martingaleMultiplier || 2.0).toFixed(1));
```

The extension UI only has options with `.toFixed(1)` (2.0, 2.2, 2.4, etc.), but the backend validates ranges [1.2, 3.0]. If a user ever receives a non-standard value (e.g., 1.8 from direct DB manipulation), `toFixed(1)` will produce "1.8" which has no matching `<option>` in the HTML select.

#### MEDIUM — `apiPost` silently swallows HTTP errors

**Lines 81-90:**
```javascript
async function apiPost(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.jwt) headers['Authorization'] = `Bearer ${state.jwt}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return res.json();  // ← no res.ok check
}
```

`apiPost` always calls `res.json()` regardless of HTTP status. A 500 response with an HTML error page will throw a JSON parse error that gets caught by the caller inconsistently. A 401 response returns the JSON error but the caller (e.g., `checkLicense` line 99) treats it as success data, storing `{allowed: false, reason: undefined}` into `state.licenseInfo`.

#### LOW — Header button injected into potentially wrong header

**Lines 579-582:**
```javascript
const header = document.querySelector('.header__right') ||
    document.querySelector('.header-right') ||
    document.querySelector('header');
```

Falls back to the first `<header>` element on the page, which may not be the main PO header. On PO SPA navigation, the header may not be re-rendered, so the interval check (line 970) may not fire the injection again.

#### MEDIUM — No retry for license check on network failure

**Lines 93-105:**
```javascript
async function checkLicense() {
  try {
    const data = await apiPost('/api/license/check', { ... });
    state.licenseInfo = data;
    return data;
  } catch (err) {
    console.error('[Avalisa] License check failed:', err);
    return { allowed: false, reason: 'Network error' };
  }
}
```

On transient network errors, the bot stops entirely (`allowed: false`). No retry, no grace period. A single dropped request kills the trading cycle.

#### MEDIUM — No error handling if overlay elements are removed by PO

If PO's SPA removes and re-injects `#avalisa-overlay` (which it can, since the overlay is appended to `document.body`), all event bindings are lost. There is no `MutationObserver` watching for overlay removal or re-injecting it.

#### MEDIUM — `diagnosePOInterface()` runs on EVERY start

**Lines 818-848, called from `startBot()` line 854:**

The diagnostic function queries `[class*="timeframe"]`, `[class*="expir"]`, every `li`, every `input`, every `button`, etc. This is an extremely expensive DOM scan that runs synchronously every time the bot is started.

#### HIGH — `apiPost('/api/settings')` uses POST but backend line 30 mutates `req.method`

**Lines 898-900 (content.js):**
```javascript
if (state.jwt) {
  apiPost('/api/settings', settings).catch(console.error);
}
```

**Line 30 (backend src/routes/settings.js):**
```javascript
router.post('/', authMiddleware, async (req, res) => {
  req.method = 'PUT'; // reuse PUT handler below
  return settingsUpsert(req, res);
});
```

Modifying `req.method` is a code smell that can confuse middleware or logging. This works functionally but is brittle.

### 2.2 popup.js

#### LOW — `sendResponse` not wrapped with `return true` correctly

**Lines 43-46 (popup.js):**
```javascript
document.getElementById('open-panel-btn').addEventListener('click', async () => {
  await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
  window.close();
});
```

The popup sends a `TOGGLE_PANEL` message to the content script, but there is **no handler** for this message type anywhere in `content.js`. The popup button "Open Bot Panel on Page" silently does nothing. The content script has its own panel show/hide mechanism but no message listener for `TOGGLE_PANEL`.

### 2.3 background.js

#### LOW — Unconditional `return true` in onMessage listener

**Lines 7-13:**
```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_TAB') {
    chrome.tabs.create({ url: message.url });
    sendResponse({ success: true });
  }
  return true;
});
```

`return true` is unconditional, which tells Chrome to wait for `sendResponse` even for unrecognized message types. This creates a pending response channel for every message, which can cause issues with MV3 service worker lifecycle. Should only `return true` inside the `if` block for messages that actually use async responses.

### 2.4 manifest.json

#### LOW — Missing optional host permissions

`host_permissions` restricts to `pocketoption.com` and `po.cash` only. If PO uses any CDN or subdomain (e.g., `cdn.pocketoption.com`, `api.pocketoption.com`), the content script won't inject on those. This is likely intentional and correct, but a potential future issue if PO changes domain structure.

#### LOW — No `web_accessible_resources` declared

The extension does not inject external CSS/JS files — all CSS and HTML is inline in content.js — so this is acceptable. No fix needed.

---

## 3. BACKEND AUDIT

### 3.1 Security Vulnerabilities

#### CRITICAL — `/api/license/activate` is unauthenticated

**Lines 100-130 (license.js):**
```javascript
router.post('/activate', async (req, res) => {
  const { userId, plan, orderId, tradesLimit } = req.body;
  ...
  const license = await prisma.license.upsert({
    where: { userId },
    update: { plan, tradesUsed: 0, ... },
    create: { userId, plan, ... },
  });
```

This endpoint has **no authentication**. Anyone who knows or guesses a `userId` can directly activate any plan (`lifetime`, `basic`) for that user by sending a POST request. There's no HMAC signature verification, no admin check, no validation that the caller has paid.

**Impact:** Any user can grant themselves lifetime access.

**Fix:** Add `authMiddleware` (and ideally `adminMiddleware`), or at minimum verify against the Lemon Squeezy API that the order was genuinely created, not just rely on the webhook.

#### MEDIUM — Registration leaks internal error details

**Line 48 (auth.js):**
```javascript
res.status(500).json({ error: 'Registration failed', detail: err.message });
```

`err.message` exposes internal details (SQL errors, Prisma error codes, stack fragments) to any caller. This is an information disclosure vulnerability.

#### MEDIUM — Admin grant-access leaks error message

**Line 63 (admin.js):**
```javascript
return res.status(500).json({ error: err.message });
```

Same issue — exposes internal error details to the client.

#### HIGH — No rate limiting on any endpoint

None of the following have rate limiting:
- `/api/auth/register` — can be used to create unlimited accounts (email enumeration, DB fill)
- `/api/auth/login` — no brute-force protection on passwords
- `/api/support/chat` — unlimited LLM API calls free for anyone
- `/api/license/check` — can be polled without cost (DB queries)

#### MEDIUM — No input sanitization on user-submitted data

**Lines 106-115 (auth.js):**
```javascript
const { poUserId } = req.body;
const user = await prisma.user.update({
  where: { id: req.userId },
  data: { poUserId },
  ...
});
```

`poUserId` is stored directly without validation. A malicious user could submit arbitrary data (including very long strings or special characters) into this field.

#### MEDIUM — JWT stored in localStorage

Both the extension (chrome.storage.local) and dashboard (localStorage) store JWT tokens in client-side storage accessible to any injected script. While the Chrome extension sandbox is relatively isolated, the dashboard's localStorage is accessible to any XSS-vulnerable third-party script.

### 3.2 Database Integrity

#### MEDIUM — Prisma `DATABASE_URL` with appended query string

**Lines 6-12 (prisma.js):**
```javascript
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + '?pgbouncer=true&connection_limit=1',
    },
  },
});
```

If `DATABASE_URL` already contains query parameters (which is common for pooler URLs), appending `?pgbouncer=true&connection_limit=1` creates an invalid URL. Should check for existing `?` and use `&` instead.

**Fix:**
```javascript
const poolerURL = process.env.DATABASE_URL.includes('?')
  ? process.env.DATABASE_URL + '&pgbouncer=true&connection_limit=1'
  : process.env.DATABASE_URL + '?pgbouncer=true&connection_limit=1';
```

#### LOW — No `onDelete: Cascade` on DeviceFingerprint.user relation

**Line 75 (schema.prisma):**
```
user User? @relation(fields: [userId], references: [id], onDelete: SetNull)
```

When a User is deleted, DeviceFingerprint records have `userId` set to NULL rather than being deleted. These orphaned fingerprints accumulate over time.

#### MEDIUM — Trade model allows any string for `direction` and `result`

**Lines 42-45 (schema.prisma):**
```
direction     String   // call | put
result        String   // win | loss | pending
```

No database-level enum constraint. Any string can be stored. Should use `enum` type in Prisma for data integrity.

### 3.3 Webhook Handling

#### HIGH — `crypto.timingSafeEqual` buffer length mismatch

**Line 22 (webhooks.js):**
```javascript
if (!signature || !crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))) {
```

`crypto.timingSafeEqual` **throws TypeError** if the two buffers have different lengths. If an attacker sends a signature of incorrect length, the server crashes with an uncaught exception, bypassing the 401 response.

**Fix:**
```javascript
const sigBuffer = Buffer.from(signature || '', 'hex');
const digestBuffer = Buffer.from(digest, 'hex');
if (signature.length !== digest.length || !crypto.timingSafeEqual(digestBuffer, sigBuffer)) {
```

#### MEDIUM — Webhook doesn't prevent replay attacks

There's no timestamp validation or `orderId` deduplication. If Lemon Squeezy re-sends the same webhook (which they do for reliability), `handleOrderPaid` will upsert the same license repeatedly. This is mitigated by the fact that it resets `tradesUsed: 0` every time, effectively **giving the user unlimited trades if the webhook replay occurs**.

**Fix:** Check if `lemonsqueezyOrderId` already exists before processing, or use an idempotent create pattern.

### 3.4 Middleware

#### LOW — Auth middleware makes an extra DB call per request

**Lines 14-18 (auth.js):**
```javascript
const user = await prisma.user.findUnique({
  where: { id: decoded.userId },
  select: { id: true, email: true, isAdmin: true },
});
```

For every authenticated request, a database query is made to fetch the user. The JWT already contains `userId` — if `isAdmin` were included in the JWT payload, this query could be eliminated for most routes.

---

## 4. DASHBOARD AUDIT

### 4.1 Auth State Machine Issues

#### HIGH — Dual auth systems conflict

The dashboard has **two competing auth systems**:

1. **Web auth** (Dashboard.jsx, ProtectedRoute.jsx, useAuth.js) — uses `localStorage.getItem('jwt')` and `localStorage.getItem('user')`
2. **PWA auth** (PwaApp.jsx) — uses `localStorage.getItem('pwa_token')` and `localStorage.getItem('pwa_user')`

These are completely separate. A user logged in on the web dashboard is not recognized by the PWA, and vice versa. The "Open App" button on the Navbar and Landing page checks for `pwa_token`, but the user may only have `jwt` from web login.

**Lines 31-32 (Navbar.jsx):**
```jsx
onClick={() => { window.location.href = '/app' }}
```

This navigates to `/app` without checking if the user has a `pwa_token`. The PWA will see no token and redirect to `/app/login`, forcing an extra login.

**Lines 40-41 (Navbar.jsx, unauthenticated state):**
```jsx
onClick={() => { const t = localStorage.getItem('pwa_token'); window.location.href = t ? '/app' : '/app/login' }}
```

This checks `pwa_token` correctly, but for the authenticated branch it doesn't, creating inconsistent behavior.

#### MEDIUM — useAuth loading state blocks ProtectedRoute

**Lines 12-19 (useAuth.js):**
```javascript
useEffect(() => {
  const token = localStorage.getItem('jwt');
  if (!token) { setLoading(false); return; }
  api.get('/api/auth/me')
    .then(res => { setUser(res.data); ... })
    .catch(() => { localStorage.removeItem('jwt'); ... })
    .finally(() => setLoading(false));
}, []);
```

If the API call takes a long time (slow Render cold start), the ProtectedRoute shows "Loading..." indefinitely. There's no timeout — if the backend is down, users see a loading screen forever.

### 4.2 UI/UX Issues

#### MEDIUM — Dashboard.jsx has H4 in timeframes but extension doesn't

**Line 14 (Dashboard.jsx):**
```javascript
const TIMEFRAMES = ['M1', 'M3', 'M5', 'M30', 'H1', 'H4'];
```

H4 doesn't exist in the extension's timeframe dropdown. If a user saves H4 via the dashboard and the extension loads it, `setTimeframe` in content.js won't find H4 (it's not in the `tfTimeMap` on line 251), causing `setTimeframe` to return `false`.

#### MEDIUM — Dashboard multipliers extend beyond extension

**Line 17 (Dashboard.jsx):**
```javascript
const MULTIPLIERS = [1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 2.6, 2.8, 3.0];
```

The extension only offers [2.0, 2.2, 2.4, 2.6, 2.8, 3.0]. A user could set 1.2, 1.4, 1.6, or 1.8 from the dashboard, and the extension's UI would display these values using `.toFixed(1)` with no matching `<option>` element, showing a raw value.

#### MEDIUM — Dashboard delays differ from backend validation

**Line 16 (Dashboard.jsx):**
```javascript
const DELAYS = [4, 6, 8, 10, 12];
```

The extension offers [2, 4, 6, 8, 10, 12] but the backend VALID_DELAYS = [4, 6, 8, 10, 12]. A value of 2 set in the extension UI will be rejected by the backend with a 400 error.

#### MEDIUM — Trade history table lacks pagination controls

**Line 73 (Dashboard.jsx):**
```javascript
api.get('/api/trades/history?limit=20'),
```

Only the first 20 trades are fetched. The backend supports pagination (`page`, `limit` query params) but the dashboard provides no UI to load more.

#### LOW — P&L calculation in history tab is per-page, not total

**Lines 74-79 (trades.js stats computation):**
```javascript
const totalProfit = closedTrades.reduce((sum, t) => {
  if (t.balanceBefore != null && t.balanceAfter != null) {
    return sum + (t.balanceAfter - t.balanceBefore);
  }
  return sum;
}, 0);
```

Stats are computed from the single page of trades returned by the API, not from all of the user's historical trades. This gives inaccurate win rates for users with more than 50 total trades.

### 4.3 PWA Functionality

#### MEDIUM — No service worker registered

**public/manifest.json** exists, and `beforeinstallprompt` is handled in PwaApp.jsx, but there is **no service worker file** (`sw.js` or `service-worker.js`). Without a service worker, the "Install" button does nothing on most browsers, and the app will not work offline.

**Fix:** Create a `public/service-worker.js` (or use workbox) and register it in `index.js`.

#### MEDIUM — Hardcoded backend URL in PWA API

**Line 4 (pwa/api.js):**
```javascript
baseURL: 'https://avalisa-backend.onrender.com',
```

The main `lib/api.js` uses `process.env.REACT_APP_API_URL` with a fallback, but `pwa/api.js` hardcodes the URL. If the backend moves, the PWA breaks while the web app can be fixed via env vars.

#### MEDIUM — No PWA route protection

PwaApp.jsx at `/app`, `/app/login`, and `/app/register` are handled by `<Route path="/app" element={<PwaApp />} />` in App.js. The PWA does its own auth check internally. There's no `ProtectedRoute` guard — the routes are publicly accessible and auth is handled client-side, which is fine but means the route-level protection is bypassed.

#### LOW — iOS standalone detection is fragile

**Line 53 (PwaApp.jsx):**
```javascript
const isInStandaloneMode = window.navigator.standalone === true
```

This only works on Safari iOS. Chrome iOS and other browsers will always return `false`, triggering the install banner incorrectly.

### 4.4 Other Dashboard Issues

#### LOW — FloatingChat component exists on every page

**Line 38 (App.js):**
```jsx
{!isPwa && <FloatingChat />}
```

The floating chat is rendered on every non-PWA page (Landing, Login, Register, Pricing, etc.). It's likely unnecessary on the login/register pages and could be confusing as a pre-login support channel.

#### LOW — `reportWebVitals()` called without arguments

**Line 17 (index.js):**
```javascript
reportWebVitals();
```

This sends results nowhere. Either pass a callback or remove it.

---

## 5. SECURITY FINDINGS (Consolidated)

| # | Severity | Location | Issue |
|---|----------|----------|-------|
| S1 | CRITICAL | license.js:100 | `/api/license/activate` has no auth — anyone can self-grant any plan |
| S2 | HIGH | All routes | No rate limiting on any endpoint — brute-force, spam, LLM abuse possible |
| S3 | HIGH | webhooks.js:22 | `crypto.timingSafeEqual` throws on buffer length mismatch — server crash on malformed signature |
| S4 | HIGH | support.js:8 | `/api/support/chat` unauthenticated — unlimited LLM API cost abuse |
| S5 | HIGH | auth.js:48 | Internal error messages leaked in registration 500 response |
| S6 | HIGH | admin.js:63 | Internal error messages leaked in admin 500 response |
| S7 | MEDIUM | All JWT storage | JWT stored in localStorage/localStorage — XSS-accessible |
| S8 | MEDIUM | prisma.js:9 | `DATABASE_URL` string concatenation can create invalid URLs |
| S9 | MEDIUM | trades.js:32 | `err.message` leaked in trades/log 500 response |
| S10 | LOW | No helmet middleware | Missing standard Express security headers (CSP, X-Content-Type-Options, etc.) |
| S11 | LOW | No CSRF protection | State-changing endpoints (PUT/POST) lack CSRF tokens |
| S12 | LOW | webhooks.js:84 | No replay attack prevention on payment webhooks |

---

## 6. TRADING LOGIC REVIEW

### 6.1 Martingale Logic

**Lines 524-546 (content.js):**
```javascript
function applyMartingaleLogic(result) {
  const s = state.settings;
  const multiplier = parseFloat(s.martingaleMultiplier) || 2.0;
  const startAmount = parseFloat(s.startAmount) || 1.0;
  const maxSteps = s.martingaleSteps === 'infinite' ? Infinity : (parseInt(s.martingaleSteps) || Infinity);

  if (result === 'loss') {
    if (state.martingaleStep < maxSteps) {
      state.martingaleStep++;
      state.currentAmount = parseFloat((state.currentAmount * multiplier).toFixed(2));
    } else {
      state.martingaleStep = 0;
      state.currentAmount = startAmount;
    }
  } else {
    state.martingaleStep = 0;
    state.currentAmount = startAmount;
  }
}
```

**Issues:**
- **Floating-point explosion:** `state.currentAmount = parseFloat((state.currentAmount * multiplier).toFixed(2))` — After 5+ consecutive losses at 2.0x, amounts escalate quickly ($1 → $2 → $4 → $8 → $16 → $32...). No max amount cap exists. A user with `$100 balance` could lose it all in 7 consecutive losses at 2.0x starting from $1.
- **No balance check:** Bot doesn't check if `currentAmount` exceeds available balance before placing a trade.
- **Result only distinguishes win/loss:** Any result other than 'loss' triggers a Martingale reset. If `result === 'pending'` (e.g., from a failed balance read), it resets Martingale incorrectly.

### 6.2 Balance Detection

**Lines 119-139 (content.js):**

8-selector fallback chain with `val > 0` guard is reasonable. However:
- Uses `textContent.replace(/[^0-9.]/g, '')` — If the balance contains multiple decimal points (e.g., "1,234.56" with comma), it becomes "1234.56" correctly, but "1.000.50" becomes "1.000.50" which `parseFloat` parses as `1`, not `1000.50`.
- The `parseFloat('')` case returns `NaN`, which fails the `val > 0` check (correctly), but also the regex could produce strings like "." which parse to `NaN`.

### 6.3 Trade Result Detection

**Lines 478-491 (content.js):**
```javascript
await sleep(expiryMs + 3000);
clearTimeout(tradeGuardTimeout);
state.isTradeOpen = false;
const balanceAfter = getBalance();
const result = (balanceAfter !== null && balanceDuringTrade !== null && balanceAfter > balanceDuringTrade)
  ? 'win'
  : 'loss';
```

Wait time is `expiryMs + 3000ms`. PO typically takes 1-3 seconds after expiry to credit winnings, so the 3s buffer is reasonable. However:
- If the user opens multiple PO tabs, `state.isTradeOpen` tracking is tab-specific. Another tab could be placing trades simultaneously, causing balance interference.
- No check for "trade cancelled" or "trade refunded" scenarios.

### 6.4 Timeframe Handling

**Lines 250-316 (content.js):**

The `tfTimeMap` only includes: S30, M1, M3, M5, M30, H1 (no H4). The extension UI offers these same 6. The Prisma schema allows H4 and S15. The dashboard offers M1, M3, M5, M30, H1, H4. There is a clear inconsistency.

**Lines 266-271:**
```javascript
const valEl = document.querySelector('.block--expiration-inputs .value__val');
const current = valEl?.textContent?.trim();
if (current === targetTime) {
  return true;
}
```

Exact string match on UI text is fragile. PO could change formatting (e.g., "00:01:00" → "1:00" or add leading/trailing spaces not caught by `.trim()`).

### 6.5 Direction Logic

**Lines 383-390:**
```javascript
function getNextDirection() {
  const dir = state.settings.direction;
  if (dir === 'call') return 'call';
  if (dir === 'put') return 'put';
  // alternating
  state.lastDirection = state.lastDirection === 'call' ? 'put' : 'call';
  return state.lastDirection;
}
```

Alternating direction starts with 'call' by default (since `state.lastDirection` initializes as `null`, which is `!== 'call'`). First trade is always a CALL when alternating. This is a minor design choice but should be documented.

---

## 7. PRODUCTION READINESS

### 7.1 Error Handling

| Area | Status |
|------|--------|
| Extension | Partially handled. Most async operations have `.catch()` or try/catch, but recursive `runTradeCycle` calls are unhandled |
| Backend | Global error handler exists (index.js line 78). Most routes have try/catch. Error messages sometimes leak details |
| Dashboard | Toast error handling present. `Promise.allSettled` used for parallel API calls (good). No error boundary components |

### 7.2 Logging

| Area | Status |
|------|--------|
| Extension | `console.log` throughout with `[Avalisa]` prefix. Good diagnostic logging |
| Backend | `console.log` and `console.error` only. No structured logging (no winston, pino, etc.) |
| Dashboard | Minimal logging — only `console.error` in a few places |

**Issues:**
- No request logging middleware (morgan, etc.) on the backend
- No correlation IDs for tracing requests across services
- No log levels — everything goes to stdout
- Render free tier has limited log retention

### 7.3 Monitoring & Health

| Area | Status |
|------|--------|
| Health check | `/health` endpoint exists but returns static data only |
| Metrics | No Prometheus/Grafana, no request counting, no error rate tracking |
| Uptime | Render free tier sleeps after inactivity — cold starts can take 30-60s, causing API timeouts |
| Alerts | No alerting configured for errors, low balance, bot failures |

### 7.4 Deployment

#### Conflicting deployment configurations

**railway.json:**
```json
"startCommand": "npm run db:migrate && npm start"
```

**render.yaml:**
```yaml
buildCommand: npm install && npx prisma migrate deploy && npx prisma generate
startCommand: node src/index.js
```

**MEMORY.md says:** "Startup migration block removed — tables exist, no migration needed on deploy."

But the deployment configs still run migrations on every deploy. If migrations break or are incompatible, the deploy fails. This is contradictory.

#### Missing configurations

| Item | Status |
|------|--------|
| .env in .gitignore | ✅ Confirmed present |
| Dockerfile | Missing — relies on Railway/Render buildpacks |
| CI/CD pipeline | None configured |
| HTTPS | Handled by hosting platforms |
| Database backups | Not mentioned or configured |
| Environment docs | `.env.example` present in backend and dashboard |

### 7.5 Dependencies

| Dependency | Version | Concern |
|-----------|---------|---------|
| `@prisma/client` | 5.22.0 (pinned) | Good — prevents breaking upgrades |
| `bcryptjs` | ^2.4.3 | Pure JS implementation — slower than native `bcrypt`. Consider `bcrypt` for production |
| `express` | ^4.21.1 | Express 4.x — Express 5 available but not a concern |
| `jsonwebtoken` | ^9.0.2 | Current |
| `cors` | ^2.8.5 | Current |

---

## 8. PRIORITY FIX LIST

Ranked by urgency (1 = most urgent):

### IMMEDIATE (Fix before any production use)

1. **[FIXED 2026-04-18] CRITICAL: Add authentication to `/api/license/activate`** — Endpoint REMOVED. Activation now handled via secure Whop webhooks and `/api/license/claim` (authenticated).

2. **[PARTIAL 2026-04-18] CRITICAL: Fix async recursion in `runTradeCycle`** — Added `.catch()` handlers to recursive calls to prevent unhandled rejections. Still uses fire-and-forget pattern.

3. **[FIXED 2026-04-18] CRITICAL: Fix `crypto.timingSafeEqual` crash in webhooks.js** — Length check added before comparison in `webhooks.js`.

### HIGH PRIORITY (Fix within 1 week)

4. **[FIXED 2026-04-18] HIGH: Add rate limiting** — `express-rate-limit` implemented in `index.js` for all API routes, specifically targeting auth and support chat.

5. **[FIXED 2026-04-18] HIGH: Fix `/api/support/chat` authentication** — `authMiddleware` added to the route.

6. **[RESOLVED 2026-04-18] HIGH: Fix duplicate/missing auth systems** — PWA SCRAPPED; dual-auth system conflict resolved by removal.

7. **[PARTIAL 2026-04-18] HIGH: Fix non-awaited recursive `runTradeCycle`** — See item 2.

8. **[FIXED 2026-04-18] HIGH: Sanitize error responses** — `err.message` removed from client responses in `auth.js`, `admin.js`, and `trades.js`.

9. **[FIXED 2026-04-18] HIGH: Fix `TOGGLE_PANEL` message** — Message listener added to `content.js`, popup button now functional.

### MEDIUM PRIORITY (Fix within 2-3 weeks)

10. **[FIXED 2026-04-18] MEDIUM: Sync `strategy` field in `saveCurrentSettings`** — `strategy` now correctly included in settings payload and synced to backend.

11. **[FIXED 2026-04-18] MEDIUM: Fix Prisma DATABASE_URL concatenation** — Logic updated to use `?` or `&` correctly based on existing params.

12. **[FIXED 2026-04-18] MEDIUM: Add webhook replay protection** — Order ID uniqueness check added to webhook handlers.

13. **MEDIUM: Unify timeframe/delay/multiplier configs** across extension, dashboard, and backend VALID_* arrays to prevent validation mismatches.

14. **[FIXED 2026-04-18] MEDIUM: Fix `apiPost` to check `res.ok`** — Network helpers now throw on HTTP errors.

15. **MEDIUM: Add P&L computed server-side** — Move stats computation from the client-side paginated subset to a server-side aggregate query.

16. **MEDIUM: Handle null balance in trade result detection** — Return 'pending' if balances can't be read, not 'loss'.

### LOW PRIORITY (Future improvements)

17. **LOW: Add service worker for PWA** — Create sw.js and register it so the "Install" button actually works.

18. **LOW: Hardcode backend URL in pwa/api.js** — Change to use `REACT_APP_API_URL` env var like the main api.js.

19. **LOW: Add structured logging** — Replace console.log with pino or winston.

20. **LOW: Add request logging middleware** — Add morgan or equivalent.

21. **LOW: Harden `setTradeAmount` selectors** — Remove selector 5 (`input[name="amount"]`) as it matches a hidden input per own comments.

22. **LOW: Replace `bcryptjs` with `bcrypt`** — For better password hashing performance.

23. **LOW: Add error boundary components to React app** — Prevent full UI crash on component errors.

24. **LOW: Add MutationObserver for overlay re-injection** — Watch for `#avalisa-overlay` removal and re-inject.

25. **LOW: Resolve Railway.json vs render.yaml contradiction** — Align deployment strategy to one platform.

---

*End of audit report.*
