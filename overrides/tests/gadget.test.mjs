import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {evaluate, cleanTitle, classifyGenre} from '../scripts/promote.mjs';
import {select} from '../scripts/discover.mjs';
import {findApplyUrl} from '../scripts/refresh.mjs';

const now = new Date('2026-09-15T03:00:00Z');
const policy = JSON.parse(await fs.readFile(new URL('../data/source-policy.json', import.meta.url), 'utf8'));
const pcwatch = policy.discovery.find(d => d.source === 'PCWatch');

test('PC Watch discovery picks present articles only', () => {
  assert.deepEqual(select('PCWatch', [
    'https://pc.watch.impress.co.jp/docs/topic/present/2140680.html',
    'https://pc.watch.impress.co.jp/docs/news/2140000.html',
  ], pcwatch), ['https://pc.watch.impress.co.jp/docs/topic/present/2140680.html']);
});

test('PC Watch present page is published as a gadget campaign with a form link', () => {
  const html = '<html><head><title>【プレゼントコーナー】PC Watch創刊30周年特別プレゼント企画【ドスパラセレクトのケース/電源/CPUクーラーセットを1名様に】 - PC Watch</title></head><body><main><p>応募締切 : 2026年9月21日(月) 12:00まで</p><p>1名様</p><a href="https://docs.google.com/forms/d/e/abc/viewform">応募フォーム</a></main></body></html>';
  const r = evaluate({source: 'PCWatch', url: 'https://pc.watch.impress.co.jp/docs/topic/present/2140680.html', html, now, policy});
  assert.equal(r.decision, 'publish');
  assert.equal(r.campaign.name, 'ドスパラセレクトのケース/電源/CPUクーラーセットを1名様に');
  assert.equal(r.campaign.genre, 'ガジェット・家電');
  assert.equal(r.campaign.deadline, '2026-09-21');
  assert.equal(findApplyUrl(html, r.campaign.url, policy.allowedDomains, r.campaign.url), 'https://docs.google.com/forms/d/e/abc/viewform');
});

test('gadget sources require a deadline and a campaign-like title', () => {
  const page = (t, b) => `<title>${t}</title><main>${b}</main>`;
  assert.equal(evaluate({source: 'PCWatch', url: 'https://pc.watch.impress.co.jp/docs/topic/present/1.html', now, policy, html: page('プレゼント企画', '1名様')}).reason, 'no-deadline');
  assert.equal(evaluate({source: 'AudioTechnica', url: 'https://www.audio-technica.co.jp/news/detail/1', now, policy, html: page('新製品発表', '応募締切 2026年10月1日')}).reason, 'not-campaign');
});

test('titles and genres are cleaned for gadgets and @cosme', () => {
  assert.equal(cleanTitle('SK-II/クリームをプレゼント! -@cosme(アットコスメ)-'), 'SK-II/クリームをプレゼント!');
  assert.equal(classifyGenre('ワイヤレスイヤフォンが当たる', 'Monipla'), 'ガジェット・家電');
  assert.equal(classifyGenre('ゲーミングノートPCプレゼント', 'official'), 'ガジェット・家電');
});

test('PC shop and audio shop campaign pages are understood', () => {
  const tsukumo = '<title>AMDゲームの祭典直前キャンペーン2026｜PC専門店【ツクモ】公式通販サイト</title><main>エントリー期間 ：2026年8月28日 (金)～ 10月11日 (日) 豪華賞品を抽選で10名様に 購入証明としてレシートまたは納品書の画像添付が必須です</main>';
  const t = evaluate({source: 'Tsukumo', url: 'https://shop.tsukumo.co.jp/features/amdreview2608v2/', html: tsukumo, now, policy});
  assert.equal(t.decision, 'publish');
  assert.equal(t.campaign.deadline, '2026-10-11');
  assert.equal(t.campaign.requiresPurchase, true);
  assert.equal(t.campaign.winners, 10);
  const ee = '<title>【祝 e☆イヤホン19周年！】19万eイヤポイントプレゼントキャンペーン！【~2026/9/28(月)まで】</title><main>2026/8/31(月) 11:00 ～ 2026/9/28(月) 11:00 抽選で19名様</main>';
  const e = evaluate({source: 'eEarphone', url: 'https://www.e-earphone.jp/blogs/campaign-sale/e-earpoint_presentcp', html: ee, now, policy});
  assert.equal(e.decision, 'publish');
  assert.equal(e.campaign.deadline, '2026-09-28');
  assert.deepEqual(select('Tsukumo', ['https://shop.tsukumo.co.jp/features/amdreview2608v2/', 'https://shop.tsukumo.co.jp/goods/123'], policy.discovery.find(d => d.source === 'Tsukumo')), ['https://shop.tsukumo.co.jp/features/amdreview2608v2/']);
});
