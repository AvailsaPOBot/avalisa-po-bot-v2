# Avalisa PO Bot v2

A Chrome extension trading strategy tool + web dashboard + backend for Pocket Option binary options.

---

## Project Structure

```
AvalisaPOBot V2/
├── backend/          Node.js + Express + Prisma API
├── extension/        Chrome Extension (Manifest V3)
├── dashboard/        React + Tailwind web dashboard
└── README.md
```

---

## Phase 1 — Backend Setup

### Prerequisites
- Node.js 18+
- PostgreSQL database (Railway.app recommended)

### Steps

```bash
cd backend
cp .env.example .env
# Fill in all env variables (see below)
npm install
npm run db:push        # Push schema to DB (dev)
# OR
npm run db:migrate     # Run migrations (production)
npm start
```

### Environment Variables (backend/.env)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (Railway provides this) |
| `JWT_SECRET` | ✅ | Random 64-char string for signing JWTs |
| `GOOGLE_AI_API_KEY` | ✅ | Free Gemini API key — get at https://aistudio.google.com |
| `LEMONSQUEEZY_API_KEY` | ✅ | From your Lemon Squeezy dashboard |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | ✅ | From LS webhook settings |
| `LEMONSQUEEZY_STORE_ID` | ✅ | Your LS store ID |
| `LEMONSQUEEZY_VARIANT_ID_BASIC` | ✅ | Variant ID for the $50 product |
| `LEMONSQUEEZY_VARIANT_ID_LIFETIME` | ✅ | Variant ID for the $100 product |
| `ANTHROPIC_API_KEY` | ⬜ | Optional — upgrades AI support chat to Claude |
| `PORT` | ⬜ | Default 3001 |
| `FRONTEND_URL` | ⬜ | Dashboard URL for CORS (e.g. https://your-dashboard.com) |

### Deploy to Railway

1. Create a new Railway project
2. Add a PostgreSQL plugin → copy `DATABASE_URL`
3. Connect your GitHub repo OR push code manually
4. Set all env variables in Railway dashboard
5. Railway auto-runs: `npm run db:migrate && npm start`

---

## Phase 2 — Chrome Extension Setup

### Before publishing
1. Open `extension/content.js`
2. Replace `API_BASE` with your Railway backend URL
3. Replace `DASHBOARD_URL` with your deployed dashboard URL

### Load unpacked (for testing)
1. Open Chrome → `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked** → select the `extension/` folder

### Package for Chrome Web Store
```bash
cd extension
zip -r ../avalisa-extension.zip . --exclude "*.DS_Store"
```

### Icons
Place your icons in `extension/icons/`:
- `icon16.png` — 16×16
- `icon32.png` — 32×32
- `icon48.png` — 48×48
- `icon128.png` — 128×128

### Chrome Web Store listing notes
- **NEVER** use "bot" or "automated trading" in the listing
- Use: "trading assistant", "strategy tool", "trading helper"

---

## Phase 3 — Dashboard Setup

### Local development

```bash
cd dashboard
cp .env.example .env
# Set REACT_APP_API_URL to your backend URL
npm install
npm start
```

### Build for production

```bash
cd dashboard
npm run build
# Deploy the build/ folder to Netlify, Vercel, or Railway Static
```

### Environment Variables (dashboard/.env)

| Variable | Description |
|----------|-------------|
| `REACT_APP_API_URL` | Backend URL (e.g. https://your-backend.railway.app) |
| `REACT_APP_LS_BASIC_URL` | Lemon Squeezy checkout URL for $50 plan |
| `REACT_APP_LS_LIFETIME_URL` | Lemon Squeezy checkout URL for $100 plan |

---

## Lemon Squeezy Webhook Setup

1. In your LS dashboard → Settings → Webhooks
2. Add URL: `https://your-backend.railway.app/api/webhooks/lemonsqueezy`
3. Select event: `order_created`
4. Copy the signing secret → set as `LEMONSQUEEZY_WEBHOOK_SECRET`

---

## Monetization Flow

| Plan | Price | Access |
|------|-------|--------|
| Free | $0 | 10 trades (device-limited), Martingale only — requires new PO account via affiliate link |
| Basic | $50 one-time | 100 trades, max $2 start, all strategies |
| Lifetime | $100 one-time | Unlimited trades, unlimited amount, all strategies |

**Affiliate link:** https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50

---

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | — | Register |
| POST | /api/auth/login | — | Login, returns JWT |
| GET | /api/auth/me | JWT | Get current user |
| POST | /api/license/check | — | Check trade allowance |
| POST | /api/license/increment | — | Increment trade count |
| GET | /api/license/status | JWT | Get license details |
| POST | /api/trades/log | JWT | Log a trade |
| GET | /api/trades/history | JWT | Trade history + stats |
| GET | /api/settings | JWT | Get settings |
| PUT | /api/settings | JWT | Update settings |
| POST | /api/support/chat | — | AI support chat |
| POST | /api/webhooks/lemonsqueezy | HMAC | Payment webhook |

---

## Risk Disclaimer

Binary options trading involves significant financial risk. This tool does not guarantee profits. Always trade responsibly with funds you can afford to lose.
