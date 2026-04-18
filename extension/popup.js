const FALLBACK_AFFILIATE_LINK = 'https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50';
const DASHBOARD_URL = 'https://avalisabot.vercel.app';

document.getElementById('dashboard-link').href = DASHBOARD_URL;
document.getElementById('pricing-link').href = `${DASHBOARD_URL}/pricing`;
document.getElementById('support-link').href = `${DASHBOARD_URL}/support`;

// Load affiliate link from storage (set by content.js on page load)
chrome.storage.local.get('affiliateLink', data => {
  document.getElementById('affiliate-link').href = data.affiliateLink || FALLBACK_AFFILIATE_LINK;
});

// ─── Payout Monitor settings ────────────────────────────────────────────────
function loadPayoutSettings() {
  chrome.storage.local.get(['payoutMinPercent', 'payoutAction'], data => {
    const minInput = document.getElementById('payout-min');
    if (minInput) {
      const v = Number(data.payoutMinPercent);
      minInput.value = Number.isFinite(v) && v >= 1 && v <= 100 ? v : 90;
    }
    const action = ['stop', 'switch', 'keep'].includes(data.payoutAction) ? data.payoutAction : 'stop';
    const radio = document.querySelector(`input[name="payout-action"][value="${action}"]`);
    if (radio) radio.checked = true;
  });
}

function savePayoutMin() {
  const el = document.getElementById('payout-min');
  if (!el) return;
  let v = parseInt(el.value, 10);
  if (!Number.isFinite(v)) v = 90;
  v = Math.max(1, Math.min(100, v));
  el.value = v;
  chrome.storage.local.set({ payoutMinPercent: v });
}

function savePayoutAction() {
  const selected = document.querySelector('input[name="payout-action"]:checked');
  if (!selected) return;
  chrome.storage.local.set({ payoutAction: selected.value });
}

document.addEventListener('DOMContentLoaded', () => {
  loadPayoutSettings();
  const minInput = document.getElementById('payout-min');
  if (minInput) {
    minInput.addEventListener('change', savePayoutMin);
    minInput.addEventListener('blur', savePayoutMin);
  }
  document.querySelectorAll('input[name="payout-action"]').forEach(r => {
    r.addEventListener('change', savePayoutAction);
  });
});

async function init() {
  // Check if current tab is on PO
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isOnPO = tab?.url?.includes('pocketoption.com') || tab?.url?.includes('po.cash') || tab?.url?.includes('po.trade');

  document.getElementById('not-on-po').style.display = isOnPO ? 'none' : 'block';
  document.getElementById('on-po').style.display = isOnPO ? 'block' : 'none';

  if (!isOnPO) return;

  // Load stored license info
  chrome.storage.local.get(['jwt', 'userId', 'licenseInfo'], data => {
    const license = data.licenseInfo;

    if (license) {
      const planEl = document.getElementById('plan-display');
      const planClass = license.plan === 'lifetime' ? 'plan-lifetime' :
                        license.plan === 'basic' ? 'plan-basic' : 'plan-free';
      planEl.innerHTML = `<span class="plan-badge ${planClass}">${license.plan}</span>`;

      const tradesEl = document.getElementById('trades-display');
      if (license.plan === 'lifetime') {
        tradesEl.textContent = 'Unlimited';
      } else if (license.plan === 'basic') {
        tradesEl.textContent = `${license.tradesUsed || 0} / ${license.tradesLimit || 100}`;
      } else {
        tradesEl.textContent = `${license.tradesUsed || 0} / 10 free`;
      }
    } else {
      document.getElementById('trades-display').textContent = 'Click Start on page to check';
    }
  });

  // Open panel button — send message to content script
  document.getElementById('open-panel-btn').addEventListener('click', async () => {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
    window.close();
  });
}

init();
