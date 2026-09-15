// 応募の手間を減らすUI拡張と、シンプルな絞り込み・落ち着いた配色をビルド時に public/ へ適用する
// （何度実行しても同じ結果）
// - 連続応募モード（未応募を1件ずつ表示 → 開く → 応募した/条件待ち/見送り/あとで）
// - カードの「✓ 応募した」ワンタップ記録
// - 絞り込みは「キーワード・ジャンル・4つのスイッチ」だけに整理
// - カードの条件表示・タグ・統計を最小限に
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root = new URL('../', import.meta.url);
export const MARKER = '/*kensho-enhance-v2*/';

const BLOCK = `${MARKER}
const MYSITES_KEY='kensho-public-mysites-v1';
const SOURCE_LABELS={atcosme:'@cosme',Monipla:'モニプラ',RoomClip:'RoomClip',LIPS:'LIPS',official:'公式サイト',SHARP:'SHARP',Makuake:'Makuake',PCWatch:'PC Watch',AudioTechnica:'オーディオテクニカ',Tsukumo:'ツクモ',eEarphone:'e☆イヤホン'};
const TOPICS={pc:/PC|パソコン|AMD|Ryzen|Radeon|Intel|インテル|GeForce|NVIDIA|自作|キーボード|マウス(?!ウォッシュ)|SSD|HDD|CPU|GPU|グラフィックボード|グラボ|マザーボード|電源ユニット|PCケース|ディスプレイ|(?:\\d+(?:\\.\\d+)?型|4K|ゲーミング|液晶|湾曲|ウルトラワイド)\\S*モニター|ルーター|Wi-?Fi|タブレット|ゲーミング|Chromebook|MacBook|iPad|USB|充電器|モバイルバッテリー/i,audio:/イヤホン|イヤフォン|ヘッドホン|ヘッドフォン|スピーカー|サウンドバー|オーディオ|TWS|マイク(?!ロ)|アンプ|DAP|ポータブルプレーヤー|ターンテーブル|レコードプレーヤー|Soundcore|AirPods|JBL|Bose|Shure|ゼンハイザー|audio-technica/i};
let activeTopic='';
function isAppOnly(c){return c.source==='LIPS'||String(c.url||'').startsWith('https://lipscosme.com/')}
function isDesktop(){try{return !matchMedia('(pointer:coarse)').matches}catch{return true}}
function topicMatch(c,t){return TOPICS[t].test(c.name+' '+(c.prize||''))}
function mySites(){try{const v=JSON.parse(storage?.getItem(MYSITES_KEY)||'[]');return Array.isArray(v)?v.filter(x=>typeof x==='string'):[]}catch{return []}}
function usableHref(c){const end=expired(c)||c.linkStatus==='ended';const ok=!end&&!offline&&c.linkStatus==='ok'&&Date.now()-Date.parse(c.linkCheckedAt)<48*3600000;return ok?safeUrl(c.applyUrl||c.url,catalog.allowedDomains):null}
function extraFilter(xs,f){const mine=mySites();return xs.filter(c=>(!f.onlyNew||(state[c.id]?.status||'new')==='new')&&(!f.noPurchaseLoose||c.requiresPurchase!==true)&&(!f.soon||(daysLeft(c)>=0&&daysLeft(c)<=7))&&(!f.mySites||!mine.length||mine.includes(c.source))&&(!activeTopic||topicMatch(c,activeTopic)))}
function simpleCondition(c){return String(c.condition||'').replace(/（自動抽出[^）]*）/g,'').trim()}
function quickDone(c,s,href){if(!href||s.status!=='new')return el('span',{class:'quick-done-empty'});const b=el('button',{class:'quick-done',type:'button',text:'✓ 応募した'});b.onclick=()=>persist(c.id,{status:'applied'});return b}
function actionButton(text,fn,cls=''){const b=el('button',{type:'button',class:cls,text});b.onclick=fn;return b}
for(const name of ['source','priority','winners','product','deadline','free','noPurchase','monitor','app','login']){const input=form.elements[name];const label=input&&input.closest('label');if(label)label.remove()}
{const st=form.elements.status;if(st){st.value='';st.closest('label').hidden=true}}
form.querySelectorAll('p.small').forEach(p=>p.remove());
document.querySelectorAll('[data-quick="lips"],[data-quick="monitor"],[data-quick="gadget"]').forEach(b=>b.remove());
form.addEventListener('reset',()=>{activeTopic=''});form.addEventListener('input',()=>{activeTopic=''});
{const fav=document.querySelector('[data-quick="favorite"]');for(const [t,label] of [['pc','PC関連'],['audio','オーディオ']]){const b=el('button',{type:'button','data-quick':'topic-'+t,'aria-pressed':'false',text:label});b.onclick=()=>{form.reset();queueMicrotask(()=>{activeTopic=t;document.querySelectorAll('[data-quick]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render()})};fav.before(b)}}
const extraFieldset=form.querySelector('fieldset');extraFieldset.querySelector('legend').textContent='かんたん絞り込み';
for(const [name,label] of [['onlyNew','未応募だけ'],['noPurchaseLoose','購入なし'],['soon','締切7日以内'],['mySites','登録済みサイトだけ']])extraFieldset.append(el('label',{class:'check'},[el('input',{name,type:'checkbox'}),document.createTextNode(label)]));
const sitesDialog=el('dialog',{class:'sites','aria-label':'登録済みサイト'});document.body.append(sitesDialog);
function openSites(){const mine=mySites();const sources=[...new Set(catalog.campaigns.map(c=>c.source))].sort();const boxes=sources.map(s=>{const i=el('input',{type:'checkbox',value:s});i.checked=mine.includes(s);return el('label',{class:'check'},[i,document.createTextNode(SOURCE_LABELS[s]||s)])});sitesDialog.replaceChildren(el('h2',{text:'登録済みサイト'}),el('p',{class:'small',text:'ログイン済みのサイトを選んでください。この端末だけに保存されます。'}),...boxes,actionButton('保存',()=>{const v=boxes.map(l=>l.querySelector('input')).filter(i=>i.checked).map(i=>i.value);try{storage.setItem(MYSITES_KEY,JSON.stringify(v))}catch{notice='設定を保存できませんでした。'}sitesDialog.close();render()}));sitesDialog.showModal()}
extraFieldset.append(actionButton('登録済みサイトを設定',openSites,'text-button sites-button'));
document.querySelectorAll('.results>.small').forEach(p=>p.remove());
const rapidDialog=el('dialog',{class:'rapid','aria-label':'連続応募'});rapidDialog.append(actionButton('×',()=>rapidDialog.close(),'rapid-close'),el('div',{class:'rapid-body'}));document.body.append(rapidDialog);
let rapid={queue:[],i:0,done:0};
function startRapid(){const f=Object.fromEntries(new FormData(form));f.sort=$('#sort').value;rapid={queue:extraFilter(selectCampaigns(catalog.campaigns,f,state),f).filter(c=>(state[c.id]?.status||'new')==='new'&&usableHref(c)&&!(isDesktop()&&isAppOnly(c))).map(c=>c.id),i:0,done:0};showRapid();rapidDialog.showModal()}
function markRapid(status){const id=rapid.queue[rapid.i];if(status==='applied')rapid.done++;rapid.i++;persist(id,{status});showRapid()}
function showRapid(){const body=rapidDialog.querySelector('.rapid-body');const ids=rapid.queue;while(rapid.i<ids.length&&(state[ids[rapid.i]]?.status||'new')!=='new')rapid.i++;if(rapid.i>=ids.length){body.replaceChildren(el('h2',{text:ids.length?'おつかれさまでした':'応募できる案件がありません'}),el('p',{text:ids.length?rapid.done+'件を応募済みにしました。':'絞り込みを変えるか、次の更新をお待ちください。'}),actionButton('閉じる',()=>rapidDialog.close(),'primary'));return}const c=catalog.campaigns.find(x=>x.id===ids[rapid.i]);const href=usableHref(c);body.replaceChildren(el('p',{class:'rapid-progress',text:(rapid.i+1)+' / '+ids.length+' 件'}),el('p',{class:'meta',text:(SOURCE_LABELS[c.source]||c.source)+' · '+c.genre}),el('h3',{text:c.name}),el('p',{class:'prize',text:'当選 '+(c.winnersText||'未確認')+' ・ 締切 '+(c.deadline?c.deadline.slice(5,10).replace('-','/'):'公式で確認')}),el('p',{class:'condition',text:simpleCondition(c)}),isAppOnly(c)?el('p',{class:'app-note',text:'LIPSはスマホのアプリからのみ応募できます'}):el('span'),href?el('a',{class:'rapid-open',href,target:'_blank',rel:'noopener noreferrer',text:(c.applyUrl?'応募フォームを開く':'応募ページを開く')+' ↗'}):el('span',{class:'disabled-link',text:'リンク確認中'}),el('div',{class:'rapid-actions'},[actionButton('✓ 応募した → 次へ',()=>markRapid('applied'),'primary'),actionButton('条件待ち',()=>markRapid('waiting')),actionButton('見送り',()=>markRapid('skipped')),actionButton('あとで →',()=>{rapid.i++;showRapid()})]))}
const rapidStart=actionButton('▶ 連続応募',startRapid,'rapid-start');rapidStart.id='rapidStart';document.querySelector('.quick').prepend(rapidStart);
`;

