const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

// GET /api/webhooks/pocketpartners?event=Registration&trader_id=12345
// Called by PocketPartners server — always return 200 (retries on non-200)
router.get('/', async (req, res) => {
  const { event, trader_id } = req.query;

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
        // Auto-grant lifetime access
        await prisma.license.upsert({
          where: { userId: user.id },
          update: {
            plan: 'lifetime',
            tradesLimit: null,
            claimStatus: 'approved',
            claimNote: null,
          },
          create: {
            userId: user.id,
            plan: 'lifetime',
            tradesLimit: null,
            claimStatus: 'approved',
          },
        });
        console.log(`[pocketpartners] Lifetime granted to userId=${user.id} poUid=${uid}`);
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
