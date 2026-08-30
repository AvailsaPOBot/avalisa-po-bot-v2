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
