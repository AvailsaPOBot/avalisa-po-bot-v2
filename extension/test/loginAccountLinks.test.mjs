import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const loginPath = new URL('../login.html', import.meta.url);

test('signed-out login offers account creation and password recovery in a new tab', async () => {
  const login = await readFile(loginPath, 'utf8');

  assert.match(
    login,
    /<a href="https:\/\/avalisabot\.vercel\.app\/register" target="_blank" rel="noopener">Create an account<\/a>/
  );
  assert.match(
    login,
    /<a href="https:\/\/avalisabot\.vercel\.app\/login" target="_blank" rel="noopener">Forgot password\?<\/a>/
  );
});

test('login note distinguishes Avalisa from Pocket Option credentials', async () => {
  const login = await readFile(loginPath, 'utf8');

  assert.match(login, /Your Avalisa account is separate from Pocket Option\./);
});
// The iframe is a fixed-height box and clips whatever overflows, so adding anything to
// login.html can silently hide it. Measured in the real panel width (280px panel - 16px
// padding = 248px content): the links plus the two-line note need 192px. This asserts the
// declared frame height leaves room, so the next person to add a line here is warned by a
// failing test rather than by a user who cannot find the signup link.
test('the login iframe is tall enough for the links and the note', async () => {
  const overlay = await readFile(new URL('../overlayView.js', import.meta.url), 'utf8');
  const m = overlay.match(/\.av-login-frame\s*\{[^}]*height:\s*(\d+)px/s);
  assert.ok(m, 'could not find .av-login-frame height');
  assert.ok(Number(m[1]) >= 192,
    `login iframe is ${m[1]}px but the content measures 192px - the note will be clipped`);
});
