// Helpers for the admin Users list endpoint.

/**
 * Build the Prisma `where` filter for the admin Users list search box.
 *
 * Returns `undefined` when no usable search term is given (so the caller falls
 * back to the default recent-users listing). Otherwise matches Users whose
 * email (case-insensitive contains) OR poUserId (case-insensitive contains)
 * include the term — so older paying customers outside the recent-50 window are
 * still findable.
 *
 * @param {unknown} search raw `req.query.search` value
 * @returns {object|undefined} Prisma User where filter, or undefined
 */
function buildUserSearchWhere(search) {
  if (typeof search !== 'string') return undefined;
  const term = search.trim();
  if (!term) return undefined;
  return {
    OR: [
      { email: { contains: term, mode: 'insensitive' } },
      { poUserId: { contains: term, mode: 'insensitive' } },
    ],
  };
}

module.exports = { buildUserSearchWhere };
