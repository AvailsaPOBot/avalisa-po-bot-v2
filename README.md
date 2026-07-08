# Avalisa PO Bot v2

A Chrome extension trading strategy tool, web dashboard, and backend for Pocket Option binary options.

## Project Structure

```text
AvalisaPOBot V2/
├── backend/          Node.js + Express + Prisma API
├── extension/        Chrome Extension (Manifest V3)
├── dashboard/        React + Tailwind web dashboard
└── README.md
```

## Backend

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Render account for production deploy
- Whop product and webhook secret for paid plan activation
- Optional PayPal REST app for the second payment funnel

### Local Setup

```bash
cd backend
cp .env.example .env
npm install
npm run db:push
npm start
```

For production migrations, use:

```bash
npm run db:migrate
```

### Supabase Security

Avalisa uses Supabase as Postgres only. The extension and dashboard should call
the backend API, not Supabase Data API endpoints such as `supabase-js`,
`/rest/v1`, or `/graphql/v1`.

After creating Prisma tables in Supabase, run:

```bash
psql "$DIRECT_URL" -f backend/prisma/supabase-data-api-hardening.sql
```

Or paste `backend/prisma/supabase-data-api-hardening.sql` into the Supabase SQL
Editor. This revokes Data API grants from `anon`, `authenticated`, and
`service_role`, disables future automatic grants, and enables RLS on public
tables as defense in depth. If a future feature intentionally uses the Supabase
Data API, add the minimum explicit `GRANT` plus matching RLS policies in the
same change.

### Backend Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL pooled connection string |
| `DIRECT_URL` | Yes | Direct PostgreSQL connection string for Prisma |
| `JWT_SECRET` | Yes | Random 64-character string for signing JWTs |
| `GOOGLE_AI_API_KEY` | Yes | Gemini API key from Google AI Studio |
| `WHOP_WEBHOOK_SECRET` | Yes | Whop webhook signing secret |
| `WHOP_PLAN_ID_BASIC` | Yes | Whop plan ID for the $69 Basic plan |
| `WHOP_PLAN_ID_PRO` | Yes | Whop plan ID for the $119 Pro plan |
| `PAYPAL_ENV` | No | `sandbox` for testing, otherwise live PayPal API |
| `PAYPAL_CLIENT_ID` | No | PayPal REST app client ID for the optional PayPal funnel |
| `PAYPAL_CLIENT_SECRET` | No | PayPal REST app secret |
| `PAYPAL_WEBHOOK_ID` | No | PayPal webhook ID for `/api/webhooks/paypal` verification |
| `PAYPAL_CURRENCY` | No | PayPal order currency, defaults to `USD` |
| `ANTHROPIC_API_KEY` | No | Optional; upgrades support chat to Claude |
| `PORT` | No | Defaults to `3001` locally |
| `FRONTEND_URL` | Yes | Dashboard URL for CORS, usually `https://avalisabot.vercel.app` |
| `PUBLIC_BACKEND_URL` | Yes | Public backend URL, usually `https://avalisa-backend.onrender.com` |
| `GOOGLE_OAUTH_CLIENT_ID` | No | Google OAuth client ID for social sign in |
| `GOOGLE_OAUTH_CLIENT_SECRET` | No | Google OAuth client secret |
| `FACEBOOK_OAUTH_CLIENT_ID` | No | Facebook app ID for social sign in |
| `FACEBOOK_OAUTH_CLIENT_SECRET` | No | Facebook app secret |

### Social Login Callback URLs

Configure these redirect/callback URLs in Google and Facebook:

```text
https://avalisa-backend.onrender.com/api/auth/oauth/google/callback
https://avalisa-backend.onrender.com/api/auth/oauth/facebook/callback
```

### Whop Webhook

Create a Whop company webhook with API version `v1`:

```text
https://avalisa-backend.onrender.com/api/webhooks/whop
```

Subscribe to the paid activation events used by Whop checkout, especially `membership.activated` and `payment.succeeded`. The backend verifies Whop's signed webhook headers before activating a license.

### PayPal Funnel

