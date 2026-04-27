/**
 * Avalisa PO Bot v2 - Trade result resolver
 * Loaded before content.js by manifest order.
 */

function extractResultFromCloseEvent(payload) {
  if (!payload) return null;
  if (typeof payload.profit === 'number') {
    if (payload.profit === 0) return 'tie';
    return payload.profit > 0 ? 'win' : 'loss';
  }
  if (typeof payload.profitAmount === 'number') {
    if (payload.profitAmount === 0) return 'tie';
    return payload.profitAmount > 0 ? 'win' : 'loss';
  }
  if (payload.result === 'win' || payload.status === 'win') return 'win';
  if (payload.result === 'loss' || payload.status === 'loss' || payload.result === 'lose') return 'loss';
  if (payload.openPrice && payload.closePrice && payload.command !== undefined) {
    if (payload.closePrice === payload.openPrice) return 'tie';
    const up = payload.closePrice > payload.openPrice;
    const wasCall = payload.command === 0 || payload.direction === 'call' || payload.type === 'call';
    return (up === wasCall) ? 'win' : 'loss';
  }
  if (Array.isArray(payload) && payload.length > 0) {
    return extractResultFromCloseEvent(payload[payload.length - 1]);
  }
  if (Array.isArray(payload.deals) && payload.deals.length > 0) {
    return extractResultFromCloseEvent(payload.deals[payload.deals.length - 1]);
  }
  return null;
}

function getDealItems(limit = 5) {
  return Array.from(document.querySelectorAll('.deals-list__item')).slice(0, limit);
}

function getDealSignature(el) {
  if (!el) return null;
  const text = (el.innerText || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return text || null;
}

function getLatestDealSignatures(limit = 5) {
  return getDealItems(limit)
    .map(getDealSignature)
    .filter(Boolean);
}

function readDealResult(el) {
  if (!el) return null;
  const payoutCell = el.querySelector('.item-row .centered');
  const text = (payoutCell?.innerText || el.innerText || '').trim();

  if (payoutCell?.classList.contains('price-up')) return 'win';
  if (payoutCell?.classList.contains('price-down')) return 'loss';
  if (/\+\s*\$/.test(text) || /\bwin\b/i.test(text)) return 'win';
  if (/\-\s*\$/.test(text) || /\bloss\b/i.test(text)) return 'loss';
  return null;
}

function findResolvedNewDealResult(preTradeSignatures) {
  const previous = new Set(preTradeSignatures || []);
  for (const item of getDealItems(5)) {
    const sig = getDealSignature(item);
    if (!sig || previous.has(sig)) continue;
    const result = readDealResult(item);
    if (result) return { result, signature: sig };
  }
  return null;
}

function readWsTradeResultSince(tradeStartTs) {
  const recentWs = state.recentCloseEvents.filter(e => e.ts >= tradeStartTs);
  for (const ev of recentWs.slice().reverse()) {
    const result = extractResultFromCloseEvent(ev.payload);
    if (result) return { result, event: ev.event };
  }
  return null;
}

function classifyResultFromBalance(balanceBefore, balanceDuringTrade, balanceNow, amount, iteration, elapsedMs = iteration * 500) {
  if (balanceNow === null) return null;

  const settleTolerance = Math.max(0.15, amount * 0.15);
  const tieTolerance = Math.max(0.05, amount * 0.05);
  const tieToleranceDuring = Math.max(0.10, amount * 0.10);
  const enoughTieTime = iteration >= 4 || elapsedMs >= 4000;
  const enoughLossTime = iteration >= 10 || elapsedMs >= 10000;

  if (balanceBefore !== null) {
    const deltaFromBefore = balanceNow - balanceBefore;

    if (enoughTieTime && Math.abs(deltaFromBefore) <= tieTolerance) {
      return { result: 'tie', detail: `balance returned to pre-trade level (${deltaFromBefore.toFixed(2)})` };
    }

    if (deltaFromBefore > amount * 0.5) {
      return { result: 'win', detail: `balance vs before +${deltaFromBefore.toFixed(2)}` };
    }

    if (enoughLossTime && deltaFromBefore < -(amount * 0.5)) {
      return { result: 'loss', detail: `balance vs before ${deltaFromBefore.toFixed(2)}` };
    }
  }

  if (balanceDuringTrade !== null) {
    const deltaFromDuring = balanceNow - balanceDuringTrade;

    if (enoughTieTime && Math.abs(deltaFromDuring - amount) <= tieToleranceDuring) {
      return { result: 'tie', detail: `stake returned vs during (${deltaFromDuring.toFixed(2)} ≈ ${amount.toFixed(2)})` };
    }

    if (deltaFromDuring > amount * 1.1) {
      return { result: 'win', detail: `balance vs during +${deltaFromDuring.toFixed(2)}` };
    }

    if (enoughLossTime && Math.abs(deltaFromDuring) <= settleTolerance) {
      return { result: 'loss', detail: `balance stayed near trade-open balance (${deltaFromDuring.toFixed(2)})` };
    }
  }

  return null;
}

async function resolveTradeResult(balanceBefore, balanceDuringTrade, amount, tradeStartTs, preTradeSignatures) {
  const resolveStartTs = Date.now();
  const debug = {
    startedAt: new Date(tradeStartTs).toISOString(),
    amount,
    balanceBefore,
    balanceDuringTrade,
    samples: [],
    method: null,
    result: null,
    detail: null,
  };

  for (let i = 0; i < 80; i++) {
    const wsResult = readWsTradeResultSince(tradeStartTs);
    if (wsResult) {
      console.log('[Avalisa] RESULT:', wsResult.result.toUpperCase(), 'via WS event:', wsResult.event);
      state.lastTradeResultDebug = { ...debug, method: 'ws', result: wsResult.result, detail: wsResult.event };
      return wsResult.result;
    }

    const balanceNow = await getBalance();
    debug.samples.push({
      i,
      ts: Date.now(),
      balanceNow,
      deltaFromBefore: balanceBefore !== null && balanceNow !== null ? +(balanceNow - balanceBefore).toFixed(2) : null,
      deltaFromDuring: balanceDuringTrade !== null && balanceNow !== null ? +(balanceNow - balanceDuringTrade).toFixed(2) : null,
    });
    if (debug.samples.length > 20) debug.samples.shift();

    const balanceResult = classifyResultFromBalance(balanceBefore, balanceDuringTrade, balanceNow, amount, i, Date.now() - resolveStartTs);
    if (balanceResult) {
      console.log(`[Avalisa] RESULT: ${balanceResult.result.toUpperCase()} via ${balanceResult.detail}`);
      state.lastTradeResultDebug = { ...debug, method: 'balance', result: balanceResult.result, detail: balanceResult.detail };
      return balanceResult.result;
    }

    if (i >= 20) {
      const domResult = findResolvedNewDealResult(preTradeSignatures);
      if (domResult) {
        console.log(`[Avalisa] RESULT: ${domResult.result.toUpperCase()} via late DOM deal scrape (${domResult.signature})`);
        state.lastTradeResultDebug = { ...debug, method: 'dom-late', result: domResult.result, detail: domResult.signature };
        return domResult.result;
      }
    }

    await sleep(500);
  }

  console.warn('[Avalisa] RESULT: UNKNOWN (inconclusive after all tiers — holding martingale state)');
  state.lastTradeResultDebug = { ...debug, method: 'inconclusive', result: 'unknown', detail: 'holding martingale state' };
  return 'unknown';
}
