const test = require('node:test');
const assert = require('node:assert/strict');

const { buildUserSearchWhere } = require('../src/lib/adminUsers');

test('no search term returns undefined (default recent listing)', () => {
  assert.equal(buildUserSearchWhere(undefined), undefined);
  assert.equal(buildUserSearchWhere(''), undefined);
  assert.equal(buildUserSearchWhere('   '), undefined);
  assert.equal(buildUserSearchWhere(null), undefined);
});

test('non-string search (e.g. repeated query param array) returns undefined', () => {
  assert.equal(buildUserSearchWhere(['a', 'b']), undefined);
  assert.equal(buildUserSearchWhere(42), undefined);
});

test('search term matches email OR poUserId, case-insensitive contains', () => {
  const where = buildUserSearchWhere('Alice@Example.com');
  assert.deepEqual(where, {
    OR: [
      { email: { contains: 'Alice@Example.com', mode: 'insensitive' } },
      { poUserId: { contains: 'Alice@Example.com', mode: 'insensitive' } },
    ],
  });
});

test('search term is trimmed', () => {
  const where = buildUserSearchWhere('  12345  ');
  assert.equal(where.OR[0].email.contains, '12345');
  assert.equal(where.OR[1].poUserId.contains, '12345');
});
