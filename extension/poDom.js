/**
 * Avalisa PO Bot v2 - Pocket Option DOM helpers
 * Loaded before content.js by manifest order.
 */

function normalizeAssetName(name) {
  if (!name) return name;
  return name
    .replace(/\s+OTC$/i, '_otc')
    .replace(/\//g, '')
    .trim();
}

function getDurationSecondsFromDom() {
  const el = document.querySelector('.block--expiration-inputs');
  if (!el) return null;
  const text = el.textContent || '';
  if (text.includes('UTC')) return null;
  const match = text.match(/(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const seconds = (+match[1] * 3600) + (+match[2] * 60) + (+match[3]);
  return seconds > 0 && seconds <= 3600 ? seconds : null;
}

function getCurrentPeriodSeconds(fallbackTf = state.settings?.timeframe || 'M1') {
  return getDurationSecondsFromDom() || TF_TO_SECONDS[fallbackTf] || 60;
}

async function getBalance() {
  const demo = isDemoMode();
  const selectors = demo
    ? ['.js-balance-demo', '.js-hd.js-balance-demo', '[class*="balance-demo"]', '.balance__value', '.header-balance']
    : ['.js-balance-real-USD', '.js-balance-real', '.js-hd.js-balance-real', '[class*="balance-real"]', '.balance__value', '.header-balance'];

  for (let attempt = 1; attempt <= 3; attempt++) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent.replace(/[^0-9.]/g, '');
        const val = parseFloat(text);
        if (val > 0) {
          console.log(`[Avalisa] Balance found via: ${sel} = ${val} (mode=${demo ? 'demo' : 'real'}, attempt=${attempt})`);
          return val;
        }
      }
    }
    if (attempt < 3) await sleep(300);
  }
  console.warn('[Avalisa] Balance not found after 3 attempts — mode:', demo ? 'demo' : 'real');
  return null;
}

function setTradeAmount(amount) {
  const selectors = [
    '.block--bet-amount .value__val input',
    '.value__val input',
    'input[data-testid="trade-amount"]',
    '.trade-amount input',
    'input[name="amount"]',
  ];

  let input = null;
  let matchedSelector = null;
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && !el.closest('#avalisa-overlay') && !el.closest('#avalisa-panel')) {
      input = el;
      matchedSelector = sel;
      break;
    }
  }

  if (!input) {
    console.warn('[Avalisa] setTradeAmount: no input found. Tried:', selectors);
    return false;
  }

  const valueStr = amount.toFixed(2);
  console.log('[Avalisa] setTradeAmount: using selector:', matchedSelector, '| setting amount:', valueStr);

  input.focus();
  input.select();

  const typed = typeof document.execCommand === 'function'
    ? document.execCommand('insertText', false, valueStr)
    : false;

  if (!typed) {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(input, valueStr);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  const acceptedValue = parseFloat(String(input.value || '').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(acceptedValue) || Math.abs(acceptedValue - amount) > 0.01) {
    console.warn('[Avalisa] setTradeAmount: value did not stick. wanted:', valueStr, 'actual:', input.value);
    input.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(input, valueStr);
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertReplacementText',
      data: valueStr,
    }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  }

  const finalValue = parseFloat(String(input.value || '').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(finalValue) || Math.abs(finalValue - amount) > 0.01) {
    console.warn('[Avalisa] setTradeAmount: PO rejected amount. wanted:', valueStr, 'actual:', input.value);
    return false;
  }

  return true;
}

async function ensureDurationPanel() {
  const block = document.querySelector('.block--expiration-inputs');
  if (!block) return;

  const blockText = block.textContent || '';
  if (!blockText.includes('UTC')) return;

  console.log('[Avalisa] ensureDurationPanel: clock panel detected — switching to duration panel');

  const toggleSelectors = [
    '.block--expiration-inputs a',
    '.block--expiration-inputs .block__icon',
    '.block--expiration-inputs [class*="icon"]',
    '.block--expiration-inputs [class*="switch"]',
    '.block--expiration-inputs [class*="toggle"]',
    '.block--expiration-inputs button',
  ];

  for (const sel of toggleSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      console.log('[Avalisa] ensureDurationPanel: trying toggle selector:', sel);
      el.click();
      await sleep(700);
      if (!document.querySelector('.block--expiration-inputs')?.textContent?.includes('UTC')) {
        console.log('[Avalisa] ensureDurationPanel: switched successfully');
        return;
      }
    }
  }

  console.warn('[Avalisa] ensureDurationPanel: could not switch panels — logging block children to help diagnose:');
  block.querySelectorAll('*').forEach(el => {
    if (el.tagName && el.children.length === 0 && el.textContent.trim()) {
      console.log('[Avalisa]  child:', el.tagName, el.className, JSON.stringify(el.textContent.trim().substring(0, 30)));
    }
  });
}

