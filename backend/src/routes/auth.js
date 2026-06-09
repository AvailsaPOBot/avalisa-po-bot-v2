const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { authMiddleware } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { PLAN_IDS, getPlanEntitlements } = require('../lib/plans');
const { sendEmail, emailConfigured } = require('../lib/email');
const { createResetToken, decodeUserId, verifyResetToken } = require('../lib/resetToken');

const router = express.Router();

const OAUTH_PROVIDERS = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    clientIdEnv: 'GOOGLE_OAUTH_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_OAUTH_CLIENT_SECRET',
    scope: 'openid email profile',
  },
  facebook: {
    authUrl: 'https://www.facebook.com/v20.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v20.0/oauth/access_token',
    userInfoUrl: 'https://graph.facebook.com/me?fields=id,name,email',
    clientIdEnv: 'FACEBOOK_OAUTH_CLIENT_ID',
    clientSecretEnv: 'FACEBOOK_OAUTH_CLIENT_SECRET',
    scope: 'email,public_profile',
  },
};

function publicBackendUrl(req) {
  return process.env.PUBLIC_BACKEND_URL || `${req.protocol}://${req.get('host')}`;
}

function frontendUrl() {
  return (process.env.FRONTEND_URL || 'https://avalisabot.vercel.app').replace(/\/$/, '');
}

function oauthCallbackUrl(req, provider) {
  return `${publicBackendUrl(req).replace(/\/$/, '')}/api/auth/oauth/${provider}/callback`;
}

function redirectToAuthError(res, message, path = '/login') {
  const url = new URL(path, frontendUrl());
  url.searchParams.set('authError', message);
  return res.redirect(url.toString());
}

function signUserToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

async function createUserFromOAuth(email) {
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
  return prisma.user.create({
    data: {
      email,
      passwordHash,
      license: {
        create: {
          plan: PLAN_IDS.DEMO,
          tradesUsed: 0,
          tradesLimit: getPlanEntitlements(PLAN_IDS.DEMO).tradesLimit,
        },
      },
      settings: {
        create: {},
      },
    },
    select: { id: true, email: true, poUserId: true, isAdmin: true, createdAt: true },
  });
}

async function findOrCreateOAuthUser(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) throw new Error('missing_email');

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, poUserId: true, isAdmin: true, createdAt: true },
  });

  if (existing) return existing;
  return createUserFromOAuth(normalizedEmail);
}

async function exchangeOAuthCode(provider, code, redirectUri) {
  const config = OAUTH_PROVIDERS[provider];
  const body = new URLSearchParams({
    code,
    client_id: process.env[config.clientIdEnv],
    client_secret: process.env[config.clientSecretEnv],
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error?.message || 'oauth_token_exchange_failed');
  }

  return data.access_token;
}

async function fetchOAuthProfile(provider, accessToken) {
  const config = OAUTH_PROVIDERS[provider];
  const response = await fetch(config.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = await response.json();

  if (!response.ok) {
    throw new Error(profile.error_description || profile.error?.message || 'oauth_profile_failed');
  }

  if (provider === 'google' && profile.email_verified === false) {
    throw new Error('google_email_not_verified');
  }

  return profile;
}

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
            plan: PLAN_IDS.DEMO,
            tradesUsed: 0,
            tradesLimit: getPlanEntitlements(PLAN_IDS.DEMO).tradesLimit,
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
    console.error('Registration error details:', err.message);
    console.error('Error code:', err.code);
    console.error('Full error:', JSON.stringify(err, null, 2));
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
      user: { id: user.id, email: user.email, poUserId: user.poUserId, isAdmin: user.isAdmin, createdAt: user.createdAt },
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

function resetEmailHtml(resetUrl) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
    <h2 style="color:#0a0a0f">Reset your Avalisa PO Bot password</h2>
    <p>We received a request to reset your password. Click the button below to choose a new one. This link expires in <strong>1 hour</strong>.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${resetUrl}" style="background:#d8a24a;color:#0a0a0f;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;display:inline-block">Reset password</a>
    </p>
    <p style="font-size:13px;color:#555">If the button doesn't work, paste this link into your browser:<br><a href="${resetUrl}">${resetUrl}</a></p>
    <p style="font-size:13px;color:#555">If you didn't request this, you can safely ignore this email — your password won't change.</p>
  </div>`;
}

// POST /api/auth/forgot-password — email a reset link
router.post('/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  // Always answer the same way so we never reveal which emails are registered.
  const genericMessage = 'If an account exists for that email, a password reset link has been sent.';
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json({ message: genericMessage });

    if (!emailConfigured()) {
      console.error('[forgot-password] RESEND_API_KEY not set — cannot send reset email');
      return res.json({ message: genericMessage });
    }

    const token = createResetToken(user);
    const resetUrl = `${frontendUrl()}/reset-password?token=${encodeURIComponent(token)}`;

    try {
      await sendEmail({
        to: user.email,
        subject: 'Reset your Avalisa PO Bot password',
        html: resetEmailHtml(resetUrl),
        text: `Reset your Avalisa PO Bot password:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
      });
    } catch (err) {
      // Log but don't reveal send failures to the caller.
      console.error('[forgot-password] email send failed:', err.message);
    }

    return res.json({ message: genericMessage });
  } catch (err) {
    console.error('Forgot-password error:', err);
    return res.status(500).json({ error: 'Failed to process request' });
  }
});

