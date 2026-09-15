import test from 'node:test';
import assert from 'node:assert/strict';
import {extractDeadline, extractWinners, extractConditions, classifyGenre, evaluate, prune, pageTitle} from '../scripts/promote.mjs';

const now = new Date('2026-09-15T03:00:00Z'); // JST 2026-09-15 12:00
const policy = {allowedDomains: ['www.cosme.net', 'monipla.jp', 'roomclip.jp', 'lipscosme.com'], manualOnly: ['lipscosme.com']};

test('deadline: labeled full date range picks the end date', () => {
  assert.equal(extractDeadline('募集期間:2026年09月15日(火)〜2026年09月21日(月) 3名様', now), '2026-09-21');
});
test('deadline: month/day range without year', () => {
  assert.equal(extractDeadline('応募期間 9/9~9/16 当選人数 1名', now), '2026-09-16');
  assert.equal(extractDeadline('プレゼント 9/9~9/16', now), '2026-09-16');
});
test('deadline: year rollover and relative countdown', () => {
  assert.equal(extractDeadline('応募締切 1/10', now), '2027-01-10');
  assert.equal(extractDeadline('参加〆切 2日前 モニター数 40名', now), '2026-09-17');
  assert.equal(extractDeadline('本日締切', now), '2026-09-15');
});
test('deadline: unknown stays null', () => {
  assert.equal(extractDeadline('応募締切なし', now), null);
});
test('winners extraction', () => {
  assert.equal(extractWinners('モニター数 40名'), 40);
  assert.equal(extractWinners('抽選で合計1,000名にプレゼント'), 1000);
  assert.equal(extractWinners('3名様にプレゼント'), 3);
  assert.equal(extractWinners('人数は未定'), 0);
});
test('conditions and genre', () => {
  const c = extractConditions('Instagramの公開アカウントをお持ちの方 レビューの投稿をして下さる方', 'Monipla');
  assert.equal(c.entryType, 'sns');
  assert.equal(c.requiresReview, true);
  assert.equal(c.requiresPurchase, null);
  assert.equal(extractConditions('対象商品を購入しレシートを撮影', 'official').requiresPurchase, true);
  assert.equal(classifyGenre('大人の肌のための薬用化粧水が登場', 'Monipla'), 'コスメ');
  assert.equal(classifyGenre('DIY用塗り壁材を3名様に', 'RoomClip'), '日用品');
});

const page = (title, body) => `<html><head><title>${title} ｜ RoomClip</title></head><body><main>${body}</main></body></html>`;

test('evaluate publishes a valid live campaign', () => {
  const r = evaluate({source: 'RoomClip', url: 'https://roomclip.jp/form/3807?utm_source=x', now, policy,
    html: page('【無料モニター】塗り壁材を3名様にプレゼント！', '募集期間：2026年09月15日(火)〜2026年09月21日(月) 3名様 投稿していただくこと')});
  assert.equal(r.decision, 'publish');
  assert.equal(r.campaign.deadline, '2026-09-21');
  assert.equal(r.campaign.winners, 3);
  assert.equal(r.campaign.url, 'https://roomclip.jp/form/3807');
  assert.match(r.campaign.id, /^campaign-auto-[0-9a-f]{12}$/);
  assert.equal(r.campaign.autoPublished, true);
});
test('evaluate rejects ended, expired and manual-only sources', () => {
  assert.equal(evaluate({source: 'RoomClip', url: 'https://roomclip.jp/form/1', now, policy, html: page('募集終了しました', '')}).decision, 'reject');
  assert.equal(evaluate({source: 'RoomClip', url: 'https://roomclip.jp/form/2', now, policy, html: page('モニター募集', '応募締切 2026年09月01日')}).decision, 'reject');
  assert.equal(evaluate({source: 'LIPS', url: 'https://lipscosme.com/x', now, policy, html: page('プレゼント', '')}).reason, 'manual-only-source');
});
test('evaluate holds pages without title or with private-looking text', () => {
  assert.equal(evaluate({source: 'Monipla', url: 'https://monipla.jp/a/b/', now, policy, html: '<html><body>x</body></html>'}).decision, 'hold');
  assert.equal(evaluate({source: 'Monipla', url: 'https://monipla.jp/a/c/', now, policy, html: page('連絡 admin@example.com', '')}).decision, 'hold');
});
test('title prefers og:title and strips site suffix', () => {
  assert.equal(pageTitle('<meta property="og:title" content="新商品プレゼント｜モニプラ"><title>x</title>'), '新商品プレゼント');
});
test('prune removes stale auto campaigns', () => {
  const rows = [
    {id: 'campaign-auto-a', deadline: '2026-09-20'},
    {id: 'campaign-auto-b', deadline: '2026-09-10'},
    {id: 'campaign-auto-c', deadline: null, firstSeenAt: '2026-08-01T00:00:00Z'},
    {id: 'campaign-auto-d', deadline: null, firstSeenAt: '2026-09-10T00:00:00Z'},
    {id: 'campaign-auto-e', deadline: '2026-09-30'},
  ];
  assert.deepEqual(prune(rows, now, new Set(['campaign-auto-e'])).map(c => c.id), ['campaign-auto-a', 'campaign-auto-d']);
});
