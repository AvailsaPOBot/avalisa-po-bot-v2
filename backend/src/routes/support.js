const express = require('express');
const { chatWithAI } = require('../lib/ai');

const router = express.Router();

// POST /api/support/chat
router.post('/chat', async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  // Validate message format
  for (const msg of messages) {
    if (!msg.role || !msg.content) {
      return res.status(400).json({ error: 'Each message must have role and content' });
    }
    if (!['user', 'assistant'].includes(msg.role)) {
      return res.status(400).json({ error: 'Message role must be user or assistant' });
    }
  }

  // Limit conversation history to last 20 messages
  const trimmedMessages = messages.slice(-20);

  // Ensure last message is from user
  if (trimmedMessages[trimmedMessages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Last message must be from user' });
  }

  try {
    const reply = await chatWithAI(trimmedMessages);
    const provider = process.env.ANTHROPIC_API_KEY ? 'claude' : 'gemini';
    res.json({ reply, provider });
  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ error: 'AI service unavailable. Please try again.' });
  }
});

module.exports = router;
