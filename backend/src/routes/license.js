const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();

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
        return res.json({
          allowed: true,
          plan: 'lifetime',
          tradesRemaining: null,
          aiTradesAllowance: license.aiTradesAllowance,
          aiTradesUsed: license.aiTradesUsed,
        });
      }

      if (license.plan === 'basic') {
        const remaining = (license.tradesLimit || 100) - license.tradesUsed;
        return res.json({
          allowed: remaining > 0,
          plan: 'basic',
          tradesRemaining: remaining,
          tradesUsed: license.tradesUsed,
          tradesLimit: license.tradesLimit,
          aiTradesAllowance: license.aiTradesAllowance,
          aiTradesUsed: license.aiTradesUsed,
        });
      }

      // Unknown plan stored on License row — fail loud instead of silently capping at free tier
      console.error('[License] Unknown plan for userId:', userId, 'plan:', license.plan);
      return res.status(500).json({ error: 'Invalid license plan', plan: license.plan });
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

// POST /api/license/claim — submit affiliate claim for free access
router.post('/claim', authMiddleware, async (req, res) => {
  const { poUid } = req.body;
  if (!poUid || !String(poUid).trim()) {
    return res.status(400).json({ error: 'poUid is required' });
  }
  const uid = String(poUid).trim();

  try {
    const license = await prisma.license.findUnique({ where: { userId: req.userId } });
    if (!license) return res.status(404).json({ error: 'No license found' });

    if (license.plan !== 'free') {
      return res.status(400).json({ error: 'You already have an active plan.' });
    }
    if (license.claimStatus === 'pending') {
      return res.status(400).json({ error: 'Your claim is already under review. Please wait.' });
    }
    if (license.claimStatus === 'approved') {
      return res.status(400).json({ error: 'Your claim has already been approved.' });
    }
    // 'rejected' falls through — resubmission allowed

    // Check if UID is already linked to another user account
    const uidLinkedUser = await prisma.user.findUnique({ where: { poUserId: uid } });
    if (uidLinkedUser && uidLinkedUser.id !== req.userId) {
      return res.status(400).json({ error: 'This PO UID is already linked to another account.' });
    }

    // Check if UID already claimed by another license (pending or approved)
    const uidClaimed = await prisma.license.findFirst({
      where: {
        claimedPoUid: uid,
        claimStatus: { in: ['pending', 'approved'] },
        NOT: { userId: req.userId },
      },
    });
    if (uidClaimed) {
      return res.status(400).json({ error: 'This PO UID has already been claimed by another account.' });
    }

    // Check AffiliateReferral — auto-approve if UID was already registered via our link
    const referral = await prisma.affiliateReferral.findUnique({ where: { poUid: uid } });
    if (referral) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { poUserId: uid },
      });
      await prisma.license.update({
        where: { userId: req.userId },
        data: {
          plan: 'lifetime',
          tradesLimit: null,
          claimStatus: 'approved',
          claimedPoUid: uid,
          claimNote: null,
        },
      });
      return res.json({ status: 'approved', message: 'Lifetime access granted!' });
    }

    // Not in AffiliateReferral — queue for manual review
    await prisma.license.update({
      where: { userId: req.userId },
      data: { claimStatus: 'pending', claimedPoUid: uid, claimNote: null },
    });

    res.json({ message: 'Claim submitted. We will review and notify you within 24 hours.' });
  } catch (err) {
    console.error('Claim error:', err);
    res.status(500).json({ error: 'Failed to submit claim' });
  }
});

// GET /api/license/claim/status — get current claim status
router.get('/claim/status', authMiddleware, async (req, res) => {
  try {
    const license = await prisma.license.findUnique({ where: { userId: req.userId } });
    if (!license) return res.status(404).json({ error: 'No license found' });
    res.json({
      claimStatus: license.claimStatus,
      claimNote: license.claimNote,
      claimedPoUid: license.claimedPoUid,
      plan: license.plan,
      tradesUsed: license.tradesUsed,
      tradesLimit: license.tradesLimit,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch claim status' });
  }
});

module.exports = router;
