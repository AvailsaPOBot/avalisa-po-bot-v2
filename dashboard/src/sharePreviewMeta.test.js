const fs = require('fs');
const path = require('path');

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
});
