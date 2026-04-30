/**
 * Avalisa PO Bot v2 - Overlay view templates
 * Static HTML/CSS used by content.js overlay lifecycle.
 */

function getOverlayHTML() {
  const logoUrl = chrome.runtime.getURL('icons/AvalisaBot_Logo.png');
  return `
    <div id="avalisa-panel">
      <div class="av-header">
        <span class="av-logo">
          <img src="${logoUrl}" alt="Avalisa" class="av-logo-img" />
          <span>Avalisa Bot</span>
        </span>
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
          <div class="av-user-row">
            <span id="av-user-email" class="av-label"></span>
            <span id="av-plan-badge" class="av-plan-badge"></span>
            <button id="av-logout-btn" class="av-btn av-btn-sm">Logout</button>
          </div>
        </div>
      </div>

      <div class="av-section">
        <div class="av-row" id="av-row-strategy">
          <label class="av-label">Strategy</label>
          <select id="av-strategy" class="av-select" title="">
            <option value="martingale">Martingale</option>
            <option value="ai">Avalisa AI</option>
          </select>
        </div>
        <div class="av-row av-row-sub" id="av-row-bot-pill" style="display:none">
          <span></span>
          <div id="av-bot-pill" class="av-bot-pill" title="Open bot settings">
            <span class="av-bot-pill-ai">AI</span>
            <span class="av-bot-pill-name">Avalisa</span>
            <svg class="av-bot-pill-arrow" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 8 L8 2 M8 2 L4 2 M8 2 L8 6" stroke="#A78BFA" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>
          </div>
        </div>
        <div class="av-row" id="av-row-direction">
          <label class="av-label">Direction</label>
          <select id="av-direction" class="av-select">
            <option value="alternating">Alternating</option>
            <option value="call">Always Buy</option>
            <option value="put">Always Sell</option>
          </select>
        </div>
        <div class="av-row" id="av-row-timeframe">
          <label class="av-label">Timeframe</label>
          <select id="av-timeframe" class="av-select">
            <option value="S30">30s</option>
            <option value="M1" selected>1min</option>
            <option value="M3">3min</option>
            <option value="M5">5min</option>
          </select>
        </div>
        <div class="av-row" id="av-row-intensity" style="display:none">
          <label class="av-label">Intensity</label>
          <select id="av-intensity" class="av-select">
            <option value="low">Low</option>
            <option value="mid" selected>Mid</option>
            <option value="high">High</option>
          </select>
        </div>
        <div class="av-row" id="av-row-ai-pair-mode" style="display:none">
          <label class="av-label">Pair Scan</label>
          <select id="av-ai-pair-mode" class="av-select">
            <option value="auto" selected>Auto scan favorites</option>
            <option value="current">Current pair only</option>
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

      <div class="av-section">
        <div class="av-section-title">Payout Monitor</div>
        <div class="av-row">
          <label class="av-label" for="av-payout-min">Minimum payout %</label>
          <input id="av-payout-min" type="number" min="1" max="100" step="1" value="90"
            class="av-input av-input-sm" />
        </div>
        <div class="av-radio-group">
          <label class="av-radio-item">
            <input type="radio" name="av-payout-action" value="stop" checked />
            <span>Stop bot</span>
          </label>
          <label class="av-radio-item">
            <input type="radio" name="av-payout-action" value="switch" />
            <span>Auto-switch to highest-payout favorite</span>
          </label>
          <label class="av-radio-item">
            <input type="radio" name="av-payout-action" value="keep" />
            <span>Keep trading (ignore payout)</span>
          </label>
        </div>
      </div>

      <div class="av-section av-controls">
        <button id="av-start-btn" class="av-btn av-btn-green">▶ Start</button>
        <button id="av-stop-btn" class="av-btn av-btn-red" disabled>■ Stop</button>
      </div>

      <div class="av-section av-status-block">
        <div id="av-status" class="av-status">Status: Stopped</div>
        <div id="av-token-status" class="av-counter" style="display:none"></div>
        <div id="av-trade-counter" class="av-counter">Trades this session: 0</div>
      </div>

      <div id="av-limit-msg" class="av-limit-msg" style="display:none">
        <p>Trade limit reached!</p>
        <a id="av-affiliate-link" class="av-btn av-btn-primary" target="_blank">Register Free Account</a>
        <a id="av-upgrade-link" class="av-btn av-btn-outline" target="_blank">Upgrade Plan</a>
        <div id="av-claim-section" style="margin-top:8px; border-top:1px solid #2a4060; padding-top:8px;">
          <p style="font-size:11px; color:#8fa8c8; margin:0 0 6px 0;">Already registered via affiliate link?</p>
          <button id="av-claim-btn" style="width:100%; padding:6px; background:#7c3aed; color:white; border:none; border-radius:4px; font-size:12px; cursor:pointer;">
            Claim Free Access
          </button>
          <div id="av-claim-uid-input" style="display:none; margin-top:6px;">
            <input id="av-claim-uid" type="text" placeholder="Enter your Pocket Option UID"
              style="width:100%; padding:5px 8px; background:#0f0f23; border:1px solid #2d2d5b; border-radius:4px; color:#e2e8f0; font-size:11px; box-sizing:border-box; margin-bottom:4px;" />
            <button id="av-claim-submit" style="width:100%; padding:5px; background:#7c3aed; color:white; border:none; border-radius:4px; font-size:11px; cursor:pointer;">
              Submit Claim
            </button>
          </div>
          <div id="av-claim-status" style="font-size:11px; margin-top:6px; display:none;"></div>
        </div>
      </div>

      <div class="av-footer">
        <a href="https://avalisabot.vercel.app" target="_blank" rel="noopener">avalisabot.vercel.app</a>
        <span class="av-footer-sep"> · </span>
        <a href="mailto:AvalisaPOBot@gmail.com">AvalisaPOBot@gmail.com</a>
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
    .av-logo {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 15px; font-weight: 700; color: #a78bfa;
    }
    .av-logo-img { height: 24px; width: auto; display: block; flex-shrink: 0; }
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
    .av-select { width: 130px; box-sizing: border-box; }
    .av-select:disabled, .av-input:disabled { opacity: 0.4; cursor: not-allowed; }
    .av-input { width: 100%; box-sizing: border-box; margin-top: 4px; padding: 6px 10px; }
    .av-input-sm { width: 130px; margin-top: 0; padding: 4px 8px; }
    .av-radio-item input[type="radio"]:disabled + span { opacity: 0.4; cursor: not-allowed; }
    .av-radio-item input[type="radio"]:disabled { cursor: not-allowed; }
    .av-bot-pill {
      display: inline-flex; align-items: center; gap: 8px;
      background: #1F1A3E; border: 0.5px solid #7C3AED; border-radius: 8px;
      padding: 8px 12px; cursor: pointer; width: 130px; box-sizing: border-box;
      transition: background 0.15s ease;
    }
    .av-bot-pill:hover { background: #2A2350; }
    .av-bot-pill-ai {
      background: #7C3AED; color: #fff; font-size: 9px; font-weight: 700;
      padding: 2px 5px; border-radius: 4px; letter-spacing: 0.05em;
    }
    .av-bot-pill-name { color: #ECEAFF; font-size: 13px; flex: 1; }
    .av-bot-pill-arrow { flex-shrink: 0; }
    .av-row-sub { margin-top: -4px; margin-bottom: 8px; }
    .av-sublink {
      font-size: 11px; color: #A78BFA; text-decoration: none; cursor: pointer;
    }
    .av-sublink:hover { color: #C4B5FD; text-decoration: underline; }
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
    .av-user-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .av-user-row .av-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .av-plan-badge {
      font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .av-plan-badge.plan-lifetime { background: #f4c95d; color: #15120a; }
    .av-plan-badge.plan-basic { background: #059669; color: #fff; }
    .av-plan-badge.plan-free { background: #3b82f6; color: #fff; }
    .av-status-block { }
    .av-status { font-size: 12px; color: #a78bfa; margin-bottom: 4px; }
    .av-status.error { color: #f87171; }
    .av-status.running { color: #34d399; }
    .av-counter { font-size: 11px; color: #64748b; margin-bottom: 2px; }
    .av-limit-msg { text-align: center; font-size: 12px; }
    .av-limit-msg p { color: #fbbf24; margin-bottom: 8px; }
    .av-limit-msg .av-btn { display: block; text-align: center; text-decoration: none; margin-bottom: 6px; }
    #av-auth-section input.av-input { margin-bottom: 6px; }
    #av-login-btn, #av-register-free-btn { width: 100%; margin-bottom: 6px; }
    #av-logged-in { display: flex; justify-content: space-between; align-items: center; }
    .av-section-title {
      font-size: 11px; font-weight: 700; color: #a78bfa; text-transform: uppercase;
      letter-spacing: 0.5px; margin-bottom: 8px;
    }
    .av-radio-group { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
    .av-radio-item {
      display: flex; align-items: center; gap: 8px; cursor: pointer;
      font-size: 12px; color: #cbd5e1;
    }
    .av-radio-item input[type="radio"] { accent-color: #7c3aed; cursor: pointer; margin: 0; }
    .av-footer {
      margin-top: 12px; padding-top: 10px; border-top: 1px solid #2d2d5b;
      font-size: 10px; color: #64748b; text-align: center;
    }
    .av-footer a { color: #94a3b8; text-decoration: none; }
    .av-footer a:hover { color: #a78bfa; }
    .av-footer-sep { color: #475569; }
  `;
}
