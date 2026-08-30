const fs = require('fs');
const path = require('path');

// Guard for a positioning decision that is easy to undo by accident. The landing hero
// spent months on generic feature labels while the free tier - the one thing every
// competitor leads with - sat far below the fold. If someone rewrites these slots, this
// test should make them decide deliberately rather than quietly drop the word.
const landing = fs.readFileSync(
  path.resolve(__dirname, 'pages', 'Landing.jsx'),
  'utf8'
);

const heroBlock = landing.slice(
  landing.indexOf('const heroHighlights'),
  landing.indexOf('const deviceLinks')
);

describe('landing hero', () => {
  test('leads with the free demo', () => {
    expect(heroBlock).toMatch(/free/i);
    expect(heroBlock).toMatch(/demo/i);
  });

  test('makes no outcome or profit claim', () => {
    expect(heroBlock).not.toMatch(/profit|guaranteed|win rate|earnings|returns/i);
  });
});
