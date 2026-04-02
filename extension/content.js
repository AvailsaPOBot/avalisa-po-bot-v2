/**
 * Avalisa PO Bot v2 — Content Script
 * Injected into pocketoption.com and po.cash
 * Uses DOM-click approach for maximum stability.
 */

const API_BASE = 'https://avalisa-backend.onrender.com';
const AFFILIATE_LINK = 'https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50';
const DASHBOARD_URL = 'https://avalisabot.vercel.app';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  running: false,
  isTradeOpen: false,
  currentAmount: 0,
  martingaleStep: 0,
  tradesCount: 0,
  lastDirection: null,
  licenseInfo: null,
  settings: null,
  jwt: null,
  userId: null,
  deviceFingerprint: null,
  stopRequested: false,
  cycleGeneration: 0,  // incremented on each start/stop; stale cycles self-terminate
};

// ─── Device Fingerprint ───────────────────────────────────────────────────────
function getDeviceFingerprint() {
  if (state.deviceFingerprint) return state.deviceFingerprint;
  const raw = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    navigator.hardwareConcurrency,
  ].join('|');
  // Simple hash
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  state.deviceFingerprint = Math.abs(hash).toString(36) + raw.length.toString(36);
  return state.deviceFingerprint;
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────
async function loadFromStorage() {
  return new Promise(resolve => {
    chrome.storage.local.get(['jwt', 'userId', 'settings'], data => {
      state.jwt = data.jwt || null;
      state.userId = data.userId || null;
      state.settings = data.settings || getDefaultSettings();
      resolve();
    });
  });
}

async function saveSettings(settings) {
  state.settings = { ...state.settings, ...settings };
  return new Promise(resolve => {
    chrome.storage.local.set({ settings: state.settings }, resolve);
  });
}

function getDefaultSettings() {
  return {
    strategy: 'martingale',
    timeframe: 'M1',
    direction: 'alternating',
    martingaleMultiplier: 2.0,
    martingaleSteps: 'infinite',
    delaySeconds: 6,
    startAmount: 1.0,
  };
}

