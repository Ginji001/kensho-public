import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {evaluate} from '../scripts/promote.mjs';

const now = new Date('2026-09-25T03:00:00Z');
const policy = JSON.parse(await fs.readFile(new URL('../data/source-policy.json', import.meta.url), 'utf8'));
const page = (t, b) => `<title>${t}</title><main>${b}</main>`;

test('non-campaign articles are rejected on every discovery source', () => {
  assert.equal(evaluate({source: 'RoomClip', url: 'https://roomclip.jp/mag/archives/57472', now, policy,
    html: page('『RoomClip 10000人の暮らし』一般発売のお知らせ!', '書籍が全国の書店で発売されます')}).reason, 'not-campaign');
  assert.equal(evaluate({source: 'atcosme', url: 'https://www.cosme.net/present/detail/present_id/2', now, policy,
    html: page('@cosmeのお知らせ', '会員規約の改定について')}).reason, 'not-campaign');
});

test('real campaigns on those sources still publish', () => {
  assert.equal(evaluate({source: 'RoomClip', url: 'https://roomclip.jp/mag/archives/93856', now, policy,
    html: page('【無料モニター】ウルトラファインバブル発生装置', '募集期間：2026年09月20日〜2026年10月01日 3名様 モニター 投稿')}).decision, 'publish');
  assert.equal(evaluate({source: 'atcosme', url: 'https://www.cosme.net/present/detail/present_id/1', now, policy,
    html: page('ニベア ボディスクラブをプレゼント! -@cosme(アットコスメ)-', '応募期間 9/20~9/30 当選人数 200名 プレゼント')}).decision, 'publish');
  assert.equal(evaluate({source: 'Monipla', url: 'https://monipla.jp/a/b/', now, policy,
    html: page('新商品モニター募集', '参加〆切 3日前 モニター数 40名 プレゼント')}).decision, 'publish');
});

test('sources that cannot be crawled stay disabled', () => {
  for (const s of ['PCWatch', 'AudioTechnica']) {
    const e = policy.discovery.find(d => d.source === s);
    assert.equal(e.enabled, false, s);
    assert.ok(e.disabledReason, s + ' needs a reason');
  }
});
