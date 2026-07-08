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

app.use('/api', generalLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/support/chat', chatLimiter);

// Webhook route BEFORE express.json() — needs raw body for HMAC verification
app.use('/api/webhooks', webhookRoutes);

// JSON body parser for all other routes
app.use(express.json({ limit: '1mb' }));

// Health check — reflects real DB status so Render (and we) can see degradation, not a fake 'ok'
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'up', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'down', timestamp: new Date().toISOString() });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/license', licenseRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);
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

startServer();
