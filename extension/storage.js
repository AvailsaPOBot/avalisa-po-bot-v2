/**
 * Avalisa PO Bot v2 - Chrome storage helpers
 * Local runtime settings and payout monitor persistence.
 */

async function loadFromStorage() {
  return new Promise(resolve => {
    chrome.storage.local.get(['jwt', 'userId', 'settings', 'payoutMinPercent', 'payoutAction'], data => {
      state.jwt = data.jwt || null;
      state.userId = data.userId || null;
      state.settings = data.settings || getDefaultSettings();
      const minPct = Number(data.payoutMinPercent);
      state.payoutMinPercent = Number.isFinite(minPct) && minPct >= 1 && minPct <= 100 ? minPct : 90;
      state.payoutAction = ['stop', 'switch', 'keep'].includes(data.payoutAction) ? data.payoutAction : 'stop';
      resolve();
    });
  });
}

// Live-update payout monitor settings when any storage writer changes them.
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.payoutMinPercent) {
      const v = Number(changes.payoutMinPercent.newValue);
      if (Number.isFinite(v) && v >= 1 && v <= 100) {
        state.payoutMinPercent = v;
        const el = document.getElementById('av-payout-min');
        if (el && Number(el.value) !== v) el.value = v;
      }
    }
    if (changes.payoutAction && ['stop', 'switch', 'keep'].includes(changes.payoutAction.newValue)) {
      state.payoutAction = changes.payoutAction.newValue;
      const radio = document.querySelector(`input[name="av-payout-action"][value="${state.payoutAction}"]`);
      if (radio && !radio.checked) radio.checked = true;
    }
  });
}

async function saveSettings(settings) {
  state.settings = { ...state.settings, ...settings };
  return new Promise(resolve => {
    chrome.storage.local.set({ settings: state.settings }, resolve);
  });
}
