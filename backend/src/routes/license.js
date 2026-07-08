const express = require('express');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { PLAN_IDS, getPlanEntitlements, getAiTradesAllowanceForPlan } = require('../lib/plans');
const {
  PRICING_URL,
  getClaimRejectionMessage,
  getRegisterUrl,
  normalizeClaimRejectionReason,
} = require('../lib/claimGuidance');

const router = express.Router();

const FREE_TRADE_LIMIT = getPlanEntitlements(PLAN_IDS.DEMO).tradesLimit;

// POST /api/license/check
// Called by extension before each trade session
router.post('/check', optionalAuthMiddleware, async (req, res) => {
  // userId comes from the verified JWT (optionalAuthMiddleware), NOT the body —
  // otherwise anyone could read another user's license by passing their id.
  const userId = req.userId || null;
  const { deviceFingerprint } = req.body;
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

      const entitlements = getPlanEntitlements(license.plan);
      if (!entitlements) {
        console.error('[License] Unknown plan for userId:', userId, 'plan:', license.plan);
        return res.status(500).json({ error: 'Invalid license plan', plan: license.plan });
      }

      if (license.plan === PLAN_IDS.PRO) {
        return res.json({
          allowed: true,
          plan: PLAN_IDS.PRO,
          tradesRemaining: null,
          aiTradesAllowance: getAiTradesAllowanceForPlan(license.plan),
          aiTradesUsed: license.aiTradesUsed,
        });
      }

      if (entitlements.tradesLimit == null) {
        return res.json({
          allowed: true,
          plan: license.plan,
          tradesRemaining: null,
          tradesUsed: license.tradesUsed,
          tradesLimit: entitlements.tradesLimit,
          aiTradesAllowance: getAiTradesAllowanceForPlan(license.plan),
          aiTradesUsed: license.aiTradesUsed,
        });
      }

      const remaining = entitlements.tradesLimit - license.tradesUsed;
      return res.json({
        allowed: remaining > 0,
        plan: license.plan,
        tradesRemaining: remaining,
        tradesUsed: license.tradesUsed,
        tradesLimit: entitlements.tradesLimit,
        aiTradesAllowance: getAiTradesAllowanceForPlan(license.plan),
        aiTradesUsed: license.aiTradesUsed,
      });
    }

    // Demo plan — track by device fingerprint when no logged-in license is present.
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
      plan: PLAN_IDS.DEMO,
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
router.post('/increment', optionalAuthMiddleware, async (req, res) => {
  // userId from the verified JWT only — stops anyone burning another user's
  // trade count by passing their id in the body.
  const userId = req.userId || null;
  const { deviceFingerprint } = req.body;

  try {
    if (userId) {
      const license = await prisma.license.findUnique({ where: { userId } });
      if (license && license.plan !== PLAN_IDS.PRO) {
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

// POST /api/license/claim — submit affiliate claim for Pro access
router.post('/claim', authMiddleware, async (req, res) => {
  const { poUid } = req.body;
  if (!poUid || !String(poUid).trim()) {
    return res.status(400).json({ error: 'poUid is required' });
  }
  const uid = String(poUid).trim();

  try {
    const license = await prisma.license.findUnique({ where: { userId: req.userId } });
    if (!license) return res.status(404).json({ error: 'No license found' });

    const user = await prisma.user.findUnique({ where: { id: req.userId } });

    // ── 1:1 enforcement — a PO UID belongs to exactly one account ──
    const uidLinkedUser = await prisma.user.findUnique({ where: { poUserId: uid } });
    if (uidLinkedUser && uidLinkedUser.id !== req.userId) {
      return res.status(400).json({ error: 'This PO UID is already linked to another account.' });
    }
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

    // A PO UID is locked to an account once set — only an admin can change it.
    if (user?.poUserId && user.poUserId !== uid) {
      return res.status(400).json({ error: `Your account is already linked to PO UID ${user.poUserId}. Email support to change it.` });
    }

    // Paid accounts (already bought a plan): just bind their PO UID — access is
    // already active, so no review needed. This is the "I paid, now connect my UID" path.
    if (license.plan !== PLAN_IDS.DEMO) {
      if (user?.poUserId === uid) {
        return res.json({ status: 'approved', message: `Your PO UID is already linked to your ${license.plan} plan.` });
      }
      await prisma.user.update({ where: { id: req.userId }, data: { poUserId: uid } });
      await prisma.license.update({ where: { userId: req.userId }, data: { claimedPoUid: uid } });
      return res.json({ status: 'approved', message: "PO UID linked to your account. You're all set." });
    }

    // ── Below: DEMO users claiming free Pro via the affiliate link ──
    if (license.claimStatus === 'pending') {
      return res.status(400).json({ error: 'Your claim is already under review. Please wait.' });
    }
    if (license.claimStatus === 'approved') {
      return res.status(400).json({ error: 'Your claim has already been approved.' });
    }
    // 'rejected' falls through — resubmission allowed

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
          plan: PLAN_IDS.PRO,
          tradesLimit: getPlanEntitlements(PLAN_IDS.PRO).tradesLimit,
          claimStatus: 'approved',
          claimedPoUid: uid,
          claimNote: null,
        },
      });
      return res.json({ status: 'approved', message: 'Pro access granted!' });
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
    const isRejected = license.claimStatus === 'rejected';
    const claimReason = isRejected ? normalizeClaimRejectionReason(license.claimNote) : license.claimNote;
    const registerUrl = isRejected ? await getRegisterUrl(prisma) : undefined;
    res.json({
      claimStatus: license.claimStatus,
      claimNote: claimReason,
      claimMessage: isRejected ? getClaimRejectionMessage(claimReason) : null,
      registerUrl,
      pricingUrl: isRejected ? PRICING_URL : undefined,
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
