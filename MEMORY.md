# Avalisa PO Bot v2 — Project Memory
Last updated: 2026-03-31 (evening)

---

## Live URLs
| Service | URL |
|---|---|
| Backend (Render) | https://avalisa-backend.onrender.com |
| Dashboard (Vercel) | https://avalisabot.vercel.app |
| GitHub | https://github.com/AvailsaPOBot/avalisa-po-bot-v2 |
| Supabase project | gkhoqpthqfgkcyeorcgc |
| Affiliate link | https://u3.shortink.io/register?utm_campaign=36377... |

---

## Current Status (March 31, 2026)
✅ Working: Backend (onrender.com), Dashboard (vercel.app), Registration, Login, AI chat, Trade execution, Balance detection, WIN/LOSS detection
❌ Still broken: Timeframe selector (panel toggles between 2 modes — latest fix in progress), /api/trades/log 500 error (needs Render log check)
🔧 Last commit: setTimeframe rewrite — stops closing panel after timeframe click, tries toggle twice if wrong panel showing (cc522c3)

## What Works
- Backend starts, connects to Supabase, serves routes
- Auth: register, login, JWT issuance
- License check + increment (free plan via device fingerprint)
- Settings POST/PUT/GET routes (all fixed)
- Trades log route (all fields optional with defaults, body logged)
- Extension overlay injects into PO page
- Extension UI: login, logout (red button), start/stop bot
- Martingale logic (multiplier, steps, reset on win)
- isTradeOpen guard prevents double-trades
- diagnosePOInterface() runs on every Start click
- Balance detection (8-selector fallback chain with val > 0 guard)
- WIN/LOSS detection (balance diff after TF expiry + 3s buffer)
- waitForTradeOpen (3-selector fallback with full logging)

## What Doesn't Work / Unconfirmed
- setTimeframe: in progress — panel toggles between time-offset and grid modes
- /api/trades/log: returning 500 on Render — check Render logs for Prisma error
- setTradeAmount: selector unconfirmed on live PO (5 fallbacks tried)
- Trades not logged for guest (unauthenticated) users
- DIRECT_URL env var status on Render unknown

---

## Database Notes
- Provider: Supabase PostgreSQL (project: gkhoqpthqfgkcyeorcgc)
- Tables created MANUALLY via Supabase SQL editor (NOT via prisma migrate)
- No migration history exists in _prisma_migrations table
- Direct connection port 5432 blocked on dev network
- Pooler port 6543 also blocked on dev network
- Prisma pinned to exact 5.22.0 (no caret) — prevents npx pulling breaking v7
- schema.prisma uses directUrl = env("DIRECT_URL") — must be set on Render
- On Render: DATABASE_URL must be set; DIRECT_URL should also be set (can be same URL)
- Pooler URL format: postgresql://postgres:PASSWORD@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1

