const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { PLAN_IDS, getAiTradesAllowanceForLicense } = require('../lib/plans');

const { sanitizeTradeMeta } = require('../lib/tradeMeta');
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

const { capBody, userRateLimit, eventData } = require('../lib/tradingTelemetry');
router.post('/event', authMiddleware, capBody, userRateLimit(), async (req, res) => {
  try {
    await prisma.tradeEvent.create({ data: eventData(req.body, req.userId) });
    return res.json({ success: true });
  } catch (err) {
    return res.status(err instanceof RangeError ? 400 : 500).json({ error: err instanceof RangeError ? err.message : 'Failed to record event' });
  }
});

// POST /api/trades/log
router.post('/log', authMiddleware, async (req, res) => {
  try {
    const body = req.body;
    const finiteMoney = value => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value));
    const validResults = ['win', 'loss', 'tie', 'unknown', 'pending'];
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        !['call', 'put'].includes(body.direction) || !validResults.includes(body.result) ||
        !finiteMoney(body.amount) || Number(body.amount) <= 0 ||
        (body.pair != null && (typeof body.pair !== 'string' || !/^[A-Za-z0-9_. /-]{1,80}$/.test(body.pair))) ||
        ['balanceBefore', 'balanceAfter'].some(key => body[key] != null && !finiteMoney(body[key])) ||
        (body.isDemo != null && ![true, false, 'true', 'false'].includes(body.isDemo)) ||
        (body.strategy != null && !['martingale', 'anti-martingale', 'fixed', 'ai-signal', 'ai', 'user-ai'].includes(body.strategy)) ||
        (body.signalSnapshot != null && (typeof body.signalSnapshot !== 'object' || Array.isArray(body.signalSnapshot) || Buffer.byteLength(JSON.stringify(body.signalSnapshot)) > 16384))) {
      return res.status(400).json({ error: 'Invalid trade data' });
    }
    const { pair, direction, amount, result, balanceBefore, balanceAfter, isDemo, strategy, signalSnapshot } = body;
    const timeframe = normalizeTimeframe(body.timeframe);
    const meta = sanitizeTradeMeta(body.meta);
    if (timeframe && !VALID_TIMEFRAMES.includes(timeframe)) return res.status(400).json({ error: 'Invalid timeframe' });

    const isDemoVal = isDemo === true || isDemo === 'true';
    const isAiTrade = !!signalSnapshot;
    const persistTrade = async tx => {
      let unlimitedAi = false;

      // Gate AI trades on real accounts against the license allowance.
      // Atomic check-and-increment (conditional updateMany) so concurrent logs
      // can't overshoot the cap — fixes the previous read-then-write race and the
      // unawaited fire-and-forget increment that ran after trade creation.
      if (isAiTrade && !isDemoVal) {
        const license = await tx.license.findUnique({ where: { userId: req.userId } });
        unlimitedAi = req.user?.isAdmin || license?.plan === PLAN_IDS.PRO;
        if (!unlimitedAi) {
          const aiTradesAllowance = getAiTradesAllowanceForLicense(license);
          const consumed = await tx.license.updateMany({
            where: { userId: req.userId, aiTradesUsed: { lt: aiTradesAllowance } },
            data: { aiTradesUsed: { increment: 1 } },
          });
          if (consumed.count === 0) {
            const error = new Error('AI trade allowance exhausted');
            error.allowance = {
              success: false,
              allowed: false,
              reason: 'AI trade allowance exhausted',
              aiTradesUsed: license?.aiTradesUsed ?? aiTradesAllowance,
              aiTradesAllowance,
            };
            throw error;
          }
        }
      }

      return tx.trade.create({
        data: {
          userId: req.userId,
          pair: pair || 'UNKNOWN',
          direction: String(direction),
          amount: Number(amount),
          result: String(result),
          balanceBefore: balanceBefore != null ? Number(balanceBefore) : null,
          balanceAfter: balanceAfter != null ? Number(balanceAfter) : null,
          isDemo: isDemoVal,
          strategy: strategy || 'martingale',
          timeframe,
          signalSnapshot: signalSnapshot || null,
          ...(meta ? { meta } : {}),
        },
      });
    };
    // Quota and insert commit together or both roll back. Plain logs need one write.
    const trade = isAiTrade && !isDemoVal ? await prisma.$transaction(persistTrade) : await persistTrade(prisma);

    return res.json({ success: true, trade });
  } catch (err) {
    if (err.allowance) return res.status(403).json(err.allowance);
    console.error('[trades/log] Error:', err.message, err.code);
    return res.status(500).json({ error: 'Failed to log trade' });
  }
});

// PUT /api/trades/:id — update trade result when it closes
router.put('/:id', authMiddleware, async (req, res) => {
  const { result, balanceAfter } = req.body || {};
  if (!['win', 'loss', 'tie', 'unknown', 'pending'].includes(result) ||
      (balanceAfter != null && (!(typeof balanceAfter === 'number' || typeof balanceAfter === 'string' && balanceAfter.trim() !== '') || !Number.isFinite(Number(balanceAfter))))) {
    return res.status(400).json({ error: 'Invalid trade result or balance' });
  }
  try {
    await prisma.trade.updateMany({
      where: { id: req.params.id, userId: req.userId },
      data: {
        result,
        balanceAfter: balanceAfter != null ? Number(balanceAfter) : undefined,
      },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update trade' });
  }
});

// GET /api/trades/history?type=real|demo|all&page=1&limit=50
router.get('/history', authMiddleware, async (req, res) => {
  const { type = 'all' } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(type === 'demo' ? 50 : 100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const skip = (page - 1) * limit;
  try {
    // Retention is independent of the UI: expose only the newest 50 demo/100 real.
    const types = type === 'demo' ? [true] : type === 'real' ? [false] : [true, false];
    const recent = (await Promise.all(types.map(isDemo => prisma.trade.findMany({
      where: { userId: req.userId, isDemo },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: isDemo ? 50 : 100,
    })))).flat().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || b.id.localeCompare(a.id));
    const total = recent.length;
    const trades = recent.slice(skip, skip + limit);

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
