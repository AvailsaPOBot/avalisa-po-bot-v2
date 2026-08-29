const express = require('express');
const prisma = require('../lib/prisma');
const { recordSupportEscalation } = require('../lib/supportEscalation');

const router = express.Router();

const HUMAN_FOLLOW_UP_REPLY = 'Thanks for telling us. This needs human review, so please email avalisapobot@gmail.com with your account email, Pocket Option ID if relevant, and a short description. A human from Avalisa will follow up.';

const SENSITIVE_ESCALATION_PATTERNS = [
  { name: 'refund', pattern: /\brefund(s|ed|ing)?\b/i },
  { name: 'chargeback_intent', pattern: /\b(?:charge\s?back(?:s)?|dispute\s+(?:(?:this|the|a|my)\s+)?(?:payment|charge)|reverse\s+the\s+charge)\b/i },
  { name: 'billing_error', pattern: /\b(?:charged\s+(?:me\s+)?twice|double\s+charged|billed\s+twice)\b/i },
  { name: 'unauthorized_charge', pattern: /\b(?:unauthori[sz]ed\s+charge|i\s+(?:did\s+not|didn't)\s+authori[sz]e)\b/i },
  { name: 'cancellation', pattern: /\b(?:cancel(?:l(?:ed|ing)?|ed|ing)?\s+(?:my\s+)?(?:subscription|plan|membership|billing)|stop\s+charging\s+me)\b/i },
  { name: 'paid_no_access', pattern: /\b(?:paid|bought|purchased)\b[\s\S]{0,240}\b(?:no\s+access|not\s+activated|nothing\s+happened|still\s+(?:on\s+(?:the\s+)?demo|free|locked))\b|\b(?:no\s+access|not\s+activated|nothing\s+happened|still\s+(?:on\s+(?:the\s+)?demo|free|locked))\b[\s\S]{0,240}\b(?:paid|bought|purchased)\b/i },
  { name: 'account_deletion', pattern: /\bdelete\s+(my\s+)?account\b/i },
  { name: 'account_closure', pattern: /\bclose\s+(my\s+)?account\b/i },
  { name: 'data_removal', pattern: /\bremove\s+(my\s+)?(data|account)\b/i },
  { name: 'legal', pattern: /\blegal\b/i },
  { name: 'lawyer', pattern: /\blawyer\b/i },
  { name: 'lawsuit', pattern: /\bsue\b/i },
  { name: 'scam', pattern: /\bscam(s|med|ming)?\b/i },
  { name: 'fraud', pattern: /\bfraud(s|ulent)?\b/i },
  { name: 'financial_loss', pattern: /\bfinancial\s+loss(es)?\b/i },
  { name: 'lost_money', pattern: /\blost\s+(money|cash|funds|\$|usd|baht|thb)\b/i },
  { name: 'lost_amount', pattern: /\blost\s+[$€£฿]\s*\d[\d,]*(\.\d+)?\b/i },
  { name: 'lost_currency_amount', pattern: /\blost\s+\d[\d,]*(\.\d+)?\s*(usd|dollars?|baht|thb)\b/i },
  { name: 'lost_deposit', pattern: /\blost\s+(all\s+)?(my\s+)?(deposit|balance|account|investment)\b/i },
  { name: 'account_blown', pattern: /\bblew\s+(up\s+)?(my\s+)?(account|balance)\b/i },
  { name: 'money_back', pattern: /\bmoney\s+back\b/i },
];

function getSensitiveSupportEscalationMatch(messages) {
  const text = messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
    .join('\n');

  return SENSITIVE_ESCALATION_PATTERNS.find(({ pattern }) => pattern.test(text)) || null;
}

function getSensitiveSupportEscalation(messages) {
  return getSensitiveSupportEscalationMatch(messages) ? HUMAN_FOLLOW_UP_REPLY : null;
}

const SYSTEM_PROMPT = `You are Avalisa, the official AI support assistant for Avalisa PO Bot —
a Chrome extension trading assistant for Pocket Option (pocketoption.com).
You are friendly, concise, and helpful. Never make up information.
If you truly cannot answer, tell the user to email avalisapobot@gmail.com.

=== SCOPE ===

Answer only questions related to Avalisa's service:
- Avalisa website and dashboard
- account registration, login, pricing, plans, payments, and activation
- Pocket Option setup for using Avalisa
- Chrome extension installation and troubleshooting
- Avalisa trading modes, Avalisa Bot behavior, Martingale, settings, trade history, and bot controls
- responsible-use guidance and risk reminders for binary options trading
- support workflows, claim/affiliate process, and contacting Avalisa

If the user asks about unrelated topics, politely say:
"I can help with Avalisa, Pocket Option setup, trading modes, account questions, pricing, and support. For anything outside Avalisa's service, I may not be the right assistant."

Do not answer unrelated general knowledge, entertainment, coding, medical, legal, political, adult, or personal advice questions.
Do not provide financial advice or guarantee profits.
For refund, legal, account-deletion, chargeback, scam/fraud accusation, or financial-loss complaints, do not improvise.
Give one short, polite reply that a human will follow up by email at avalisapobot@gmail.com.

=== PRODUCT INFO ===

Avalisa PO Bot automates trading on Pocket Option using two rule-based modes: Martingale and Avalisa Bot.
It is a Chrome Extension for PC only (not mobile).
Website: https://avalisabot.vercel.app
YouTube: https://youtube.com/@avalisapobot

=== PLANS & PRICING ===

Demo: Existing users get 10 Martingale trades with no starting amount cap.
Affiliate Pro signup link: https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50
New users who register under our affiliate link get Pro access after Pocket Option account confirmation.

Basic Plan: $69 one-time — unlimited Martingale trades
Pro Plan: $119 one-time — unlimited Martingale and Avalisa Bot trades
Purchase at: https://avalisabot.vercel.app/pricing

After purchasing, send your Pocket Option ID to avalisapobot@gmail.com to activate.

=== HOW TO GET STARTED ===

1. Go to https://avalisabot.vercel.app and register/login
2. Install the Chrome Extension from the Chrome Web Store: https://chromewebstore.google.com/detail/avalisa-po-bot/mkcpdbnlofljijfjiglkodddicpgdapa
3. Open Pocket Option in Chrome: https://pocketoption.com
4. The bot panel will appear — configure your settings and press Start

=== SETTINGS, TRADING MODES & AI ===

Recommended settings (default):
- Timeframe: 1 minute or higher (never below 1 minute)
- Trading pairs: choose pairs with payout % above 90%
- Starting amount: $1
- Trading mode: Avalisa Bot or Martingale, depending on the user's plan and extension version

Avalisa Bot analyzes market context using disciplined rule checks such as trend/range behavior,
RSI, Bollinger Bands, momentum, payout filters, pair scanning, and timeframe selection.
Martingale increases bet size after a confirmed loss to recover, and works best on pairs
with high payout % and stable market conditions.

=== PROFIT & EXPECTATIONS ===

When users ask about winning or profit, always say:
"Avalisa does not guarantee wins or income. Trading results vary by market condition,
pair, payout percentage, timeframe, settings, and account behavior.

Please test in demo first until you understand the bot behavior and only use real
money if you accept the risk. Avoid trades shorter than 1 minute, prefer pairs with
payout above 90%, start small, and stop if the market is unstable.

For setup help, send your question or screenshots to avalisapobot@gmail.com."

=== COMMON ISSUES ===

Bot not trading:
- Make sure you are on Pocket Option in Chrome (not another browser)
- Check that the extension is enabled in Chrome
- Make sure your plan is active — check your dashboard
- Try refreshing the Pocket Option page

Bot panel not showing:
- Go to chrome://extensions and make sure Avalisa Bot is enabled
- Refresh pocketoption.com

Affiliate Pro access not working:
- Pro access only unlocks if you registered a NEW Pocket Option account via our link
- Existing Pocket Option accounts can use Demo or purchase a plan

Payment made but not activated:
- Send your Pocket Option ID to avalisapobot@gmail.com
- Allow up to 24 hours for activation

What is my Pocket Option ID?
- Log in to Pocket Option → click your profile → your numeric ID is shown there

=== FALLBACK ===

If you cannot answer a question confidently, always end with:
"For further assistance, please email us at avalisapobot@gmail.com and we will help you."

Never answer questions unrelated to Avalisa Bot or Pocket Option trading.`;

function normalizeMessages(messages, fallbackMessage) {
  const source = Array.isArray(messages) && messages.length > 0
    ? messages
    : [{ role: 'user', content: fallbackMessage }];

  const normalized = source
    .slice(-20)
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: String(message.content || '').trim(),
    }))
    .filter((message) => message.content);

  while (normalized.length > 0 && normalized[0].role !== 'user') {
    normalized.shift();
  }

  return normalized.length > 0 ? normalized : [{ role: 'user', content: fallbackMessage }];
}

