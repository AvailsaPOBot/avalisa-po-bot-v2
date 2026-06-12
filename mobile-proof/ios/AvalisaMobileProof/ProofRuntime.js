(function () {
  if (window.AvalisaProof && window.AvalisaProof.version) return;

  const MAX_CANDLES = 50;
  const BOT_STORAGE_KEY = 'avalisa.mobileProof.botState.v1';
  const AUTH_STORAGE_KEY = 'avalisa.webappBot.auth.v1';
  const DEVICE_STORAGE_KEY = 'avalisa.webappBot.deviceFingerprint.v1';
  const API_BASE = 'https://avalisa-backend.onrender.com';
  const API_TIMEOUT_MS = 15000;
  const REQUIRED_CANDLES_BY_INTENSITY = { low: 12, mid: 20, high: 30 };
  const TF_TO_SECONDS = { S30: 30, M1: 60, M3: 180, M5: 300 };
  const SECONDS_TO_TF = { 30: 'S30', 60: 'M1', 180: 'M3', 300: 'M5' };
  const AI_THRESHOLDS = {
    low: { minConfidence: 35, regimeSlopeThreshold: 0.4, volLowThreshold: 0.0004, volHighThreshold: 0.0030, rsiLow: 35, rsiHigh: 65, bbK: 1.5, rulesRequiredRanging: 1, pullbackRsiLow: 40, pullbackRsiHigh: 60, pullbackBbK: 0.7, rulesRequiredTrending: 2, skipOTC: false, requireCandleConfirm: false },
    mid: { minConfidence: 68, regimeSlopeThreshold: 0.3, volLowThreshold: 0.0005, volHighThreshold: 0.0025, rsiLow: 30, rsiHigh: 70, bbK: 2.0, rulesRequiredRanging: 2, pullbackRsiLow: 40, pullbackRsiHigh: 60, pullbackBbK: 0.6, rulesRequiredTrending: 3, skipOTC: false, requireCandleConfirm: true },
    high: { minConfidence: 95, regimeSlopeThreshold: 0.25, volLowThreshold: 0.0006, volHighThreshold: 0.0020, rsiLow: 25, rsiHigh: 75, bbK: 2.5, rulesRequiredRanging: 4, pullbackRsiLow: 42, pullbackRsiHigh: 58, pullbackBbK: 0.5, rulesRequiredTrending: 4, skipOTC: true, requireCandleConfirm: true },
  };
  const defaultSettings = {
    strategy: 'martingale',
    timeframe: 'S30',
    direction: 'alternating',
    startAmount: 1,
    martingaleMultiplier: 2,
    martingaleSteps: 'infinite',
    delaySeconds: 6,
    intensity: 'low',
    aiPairMode: 'current',
    payoutMinPercent: 90,
    payoutAction: 'switch',
    maxProofTrades: 0,
    maxProofAmount: 64,
    mobileAmountFallback: 'stop',
  };
  const state = {
    version: '1.02-local-proof',
    jwt: null,
    userId: null,
    userEmail: null,
    authStatus: 'logged_out',
    licenseInfo: null,
    licenseAllowed: false,
    licensePlan: 'free',
    licenseReason: null,
    tradesRemaining: null,
    tradesLimit: null,
    aiTradesUsed: null,
    aiTradesAllowance: null,
    deviceFingerprint: null,
    pageState: 'loading',
    demoMode: 'unknown',
    activePair: '-',
    activePeriod: null,
    candleBuffer: {},
    duration: '-',
    balance: '-',
    payout: '-',
    hasAmountInput: false,
    hasCallButton: false,
    hasPutButton: false,
    wsSeen: false,
    historySeen: false,
    tickSeen: false,
    pairScanEnabled: false,
    botRunning: false,
    botMode: 'stopped',
    martingaleStep: 0,
    nextAmount: 1,
    botTradesRemaining: 0,
    botBaselineBalance: null,
    botBalanceBeforeTrade: null,
    botPendingDirection: null,
    botPendingAmount: null,
    botTradeStartTs: null,
    botInTrade: false,
    tradeLock: false,
    tradesCount: 0,
    settings: { ...defaultSettings },
    lastDirection: null,
    lastSignal: null,
    lastResult: '-',
    lastPlacedAmount: 1,
    lastAmountDebug: 'amount: idle',
    lastOrderDebug: 'order template: none',
    aiSkipStreak: 0,
    lastTradeStatus: 'Read-only until account mode is confirmed.',
    guidance: 'Log in to PO, confirm Demo or Real account mode, then tap Scan.',
  };
  let botTimer = null;
  let interimTimer = null;
  let latestTradeWs = null;
  let latestTradeSend = null;

  function persistBotState(phase = 'idle') {
    try {
      window.localStorage.setItem(BOT_STORAGE_KEY, JSON.stringify({
        savedAt: Date.now(),
        phase,
        botRunning: state.botRunning,
        botInTrade: state.botInTrade,
        botMode: state.botMode,
        martingaleStep: state.martingaleStep,
        nextAmount: state.nextAmount,
        botTradesRemaining: state.botTradesRemaining,
        tradesCount: state.tradesCount,
        lastDirection: state.lastDirection,
        settings: state.settings,
      }));
    } catch (_) {}
  }

  function clearBotState() {
    try { window.localStorage.removeItem(BOT_STORAGE_KEY); } catch (_) {}
  }

  function restoreBotState() {
    let saved;
    try { saved = JSON.parse(window.localStorage.getItem(BOT_STORAGE_KEY) || 'null'); } catch (_) { return false; }
    if (!saved || Date.now() - Number(saved.savedAt || 0) > 10 * 60 * 1000) {
      clearBotState();
      return false;
    }
    state.settings = { ...state.settings, ...(saved.settings || {}) };
    state.martingaleStep = Math.max(0, Number(saved.martingaleStep) || 0);
    state.nextAmount = Math.max(1, Number(saved.nextAmount) || state.settings.startAmount || 1);
    state.botTradesRemaining = Math.max(0, Number(saved.botTradesRemaining) || 0);
    state.tradesCount = Math.max(0, Number(saved.tradesCount) || 0);
    state.lastDirection = saved.lastDirection || null;
    state.botMode = saved.botMode || 'demo-martingale';
    if (saved.botRunning && !saved.botInTrade && state.botTradesRemaining >= 0) {
      state.botRunning = true;
      state.botInTrade = false;
      state.tradeLock = false;
      state.lastTradeStatus = `restored bot loop: next $${state.nextAmount}`;
      return true;
    }
    clearBotState();
    return false;
  }

  function getDeviceFingerprint() {
    if (state.deviceFingerprint) return state.deviceFingerprint;
    let saved = '';
    try { saved = window.localStorage.getItem(DEVICE_STORAGE_KEY) || ''; } catch (_) {}
    if (!saved) {
      const randomPart = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      saved = `webapp-${randomPart}`;
      try { window.localStorage.setItem(DEVICE_STORAGE_KEY, saved); } catch (_) {}
    }
    state.deviceFingerprint = saved;
    return saved;
  }

  function persistAuth() {
    try {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
        jwt: state.jwt,
        userId: state.userId,
        userEmail: state.userEmail,
        savedAt: Date.now(),
      }));
    } catch (_) {}
  }

  function clearAuth() {
    state.jwt = null;
    state.userId = null;
    state.userEmail = null;
    state.authStatus = 'logged_out';
    state.licenseInfo = null;
    state.licenseAllowed = false;
    state.licensePlan = 'free';
    state.licenseReason = null;
    state.tradesRemaining = null;
    state.tradesLimit = null;
    state.aiTradesUsed = null;
    state.aiTradesAllowance = null;
    try { window.localStorage.removeItem(AUTH_STORAGE_KEY); } catch (_) {}
  }

  function restoreAuth() {
    let saved = null;
    try { saved = JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) || 'null'); } catch (_) {}
    if (!saved?.jwt) return false;
    state.jwt = saved.jwt;
    state.userId = saved.userId || null;
    state.userEmail = saved.userEmail || null;
    state.authStatus = 'restoring';
    return true;
  }

  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const tid = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      window.clearTimeout(tid);
    }
  }

  async function apiRequest(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (state.jwt) headers.Authorization = `Bearer ${state.jwt}`;
    const response = await fetchWithTimeout(`${API_BASE}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function applyLicenseInfo(license) {
    state.licenseInfo = license || null;
    state.licenseAllowed = !!license?.allowed;
    state.licensePlan = license?.plan || 'free';
    state.licenseReason = license?.reason || null;
    state.tradesRemaining = license?.tradesRemaining ?? null;
    state.tradesLimit = license?.tradesLimit ?? null;
    state.aiTradesUsed = license?.aiTradesUsed ?? null;
    state.aiTradesAllowance = license?.aiTradesAllowance ?? null;
    if (state.jwt && state.authStatus !== 'error') state.authStatus = 'logged_in';
    if (!state.jwt && state.authStatus !== 'error') state.authStatus = 'free_tier';
    return license;
  }

  async function checkLicense() {
    state.authStatus = state.jwt ? 'checking_license' : 'checking_free_tier';
    post();
    try {
      const license = await apiRequest('/api/license/check', {
        method: 'POST',
        body: JSON.stringify({ deviceFingerprint: getDeviceFingerprint() }),
      });
      return applyLicenseInfo(license);
    } catch (error) {
      state.authStatus = 'error';
      state.licenseAllowed = false;
      state.licenseReason = error.message || 'License check failed';
      post();
      return { allowed: false, reason: state.licenseReason, _networkError: true };
    }
  }

  function aiAllowanceBlock(license) {
    if (state.settings.strategy !== 'ai') return null;
    if (license?.plan === 'free') return 'Avalisa AI requires Basic or Pro.';
    if (state.demoMode === 'real' && Number.isFinite(license?.aiTradesAllowance)) {
      const used = Number(license.aiTradesUsed || 0);
      if (used >= Number(license.aiTradesAllowance)) return 'AI trade allowance exhausted.';
    }
    return null;
  }

  async function ensureTradeAccess() {
    const license = await checkLicense();
    if (!license.allowed) {
      state.lastTradeStatus = `blocked: ${license.reason || 'trade limit reached'}`;
      post();
      return false;
    }
    const aiBlock = aiAllowanceBlock(license);
    if (aiBlock) {
      state.lastTradeStatus = `blocked: ${aiBlock}`;
      post();
      return false;
    }
    return true;
  }

  async function incrementTradeUsage() {
    try {
      await apiRequest('/api/license/increment', {
        method: 'POST',
        body: JSON.stringify({ deviceFingerprint: getDeviceFingerprint() }),
      });
      await checkLicense();
    } catch (error) {
      state.lastTradeStatus = `trade counted locally; backend increment failed: ${error.message || error}`;
      post();
    }
  }

  async function logTradeResult({ direction, amount, result, balanceBefore, balanceAfter }) {
    if (!state.jwt) return;
    try {
      await apiRequest('/api/trades/log', {
        method: 'POST',
        body: JSON.stringify({
          pair: state.activePair || 'UNKNOWN',
          direction,
          amount,
          result,
          balanceBefore,
          balanceAfter,
          isDemo: state.demoMode !== 'real',
          strategy: state.settings.strategy || 'martingale',
          timeframe: state.duration || state.settings.timeframe || 'S30',
          signalSnapshot: state.settings.strategy === 'ai'
            ? { source: 'webapp-bot', lastSignal: state.lastSignal }
            : null,
        }),
      });
    } catch (error) {
      state.lastTradeStatus = `trade resolved; backend log failed: ${error.message || error}`;
      post();
    }
  }

  async function login(email, password) {
    if (!email || !password) {
      state.authStatus = 'error';
      state.lastTradeStatus = 'login failed: email and password are required';
      post();
      return statusPayload();
    }
    state.authStatus = 'logging_in';
    post();
    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      state.jwt = data.token;
      state.userId = data.user?.id || null;
      state.userEmail = data.user?.email || email;
      state.authStatus = 'logged_in';
      persistAuth();
      await checkLicense();
      state.lastTradeStatus = `logged in as ${state.userEmail}`;
      post();
      return statusPayload();
    } catch (error) {
      clearAuth();
      state.authStatus = 'error';
      state.lastTradeStatus = `login failed: ${error.message || error}`;
      post();
      return statusPayload();
    }
  }

  async function logout() {
    clearAuth();
    await checkLicense();
    state.lastTradeStatus = 'logged out; using free tier if available';
    post();
    return statusPayload();
  }

  function statusPayload() {
    return {
      pageState: state.pageState,
      authStatus: state.authStatus,
      userId: state.userId,
      userEmail: state.userEmail,
      licenseAllowed: state.licenseAllowed,
      licensePlan: state.licensePlan,
      licenseReason: state.licenseReason,
      tradesRemaining: state.tradesRemaining,
      tradesLimit: state.tradesLimit,
      aiTradesUsed: state.aiTradesUsed,
      aiTradesAllowance: state.aiTradesAllowance,
      demoMode: state.demoMode,
      activePair: state.activePair || '-',
      duration: state.duration || '-',
      balance: state.balance || '-',
      payout: state.payout || '-',
      candleCount: getBufferedCandles().length,
      hasAmountInput: state.hasAmountInput,
      hasCallButton: state.hasCallButton,
      hasPutButton: state.hasPutButton,
      pairScanEnabled: state.pairScanEnabled,
      botRunning: state.botRunning,
      botMode: state.botMode,
      martingaleStep: state.martingaleStep,
      nextAmount: state.nextAmount,
      botTradesRemaining: state.botTradesRemaining,
      tradesCount: state.tradesCount,
      settings: state.settings,
      lastSignal: state.lastSignal,
      lastResult: state.lastResult,
      lastTradeStatus: state.lastTradeStatus,
      lastAmountDebug: state.lastAmountDebug,
      lastOrderDebug: state.lastOrderDebug,
      guidance: state.guidance,
    };
  }

  function snapshot() {
    return JSON.stringify(statusPayload());
  }

  function post() {
    try {
      window.webkit?.messageHandlers?.avalisaProof?.postMessage(snapshot());
    } catch (_) {}
    try { updateHud(); } catch (_) {}
  }

  function text(el) {
    return (el && el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[char]);
  }

  function visible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }

  function normalizeAssetName(name) {
    if (!name) return name;
    return String(name).replace(/\s+OTC$/i, '_otc').replace(/\//g, '').trim();
  }

  function hasTradingMarkers() {
    const body = text(document.body);
    return /\b[A-Z]{3}\/[A-Z]{3}(?:\s+OTC)?\b/.test(body) ||
      /\bAmount\s+\d+(?:[.,]\d{1,2})?\b/i.test(body) ||
      /\bPayout\b/i.test(body) ||
      /\bTRADING\b/i.test(body);
  }

  function enforceMobileViewport() {
    try {
      let viewport = document.querySelector('meta[name="viewport"]');
      if (!viewport) {
        viewport = document.createElement('meta');
        viewport.name = 'viewport';
        document.head?.appendChild(viewport);
      }
      viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
    } catch (_) {}
  }

  function inferPair() {
    const visiblePairSelectors = [
      '[class*="current-symbol"]',
      '[class*="symbol-current"]',
      '[class*="assets"] [class*="current"]',
      '.current-symbol',
      '.asset-name',
    ];
    const selectors = state.pairScanEnabled
      ? visiblePairSelectors.concat(['[class*="pair"]'])
      : visiblePairSelectors;
    for (const selector of selectors) {
      const value = text(document.querySelector(selector));
      if (/^[A-Z]{3}\/?[A-Z]{3}|OTC|USD|BTC|ETH|JPY|EUR/i.test(value)) return normalizeAssetName(value);
    }
    const bodyText = text(document.body).match(/\b[A-Z]{3}\/[A-Z]{3}(?:\s+OTC)?\b/);
    return bodyText ? normalizeAssetName(bodyText[0]) : state.activePair;
  }

  function inferDuration() {
    const selectors = [
      '.block--expiration-inputs',
      '[class*="expiration"]',
      '[class*="duration"]',
      '[class*="timeframe"]',
    ];
    for (const selector of selectors) {
      const value = text(document.querySelector(selector));
      const match = value.match(/\b\d{2}:\d{2}:\d{2}\b|\b(?:30s|1m|3m|5m|M1|M3|M5)\b/i);
      if (match) return match[0];
    }
    const bodyMatch = text(document.body).match(/\bTime\s+(\d{2}:\d{2}:\d{2})\b/i);
    if (bodyMatch) return bodyMatch[1];
    return state.duration;
  }

  function canTradeCurrentAccount() {
    return state.demoMode === 'confirmed' || state.demoMode === 'real';
  }

  function accountModeLabel() {
    if (state.demoMode === 'real') return 'real';
    if (state.demoMode === 'confirmed') return 'demo';
    return state.demoMode || 'unknown';
  }

  function botModeName() {
    const account = accountModeLabel();
    const strategy = state.settings.strategy === 'ai' ? 'ai' : 'martingale';
    return `${account}-${strategy}`;
  }

  function inferBalanceAndMode() {
    const bodyText = text(document.body);
    const demoSelectors = [
      '.js-balance-demo',
      '[class*="balance-demo"]',
      '[data-testid*="demo-balance" i]',
      '[aria-label*="demo balance" i]',
    ];
    const realSelectors = [
      '.js-balance-real',
      '.js-balance-real-USD',
      '[class*="balance-real"]',
      '[data-testid*="real-balance" i]',
      '[aria-label*="real balance" i]',
    ];
    const demoEl = demoSelectors.map(s => document.querySelector(s)).find(visible);
    const realEl = realSelectors.map(s => document.querySelector(s)).find(visible);
    const accountModeText = bodyText.match(/\bQT\s+(?:Real|Demo)\b/i)?.[0] || '';

    const pathSaysDemo = /\bdemo\b/i.test(location.pathname);
    const pathSaysReal = /\/cabinet\/quick-high-low\b/i.test(location.pathname) && !pathSaysDemo;
    const labelSaysReal = /\bQT\s+Real\b/i.test(accountModeText);
    const labelSaysDemo = /\bQT\s+Demo\b|\bPractice\b/i.test(accountModeText);
    const realDetected = pathSaysReal || labelSaysReal || (!pathSaysDemo && !labelSaysDemo && !!realEl);
    const demoConfirmed = !realDetected && (pathSaysDemo || labelSaysDemo || !!demoEl);

    // PO may keep demo-balance DOM populated while a real account is active.
    // Pick the balance from the active mode first so real sessions never read
    // stale demo balance and resolve every real trade as unchanged/tie.
    let balanceText = realDetected
      ? (text(realEl) || activeAccountBalanceText(bodyText) || text(demoEl))
      : (text(demoEl) || activeAccountBalanceText(bodyText) || text(realEl));
    if (!balanceText) {
      const match = bodyText.match(/\$\s?\d+(?:[.,]\d{1,2})?/);
      balanceText = match ? match[0] : '-';
    }

    state.demoMode = realDetected ? 'real' : (demoConfirmed ? 'confirmed' : 'unknown');
    state.balance = balanceText || '-';

    // Mobile PO: account selector shows e.g. "QT Real USD 0" or "QT Demo USD 10000"
    // Fall back to reading that text when CSS-class approach leaves mode unknown.
    if (state.demoMode === 'unknown') {
      const acctSelectors = [
        '[class*="account-type"]', '[class*="account_type"]',
        '[class*="account-selector"]', '[class*="accountSelector"]',
        '[class*="balance-type"]', '[class*="balance_type"]',
        '[class*="header"] [class*="account"]',
      ];
      const acctText = acctSelectors.reduce((found, s) => found || text(document.querySelector(s)), '')
        || text(document.body).match(/QT\s+(?:Real|Demo)[^)]{0,30}/i)?.[0]
        || '';
      if (/\bReal\b/i.test(acctText)) state.demoMode = 'real';
      else if (/\bDemo\b|Practice/i.test(acctText)) state.demoMode = 'confirmed';
    }

    if (state.demoMode === 'real') {
      state.guidance = state.pairScanEnabled
        ? 'Real account confirmed. Auto pair scan is on; Start Bot can place real-money trades.'
        : 'Real account confirmed. Single visible pair mode is on; Start Bot can place real-money trades.';
    } else if (state.demoMode === 'confirmed') {
      state.guidance = state.pairScanEnabled
        ? 'Demo confirmed. Auto pair scan is on; Start Bot can place demo trades.'
        : 'Demo confirmed. Single visible pair mode is on; Start Bot can place demo trades.';
    } else {
      state.guidance = state.pageState === 'login'
        ? 'Log in to PO, confirm Demo or Real account mode, then tap Scan.'
        : 'Account mode is not confirmed yet. Open the PO account selector and choose Demo or Real.';
    }
  }

  function activeAccountBalanceText(bodyText) {
    const match = String(bodyText || '').match(/\bQT\s+(?:Real|Demo|Practice)\s+[A-Z]{3}\s+(\d+(?:[.,]\d{1,2})?)/i);
    return match ? match[1] : '';
  }

  function inferPayout() {
    const candidates = Array.from(document.querySelectorAll('[class*="profit"], [class*="payout"], [class*="percent"], [class*="income"]'));
    for (const el of candidates) {
      const value = text(el);
      const match = value.match(/\+?\s*\d{1,3}\s*%/);
      if (match) return match[0];
    }
    const bodyMatch = text(document.body).match(/\+?\s*\d{1,3}\s*%/);
    return bodyMatch ? bodyMatch[0] : state.payout;
  }

  function parsePayoutPercent(value) {
    const match = String(value || '').match(/\+?\s*(\d{1,3})\s*%/);
    if (!match) return null;
    const percent = parseInt(match[1], 10);
    return percent >= 0 && percent <= 200 ? percent : null;
  }

  function getFavoritePairs() {
    const addFavorite = (node, favorites, seenNames) => {
      const rowText = text(node);
      const textPair = rowText.match(/\b[A-Z]{3}\/[A-Z]{3}(?:\s+OTC)?\b/)?.[0] ||
        rowText.match(/\b(?:Bitcoin|Ethereum|Litecoin|Cardano)\s+OTC\b/i)?.[0] ||
        '';
      const name = text(node.querySelector('.assets-favorites-list__label, .asset__name, .pair-name, [class*="label"], [class*="name"]')) ||
        String(node.getAttribute('data-asset') || '').trim() ||
        textPair;
      const payout = parsePayoutPercent(rowText);
      const key = normalizeAssetName(name);
      if (name && payout !== null && !seenNames.has(key)) {
        seenNames.add(key);
        favorites.push({ name, payout, el: node });
      }
    };
    const selectors = [
      '.assets-favorites-list__item',
      '.favorite-list__item',
      '.pair-favorites__item',
      '.assets-block .favorites-list__item',
      '[class*="favorit"] [class*="item"]',
    ];
    const seen = new Set();
    const seenNames = new Set();
    const favorites = [];
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const node of nodes) {
        if (seen.has(node)) continue;
        seen.add(node);
        addFavorite(node, favorites, seenNames);
      }
      if (favorites.length > 0) break;
    }
    if (favorites.length === 0) {
      Array.from(document.querySelectorAll('div, button, a, [role="button"], [role="listitem"]')).forEach(node => {
        if (seen.has(node) || !visible(node)) return;
        const rect = node.getBoundingClientRect();
        if (rect.height > 70 || rect.width < 90) return;
        const rowText = text(node);
        if (!/\+?\s*\d{1,3}\s*%/.test(rowText)) return;
        if (!(/\b[A-Z]{3}\/[A-Z]{3}(?:\s+OTC)?\b/.test(rowText) || /\b(?:Bitcoin|Ethereum|Litecoin|Cardano)\s+OTC\b/i.test(rowText))) return;
        seen.add(node);
        addFavorite(node, favorites, seenNames);
      });
    }
    return favorites;
  }

  function openPairSelectorForAutoSwitch() {
    const pair = normalizeAssetName(inferPair() || '');
    const hasPair = !!pair && pair !== '-' && pair !== 'UNKNOWN';
    const selectors = [
      '[class*="current-symbol"]',
      '[class*="symbol-current"]',
      '[class*="assets"] [class*="current"]',
      '.current-symbol',
      '.asset-name',
      'button',
      'a',
      '[role="button"]',
      '[onclick]',
      'div',
    ];
    const candidates = [];
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach(el => candidates.push(el));
    }
    const opener = candidates.find(el => {
      if (!visible(el)) return false;
      const label = text(el);
      if (!label || label.length > 80) return false;
      const normalized = normalizeAssetName(label);
      const looksLikePair = /\b[A-Z]{3}\/[A-Z]{3}(?:\s+OTC)?\b/.test(label) || /\b(?:Bitcoin|Ethereum|Litecoin|Cardano)\s+OTC\b/i.test(label);
      if (!looksLikePair) return false;
      if (hasPair && normalized && normalized !== pair && !normalized.includes(pair) && !pair.includes(normalized)) return false;
      const rect = el.getBoundingClientRect();
      return rect.top < window.innerHeight * 0.45;
    });
    try {
      opener?.click();
      return !!opener;
    } catch (_) {
      return false;
    }
  }

  function checkPayoutBeforeBotTrade() {
    const action = ['off', 'stop', 'switch'].includes(state.settings.payoutAction)
      ? state.settings.payoutAction
      : 'switch';
    if (action === 'off') return { proceed: true };

    const minPct = Math.max(0, Number(state.settings.payoutMinPercent) || 0);
    const current = parsePayoutPercent(state.payout || inferPayout());
    if (current === null || current >= minPct) return { proceed: true };

    if (action === 'stop') {
      return { proceed: false, reason: `payout ${current}% below minimum ${minPct}%` };
    }

    const favorites = getFavoritePairs().sort((a, b) => b.payout - a.payout);
    const best = favorites[0];
    if (!best) {
      if (!state.botPayoutSwitchOpenAttempted && openPairSelectorForAutoSwitch()) {
        state.botPayoutSwitchOpenAttempted = true;
        state.lastTradeStatus = `opening pair selector to auto-switch from ${current}% below minimum ${minPct}%`;
        post();
        botTimer = window.setTimeout(scheduleRunBotTrade, 900);
        return { proceed: false, deferred: true };
      }
      return { proceed: false, reason: `payout ${current}% below minimum ${minPct}%; no favorite available to auto-switch` };
    }
    if (best.payout < minPct) {
      return { proceed: false, reason: `payout ${current}% below minimum ${minPct}%; highest favorite ${best.payout}%` };
    }

    try {
      best.el.click();
      state.botPayoutSwitchOpenAttempted = false;
      state.lastTradeStatus = `switching to ${best.name} (${best.payout}%) before trade`;
      post();
      botTimer = window.setTimeout(scheduleRunBotTrade, 1800);
      return { proceed: false, deferred: true };
    } catch (_) {
      return { proceed: false, reason: `could not switch to ${best.name}` };
    }
  }

  function findAmountInput() {
    const visibleSelectors = [
      '.block--bet-amount .value__val input',
      '.value__val input',
      'input[data-testid*="amount" i]',
      'input[name*="amount" i]',
      '[class*="amount"] input',
      '[class*="bet"] input',
      '[class*="trade"] input',
      '[class*="invest"] input',
    ];
    for (const selector of visibleSelectors) {
      const input = document.querySelector(selector);
      if (input && visible(input)) return input;
    }
    // Mobile SPA may render the input inside a transform; accept any number input present in DOM.
    const numInput = document.querySelector('input[type="number"]');
    if (numInput) return numInput;
    const anyInput = document.querySelector('input');
    if (anyInput && visible(anyInput)) return anyInput;
    return null;
  }

  function findAmountDisplay() {
    const selectors = [
      '.block--bet-amount',
      '[class*="amount"]',
      '[class*="bet"]',
      '[class*="invest"]',
      '[data-testid*="amount" i]',
      '[aria-label*="amount" i]',
    ];
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      const found = nodes.find(el => visible(el) && /\$?\s?\d+(?:[.,]\d{1,2})?/.test(text(el)));
      if (found) return found;
    }
    const clickables = Array.from(document.querySelectorAll('button, [role="button"], [onclick], div'));
    return clickables.find(el => {
      if (!visible(el)) return false;
      const rect = el.getBoundingClientRect();
      const label = `${text(el)} ${el.getAttribute('aria-label') || ''} ${String(el.className || '')}`;
      return rect.width >= 40 && rect.height >= 24 && /\bAmount\b|\$?\s?\d+(?:[.,]\d{1,2})?/i.test(label) && rect.top > window.innerHeight * 0.35;
    }) || null;
  }

  function inferAmountReady() {
    if (findAmountInput()) return true;
    const body = text(document.body);
    return /\bAmount\b.{0,30}\$?\s?\d+(?:[.,]\d{1,2})?\b/i.test(body) ||
      /\bPayout\b.{0,80}\+\s?\$\s?\d+(?:[.,]\d{1,2})?/i.test(body);
  }

  function visibleAmountIsOne() {
    const input = findAmountInput();
    if (input) return Number(String(input.value).replace(/[^\d.]/g, '')) === 1;
    const body = text(document.body);
    return /\bAmount\b.{0,30}\$?\s?1(?:[.,]00)?\b/i.test(body) ||
      (/\bPayout\b/i.test(body) && /\+\s?\$\s?0\.\d{1,2}\b/i.test(body) && /\+\s?\$\s?1(?:[.,]00)?\b/i.test(body));
  }

  function visibleAmountMatches(amount) {
    const input = findAmountInput();
    if (input) return Number(String(input.value).replace(/[^\d.]/g, '')) === Number(amount);
    const normalized = String(Number(amount)).replace('.', '[.,]');
    return new RegExp(`\\bAmount\\b.{0,30}\\$?\\s?${normalized}(?:[.,]00)?\\b`, 'i').test(text(document.body));
  }

  function setAmountValue(amount) {
    const safeAmount = Number(amount);
    if (!Number.isFinite(safeAmount) || safeAmount < 1) return false;
    const value = safeAmount.toFixed(2);
    const input = findAmountInput();
    if (input) {
      setNativeValue(input, value);
      input.blur?.();
      return visibleAmountMatches(safeAmount) || Number(String(input.value).replace(/[^\d.]/g, '')) === safeAmount;
    }

    const display = findAmountDisplay();
    try { display?.click(); } catch (_) {}

    const openedInput = Array.from(document.querySelectorAll('input, [contenteditable="true"]'))
      .find(el => visible(el) && (el.matches('input') || el.isContentEditable));
    if (openedInput) {
      if (openedInput.matches('input')) {
        setNativeValue(openedInput, value);
        openedInput.blur?.();
      } else {
        openedInput.textContent = value;
        openedInput.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
        openedInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    const confirm = Array.from(document.querySelectorAll('button, [role="button"], [onclick]'))
      .find(el => visible(el) && /ok|apply|confirm|done|save/i.test(text(el)));
    try { confirm?.click(); } catch (_) {}

    return visibleAmountMatches(safeAmount);
  }

  function captureOutgoingSend(data, ws) {
    if (typeof data !== 'string') return;
    if (!/order|deal|buy|sell|call|put|quick-high-low/i.test(data)) return;
    latestTradeWs = ws;
    latestTradeSend = data;
    state.lastOrderDebug = `order template captured (${data.slice(0, 80)})`;
  }

  function mutateDirectionValue(value, direction) {
    if (typeof value !== 'string') return value;
    const lower = value.toLowerCase();
    if (/(call|put|buy|sell|up|down|higher|lower)/.test(lower)) {
      if (/(put|sell|down|lower)/.test(lower)) {
        return direction === 'call'
          ? value.replace(/put|sell|down|lower/ig, match => ({ put: 'call', sell: 'buy', down: 'up', lower: 'higher' }[match.toLowerCase()] || match))
          : value;
      }
      if (/(call|buy|up|higher)/.test(lower)) {
        return direction === 'put'
          ? value.replace(/call|buy|up|higher/ig, match => ({ call: 'put', buy: 'sell', up: 'down', higher: 'lower' }[match.toLowerCase()] || match))
          : value;
      }
    }
    return value;
  }

  function mutateOrderPayload(value, direction, amount) {
    if (Array.isArray(value)) return value.map(item => mutateOrderPayload(item, direction, amount));
    if (!value || typeof value !== 'object') return mutateDirectionValue(value, direction);
    const out = { ...value };
    Object.keys(out).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (/^(amount|sum|stake|investment|invest|bet|betamount)$/.test(lowerKey) && typeof out[key] === 'number') {
        out[key] = amount;
      } else if (/^(direction|action|type|side|cmd|command|trend)$/.test(lowerKey)) {
        out[key] = mutateDirectionValue(out[key], direction);
      } else if (out[key] && typeof out[key] === 'object') {
        out[key] = mutateOrderPayload(out[key], direction, amount);
      } else if (typeof out[key] === 'string') {
        out[key] = mutateDirectionValue(out[key], direction);
      }
    });
    return out;
  }

  function buildDirectOrderMessage(direction, amount) {
    if (!latestTradeSend) return null;
    const match = latestTradeSend.match(/^(\d*)42([\s\S]+)$/);
    if (!match) return null;
    let packet;
    try { packet = JSON.parse(match[2]); } catch (_) { return null; }
    if (!Array.isArray(packet) || packet.length < 2) return null;
    packet[1] = mutateOrderPayload(packet[1], direction, amount);
    return `${match[1]}42${JSON.stringify(packet)}`;
  }

  function sendDirectDemoTrade(direction, amount) {
    const safeAmount = Number(amount);
    if (!latestTradeWs || latestTradeWs.readyState !== 1 || !latestTradeSend || safeAmount <= 1) return false;
    const message = buildDirectOrderMessage(direction, safeAmount);
    if (!message) return false;
    latestTradeWs.send(message);
    state.lastAmountDebug = `direct order sent $${safeAmount} ${direction}`;
    state.lastOrderDebug = `direct order ${message.slice(0, 100)}`;
    return true;
  }

  function findTradeButton(direction) {
    const words = direction === 'call' ? /call|buy|up|higher/i : /put|sell|down|lower/i;
    const classSelectors = direction === 'call'
      ? ['a.btn-call', '.btn-call', '[class*="call"]', '[class*="buy"]', '[class*="higher"]', '[class*="up-btn"]', '[data-testid*="call" i]', '[aria-label*="call" i]', '[aria-label*="buy" i]', '[aria-label*="higher" i]']
      : ['a.btn-put', '.btn-put', '[class*="put"]', '[class*="sell"]', '[class*="lower"]', '[class*="down-btn"]', '[data-testid*="put" i]', '[aria-label*="put" i]', '[aria-label*="sell" i]', '[aria-label*="lower" i]'];
    for (const selector of classSelectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      const found = nodes.find(el => visible(el));
      if (found) return found;
    }
    // Last resort: any visible button whose text matches the direction words
    const buttons = Array.from(document.querySelectorAll('button, a[role="button"]'));
    const textButton = buttons.find(el => visible(el) && words.test(text(el)));
    if (textButton) return textButton;

    const colorPattern = direction === 'call'
      ? /green|rgb\((?:0|[1-9][0-9]),\s?(?:1[2-9][0-9]|2[0-5][0-9]),/i
      : /red|rgb\((?:1[5-9][0-9]|2[0-5][0-9]),\s?(?:0|[1-9][0-9]),/i;
    const clickables = Array.from(document.querySelectorAll('button, a, [role="button"], [onclick], div'));
    return clickables.find(el => {
      if (!visible(el)) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 35 || rect.height < 35 || rect.top < window.innerHeight * 0.45) return false;
      const style = window.getComputedStyle(el);
      const label = `${text(el)} ${el.getAttribute('aria-label') || ''} ${String(el.className || '')}`;
      return words.test(label) || colorPattern.test(`${style.backgroundColor} ${style.backgroundImage} ${label}`);
    }) || null;
  }

  function inferTradeButtonReady(direction) {
    if (findTradeButton(direction)) return true;
    return state.pageState !== 'login' && /\bPayout\b/i.test(text(document.body));
  }

  function closePOPopovers() {
    const body = text(document.body);
    if (!/Invest real money|Good job|Real profit/i.test(body)) return;
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], [class*="close"], svg, div'));
    const close = candidates.find(el => {
      if (!visible(el)) return false;
      const label = `${text(el)} ${el.getAttribute('aria-label') || ''} ${String(el.className || '')}`;
      const rect = el.getBoundingClientRect();
      return /close|×|✕|x/i.test(label) && rect.top < window.innerHeight * 0.45 && rect.left > window.innerWidth * 0.45;
    });
    try { close?.click(); } catch (_) {}
  }

  function injectVisibleBotBadge() {
    enforceMobileViewport();
    document.getElementById('avalisa-mobile-proof-badge')?.remove();
  }

  function updateVisibleBotBadge() {
    injectVisibleBotBadge();
  }

  function getBufferedCandles() {
    if (!state.activePair || !state.activePeriod) return [];
    return state.candleBuffer[`${state.activePair}:${state.activePeriod}`] || [];
  }

  function ingestTick(asset, timestamp, price) {
    if (!asset || timestamp == null || price == null) return;
    const assetKey = normalizeAssetName(asset);
    if (/^\d+$/.test(String(assetKey))) return;
    const period = state.activePeriod || 60;
    const key = `${assetKey}:${period}`;
    const candleTime = Math.floor(Number(timestamp) / period) * period;
    if (!Number.isFinite(candleTime) || !Number.isFinite(Number(price))) return;
    if (!state.candleBuffer[key]) state.candleBuffer[key] = [];
    const buf = state.candleBuffer[key];
    const last = buf[buf.length - 1];
    if (last && last.time === candleTime) {
      last.high = Math.max(last.high, Number(price));
      last.low = Math.min(last.low, Number(price));
      last.close = Number(price);
    } else {
      buf.push({ time: candleTime, open: Number(price), high: Number(price), low: Number(price), close: Number(price) });
      if (buf.length > MAX_CANDLES) buf.shift();
    }
    state.activePair = assetKey;
    state.activePeriod = period;
  }

  function seedHistory(payload) {
    if (!payload || !Array.isArray(payload.history)) return;
    const asset = normalizeAssetName(payload.asset || inferPair());
    const period = parseInt(payload.period, 10) || state.activePeriod || 60;
    const byTime = new Map();
    payload.history.forEach(item => {
      if (!Array.isArray(item) || item.length < 2) return;
      const tsRaw = Number(item[0]);
      const price = Number(item[1]);
      if (!Number.isFinite(tsRaw) || !Number.isFinite(price)) return;
      const ts = tsRaw > 1e10 ? tsRaw / 1000 : tsRaw;
      const candleTime = Math.floor(ts / period) * period;
      const cur = byTime.get(candleTime);
      if (cur) {
        cur.high = Math.max(cur.high, price);
        cur.low = Math.min(cur.low, price);
        cur.close = price;
      } else {
        byTime.set(candleTime, { time: candleTime, open: price, high: price, low: price, close: price });
      }
    });
    const key = `${asset}:${period}`;
    state.activePair = asset;
    state.activePeriod = period;
    state.candleBuffer[key] = Array.from(byTime.values()).sort((a, b) => a.time - b.time).slice(-MAX_CANDLES);
    state.historySeen = true;
  }

  function parseSocketMessage(raw) {
    if (typeof raw !== 'string') return;
    state.wsSeen = true;
    const match = raw.match(/^42\["([^"]+)",([\s\S]+)\]$/);
    if (!match) return;
    let payload;
    try { payload = JSON.parse(match[2]); } catch (_) { return; }
    if (match[1] === 'updateHistoryNewFast' || match[1] === 'successloadHistory') seedHistory(payload);
  }

  function scan() {
    const loginFormVisible = visible(document.querySelector('input[type="email"]')) && visible(document.querySelector('input[type="password"]'));
    const isCabinetUrl = /\/cabinet/i.test(location.pathname);
    const isLoginUrl = /\/(login|sign-?in)\b/i.test(location.pathname);
    state.pageState = hasTradingMarkers() ? 'cabinet' : (isLoginUrl || (!isCabinetUrl && loginFormVisible)
      ? 'login'
      : 'cabinet');
    if (state.pageState === 'login') {
      state.activePair = '-';
      state.duration = '-';
      state.payout = '-';
      state.hasAmountInput = false;
      state.hasCallButton = false;
      state.hasPutButton = false;
      inferBalanceAndMode();
      updateVisibleBotBadge();
      post();
      return statusPayload();
    }
    state.activePair = inferPair() || state.activePair || '-';
    state.duration = inferDuration() || '-';
    inferBalanceAndMode();
    state.payout = inferPayout() || '-';
    state.hasAmountInput = inferAmountReady();
    state.hasCallButton = inferTradeButtonReady('call');
    state.hasPutButton = inferTradeButtonReady('put');
    updateVisibleBotBadge();
    post();
    return statusPayload();
  }

  function setNativeValue(input, value) {
    input.focus?.();
    input.select?.();
    const typed = document.execCommand?.('insertText', false, value);
    if (!typed) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, value);
      else input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  }

  function parseBalanceValue(value) {
    const parsed = Number(String(value || '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function durationSeconds() {
    const match = String(state.duration || '').match(/(\d{2}):(\d{2}):(\d{2})/);
    if (match) return (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3]);
    return TF_TO_SECONDS[state.settings.timeframe] || 30;
  }

  function calcSMA(vals, period) {
    if (vals.length < period) return null;
    return vals.slice(-period).reduce((a, b) => a + b, 0) / period;
  }

  function calcRSI(closes, period = 14) {
    if (closes.length < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    if (losses === 0) return 100;
    const rs = (gains / period) / (losses / period);
    return +(100 - 100 / (1 + rs)).toFixed(1);
  }

  function calcStdev(vals) {
    if (vals.length < 2) return null;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.sqrt(vals.reduce((a, b) => a + ((b - mean) ** 2), 0) / vals.length);
  }

  function requiredCandles() {
    return REQUIRED_CANDLES_BY_INTENSITY[state.settings.intensity] || 20;
  }

  function buildIndicators() {
    const candles = getBufferedCandles();
    if (candles.length < requiredCandles()) return null;
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const price = closes[closes.length - 1];
    const indicatorWindow = Math.min(20, closes.length);
    const sma20 = calcSMA(closes, indicatorWindow);
    const rsi14 = calcRSI(closes, Math.min(14, closes.length - 1));
    const volatility = calcStdev(closes.slice(-indicatorWindow));
    const momentum5 = closes.length >= 6 ? +(((price - closes[closes.length - 6]) / closes[closes.length - 6]) * 100).toFixed(3) : null;
    let slope10 = null;
    if (candles.length >= 30 && sma20 != null) {
      const past = candles.slice(candles.length - 30, candles.length - 10);
      if (past.length === 20) slope10 = (sma20 - (past.reduce((s, c) => s + c.close, 0) / 20)) / 10;
    }
    const last = candles[candles.length - 1];
    const lastCandle = last.close > last.open ? 'green' : last.close < last.open ? 'red' : 'doji';
    return {
      pair: state.activePair,
      tf: SECONDS_TO_TF[state.activePeriod] || `${state.activePeriod || durationSeconds()}s`,
      price,
      rsi14,
      sma20,
      volatility,
      momentum5,
      slope10,
      lastCandle,
      candleCount: candles.length,
      recentHigh: Math.max(...highs.slice(-indicatorWindow)),
      recentLow: Math.min(...lows.slice(-indicatorWindow)),
    };
  }

  function round4(x) {
    return x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000;
  }

  function evaluateAiSignal(indicators) {
    const th = AI_THRESHOLDS[state.settings.intensity] || AI_THRESHOLDS.mid;
    const pair = indicators?.pair || '';
    const price = indicators?.price;
    const stdev20 = indicators?.volatility;
    const sma20 = indicators?.sma20;
    const rsi = indicators?.rsi14;
    const momentum = indicators?.momentum5;
    const slope10 = indicators?.slope10;
    const isOTC = /_otc|\botc\b/i.test(pair);
    const volRatio = Number.isFinite(stdev20) && Number.isFinite(price) && price > 0 ? stdev20 / price : null;
    const slopeScore = Number.isFinite(slope10) && Number.isFinite(stdev20) && stdev20 > 0 ? slope10 / stdev20 : null;
    const regime = Number.isFinite(slopeScore) && Math.abs(slopeScore) >= th.regimeSlopeThreshold ? 'trending' : 'ranging';
    if (!Number.isFinite(rsi) || !Number.isFinite(sma20) || !Number.isFinite(stdev20) || !Number.isFinite(price)) {
      return { action: 'SKIP', reason: 'missing_indicators', confidence: 0 };
    }
    if (th.skipOTC && isOTC) return { action: 'SKIP', reason: 'otc_filter', confidence: 0 };
    if (Number.isFinite(volRatio) && volRatio > th.volHighThreshold) return { action: 'SKIP', reason: 'vol_too_high', confidence: 0 };
    const upperBB = sma20 + th.bbK * stdev20;
    const lowerBB = sma20 - th.bbK * stdev20;
    const pullbackUpper = sma20 + th.pullbackBbK * stdev20;
    const pullbackLower = sma20 - th.pullbackBbK * stdev20;
    let callCount = 0, putCount = 0;
    if (regime === 'trending' && Number.isFinite(slope10)) {
      if (slope10 > 0) {
        callCount++;
        if (price >= pullbackLower && price <= sma20) callCount++;
        if (rsi >= th.pullbackRsiLow && rsi <= th.pullbackRsiHigh) callCount++;
        if (th.requireCandleConfirm ? indicators.lastCandle === 'green' : momentum > 0) callCount++;
      } else if (slope10 < 0) {
        putCount++;
        if (price <= pullbackUpper && price >= sma20) putCount++;
        if (rsi >= th.pullbackRsiLow && rsi <= th.pullbackRsiHigh) putCount++;
        if (th.requireCandleConfirm ? indicators.lastCandle === 'red' : momentum < 0) putCount++;
      }
    } else {
      if (rsi < th.rsiLow) callCount++;
      if (price < lowerBB) callCount++;
      if (Number.isFinite(momentum) && momentum > 0) callCount++;
      if (th.requireCandleConfirm && indicators.lastCandle === 'green') callCount++;
      if (rsi > th.rsiHigh) putCount++;
      if (price > upperBB) putCount++;
      if (Number.isFinite(momentum) && momentum < 0) putCount++;
      if (th.requireCandleConfirm && indicators.lastCandle === 'red') putCount++;
    }
    const required = regime === 'trending' ? th.rulesRequiredTrending : th.rulesRequiredRanging;
    const rulesMatched = Math.max(callCount, putCount);
    let action = 'SKIP';
    let reason = 'no_signal';
    if (callCount >= required && callCount > putCount) {
      action = 'CALL';
      reason = 'ok';
    } else if (putCount >= required && putCount > callCount) {
      action = 'PUT';
      reason = 'ok';
    } else if (callCount >= required && putCount >= required && callCount === putCount) {
      reason = 'conflicting_signals';
    }
    const confidence = action === 'SKIP' ? 0 : Math.min(100, Math.round((rulesMatched / Math.max(required, 1)) * th.minConfidence));
    return {
      action,
      reason,
      confidence,
      timeframe: Number.isFinite(volRatio) && volRatio < th.volLowThreshold ? 'M1' : 'S30',
      snapshot: { rsi: round4(rsi), price: round4(price), sma20: round4(sma20), volRatio: round4(volRatio), regime, rulesMatched, callCount, putCount },
    };
  }

  function chooseBotDirection() {
    if (state.settings.strategy === 'ai') {
      const indicators = buildIndicators();
      const sig = evaluateAiSignal(indicators);
      state.lastSignal = sig.action === 'SKIP'
        ? `AI SKIP ${sig.reason || 'no_signal'}`
        : `AI ${sig.action} ${sig.confidence}%`;
      if (sig.action === 'CALL') return 'call';
      if (sig.action === 'PUT') return 'put';
      return null;
    }
    if (state.settings.direction === 'call') return 'call';
    if (state.settings.direction === 'put') return 'put';
    const candles = getBufferedCandles();
    const last = candles[candles.length - 1];
    if (state.settings.direction === 'alternating') {
      const next = state.lastDirection === 'call' ? 'put' : 'call';
      state.lastDirection = next;
      return next;
    }
    if (!last) return 'call';
    return Number(last.close) >= Number(last.open) ? 'call' : 'put';
  }

  function maxAllowedProofAmount() {
    return Math.max(1, Number(state.settings.maxProofAmount) || 64);
  }

  function placeDemoTrade(direction, amount, options = {}) {
    scan();
    if ((state.botInTrade || state.tradeLock) && !options.botInternal) {
      state.lastTradeStatus = 'blocked: trade lock active';
      post();
      return false;
    }
    if (!['call', 'put'].includes(direction)) {
      state.lastTradeStatus = `blocked: invalid direction ${String(direction)}`;
      post();
      return false;
    }
    if (!canTradeCurrentAccount()) {
      state.lastTradeStatus = `blocked: account mode not confirmed (${state.demoMode})`;
      post();
      return false;
    }
    const safeAmount = Number(amount);
    const maxAmount = options.allowProofMartingale ? maxAllowedProofAmount() : 1;
    if (!Number.isFinite(safeAmount) || safeAmount < 1 || safeAmount > maxAmount) {
      state.lastTradeStatus = options.allowProofMartingale
        ? `blocked: martingale amount must be $1-$${maxAmount}`
        : 'blocked: manual proof buttons only allow $1 trades';
      post();
      return false;
    }

    if (options.allowProofMartingale && options.botInternal && safeAmount > 1 && sendDirectDemoTrade(direction, safeAmount)) {
      state.lastTradeStatus = `${accountModeLabel()} direct ${String(direction).toUpperCase()} sent for $${safeAmount.toFixed(2)}`;
      state.lastPlacedAmount = safeAmount;
      post();
      window.setTimeout(scan, 1500);
      window.setTimeout(scan, 5000);
      return true;
    }

    let button = findTradeButton(direction);
    let executedAmount = safeAmount;
    if (!button) {
      state.lastTradeStatus = 'blocked: trade button missing';
      post();
      return false;
    }
    if (!setAmountValue(safeAmount) && !visibleAmountMatches(safeAmount)) {
      state.lastAmountDebug = `amount setter failed for $${safeAmount}; visible ${text(document.body).match(/Amount\\s+\\d+(?:[.,]\\d+)?/)?.[0] || 'unknown'}`;
      if (options.allowProofMartingale && state.settings.mobileAmountFallback === 'hold-start' && visibleAmountIsOne()) {
        state.lastTradeStatus = `mobile amount fallback: could not set $${safeAmount}; using visible $1`;
        executedAmount = 1;
      } else {
        state.lastTradeStatus = `blocked: amount input missing and page amount is not visibly $${safeAmount}`;
        post();
        return false;
      }
    }
    scan();
    if (!canTradeCurrentAccount()) {
      state.lastTradeStatus = `blocked: account mode changed before click (${state.demoMode})`;
      post();
      return false;
    }
    button = findTradeButton(direction);
    if (!button) {
      state.lastTradeStatus = 'blocked: trade button gone after rescan';
      post();
      return false;
    }
    state.lastTradeStatus = `${accountModeLabel()} ${String(direction).toUpperCase()} click sent for $${safeAmount.toFixed(2)}`;
    state.lastPlacedAmount = executedAmount;
    post();
    closePOPopovers();
    button.click();
    window.setTimeout(scan, 1500);
    window.setTimeout(scan, 5000);
    return true;
  }

  function stopBot(reason = 'stopped') {
    state.botRunning = false;
    state.botMode = 'stopped';
    state.botInTrade = false;
    state.tradeLock = false;
    state.botTradesRemaining = 0;
    state.botBalanceBeforeTrade = null;
    state.botPendingDirection = null;
    state.botPendingAmount = null;
    state.botTradeStartTs = null;
    state.botPayoutSwitchOpenAttempted = false;
    clearBotState();
    if (botTimer) {
      window.clearTimeout(botTimer);
      botTimer = null;
    }
    if (interimTimer) {
      window.clearTimeout(interimTimer);
      interimTimer = null;
    }
    state.lastTradeStatus = `bot ${reason}`;
    post();
    return statusPayload();
  }

  function classifyResult(balanceBefore, balanceDuringTrade, balanceNow, amount, elapsedMs = 0) {
    if (balanceNow == null) return 'unknown';
    const settleTolerance = Math.max(0.15, amount * 0.15);
    const tieTolerance = Math.max(0.05, amount * 0.05);
    const tieToleranceDuring = Math.max(0.10, amount * 0.10);
    const enoughTieTime = elapsedMs >= 4000;
    const enoughLossTime = elapsedMs >= 10000;
    if (balanceBefore != null) {
      const deltaFromBefore = balanceNow - balanceBefore;
      if (enoughTieTime && Math.abs(deltaFromBefore) <= tieTolerance) return 'tie';
      if (deltaFromBefore > amount * 0.5) return 'win';
      if (enoughLossTime && deltaFromBefore < -(amount * 0.5)) return 'loss';
    }
    if (balanceDuringTrade != null) {
      const deltaFromDuring = balanceNow - balanceDuringTrade;
      if (enoughTieTime && Math.abs(deltaFromDuring - amount) <= tieToleranceDuring) return 'tie';
      if (deltaFromDuring > amount * 1.1) return 'win';
      if (enoughLossTime && Math.abs(deltaFromDuring) <= settleTolerance) return 'loss';
    }
    return 'unknown';
  }

  function applyMartingale(result) {
    const startAmount = Math.max(1, Number(state.settings.startAmount) || 1);
    const multiplier = Math.max(1, Number(state.settings.martingaleMultiplier) || 2);
    const maxSteps = state.settings.martingaleSteps === 'infinite' ? Infinity : Math.max(0, Number(state.settings.martingaleSteps) || 0);
    state.lastResult = result;
    if (result === 'loss') {
      if (state.martingaleStep < maxSteps) {
        state.martingaleStep += 1;
        state.nextAmount = Math.min(maxAllowedProofAmount(), Number((state.nextAmount * multiplier).toFixed(2)));
      } else {
        state.martingaleStep = 0;
        state.nextAmount = startAmount;
      }
    } else if (result === 'win') {
      state.martingaleStep = 0;
      state.nextAmount = startAmount;
    }
    // tie/unknown intentionally hold step and amount, matching the extension.
  }

  function waitForTradeOpen(balanceBeforeTrade, amount, startedAt = Date.now(), timeoutMs = 45000) {
    if (!state.botRunning || !state.botInTrade) return;
    scan();
    const balanceNow = parseBalanceValue(state.balance);
    const elapsed = Date.now() - startedAt;
    const openThreshold = balanceBeforeTrade == null ? null : balanceBeforeTrade - (amount * 0.3);
    const opened = balanceBeforeTrade == null || (balanceNow != null && balanceNow <= openThreshold);
    if (opened) {
      state.botBaselineBalance = balanceNow;
      state.botTradeStartTs = Date.now();
      state.tradesCount += 1;
      state.botPendingDirection = state.lastDirection;
      state.lastTradeStatus = `trade open confirmed for $${amount}; waiting result`;
      incrementTradeUsage();
      persistBotState('open');
      post();
      scheduleBotResultCheck(balanceBeforeTrade, amount);
      return;
    }
    if (elapsed >= timeoutMs) {
      state.botInTrade = false;
      state.tradeLock = false;
      stopBot('stopped: trade open not confirmed by balance drop');
      return;
    }
    state.lastTradeStatus = `waiting trade-open confirmation $${amount}`;
    post();
    interimTimer = window.setTimeout(() => waitForTradeOpen(balanceBeforeTrade, amount, startedAt, timeoutMs), 750);
  }

  function scheduleBotResultCheck(amountBeforeTrade, amount) {
    const waitMs = Math.max(20, durationSeconds() + 5) * 1000;
    const resolveStartTs = Date.now();
    botTimer = window.setTimeout(() => {
      scan();
      const balanceAfter = parseBalanceValue(state.balance);
      state.botInTrade = false;
      state.tradeLock = false;
      const hasTradeLimit = state.botTradesRemaining > 0;
      if (hasTradeLimit) {
        state.botTradesRemaining = Math.max(0, state.botTradesRemaining - 1);
      }
      if (!state.botRunning) return;
      const result = classifyResult(amountBeforeTrade, state.botBaselineBalance, balanceAfter, amount, Date.now() - resolveStartTs);
      logTradeResult({
        direction: state.botPendingDirection || state.lastDirection || 'unknown',
        amount,
        result,
        balanceBefore: amountBeforeTrade,
        balanceAfter,
      });
      applyMartingale(result);
      state.lastTradeStatus = `bot result ${result.toUpperCase()}; next $${state.nextAmount}`;
      persistBotState('resolved');
      post();
      if (hasTradeLimit && state.botTradesRemaining <= 0) {
        stopBot('stopped: proof trade limit reached');
        return;
      }
      botTimer = window.setTimeout(scheduleRunBotTrade, Math.max(0, Number(state.settings.delaySeconds) || 0) * 1000);
    }, waitMs);
  }

  async function runBotTrade() {
    scan();
    if (!state.botRunning || state.botInTrade) return;
    if (!canTradeCurrentAccount()) {
      stopBot(`blocked: account mode not confirmed (${state.demoMode})`);
      return;
    }
    if (!(await ensureTradeAccess())) {
      stopBot(`blocked: ${state.licenseReason || 'license check failed'}`);
      return;
    }
    const payoutCheck = checkPayoutBeforeBotTrade();
    if (!payoutCheck.proceed) {
      if (payoutCheck.deferred) return;
      stopBot(`stopped: ${payoutCheck.reason || 'payout check failed'}`);
      return;
    }
    const balanceBefore = parseBalanceValue(state.balance);
    const amount = Number(state.nextAmount) || Math.max(1, Number(state.settings.startAmount) || 1);
    const direction = chooseBotDirection();
    if (!direction) {
      state.aiSkipStreak += 1;
      if (state.aiSkipStreak > 20) {
        stopBot('stopped: AI skip streak limit');
        return;
      }
      state.lastTradeStatus = `${state.lastSignal || 'AI SKIP'}; retrying (${state.aiSkipStreak})`;
      post();
      botTimer = window.setTimeout(scheduleRunBotTrade, 5000);
      return;
    }
    state.aiSkipStreak = 0;
    state.botInTrade = true;
    state.tradeLock = true;
    state.botBaselineBalance = null;
    state.botPendingDirection = direction;
    persistBotState('placing');
    const clicked = placeDemoTrade(direction, amount, { allowProofMartingale: true, botInternal: true });
    if (!clicked) {
      state.botInTrade = false;
      stopBot('stopped: trade click blocked');
      return;
    }
    const executedAmount = Number(state.lastPlacedAmount) || amount;
    state.lastDirection = direction;
    state.botMode = botModeName();
    state.botBalanceBeforeTrade = balanceBefore;
    state.botPendingAmount = executedAmount;
    state.lastTradeStatus = `bot placed ${direction.toUpperCase()} for $${executedAmount}; confirming open`;
    persistBotState('confirming');
    post();
    waitForTradeOpen(balanceBefore, executedAmount);
  }

  async function startDemoMartingale() {
    scan();
    if (!canTradeCurrentAccount()) {
      state.lastTradeStatus = `blocked: account mode not confirmed (${state.demoMode})`;
      post();
      return false;
    }
    if (state.botRunning) {
      state.lastTradeStatus = 'bot already running';
      post();
      return true;
    }
    if (!(await ensureTradeAccess())) {
      return false;
    }
    state.botRunning = true;
    state.botMode = botModeName();
    state.martingaleStep = 0;
    state.nextAmount = Math.max(1, Number(state.settings.startAmount) || 1);
    state.tradesCount = 0;
    state.aiSkipStreak = 0;
    state.botPayoutSwitchOpenAttempted = false;
    state.botTradesRemaining = Math.max(0, Math.min(100, Number(state.settings.maxProofTrades) || 0));
    state.lastTradeStatus = state.botTradesRemaining > 0
      ? `bot started: ${state.settings.strategy}, ${accountModeLabel()}, max ${state.botTradesRemaining} trades`
      : `bot started: ${state.settings.strategy}, running until stopped`;
    persistBotState('started');
    post();
    await runBotTrade();
    return true;
  }

  function scheduleRunBotTrade() {
    runBotTrade().catch(error => {
      stopBot(`stopped: ${error.message || error}`);
    });
  }

  async function placeTrade(direction, amount) {
    if (!(await ensureTradeAccess())) return false;
    const placed = placeDemoTrade(direction, amount);
    if (placed) incrementTradeUsage();
    return placed;
  }

  function setSettings(options) {
    if (options && typeof options.settings === 'object') {
      const next = { ...state.settings, ...options.settings };
      next.strategy = ['martingale', 'ai'].includes(next.strategy) ? next.strategy : 'martingale';
      next.direction = ['alternating', 'call', 'put', 'candle'].includes(next.direction) ? next.direction : 'alternating';
      next.timeframe = TF_TO_SECONDS[next.timeframe] ? next.timeframe : 'S30';
      next.intensity = ['low', 'mid', 'high'].includes(next.intensity) ? next.intensity : 'low';
      next.aiPairMode = ['auto', 'current'].includes(next.aiPairMode) ? next.aiPairMode : 'current';
      next.payoutAction = ['off', 'stop', 'switch'].includes(next.payoutAction) ? next.payoutAction : 'switch';
      next.startAmount = Math.max(1, Number(next.startAmount) || 1);
      next.martingaleMultiplier = Math.max(1, Number(next.martingaleMultiplier) || 2);
      next.delaySeconds = Math.max(0, Number(next.delaySeconds) || 0);
      next.maxProofTrades = Math.max(0, Math.min(100, Number(next.maxProofTrades) || 0));
      next.maxProofAmount = Math.max(1, Number(next.maxProofAmount) || 64);
      next.mobileAmountFallback = ['hold-start', 'stop'].includes(next.mobileAmountFallback) ? next.mobileAmountFallback : 'hold-start';
      state.settings = next;
      state.nextAmount = state.botRunning ? state.nextAmount : next.startAmount;
      state.pairScanEnabled = next.aiPairMode === 'auto';
      state.lastTradeStatus = 'settings updated';
    }
    if (options && Object.prototype.hasOwnProperty.call(options, 'pairScanEnabled')) {
      state.pairScanEnabled = options.pairScanEnabled === true;
      state.settings.aiPairMode = state.pairScanEnabled ? 'auto' : 'current';
      state.lastTradeStatus = state.pairScanEnabled
        ? 'setting: auto pair scan enabled'
        : 'setting: single visible pair mode enabled';
    }
    scan();
    return statusPayload();
  }

  try {
    const NativeWS = window.WebSocket;
    function AvalisaProofWebSocket(url, protocols) {
      const ws = protocols ? new NativeWS(url, protocols) : new NativeWS(url);
      ws.addEventListener('message', event => {
        if (typeof event.data === 'string') {
          parseSocketMessage(event.data);
          post();
        } else if (event.data instanceof Blob) {
          event.data.text().then(text => {
            try {
              const parsed = JSON.parse(text);
              if (Array.isArray(parsed)) {
                parsed.forEach(tick => Array.isArray(tick) && tick.length >= 3 && ingestTick(tick[0], tick[1], tick[2]));
                state.tickSeen = true;
              } else {
                seedHistory(parsed);
              }
              post();
            } catch (_) {}
          });
        } else if (event.data instanceof ArrayBuffer) {
          try {
            const textData = new TextDecoder().decode(event.data);
            const parsed = JSON.parse(textData);
            if (Array.isArray(parsed)) {
              parsed.forEach(tick => Array.isArray(tick) && tick.length >= 3 && ingestTick(tick[0], tick[1], tick[2]));
              state.tickSeen = true;
            } else {
              seedHistory(parsed);
            }
            post();
          } catch (_) {}
        }
      });
      const nativeSend = ws.send.bind(ws);
      ws.send = function (data) {
        captureOutgoingSend(data, ws);
        return nativeSend(data);
      };
      return ws;
    }
    AvalisaProofWebSocket.prototype = NativeWS.prototype;
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(key => {
      Object.defineProperty(AvalisaProofWebSocket, key, { value: NativeWS[key] });
    });
    Object.defineProperty(window, 'WebSocket', {
      value: AvalisaProofWebSocket,
      writable: false,
      configurable: false,
    });
  } catch (error) {
    state.lastTradeStatus = `WebSocket hook failed: ${error && error.message ? error.message : error}`;
  }

  function updateHud() {
    const hudEl = document.getElementById('avalisa-proof-hud');
    if (hudEl) hudEl.remove();
  }

  window.AvalisaProof = {
    version: state.version,
    scan,
    snapshot,
    setSettings,
    placeDemoTrade: placeTrade,
    placeTrade,
    startDemoMartingale,
    startBot: startDemoMartingale,
    login,
    logout,
    checkLicense,
    stopBot,
  };

  document.addEventListener('DOMContentLoaded', scan);
  window.addEventListener('load', scan);
  enforceMobileViewport();
  restoreAuth();
  checkLicense();
  const restoredBot = restoreBotState();
  window.setInterval(scan, 3000);
  if (restoredBot) {
    window.setTimeout(() => {
      scan();
      if (state.botRunning && canTradeCurrentAccount()) scheduleRunBotTrade();
    }, 2500);
  }
  post();
})();
