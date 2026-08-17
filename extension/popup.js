const FALLBACK_AFFILIATE_LINK = 'https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50';
const DASHBOARD_URL = 'https://avalisabot.vercel.app';
const API_BASE = 'https://avalisa-backend.onrender.com';

document.getElementById('dashboard-link').href = DASHBOARD_URL;
document.getElementById('pricing-link').href = `${DASHBOARD_URL}/pricing`;
document.getElementById('support-link').href = `${DASHBOARD_URL}/support`;
document.getElementById('signup-link').href = `${DASHBOARD_URL}/register`;

// Load affiliate link from storage (set by content.js on page load)
chrome.storage.local.get('affiliateLink', data => {
  document.getElementById('affiliate-link').href = data.affiliateLink || FALLBACK_AFFILIATE_LINK;
});

// ─── Auth ────────────────────────────────────────────────────────────────────
// Sign-in moved here in v2.4.9. The on-page panel is injected into Pocket
// Option's DOM, so a password typed there is readable by PO's own scripts and by
// any other installed extension, and Chrome's password manager refills it on
// every page load. This popup runs on the extension's own origin, so none of
// that applies. The content script only ever receives the resulting JWT.

function setAuthMessage(text, kind) {
  const el = document.getElementById('auth-msg');
  el.textContent = text || '';
  el.className = 'auth-msg' + (kind ? ' ' + kind : '');
}

function renderAuth(session) {
  const signedIn = !!session?.jwt;
  document.getElementById('auth-signed-out').style.display = signedIn ? 'none' : 'block';
  document.getElementById('auth-signed-in').style.display = signedIn ? 'block' : 'none';
  if (signedIn) {
    const el = document.getElementById('account-email');
    el.textContent = session.userEmail || 'Signed in';
    el.title = session.userEmail || '';
  }
}

async function handleLogin() {
  const emailEl = document.getElementById('login-email');
  const passwordEl = document.getElementById('login-password');
  const btn = document.getElementById('login-btn');
  const email = emailEl.value.trim();
  const password = passwordEl.value;

  if (!email || !password) {
    setAuthMessage('Enter your email and password.', 'error');
    return;
  }

  btn.disabled = true;
  setAuthMessage('Connecting...');
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAuthMessage(data.error || 'Login failed.', 'error');
      return;
    }
    // Clear the field as soon as the value has been handed over.
    passwordEl.value = '';
    await chrome.storage.local.set({ jwt: data.token, userId: data.user.id, userEmail: email });
    setAuthMessage('Signed in.', 'ok');
    renderAuth({ jwt: data.token, userEmail: email });
    init();
  } catch (err) {
    setAuthMessage('Login error — check your connection.', 'error');
  } finally {
    btn.disabled = false;
  }
}

function handleLogout() {
  chrome.storage.local.remove(['jwt', 'userId', 'userEmail', 'licenseInfo'], () => {
    renderAuth(null);
    setAuthMessage('');
  });
}

document.getElementById('login-btn').addEventListener('click', handleLogin);
document.getElementById('logout-btn').addEventListener('click', handleLogout);
document.getElementById('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleLogin();
});

async function init() {
  // Check if current tab is on PO
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isOnPO = tab?.url?.includes('pocketoption.com') || tab?.url?.includes('po.cash') || tab?.url?.includes('po.trade');

  document.getElementById('not-on-po').style.display = isOnPO ? 'none' : 'block';
  document.getElementById('on-po').style.display = isOnPO ? 'block' : 'none';

  // Auth is usable on any tab — you should be able to sign in before opening PO.
  if (!isOnPO) {
    chrome.storage.local.get(['jwt', 'userEmail'], renderAuth);
    return;
  }

  // Load stored license info
  chrome.storage.local.get(['jwt', 'userId', 'userEmail', 'licenseInfo'], data => {
    renderAuth(data);
    const license = data.licenseInfo;

    if (license) {
      const planEl = document.getElementById('plan-display');
      const planClass = license.plan === 'lifetime' ? 'plan-lifetime' :
                        license.plan === 'basic' ? 'plan-basic' : 'plan-free';
      const planLabel = license.plan === 'lifetime' ? 'pro' : license.plan === 'free' ? 'demo' : license.plan;
      planEl.innerHTML = `<span class="plan-badge ${planClass}">${planLabel}</span>`;

      const tradesEl = document.getElementById('trades-display');
      if (license.plan === 'lifetime' || license.plan === 'basic') {
        tradesEl.textContent = 'Unlimited';
      } else {
        tradesEl.textContent = `${license.tradesUsed || 0} / 10 demo`;
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