const CSS = `
/*kensho-enhance-v2*/
:root{--blue:#4d6573;--blue-dark:#3c505c;--ink:#2e3337;--line:#e3e1dc;--muted:#6d7276;--paper:#f6f5f2;--card:#fdfcfa;--soft:#eeece7;--accent:#5f7a63;--accent-dark:#4c6450;color:var(--ink);background:var(--paper)}
header{background:var(--card);border-bottom-color:var(--line)}
.brand-icon{background:var(--blue);border-radius:10px}
.eyebrow{color:var(--muted);letter-spacing:.12em}
.heading h2{letter-spacing:-.02em;font-weight:700}
button{background:var(--card);border-color:var(--line)}
button:hover{border-color:var(--blue);color:var(--blue)}
button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline-color:#9aa9b2}
input:not([type=checkbox]),select{border-color:#d3d0c9;background:var(--card)}
input[type=checkbox]{accent-color:var(--blue)}
aside,.stat,.card,.empty{background:var(--card);border-color:var(--line)}
.stats{grid-template-columns:repeat(3,1fr)}
.stat:first-child{background:var(--soft);color:var(--ink);border-color:var(--line)}
.stat:first-child span{color:var(--muted)}
.stat:first-child,.stat{grid-row:auto!important}
.badge{background:var(--soft);color:#4a5359;font-weight:700}
.badge.SS,.badge.S{background:#efe6d6;color:#6e5431}
.numbers{border-color:var(--soft)}
.urgent{color:#9a5b45}
.tag{background:var(--soft);color:#5b6166}
.quick button{background:var(--card)}
.quick button[aria-pressed=true]{background:var(--blue);color:#fff;border-color:var(--blue)}
.actions a,.disabled-link{background:var(--blue)}
.actions a:hover{background:var(--blue-dark)}
.disabled-link{background:var(--soft);color:var(--muted)}
.text-button{color:var(--blue)}
#notice{background:#f3eee2;border-color:#e0d6c0}
.link-check{display:none}
#filters [hidden]{display:none!important}
.tag.app-only{background:#efe6d6;color:#6e5431}
.app-note{margin:8px 0 0;font-size:.85rem;color:#6e5431}
dialog{border-color:var(--line);background:var(--card);color:var(--ink)}
dialog::backdrop{background:#2e333766}
dialog button{background:var(--blue)}
fieldset{border-top-color:var(--line)}
.quick-done{margin-top:10px;width:100%;background:#eef2ec;border-color:#c9d5c6;color:var(--accent-dark);font-size:.875rem}
.quick-done:hover{background:#e2eadf;color:var(--accent-dark);border-color:var(--accent)}
.quick .rapid-start{background:var(--accent);color:#fff;border-color:var(--accent);font-weight:700}
.quick .rapid-start:hover{background:var(--accent-dark);color:#fff}
.sites-button{margin-top:14px}
dialog.rapid{width:min(520px,94vw);position:relative}
dialog.rapid .rapid-close{position:absolute;top:8px;right:8px;width:auto;background:transparent;color:var(--muted);border:0;font-size:1.4rem;padding:4px 10px}
.rapid-progress{margin:0 0 6px;color:var(--muted);font-size:.875rem}
.rapid-body .meta{margin:0;color:var(--muted);font-size:.875rem}
.rapid-body h3{font-size:1.15rem;line-height:1.6;margin:10px 0 6px;overflow-wrap:anywhere}
.rapid-body .prize{margin:0 0 6px}
.rapid-open{display:block;text-align:center;background:var(--blue);color:#fff;text-decoration:none;border-radius:10px;padding:16px;font-weight:700;margin:14px 0}
.rapid-open:hover{background:var(--blue-dark)}
.rapid-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
dialog .rapid-actions button{width:100%;background:var(--card);color:var(--ink);border-color:var(--line);padding:10px 6px;font-size:.875rem}
dialog .rapid-actions button.primary{grid-column:1/-1;background:var(--accent);color:#fff;border-color:var(--accent);padding:14px;font-size:1rem}
dialog.sites .check{margin-top:12px}
dialog.sites button{margin-top:18px}
@media(max-width:850px){.quick .rapid-start{position:fixed;left:16px;right:16px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:5;padding:14px;font-size:1rem;border-radius:12px;box-shadow:0 6px 18px #2e333740}footer{padding-bottom:90px}#filters{grid-template-columns:1fr 1fr}}
@media(max-width:540px){.stats{grid-template-columns:repeat(3,1fr)}.stat:first-child{display:block}}
`;

