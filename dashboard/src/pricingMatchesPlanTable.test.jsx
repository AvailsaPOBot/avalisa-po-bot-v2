/**
 * #107 — the sales pages must not advertise a limit the product does not enforce.
 *
 * `/pricing` and the landing page sold Basic and Pro on "No starting amount cap" while
 * `maxStartAmount` was null on ALL THREE tiers and read nowhere in the codebase. Our own
 * README and support prompt both state the FREE tier has no cap either — so we were
 * charging for something we documented as already free, at the exact moment someone
 * decides to pay. Same defect class as a promise with no mechanism, pointed at the wallet.
 *
 * This pins the PREMISE, not the wording: if a real cap is ever enforced on a cheaper
 * tier, advertising it becomes honest and this test says so.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const plans = read('backend/src/lib/plans.js');
const SALES_PAGES = ['dashboard/src/pages/Pricing.jsx', 'dashboard/src/pages/Landing.jsx'];

// A cap is enforced only if some tier declares a non-null maxStartAmount.
const capIsEnforced = /maxStartAmount:\s*(?!null)\S/.test(plans);

describe('sales copy matches what the plan table actually enforces', () => {
  test.each(SALES_PAGES)('%s does not sell a start-amount cap nobody enforces', (page) => {
    if (capIsEnforced) return; // a real cap exists — advertising it is honest
    expect(read(page)).not.toMatch(/starting amount cap/i);
  });

  test('the demo trade limit quoted in copy is the one the backend grants', () => {
    const demoLimit = Number(
      (plans.match(/\[PLAN_IDS\.DEMO\]:\s*\{[\s\S]*?tradesLimit:\s*(\d+)/) || [])[1]
    );
    expect(demoLimit).toBeGreaterThan(0);
    for (const page of SALES_PAGES) {
      const copy = read(page);
      const quoted = copy.match(/(\d+)-trade limit/);
      if (quoted) expect(Number(quoted[1])).toBe(demoLimit);
    }
  });

  test('maxStartAmount is still dead — if it gains a reader, this copy rule needs revisiting', () => {
    const readers = ['extension', 'backend/src', 'dashboard/src']
      .flatMap((dir) => {
        const walk = (d) => fs.readdirSync(path.join(REPO, d), { withFileTypes: true })
          .flatMap((e) => e.name === 'node_modules' ? []
            : e.isDirectory() ? walk(path.join(d, e.name))
            : [path.join(d, e.name)]);
        return walk(dir);
      })
      .filter((f) => /\.(js|jsx|mjs)$/.test(f) && !/plans\.js$|\.test\./.test(f))
      .filter((f) => /maxStartAmount/.test(fs.readFileSync(path.join(REPO, f), 'utf8')));
    expect(readers).toEqual([]);
  });
});
