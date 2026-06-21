const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { PLAN_IDS, getAiTradesAllowanceForPlan } = require('../lib/plans');

const router = express.Router();
const VALID_TIMEFRAMES = ['S15', 'S30', 'M1', 'M3', 'M5', 'M30', 'H1'];

function normalizeTimeframe(timeframe) {
  if (!timeframe) return null;
  const raw = String(timeframe).trim();
  const lower = raw.toLowerCase();
  if (lower === '15s') return 'S15';
  if (lower === '30s') return 'S30';
  if (lower === '60s') return 'M1';
  if (lower === '180s') return 'M3';
  if (lower === '300s') return 'M5';
  if (lower === '1800s') return 'M30';
  if (lower === '3600s') return 'H1';
  return raw.toUpperCase();
}

// Trim trades to keep only the latest N per user per type
async function trimTrades(userId, isDemo) {
  const limit = isDemo ? 50 : 100;
  const excess = await prisma.trade.findMany({
    where: { userId, isDemo },
    orderBy: { createdAt: 'desc' },
    skip: limit,
    select: { id: true },
  });
  if (excess.length > 0) {
    await prisma.trade.deleteMany({ where: { id: { in: excess.map(t => t.id) } } });
  }
}

// POST /api/trades/log
router.post('/log', authMiddleware, async (req, res) => {
  console.log('[trades/log] body received:', JSON.stringify(req.body));

  try {
    const { pair, direction, amount, result, balanceBefore, balanceAfter, isDemo, strategy, signalSnapshot } = req.body;
    const timeframe = normalizeTimeframe(req.body.timeframe);

    if (!direction || amount == null || amount === '' || !result) {
      return res.status(400).json({ error: 'Missing required fields: direction, amount, result' });
    }
    if (timeframe && !VALID_TIMEFRAMES.includes(timeframe)) {
      return res.status(400).json({ error: 'Invalid timeframe' });
    }

    const isDemoVal = isDemo === true || isDemo === 'true';
    const isAiTrade = !!signalSnapshot;
    let unlimitedAi = false;

    // Gate AI trades on real accounts against the license allowance.
    // Atomic check-and-increment (conditional updateMany) so concurrent logs
    // can't overshoot the cap — fixes the previous read-then-write race and the
    // unawaited fire-and-forget increment that ran after trade creation.
    if (isAiTrade && !isDemoVal) {
      const license = await prisma.license.findUnique({ where: { userId: req.userId } });
      unlimitedAi = req.user?.isAdmin || license?.plan === PLAN_IDS.PRO;
      if (!unlimitedAi) {
        const aiTradesAllowance = getAiTradesAllowanceForPlan(license?.plan);
        const consumed = await prisma.license.updateMany({
          where: { userId: req.userId, aiTradesUsed: { lt: aiTradesAllowance } },
          data: { aiTradesUsed: { increment: 1 } },
        });
        if (consumed.count === 0) {
          return res.status(403).json({
            success: false,
            allowed: false,
            reason: 'AI trade allowance exhausted',
            aiTradesUsed: license?.aiTradesUsed ?? aiTradesAllowance,
            aiTradesAllowance,
          });
        }
      }
    }

    const trade = await prisma.trade.create({
      data: {
        userId: req.userId,
        pair: pair || 'UNKNOWN',
        direction: String(direction),
        amount: parseFloat(amount),
        result: String(result),
        balanceBefore: balanceBefore != null ? parseFloat(balanceBefore) : null,
        balanceAfter: balanceAfter != null ? parseFloat(balanceAfter) : null,
        isDemo: isDemoVal,
        strategy: strategy || 'martingale',
        timeframe,
        signalSnapshot: signalSnapshot || null,
      },
    });

    // (AI allowance was already consumed atomically above, before trade creation.)

    // Fire-and-forget trim — don't block the response
    trimTrades(req.userId, isDemoVal).catch(err =>
      console.error('[trades/log] trim error:', err.message)
    );

    return res.json({ success: true, trade });
  } catch (err) {
    console.error('[trades/log] Error:', err.message, err.code);
    return res.status(500).json({ error: 'Failed to log trade' });
  }
});

// PUT /api/trades/:id — update trade result when it closes
router.put('/:id', authMiddleware, async (req, res) => {
  const { result, balanceAfter } = req.body;
  try {
    await prisma.trade.updateMany({
      where: { id: req.params.id, userId: req.userId },
      data: {
        result,
        balanceAfter: balanceAfter ? parseFloat(balanceAfter) : undefined,
      },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update trade' });
  }
});

// GET /api/trades/history?type=real|demo|all&page=1&limit=50
router.get('/history', authMiddleware, async (req, res) => {
  const { page = 1, limit = 50, type = 'all' } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = { userId: req.userId };
  if (type === 'real') where.isDemo = false;
  else if (type === 'demo') where.isDemo = true;

  try {
    const [trades, total] = await Promise.all([
      prisma.trade.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.trade.count({ where }),
    ]);

    const closedTrades = trades.filter(t => t.result !== 'pending');
    const wins = closedTrades.filter(t => t.result === 'win').length;
    const losses = closedTrades.filter(t => t.result === 'loss').length;
    const ties = closedTrades.filter(t => t.result === 'tie').length;
    const decided = wins + losses;
    const winRate = decided > 0 ? ((wins / decided) * 100).toFixed(1) : 0;
    const totalProfit = closedTrades.reduce((sum, t) => {
      if (t.balanceBefore != null && t.balanceAfter != null) {
        return sum + (t.balanceAfter - t.balanceBefore);
      }
      return sum;
    }, 0);

    res.json({
      trades,
      pagination: { page: parseInt(page), limit: parseInt(limit), total },
      stats: { wins, losses, ties, winRate, totalProfit: totalProfit.toFixed(2) },
    });
  } catch (err) {
    console.error('Trade history error:', err);
    res.status(500).json({ error: 'Failed to fetch trade history' });
  }
});

module.exports = router;
