const DEFAULT_WINDOW_MS = 5 * 60 * 1000;
const PRUNE_AFTER_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 10000;

const lastSeenByUserId = new Map();

function prune(now = Date.now()) {
  try {
    for (const [userId, lastSeen] of lastSeenByUserId) {
      if (now - lastSeen <= PRUNE_AFTER_MS) break;
      lastSeenByUserId.delete(userId);
    }
  } catch (_) {
    // Presence is best-effort and must never affect a licence check.
  }
}

function touch(userId) {
  try {
    if (userId == null) return;

    const now = Date.now();
    // Reinsert so Map order remains oldest-seen to newest-seen for eviction.
    lastSeenByUserId.delete(userId);
    lastSeenByUserId.set(userId, now);
    prune(now);

    while (lastSeenByUserId.size > MAX_ENTRIES) {
      const oldestUserId = lastSeenByUserId.keys().next().value;
      lastSeenByUserId.delete(oldestUserId);
    }
  } catch (_) {
    // Presence is best-effort and must never affect a licence check.
  }
}

function isOnline(userId, windowMs = DEFAULT_WINDOW_MS) {
  if (userId == null) return false;
  const lastSeen = lastSeenByUserId.get(userId);
  if (lastSeen == null) return false;
  return Date.now() - lastSeen <= windowMs;
}

function onlineCount(windowMs = DEFAULT_WINDOW_MS) {
  const now = Date.now();
  let count = 0;
  for (const lastSeen of lastSeenByUserId.values()) {
    if (now - lastSeen <= windowMs) count += 1;
  }
  return count;
}

function _resetForTest() {
  lastSeenByUserId.clear();
}

module.exports = { touch, isOnline, onlineCount, prune, _resetForTest };
