import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {evaluate, classifyGenre} from '../scripts/promote.mjs';
import {select} from '../scripts/discover.mjs';

const now = new Date('2026-09-15T03:00:00Z');
const policy = JSON.parse(await fs.readFile(new URL('../data/source-policy.json', import.meta.url), 'utf8'));
const entry = s => policy.discovery.find(d => d.source === s);
const page = (t, b) => `<html><head><title>${t}</title></head><body><main>${b}</main></body></html>`;

test('PC Watch is discovered from the top page', () => {
  assert.equal(entry('PCWatch').url, 'https://pc.watch.impress.co.jp/');
  assert.equal(entry('AudioTechnica').enabled, false);
});

test('4Gamer present articles are selected and recent ones published', () => {
  const g = entry('4Gamer');
  assert.deepEqual(select('4Gamer', [
    'https://www.4gamer.net/games/999/G999905/20260828015/',
    'https://www.4gamer.net/games/000/G000000/FC20090911001/',
    'https://www.4gamer.net/tags/TN/TN024/',
  ], g), ['https://www.4gamer.net/games/999/G999905/20260828015/']);
  const ok = evaluate({source: '4Gamer', url: 'https://www.4gamer.net/games/999/G999905/20260828015/', now, policy,
    html: page('［プレゼント］携帯型ゲームPCやフライトスティックなどが当たるプレゼント企画を実施中', '応募締切 2026年9月20日 23:59')});
  assert.equal(ok.decision, 'publish');
  assert.equal(ok.campaign.genre, 'ガジェット・家電');
  assert.equal(ok.campaign.deadline, '2026-09-20');
});

test('4Gamer old articles and non-present news are rejected', () => {
  const old = evaluate({source: '4Gamer', url: 'https://www.4gamer.net/games/999/G999905/20250902041/', now, policy,
    html: page('［プレゼント］ゲーミングノートPCが当たる', '応募締切 2026年9月20日')});
  assert.equal(old.reason, 'too-old');
  const news = evaluate({source: '4Gamer', url: 'https://www.4gamer.net/games/991/G999106/20260820032/', now, policy,
    html: page('買い切り型クラウドストレージが販売開始', 'プレゼント 応募締切 2026年9月28日')});
  assert.equal(news.reason, 'not-campaign');
});

test('Mynavi reader presents are selected (movie previews excluded) and classified', () => {
  assert.deepEqual(select('MynaviNews', [
    'https://news.mynavi.jp/article/20260911-present01/',
    'https://news.mynavi.jp/article/20260825-presentmovie03/',
    'https://news.mynavi.jp/article/20260907-4895605/',
  ], entry('MynaviNews')), ['https://news.mynavi.jp/article/20260911-present01/']);
  const r = evaluate({source: 'MynaviNews', url: 'https://news.mynavi.jp/article/20260911-present01/', now, policy,
    html: page('【5名様】だしのうま味を手軽に楽しむ!「つゆの素 300ml」と「フレッシュパック ソフト」セットをプレゼント | マイナビニュース', '応募締切 2026年9月25日 5名様')});
  assert.equal(r.decision, 'publish');
  assert.equal(r.campaign.winners, 5);
  assert.equal(classifyGenre('【1名様】スマートコーングラインダーをプレゼント', 'MynaviNews'), 'その他');
  assert.equal(classifyGenre('「つゆの素」セットをプレゼント', 'MynaviNews'), '食品・飲料');
});
