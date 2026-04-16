# Avalisa PO Bot v2 — Project Memory
Last updated: 2026-04-16

---

## Live URLs
| Service | URL |
|---------|-----|
| Backend (Render) | https://avalisa-backend.onrender.com |
| Dashboard (Vercel) | https://avalisabot.vercel.app |
| GitHub | https://github.com/AvailsaPOBot/avalisa-po-bot-v2 |
| CWS Listing | https://chromewebstore.google.com/detail/avalisa-po-bot/mkcpdbnlofljijfjiglkodddicpgdapa |
| Supabase project | gkhoqpthqfgkcyeorcgc |
| Affiliate link | https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50 |

---

## Stack
| Layer | Tech |
|-------|------|
| Extension | Chrome MV3, content.js — injected into pocketoption.com + po.cash |
| Backend | Node.js + Express + Prisma **v5.22.0 PINNED** |
| Dashboard | React CRA + Tailwind CSS, Vercel |
| DB | PostgreSQL on Supabase — port **6543** + `?pgbouncer=true` ALWAYS |
| AI | Gemini `gemini-2.5-flash` via direct REST fetch (NO SDK) |
| Payments | **Whop** (replaced Lemon Squeezy — LS rejected Apr 2026) |
| Email | Resend (`RESEND_API_KEY` set on Render — forgot-password not wired yet) |

PWA was built but **SCRAPPED** (commit 8c025e0, 2026-04-10) — PO validates session IP vs WebSocket IP.

---

## Database Schema

### User
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| email | String unique | |
| passwordHash | String | bcrypt |
| poUserId | String unique nullable | PO account UID |
| isAdmin | Boolean default false | oil4121@gmail.com = true |
| createdAt | DateTime | |

### License (1:1 with User)
| Column | Type | Notes |
|--------|------|-------|
| plan | Enum free/basic/lifetime | |
| tradesUsed | Int default 0 | |
| tradesLimit | Int nullable | null = unlimited |
| whopOrderId | String nullable | from Whop webhook |
| claimStatus | Text default 'none' | none/pending/approved/rejected |
| claimNote | Text nullable | admin rejection note |
| claimedPoUid | Text nullable | PO UID submitted for affiliate claim |

### Trade
| Column | Type | Notes |
|--------|------|-------|
| pair | String | e.g. EUR/USD |
| direction | String | call/put |
| amount | Float | |
| result | String | win/loss/pending |
| balanceBefore | Float | |
| balanceAfter | Float | |
| createdAt | DateTime | |
| ⚠️ isDemo | MISSING | Planned — `ALTER TABLE "Trade" ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;` |

### Settings (1:1 with User)
strategy, timeframe, direction, martingaleMultiplier, martingaleSteps, delaySeconds, startAmount

### DeviceFingerprint
fingerprint, freeTradesUsed — free tier = 10 trades per device fingerprint

---

## Backend Routes

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| POST | /api/auth/register | None | |
| POST | /api/auth/login | None | Returns JWT |
| GET | /api/auth/me | JWT | |
| POST | /api/auth/forgot-password | None | ⚠️ success response only — email not wired yet |
| GET | /api/license/check | JWT | Returns plan + tradesUsed + limits |
| POST | /api/license/increment | JWT | +1 trade, enforces limit |
| GET | /api/license/status | JWT | |
| POST | /api/license/claim | JWT | Submit PO UID for affiliate claim |
| GET | /api/license/claim/status | JWT | Returns claimStatus + claimNote |
| POST | /api/trades/log | JWT | Log a trade |
| GET | /api/trades/history | JWT | Returns user's trades |
| GET | /api/settings | JWT | |
| PUT | /api/settings | JWT | |
| POST | /api/support/chat | JWT | Gemini AI — rate limited 10/min |
| POST | /api/webhooks/whop | None (HMAC) | `webhook-signature` header, HMAC-SHA256 over `webhook-id.webhook-timestamp.body` |
| POST | /api/admin/grant-access | JWT+isAdmin | |
| GET | /api/admin/users | JWT+isAdmin | |
| PUT | /api/admin/users/:id | JWT+isAdmin | |
| DELETE | /api/admin/users/:id | JWT+isAdmin | |

---

## Extension Architecture (content.js)

### Key Mechanics
- **Trade open detection:** `waitForBalanceDrop(balanceBefore, amount, 8000)` — polls until balance drops ≥0.5× amount (PO deducts stake immediately)
- **Trade result:** wait `expiryMs + 3000ms`, compare `balanceAfter` vs `balanceDuringTrade` — rise = win, flat = loss
- **Amount selector:** `.block--bet-amount .value__val input` (primary) — React input: focus→select→execCommand('insertText')→blur; fallback: native setter + synthetic events
- **Anti-double-trade:** `state.cycleGeneration` counter — stale cycles self-terminate on mismatch
- **Demo logging:** trades only logged if `state.jwt` is set — no explicit demo/real check
- **Timeframe:** `setTimeframe(tf)` — calls `ensureDurationPanel()` first, then opens dropdown, clicks `.dops__timeframes-item` matching label or HH:MM:SS
- **Panel detection:** `ensureDurationPanel()` — checks `.block--expiration-inputs` for "UTC" text; clicks toggle to switch to duration panel
- **Expiry read:** `getExpiryMs()` — reads HH:MM:SS from `.block--expiration-inputs`, returns ms (default 60000)
- **Claim on load:** `checkClaimStatus()` called on overlay inject if JWT present

