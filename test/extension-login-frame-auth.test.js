(async () => {
/**
 * Sign-in lives in the panel where users can see it at launch (Board 2026-08-17),
 * but the fields themselves are served from login.html on the EXTENSION origin
 * and embedded as an iframe. The panel is injected into Pocket Option's DOM, so
 * a password typed directly into it would be readable by PO's page scripts and
 * by every other installed extension, and Chrome's password manager would refill
 * it against po.trade. Cross-origin keeps the page out of the frame.
 *
 * This exercises the real login.html + login.js against a stubbed backend: the
 * fields exist, a successful login stores the JWT, clears the password box and
 * notifies the parent panel, and a rejected login neither stores anything nor
 * loses the user's typing.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('../dashboard/node_modules/jsdom');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'extension/login.html'), 'utf8');
const loginJs = fs.readFileSync(path.join(root, 'extension/login.js'), 'utf8');

function harness({ loginResponse, status = 200 } = {}) {
  const dom = new JSDOM(html, { url: 'chrome-extension://avalisa/login.html', runScripts: 'outside-only' });
  const { window } = dom;
  const store = {};
  const calls = [];
  const posted = [];

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
  // jsdom's window.parent is a read-only accessor, so define over it.
  Object.defineProperty(window, 'parent', {
    configurable: true,
    value: { postMessage: (m) => posted.push(m) },
  });
  window.eval(loginJs);
  return { window, doc: window.document, store, calls, posted };
}

// ── Fields exist and start signed out ───────────────────────────────────────
{
  const { doc } = harness({ loginResponse: {} });
  assert.ok(doc.getElementById('email'), 'the login frame needs an email field');
  assert.ok(doc.getElementById('password'), 'the login frame needs a password field');
  assert.equal(doc.getElementById('password').type, 'password');
  assert.ok(doc.getElementById('submit'), 'the login frame needs a sign-in button');
}

// ── Successful login stores the session and clears the password ─────────────
{
  const { doc, store, calls, window, posted } = harness({
    loginResponse: { token: 'jwt-123', user: { id: 'u1' } },
  });
  doc.getElementById('email').value = '  trader@example.com  ';
  doc.getElementById('password').value = 'hunter2';
  doc.getElementById('submit').click();

  await new Promise(r => window.setTimeout(r, 50));

  assert.equal(calls.length, 1, 'exactly one login request expected');
  assert.ok(calls[0].url.endsWith('/api/auth/login'), 'wrong endpoint: ' + calls[0].url);
  assert.equal(calls[0].body.email, 'trader@example.com', 'email should be trimmed');
  assert.equal(calls[0].body.password, 'hunter2');

  assert.equal(store.jwt, 'jwt-123', 'JWT must be stored for the content script');
  assert.equal(store.userId, 'u1');
  assert.equal(store.userEmail, 'trader@example.com');

  assert.equal(doc.getElementById('password').value, '',
    'the password field must be cleared once the value has been submitted');
  assert.ok(posted.some(m => m.type === 'AVALISA_AUTH_OK'),
    'the frame must notify the parent panel so the UI swaps over immediately');
}

// ── Rejected login stores nothing and keeps the user's typing ───────────────
{
  const { doc, store, window } = harness({
    loginResponse: { error: 'Invalid credentials' }, status: 401,
  });
  doc.getElementById('email').value = 'trader@example.com';
  doc.getElementById('password').value = 'wrong';
  doc.getElementById('submit').click();

  await new Promise(r => window.setTimeout(r, 50));

  assert.equal(store.jwt, undefined, 'a failed login must not store a session');
  assert.equal(doc.getElementById('msg').textContent, 'Invalid credentials',
    'the backend error should be surfaced');
  assert.equal(doc.getElementById('password').value, 'wrong',
    'a failed login should not wipe what the user typed');
  assert.ok(!doc.getElementById('submit').disabled, 'the button must be re-enabled after failure');
}



console.log('Extension login-frame auth passed.');
})();
