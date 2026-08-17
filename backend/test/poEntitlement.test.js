/**
 * /api/license/po-entitlement is an ENTITLEMENT lookup, never a login.
 *
 * The caller asserts its own PO UID and the server cannot verify it controls
 * that Pocket Option account. PO UIDs are semi-public, so if this route ever
 * returned a token or identity it would become account takeover with a
 * guessable key. These tests exist to keep that from being "improved" in.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'routes', 'license.js'), 'utf8');

const route = src.slice(src.indexOf("router.post('/po-entitlement'"));
const body = route.slice(0, route.indexOf("router.post('/claim'"));
assert.ok(body.length > 0, 'po-entitlement route not found');

// 1. It must be unauthenticated by design (that is the point) ...
assert.ok(
  /router\.post\('\/po-entitlement',\s*async/.test(body),
  'po-entitlement is intentionally public; if it gains authMiddleware the extension flow breaks',
);

// 2. ... which is exactly why it must never mint or return credentials.
for (const forbidden of ['jwt', 'sign(', 'token', 'password', 'email']) {
  assert.ok(
    !body.toLowerCase().includes(forbidden.toLowerCase()),
    `po-entitlement must never touch "${forbidden}" — it is not an auth route`,
  );
}

// 3. The response must be entitlement fields only.
const responded = [...body.matchAll(/res\.json\(\{([\s\S]*?)\}\)/g)].map(m => m[1]).join(' ');
const allowed = new Set([
  'linked', 'plan', 'tradesUsed', 'tradesLimit',
  'aiTradesAllowance', 'aiTradesUsed', 'expiresAt',
]);
const keys = [...responded.matchAll(/(\w+)\s*:/g)].map(m => m[1]);
keys.forEach(k => {
  assert.ok(allowed.has(k), `po-entitlement leaked "${k}"; only entitlement fields may be returned`);
});
assert.ok(keys.includes('plan'), 'the plan must be returned');

// 4. It must select only the user id from the DB, never the whole record.
assert.ok(
  /select:\s*\{\s*id:\s*true\s*\}/.test(body),
  'the user lookup must select only { id } so no personal data can escape',
);

// 5. Only an admin-verified link counts — poUserId, not a pending claim.
assert.ok(
  /where:\s*\{\s*poUserId:\s*uid\s*\}/.test(body),
  'entitlement must key off the locked poUserId link',
);
assert.ok(
  !/claimStatus|claimedPoUid/.test(body),
  'a pending/unverified claim must not unlock anything',
);

// 6. UID must be validated, not passed through raw.
assert.ok(/\/\^\\d\{3,20\}\$\//.test(body), 'poUid must be validated as numeric');

console.log('Backend po-entitlement contract passed.');