### Balance Selectors (getBalance() fallback chain)
`.js-balance-demo`, `.js-balance-real`, `.js-hd.js-balance-demo`, `.js-hd.js-balance-real`, `[class*="balance-demo"]`, `[class*="balance-real"]`, `.balance__value`, `.header-balance` — returns first where val > 0

### Timeframes
S30, M1 (default), M3, M5, M30, H1 — S15 REMOVED (burns money)

### Panel Toggle
`{ type: 'TOGGLE_PANEL' }` — popup → content.js

### License Storage
`chrome.storage.local` key: `licenseInfo`

### Extension Versions
| Version | Status | Permissions |
|---------|--------|-------------|
| 2.0.3 | ⏳ Pending CWS approval | storage only |
| 2.0.2 | ✅ Live on CWS | storage only |

CWS ID: `mkcpdbnlofljijfjiglkodddicpgdapa`
CWS listing language: "trading assistant" / "strategy tool" — NEVER "bot" or "automated trading"

---

## Payments — Whop
- Basic: $50, 100 trades | Lifetime: $100, unlimited
- Webhook: `POST /api/webhooks/whop`
- Signature: `webhook-signature` header, HMAC-SHA256 over `webhook-id.webhook-timestamp.body`
- Env vars on Render: `WHOP_WEBHOOK_SECRET`, `WHOP_API_KEY`
- ⚠️ Whop test webhooks don't send signature header (known bug) — real purchases work fine

---

## Render Environment Variables Required
- `DATABASE_URL` (Supabase pooler, port 6543, `?pgbouncer=true`)
- `DIRECT_URL` (same as DATABASE_URL or direct)
- `JWT_SECRET`
- `GOOGLE_AI_API_KEY`
- `FRONTEND_URL` (https://avalisabot.vercel.app)
- `WHOP_WEBHOOK_SECRET`
- `WHOP_API_KEY`
- `RESEND_API_KEY` (set — forgot-password email not wired yet)

---

## Critical Rules (never violate)
1. **Port 6543 + pgbouncer=true** — Supabase blocks 5432 from Render, always
2. **Never run `prisma migrate` from Render** — all schema changes via Supabase SQL Editor
3. **Prisma pinned at v5.22.0** — both `prisma` and `@prisma/client`, never upgrade
4. **Gemini via REST fetch only** — no SDK, SDK caused deploy failures
5. **Never touch Martingale trading logic** without CEO (Oil) approval
6. **React CRA not Vite** — env vars must use `REACT_APP_*` prefix
7. **node PATH fix on MBA:** `export PATH="$PATH:/opt/homebrew/bin"`

---

## Admin Access
- `oil4121@gmail.com` → `isAdmin=true` in DB
- If DB reset: `UPDATE "User" SET "isAdmin" = true WHERE email = 'oil4121@gmail.com';`

---

## Admin Dashboard — Current Columns (2026-04-16)
Email | Plan | Trades (X/limit, red when maxed) | Balance (real only, post-2026-04-15) | M / AI (win rates stacked) | User AI (All% / Now% since uaiResetAt) | Joined | Trades / Edit

- AI prompt card in Settings tab always visible (admin = editable, users = grayed out, v2.3 label)
- Stats: isDemo=false AND createdAt >= 2026-04-15 only
- Trade history modal: Trades button → last 50 real trades per user
- Admin AI Settings: token budget + timeframe win rate table
- Token Usage: per-user token consumption + Reset All

## DB State (2026-04-16)
- All migrations applied — see vault 212-status.md for full list
- uaiResetAt TIMESTAMPTZ added to Settings (nullable — for v2.3 User AI prompt reset tracking)
- 68 legacy customer UIDs in AffiliateReferral (auto-grant lifetime on claim)
- Old trades before 2026-04-15 deleted (pre-isDemo era cleanup)
- Latest commit: 6f63fb1

## Next: v2.3
Extension chatbot with BYOK (user's own API key, stored in chrome.storage only — never in DB).
Fed with backend context (plan, stats, settings). Seed: martingale guidance text.
Issue reporting: avalisapobot@gmail.com. Spec: vault 214-research/2143-v2.3-spec.md.
Also: "Prompt" button in admin table to view each user's strategy text.

## Known Issues / Pending Work
- CWS v2.2.0 approval pending (submitted 2026-04-15, ETA 1–7 days)
- Whop live payment: test real purchase end-to-end when ready
- Render free tier: ~30sec cold start after 15min inactivity
- Vercel CI strict ESLint — no unused vars allowed or build fails

---

## Reload Reminder
After EVERY git push:
1. chrome://extensions → find Avalisa Bot → click ⟳
2. Refresh the PO tab
3. DevTools → Console → filter `[Avalisa]` to see live logs
