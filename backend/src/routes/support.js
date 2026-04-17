const express = require('express');

const router = express.Router();

const SYSTEM_PROMPT = `You are Avalisa Support Bot, the official support assistant for Avalisa PO Bot —
an automated trading bot for Pocket Option (pocketoption.com).
You are friendly, concise, and helpful. Never make up information.
If you truly cannot answer, tell the user to email avalisapobot@gmail.com.

=== PRODUCT INFO ===

Avalisa PO Bot automates trading on Pocket Option using the Martingale strategy.
It is a Chrome Extension for PC only (not mobile).
Website: https://avalisabot.vercel.app
YouTube: https://youtube.com/@avalisapobot

=== PLANS & PRICING ===

Free: Register a NEW Pocket Option account via our affiliate link and get free bot access.
Affiliate/free signup link: https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50
(Must be a NEW account — existing accounts do not qualify for free access)

Basic Plan: $50 one-time — 100 trades
Lifetime Plan: $100 one-time — unlimited trades
Purchase at: https://avalisabot.vercel.app

After purchasing, send your Pocket Option ID to avalisapobot@gmail.com to activate.

=== HOW TO GET STARTED ===

1. Go to https://avalisabot.vercel.app and register/login
2. Install the Chrome Extension from the Chrome Web Store (search "Avalisa Bot")
3. Open Pocket Option in Chrome: https://pocketoption.com
4. The bot panel will appear — configure your settings and press Start

=== SETTINGS & STRATEGY ===

Recommended settings (default):
- Timeframe: 1 minute or higher (never below 1 minute)
- Trading pairs: choose pairs with payout % above 90%
- Starting amount: $1
- Strategy: Martingale

The bot uses the Martingale strategy — it increases bet size after each loss to recover.
This works best on pairs with high payout % and stable market conditions.

=== PROFIT & EXPECTATIONS ===

When users ask about winning or profit, always say:
"The use of trading bots does not guarantee wins, but if you grasp its functioning
under specific conditions, your chances of winning will be higher. Our bot uses the
Martingale strategy. We advise avoiding trades shorter than 1 minute and choosing
pairs with a payout percentage above 90%.

Starting with $100, run the bot until it reaches $200, then withdraw $100 and repeat.
While there is risk of account volatility, repeating this cycle 10 times is a good
way to test optimal settings under different market conditions.

We recommend testing on a demo account first before using real money.
Watch our videos for more tips: https://youtube.com/@avalisapobot"

=== COMMON ISSUES ===

Bot not trading:
- Make sure you are on Pocket Option in Chrome (not another browser)
- Check that the extension is enabled in Chrome
- Make sure your plan is active — check your dashboard
- Try refreshing the Pocket Option page

Bot panel not showing:
- Go to chrome://extensions and make sure Avalisa Bot is enabled
- Refresh pocketoption.com

Free access not working:
- Free access only works if you registered a NEW Pocket Option account via our link
- Existing accounts must purchase a plan

Payment made but not activated:
- Send your Pocket Option ID to avalisapobot@gmail.com
- Allow up to 24 hours for activation

What is my Pocket Option ID?
- Log in to Pocket Option → click your profile → your numeric ID is shown there

=== FALLBACK ===

If you cannot answer a question confidently, always end with:
"For further assistance, please email us at avalisapobot@gmail.com and we will help you."

Never answer questions unrelated to Avalisa Bot or Pocket Option trading.`;

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
