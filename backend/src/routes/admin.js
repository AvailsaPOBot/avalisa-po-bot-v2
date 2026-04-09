const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();

// All admin routes require auth + admin
router.use(authMiddleware, adminMiddleware);

// POST /api/admin/grant-access
// Body: { identifier: "email or PO UID", plan: "lifetime" | "basic" }
router.post('/grant-access', async (req, res) => {
  const { identifier, plan = 'lifetime' } = req.body;

  if (!identifier) {
    return res.status(400).json({ error: 'identifier (email or PO UID) is required' });
  }

  try {
    // Try find by email first, then by poUserId
    let user = await prisma.user.findUnique({
      where: { email: identifier.toLowerCase().trim() },
    });

    if (!user) {
      user = await prisma.user.findUnique({
        where: { poUserId: identifier.trim() },
      });
    }

    if (!user) {
      return res.status(404).json({
        error: `No user found with email or PO UID: ${identifier}`,
      });
    }

    // Upsert license
    const license = await prisma.license.upsert({
      where: { userId: user.id },
      update: {
        plan,
        tradesUsed: 0,
        tradesLimit: plan === 'lifetime' ? null : 100,
        expiresAt: null,
      },
      create: {
        userId: user.id,
        plan,
        tradesUsed: 0,
        tradesLimit: plan === 'lifetime' ? null : 100,
      },
    });

    console.log(`[Admin] Granted ${plan} to ${user.email} (${user.id})`);
    return res.json({
      success: true,
      message: `${plan} access granted to ${user.email}`,
      user: { id: user.id, email: user.email },
      license,
    });
  } catch (err) {
    console.error('[Admin] grant-access error:', err);
    return res.status(500).json({ error: 'Failed to grant access' });
  }
});

// GET /api/admin/claims — list all pending affiliate claims
router.get('/claims', async (req, res) => {
  try {
    const licenses = await prisma.license.findMany({
      where: { claimStatus: 'pending' },
      include: { user: { select: { id: true, email: true, createdAt: true } } },
      orderBy: { updatedAt: 'asc' },
    });
    const claims = licenses.map(l => ({
      userId: l.userId,
      email: l.user.email,
      claimedPoUid: l.claimedPoUid,
      submittedAt: l.updatedAt,
    }));
    return res.json(claims);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/claims/approve
router.post('/claims/approve', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  try {
    const license = await prisma.license.findUnique({ where: { userId } });
    if (!license) return res.status(404).json({ error: 'License not found' });
    if (license.claimStatus !== 'pending') {
      return res.status(400).json({ error: 'Claim is not in pending state' });
    }

    await prisma.$transaction([
      prisma.license.update({
        where: { userId },
        data: {
          claimStatus: 'approved',
          plan: 'lifetime',
          tradesLimit: null,
          claimNote: 'Approved by admin',
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { poUserId: license.claimedPoUid },
      }),
    ]);

    return res.json({ message: 'Claim approved. User now has lifetime access.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/claims/reject
router.post('/claims/reject', async (req, res) => {
  const { userId, reason } = req.body;
  if (!userId || !reason) return res.status(400).json({ error: 'userId and reason are required' });

  try {
    const license = await prisma.license.findUnique({ where: { userId } });
    if (!license) return res.status(404).json({ error: 'License not found' });

    await prisma.license.update({
      where: { userId },
      data: { claimStatus: 'rejected', claimNote: reason },
    });

    return res.json({ message: 'Claim rejected.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users — list recent users with their plan
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        email: true,
        poUserId: true,
        createdAt: true,
        license: {
          select: { plan: true, tradesUsed: true, tradesLimit: true },
        },
      },
    });
    return res.json({ users });
  } catch (err) {
    console.error('[Admin] users list error:', err);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});

module.exports = router;