// ─── API Helpers ──────────────────────────────────────────────────────────────
async function apiPost(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.jwt) headers['Authorization'] = `Bearer ${state.jwt}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return res.json();
}

// ─── License Check ────────────────────────────────────────────────────────────
async function checkLicense() {
  try {
    const data = await apiPost('/api/license/check', {
      userId: state.userId,
      deviceFingerprint: getDeviceFingerprint(),
    });
    state.licenseInfo = data;
    return data;
  } catch (err) {
    console.error('[Avalisa] License check failed:', err);
    return { allowed: false, reason: 'Network error' };
  }
}

async function incrementTrade() {
  try {
    await apiPost('/api/license/increment', {
      userId: state.userId,
      deviceFingerprint: getDeviceFingerprint(),
    });
  } catch (err) {
    console.error('[Avalisa] Increment failed:', err);
  }
}

// ─── DOM Helpers ──────────────────────────────────────────────────────────────
function getBalance() {
  const selectors = [
    '.js-balance-demo', '.js-balance-real',
    '.js-hd.js-balance-demo', '.js-hd.js-balance-real',
    '[class*="balance-demo"]', '[class*="balance-real"]',
    '.balance__value', '.header-balance',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = el.textContent.replace(/[^0-9.]/g, '');
      const val = parseFloat(text);
      if (val > 0) {
        console.log('[Avalisa] Balance found via:', sel, '=', val);
        return val;
      }
    }
  }
  console.warn('[Avalisa] Balance not found — tried all selectors');
  return null;
}

function setTradeAmount(amount) {
  // DOM-confirmed selector order (from DevTools inspection of PO's live DOM):
  // The real trade amount input is: .block--bet-amount .value__val input
  // It has NO name/class attributes — just type="text" autocomplete="off".
  // input[name="amount"] matches a DIFFERENT hidden input and must NOT be used first.
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
    // Skip any input that belongs to our own overlay
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

  // Focus and select-all so execCommand replaces the full existing value
  input.focus();
  input.select();

  // execCommand simulates real user typing — React picks this up reliably
  const typed = document.execCommand('insertText', false, valueStr);

  if (!typed) {
    // Fallback: native setter + synthetic events
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(input, valueStr);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Blur so React finalises the controlled value
  input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  return true;
}


/**
 * Detect if PO is showing the UTC clock panel (Panel 1) instead of
 * the duration panel (Panel 2).
 * Panel 1: .value__val shows a real clock time like "09:58:00" (total > 3600s)
 * Panel 2: .value__val shows a duration like "00:00:15" (total <= 3600s)
 * If on Panel 1, try to click the panel toggle to switch to Panel 2.
 */
async function ensureDurationPanel() {
  const block = document.querySelector('.block--expiration-inputs');
  if (!block) return;

  // Check if we're in UTC clock mode (text contains "UTC" is the clearest signal)
  const blockText = block.textContent || '';
  if (!blockText.includes('UTC')) return; // already on duration panel

  console.log('[Avalisa] ensureDurationPanel: clock panel detected — switching to duration panel');

  // Try toggle selectors inside the expiry block (not the dropdown trigger itself)
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
      // Check if we switched (UTC gone from block text)
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

/**
 * Set PO's expiry timeframe.
 * Always ensures the duration panel (Panel 2) is active first, then
 * opens the dropdown and clicks the matching .dops__timeframes-item.
 */
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
    return false;
  }

  // Switch to duration panel if UTC clock panel is showing
  await ensureDurationPanel();

  // Already set?
  const valEl = document.querySelector('.block--expiration-inputs .value__val');
  const current = valEl?.textContent?.trim();
  if (current === targetTime) {
    console.log('[Avalisa] setTimeframe: already set to', tf);
    return true;
  }
  console.log('[Avalisa] setTimeframe: current =', current, '→ target =', tf, '(', targetTime, ')');

  // Click the control value to open the dropdown
  const trigger = document.querySelector(
    '.block--expiration-inputs .control__value, ' +
    '.block--expiration-inputs .value__val'
  );
  if (trigger) {
    trigger.click();
    // Poll until .dops__timeframes-item elements appear (lazy-rendered on first open)
    for (let i = 0; i < 25; i++) {
      await sleep(100);
      if (document.querySelectorAll('.dops__timeframes-item').length > 0) break;
    }
  }

  // Try .dops__timeframes-item — Panel 2 items have no "+" prefix
  let items = document.querySelectorAll('.dops__timeframes-item');
  for (const item of items) {
    const text = item.textContent.trim();
    if (text === tf) {
      item.click();
      console.log('[Avalisa] setTimeframe: clicked grid item', tf);
      await sleep(300);
      return true;
    }
  }

  // Fallback: match on HH:MM:SS time string
  for (const item of items) {
    const text = item.textContent.trim();
    if (text === targetTime) {
      item.click();
      console.log('[Avalisa] setTimeframe: clicked item by time string', targetTime);
      await sleep(300);
      return true;
    }
  }

  console.warn('[Avalisa] setTimeframe: could not find option for', tf,
    '| items found:', items.length,
    '| texts:', Array.from(items).map(i => i.textContent.trim()));
  if (trigger) trigger.click(); // close dropdown
  return false;
}

function clickCall() {
  const btn = document.querySelector('a.btn.btn-call');
  if (btn) { btn.click(); return true; }
  return false;
}

function clickPut() {
  const btn = document.querySelector('a.btn.btn-put');
  if (btn) { btn.click(); return true; }
  return false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Trade Detection (balance-based, no DOM deal counting) ───────────────────

/**
 * Read PO's selected expiry duration from the UI timer element.
 * Screenshot-confirmed: .block--expiration-inputs .value__val contains "00:00:15" etc.
 * Returns milliseconds, defaulting to 60000 if unreadable.
 */
function getExpiryMs() {
  const el = document.querySelector('.block--expiration-inputs');
  if (el) {
    const match = el.textContent.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      const ms = (+match[1] * 3600 + +match[2] * 60 + +match[3]) * 1000;
      if (ms > 0 && ms <= 3600000) {
        console.log('[Avalisa] Expiry read from PO UI:', ms / 1000 + 's');
        return ms;
      }
    }
  }
  console.warn('[Avalisa] Could not read expiry time — defaulting to 60s');
  return 60000;
}

/**
 * Poll until balance drops by at least half the trade amount.
 * PO deducts the stake immediately on trade open, so this reliably
 * confirms the trade is open without depending on any deal-list DOM selectors.
 */
function waitForBalanceDrop(balanceBefore, amount, timeoutMs = 8000) {
  const threshold = balanceBefore - (amount * 0.5);
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const bal = getBalance();
      if (bal !== null && bal <= threshold) {
        console.log('[Avalisa] Trade open confirmed — balance dropped from', balanceBefore, 'to', bal);
        return resolve(bal);
      }
      if (Date.now() - start > timeoutMs) {
        console.warn('[Avalisa] waitForBalanceDrop: timeout — balance stayed at', bal);
        return reject(new Error('Trade open timeout'));
      }
      setTimeout(check, 200);
    };
    check();
  });
}

// ─── Trading Engine ───────────────────────────────────────────────────────────
function getNextDirection() {
  const dir = state.settings.direction;
  if (dir === 'call') return 'call';
  if (dir === 'put') return 'put';
  // alternating
  state.lastDirection = state.lastDirection === 'call' ? 'put' : 'call';
  return state.lastDirection;
}

async function runTradeCycle(generation) {
  // Stale cycle check — if bot was restarted this generation won't match
  if (generation !== state.cycleGeneration) return;
  if (state.stopRequested) return;

  // Guard: don't place a new trade while one is still open
  if (state.isTradeOpen) {
    console.log('[Avalisa] Trade already open, waiting...');
    updateStatus('running', 'Trade already open, waiting...');
    await sleep(3000);
    if (state.running && !state.stopRequested) runTradeCycle(generation);
    return;
  }

  // License check
  const license = await checkLicense();
  if (!license.allowed) {
    updateStatus('error', `Trade limit reached (${license.plan} plan)`);
    showLimitReachedMessage(license);
    state.running = false;
    updateUI();
    return;
  }

  // Strategy guard: free users can only use martingale
  if (license.plan === 'free' && state.settings.strategy !== 'martingale') {
    state.settings.strategy = 'martingale';
    updateStatus('error', 'Free plan: Martingale only. Upgrade for more strategies.');
  }

  const amount = state.currentAmount;
  if (!amount || amount <= 0) {
    state.currentAmount = parseFloat(state.settings.startAmount) || 1.0;
  }
  const safeAmount = state.currentAmount;
  const direction = getNextDirection();

  updateStatus('running', `Trade #${state.tradesCount + 1} — ${direction.toUpperCase()} $${safeAmount.toFixed(2)}`);

  // Set timeframe on page
  await setTimeframe(state.settings.timeframe || 'M1');

  // Set amount on page, then wait for React to process the change
  if (!setTradeAmount(safeAmount)) {
    updateStatus('error', 'Could not set trade amount — page may have changed');
    return;
  }
  await sleep(300);

  const balanceBefore = getBalance();
  console.log('[Avalisa] Balance before trade:', balanceBefore);

  // Read PO's expiry duration BEFORE clicking (timer is always visible in the UI)
  const expiryMs = getExpiryMs();

  // Place trade
  const placed = direction === 'call' ? clickCall() : clickPut();
  if (!placed) {
    updateStatus('error', `Could not find ${direction.toUpperCase()} button`);
    return;
  }

  // Wait for balance to drop — PO deducts stake immediately on trade open
  let balanceDuringTrade;
  try {
    balanceDuringTrade = await waitForBalanceDrop(balanceBefore, safeAmount, 8000);
  } catch {
    updateStatus('error', 'Trade did not open — balance did not drop');
    return;
  }

  state.isTradeOpen = true;
  console.log('[Avalisa] Trade confirmed open. isTradeOpen = true. Balance during:', balanceDuringTrade);

  // Safety: auto-clear after expiry + 30s buffer
  const tradeGuardTimeout = setTimeout(() => {
    if (state.isTradeOpen) {
      console.warn('[Avalisa] Safety timeout — clearing isTradeOpen');
      state.isTradeOpen = false;
    }
  }, expiryMs + 30000);

  state.tradesCount++;
  await incrementTrade();
  updateTradeCounter();

  // Wait for the trade to expire, then read balance change
  updateStatus('running', `Trade open — waiting ${Math.round(expiryMs / 1000)}s for result…`);
  await sleep(expiryMs + 3000);

  clearTimeout(tradeGuardTimeout);
  state.isTradeOpen = false;

  const balanceAfter = getBalance();
  // Compare against balanceDuringTrade (after stake was deducted):
  // WIN  → payout credited, balance rises above balanceDuringTrade
  // LOSS → no payout, balance stays at balanceDuringTrade
  const result = (balanceAfter !== null && balanceDuringTrade !== null && balanceAfter > balanceDuringTrade)
    ? 'win'
    : 'loss';
  console.log(`[Avalisa] Balance BEFORE: ${balanceBefore} | DURING: ${balanceDuringTrade} | AFTER: ${balanceAfter} → ${result.toUpperCase()}`);
  console.log('[Avalisa] Trade closed. Result:', result, '| isTradeOpen = false');

  // Log trade to backend
  if (state.jwt) {
    apiPost('/api/trades/log', {
      pair: getCurrentPair(),
      direction,
      amount: safeAmount,
      result,
      balanceBefore,
      balanceAfter,
    }).catch(console.error);
  }

  // Martingale logic
  applyMartingaleLogic(result);

  updateStatus('running', `Last: ${result.toUpperCase()} | Next: $${state.currentAmount.toFixed(2)}`);

  // Check if still running after update
  if (!state.running || state.stopRequested || generation !== state.cycleGeneration) return;

  // Delay between trades
  const delay = (state.settings.delaySeconds || 6) * 1000;
  await sleep(delay);

  if (state.running && !state.stopRequested && generation === state.cycleGeneration) {
    runTradeCycle(generation);
  }
}