const replacements = [
  ["const campaigns=selectCampaigns(catalog.campaigns,f,state);", "const campaigns=extraFilter(selectCampaigns(catalog.campaigns,f,state),f);"],
  ["el('div',{class:'actions'},[entry,el('label',{text:'応募状態'},[status])])", "el('div',{class:'actions'},[entry,el('label',{text:'応募状態'},[status])]),quickDone(c,s,href)"],
  ["['今日締切',active.filter(c=>daysLeft(c)===0).length],", ""],
  ["['高優先度 SS・S・A',active.filter(c=>['SS','S','A'].includes(c.priority)).length],", ""],
  ["[['requiresPurchase','購入必要'],['requiresReview','レビュー'],['requiresApp','アプリ'],['requiresLogin','会員登録'],['isMonitor','モニター']]", "[['requiresPurchase','購入必要'],['isMonitor','モニター']]"],
  ["if(c.requiresPurchase===false)tags.push(el('span',{class:'tag',text:'購入不要'}));", "if(isAppOnly(c))tags.push(el('span',{class:'tag app-only',text:'アプリ限定'}));"],
  ["el('p',{class:'prize',text:`${c.source} · ${c.prize}`})", "el('p',{class:'prize',text:(SOURCE_LABELS[c.source]||c.source)+(c.prize&&c.prize!==c.name?' · '+c.prize:'')})"],
  ["el('p',{class:'condition',text:c.condition})", "el('p',{class:'condition',text:simpleCondition(c)})"],
  ["if('serviceWorker'in navigator)", BLOCK + "if('serviceWorker'in navigator)"],
];

export function patchApp(src) {
  if (src.includes(MARKER)) return src;
  let out = src;
  for (const [from, to] of replacements) {
    if (!out.includes(from)) throw new Error('enhance: anchor not found: ' + from.slice(0, 50));
    out = out.replace(from, () => to);
  }
  return out;
}
export function patchCss(src) {
  return src.includes(MARKER) ? src : src + CSS;
}
export function patchColors(src) {
  return src.replaceAll('#173fce', '#4d6573').replaceAll('#f3f5fa', '#f6f5f2');
}

async function main() {
  const file = p => new URL('public/' + p, root);
  await fs.writeFile(file('app.mjs'), patchApp(await fs.readFile(file('app.mjs'), 'utf8')));
  await fs.writeFile(file('styles.css'), patchCss(await fs.readFile(file('styles.css'), 'utf8')));
  for (const p of ['index.html', 'manifest.webmanifest']) {
    await fs.writeFile(file(p), patchColors(await fs.readFile(file(p), 'utf8')));
  }
  console.log('Enhancements applied: rapid apply mode, one-tap applied, simple filters, calm colors');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
