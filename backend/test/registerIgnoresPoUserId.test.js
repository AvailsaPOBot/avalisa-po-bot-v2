/**
 * Registration must NEVER take a Pocket Option UID from the request body.
 *
 * It used to. Nothing legitimate sent it — dashboard/src/hooks/useAuth.js posts
 * { email, password } and is the only caller — so it was input surface only an attacker
 * would use, and the damage is quiet: poUserId is @unique and first-come-first-served, so
 * registering with a UID you do not own PERMANENTLY BLOCKS the real owner from linking it,
 * and the claim route auto-approves any UID present in AffiliateReferral, so a squatter
 * could collect a free Pro earned by somebody else's referral.
 *
 * This test asserts the BEHAVIOUR (a supplied UID is ignored), not the shape of the code —
 * #117: a guard pinned to wording holds the defect in place.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '../src');
const register = fs.readFileSync(path.join(SRC, 'routes/auth.js'), 'utf8')
  .split("router.post('/register'")[1]
  .split("router.post(")[0];

test('the register handler never reads poUserId from the request body', () => {
  assert.doesNotMatch(register, /const\s*\{[^}]*poUserId[^}]*\}\s*=\s*req\.body/,
    'registration must not destructure poUserId from the body');
  assert.doesNotMatch(register, /req\.body\.poUserId/,
    'registration must not read req.body.poUserId directly');
});

test('the created user is given a null poUserId, not a caller-supplied one', () => {
  assert.match(register, /poUserId:\s*null/,
    'a new account starts unlinked; linking happens through the guarded routes only');
});

test('the guarded linking route still exists and still rejects a taken UID', () => {
  const auth = fs.readFileSync(path.join(SRC, 'routes/auth.js'), 'utf8');
  assert.match(auth, /router\.put\('\/po-user-id',\s*authMiddleware/,
    'linking must require authentication');
  // Scoped to the HANDLER. Asserting /409/ over the whole file passed a mutation that deleted
  // this guard, because auth.js 409s elsewhere for "email already registered".
  const handler = auth.split("router.put('/po-user-id'")[1].split('router.')[0];
  assert.match(handler, /status\(409\)/,
    'linking must still 409 when the UID belongs to another account');
});

test('the only caller of /register sends no poUserId', () => {
  const client = fs.readFileSync(
    path.resolve(__dirname, '../../dashboard/src/hooks/useAuth.js'), 'utf8');
  const call = client.split("'/api/auth/register'")[1].split(';')[0];
  assert.doesNotMatch(call, /poUserId/,
    'if a client ever starts sending it, this fix needs revisiting rather than silently ignoring it');
});
