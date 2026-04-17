const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();

const VALID_TIMEFRAMES = ['S15', 'S30', 'M1', 'M3', 'M5', 'M30', 'H1'];
const VALID_DIRECTIONS = ['alternating', 'call', 'put'];
const VALID_STRATEGIES = ['martingale', 'anti-martingale', 'fixed', 'ai-signal'];
const VALID_DELAYS = [2, 4, 6, 8, 10, 12];

// GET /api/settings
router.get('/', authMiddleware, async (req, res) => {
  try {
    let settings = await prisma.settings.findUnique({ where: { userId: req.userId } });
    if (!settings) {
      settings = await prisma.settings.create({
        data: { userId: req.userId },
      });
    }
    res.json(settings);
  } catch (err) {
    console.error('Settings fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// POST /api/settings — extension uses apiPost (POST), same logic as PUT
router.post('/', authMiddleware, async (req, res) => {
  req.method = 'PUT'; // reuse PUT handler below
  return settingsUpsert(req, res);
});

// PUT /api/settings
router.put('/', authMiddleware, async (req, res) => {
  return settingsUpsert(req, res);
});

async function settingsUpsert(req, res) {
  const {
    strategy,
    timeframe,
    direction,
    martingaleMultiplier,
    martingaleSteps,
    delaySeconds,
    startAmount,
  } = req.body;

  // Validate fields
  if (timeframe && !VALID_TIMEFRAMES.includes(timeframe)) {
    return res.status(400).json({ error: 'Invalid timeframe' });
  }
  if (direction && !VALID_DIRECTIONS.includes(direction)) {
    return res.status(400).json({ error: 'Invalid direction' });
  }
  if (strategy && !VALID_STRATEGIES.includes(strategy)) {
    return res.status(400).json({ error: 'Invalid strategy' });
  }
  if (delaySeconds && !VALID_DELAYS.includes(parseInt(delaySeconds))) {
    return res.status(400).json({ error: 'Invalid delay. Must be 4, 6, 8, 10, or 12' });
  }
  if (martingaleMultiplier) {
    const m = parseFloat(martingaleMultiplier);
    if (m < 1.2 || m > 3.0) {
      return res.status(400).json({ error: 'Martingale multiplier must be between 1.2 and 3.0' });
    }
  }

  try {
    // Check license for paid strategies
    if (strategy && strategy !== 'martingale') {
      const license = await prisma.license.findUnique({ where: { userId: req.userId } });
      if (!license || license.plan === 'free') {
        return res.status(403).json({
          error: 'Paid plan required for this strategy',
          upgradeUrl: 'https://avalisabot.vercel.app/pricing',
        });
      }
    }

    const settings = await prisma.settings.upsert({
      where: { userId: req.userId },
      update: {
        ...(strategy && { strategy }),
        ...(timeframe && { timeframe }),
        ...(direction && { direction }),
        ...(martingaleMultiplier && { martingaleMultiplier: parseFloat(martingaleMultiplier) }),
        ...(martingaleSteps !== undefined && { martingaleSteps: String(martingaleSteps) }),
        ...(delaySeconds && { delaySeconds: parseInt(delaySeconds) }),
        ...(startAmount && { startAmount: parseFloat(startAmount) }),
      },
      create: { userId: req.userId },
    });

    res.json(settings);
  } catch (err) {
    console.error('Settings update error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
}

module.exports = router;
