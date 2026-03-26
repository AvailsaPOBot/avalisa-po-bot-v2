const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/trades/log
router.post('/log', authMiddleware, async (req, res) => {
  const { pair, direction, amount, result, balanceBefore, balanceAfter } = req.body;
  if (!pair || !direction || !amount) {
    return res.status(400).json({ error: 'pair, direction, and amount are required' });
  }

  try {
    const trade = await prisma.trade.create({
      data: {
        userId: req.userId,
        pair,
        direction,
        amount: parseFloat(amount),
        result: result || 'pending',
        balanceBefore: balanceBefore ? parseFloat(balanceBefore) : null,
        balanceAfter: balanceAfter ? parseFloat(balanceAfter) : null,
      },
    });
    res.status(201).json(trade);
  } catch (err) {
    console.error('Trade log error:', err);
    res.status(500).json({ error: 'Failed to log trade' });
  }
});

// PUT /api/trades/:id — update trade result when it closes
router.put('/:id', authMiddleware, async (req, res) => {
  const { result, balanceAfter } = req.body;
  try {
    const trade = await prisma.trade.updateMany({
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

// GET /api/trades/history
router.get('/history', authMiddleware, async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    const [trades, total] = await Promise.all([
      prisma.trade.findMany({
        where: { userId: req.userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.trade.count({ where: { userId: req.userId } }),
    ]);

    // Compute stats
    const closedTrades = trades.filter(t => t.result !== 'pending');
    const wins = closedTrades.filter(t => t.result === 'win').length;
    const losses = closedTrades.filter(t => t.result === 'loss').length;
    const winRate = closedTrades.length > 0 ? ((wins / closedTrades.length) * 100).toFixed(1) : 0;
    const totalProfit = closedTrades.reduce((sum, t) => {
      if (t.balanceBefore != null && t.balanceAfter != null) {
        return sum + (t.balanceAfter - t.balanceBefore);
      }
      return sum;
    }, 0);

    res.json({
      trades,
      pagination: { page: parseInt(page), limit: parseInt(limit), total },
      stats: { wins, losses, winRate, totalProfit: totalProfit.toFixed(2) },
    });
  } catch (err) {
    console.error('Trade history error:', err);
    res.status(500).json({ error: 'Failed to fetch trade history' });
  }
});

module.exports = router;
