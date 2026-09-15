// 新規候補の自動審査・自動公開
// discover.mjs が集めた候補ページを取得し、締切・当選人数・条件を抽出。
// 安全基準を満たすものは data/auto-campaigns.json に自動追加し、
// 満たさないものは data/review-queue.json に保留して次回以降に再判定する。
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {getPublic, clean, endedPage} from './refresh.mjs';
import {canonical} from './discover.mjs';
import {dayJST} from '../public/core.mjs';

const root = new URL('../', import.meta.url);
const readJson = async (p, fallback) => {
  try { return JSON.parse(await fs.readFile(new URL(p, root), 'utf8')); } catch { return fallback; }
};
const writeJson = (p, data) => fs.writeFile(new URL(p, root), JSON.stringify(data, null, 2) + '\n', 'utf8');

export const MAX_ATTEMPTS = 12;          // 6時間ごと × 12 = 約3日間 再判定
export const NO_DEADLINE_TTL_DAYS = 21;  // 締切不明の自動掲載は21日で非表示
export const REJECT_MEMORY_DAYS = 30;    // 却下URLは30日間再発見しない
const DAY = 86400000;

const decode = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const strip = html => decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export function mainText(html) {
  const pick = html.match(/<main[\s\S]*?<\/main>/i) || html.match(/<article[\s\S]*?<\/article>/i);
  return strip(pick ? pick[0] : (html.match(/<body[\s\S]*<\/body>/i) || [html])[0]).normalize('NFKC');
}

export function cleanTitle(t) {
  return t
    .replace(/\s+-\s+(?:PC|AV|GAME|ケータイ|INTERNET|窓の杜)\s*Watch$/i, '')
    .replace(/\s*-\s*@cosme\s*\(アットコスメ\)\s*-\s*$/, '')
    .replace(/^【プレゼントコーナー】.*?【(.+)】$/, '$1')
    .trim();
}

export function pageTitle(html) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const t = og ? og[1] : (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  return cleanTitle(decode(t).replace(/<[^>]+>/g, '').replace(/\s*[|｜].*$/, '').replace(/\s+/g, ' ').trim().normalize('NFKC')).slice(0, 160);
}

const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const validDate = (y, m, d) => { const t = Date.parse(iso(y, m, d) + 'T00:00:00+09:00'); return Number.isFinite(t) && new Date(t + 9 * 3600000).getUTCDate() === d ? t : NaN; };

// 締切日（JST, YYYY-MM-DD）を抽出。見つからなければ null。
export function extractDeadline(text, now = new Date()) {
  const today = dayJST(now);
  const todayMs = Date.parse(today + 'T00:00:00+09:00');
  const [ty] = today.split('-').map(Number);
  const plausible = ms => Number.isFinite(ms) && ms >= todayMs - 400 * DAY && ms <= todayMs + 400 * DAY;
  const fromMD = (m, d) => {
    let ms = validDate(ty, m, d);
    if (ms < todayMs - 60 * DAY) ms = validDate(ty + 1, m, d);
    return ms;
  };
  const datesIn = s => {
    const out = [];
    const re = /(?:(20\d{2})\s*[年/.\-]\s*)?(\d{1,2})\s*[月/.\-]\s*(\d{1,2})\s*日?/g;
    let m;
    while ((m = re.exec(s))) {
      const mo = +m[2], d = +m[3];
      if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
      if (!m[1] && !/[月/]/.test(m[0])) continue;
      const ms = m[1] ? validDate(+m[1], mo, d) : fromMD(mo, d);
      if (plausible(ms)) out.push(ms);
    }
    return out;
  };
  const fmt = ms => dayJST(new Date(ms));

  if (/本日(?:締切|〆切|まで)/.test(text)) return today;
  const rel = text.match(/(?:締切|〆切|締め切り)(?:まで)?\s*(?:あと|残り)?\s*(\d{1,3})\s*日/);
  if (rel) return fmt(todayMs + +rel[1] * DAY);

  const label = /(応募期間|募集期間|応募締切|応募締め切り|締切|〆切|受付期間|実施期間|キャンペーン期間|開催期間|参加期限|応募期限)/g;
  let lm;
  while ((lm = label.exec(text))) {
    const window = text.slice(lm.index, lm.index + 90);
    const ds = datesIn(window);
    if (ds.length) return fmt(ds.length >= 2 && /[~〜\-–―]/.test(window) ? Math.max(...ds.slice(0, 2)) : ds[0]);
  }
  const range = text.match(/(?:(20\d{2})\s*[年/.]\s*)?(\d{1,2})\s*[/月]\s*(\d{1,2})\s*日?\s*(?:\([^)]{1,3}\))?\s*[~〜\-–―]\s*(?:(20\d{2})\s*[年/.]\s*)?(\d{1,2})\s*[/月]\s*(\d{1,2})/);
  if (range) {
    const ms = range[4] ? validDate(+range[4], +range[5], +range[6]) : fromMD(+range[5], +range[6]);
    if (plausible(ms)) return fmt(ms);
  }
  return null;
}

