// 応募の手間を減らすUI拡張をビルド時に public/ へ適用する（何度実行しても同じ結果）
// - 連続応募モード（未応募を1件ずつ表示 → 開く → 応募した/条件待ち/見送り/あとで）
// - カードの「✓ 応募した」ワンタップ記録
// - 絞り込み追加：登録済みサイトのみ／購入が必要な案件を除く／今すぐ応募できる案件のみ
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root = new URL('../', import.meta.url);
export const MARKER = '/*kensho-enhance-v1*/';

const BLOCK = `${MARKER}
const MYSITES_KEY='kensho-public-mysites-v1';
const SOURCE_LABELS={atcosme:'@cosme',Monipla:'モニプラ',RoomClip:'RoomClip',LIPS:'LIPS',official:'公式サイト',SHARP:'SHARP',Makuake:'Makuake'};
function mySites(){try{const v=JSON.parse(storage?.getItem(MYSITES_KEY)||'[]');return Array.isArray(v)?v.filter(x=>typeof x==='string'):[]}catch{return []}}
function usableHref(c){const end=expired(c)||c.linkStatus==='ended';const ok=!end&&!offline&&c.linkStatus==='ok'&&Date.now()-Date.parse(c.linkCheckedAt)<48*3600000;return ok?safeUrl(c.applyUrl||c.url,catalog.allowedDomains):null}
function extraFilter(xs,f){const mine=mySites();return xs.filter(c=>(!f.mySites||!mine.length||mine.includes(c.source))&&(!f.noPurchaseLoose||c.requiresPurchase!==true)&&(!f.ready||!!usableHref(c)))}
function quickDone(c,s,href){if(!href||s.status!=='new')return el('span',{class:'quick-done-empty'});const b=el('button',{class:'quick-done',type:'button',text:'✓ 応募した'});b.onclick=()=>persist(c.id,{status:'applied'});return b}
function actionButton(text,fn,cls=''){const b=el('button',{type:'button',class:cls,text});b.onclick=fn;return b}
const extraFieldset=form.querySelector('fieldset');
for(const [name,label] of [['mySites','登録済みサイトのみ'],['noPurchaseLoose','購入が必要な案件を除く'],['ready','今すぐ応募できる案件のみ']])extraFieldset.append(el('label',{class:'check'},[el('input',{name,type:'checkbox'}),document.createTextNode(label)]));
const sitesDialog=el('dialog',{class:'sites','aria-label':'登録済みサイト'});document.body.append(sitesDialog);
function openSites(){const mine=mySites();const sources=[...new Set(catalog.campaigns.map(c=>c.source))].sort();const boxes=sources.map(s=>{const i=el('input',{type:'checkbox',value:s});i.checked=mine.includes(s);return el('label',{class:'check'},[i,document.createTextNode(SOURCE_LABELS[s]||s)])});sitesDialog.replaceChildren(el('h2',{text:'登録済みサイト'}),el('p',{class:'small',text:'会員登録・ログイン済みのサイトを選ぶと「登録済みサイトのみ」で絞り込めます。この端末だけに保存されます。'}),...boxes,actionButton('保存',()=>{const v=boxes.map(l=>l.querySelector('input')).filter(i=>i.checked).map(i=>i.value);try{storage.setItem(MYSITES_KEY,JSON.stringify(v))}catch{notice='設定を保存できませんでした。'}sitesDialog.close();render()}));sitesDialog.showModal()}
extraFieldset.append(actionButton('登録済みサイトを設定',openSites,'text-button sites-button'));
const rapidDialog=el('dialog',{class:'rapid','aria-label':'連続応募'});rapidDialog.append(actionButton('×',()=>rapidDialog.close(),'rapid-close'),el('div',{class:'rapid-body'}));document.body.append(rapidDialog);
let rapid={queue:[],i:0,done:0};
function startRapid(){const f=Object.fromEntries(new FormData(form));f.sort=$('#sort').value;rapid={queue:extraFilter(selectCampaigns(catalog.campaigns,f,state),f).filter(c=>(state[c.id]?.status||'new')==='new'&&usableHref(c)).map(c=>c.id),i:0,done:0};showRapid();rapidDialog.showModal()}
function markRapid(status){const id=rapid.queue[rapid.i];if(status==='applied')rapid.done++;rapid.i++;persist(id,{status});showRapid()}
function showRapid(){const body=rapidDialog.querySelector('.rapid-body');const ids=rapid.queue;while(rapid.i<ids.length&&(state[ids[rapid.i]]?.status||'new')!=='new')rapid.i++;if(rapid.i>=ids.length){body.replaceChildren(el('h2',{text:ids.length?'おつかれさまでした':'応募できる案件がありません'}),el('p',{text:ids.length?rapid.done+'件を応募済みにしました。':'絞り込みを変えるか、次の更新をお待ちください。'}),actionButton('閉じる',()=>rapidDialog.close(),'primary'));return}const c=catalog.campaigns.find(x=>x.id===ids[rapid.i]);const href=usableHref(c);body.replaceChildren(el('p',{class:'rapid-progress',text:(rapid.i+1)+' / '+ids.length+' 件'}),el('div',{class:'card-top'},[el('span',{class:'badge '+c.priority,text:c.priority}),el('span',{class:'meta',text:(SOURCE_LABELS[c.source]||c.source)+' · '+c.genre})]),el('h3',{text:c.name}),el('p',{class:'prize',text:'当選 '+(c.winnersText||'未確認')+' ・ 締切 '+(c.deadline?c.deadline.slice(5,10).replace('-','/'):'公式で確認')}),el('p',{class:'condition',text:c.condition||''}),href?el('a',{class:'rapid-open',href,target:'_blank',rel:'noopener noreferrer',text:(c.applyUrl?'応募フォームを開く':'応募ページを開く')+' ↗'}):el('span',{class:'disabled-link',text:'リンク確認中'}),el('div',{class:'rapid-actions'},[actionButton('✓ 応募した → 次へ',()=>markRapid('applied'),'primary'),actionButton('条件待ち',()=>markRapid('waiting')),actionButton('見送り',()=>markRapid('skipped')),actionButton('あとで →',()=>{rapid.i++;showRapid()})]))}
const rapidStart=actionButton('▶ 連続応募',startRapid,'rapid-start');rapidStart.id='rapidStart';document.querySelector('.quick').prepend(rapidStart);
`;