async function setTimeframe(tf) {
  const tfTimeMap = {
    S30: '00:00:30',
    M1:  '00:01:00', M3:  '00:03:00',
    M5:  '00:05:00', M30: '00:30:00',
    H1:  '01:00:00',
  };
  const targetTime = tfTimeMap[tf];
  if (!targetTime) {
    console.warn('[Avalisa] setTimeframe: unknown tf:', tf);
    return null;
  }

  await ensureDurationPanel();

  const valEl = document.querySelector('.block--expiration-inputs .value__val');
  const current = valEl?.textContent?.trim();
  if (current === targetTime) {
    console.log('[Avalisa] setTimeframe: already set to', tf);
    return tf;
  }
  console.log('[Avalisa] setTimeframe: current =', current, '→ target =', tf, '(', targetTime, ')');

  const trigger = document.querySelector(
    '.block--expiration-inputs .control__value, ' +
    '.block--expiration-inputs .value__val'
  );
  if (trigger) {
    trigger.click();
    for (let i = 0; i < 25; i++) {
      await sleep(100);
      if (document.querySelectorAll('.dops__timeframes-item').length > 0) break;
    }
  }

  let items = document.querySelectorAll('.dops__timeframes-item');
  const clickItem = async (item, selectedTf, reason) => {
    item.click();
    console.log('[Avalisa] setTimeframe:', reason, selectedTf);
    await sleep(300);
    closePOPopovers();
    await sleep(700);
    return selectedTf;
  };

  for (const item of items) {
    const text = item.textContent.trim();
    if (text === tf) {
      return clickItem(item, tf, 'clicked grid item');
    }
  }

  for (const item of items) {
    const text = item.textContent.trim();
    if (text === targetTime) {
      return clickItem(item, tf, 'clicked item by time string');
    }
  }

  const fallbackTf = chooseAvailableTimeframeFallback(tf, items);
  if (fallbackTf) {
    const fallbackTime = tfTimeMap[fallbackTf];
    for (const item of items) {
      const text = item.textContent.trim();
      if (text === fallbackTf || text === fallbackTime) {
        console.warn('[Avalisa] setTimeframe: requested option unavailable, falling back', tf, '→', fallbackTf);
        return clickItem(item, fallbackTf, 'clicked fallback item');
      }
    }
  }

  console.warn('[Avalisa] setTimeframe: could not find option for', tf,
    '| items found:', items.length,
    '| texts:', Array.from(items).map(i => i.textContent.trim()));
  if (trigger) trigger.click();
  return null;
}

function chooseAvailableTimeframeFallback(preferredTf, items) {
  const tfTimeMap = {
    S30: '00:00:30',
    M1:  '00:01:00', M3:  '00:03:00',
    M5:  '00:05:00', M30: '00:30:00',
    H1:  '01:00:00',
  };
  const fallbackOrder = {
    S30: ['M1', 'M3', 'M5'],
    M1: ['S30', 'M3', 'M5'],
    M3: ['M1', 'M5', 'S30'],
    M5: ['M3', 'M1', 'S30'],
    M30: ['M5', 'M3', 'M1'],
    H1: ['M30', 'M5', 'M3', 'M1'],
  };
  const texts = new Set(Array.from(items || []).map(item => item.textContent.trim()));
  const choices = fallbackOrder[preferredTf] || ['M1', 'M3', 'M5', 'S30'];
  return choices.find(candidate => texts.has(candidate) || texts.has(tfTimeMap[candidate])) || null;
}

function closePOPopovers() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  document.body?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  document.querySelector('.chart-container, .trading-chart, main, body')?.click();
}