export function extractWinners(text) {
  const pats = [
    /(?:当選(?:人数|者数)?|モニター数|募集人数|プレゼント人数)\s*[:：]?\s*(?:合計|計|抽選で)?\s*([\d,]+)\s*名/,
    /抽選で\s*(?:合計|計)?\s*([\d,]+)\s*名/,
    /([\d,]+)\s*名様/,
  ];
  for (const p of pats) {
    const m = text.match(p);
    if (m) { const n = +m[1].replace(/,/g, ''); if (n > 0 && n < 10000000) return n; }
  }
  return 0;
}

const GENRE_RULES = [
  ['ポイント・金券', /ポイント|ギフト券|ギフトカード|QUOカード|クオカード|商品券|Amazonギフト|PayPay|電子マネー/i],
  ['ペット', /ペット|犬|猫|ドッグ|キャット/],
  ['ガジェット・家電', /家電|イヤホン|イヤフォン|ヘッドホン|ヘッドフォン|スピーカー|サウンドバー|オーディオ|TWS|マイク(?!ロ)|アンプ|スマホ|充電器|モバイルバッテリー|ドライヤー|掃除機|カメラ|ガジェット|美顔器|PC|パソコン|キーボード|マウス(?!ウォッシュ)|SSD|HDD|CPU|GPU|グラフィックボード|マザーボード|電源ユニット|ディスプレイ|ルーター|タブレット|ゲーミング|Chromebook|MacBook|iPad/i],
  ['食品・飲料', /食品|飲料|お茶|緑茶|麦茶|コーヒー|お菓子|スイーツ|ビール|日本酒|ワイン|お米|調味料|ジュース|ドリンク|サプリ|グルメ|プロテイン/],
  ['コスメ', /化粧|コスメ|美容|スキンケア|ファンデ|リップ|シャンプー|ヘアケア|美顔|クレンジング|パック|セラム|美容液|日焼け止め|ネイル|香水|ボディ/],
  ['旅行・本', /旅行|宿泊|ホテル|書籍|絵本|雑誌/],
  ['日用品', /洗剤|収納|インテリア|キッチン|雑貨|日用品|タオル|壁紙|DIY|家具|寝具|掃除|入浴剤/i],
];
export function classifyGenre(title, source) {
  for (const [g, re] of GENRE_RULES) if (re.test(title)) return g;
  return source === 'atcosme' ? 'コスメ' : source === 'RoomClip' ? '日用品' : 'その他';
}

export function extractConditions(text, source) {
  const purchase = /(?:対象)?商品(?:を|の)?(?:ご)?購入|レシート(?:を|の)?(?:撮影|送付|応募)|お買い上げ|購入者限定|購入が必要/.test(text);
  const noPurchase = /購入不要|購入の必要はありません/.test(text);
  const sns = /Instagram|インスタグラム|TikTok|X\s*\(旧Twitter\)|Twitter|フォロー(?:&|＆|して)|リポスト|リツイート/i.test(text);
  const review = /レビュー|口コミ|クチコミ|投稿(?:して|いただ|する)|感想/.test(text);
  const app = /アプリ(?:を|の)?(?:ダウンロード|インストール|から応募)/.test(text);
  const line = /LINE(?:友だち|で応募|公式アカウント)/.test(text);
  const monitor = /モニター/.test(text) || source === 'RoomClip';
  const labels = [source === 'atcosme' ? '@cosme会員' : source === 'Monipla' ? 'モニプラ会員' : source === 'RoomClip' ? 'RoomClip会員' : '会員登録'];
  if (purchase) labels.push('購入必要');
  if (sns) labels.push('SNS');
  if (review) labels.push('投稿・レビュー');
  if (app) labels.push('アプリ');
  if (line) labels.push('LINE');
  return {
    condition: labels.join('・') + '（自動抽出・詳細は公式で確認）',
    entryType: purchase ? 'purchase' : sns ? 'sns' : line ? 'line' : app ? 'app' : 'member',
    requiresPurchase: purchase ? true : noPurchase ? false : null,
    requiresReview: review,
    requiresApp: app,
    requiresLogin: true,
    isMonitor: monitor,
  };
}

const CLOSED_TITLE = /当選者発表|結果発表|募集終了|応募終了|受付終了|終了しました|見つかりません|エラー/;