function applyMartingaleLogic(result) {
  const s = state.settings;
  // Guard against undefined/NaN settings values from stale stored settings
  const multiplier = parseFloat(s.martingaleMultiplier) || 2.0;
  const startAmount = parseFloat(s.startAmount) || 1.0;
  const maxSteps = s.martingaleSteps === 'infinite' ? Infinity : (parseInt(s.martingaleSteps) || Infinity);

  if (result === 'loss') {
    if (state.martingaleStep < maxSteps) {
      state.martingaleStep++;
      state.currentAmount = parseFloat((state.currentAmount * multiplier).toFixed(2));
    } else {
      // Max steps reached — reset
      state.martingaleStep = 0;
      state.currentAmount = startAmount;
    }
  } else {
    // Win — reset
    state.martingaleStep = 0;
    state.currentAmount = startAmount;
  }
  console.log(`[Avalisa] Martingale: result=${result} step=${state.martingaleStep} nextAmount=${state.currentAmount} multiplier=${multiplier}`);
}

function getCurrentPair() {
  // Try to read the selected asset from the PO header
  const assetEl = document.querySelector('.asset-select .asset__name') ||
    document.querySelector('.current-symbol') ||
    document.querySelector('[class*="asset-name"]');
  return assetEl?.textContent?.trim() || 'UNKNOWN';
}

