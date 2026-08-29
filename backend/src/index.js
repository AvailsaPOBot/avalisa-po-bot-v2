require('dotenv').config();

// Catch startup crashes and log them clearly before Render kills the process
process.on('uncaughtException', (err) => {
  console.error('STARTUP CRASH:', err.message);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  // Log but do NOT exit — a single stray rejection shouldn't take the whole API
  // down for every user. Truly unrecoverable uncaughtException still exits above.
  console.error('UNHANDLED REJECTION:', reason);
});

// Fail fast on missing required config (clear message instead of obscure later errors)
const REQUIRED_ENV = ['JWT_SECRET', 'DATABASE_URL', 'WHOP_WEBHOOK_SECRET'];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.error(`FATAL: missing required env var(s): ${missingEnv.join(', ')}. Set them and restart.`);
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const prisma = require('./lib/prisma');

// Security headers (defensive require so the app still boots if `npm install` hasn't run yet)
let helmet = null;
try { helmet = require('helmet'); } catch { console.warn('[startup] helmet not installed — run `npm install` to enable security headers'); }

const authRoutes = require('./routes/auth');
const licenseRoutes = require('./routes/license');
const tradeRoutes = require('./routes/trades');
const settingsRoutes = require('./routes/settings');
const adminRoutes = require('./routes/admin');
const supportRoutes = require('./routes/support');
const funnelRoutes = require('./routes/funnel');
const webhookRoutes = require('./routes/webhooks');
const paymentRoutes = require('./routes/payments');

const app = express();
const PORT = process.env.PORT || 3000;

// Render serves behind a proxy. Trust the first hop so express-rate-limit keys on
// the real client IP (fixes ERR_ERL_UNEXPECTED_X_FORWARDED_FOR) without letting
// clients spoof X-Forwarded-For (which `true` would allow).
app.set('trust proxy', 1);

// Security headers (helmet defaults; safe for a JSON API). No-op if helmet isn't installed yet.
if (helmet) app.use(helmet());

// CORS — allow dashboard + extension
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://avalisabot.vercel.app',
  'https://pocketoption.com',
  'https://po.trade',
  'https://m.po.trade',
  'https://po.cash',
  'https://m.po.cash',
].filter(Boolean).map(o => o.replace(/\/$/, '')); // exact-match; strip any trailing slash

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow non-browser / server-to-server
    if (
      allowedOrigins.includes(origin) ||
      origin.startsWith('chrome-extension://')
    ) {
      return cb(null, true);
    }
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

function rateLimitJsonHandler(req, res) {
  const retryAfter = Math.ceil((req.rateLimit?.resetTime?.getTime() - Date.now()) / 1000);
  res.status(429).json({
    error: 'Too many requests. Please wait a moment and try again.',
    retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  });
}

// Rate limiters
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitJsonHandler,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS' || req.path === '/me',
  handler: rateLimitJsonHandler,
});
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitJsonHandler,
});
const checkoutClickLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitJsonHandler,
});
const pricingViewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitJsonHandler,
});

