/**
 * Avalisa PO Bot — toolbar popup.
 *
 * Information only: logo, mascot, what the extension does, official links and
 * the loaded build. Sign-in and all controls live in the on-page panel, which is
 * visible the moment Pocket Option loads — Board decision 2026-08-17, on the
 * grounds that a toolbar popup is an extra click most users never discover.
 */
const FALLBACK_AFFILIATE_LINK = 'https://u3.shortink.io/register?utm_campaign=36377&utm_source=affiliate&utm_medium=sr&a=h00sp8e1L95KmS&al=1272290&ac=april2024&cid=845788&code=WELCOME50';
const DASHBOARD_URL = 'https://avalisabot.vercel.app';

document.getElementById('dashboard-link').href = DASHBOARD_URL;
document.getElementById('site-link').href = DASHBOARD_URL;
document.getElementById('support-link').href = `${DASHBOARD_URL}/support`;
document.getElementById('version-line').textContent = `v${chrome.runtime.getManifest().version}`;

// Affiliate link is refreshed from the backend by the content script.
chrome.storage.local.get('affiliateLink', data => {
  document.getElementById('affiliate-link').href = data.affiliateLink || FALLBACK_AFFILIATE_LINK;
});