// 候補1件を判定。{decision:'publish'|'hold'|'reject', reason, campaign?}
export function evaluate({source, url, html, now = new Date(), policy}) {
  const host = new URL(url).hostname;
  if (policy.manualOnly.includes(host)) return {decision: 'reject', reason: 'manual-only-source'};
  const entry = (policy.discovery || []).find(d => d.source === source) || {};
  const title = pageTitle(html);
  if (!title) return {decision: 'hold', reason: 'no-title'};
  if (entry.titlePattern && !new RegExp(entry.titlePattern, 'i').test(title + ' ' + ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ''))) return {decision: 'reject', reason: 'not-campaign'};
  if (CLOSED_TITLE.test(title) || endedPage(html)) return {decision: 'reject', reason: 'ended'};
  const text = mainText(html);
  const deadline = extractDeadline(text, now);
  if (deadline && deadline < dayJST(now)) return {decision: 'reject', reason: 'expired'};
  if (!deadline && entry.requireDeadline) return {decision: 'hold', reason: 'no-deadline'};
  const winners = extractWinners(text);
  const cond = extractConditions(text, source);
  const nowIso = now.toISOString();
  const raw = {
    id: 'campaign-auto-' + crypto.createHash('sha1').update(canonical(url)).digest('hex').slice(0, 12),
    source, genre: entry.genre || classifyGenre(title, source), name: title, prize: title.slice(0, 120),
    winners, winnersText: winners ? `${winners.toLocaleString('en-US')}名` : '公式で確認',
    deadline, ...cond, url: canonical(url), applyUrl: null, cost: 'unknown', productType: 'unknown',
    updatedAt: nowIso, autoPublished: true,
  };
  try { clean(raw, policy.allowedDomains); } catch (e) { return {decision: 'hold', reason: e.message}; }
  return {decision: 'publish', reason: deadline ? 'ok' : 'ok-no-deadline', campaign: raw};
}

// 自動掲載の整理：締切を3日過ぎたもの・締切不明で期限切れのものを削除
export function prune(auto, now = new Date(), endedIds = new Set()) {
  const today = dayJST(now);
  return auto.filter(c => {
    if (endedIds.has(c.id)) return false;
    if (c.deadline) return Date.parse(c.deadline.slice(0, 10) + 'T00:00:00+09:00') + 3 * DAY >= Date.parse(today + 'T00:00:00+09:00');
    return Date.parse(c.firstSeenAt || c.updatedAt) + NO_DEADLINE_TTL_DAYS * DAY > +now;
  });
}

async function runPrune() {
  const auto = await readJson('data/auto-campaigns.json', []);
  const pub = await readJson('public/public-campaigns.json', {campaigns: []});
  const ended = new Set(pub.campaigns.filter(c => c.linkStatus === 'ended').map(c => c.id));
  const kept = prune(auto, new Date(), ended);
  await writeJson('data/auto-campaigns.json', kept);
  console.log(JSON.stringify({pruned: auto.length - kept.length, autoCampaigns: kept.length}));
}

async function main() {
  const now = new Date();
  const policy = await readJson('data/source-policy.json');
  const reviewed = await readJson('data/reviewed-campaigns.json', []);
  const auto = await readJson('data/auto-campaigns.json', []);
  const queue = await readJson('data/review-queue.json', {items: []});
  const discovered = await readJson('data/discovered-campaigns.json', {candidates: []});

  const known = new Set([...reviewed, ...auto].map(c => canonical(c.url)));
  const items = new Map();
  for (const q of queue.items || []) {
    if (q.status === 'rejected' && Date.parse(q.updatedAt) + REJECT_MEMORY_DAYS * DAY < +now) continue;
    items.set(q.url, q);
  }
  for (const c of discovered.candidates || []) {
    if (!['candidate', 'needs-review', 'unreachable'].includes(c.status)) continue;
    const url = canonical(c.url);
    if (known.has(url) || items.has(url)) continue;
    items.set(url, {url, source: c.source, title: c.title || '', status: 'held', attempts: 0, firstSeenAt: now.toISOString()});
  }

  const stats = {published: 0, held: 0, rejected: 0};
  const work = [...items.values()].filter(q => q.status === 'held' && !known.has(q.url));
  let i = 0;
  await Promise.all(Array.from({length: 4}, async () => {
    while (i < work.length) {
      const q = work[i++];
      q.attempts = (q.attempts || 0) + 1;
      q.updatedAt = now.toISOString();
      let result;
      try {
        const page = await getPublic(q.url, policy.allowedDomains);
        result = evaluate({source: q.source, url: q.url, html: page.html, now, policy});
      } catch (e) {
        result = {decision: 'hold', reason: 'fetch:' + e.message};
      }
      q.lastReason = result.reason;
      if (result.decision === 'publish') {
        auto.push({...result.campaign, firstSeenAt: q.firstSeenAt});
        known.add(q.url);
        items.delete(q.url);
        stats.published++;
      } else if (result.decision === 'reject' || q.attempts >= MAX_ATTEMPTS) {
        q.status = 'rejected';
        stats.rejected++;
      } else {
        stats.held++;
      }
    }
  }));

  const kept = prune(auto, now);
  await writeJson('data/auto-campaigns.json', kept);
  const outItems = [...items.values()].sort((a, b) => a.status.localeCompare(b.status) || a.url.localeCompare(b.url));
  await writeJson('data/review-queue.json', {schemaVersion: 1, updatedAt: now.toISOString(), items: outItems});
  console.log(JSON.stringify({...stats, autoCampaigns: kept.length, queueHeld: outItems.filter(x => x.status === 'held').length}));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--prune')) await runPrune(); else await main();
}
