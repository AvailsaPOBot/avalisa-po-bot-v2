/**
 * Avalisa PO Bot v2 - Affiliate claim flow
 * Claim UI actions used by the content overlay.
 */

function getPoUidFromDom() {
  const selectors = ['.js-user-id', '[data-user-id]', '.user-id', '[class*="user-id"]', '[data-uid]'];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const uid = (el.textContent || el.getAttribute('data-user-id') || el.getAttribute('data-uid') || '').trim();
      if (uid && /^\d+$/.test(uid)) return uid;
    }
  }
  return null;
}

function setClaimStatus(text, color) {
  const el = document.getElementById('av-claim-status');
  if (!el) return;
  el.style.display = 'block';
  el.style.color = color;
  el.innerHTML = text;
}

async function handleClaimClick() {
  if (!state.jwt) {
    setClaimStatus('⚠️ Please log in to claim free access.', '#f59e0b');
    return;
  }

  // Try to read UID from PO DOM
  const domUid = getPoUidFromDom();
  if (domUid) {
    // UID found — submit directly
    document.getElementById('av-claim-btn').disabled = true;
    document.getElementById('av-claim-btn').textContent = 'Submitting...';
    await submitClaim(domUid);
    document.getElementById('av-claim-btn').disabled = false;
    document.getElementById('av-claim-btn').textContent = '🎯 Claim Free Access';
  } else {
    // UID not found in DOM — show manual input
    document.getElementById('av-claim-uid-input').style.display = 'block';
    document.getElementById('av-claim-btn').style.display = 'none';
  }
}

async function handleClaimSubmit() {
  const uid = (document.getElementById('av-claim-uid')?.value || '').trim();
  if (!uid) {
    setClaimStatus('⚠️ Please enter your Pocket Option UID.', '#f59e0b');
    return;
  }
  const btn = document.getElementById('av-claim-submit');
  btn.disabled = true;
  btn.textContent = 'Submitting...';
  await submitClaim(uid);
  btn.disabled = false;
  btn.textContent = 'Submit Claim';
}

async function submitClaim(poUid) {
  try {
    const data = await apiPost('/api/license/claim', { poUid });
    if (data.message) {
      setClaimStatus('✅ Claim submitted! We\'ll review within 24 hours.', '#34d399');
      document.getElementById('av-claim-uid-input').style.display = 'none';
    } else if (data.error) {
      const err = data.error;
      if (err.includes('under review')) {
        setClaimStatus('⏳ Your claim is under review.', '#f59e0b');
      } else if (err.includes('already been approved')) {
        setClaimStatus('✅ Already approved! Refresh to see your plan.', '#34d399');
      } else if (err.includes('already linked to another account') || err.includes('already been claimed')) {
        setClaimStatus('❌ This UID is already linked to another account.', '#f87171');
      } else {
        setClaimStatus(`❌ ${err}`, '#f87171');
      }
    }
  } catch (err) {
    setClaimStatus('❌ Network error. Please try again.', '#f87171');
  }
}

async function checkClaimStatus() {
  if (!state.jwt) return;
  try {
    const data = await apiGet('/api/license/claim/status');
    if (!data.claimStatus || data.claimStatus === 'none') return;

    const limitMsg = document.getElementById('av-limit-msg');
    if (limitMsg) limitMsg.style.display = 'block';

    if (data.claimStatus === 'pending') {
      setClaimStatus('⏳ Your claim is under review.', '#f59e0b');
    } else if (data.claimStatus === 'approved') {
      setClaimStatus('✅ Already approved! Refresh to see your plan.', '#34d399');
    } else if (data.claimStatus === 'rejected') {
      const note = data.claimNote || '';
      if (note === 'not_found') {
        setClaimStatus('❌ UID not found under our affiliate link. Please register via our link, or upgrade your plan.' +
          ` <a href="${state.affiliateLink}" style="color:#a78bfa">Affiliate link</a> | <a href="${DASHBOARD_URL}/pricing" style="color:#a78bfa">Pricing</a>`, '#f87171');
      } else if (note === 'uid_mismatch') {
        setClaimStatus('❌ UID mismatch. Contact support.', '#f87171');
      } else {
        setClaimStatus(`❌ Claim rejected: ${note}. <a href="${DASHBOARD_URL}/pricing" style="color:#a78bfa">Upgrade your plan</a>`, '#f87171');
      }
    }
  } catch (err) {
    // silent fail
  }
}