// POST /api/support/chat
router.post('/chat', async (req, res) => {
  let userMessage;
  if (req.body.message) {
    userMessage = String(req.body.message).trim();
  } else if (req.body.messages && req.body.messages.length > 0) {
    userMessage = String(req.body.messages[req.body.messages.length - 1].content || '').trim();
  } else {
    return res.status(400).json({ error: 'message or messages required' });
  }

  if (!userMessage) {
    return res.status(400).json({ error: 'message cannot be empty' });
  }

  const trimmedMessages = normalizeMessages(req.body.messages, userMessage);
  const escalation = getSensitiveSupportEscalationMatch(trimmedMessages);

  if (escalation) {
    recordSupportEscalation(prisma, {
      userId: req.user?.id,
      reason: escalation.name,
      excerpt: userMessage,
    });
    return res.json({
      reply: HUMAN_FOLLOW_UP_REPLY,
      provider: 'avalisa-escalation',
      escalate: true,
    });
  }

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
        messages: trimmedMessages,
      });
      reply = response.content[0].text;
      provider = 'claude';
    } else {
      if (!process.env.GOOGLE_AI_API_KEY) {
        return res.status(503).json({ error: 'AI support is not configured yet' });
      }

      // Default: Gemini via REST API (free)
      const ctl = new AbortController();
      const timeout = setTimeout(() => ctl.abort(), 15000);
      let response;
      try {
        response = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + process.env.GOOGLE_AI_API_KEY,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: trimmedMessages.map((message) => ({
                role: message.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: message.content }],
              })),
              systemInstruction: {
                parts: [{ text: SYSTEM_PROMPT }],
              },
            }),
            signal: ctl.signal,
          }
        );
      } finally {
        clearTimeout(timeout);
      }
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

router.__test = {
  getSensitiveSupportEscalationMatch,
  getSensitiveSupportEscalation,
  HUMAN_FOLLOW_UP_REPLY,
};

module.exports = router;