// POST /api/auth/reset-password — set a new password using a reset token
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'Token and new password are required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const userId = decodeUserId(token);
    if (!userId) return res.status(400).json({ error: 'Invalid or expired reset link' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !verifyResetToken(token, user)) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    // Sign the user in straight away after a successful reset.
    const authToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    return res.json({
      message: 'Password updated. You are now signed in.',
      token: authToken,
      user: { id: user.id, email: user.email, poUserId: user.poUserId, isAdmin: user.isAdmin, createdAt: user.createdAt },
    });
  } catch (err) {
    console.error('Reset-password error:', err);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

// GET /api/auth/oauth/:provider — start Google/Facebook OAuth
router.get('/oauth/:provider', (req, res) => {
  const { provider } = req.params;
  const config = OAUTH_PROVIDERS[provider];

  if (!config) return res.status(404).json({ error: 'Unsupported OAuth provider' });
  if (!process.env[config.clientIdEnv] || !process.env[config.clientSecretEnv]) {
    return redirectToAuthError(res, `${provider}_oauth_not_configured`, req.query.from === 'register' ? '/register' : '/login');
  }

  const state = jwt.sign(
    {
      provider,
      from: req.query.from === 'register' ? 'register' : 'login',
      nonce: crypto.randomBytes(16).toString('hex'),
    },
    process.env.JWT_SECRET,
    { expiresIn: '10m' }
  );

  const url = new URL(config.authUrl);
  url.searchParams.set('client_id', process.env[config.clientIdEnv]);
  url.searchParams.set('redirect_uri', oauthCallbackUrl(req, provider));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', config.scope);
  url.searchParams.set('state', state);
  if (provider === 'google') {
    url.searchParams.set('prompt', 'select_account');
    url.searchParams.set('access_type', 'offline');
  }

  res.redirect(url.toString());
});

// GET /api/auth/oauth/:provider/callback — finish OAuth and issue Avalisa JWT
router.get('/oauth/:provider/callback', async (req, res) => {
  const { provider } = req.params;
  const config = OAUTH_PROVIDERS[provider];

  if (!config) return res.status(404).json({ error: 'Unsupported OAuth provider' });

  let state;
  try {
    state = jwt.verify(req.query.state || '', process.env.JWT_SECRET);
  } catch {
    return redirectToAuthError(res, 'oauth_state_expired');
  }

  if (state.provider !== provider) {
    return redirectToAuthError(res, 'oauth_state_mismatch', state.from === 'register' ? '/register' : '/login');
  }

  if (req.query.error) {
    return redirectToAuthError(res, String(req.query.error), state.from === 'register' ? '/register' : '/login');
  }

  if (!req.query.code) {
    return redirectToAuthError(res, 'oauth_missing_code', state.from === 'register' ? '/register' : '/login');
  }

  try {
    const accessToken = await exchangeOAuthCode(provider, req.query.code, oauthCallbackUrl(req, provider));
    const profile = await fetchOAuthProfile(provider, accessToken);
    const user = await findOrCreateOAuthUser(profile.email);
    const token = signUserToken(user.id);

    const callbackUrl = new URL('/auth/callback', frontendUrl());
    callbackUrl.hash = new URLSearchParams({ token, provider }).toString();
    res.redirect(callbackUrl.toString());
  } catch (err) {
    console.error(`${provider} OAuth error:`, err.message);
    redirectToAuthError(res, err.message || 'oauth_failed', state.from === 'register' ? '/register' : '/login');
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
        isAdmin: true,
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