function isUsableTradeButton(el) {
  if (!(el instanceof Element)) return false;
  if (el.closest('#avalisa-overlay') || el.closest('#avalisa-panel')) return false;
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false;

  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

function resolveTradeButton(action, selectors) {
  for (const sel of selectors) {
    const btn = document.querySelector(sel);
    if (isUsableTradeButton(btn)) {
      console.log(`[Avalisa] ${action.toUpperCase()} button found with selector:`, sel);
      return btn;
    }
  }
  return null;
}

function clickCall() {
  const selectors = [
    'a.btn.btn-call',
    'button.btn.btn-call',
    '.trade-action--call',
    '.call-action',
    '[data-test="btn-call"]',
    '[data-action="call"]',
    '[class*="btn-call"]',
    '[class*="call-btn"]',
    'button[data-direction="call"]',
    'a[data-direction="call"]',
  ];
  const btn = resolveTradeButton('call', selectors);
  if (btn) { btn.click(); return true; }
  console.warn('[Avalisa] clickCall: no call button found. Tried:', selectors);
  return false;
}

function clickPut() {
  const selectors = [
    'a.btn.btn-put',
    'button.btn.btn-put',
    '.trade-action--put',
    '.put-action',
    '[data-test="btn-put"]',
    '[data-action="put"]',
    '[class*="btn-put"]',
    '[class*="put-btn"]',
    'button[data-direction="put"]',
    'a[data-direction="put"]',
  ];
  const btn = resolveTradeButton('put', selectors);
  if (btn) { btn.click(); return true; }
  console.warn('[Avalisa] clickPut: no put button found. Tried:', selectors);
  return false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getExpiryMs() {
  const tf = state.settings?.timeframe || 'M1';
  const settingsMs = (TF_TO_SECONDS[tf] || 60) * 1000;
  const domSeconds = getDurationSecondsFromDom();
  if (domSeconds) {
    const domMs = domSeconds * 1000;
    console.log('[Avalisa] Expiry from DOM:', domSeconds + 's | from settings:', settingsMs / 1000 + 's');
    return domMs;
  }

  console.log('[Avalisa] Expiry from settings (DOM failed):', settingsMs / 1000 + 's');
  return settingsMs;
}

function countDealElements() {
  const DEAL_SELECTORS = [
    '.deal', '.deals-list__item', '.active-trade',
    '[class*="deal-timer"]', '[class*="deals-list"] [class*="item"]', '.trade-result',
  ];
  let count = 0;
  for (const sel of DEAL_SELECTORS) {
    count += document.querySelectorAll(sel).length;
  }
  return count;
}

async function waitForTradeOpen(balanceBefore, amount, timeoutMs = 10000, dealCountBefore = null) {
  const threshold = balanceBefore - (amount * 0.3);
  const beforeCount = Number.isFinite(dealCountBefore) ? dealCountBefore : countDealElements();
  let sawNewDealElement = false;
  let lastBalance = balanceBefore;

  await sleep(1500);
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const dealCountNow = countDealElements();
    if (!sawNewDealElement && dealCountNow > beforeCount) {
      sawNewDealElement = true;
      console.log('[Avalisa] Trade DOM hint (count:', beforeCount, '→', dealCountNow, ') — waiting for balance deduction');
    }

    const bal = await getBalance();
    if (bal !== null) lastBalance = bal;
    if (bal !== null && bal <= threshold) {
      console.log('[Avalisa] Trade confirmed via balance drop:', balanceBefore, '→', bal);
      return { opened: true, balanceDuring: bal, method: 'balance-drop' };
    }

    await sleep(250);
  }

  const finalBal = await getBalance();
  console.warn('[Avalisa] waitForTradeOpen: no balance deduction — not counting trade. balance:', finalBal, 'was:', balanceBefore, 'domHint:', sawNewDealElement);
  return {
    opened: false,
    balanceDuring: finalBal ?? lastBalance ?? balanceBefore,
    method: sawNewDealElement ? 'dom-no-balance-drop' : 'timeout-no-balance-drop',
  };
}

function parsePayoutPercent(text) {
  if (!text) return null;
  const m = String(text).match(/\+?\s*(\d{1,3})\s*%/);
  if (!m) return null;
  const v = parseInt(m[1], 10);
  return v >= 0 && v <= 200 ? v : null;
}

function getCurrentPayoutPercent() {
  const directSelectors = [
    '.asset-select .asset__profit',
    '.current-symbol__profit',
    '.block--payout .value__val',
    '.block--profit .value__val',
    '.estimated-profit__val',
    '.profit-value',
    '[class*="payout"] .value__val',
    '[class*="profit"] .value__val',
  ];
  for (const sel of directSelectors) {
    const el = document.querySelector(sel);
    const v = parsePayoutPercent(el?.textContent);
    if (v !== null) return v;
  }
  const header = document.querySelector('.asset-select, .current-symbol, .assets-block, .header__asset');
  const v = parsePayoutPercent(header?.textContent);
  if (v !== null) return v;
  return null;
}

function getFavoritePairs() {
  const containerSelectors = [
    '.assets-favorites-list__item',
    '.favorite-list__item',
    '.pair-favorites__item',
    '.assets-block .favorites-list__item',
    '[class*="favorit"] [class*="item"]',
  ];
  const seen = new Set();
  const seenNames = new Set();
  const results = [];
  for (const sel of containerSelectors) {
    const nodes = document.querySelectorAll(sel);
    if (nodes.length === 0) continue;
    nodes.forEach(node => {
      if (seen.has(node)) return;
      seen.add(node);
      const nameEl = node.querySelector(
        '.assets-favorites-list__label, .asset__name, .pair-name, [class*="label"], [class*="name"]'
      );
      const name = (nameEl?.textContent || node.getAttribute('data-asset') || '').trim();
      const payout = parsePayoutPercent(node.textContent);
      const key = normalizeAssetName(name);
      if (name && payout !== null && !seenNames.has(key)) {
        seenNames.add(key);
        results.push({ name, payout, el: node });
      }
    });
    if (results.length > 0) break;
  }
  return results;
}

function clickFavoritePair(fav) {
  if (!fav || !fav.el) return false;
  try {
    fav.el.click();
    state.lastPairSwitchAt = Date.now();
    setTimeout(closePOPopovers, 400);
    return true;
  } catch (err) {
    console.warn('[Avalisa] Payout Monitor: click favorite failed', err);
    return false;
  }
}

function getPayoutSettings() {
  const minPct = Number.isFinite(+state.payoutMinPercent) ? +state.payoutMinPercent : 90;
  const action = state.payoutAction === 'keep'
    ? 'off'
    : (['off', 'stop', 'switch'].includes(state.payoutAction) ? state.payoutAction : 'switch');
  return { minPct, action };
}

async function checkPayoutBeforeTrade(options = {}) {
  const allowSwitch = options.allowSwitch !== false;
  const { minPct, action } = getPayoutSettings();
  const current = getCurrentPayoutPercent();

  if (current === null) {
    console.warn('[Avalisa] Payout Monitor: could not read current pair payout — proceeding');
    return { proceed: true };
  }
  console.log(`[Avalisa] Payout Monitor: current=${current}% threshold=${minPct}% action=${action}`);

  if (action === 'off' || current >= minPct) return { proceed: true };

  if (action === 'stop') {
    return { proceed: false, halt: true, reason: `Payout ${current}% below ${minPct}% threshold` };
  }

  if (!allowSwitch) {
    console.log('[Avalisa] Payout Monitor: auto-switch suppressed by current-pair AI mode');
    return { proceed: true };
  }

  const favorites = getFavoritePairs();
  if (favorites.length === 0) {
    return { proceed: false, halt: true, reason: 'Star at least 1 pair in PO Favorites to use Auto-switch.' };
  }
  favorites.sort((a, b) => b.payout - a.payout);
  const best = favorites[0];
  if (best.payout < minPct) {
    return { proceed: false, halt: true, reason: `No favorite >= ${minPct}% (highest ${best.payout}%)` };
  }

  const currentPair = (getCurrentPair() || '').trim();
  if (best.payout === current || best.name === currentPair) {
    return { proceed: true };
  }

  console.log(`[Avalisa] Payout Monitor: switching to ${best.name} (${best.payout}%)`);
  if (!clickFavoritePair(best)) {
    return { proceed: false, halt: true, reason: `Could not switch to ${best.name}` };
  }
  await sleep(1500);
  return { proceed: true };
}

function isDemoMode() {
  const labels = document.querySelectorAll('[class*="balance-info-block"] [class*="label"], [class*="balance__label"]');
  for (const el of labels) {
    if (el.textContent.includes('Demo')) return true;
  }
  const demoEl = document.querySelector('.js-balance-demo');
  if (demoEl && parseFloat(demoEl.textContent.replace(/[^0-9.]/g, '')) > 0) return true;
  return false;
}

function getCurrentPair() {
  const assetEl = document.querySelector('.asset-select .asset__name') ||
    document.querySelector('.current-symbol') ||
    document.querySelector('[class*="asset-name"]');
  return assetEl?.textContent?.trim() || 'UNKNOWN';
}
