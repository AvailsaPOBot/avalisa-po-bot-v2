import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const overlayPath = new URL('../overlayView.js', import.meta.url);
const contentPath = new URL('../content.js', import.meta.url);
const manifestPath = new URL('../manifest.json', import.meta.url);

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

test('claim markup is outside the hidden limit message', async () => {
  const overlay = await readFile(overlayPath, 'utf8');
  const limitIdOffset = overlay.indexOf('id="av-limit-msg"');
  const limitStart = overlay.lastIndexOf('<div', limitIdOffset);
  const claimBlockIdOffset = overlay.indexOf('id="av-claim-block"');
  const claimBlockStart = overlay.lastIndexOf('<div', claimBlockIdOffset);
  const claimStart = overlay.indexOf('id="av-claim-section"');

  assert.ok(limitStart >= 0, 'limit message exists');
  assert.ok(claimBlockStart >= 0, 'claim block exists');
  assert.ok(claimStart >= 0, 'claim section exists');
  assert.ok(
    claimStart < limitStart || claimStart > closingDivOffset(overlay, limitStart),
    'claim section is not nested inside the limit message'
  );
  assert.ok(
    claimStart > claimBlockStart && claimStart < closingDivOffset(overlay, claimBlockStart),
    'claim section lives in the dedicated claim block'
  );
});

test('claim block is hidden by default', async () => {
  const overlay = await readFile(overlayPath, 'utf8');

  assert.match(
    overlay,
    /<div id="av-claim-block" class="av-section" style="display:none">/
  );
});

test('claim handler IDs occur exactly once', async () => {
  const overlay = await readFile(overlayPath, 'utf8');
  const ids = [
    'av-claim-section',
    'av-claim-btn',
    'av-claim-uid-input',
    'av-claim-uid',
    'av-claim-submit',
    'av-claim-status',
  ];

  for (const id of ids) {
    assert.equal(
      [...overlay.matchAll(new RegExp(`id="${id}"`, 'g'))].length,
      1,
      `${id} occurs exactly once`
    );
  }
});

test('content UI gates the claim block to signed-in free/demo users', async () => {
  const content = await readFile(contentPath, 'utf8');

  assert.match(content, /getElementById\('av-claim-block'\)/);
  assert.match(content, /state\.jwt\s*&&\s*plan\s*===\s*'free'/);
  assert.match(content, /plan === 'free' \? 'demo'/);
});

test('manifest has the claim-reachability release version', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  assert.equal(manifest.version, '2.4.11');
});
