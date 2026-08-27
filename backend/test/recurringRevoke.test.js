/**
 * A $29/month subscriber who stops paying must lose access.
 * A one-time buyer must NEVER lose access, whatever Whop sends.
 *
 * Board rail, 2026-08-27: "there are paid users, so don't delete the one-time pay
 * plan — existing users wouldn't be happy." Before recurring plans existed the
 * webhook had no revoke path at all, so adding one risked exactly that harm.
 */
const test = require('node:test');
const assert = require('node:assert');
const { shouldRevokeLicense } = require('../src/lib/plans');

test('one-time and lifetime buyers are never revoked', () => {
  // Every licence written before 2026-08-27 looks like this.
  assert.equal(shouldRevokeLicense({ plan: 'lifetime', expiresAt: null }), false);
  assert.equal(shouldRevokeLicense({ plan: 'basic', expiresAt: null }), false);
  assert.equal(shouldRevokeLicense({ plan: 'lifetime' }), false, 'undefined expiresAt is permanent too');
});

test('a recurring licence that has stopped paying IS revoked', () => {
  assert.equal(shouldRevokeLicense({ plan: 'lifetime', expiresAt: new Date('2026-09-27') }), true);
  assert.equal(shouldRevokeLicense({ plan: 'basic', expiresAt: new Date() }), true);
});

test('missing licence is not revoked', () => {
  assert.equal(shouldRevokeLicense(null), false);
  assert.equal(shouldRevokeLicense(undefined), false);
});
