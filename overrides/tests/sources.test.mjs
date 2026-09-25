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

test('plain prize draws still publish', () => {
  assert.equal(evaluate({source: 'atcosme', url: 'https://www.cosme.net/present/detail/present_id/1', now, policy,
    html: page('ニベア ボディスクラブをプレゼント! -@cosme(アットコスメ)-', '応募期間 9/20~9/30 当選人数 200名 プレゼント')}).decision, 'publish');
});

test('sources that cannot be crawled stay disabled', () => {
  for (const s of ['PCWatch', 'AudioTechnica']) {
    const e = policy.discovery.find(d => d.source === s);
    assert.equal(e.enabled, false, s);
    assert.ok(e.disabledReason, s + ' needs a reason');
  }
});

test('apply links are found for the real page shapes of each source', async () => {
  const {findApplyUrl} = await import('../scripts/refresh.mjs');
  const domains = policy.allowedDomains;
  const mynavi = policy.discovery.find(d => d.source === 'MynaviNews');
  const roomclip = policy.discovery.find(d => d.source === 'RoomClip');
  // マイナビ：画像リンクなので文字では拾えず、URLの形で判定する
  assert.equal(findApplyUrl('<a href="https://news.mynavi.jp/mypage/member/enquete/jump/000090001-17515?argument=x"><img src="a.png"></a>',
    'https://news.mynavi.jp/article/20260911-present01/', domains, 'https://news.mynavi.jp/article/20260911-present01/', mynavi.applyUrlPattern),
    'https://news.mynavi.jp/mypage/member/enquete/jump/000090001-17515?argument=x');
  // RoomClip：記事から申し込みフォームへ
  assert.equal(findApplyUrl('<a href="https://roomclip.jp/form/3804">申し込みフォームへ</a>',
    'https://roomclip.jp/mag/archives/93856', domains, 'https://roomclip.jp/mag/archives/93856', roomclip.applyUrlPattern),
    'https://roomclip.jp/form/3804');
  // 4Gamer：本文中の応募ページリンク
  assert.equal(findApplyUrl('<a href="https://www.4gamer.net/games/999/G999905/20260731044/">プレゼント応募ページ</a>',
    'https://www.4gamer.net/games/999/G999905/20260828015/', domains, 'https://www.4gamer.net/games/999/G999905/20260828015/'),
    'https://www.4gamer.net/games/999/G999905/20260731044/');
  // マイナビ本番HTMLはJSONの中でタグがエスケープされている
  assert.equal(findApplyUrl('{"body":"\\u003ca href=\\"https://news.mynavi.jp/mypage/member/enquete/jump/000090001-17515?argument=x\\u0026amp;dmai=y\\"\\u003e\\u003cimg\\u003e\\u003c/a\\u003e"}',
    'https://news.mynavi.jp/article/20260911-present01/', domains, 'https://news.mynavi.jp/article/20260911-present01/', mynavi.applyUrlPattern),
    'https://news.mynavi.jp/mypage/member/enquete/jump/000090001-17515?argument=x&dmai=y');
  // 紛らわしいリンクは拾わない
  assert.equal(findApplyUrl('<a href="https://www.4gamer.net/rules/">応募規約はこちら</a><a href="https://www.4gamer.net/secure/mail/form.php">問い合わせ</a>',
    'https://www.4gamer.net/games/999/G999905/1/', domains, 'https://www.4gamer.net/games/999/G999905/1/'), null);
});

test('campaigns that need a purchase, monitoring or an SNS post are never published', () => {
  const cases = [
    ['対象商品を購入してレシートを送付 応募期間 2026/10/1~2026/10/20 抽選で10名様', 'needs-purchase'],
    ['モニター募集 応募期間 2026/10/1~2026/10/20 抽選で10名様 プレゼント', 'monitor'],
    ['Instagramをフォローして投稿 応募期間 2026/10/1~2026/10/20 抽選で10名様 プレゼント', 'needs-post'],
  ];
  for (const [body, reason] of cases) {
    assert.equal(evaluate({source: 'MynaviNews', url: 'https://news.mynavi.jp/article/20261001-present01/', now, policy,
      html: page('【10名様】プレゼント', body)}).reason, reason, body.slice(0, 12));
  }
});

test('sources whose campaigns are all monitor or SNS work are turned off', () => {
  for (const s of ['RoomClip', 'Monipla']) {
    const e = policy.discovery.find(d => d.source === s);
    assert.equal(e.enabled, false, s);
    assert.ok(e.disabledReason, s);
  }
});
