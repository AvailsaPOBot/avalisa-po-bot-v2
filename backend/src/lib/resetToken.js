const jwt = require('jsonwebtoken');

// Stateless, single-use password-reset tokens — no DB column / migration needed.
// The signing secret is JWT_SECRET combined with the user's CURRENT passwordHash,
// so the moment the password changes the secret changes and any older token (or a
// reused one) fails verification. Tokens also expire after 1 hour.

function secretFor(user) {
  return `${process.env.JWT_SECRET}.${user.passwordHash}`;
}

function createResetToken(user) {
  return jwt.sign({ uid: user.id, purpose: 'pwreset' }, secretFor(user), { expiresIn: '1h' });
}

// Read the user id from an UNVERIFIED token so we can look the user up before we
// know the per-user secret. Returns null if the token is malformed or not a reset token.
function decodeUserId(token) {
  const decoded = jwt.decode(token);
  if (!decoded || decoded.purpose !== 'pwreset' || !decoded.uid) return null;
  return decoded.uid;
}

function verifyResetToken(token, user) {
  try {
    const payload = jwt.verify(token, secretFor(user));
    return payload.purpose === 'pwreset' && payload.uid === user.id;
  } catch {
    return false;
  }
}

module.exports = { createResetToken, decodeUserId, verifyResetToken };
