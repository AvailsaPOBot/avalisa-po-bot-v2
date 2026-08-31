import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const extensionPath = new URL('../', import.meta.url);
const configPath = new URL('../config.js', import.meta.url);
const popupPath = new URL('../popup.js', import.meta.url);
const popupHtmlPath = new URL('../popup.html', import.meta.url);

test('affiliate URL literal appears exactly once across extension scripts', async () => {
  const files = (await readdir(extensionPath)).filter((file) => file.endsWith('.js'));
  const occurrences = await Promise.all(files.map(async (file) => {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    return source.match(/u3\.shortink\.io/g) || [];
  }));

  assert.equal(occurrences.flat().length, 1);
});

test('popup loads the shared config before using AFFILIATE_LINK', async () => {
  const [config, popup, popupHtml] = await Promise.all([
    readFile(configPath, 'utf8'),
    readFile(popupPath, 'utf8'),
    readFile(popupHtmlPath, 'utf8'),
  ]);

  assert.match(config, /const AFFILIATE_LINK = 'https:\/\/u3\.shortink\.io/);
  assert.match(popup, /data\.affiliateLink \|\| AFFILIATE_LINK/);
  assert.ok(
    popupHtml.indexOf('src="config.js"') < popupHtml.indexOf('src="popup.js"'),
    'popup loads config.js before popup.js'
  );
});
