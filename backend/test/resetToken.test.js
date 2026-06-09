const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_for_reset_token';

const { createResetToken, decodeUserId, verifyResetToken } = require('../src/lib/resetToken');

const user = { id: 'user_123', passwordHash: '$2a$12$originalhashvalueoriginalhashvalueoriginal' };

test('a fresh token verifies for the same user', () => {
  const token = createResetToken(user);
  assert.equal(decodeUserId(token), 'user_123');
  assert.equal(verifyResetToken(token, user), true);
});

test('token is single-use: it fails once the password (hash) changes', () => {
  const token = createResetToken(user);
  const userAfterReset = { ...user, passwordHash: '$2a$12$brandnewhashbrandnewhashbrandnewhashnew' };
  // userId still decodes (unverified), but verification against the new hash fails.
  assert.equal(decodeUserId(token), 'user_123');
  assert.equal(verifyResetToken(token, userAfterReset), false);
});

test('a token from another user does not verify against this user', () => {
  const other = { id: 'user_999', passwordHash: '$2a$12$otherhashotherhashotherhashotherhashother' };
  const token = createResetToken(other);
  assert.equal(verifyResetToken(token, user), false);
});

test('tampered / malformed tokens are rejected', () => {
  assert.equal(decodeUserId('not.a.jwt'), null);
  assert.equal(verifyResetToken('not.a.jwt', user), false);
});

test('a non-reset JWT is rejected by decodeUserId', () => {
  const jwt = require('jsonwebtoken');
  const wrongPurpose = jwt.sign({ uid: user.id, purpose: 'login' }, `${process.env.JWT_SECRET}.${user.passwordHash}`);
  assert.equal(decodeUserId(wrongPurpose), null);
});
