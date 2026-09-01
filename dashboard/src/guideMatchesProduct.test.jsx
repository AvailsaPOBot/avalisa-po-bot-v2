/**
 * The setup guide states facts about the product: the demo trade limit, the intensity gates,
 * the plan prices. Nothing stopped those from drifting apart — a page that quietly starts
 * lying to prospects is the same defect class as a promise with no mechanism behind it, and
 * it fails in the direction that costs trust at exactly the moment someone is deciding to pay.
 *
 * So the guide is pinned to its sources of truth: the shipped extension and the backend plan
 * table. If someone changes a gate or a price, this test fails and names the page to fix.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const guide = read('dashboard/src/pages/Guide.jsx');

describe('Setup guide matches the shipped product', () => {
  test('demo trade limit matches the backend plan table', () => {
    const plans = read('backend/src/lib/plans.js');
    const free = plans.match(/\[PLAN_IDS\.DEMO\]:\s*\{[\s\S]*?tradesLimit:\s*(\d+)/);
    expect(free).not.toBeNull();
    const limit = free[1];
    expect(guide).toContain(`${limit} trades`);
    expect(guide).toContain(`Trades: 7 / ${limit} demo`);
  });

  test('Avalisa Bot candle gates match REQUIRED_CANDLES_BY_INTENSITY', () => {
    const state = read('extension/state.js');
    const m = state.match(/REQUIRED_CANDLES_BY_INTENSITY\s*=\s*\{\s*low:\s*(\d+),\s*mid:\s*(\d+),\s*high:\s*(\d+)/);
    expect(m).not.toBeNull();
    const [, low, mid, high] = m;
    expect(guide).toContain(`${low} on Low, ${mid} on Mid, ${high} on High`);
    // the worked example in the guide uses the Mid threshold
    expect(guide).toContain(`Loading: 8/${mid} (mid)`);
  });

  test('intensity agreement thresholds match RULES_REQUIRED', () => {
    const engine = read('extension/signalEngine.js');
    const m = engine.match(/RULES_REQUIRED\s*=\s*\{\s*low:\s*(\d+),\s*mid:\s*(\d+),\s*high:\s*(\d+)\s*\}/);
    const total = engine.match(/TOTAL_RULES\s*=\s*(\d+)/);
    expect(m).not.toBeNull();
    expect(total).not.toBeNull();
    const [, low, mid] = m;
    expect(guide).toContain(`Low needs ${low} of ${total[1]}, Mid needs ${mid} of ${total[1]}`);
  });

  test('plan prices match the pricing page, which is pinned to the Board rail', () => {
    const pricing = read('dashboard/src/pages/Pricing.jsx');
    for (const price of ['$69', '$119', '$29']) {
      expect(pricing).toContain(price);
      expect(guide).toContain(price);
    }
  });

  test('the default martingale step setting the guide warns about is still the default', () => {
    const state = read('extension/state.js');
    expect(state).toMatch(/martingaleSteps:\s*'infinite'/);
    expect(guide).toContain('default is Infinite');
  });

  test('makes no outcome claim', () => {
    // 2113-engineering-safety-rules: public copy never promises a financial result.
    //
    // The naive form of this check ("does the page contain 'guarantee profits'?") FAILED on its
    // first run against the page's own RISK DISCLAIMER — "does not guarantee profits" contains
    // the forbidden phrase. That is defect #63 rebuilt from scratch: a copy gate that flags the
    // disclaimer it exists to protect. So strip the negated forms FIRST, then look for what is
    // left standing as an affirmative promise.
    const affirmative = guide
      .replace(/\b(does not|doesn't|do not|never|cannot|can't|no)\s+(guarantee\w*|predict\w*|promise\w*)/gi, ' ');
    expect(affirmative).not.toMatch(/guarantee\w*\s+(profit|returns|income|win)/i);
    expect(affirmative).not.toMatch(/\$[\d,]+\s*(to|into|→)\s*\$?[\d,]+/); // "$1000 to $5000"
    expect(affirmative).not.toMatch(/\b(risk[- ]free|sure thing|can't lose|always wins?)\b/i);
    // and the disclaimers themselves must still be present
    expect(guide).toContain('does not guarantee profits');
    expect(guide).toContain('does not predict the market');
  });
});
