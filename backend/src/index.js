require('dotenv').config();

// Catch startup crashes and log them clearly before Render kills the process
process.on('uncaughtException', (err) => {
  console.error('STARTUP CRASH:', err.message);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
  process.exit(1);
});

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const prisma = require('./lib/prisma');

const authRoutes = require('./routes/auth');
const licenseRoutes = require('./routes/license');
const tradeRoutes = require('./routes/trades');
const settingsRoutes = require('./routes/settings');
const adminRoutes = require('./routes/admin');
const supportRoutes = require('./routes/support');
const webhookRoutes = require('./routes/webhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS — allow dashboard + extension
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://avalisabot.vercel.app',
  'https://pocketoption.com',
  'https://po.cash',
  'chrome-extension://', // handled by wildcard below
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow non-browser / server-to-server
    if (
      allowedOrigins.some(o => origin.startsWith(o)) ||
      origin.startsWith('chrome-extension://')
    ) {
      return cb(null, true);
    }
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Rate limiters
const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const chatLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

app.use('/api', generalLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/support/chat', chatLimiter);

// Webhook route BEFORE express.json() — needs raw body for HMAC verification
app.use('/api/webhooks', webhookRoutes);

// JSON body parser for all other routes
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '2.0.0' });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/license', licenseRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);

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