// ─── UI Overlay ────────────────────────────────────────────────────────────────
let overlayEl = null;

function injectOverlay() {
  if (document.getElementById('avalisa-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'avalisa-overlay';
  overlay.innerHTML = getOverlayHTML();

  const style = document.createElement('style');
  style.textContent = getOverlayCSS();

  document.head.appendChild(style);
  document.body.appendChild(overlay);
  overlayEl = overlay;

  bindOverlayEvents();
  updateUI();
}

function injectHeaderButton() {
  if (document.getElementById('avalisa-header-btn')) return;
  const header = document.querySelector('.header__right') ||
    document.querySelector('.header-right') ||
    document.querySelector('header');
  if (!header) return;

  const btn = document.createElement('button');
  btn.id = 'avalisa-header-btn';
  btn.textContent = 'Bot Menu';
  btn.style.cssText = `
    background: #7c3aed; color: #fff; border: none; border-radius: 6px;
    padding: 6px 14px; font-size: 13px; font-weight: 600; cursor: pointer;
    margin-left: 10px; z-index: 9999;
  `;
  btn.addEventListener('click', () => {
    const panel = document.getElementById('avalisa-overlay');
    if (panel) panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
  });
  header.appendChild(btn);
}

function getOverlayHTML() {
  return `
    <div id="avalisa-panel">
      <div class="av-header">
        <span class="av-logo">⚡ Avalisa Bot</span>
        <button id="av-close" class="av-icon-btn">✕</button>
      </div>

      <div id="av-auth-section" class="av-section">
        <div id="av-login-form">
          <input id="av-email" type="email" placeholder="Email" class="av-input" />
          <input id="av-password" type="password" placeholder="Password" class="av-input" />
          <button id="av-login-btn" class="av-btn av-btn-primary">Login</button>
          <button id="av-register-free-btn" class="av-btn av-btn-outline">Register Free</button>
        </div>
        <div id="av-logged-in" style="display:none">
          <span id="av-user-email" class="av-label"></span>
          <button id="av-logout-btn" class="av-btn av-btn-sm">Logout</button>
        </div>
      </div>

      <div class="av-section">
        <div class="av-row">
          <label class="av-label">Timeframe</label>
          <select id="av-timeframe" class="av-select">
            <option value="S30">S30 (30s)</option>
            <option value="M1" selected>M1 (1m)</option>
            <option value="M3">M3 (3m)</option>
            <option value="M5">M5 (5m)</option>
            <option value="M30">M30 (30m)</option>
            <option value="H1">H1 (1h)</option>
          </select>
        </div>
        <div class="av-row">
          <label class="av-label">Direction</label>
          <select id="av-direction" class="av-select">
            <option value="alternating">Alternating</option>
            <option value="call">Always Buy</option>
            <option value="put">Always Sell</option>
          </select>
        </div>
        <div class="av-row">
          <label class="av-label">Delay</label>
          <select id="av-delay" class="av-select">
            <option value="2">2s</option>
            <option value="4">4s</option>
            <option value="6" selected>6s</option>
            <option value="8">8s</option>
            <option value="10">10s</option>
            <option value="12">12s</option>
          </select>
        </div>
        <div class="av-row">
          <label class="av-label">Start Amount ($)</label>
          <input id="av-start-amount" type="number" min="1" step="1" value="1" class="av-input av-input-sm" />
        </div>
        <div class="av-row">
          <label class="av-label">Martingale ×</label>
          <select id="av-multiplier" class="av-select">
            <option value="2.0" selected>2.0×</option>
            <option value="2.2">2.2×</option>
            <option value="2.4">2.4×</option>
            <option value="2.6">2.6×</option>
            <option value="2.8">2.8×</option>
            <option value="3.0">3.0×</option>
          </select>
        </div>
        <div class="av-row">
          <label class="av-label">Martingale Steps</label>
          <select id="av-steps" class="av-select">
            <option value="infinite" selected>Infinite</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
            <option value="6">6</option>
            <option value="8">8</option>
            <option value="10">10</option>
            <option value="12">12</option>
          </select>
        </div>
      </div>

      <div class="av-section av-controls">
        <button id="av-start-btn" class="av-btn av-btn-green">▶ Start</button>
        <button id="av-stop-btn" class="av-btn av-btn-red" disabled>■ Stop</button>
      </div>

      <div class="av-section">
        <div id="av-status" class="av-status">Status: Stopped</div>
        <div id="av-trade-counter" class="av-counter">Trades: 0</div>
      </div>

      <div id="av-limit-msg" class="av-limit-msg" style="display:none">
        <p>🚫 Trade limit reached!</p>
        <a id="av-affiliate-link" class="av-btn av-btn-primary" target="_blank">Register Free Account</a>
        <a id="av-upgrade-link" class="av-btn av-btn-outline" target="_blank">Upgrade Plan</a>
      </div>
    </div>
  `;
}

function getOverlayCSS() {
  return `
    #avalisa-overlay {
      position: fixed; top: 80px; right: 20px; z-index: 999999;
      display: flex; font-family: 'Inter', system-ui, sans-serif;
    }
    #avalisa-panel {
      background: #1a1a2e; border: 1px solid #2d2d5b; border-radius: 12px;
      padding: 16px; width: 280px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      color: #e2e8f0;
    }
    .av-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .av-logo { font-size: 15px; font-weight: 700; color: #a78bfa; }
    .av-icon-btn { background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 14px; }
    .av-icon-btn:hover { color: #e2e8f0; }
    .av-section { margin-bottom: 12px; border-bottom: 1px solid #2d2d5b; padding-bottom: 12px; }
    .av-section:last-child { border-bottom: none; margin-bottom: 0; }
    .av-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .av-label { font-size: 12px; color: #94a3b8; }
    .av-select, .av-input {
      background: #0f0f23; border: 1px solid #2d2d5b; border-radius: 6px;
      color: #e2e8f0; font-size: 12px; padding: 4px 8px;
    }
    .av-select { min-width: 110px; }
    .av-input { width: 100%; box-sizing: border-box; margin-top: 4px; padding: 6px 10px; }
    .av-input-sm { width: 90px; }
    .av-controls { display: flex; gap: 8px; }
    .av-btn {
      border: none; border-radius: 6px; padding: 8px 14px; font-size: 13px;
      font-weight: 600; cursor: pointer; transition: opacity 0.2s; flex: 1;
    }
    .av-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .av-btn-primary { background: #7c3aed; color: #fff; }
    .av-btn-outline { background: transparent; border: 1px solid #7c3aed; color: #a78bfa; }
    .av-btn-green { background: #059669; color: #fff; }
    .av-btn-red { background: #dc2626; color: #fff; }
    .av-btn-sm { padding: 4px 10px; font-size: 11px; flex: none; }
    #av-logout-btn { background: #dc2626; color: #ffffff; }
    .av-status { font-size: 12px; color: #a78bfa; margin-bottom: 4px; }
    .av-status.error { color: #f87171; }
    .av-status.running { color: #34d399; }
    .av-counter { font-size: 11px; color: #64748b; }
    .av-limit-msg { text-align: center; font-size: 12px; }
    .av-limit-msg p { color: #fbbf24; margin-bottom: 8px; }
    .av-limit-msg .av-btn { display: block; text-align: center; text-decoration: none; margin-bottom: 6px; }
    #av-auth-section input.av-input { margin-bottom: 6px; }
    #av-login-btn, #av-register-free-btn { width: 100%; margin-bottom: 6px; }
    #av-logged-in { display: flex; justify-content: space-between; align-items: center; }
  `;
}

function bindOverlayEvents() {
  // Close button
  document.getElementById('av-close').addEventListener('click', () => {
    document.getElementById('avalisa-overlay').style.display = 'none';
  });

  // Login
  document.getElementById('av-login-btn').addEventListener('click', handleLogin);

  // Register free
  document.getElementById('av-register-free-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_TAB', url: AFFILIATE_LINK });
  });

  // Logout
  document.getElementById('av-logout-btn').addEventListener('click', handleLogout);

  // Start/Stop
  document.getElementById('av-start-btn').addEventListener('click', startBot);
  document.getElementById('av-stop-btn').addEventListener('click', stopBot);

  // Settings changes — auto-save
  ['av-timeframe', 'av-direction', 'av-delay', 'av-multiplier', 'av-steps'].forEach(id => {
    document.getElementById(id).addEventListener('change', saveCurrentSettings);
  });
  document.getElementById('av-start-amount').addEventListener('change', saveCurrentSettings);

  // Limit message links
  document.getElementById('av-affiliate-link').href = AFFILIATE_LINK;
  document.getElementById('av-upgrade-link').href = `${DASHBOARD_URL}/pricing`;
}

