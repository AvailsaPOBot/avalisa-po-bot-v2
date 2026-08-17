(async () => {
/**
 * Sign-in moved from the on-page panel to the toolbar popup in 2.4.9, because
 * the panel is injected into Pocket Option's own DOM (readable by PO's scripts
 * and by every other extension, and refilled by Chrome's password manager).
 *
 * This exercises the popup's real HTML and real popup.js against a stubbed
 * backend: the fields exist, a successful login stores the JWT and clears the
 * password box, and a rejected login neither stores anything nor loses the
 * user's typing.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('../dashboard/node_modules/jsdom');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'extension/popup.html'), 'utf8');
const popupJs = fs.readFileSync(path.join(root, 'extension/popup.js'), 'utf8');

function harness({ loginResponse, status = 200 } = {}) {
  const dom = new JSDOM(html, { url: 'chrome-extension://avalisa/popup.html', runScripts: 'outside-only' });
  const { window } = dom;
  const store = {};
  const calls = [];

  window.chrome = {
    storage: {
      local: {
        get(keys, cb) {
          if (Array.isArray(keys)) return cb(Object.fromEntries(keys.map(k => [k, store[k]])));
          if (typeof keys === 'string') return cb({ [keys]: store[keys] });
          cb({ ...keys, ...store });
        },
        set(v, cb) { Object.assign(store, v); if (cb) cb(); return Promise.resolve(); },
        remove(keys, cb) { (Array.isArray(keys) ? keys : [keys]).forEach(k => delete store[k]); if (cb) cb(); },
      },
    },
    tabs: {
      query: async () => [{ id: 1, url: 'https://po.trade/en/cabinet/demo-quick-high-low/' }],
      sendMessage: async () => {},
    },
  };
  window.fetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return { ok: status === 200, json: async () => loginResponse };
  };
  window.console = console;
  window.eval(popupJs);
  return { window, doc: window.document, store, calls };
}

// ── Fields exist and start signed out ───────────────────────────────────────
{
  const { doc } = harness({ loginResponse: {} });
  assert.ok(doc.getElementById('login-email'), 'popup needs an email field');
  assert.ok(doc.getElementById('login-password'), 'popup needs a password field');
  assert.equal(doc.getElementById('login-password').type, 'password');
  assert.ok(doc.getElementById('login-btn'), 'popup needs a sign-in button');
  assert.ok(doc.getElementById('logout-btn'), 'popup needs a sign-out control');
}

// ── Successful login stores the session and clears the password ─────────────
{
  const { doc, store, calls, window } = harness({
    loginResponse: { token: 'jwt-123', user: { id: 'u1' } },
  });
  doc.getElementById('login-email').value = '  trader@example.com  ';
  doc.getElementById('login-password').value = 'hunter2';
  doc.getElementById('login-btn').click();

  await new Promise(r => window.setTimeout(r, 50));

  assert.equal(calls.length, 1, 'exactly one login request expected');
  assert.ok(calls[0].url.endsWith('/api/auth/login'), 'wrong endpoint: ' + calls[0].url);
  assert.equal(calls[0].body.email, 'trader@example.com', 'email should be trimmed');
  assert.equal(calls[0].body.password, 'hunter2');

  assert.equal(store.jwt, 'jwt-123', 'JWT must be stored for the content script');
  assert.equal(store.userId, 'u1');
  assert.equal(store.userEmail, 'trader@example.com');

  assert.equal(doc.getElementById('login-password').value, '',
    'the password field must be cleared once the value has been submitted');
  assert.notEqual(doc.getElementById('auth-signed-in').style.display, 'none',
    'the signed-in view should be shown after login');
}

// ── Rejected login stores nothing and keeps the user's typing ───────────────
{
  const { doc, store, window } = harness({
    loginResponse: { error: 'Invalid credentials' }, status: 401,
  });
  doc.getElementById('login-email').value = 'trader@example.com';
  doc.getElementById('login-password').value = 'wrong';
  doc.getElementById('login-btn').click();

  await new Promise(r => window.setTimeout(r, 50));

  assert.equal(store.jwt, undefined, 'a failed login must not store a session');
  assert.equal(doc.getElementById('auth-msg').textContent, 'Invalid credentials',
    'the backend error should be surfaced');
  assert.equal(doc.getElementById('login-password').value, 'wrong',
    'a failed login should not wipe what the user typed');
  assert.ok(!doc.getElementById('login-btn').disabled, 'the button must be re-enabled after failure');
}



console.log('Extension popup auth passed.');
})();
