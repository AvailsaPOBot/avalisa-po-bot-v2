import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const overlayPath = new URL('../overlayView.js', import.meta.url);
const contentPath = new URL('../content.js', import.meta.url);

function closingDivOffset(source, openingOffset) {
  const divTag = /<\/?div\b[^>]*>/gi;
  divTag.lastIndex = openingOffset;
  let depth = 0;

  for (let match; (match = divTag.exec(source));) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return divTag.lastIndex;
  }

  throw new Error('Unclosed div');
}

function limitMessage(source) {
  const start = source.indexOf('<div id="av-limit-msg"');
  assert.ok(start >= 0, 'limit message exists');
  return source.slice(start, closingDivOffset(source, start));
}

test('plans link remains reachable outside the hidden limit message', async () => {
  const overlay = await readFile(overlayPath, 'utf8');
  const limit = limitMessage(overlay);

  assert.doesNotMatch(limit, /id="av-plans-link"/);
  assert.match(overlay, /<a id="av-plans-link" target="_blank" rel="noopener">Plans<\/a>/);
});

test('limit message prioritizes the paid upgrade path', async () => {
  const overlay = await readFile(overlayPath, 'utf8');
  const limit = limitMessage(overlay);

  assert.match(limit, /<a id="av-upgrade-link" class="av-btn av-btn-primary"[^>]*>Upgrade Plan<\/a>/);
  assert.match(limit, /<a id="av-affiliate-link" class="av-btn av-btn-outline"[^>]*>[^<]*NEW PO account[^<]*<\/a>/);
});

test('plans link receives its pricing URL from DASHBOARD_URL', async () => {
  const content = await readFile(contentPath, 'utf8');

  assert.match(
    content,
    /getElementById\('av-plans-link'\)[\s\S]{0,120}\.href\s*=\s*`\$\{DASHBOARD_URL\}\/pricing`/
  );
  assert.doesNotMatch(
    content,
    /av-plans-link[\s\S]{0,200}https?:\/\/[^\s'"`]+\/pricing/
  );
});