async function handleLogin() {
  const email = document.getElementById('av-email').value.trim();
  const password = document.getElementById('av-password').value;
  if (!email || !password) return;

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      updateStatus('error', data.error || 'Login failed');
      return;
    }
    state.jwt = data.token;
    state.userId = data.user.id;
    await chrome.storage.local.set({ jwt: data.token, userId: data.user.id, userEmail: email });
    updateUI();
    updateStatus('running', 'Logged in!');
  } catch (err) {
    updateStatus('error', 'Login error — check connection');
  }
}

function handleLogout() {
  state.jwt = null;
  state.userId = null;
  chrome.storage.local.remove(['jwt', 'userId', 'userEmail']);
  updateUI();
}

function diagnosePOInterface() {
  console.log('[Avalisa] === PO INTERFACE DIAGNOSTIC ===');

  // Find timeframe elements by keyword
  const tfKeywords = ['timeframe', 'time-frame', 'duration', 'expir', 'period'];
  tfKeywords.forEach(kw => {
    const els = document.querySelectorAll(`[class*="${kw}"], [data-${kw}]`);
    if (els.length) {
      els.forEach(el => console.log(`[Avalisa] TF element (${kw}):`, el.className, el.textContent.trim().substring(0, 50)));
    }
  });

  // Find all buttons/clickable elements with time-like text
  document.querySelectorAll('button, [role="button"], li, .item').forEach(el => {
    const text = el.textContent.trim();
    if (/^(S\d+|M\d+|H\d+|\d+[smh])$/i.test(text)) {
      console.log('[Avalisa] Time button found:', el.tagName, el.className, text);
    }
  });

  // Find all input elements
  const inputs = document.querySelectorAll('input');
  inputs.forEach(inp => {
    console.log('[Avalisa] Input found:', inp.className, inp.name, inp.type, inp.value);
  });

  // Find active/selected element
  const active = document.querySelector('.active, .selected, [aria-selected="true"]');
  if (active) console.log('[Avalisa] Active element:', active.className, active.textContent.trim());

  console.log('[Avalisa] === END DIAGNOSTIC ===');
}

