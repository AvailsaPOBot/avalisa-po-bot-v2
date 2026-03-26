const SYSTEM_PROMPT = `You are the support assistant for Avalisa PO Bot, a Chrome extension trading assistant for Pocket Option. Help users with setup, strategies, and troubleshooting. Be friendly and concise.

Pricing:
- Free plan: Register a new Pocket Option account under our affiliate link — unlimited Martingale strategy
- $50 Basic plan: 100 trades, max $2 starting amount, all strategies unlocked
- $100 Lifetime plan: Unlimited trades, unlimited amount, all strategies unlocked

Affiliate registration link: https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50

IMPORTANT: Never guarantee trading profits — binary options trading always involves significant financial risk. Always remind users to trade responsibly.`;

async function chatWithAI(messages) {
  // Try Claude first if key is present
  if (process.env.ANTHROPIC_API_KEY) {
    return chatWithClaude(messages);
  }
  return chatWithGemini(messages);
}

async function chatWithClaude(messages) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  });

  return response.content[0].text;
}

async function chatWithGemini(messages) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT,
  });

  // Convert messages to Gemini format
  const history = messages.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const lastMessage = messages[messages.length - 1];
  const chat = model.startChat({ history });
  const result = await chat.sendMessage(lastMessage.content);
  return result.response.text();
}

module.exports = { chatWithAI };
