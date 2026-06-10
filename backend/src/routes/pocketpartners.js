const express = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { PLAN_IDS, getPlanEntitlements } = require('../lib/plans');

const router = express.Router();

// Constant-time shared-secret check. PocketPartners must include ?token=<secret>
// in its postback URL. Fail CLOSED: if the secret isn't configured or doesn't
// match, we do nothing (but still return 200 so PocketPartners doesn't retry).
function hasValidToken(req) {
  const secret = process.env.POCKETPARTNERS_SECRET;
  if (!secret) return false;
  const provided = String(req.query.token || '');
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// GET /api/webhooks/pocketpartners?event=Registration&trader_id=12345&token=SECRET
// Called by PocketPartners server — always return 200 (retries on non-200)
router.get('/', async (req, res) => {
  const { event, trader_id } = req.query;

  // This endpoint grants paid (Pro) access, so it must never be open to the
  // public. Reject anything without the shared secret.
  if (!hasValidToken(req)) {
    console.warn('[pocketpartners] Rejected request with missing/invalid token');
    return res.status(200).json({ ok: true });
  }

  if (!trader_id || !String(trader_id).trim()) {
    return res.status(200).json({ ok: true });
  }

  const uid = String(trader_id).trim();

  try {
    // Upsert into AffiliateReferral — track this UID + event
    await prisma.affiliateReferral.upsert({
      where: { poUid: uid },
      update: { event: event || 'unknown' },
      create: { poUid: uid, event: event || 'unknown' },
    });

    if (event === 'Registration') {
      // Check if a user account already has this PO UID linked
      const user = await prisma.user.findUnique({ where: { poUserId: uid } });
      if (user) {
        // Auto-grant Pro access. Stored as `lifetime` internally for compatibility.
        await prisma.license.upsert({
          where: { userId: user.id },
          update: {
            plan: PLAN_IDS.PRO,
            tradesLimit: getPlanEntitlements(PLAN_IDS.PRO).tradesLimit,
            claimStatus: 'approved',
            claimNote: null,
          },
          create: {
            userId: user.id,
            plan: PLAN_IDS.PRO,
            tradesLimit: getPlanEntitlements(PLAN_IDS.PRO).tradesLimit,
            claimStatus: 'approved',
          },
        });
        console.log(`[pocketpartners] Pro access granted to userId=${user.id} poUid=${uid}`);
      } else {
        console.log(`[pocketpartners] UID ${uid} stored — no matching user yet`);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[pocketpartners] Error:', err.message);
    return res.status(200).json({ ok: true }); // always 200
  }
});

module.exports = router;