async function startBot() {
  if (state.running) return;

  diagnosePOInterface();

  await saveCurrentSettings();
  const license = await checkLicense();

  if (!license.allowed) {
    showLimitReachedMessage(license);
    return;
  }

  state.cycleGeneration++;           // invalidates any still-running old cycles
  state.running = true;
  state.stopRequested = false;
  state.isTradeOpen = false;         // clear any stale open-trade flag from last run
  state.currentAmount = parseFloat(state.settings.startAmount) || 1.0;
  state.martingaleStep = 0;

  const gen = state.cycleGeneration;
  updateUI();
  updateStatus('running', 'Starting...');
  runTradeCycle(gen);
}

function stopBot() {
  state.cycleGeneration++;           // invalidates any running cycle immediately
  state.running = false;
  state.stopRequested = true;
  state.isTradeOpen = false;
  updateUI();
  updateStatus('', 'Stopped');
}

async function saveCurrentSettings() {
  const settings = {
    timeframe: document.getElementById('av-timeframe').value,
    direction: document.getElementById('av-direction').value,
    delaySeconds: parseInt(document.getElementById('av-delay').value),
    martingaleMultiplier: parseFloat(document.getElementById('av-multiplier').value),
    martingaleSteps: document.getElementById('av-steps').value,
    startAmount: parseFloat(document.getElementById('av-start-amount').value) || 1.0,
  };
  await saveSettings(settings);

  // Sync to backend if logged in
  if (state.jwt) {
    apiPost('/api/settings', settings).catch(console.error);
  }
}

