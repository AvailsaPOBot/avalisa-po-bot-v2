const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// GET /api/ai/token-status
router.get('/token-status', authMiddleware, async (req, res) => {
  try {
    const month = getCurrentMonth();
    const [usage, budgetConfig] = await Promise.all([
      prisma.userTokenUsage.findUnique({
        where: { userId_month: { userId: req.userId, month } },
      }),
      prisma.appConfig.findUnique({ where: { key: 'ai_token_budget_per_user' } }),
    ]);
    const budget = parseInt(budgetConfig?.value || '10000');
    const used = usage?.tokensUsed || 0;
    return res.json({ tokensUsed: used, budget, remaining: Math.max(0, budget - used), month });
  } catch (err) {
    console.error('[AI] token-status error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/signal
// Body: { candles: [...], timeframe, pair }
router.post('/signal', authMiddleware, async (req, res) => {
  // Lifetime plan only
  const license = await prisma.license.findUnique({ where: { userId: req.userId } });
  if (!license || license.plan !== 'lifetime') {
    return res.status(403).json({ error: 'AI trading requires Lifetime plan' });
  }

  const { candles, timeframe, pair } = req.body;
  if (!candles || !Array.isArray(candles) || candles.length === 0) {
    return res.status(400).json({ error: 'candles array required' });
  }

  // Check token budget
  const month = getCurrentMonth();
  const [usage, budgetConfig] = await Promise.all([
    prisma.userTokenUsage.findUnique({
      where: { userId_month: { userId: req.userId, month } },
    }),
    prisma.appConfig.findUnique({ where: { key: 'ai_token_budget_per_user' } }),
  ]);
  const budget = parseInt(budgetConfig?.value || '10000');
  const used = usage?.tokensUsed || 0;
  if (used >= budget) {
    return res.status(429).json({
      error: 'quota_exceeded',
      message: 'AI quota reached, resets 1st of month',
    });
  }

  // Get strategy prompt
  const promptConfig = await prisma.appConfig.findUnique({ where: { key: 'ai_strategy_prompt' } });
  const systemPrompt = promptConfig?.value ||
    'You are a binary options trading assistant. Analyze the last 50 candles of OHLCV data and return only a JSON object: {"signal": "CALL"|"PUT"|"SKIP", "confidence": 0-100, "reasoning": "brief reason"}. CALL = price will go up. PUT = price will go down. SKIP = unclear signal, do not trade.';

  const last50 = candles.slice(-50);
  const userMessage = `Pair: ${pair || 'unknown'}\nTimeframe: ${timeframe || 'M1'}\nCandles (last ${last50.length}, oldest first): ${JSON.stringify(last50)}`;

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('[AI] Gemini error:', geminiRes.status, errText);
      return res.status(502).json({ error: 'Gemini API error' });
    }

    const geminiData = await geminiRes.json();
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const tokensUsed = geminiData.usageMetadata?.totalTokenCount || 0;

    // Parse signal from response
    let parsed = { signal: 'SKIP', confidence: 0, reasoning: '' };
    try {
      const match = text.match(/\{[\s\S]*?\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch {
      console.warn('[AI] Failed to parse Gemini response:', text);
    }

    const signal = ['CALL', 'PUT', 'SKIP'].includes((parsed.signal || '').toUpperCase())
      ? parsed.signal.toUpperCase()
      : 'SKIP';

    // Track token usage
    if (tokensUsed > 0) {
      await prisma.userTokenUsage.upsert({
        where: { userId_month: { userId: req.userId, month } },
        update: { tokensUsed: { increment: tokensUsed } },
        create: { userId: req.userId, month, tokensUsed },
      });
    }

    console.log(`[AI] Signal for ${req.userId}: ${signal} (${parsed.confidence}%) — ${tokensUsed} tokens`);

    return res.json({
      signal,
      confidence: parsed.confidence || 0,
      reasoning: parsed.reasoning || '',
      tokensUsed,
      remaining: Math.max(0, budget - used - tokensUsed),
    });
  } catch (err) {
    console.error('[AI] signal error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
