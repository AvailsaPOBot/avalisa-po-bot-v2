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

// Was assert.equal(manifest.version, '2.4.13') — pinned to an exact value, so EVERY future
// release failed it and the extension could not be shipped without editing a test. Caught by the
// 2.4.14 bump. Fourth guard in this repo pinned to a literal rather than to intent (#117, #124,
// #127): the intent is "this build is at or beyond the release that carried the claim fix".
function semverAtLeast(actual, minimum) {
  const a = String(actual).split('.').map(Number);
  const b = String(minimum).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

test('manifest is at or beyond the claim-reachability release', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  assert.ok(
    semverAtLeast(manifest.version, '2.4.13'),
    `manifest ${manifest.version} predates the claim-reachability fix (2.4.13)`
  );
});

test('the version guard can actually fail (mutation)', () => {
  assert.equal(semverAtLeast('2.4.12', '2.4.13'), false, 'an older build must be rejected');
  assert.equal(semverAtLeast('2.4.13', '2.4.13'), true, 'the release itself must pass');
  assert.equal(semverAtLeast('2.4.14', '2.4.13'), true, 'a later build must pass');
  assert.equal(semverAtLeast('2.5.0', '2.4.13'), true, 'a later minor must pass');
  assert.equal(semverAtLeast('1.9.9', '2.4.13'), false, 'an older major must be rejected');
});