function updateUI() {
  const startBtn = document.getElementById('av-start-btn');
  const stopBtn = document.getElementById('av-stop-btn');
  const loginForm = document.getElementById('av-login-form');
  const loggedIn = document.getElementById('av-logged-in');

  if (startBtn) startBtn.disabled = state.running;
  if (stopBtn) stopBtn.disabled = !state.running;

  // Auth UI
  if (state.jwt) {
    if (loginForm) loginForm.style.display = 'none';
    if (loggedIn) loggedIn.style.display = 'flex';
    chrome.storage.local.get('userEmail', data => {
      const emailEl = document.getElementById('av-user-email');
      if (emailEl && data.userEmail) emailEl.textContent = data.userEmail;
    });
  } else {
    if (loginForm) loginForm.style.display = 'block';
    if (loggedIn) loggedIn.style.display = 'none';
  }

  // Load settings into UI
  const s = state.settings;
  if (s) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    set('av-timeframe', (s.timeframe === 'S15' ? 'S30' : s.timeframe) || 'M1');
    set('av-direction', s.direction || 'alternating');
    set('av-delay', s.delaySeconds || 6);
    set('av-multiplier', parseFloat(s.martingaleMultiplier || 2.0).toFixed(1));
    set('av-steps', s.martingaleSteps || 'infinite');
    set('av-start-amount', s.startAmount || 1.0);
  }
}

function updateStatus(type, message) {
  const el = document.getElementById('av-status');
  if (!el) return;
  el.textContent = `Status: ${message}`;
  el.className = `av-status${type ? ' ' + type : ''}`;
}

function updateTradeCounter() {
  const el = document.getElementById('av-trade-counter');
  if (!el) return;
  const license = state.licenseInfo;
  if (license?.plan === 'free') {
    el.textContent = `Trades: ${license.tradesUsed || state.tradesCount} / ${license.tradesLimit} free`;
  } else if (license?.plan === 'basic') {
    el.textContent = `Trades: ${license.tradesUsed} / ${license.tradesLimit}`;
  } else {
    el.textContent = `Trades this session: ${state.tradesCount}`;
  }
}

function showLimitReachedMessage(license) {
  const limitMsg = document.getElementById('av-limit-msg');
  if (limitMsg) limitMsg.style.display = 'block';
  updateStatus('error', license?.reason || 'Limit reached');
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  await loadFromStorage();
  injectOverlay();

  // Wait for PO header to render before injecting button
  const headerInterval = setInterval(() => {
    const header = document.querySelector('.header__right, .header-right, header');
    if (header) {
      injectHeaderButton();
      clearInterval(headerInterval);
    }
  }, 1000);
}

// Wait for page to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
