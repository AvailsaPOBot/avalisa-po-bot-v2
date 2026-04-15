const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

const FALLBACK_AFFILIATE_LINK = 'https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50';

// In-memory cache — 1 hour TTL
let cache = { url: null, expiry: 0 };

// GET /api/config/affiliate-link — no auth, public
router.get('/affiliate-link', async (req, res) => {
  const now = Date.now();
  if (cache.url && now < cache.expiry) {
    return res.json({ url: cache.url });
  }

  try {
    const row = await prisma.appConfig.findUnique({ where: { key: 'affiliate_link' } });
    if (row?.value) {
      cache = { url: row.value, expiry: now + 3600000 };
      return res.json({ url: row.value });
    }
  } catch (err) {
    console.error('[config] affiliate-link DB error:', err.message);
  }

  return res.json({ url: FALLBACK_AFFILIATE_LINK });
});

// GET /api/config/winrates — no auth, public
// Returns flat { S30: 48, M1: 52, ... } resolving manual vs real values
router.get('/winrates', async (req, res) => {
  try {
    const row = await prisma.appConfig.findUnique({ where: { key: 'timeframe_winrates' } });
    if (!row?.value) return res.json({});
    const config = JSON.parse(row.value);
    // For each timeframe resolve the effective win rate
    const result = {};
    for (const [tf, entry] of Object.entries(config)) {
      if (entry.mode === 'manual') {
        result[tf] = entry.manual;
      } else if (entry.mode === 'real' && entry.real !== null) {
        result[tf] = entry.real;
      }
      // if real mode but no real data yet, omit
    }
    return res.json(result);
  } catch (err) {
    console.error('[config] winrates error:', err.message);
    return res.json({});
  }
});

module.exports = router;
