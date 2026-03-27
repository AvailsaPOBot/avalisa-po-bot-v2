const AFFILIATE_LINK = 'https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50';
const DASHBOARD_URL = 'https://avalisa-po-bot-v2.vercel.app';

document.getElementById('affiliate-link').href = AFFILIATE_LINK;
document.getElementById('dashboard-link').href = DASHBOARD_URL;
document.getElementById('pricing-link').href = `${DASHBOARD_URL}/pricing`;
document.getElementById('support-link').href = `${DASHBOARD_URL}/support`;

async function init() {
  // Check if current tab is on PO
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isOnPO = tab?.url?.includes('pocketoption.com') || tab?.url?.includes('po.cash');

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
