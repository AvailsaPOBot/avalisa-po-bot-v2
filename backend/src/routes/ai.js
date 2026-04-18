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
    if (req.user?.isAdmin) {
      return res.json({ tokensUsed: used, budget: null, remaining: null, tokensLimit: null, unlimited: true, month });
    }
    return res.json({ tokensUsed: used, budget, remaining: Math.max(0, budget - used), tokensLimit: budget, unlimited: false, month });
  } catch (err) {
    console.error('[AI] token-status error:', err);
    return res.status(500).json({ error: 'Failed to fetch token status' });
  }
});

// POST /api/ai/signal
// Body: { indicators: {...} }
router.post('/signal', authMiddleware, async (req, res) => {
  const license = await prisma.license.findUnique({ where: { userId: req.userId } });
  if (!license || license.plan !== 'lifetime') {
    return res.status(403).json({ error: 'AI trading requires Lifetime plan' });
  }

  const { indicators } = req.body;
  if (!indicators || typeof indicators !== 'object') {
    return res.status(400).json({ error: 'indicators object required' });
  }

  const month = getCurrentMonth();
  const isAdmin = req.user?.isAdmin === true;
  const [usage, budgetConfig] = await Promise.all([
    prisma.userTokenUsage.findUnique({
      where: { userId_month: { userId: req.userId, month } },
    }),
    prisma.appConfig.findUnique({ where: { key: 'ai_token_budget_per_user' } }),
  ]);
  const budget = parseInt(budgetConfig?.value || '10000');
  const used = usage?.tokensUsed || 0;
  if (!isAdmin && used >= budget) {
    return res.status(429).json({ error: 'quota_exceeded', message: 'AI quota reached, resets 1st of month' });
  }

  const promptConfig = await prisma.appConfig.findUnique({ where: { key: 'ai_strategy_prompt' } });
  const systemPrompt = promptConfig?.value ||
    'You are a binary options trading signal generator. Given technical indicators, respond ONLY with a JSON object: {"signal": "CALL"|"PUT"|"SKIP", "confidence": 0-100, "reasoning": "<15 words"}. CALL = expect price up next candle. PUT = expect down. SKIP = unclear, do not trade. Be conservative — prefer SKIP over low-confidence trades.';

  const userMessage = `Indicators: ${JSON.stringify(indicators)}`;

  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 128 },
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

    let parsed = { signal: 'SKIP', confidence: 0, reasoning: '' };
    try { const m = text.match(/\{[\s\S]*?\}/); if (m) parsed = JSON.parse(m[0]); } catch {}
    const signal = ['CALL', 'PUT', 'SKIP'].includes((parsed.signal || '').toUpperCase()) ? parsed.signal.toUpperCase() : 'SKIP';

    if (tokensUsed > 0) {
      await prisma.userTokenUsage.upsert({
        where: { userId_month: { userId: req.userId, month } },
        update: { tokensUsed: { increment: tokensUsed } },
        create: { userId: req.userId, month, tokensUsed },
      });
    }
    console.log(`[AI] ${req.user.email} ${signal} (${parsed.confidence}%) — ${tokensUsed} tok${isAdmin ? ' [ADMIN]' : ''}`);

    return res.json({
      signal,
      confidence: parsed.confidence || 0,
      reasoning: parsed.reasoning || '',
      tokensUsed,
      remaining: isAdmin ? null : Math.max(0, budget - used - tokensUsed),
      tokensLimit: isAdmin ? null : budget,
      unlimited: isAdmin,
    });
  } catch (err) {
    console.error('[AI] signal error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