app.use('/api', generalLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/support/chat', chatLimiter);
app.use('/api/funnel/checkout-click', checkoutClickLimiter);
app.use('/api/funnel/pricing-view', pricingViewLimiter);

// Webhook route BEFORE express.json() — needs raw body for HMAC verification
app.use('/api/webhooks', webhookRoutes);

// JSON body parser for all other routes
app.use(express.json({ limit: '1mb' }));

// Health check — reflects real DB status so Render (and we) can see degradation, not a fake 'ok'
// Which code is actually running. Render sets RENDER_GIT_COMMIT on every deploy;
// resolved once at boot because it cannot change without a restart. Without this,
// "did it deploy?" has no answer that is not a guess - and a guess already produced
// one false positive (any /api/admin/* path 401s, real route or not).
const RUNNING_COMMIT = (process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || '')
  .trim()
  .slice(0, 7) || 'unknown';

// Can our alerts actually leave the building? Support escalations and orphaned-purchase
// alerts both depend on the Brevo transport being configured; if it is not, they no-op
// silently and a paying customer's complaint reaches nobody. Booleans only - never the
// key, never the address.
function alertingReadiness() {
  let email = false;
  try { email = require('./lib/email').emailConfigured(); } catch { email = false; }
  return { email, alertTo: Boolean(process.env.SUPPORT_ALERT_EMAIL) };
}

const FUNNEL_LIVENESS_CACHE_TTL_MS = 60_000;
const FUNNEL_LIVENESS_UNAVAILABLE = { enabled: false, table: 'missing', everRecorded: false };
let funnelLivenessCache = { value: FUNNEL_LIVENESS_UNAVAILABLE, at: 0 };

// Public health may prove the funnel instrumentation is wired without exposing
// commercially sensitive volumes, rates, event types, or timestamps.
async function funnelLiveness() {
  const now = Date.now();
  if (now - funnelLivenessCache.at < FUNNEL_LIVENESS_CACHE_TTL_MS) {
    return funnelLivenessCache.value;
  }

  let value = FUNNEL_LIVENESS_UNAVAILABLE;
  try {
    const [enabled, event] = await Promise.all([
      require('./lib/funnel').funnelEnabled(prisma),
      prisma.funnelEvent.findFirst({ select: { id: true } }),
    ]);
    value = { enabled, table: 'ok', everRecorded: Boolean(event) };
  } catch (err) {
    // A missing analytics table must never make Render treat this service as down.
  }

  funnelLivenessCache = { value, at: now };
  return value;
}

const AFFILIATE_LIVENESS_CACHE_TTL_MS = 60_000;
const AFFILIATE_LIVENESS_UNAVAILABLE = { postbackSecretSet: false, everReferred: false };
let affiliateLivenessCache = { value: AFFILIATE_LIVENESS_UNAVAILABLE, at: 0 };

// Public health proves the affiliate auto-grant path is configured and has
// received at least one referral without exposing the secret or referral volume.
async function affiliateLiveness() {
  const now = Date.now();
  if (now - affiliateLivenessCache.at < AFFILIATE_LIVENESS_CACHE_TTL_MS) {
    return affiliateLivenessCache.value;
  }

  let value = AFFILIATE_LIVENESS_UNAVAILABLE;
  try {
    const referral = await prisma.affiliateReferral.findFirst({ select: { id: true } });
    value = {
      postbackSecretSet: Boolean(process.env.POCKETPARTNERS_SECRET),
      everReferred: Boolean(referral),
    };
  } catch (err) {
    // A missing referral table must never make Render treat this service as down.
  }

  affiliateLivenessCache = { value, at: now };
  return value;
}

app.get('/health', async (req, res) => {
  const [funnel, affiliate] = await Promise.all([funnelLiveness(), affiliateLiveness()]);
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'up', commit: RUNNING_COMMIT, alerting: alertingReadiness(), funnel, affiliate, timestamp: new Date().toISOString() });
  } catch (err) {
    // The commit belongs on the failure path too: a degraded backend is exactly
    // when you need to know which build is live.
    res.status(503).json({ status: 'degraded', db: 'down', commit: RUNNING_COMMIT, alerting: alertingReadiness(), funnel, affiliate, timestamp: new Date().toISOString() });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/license', licenseRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/funnel', funnelRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/webhooks/pocketpartners', require('./routes/pocketpartners'));
app.use('/api/config', require('./routes/config'));
app.use('/api/ai', require('./routes/ai'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server: run migrations, check DB, then bind port
async function startServer() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connected');
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Avalisa PO Bot API running on port ${PORT}`);
    console.log(`   AI provider: ${process.env.ANTHROPIC_API_KEY ? 'Claude' : 'Gemini (Google)'}`);
  });
}

if (require.main === module) startServer();

module.exports = { app };
