const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authMiddleware } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, poUserId } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        poUserId: poUserId || null,
        license: {
          create: {
            plan: 'free',
            tradesUsed: 0,
            tradesLimit: null, // free plan uses device fingerprint tracking
          },
        },
        settings: {
          create: {}, // defaults from schema
        },
      },
      select: { id: true, email: true, poUserId: true, createdAt: true },
    });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({
      user: { id: user.id, email: user.email, poUserId: user.poUserId, createdAt: user.createdAt },
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        poUserId: true,
        createdAt: true,
        license: {
          select: { plan: true, tradesUsed: true, tradesLimit: true, expiresAt: true },
        },
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// PUT /api/auth/po-user-id — update PO user ID from extension
router.put('/po-user-id', authMiddleware, async (req, res) => {
  const { poUserId } = req.body;
  if (!poUserId) return res.status(400).json({ error: 'poUserId is required' });

  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { poUserId },
      select: { id: true, email: true, poUserId: true },
    });
    res.json(user);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'That PO User ID is already linked to another account' });
    }
    res.status(500).json({ error: 'Failed to update PO User ID' });
  }
});

module.exports = router;
