const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { userRateLimit, uploadCandles } = require('../lib/tradingTelemetry');
const router = express.Router();
router.post('/candles', authMiddleware, userRateLimit(30), async (req, res) => {
  try {
    const result = await uploadCandles(prisma, req.body);
    // 202 = received, deliberately not stored (archive at its cap).
    return res.status(result.accepted === false ? 202 : 200).json({ success: true, ...result });
  }
  catch (err) { return res.status(err instanceof RangeError ? 400 : 500).json({ error: err instanceof RangeError ? err.message : 'Failed to archive candles' }); }
});
module.exports = router;
