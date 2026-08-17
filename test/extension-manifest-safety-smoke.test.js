const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const extensionDir = path.join(root, 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, 'manifest.json'), 'utf8'));

const expectedHosts = [
  'https://pocketoption.com/*',
  'https://po.cash/*',
  'https://po.trade/*',
];

const expectedIsolatedScripts = [
  'signalEngine.js',
  'config.js',
  'state.js',
  'apiClient.js',
  'storage.js',
  'indicators.js',
  'poDom.js',
  'tradeResult.js',
  'overlayView.js',
  'claimFlow.js',
  'content.js',
];

function assertSameSet(actual, expected, label) {
  assert.deepStrictEqual([...actual].sort(), [...expected].sort(), label);
}

function assertExtensionFile(relativePath) {
  assert.equal(
    fs.existsSync(path.join(extensionDir, relativePath)),
    true,
    `manifest references missing file: ${relativePath}`,
  );
}

assert.equal(manifest.manifest_version, 3);
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.deepStrictEqual(manifest.permissions, ['storage'], 'extension permission creep detected');
assert.equal(manifest.optional_permissions, undefined, 'optional permissions should stay absent');
assertSameSet(manifest.host_permissions || [], expectedHosts, 'host permissions drifted');

const forbiddenPermissions = new Set([
  '<all_urls>',
  'tabs',
  'scripting',
  'webRequest',
  'cookies',
  'clipboardRead',
  'clipboardWrite',
  'downloads',
  'history',
  'identity',
  'management',
  'nativeMessaging',
]);
for (const surface of ['permissions', 'optional_permissions', 'host_permissions']) {
  for (const item of manifest[surface] || []) {
    assert.equal(forbiddenPermissions.has(item), false, `${surface} includes forbidden permission: ${item}`);
  }
}

assert.equal(manifest.content_scripts.length, 2, 'expected main-world injector plus isolated bundle');
const [mainWorld, isolatedWorld] = manifest.content_scripts;
assertSameSet(mainWorld.matches || [], expectedHosts, 'main-world matches drifted');
assert.deepStrictEqual(mainWorld.js, ['injected.js']);
assert.equal(mainWorld.run_at, 'document_start');
assert.equal(mainWorld.world, 'MAIN');

assertSameSet(isolatedWorld.matches || [], expectedHosts, 'isolated-world matches drifted');
assert.deepStrictEqual(isolatedWorld.js, expectedIsolatedScripts);
assert.equal(isolatedWorld.run_at, 'document_start');
assert.equal(isolatedWorld.world, undefined);
assert.equal(
  isolatedWorld.js.indexOf('content.js'),
  isolatedWorld.js.length - 1,
  'content.js must remain last in the isolated bundle',
);

for (const script of manifest.content_scripts) {
  for (const file of script.js || []) assertExtensionFile(file);
}
assertExtensionFile(manifest.background.service_worker);
for (const icon of Object.values(manifest.icons || {})) assertExtensionFile(icon);
for (const icon of Object.values(manifest.action.default_icon || {})) assertExtensionFile(icon);
assertExtensionFile(manifest.action.default_popup);

for (const entry of manifest.web_accessible_resources || []) {
  assertSameSet(entry.matches || [], expectedHosts, 'web accessible matches drifted');
  for (const resource of entry.resources || []) {
    assert.notEqual(resource, '*', 'web accessible resources must not expose every extension file');
    assertExtensionFile(resource);
  }
}

const sourceFiles = fs.readdirSync(extensionDir).filter(file => /\.(js|html|json)$/.test(file));
const source = sourceFiles
  .map(file => fs.readFileSync(path.join(extensionDir, file), 'utf8'))
  .join('\n');

assert.equal(/oil4121|thanadej/i.test(source), false, 'private owner identity leaked into extension source');
const emails = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
for (const email of emails) {
  assert.equal(email.toLowerCase(), 'avalisapobot@gmail.com', `unexpected email in extension source: ${email}`);
}

const publicCopy = [
  manifest.name,
  manifest.description,
  fs.readFileSync(path.join(extensionDir, 'popup.html'), 'utf8'),
  fs.readFileSync(path.join(extensionDir, 'overlayView.js'), 'utf8'),
].join('\n');
const bannedClaimPattern = /\b(guaranteed|guarantee|risk[-\s]?free|can't lose|cannot lose|sure win|100%\s*win|double your money|get rich|financial advice)\b/i;
assert.equal(bannedClaimPattern.test(publicCopy), false, 'rail-banned claim phrase found in public extension copy');

console.log('Extension manifest safety smoke passed.');
