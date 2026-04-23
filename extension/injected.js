(function () {
  // ── WebSocket interceptor ──────────────────────────────────────────────────
  const _WS = window.WebSocket;
  let _latestWs = null;
  let _expectHistoryBinary = false;

  function AvalisaWS(url, proto) {
    const ws = proto ? new _WS(url, proto) : new _WS(url);

    // Track the latest PO websocket for history requests
    if (url && (url.includes('po.market') || url.includes('pocketoption') || url.includes('po.cash') || url.includes('po.trade'))) {
      _latestWs = ws;
    }

    ws.addEventListener('message', function (e) {
      if (typeof e.data === 'string') {
        // Check for Socket.IO binary event placeholder containing history data
        if (/^45\d/.test(e.data) && (e.data.includes('updateHistoryNewFast') || e.data.includes('updateCharts'))) {
          _expectHistoryBinary = true;
          console.log('[Avalisa] History binary expected next frame');
        }
        // Text frame — forward as-is
        try { window.postMessage({ type: 'AVALISA_WS', data: e.data }, '*'); } catch (_) {}
      } else if (e.data instanceof Blob) {
        // Binary frame as Blob (default binaryType)
        e.data.text().then(text => {
          if (_expectHistoryBinary) {
            _expectHistoryBinary = false;
            try { window.postMessage({ type: 'AVALISA_WS_HISTORY', data: text }, '*'); } catch (_) {}
          } else {
            try { window.postMessage({ type: 'AVALISA_WS_TICK', data: text }, '*'); } catch (_) {}
          }
        }).catch(() => {});
      } else if (e.data instanceof ArrayBuffer) {
        // Binary frame as ArrayBuffer (PO sets ws.binaryType = 'arraybuffer')
        try {
          const text = new TextDecoder().decode(e.data);
          if (_expectHistoryBinary) {
            _expectHistoryBinary = false;
            window.postMessage({ type: 'AVALISA_WS_HISTORY', data: text }, '*');
          } else {
            window.postMessage({ type: 'AVALISA_WS_TICK', data: text }, '*');
          }
        } catch (_) {}
      }
    });

    // Intercept outgoing send() so we can see what PO requests
    const _send = ws.send.bind(ws);
    ws.send = function (data) {
      try { window.postMessage({ type: 'AVALISA_WS_SEND', data: typeof data === 'string' ? data : '[binary]' }, '*'); } catch (_) {}
      return _send(data);
    };

    return ws;
  }

  AvalisaWS.prototype = _WS.prototype;
  ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(k => {
    Object.defineProperty(AvalisaWS, k, { value: _WS[k] });
  });
  // Lock the wrap so PO's webpack bundle / globals snapshot can't restore native WebSocket
  try {
    Object.defineProperty(window, 'WebSocket', {
      value: AvalisaWS,
      writable: false,
      configurable: false,
      enumerable: true,
    });
    console.log('[Avalisa] WebSocket interceptor locked via defineProperty');
  } catch (e) {
    // Fallback if PO already locked it themselves
    window.WebSocket = AvalisaWS;
    console.warn('[Avalisa] WebSocket interceptor fallback assignment:', e?.message);
  }

  // Expose history request so content.js can call it
  window.avalisaRequestHistory = function (asset, periodSec) {
    if (!_latestWs || _latestWs.readyState !== 1) {
      console.warn('[Avalisa] avalisaRequestHistory: no ready WS (state:', _latestWs?.readyState, ')');
      return false;
    }
    const msg = '42["loadHistoryPeriod",' + JSON.stringify({ asset, period: periodSec, index: 0 }) + ']';
    _latestWs.send(msg);
    console.log('[Avalisa] History request sent:', msg);
    return true;
  };

  // ── Fetch interceptor — capture PO AI HTTP calls ───────────────────────────
  const _fetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!url.includes('avalisa') && !url.includes('onrender')) {
      const body = init?.body || '';
      window.postMessage({ type: 'AVALISA_FETCH', url, method: init?.method || 'GET', body: typeof body === 'string' ? body.substring(0, 500) : '[binary]' }, '*');
    }
    return _fetch.apply(this, arguments).then(res => {
      const clone = res.clone();
      if (!url.includes('avalisa') && !url.includes('onrender')) {
        clone.text().then(text => {
          window.postMessage({ type: 'AVALISA_FETCH_RES', url, body: text.substring(0, 500) }, '*');
        }).catch(() => {});
      }
      return res;
    });
  };

  // ── XHR interceptor ───────────────────────────────────────────────────────
  const _XHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    const xhr = new _XHR();
    const _open = xhr.open.bind(xhr);
    let _url = '', _method = '';
    xhr.open = function (method, url, ...args) {
      _url = url; _method = method;
      return _open(method, url, ...args);
    };
    xhr.addEventListener('load', function () {
      if (!_url.includes('avalisa') && !_url.includes('onrender')) {
        window.postMessage({ type: 'AVALISA_XHR', url: _url, method: _method, response: (xhr.responseText || '').substring(0, 500) }, '*');
      }
    });
    return xhr;
  };

  console.log('[Avalisa] Interceptors active (WS + Fetch + XHR)');
})();