## Render Environment Variables Required
- DATABASE_URL
- DIRECT_URL (same as DATABASE_URL or pooler URL)
- JWT_SECRET
- GOOGLE_AI_API_KEY
- ANTHROPIC_API_KEY (optional, enables Claude instead of Gemini)
- FRONTEND_URL (https://avalisabot.vercel.app)
- LEMONSQUEEZY_WEBHOOK_SECRET
- LEMONSQUEEZY_VARIANT_ID_BASIC
- LEMONSQUEEZY_VARIANT_ID_LIFETIME

---

## Known Bugs

### CRITICAL
| # | Bug | File | Status |
|---|-----|------|--------|
| 1 | `[class*="expir"]` too broad — caused top bar disappearing | content.js | ✅ Fixed — removed, now uses `<a>` inside `.block--expiration-inputs` only |
| 2 | Page-wide `querySelectorAll('li')` false-matched nav menus | content.js | ✅ Fixed — scoped to expiryBlock |
| 3 | `getBalance()` selectors unconfirmed — null → always LOSS | content.js | ✅ Fixed — 8-selector fallback, val>0 guard, logging |
| 4 | `waitForTradeOpen` selector unconfirmed | content.js | ✅ Fixed — 3-selector fallback with logging |
| 5 | setTimeframe clicking wrong elements — top bar disappearing | content.js | ✅ Fixed — scoped to expiryBlock `<a>` toggle only |
| 6 | setTimeframe closing panel after select — caused panel switch | content.js | ✅ Fixed — no close click after selection |
| 7 | /api/trades/log 400 — strict field validation | trades.js | ✅ Fixed — all fields optional with defaults |
| 8 | /api/trades/log 500 — Prisma error on Render | trades.js | ❌ Open — check Render logs |
| 9 | setTimeframe not reaching grid panel (on wrong panel) | content.js | 🔧 In progress — double-toggle if 0 items after 1st click |

### HIGH
| # | Bug | File | Status |
|---|-----|------|--------|
| 10 | `setTradeAmount` 5-selector fallback — none confirmed on live PO | content.js | Unconfirmed |
| 11 | Bot stops silently if amount/button not found (no `state.running = false`) | content.js | Open |
| 12 | Trades only logged if `state.jwt` set — guests untracked | content.js | By design |

### MEDIUM
| # | Bug | File | Status |
|---|-----|------|--------|
| 13 | `saveCurrentSettings` never sends `strategy` field | content.js | Open |
| 14 | Multiplier stored as number may not match `<option value="2.0">` | content.js | Open |
| 15 | `VALID_DELAYS` rejects values outside [4,6,8,10,12] | settings.js | Open |
| 16 | License check: authenticated user with no License row → `allowed: false` | license.js | Open |

---

## Key Technical Facts — PO DOM (discovered via diagnostic logs)
- PO has 2 timeframe panels toggled by `<a>` inside `.block--expiration-inputs`
- Panel 1: time offset mode (+S30, +M1 etc) — NOT what we want
- Panel 2: fixed grid (S3, S15, S30, M1, M3, M5, M30, H1, H4) = `.dops__timeframes-item` — THIS is what we want
- Do NOT click toggle to close after selecting — PO closes panel naturally on selection
- If 1st toggle click shows 0 `.dops__timeframes-item`, we're on wrong panel — click again to switch
- Quick/Turbo mode URL contains: `demo-quick-high-low`
- Both regular and Quick mode use the SAME timeframe grid panel

## Key Technical Decisions
1. **AI provider**: Gemini (gemini-2.5-flash) by default; Claude (claude-sonnet-4-20250514) if ANTHROPIC_API_KEY set
2. **Trade result detection**: Balance diff (wait TF duration + 3s, compare before/after) — NOT MutationObserver (was unreliable)
3. **Free plan**: 10 trades by device fingerprint hash (UA + lang + screen + cores). Fingerprint also linked to userId when user logs in.
4. **Prisma**: Pinned to 5.22.0 exact. Startup migration block removed — tables exist, no migration needed on deploy.
5. **Timeframe panel**: Single `<a>` toggle inside `.block--expiration-inputs`. Check for `.dops__timeframes-item` first; click toggle once (or twice if wrong panel) to reach grid.
6. **Extension reload required** after every git push: chrome://extensions → ⟳ → refresh PO page
7. **No H4 timeframe in extension**: Removed from dropdown and backend validation. S15/S30 added.
8. **Martingale multiplier**: Min 2.0× in extension UI (removed 1.2–1.8 options). Backend still validates ≥ 1.2 (cosmetic mismatch).
9. **Settings sync**: Extension uses POST (apiPost) to /api/settings. Backend accepts POST + PUT (both call settingsUpsert).
10. **Trade amount input**: Uses React's native input value setter + input/change events (required for React-controlled inputs on PO).

---

## Reload Reminder
After EVERY git push:
1. chrome://extensions → find Avalisa Bot → click ⟳
2. Refresh the PO tab
3. DevTools → Console → filter [Avalisa] to see live logs
