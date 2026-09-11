const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('../dashboard/node_modules/jsdom');

const root = path.resolve(__dirname, '..');
const injectedSource = fs.readFileSync(path.join(root, 'extension/injected.js'), 'utf8');

function createHarness({ debug = false } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://pocketoption.com/en/cabinet/',
    runScripts: 'outside-only',
  });
  const { window } = dom;
  const posted = [];
  const sent = [];
  const logs = [];
  const warnings = [];

  class FakeWebSocket {
    constructor(url, proto) {
      this.url = url;
      this.proto = proto;
      this.readyState = 1;
      this.listeners = {};
    }

    addEventListener(type, listener) {
      this.listeners[type] = listener;
    }

    send(data) {
      sent.push(data);
    }

    dispatchMessage(data) {
      this.listeners.message?.({ data });
    }
  }
  FakeWebSocket.CONNECTING = 0;
  FakeWebSocket.OPEN = 1;
  FakeWebSocket.CLOSING = 2;
  FakeWebSocket.CLOSED = 3;

  window.WebSocket = FakeWebSocket;
  window.fetch = async () => ({
    clone: () => ({
      text: async () => 'PO response body',
    }),
  });
  window.XMLHttpRequest = function () {
    return {
      responseText: 'XHR response body',
      open(method, url) {
        this.method = method;
        this.url = url;
      },
      addEventListener() {},
    };
  };
  window.postMessage = message => posted.push(message);
  window.console = {
    log: (...args) => logs.push(args.join(' ')),
    warn: (...args) => warnings.push(args.join(' ')),
  };
  if (debug) window.localStorage.setItem('avalisaDebugLogs', '1');

  window.eval(injectedSource);

  return { window, posted, sent, logs, warnings };
}

(async () => {
  const quiet = createHarness();
  const quietWs = new quiet.window.WebSocket('wss://po.market/socket.io/');
  quietWs.dispatchMessage('42["updateStream",{"ok":true}]');
  quietWs.send('42["loadHistoryPeriod",{}]');
  await quiet.window.fetch('https://pocketoption.com/api/test', { method: 'POST', body: 'raw-body' });

  assert.equal(quiet.posted.some(message => message.type === 'AVALISA_WS'), true);
  assert.equal(quiet.posted.some(message => message.type === 'AVALISA_WS_SEND'), false);
  assert.equal(quiet.posted.some(message => message.type === 'AVALISA_FETCH'), false);
  assert.equal(quiet.posted.some(message => message.type === 'AVALISA_FETCH_RES'), false);
  assert.equal(quiet.logs.length, 0);
  assert.equal(quiet.warnings.length, 0);

  const debug = createHarness({ debug: true });
  const debugWs = new debug.window.WebSocket('wss://po.market/socket.io/');
  debugWs.dispatchMessage('42["updateStream",{"ok":true}]');
  debugWs.send('42["loadHistoryPeriod",{}]');
  await debug.window.fetch('https://pocketoption.com/api/test', { method: 'POST', body: 'raw-body' });

  assert.equal(debug.posted.some(message => message.type === 'AVALISA_WS'), true);
  assert.equal(debug.posted.some(message => message.type === 'AVALISA_WS_SEND'), true);
  assert.equal(debug.posted.some(message => message.type === 'AVALISA_FETCH'), true);
  assert.equal(debug.posted.some(message => message.type === 'AVALISA_FETCH_RES'), true);
  assert.equal(debug.logs.some(line => line.includes('Interceptors active')), true);

  const concurrent = createHarness();
  const w = concurrent.window;
  const a = new w.WebSocket('wss://po.market/a');
  const b = new w.WebSocket('wss://po.market/b');
  let finishOpen;
  const delayedOpen = new w.Blob();
  delayedOpen.text = () => new Promise(resolve => { finishOpen = resolve; });
  const close = new w.Blob();
  close.text = async () => 'close-payload';
  a.dispatchMessage('451-["successopenOrder",{}]');
  a.dispatchMessage(delayedOpen);
  a.dispatchMessage('451-["successcloseOrder",{}]');
  a.dispatchMessage(close);
  b.dispatchMessage('451-["updateHistoryNewFast",{}]');
  const history = new w.Blob(); history.text = async () => 'history-payload';
  b.dispatchMessage(history);
  finishOpen('open-payload');
  await Promise.resolve(); await Promise.resolve();
  const binary = concurrent.posted.filter(m => m.type === 'AVALISA_WS_BINARY');
  assert.ok(binary.some(m => m.event === 'successopenOrder' && m.data === 'open-payload'));
  assert.ok(binary.some(m => m.event === 'successcloseOrder' && m.data === 'close-payload'));
  assert.ok(concurrent.posted.some(m => m.type === 'AVALISA_WS_HISTORY' && m.data === 'history-payload'));
  // A pending header on socket A must not label an untagged frame on socket B.
  a.dispatchMessage('451-["successopenOrder",{}]');
  const tick = new w.Blob(); tick.text = async () => 'tick-payload';
  b.dispatchMessage(tick);
  await Promise.resolve(); await Promise.resolve();
  assert.ok(concurrent.posted.some(m => m.type === 'AVALISA_WS_TICK' && m.data === 'tick-payload'));
  console.log('Extension injected debug and concurrent socket smoke passed.');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
