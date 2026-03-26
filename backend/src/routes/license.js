const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

const FREE_TRADE_LIMIT = 10;

// POST /api/license/check
// Called by extension before each trade session
router.post('/check', async (req, res) => {
  const { userId, deviceFingerprint } = req.body;
  if (!deviceFingerprint) {
    return res.status(400).json({ error: 'deviceFingerprint is required' });
  }

  try {
    // If user is authenticated, check their license
    if (userId) {
      const license = await prisma.license.findUnique({ where: { userId } });
      if (!license) {
        return res.json({ allowed: false, reason: 'No license found' });
      }

      if (license.plan === 'lifetime') {
        return res.json({ allowed: true, plan: 'lifetime', tradesRemaining: null });
      }

      if (license.plan === 'basic') {
        const remaining = (license.tradesLimit || 100) - license.tradesUsed;
        return res.json({
          allowed: remaining > 0,
          plan: 'basic',
          tradesRemaining: remaining,
          tradesUsed: license.tradesUsed,
          tradesLimit: license.tradesLimit,
        });
      }
    }

    // Free plan — track by device fingerprint
    let fp = await prisma.deviceFingerprint.findUnique({ where: { fingerprint: deviceFingerprint } });

    if (!fp) {
      fp = await prisma.deviceFingerprint.create({
        data: { fingerprint: deviceFingerprint, userId: userId || null, freeTradesUsed: 0 },
      });
    } else if (userId && !fp.userId) {
      // Link fingerprint to user if not already linked
      fp = await prisma.deviceFingerprint.update({
        where: { fingerprint: deviceFingerprint },
        data: { userId },
      });
    }

    const remaining = FREE_TRADE_LIMIT - fp.freeTradesUsed;
    return res.json({
      allowed: remaining > 0,
      plan: 'free',
      tradesRemaining: remaining,
      tradesUsed: fp.freeTradesUsed,
      tradesLimit: FREE_TRADE_LIMIT,
    });
  } catch (err) {
    console.error('License check error:', err);
    res.status(500).json({ error: 'License check failed' });
  }
});

// POST /api/license/increment — increment trade count after each trade
router.post('/increment', async (req, res) => {
  const { userId, deviceFingerprint } = req.body;

  try {
    if (userId) {
      const license = await prisma.license.findUnique({ where: { userId } });
      if (license && license.plan !== 'lifetime') {
        await prisma.license.update({
          where: { userId },
          data: { tradesUsed: { increment: 1 } },
        });
      }
    }

    if (deviceFingerprint) {
      await prisma.deviceFingerprint.upsert({
        where: { fingerprint: deviceFingerprint },
        update: { freeTradesUsed: { increment: 1 } },
        create: { fingerprint: deviceFingerprint, userId: userId || null, freeTradesUsed: 1 },
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('License increment error:', err);
    res.status(500).json({ error: 'Failed to increment trade count' });
  }
});

// POST /api/license/activate — called by Lemon Squeezy webhook after payment
router.post('/activate', async (req, res) => {
  const { userId, plan, orderId, tradesLimit } = req.body;
  if (!userId || !plan) {
    return res.status(400).json({ error: 'userId and plan are required' });
  }

  try {
    const license = await prisma.license.upsert({
      where: { userId },
      update: {
        plan,
        tradesUsed: 0,
        tradesLimit: tradesLimit || (plan === 'basic' ? 100 : null),
        lemonsqueezyOrderId: orderId || null,
        expiresAt: null,
      },
      create: {
        userId,
        plan,
        tradesUsed: 0,
        tradesLimit: tradesLimit || (plan === 'basic' ? 100 : null),
        lemonsqueezyOrderId: orderId || null,
      },
    });
    res.json({ success: true, license });
  } catch (err) {
    console.error('Activate error:', err);
    res.status(500).json({ error: 'Failed to activate license' });
  }
});

// GET /api/license/status — for authenticated users
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const license = await prisma.license.findUnique({ where: { userId: req.userId } });
    if (!license) return res.status(404).json({ error: 'No license found' });
    res.json(license);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch license' });
  }
});

module.exports = router;
