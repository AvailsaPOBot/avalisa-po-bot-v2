const express = require('express');

const router = express.Router();

const SYSTEM_PROMPT = 'You are the support assistant for Avalisa PO Bot, a Chrome extension trading bot for Pocket Option. Help users with setup, strategies, and troubleshooting. Be friendly and concise. Pricing: Free plan requires registering under our affiliate link. $50 plan = 100 trades. $100 = lifetime unlimited. Never guarantee trading profits — trading always involves risk.';

// POST /api/support/chat
router.post('/chat', async (req, res) => {
  let userMessage;
  if (req.body.message) {
    userMessage = req.body.message;
  } else if (req.body.messages && req.body.messages.length > 0) {
    userMessage = req.body.messages[req.body.messages.length - 1].content;
  } else {
    return res.status(400).json({ error: 'message or messages required' });
  }

  const trimmedMessages = req.body.messages
    ? req.body.messages.slice(-20)
    : [{ role: 'user', content: userMessage }];

  try {
    let reply;
    let provider;

    if (process.env.ANTHROPIC_API_KEY) {
      // Claude if key is present (higher quality)
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: trimmedMessages.map(m => ({ role: m.role, content: m.content })),
      });
      reply = response.content[0].text;
      provider = 'claude';
    } else {
      // Default: Gemini via REST API (free)
      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + process.env.GOOGLE_AI_API_KEY,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: userMessage }] }],
            systemInstruction: {
              parts: [{ text: SYSTEM_PROMPT }],
            },
          }),
        }
      );
      const data = await response.json();
      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        console.error('Gemini unexpected response:', JSON.stringify(data));
        return res.status(500).json({ error: 'AI service returned an unexpected response' });
      }
      reply = data.candidates[0].content.parts[0].text;
      provider = 'gemini';
    }

    res.json({ reply, provider });
  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ error: 'AI service unavailable. Please try again.' });
  }
});

module.exports = router;
