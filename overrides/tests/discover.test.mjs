import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical,select} from '../scripts/discover.mjs';

test('discovery canonicalizes tracking URLs',()=>{
  assert.equal(canonical('https://roomclip.jp/form/3783?utm_source=x#top'),'https://roomclip.jp/form/3783');
  assert.equal(canonical('https://monipla.jp/foo/bar/?ref=top_live'),'https://monipla.jp/foo/bar/');
});

test('source selectors accept campaign links and reject utilities',()=>{
  assert.deepEqual(select('RoomClip',['https://roomclip.jp/form/3783','https://roomclip.jp/help']),['https://roomclip.jp/form/3783']);
  assert.deepEqual(select('atcosme',['https://www.cosme.net/present/detail/present_id/19625','https://www.cosme.net/present/']),['https://www.cosme.net/present/detail/present_id/19625']);
  assert.deepEqual(select('Monipla',['https://monipla.jp/drhauschka/20260831/?ref=top_live','https://monipla.jp/mp/register.php']),['https://monipla.jp/drhauschka/20260831/']);
});
