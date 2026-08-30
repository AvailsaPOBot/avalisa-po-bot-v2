const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const publicDirectory = path.resolve(__dirname, '..', 'public');
const indexHtml = fs.readFileSync(path.join(publicDirectory, 'index.html'), 'utf8');

function metaContent(attribute, value) {
  const tag = indexHtml
    .match(/<meta\b[^>]*>/gi)
    .find((candidate) => new RegExp(`\\b${attribute}=["']${value}["']`, 'i').test(candidate));

  if (!tag) {
    return undefined;
  }

  return tag.match(/\bcontent=["']([^"']*)["']/i)?.[1];
}

function documentTitle() {
  return indexHtml.match(/<title>([^<]*)<\/title>/i)?.[1];
}

describe('share preview metadata', () => {
  test('provides the required Open Graph and Twitter metadata', () => {
    expect(metaContent('property', 'og:title')).toBeTruthy();
    expect(metaContent('property', 'og:description')).toBeTruthy();
    expect(metaContent('property', 'og:image')).toBeTruthy();
    expect(metaContent('property', 'og:url')).toBeTruthy();
    expect(metaContent('name', 'twitter:card')).toBe('summary_large_image');
  });

  test('uses an absolute HTTPS image URL that maps to a public asset', () => {
    const imageUrl = new URL(metaContent('property', 'og:image'));

    expect(imageUrl.protocol).toBe('https:');
    expect(fs.existsSync(path.join(publicDirectory, imageUrl.pathname))).toBe(true);
  });

  test('keeps share-preview copy free of prohibited marketing claims', () => {
    const previewCopy = [
      documentTitle(),
      metaContent('name', 'description'),
      metaContent('property', 'og:title'),
      metaContent('property', 'og:description'),
      metaContent('name', 'twitter:title'),
      metaContent('name', 'twitter:description'),
    ].join(' ');

    expect(previewCopy).not.toMatch(/profit|guaranteed|win rate|earnings|rich|%/i);
  });

  // A share card is the most-republished asset we own: it is copied into every
  // Telegram, Facebook and X preview and cached by those platforms for weeks.
  // The asset originally wired up here (Ads.jpg, and a byte-identical duplicate)
  // rendered the Board's own email address inside a mock product panel, and both
  // copies were being served publicly. Verified by LOOKING at the image - the
  // earlier check only confirmed the file existed. This guard is by content hash,
  // not filename, so re-adding the same picture under any new name still fails.
  const FORBIDDEN_ASSET_MD5 = 'f17611d1502f29722820864a2739fca9';

  test('no public asset is the image that leaks the Board email', () => {
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      return e.isDirectory() ? walk(full) : [full];
    });

    const offenders = walk(publicDirectory).filter((file) =>
      crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex') === FORBIDDEN_ASSET_MD5
    );

    expect(offenders).toEqual([]);
  });

  // The Phase 1 criterion is "a designed 1200x630 card, not the bare logo". That was my own
  // judgement until now; this makes it a fact the suite can check. Dimensions come straight
  // from the PNG IHDR chunk (bytes 16-24), so no image library is needed. Facebook, X and
  // Telegram all crop toward 1.91:1 - a square logo gets centre-cropped and the wordmark is
  // the first thing lost, which is exactly what the old 700x700 asset did.
  test('share image is a 1.91:1 card, not a square logo', () => {
    const imageUrl = new URL(metaContent('property', 'og:image'));
    const buf = fs.readFileSync(path.join(publicDirectory, imageUrl.pathname));
    expect(buf.slice(1, 4).toString()).toBe('PNG');
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    expect(width).toBe(1200);
    expect(height).toBe(630);
    // and the declared meta dimensions must match the actual file
    expect(metaContent('property', 'og:image:width')).toBe(String(width));
    expect(metaContent('property', 'og:image:height')).toBe(String(height));
  });
});
