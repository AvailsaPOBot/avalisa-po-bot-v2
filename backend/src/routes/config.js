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

module.exports = router;