const CSS = `
/*kensho-enhance-v1*/
.quick-done{margin-top:10px;width:100%;background:#eaf6ec;border-color:#9fd3a8;color:#16642a;font-size:.875rem}
.quick-done:hover{background:#d8efdc;color:#0f4f20;border-color:#6fbf7e}
.quick .rapid-start{background:#17223c;color:#fff;border-color:#17223c;font-weight:800}
.quick .rapid-start:hover{background:#26345a;color:#fff}
.sites-button{margin-top:14px}
dialog.rapid{width:min(520px,94vw);position:relative}
dialog.rapid .rapid-close{position:absolute;top:8px;right:8px;width:auto;background:transparent;color:var(--muted);border:0;font-size:1.4rem;padding:4px 10px}
.rapid-progress{margin:0 0 10px;color:var(--muted);font-size:.875rem}
.rapid-body h3{font-size:1.15rem;line-height:1.6;margin:12px 0 6px;overflow-wrap:anywhere}
.rapid-body .prize{margin:0 0 6px}
.rapid-open{display:block;text-align:center;background:var(--blue);color:#fff;text-decoration:none;border-radius:10px;padding:16px;font-weight:800;margin:14px 0}
.rapid-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
dialog .rapid-actions button{width:100%;background:#fff;color:inherit;padding:10px 6px;font-size:.875rem}
dialog .rapid-actions button.primary{grid-column:1/-1;background:#1d7a34;color:#fff;border-color:#1d7a34;padding:14px;font-size:1rem}
dialog.sites .check{margin-top:12px}
dialog.sites button{margin-top:18px}
@media(max-width:850px){.quick .rapid-start{position:fixed;left:16px;right:16px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:5;padding:14px;font-size:1rem;border-radius:12px;box-shadow:0 6px 20px #17223c55}footer{padding-bottom:90px}}
`;

const replacements = [
  ["const campaigns=selectCampaigns(catalog.campaigns,f,state);", "const campaigns=extraFilter(selectCampaigns(catalog.campaigns,f,state),f);"],
  ["el('div',{class:'actions'},[entry,el('label',{text:'応募状態'},[status])])", "el('div',{class:'actions'},[entry,el('label',{text:'応募状態'},[status])]),quickDone(c,s,href)"],
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
  return src.includes('kensho-enhance-v1') ? src : src + CSS;
}

async function main() {
  const app = new URL('public/app.mjs', root), css = new URL('public/styles.css', root);
  await fs.writeFile(app, patchApp(await fs.readFile(app, 'utf8')));
  await fs.writeFile(css, patchCss(await fs.readFile(css, 'utf8')));
  console.log('Enhancements applied: rapid apply mode, one-tap applied, extra filters');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