PayPal is an optional second payment route. Keep Whop configured; add PayPal only
after the PayPal account is approved for the product category and bank withdrawal
documents are accepted.

Create a PayPal REST app and configure:

```text
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_WEBHOOK_ID=...
PAYPAL_CURRENCY=USD
```

Webhook URL:

```text
https://avalisa-backend.onrender.com/api/webhooks/paypal
```

Subscribe to `PAYMENT.CAPTURE.COMPLETED`. The dashboard creates PayPal Orders for
logged-in users, captures them after PayPal redirects back to `/pricing`, and
updates the same license record used by the extension and Webapp Bot.

## Chrome Extension

The extension uses the production backend and dashboard URLs by default:

```text
https://avalisa-backend.onrender.com
https://avalisabot.vercel.app
```

### Load Unpacked

1. Open Chrome at `chrome://extensions`.
2. Enable Developer Mode.
3. Click Load unpacked and select the `extension/` folder.

### Package

Use the project packaging script so the zip root contains `manifest.json`:

```bash
./pack-extension.sh
```

Approved Chrome Web Store listing:

```text
https://chromewebstore.google.com/detail/avalisa-po-bot/mkcpdbnlofljijfjiglkodddicpgdapa
```

## Dashboard

### Local Development

```bash
cd dashboard
cp .env.example .env
npm install
npm start
```

### Production Build

```bash
cd dashboard
npm run build
```

The dashboard deploys to Vercel at:

```text
https://avalisabot.vercel.app
```

### Dashboard Environment Variables

| Variable | Description |
|----------|-------------|
| `REACT_APP_API_URL` | Backend URL, usually `https://avalisa-backend.onrender.com` |
| `REACT_APP_WHOP_BASIC_URL` | Whop checkout URL for the $69 Basic plan |
| `REACT_APP_WHOP_PRO_URL` | Whop checkout URL for the $119 Pro plan |
| `REACT_APP_CHROME_STORE_URL` | Chrome Web Store listing URL |

## Monetization Flow

| Plan | Price | Access |
|------|-------|--------|
| Demo | $0 | 10 trades, Martingale only, no starting amount cap |
| Basic | $69 one-time | Unlimited Martingale trades, no starting amount cap |
| Pro | $119 one-time | Unlimited Martingale and Avalisa AI trades, no starting amount cap |

Whop remains the primary checkout path. PayPal appears as a second checkout path
when backend PayPal credentials are configured. New users who register under the
affiliate link receive Pro access after Pocket Option account confirmation.

Affiliate link:

```text
https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50
```

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/register` | No | Register |
| `POST` | `/api/auth/login` | No | Login, returns JWT |
| `GET` | `/api/auth/me` | JWT | Get current user |
| `GET` | `/api/auth/oauth/google` | No | Start Google OAuth |
| `GET` | `/api/auth/oauth/facebook` | No | Start Facebook OAuth |
| `POST` | `/api/license/check` | No | Check trade allowance |
| `POST` | `/api/license/increment` | No | Increment trade count |
| `GET` | `/api/license/status` | JWT | Get license details |
| `POST` | `/api/trades/log` | JWT | Log a trade |
| `GET` | `/api/trades/history` | JWT | Trade history and stats |
| `GET` | `/api/settings` | JWT | Get settings |
| `PUT` | `/api/settings` | JWT | Update settings |
| `POST` | `/api/support/chat` | JWT | AI support chat |
| `GET` | `/api/payments/paypal/status` | No | Check whether PayPal funnel is configured |
| `POST` | `/api/payments/paypal/orders` | JWT | Create PayPal checkout order |
| `POST` | `/api/payments/paypal/orders/:orderId/capture` | JWT | Capture PayPal order and activate license |
| `POST` | `/api/webhooks/whop` | HMAC | Whop payment webhook |
| `POST` | `/api/webhooks/paypal` | PayPal signature | PayPal payment webhook |

## Risk Disclaimer

Binary options trading involves significant financial risk. Avalisa does not guarantee profits. Always trade responsibly with funds you can afford to lose.
