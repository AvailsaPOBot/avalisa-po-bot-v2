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

// PATCH /api/admin/users/:id — update poUserId and/or plan
router.patch('/users/:id', async (req, res) => {
  const { id } = req.params;
  const { poUserId, plan } = req.body;
  try {
    const updates = [];
    if (poUserId !== undefined) {
      updates.push(prisma.user.update({
        where: { id },
        data: { poUserId: poUserId.trim() || null },
      }));
    }
    if (plan !== undefined) {
      updates.push(prisma.license.update({
        where: { userId: id },
        data: {
          plan,
          tradesLimit: plan === 'lifetime' ? null : plan === 'basic' ? 100 : 10,
        },
      }));
    }
    await prisma.$transaction(updates);
    return res.json({ success: true });
  } catch (err) {
    console.error('[Admin] patch user error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/users/:id — delete user and all their data
router.delete('/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.$transaction([
      prisma.trade.deleteMany({ where: { userId: id } }),
      prisma.deviceFingerprint.deleteMany({ where: { userId: id } }),
      prisma.settings.deleteMany({ where: { userId: id } }),
      prisma.license.deleteMany({ where: { userId: id } }),
      prisma.user.delete({ where: { id } }),
    ]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[Admin] delete user error:', err);
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

// ─── AI Settings ─────────────────────────────────────────────────────────────

// GET /api/admin/ai-settings
router.get('/ai-settings', async (req, res) => {
  try {
    const keys = ['ai_strategy_prompt', 'ai_token_budget_per_user', 'timeframe_winrates'];
    const rows = await prisma.appConfig.findMany({ where: { key: { in: keys } } });
    const result = {};
    rows.forEach(r => { result[r.key] = r.value; });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/ai-settings
// Body: { ai_strategy_prompt?, ai_token_budget_per_user?, timeframe_winrates? }
router.put('/ai-settings', async (req, res) => {
  const allowed = ['ai_strategy_prompt', 'ai_token_budget_per_user', 'timeframe_winrates'];
  const updates = Object.entries(req.body)
    .filter(([k]) => allowed.includes(k))
    .map(([key, value]) =>
      prisma.appConfig.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
    );
  if (updates.length === 0) return res.status(400).json({ error: 'No valid keys provided' });
  try {
    await Promise.all(updates);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Token Usage ──────────────────────────────────────────────────────────────

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// GET /api/admin/token-usage — top 10 users by tokens this month
router.get('/token-usage', async (req, res) => {
  try {
    const month = getCurrentMonth();
    const [rows, budgetConfig] = await Promise.all([
      prisma.userTokenUsage.findMany({
        where: { month },
        orderBy: { tokensUsed: 'desc' },
        take: 10,
        include: { user: { select: { email: true } } },
      }),
      prisma.appConfig.findUnique({ where: { key: 'ai_token_budget_per_user' } }),
    ]);
    const budget = parseInt(budgetConfig?.value || '10000');
    return res.json({
      month,
      budget,
      users: rows.map(r => ({
        email: r.user.email,
        tokensUsed: r.tokensUsed,
        percentOfBudget: Math.round((r.tokensUsed / budget) * 100),
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/token-reset — reset all UserTokenUsage for current month
router.post('/token-reset', async (req, res) => {
  try {
    const month = getCurrentMonth();
    const { count } = await prisma.userTokenUsage.deleteMany({ where: { month } });
    console.log(`[Admin] Token usage reset for ${month} — ${count} records deleted`);
    return res.json({ success: true, month, recordsDeleted: count });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
