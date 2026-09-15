import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {patchApp, patchCss, MARKER} from '../scripts/enhance.mjs';
import {findApplyUrl} from '../scripts/refresh.mjs';

test('UI enhancements patch the app once and keep it valid', async () => {
  const src = await fs.readFile(new URL('../public/app.mjs', import.meta.url), 'utf8');
  const out = patchApp(src);
  assert.ok(out.includes(MARKER));
  assert.ok(out.includes('extraFilter(selectCampaigns('));
  assert.ok(out.includes('quickDone(c,s,href)'));
  assert.equal(patchApp(out), out);
  assert.equal(patchCss(patchCss('a{}')), patchCss('a{}'));
  const tmp = new URL('../public/.enhance-check.mjs', import.meta.url);
  await fs.writeFile(tmp, out);
  try {
    const {execFileSync} = await import('node:child_process');
    execFileSync(process.execPath, ['--check', tmp.pathname]);
  } finally { await fs.rm(tmp, {force: true}); }
});

test('apply form link is found only for explicit entry buttons on allowed domains', () => {
  const domains = ['monipla.jp', 'www.cosme.net'];
  const base = 'https://monipla.jp/brand/2026/';
  assert.equal(findApplyUrl('<a href="/brand/2026/entry">応募する</a>', base, domains, base), 'https://monipla.jp/brand/2026/entry');
  assert.equal(findApplyUrl('<a class="btn" href="https://www.cosme.net/present/apply?id=1&amp;x=2"><span>今すぐ 応募する</span></a>', base, domains, base), 'https://www.cosme.net/present/apply?id=1&x=2');
  assert.equal(findApplyUrl('<a href="https://evil.example/entry">応募する</a>', base, domains, base), null);
  assert.equal(findApplyUrl('<a href="/brand/2026/">応募する</a>', base, domains, base), null);
  assert.equal(findApplyUrl('<a href="/rules">応募規約はこちら</a>', base, domains, base), null);
});
