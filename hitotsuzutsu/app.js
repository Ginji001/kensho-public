(function(){
"use strict";

var DB_NAME="hitotsuzutsu";
var DB_STORE="app";
var DB_KEY="state";
var LS_KEY="hitotsuzutsu-state";
var SCHEMA_VERSION=1;

var LIST_LABELS={
  inbox:"インボックス",
  next:"次の行動",
  scheduled:"日時指定",
  waiting:"連絡待ち",
  project:"プロジェクト",
  someday:"いつか",
  notes:"メモ"
};
var NAV=[
  ["today","今日のタスク","⌂"],
  ["inbox","インボックス","□"],
  ["next","次の行動","→"],
  ["calendar","カレンダー","◫"],
  ["scheduled","日時指定","◷"],
  ["waiting","連絡待ち","…"],
  ["projects","プロジェクト","◇"],
  ["someday","いつか","☆"],
  ["notes","メモ","✎"],
  ["done","完了","✓"],
  ["trash","ごみ箱","⌫"],
  ["guide","使い方と動画の要約","?"],
  ["backup","保存・バックアップ","⇩"]
];

var state={schemaVersion:SCHEMA_VERSION,tasks:[],projects:[],settings:{}};
var currentView="today";
var drawerOpen=false;
var editorTaskId=null;
var editorNewList=null;
var installPrompt=null;
var toastTimer=null;

function q(s){return document.querySelector(s)}
function esc(v){
  return String(v==null?"":v)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function id(){
  if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();
  return Math.random().toString(36).slice(2)+Date.now().toString(36);
}
function now(){return new Date().toISOString()}
function dateKey(d){
  d=d||new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function jpDate(k){
  if(!k)return "";
  var d=new Date(k+"T00:00:00");
  if(isNaN(d.getTime()))return k;
  return d.toLocaleDateString("ja-JP",{year:"numeric",month:"long",day:"numeric",weekday:"long"});
}
function jpDateShort(k){
  if(!k)return "";
  var d=new Date(k+"T00:00:00");
  if(isNaN(d.getTime()))return k;
  return d.toLocaleDateString("ja-JP",{month:"numeric",day:"numeric",weekday:"short"});
}
function jpDateTime(v){
  if(!v)return "";
  var d=new Date(v);
  if(isNaN(d.getTime()))return v;
  return d.toLocaleString("ja-JP",{month:"numeric",day:"numeric",weekday:"short",hour:"2-digit",minute:"2-digit"});
}
function openDb(){
  return new Promise(function(resolve,reject){
    if(!("indexedDB" in window)){reject(new Error("IndexedDB unavailable"));return}
    var req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=function(){
      var db=req.result;
      if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE);
    };
    req.onsuccess=function(){resolve(req.result)};
    req.onerror=function(){reject(req.error)};
  });
}
function idbGet(){
  return openDb().then(function(db){
    return new Promise(function(resolve,reject){
      var tx=db.transaction(DB_STORE,"readonly");
      var req=tx.objectStore(DB_STORE).get(DB_KEY);
      req.onsuccess=function(){resolve(req.result)};
      req.onerror=function(){reject(req.error)};
    });
  });
}
function idbPut(value){
  return openDb().then(function(db){
    return new Promise(function(resolve,reject){
      var tx=db.transaction(DB_STORE,"readwrite");
      tx.objectStore(DB_STORE).put(value,DB_KEY);
      tx.oncomplete=function(){resolve()};
      tx.onerror=function(){reject(tx.error)};
    });
  });
}
function cleanState(raw){
  if(!raw||typeof raw!=="object")return {schemaVersion:1,tasks:[],projects:[],settings:{}};
  var tasks=Array.isArray(raw.tasks)?raw.tasks.map(function(t){
    if(!t||typeof t!=="object")return null;
    var list=LIST_LABELS[t.list]?t.list:"inbox";
    return {
      id:String(t.id||id()),
      title:String(t.title||"(無題)"),
      notes:String(t.notes||""),
      list:list,
      projectId:t.projectId?String(t.projectId):null,
      dueDate:t.dueDate?String(t.dueDate):null,
      scheduledDateTime:t.scheduledDateTime?String(t.scheduledDateTime):null,
      waitingFor:t.waitingFor?String(t.waitingFor):null,
      priority:["high","normal","low"].indexOf(t.priority)>=0?t.priority:"normal",
      today:t.today===true,
      createdAt:String(t.createdAt||now()),
      updatedAt:String(t.updatedAt||now()),
      completedAt:t.completedAt?String(t.completedAt):null,
      deletedAt:t.deletedAt?String(t.deletedAt):null
    };
  }).filter(Boolean):[];
  var projects=Array.isArray(raw.projects)?raw.projects.map(function(p){
    if(!p||typeof p!=="object"||!String(p.name||"").trim())return null;
    return {id:String(p.id||id()),name:String(p.name).trim(),createdAt:String(p.createdAt||now()),updatedAt:String(p.updatedAt||now())};
  }).filter(Boolean):[];
  var pids={};projects.forEach(function(p){pids[p.id]=true});
  tasks.forEach(function(t){if(t.projectId&&!pids[t.projectId])t.projectId=null});
  return {schemaVersion:1,tasks:tasks,projects:projects,settings:raw.settings&&typeof raw.settings==="object"?raw.settings:{}};
}
async function loadState(){
  var loaded=null;
  try{loaded=await idbGet()}catch(e){}
  if(!loaded){
    try{
      var raw=localStorage.getItem(LS_KEY);
      if(raw)loaded=JSON.parse(raw);
    }catch(e){}
  }
  state=cleanState(loaded);
  await persist();
}
async function persist(){
  var snap=JSON.parse(JSON.stringify(state));
  try{await idbPut(snap)}catch(e){}
  try{localStorage.setItem(LS_KEY,JSON.stringify(snap))}catch(e){}
}
function saveAndRender(){
  persist();
  render();
}
function activeTasks(){
  return state.tasks.filter(function(t){return !t.deletedAt&&!t.completedAt});
}
function tasksForList(list){
  return state.tasks.filter(function(t){return !t.deletedAt&&!t.completedAt&&t.list===list});
}
function projectName(pid){
  var p=state.projects.find(function(x){return x.id===pid});
  return p?p.name:"";
}
function taskDate(t){
  if(t.scheduledDateTime)return t.scheduledDateTime.slice(0,10);
  return t.dueDate||"";
}
function sortTasks(arr){
  return arr.slice().sort(function(a,b){
    var pa=a.priority==="high"?0:a.priority==="normal"?1:2;
    var pb=b.priority==="high"?0:b.priority==="normal"?1:2;
    if(pa!==pb)return pa-pb;
    var da=taskDate(a)||"9999-12-31",db=taskDate(b)||"9999-12-31";
    if(da!==db)return da.localeCompare(db);
    return a.createdAt.localeCompare(b.createdAt);
  });
}
function metaHtml(t){
  var out=[];
  var td=dateKey();
  if(t.dueDate)out.push('<span class="badge '+(t.dueDate<td?'overdue':'')+'">期限 '+esc(jpDateShort(t.dueDate))+'</span>');
  if(t.scheduledDateTime)out.push('<span class="badge '+(t.scheduledDateTime.slice(0,10)<td?'overdue':'')+'">予定 '+esc(jpDateTime(t.scheduledDateTime))+'</span>');
  if(t.today)out.push('<span class="badge today">今日やる</span>');
  if(t.waitingFor)out.push('<span class="badge">待ち: '+esc(t.waitingFor)+'</span>');
  if(t.projectId)out.push('<span class="badge">◇ '+esc(projectName(t.projectId))+'</span>');
  if(t.priority==="high")out.push('<span class="badge overdue">優先</span>');
  return out.join("");
}
function taskHtml(t,opt){
  opt=opt||{};
  var done=!!t.completedAt;
  var quick="";
  if(opt.inbox&&!done&&!t.deletedAt){
    ["next","scheduled","waiting","project","someday","notes"].forEach(function(k){
      quick+='<button onclick="moveTask(\''+t.id+'\',\''+k+'\')">'+esc(LIST_LABELS[k])+'へ</button>';
    });
    quick+='<button onclick="trashTask(\''+t.id+'\')">ごみ箱へ</button>';
  }
  var right="";
  if(t.deletedAt){
    right='<details><summary class="more" aria-label="操作">⋯</summary><div class="quick"><button onclick="restoreTask(\''+t.id+'\')">復元</button><button onclick="hardDeleteTask(\''+t.id+'\')">完全削除</button></div></details>';
  }else{
    right='<details><summary class="more" aria-label="操作">⋯</summary><div class="quick"><button onclick="editTask(\''+t.id+'\')">編集</button><button onclick="toggleToday(\''+t.id+'\')">'+(t.today?'今日から外す':'今日やる')+'</button><button onclick="trashTask(\''+t.id+'\')">ごみ箱へ</button></div></details>';
  }
  return '<li class="task">'
    +'<button class="check '+(done?'done':'')+'" aria-label="'+(done?'未完了に戻す':'完了にする')+'" onclick="toggleComplete(\''+t.id+'\')" '+(t.deletedAt?'disabled':'')+'>'+(done?'✓':'')+'</button>'
    +'<div class="taskmain" onclick="'+(t.deletedAt?'':'editTask(\''+t.id+'\')')+'"><div class="tasktitle">'+esc(t.title)+'</div><div class="taskmeta">'+metaHtml(t)+'</div>'+(t.notes?'<div class="tasknote">'+esc(t.notes)+'</div>':'')+'</div>'
    +right+(quick?'<div></div><div class="quick" style="grid-column:2/4;margin-left:0">'+quick+'</div>':'')+'</li>';
}
function listHtml(tasks,opt){
  if(!tasks.length)return '<div class="empty">'+esc((opt&&opt.empty)||"項目はありません。")+'</div>';
  return '<ul class="tasklist">'+sortTasks(tasks).map(function(t){return taskHtml(t,opt)}).join("")+'</ul>';
}
function pageHead(title,desc){
  return '<div class="pagehead"><h1>'+esc(title)+'</h1>'+(desc?'<p>'+esc(desc)+'</p>':'')+'</div>';
}
function addForm(list,placeholder){
  return '<form class="capture" onsubmit="event.preventDefault();quickAdd(\''+list+'\',this.querySelector(\'input\'))"><input aria-label="'+esc(LIST_LABELS[list]||"タスク")+'を追加" placeholder="'+esc(placeholder||"追加する内容")+'"><button type="submit">＋追加</button></form>';
}
function todayPage(){
  var today=dateKey();
  var active=activeTasks();
  var overdue=[],dueToday=[],chosen=[];
  active.forEach(function(t){
    var d=taskDate(t);
    if(d&&d<today)overdue.push(t);
    else if(d===today)dueToday.push(t);
    else if(t.today)chosen.push(t);
  });
  var total=overdue.length+dueToday.length+chosen.length;
  var html=pageHead("今日のタスク",jpDate(today));
  html+='<div class="card"><b>いま、頭に浮かんだことは？</b><form class="capture" onsubmit="event.preventDefault();captureInbox(this.querySelector(\'input\'))"><input placeholder="書いて、手放す" aria-label="頭に浮かんだこと"><button>＋追加</button></form><div class="small muted" style="margin-top:8px">まずはインボックスへ。整理は、あとから。</div></div>';
  if(!total)html+='<div class="empty section">頭の中に、余白を。<br>気になることを上の欄に書いて、最初のひとつを集めてみましょう。</div>';
  if(overdue.length)html+='<section class="section"><h2 class="sectiontitle">期限切れ <span class="count">'+overdue.length+'件</span></h2>'+listHtml(overdue)+'</section>';
  if(dueToday.length)html+='<section class="section"><h2 class="sectiontitle">今日までの予定 <span class="count">'+dueToday.length+'件</span></h2>'+listHtml(dueToday)+'</section>';
  if(chosen.length)html+='<section class="section"><h2 class="sectiontitle">すぐ取り組める行動 <span class="count">'+chosen.length+'件</span></h2>'+listHtml(chosen)+'</section>';
  html+='<div class="footerhint">この端末に自動保存 · 自分のペースで、ひとつずつ。</div>';
  return html;
}
function inboxPage(){
  var tasks=tasksForList("inbox");
  return pageHead("インボックス","まずはここへ。あとから1件ずつ、行き先を決めましょう。")
    +addForm("inbox","気になることを書く")
    +'<section class="section">'+listHtml(tasks,{inbox:true,empty:"インボックスは空です。頭に浮かんだことを、遠慮なく書き出してください。"})+'</section>';
}
function simpleListPage(list,title,desc,placeholder,empty){
  return pageHead(title,desc)+addForm(list,placeholder)+'<section class="section">'+listHtml(tasksForList(list),{empty:empty})+'</section>';
}
function calendarPage(){
  var tasks=activeTasks().filter(function(t){return t.dueDate||t.scheduledDateTime}).sort(function(a,b){return taskDate(a).localeCompare(taskDate(b))});
  var groups={};
  tasks.forEach(function(t){var d=taskDate(t);(groups[d]||(groups[d]=[])).push(t)});
  var dates=Object.keys(groups).sort();
  var html=pageHead("カレンダー","期限や日時が決まっている項目を、日付順に確認します。");
  if(!dates.length)return html+'<div class="empty">日付が付いた項目はまだありません。</div>';
  html+='<div class="calendarlist">';
  dates.forEach(function(d){html+='<section class="dategroup"><h3>'+esc(jpDate(d))+'</h3>'+listHtml(groups[d])+'</section>'});
  return html+'</div>';
}
function projectsPage(){
  var html=pageHead("プロジェクト","複数の行動が必要なまとまりを管理します。");
  html+='<div class="card"><form class="capture" onsubmit="event.preventDefault();createProject(this.querySelector(\'input\'))"><input placeholder="新しいプロジェクト名" aria-label="プロジェクト名"><button>＋追加</button></form></div>';
  if(!state.projects.length)return html+'<div class="empty section">プロジェクトはまだありません。</div>';
  state.projects.forEach(function(p){
    var tasks=state.tasks.filter(function(t){return !t.deletedAt&&!t.completedAt&&t.projectId===p.id});
    html+='<section class="section card"><div class="project"><div><div class="projectname">'+esc(p.name)+'</div><div class="small muted">'+tasks.length+'件の未完了タスク</div></div><div><button class="soft" onclick="renameProject(\''+p.id+'\')">名称編集</button> <button class="warn" onclick="deleteProject(\''+p.id+'\')">削除</button></div></div>';
    html+='<div style="margin-top:12px">'+listHtml(tasks,{empty:"このプロジェクトのタスクはありません。"})+'</div>';
    html+='<button class="soft" style="margin-top:10px" onclick="newTaskForProject(\''+p.id+'\')">＋ このプロジェクトにタスク追加</button></section>';
  });
  return html;
}
function donePage(){
  var tasks=state.tasks.filter(function(t){return !t.deletedAt&&!!t.completedAt}).sort(function(a,b){return String(b.completedAt).localeCompare(String(a.completedAt))});
  return pageHead("完了","終えたことを振り返れます。チェックを押すと未完了に戻せます。")+'<section>'+listHtml(tasks,{empty:"完了した項目はまだありません。"})+'</section>';
}
function trashPage(){
  var tasks=state.tasks.filter(function(t){return !!t.deletedAt}).sort(function(a,b){return String(b.deletedAt).localeCompare(String(a.deletedAt))});
  return pageHead("ごみ箱","削除した項目はここに残ります。復元または完全削除ができます。")+'<section>'+listHtml(tasks,{empty:"ごみ箱は空です。"})+'</section>';
}
function guidePage(){
  var ios=/iPhone|iPad|iPod/i.test(navigator.userAgent);
  var installed=window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches;
  var installText=installed?"この端末にはアプリとして追加済みです。":(ios?"iPhone/iPad: ブラウザの共有メニューから「ホーム画面に追加」を選びます。":"PC/Android: ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」を選びます。");
  var btn=installPrompt&&!installed?'<button class="primary" onclick="installApp()">この端末にインストール</button>':'';
  return pageHead("使い方と動画の要約","動画を見なくても、この5ステップだけで使えます。")
    +'<div class="card"><ol style="line-height:2;margin:0;padding-left:22px"><li>頭の中にあることを全部、インボックスへ。</li><li>1件ずつ「これは何か？」を決める。</li><li>行動できるものは、次の行動／日時指定／連絡待ち／プロジェクトへ。</li><li>今やらないものは、いつか／メモへ。</li><li>普段は「今日のタスク」だけ見て、ひとつずつ実行。</li></ol></div>'
    +'<div class="installbox"><b>アプリとして使う</b><br>'+esc(installText)+'<br><span class="muted">現在: '+(navigator.onLine?"オンライン":"オフライン")+'</span><div style="margin-top:10px">'+btn+'</div></div>';
}
function backupPage(){
  return pageHead("保存・バックアップ","通常はこの端末へ自動保存。必要なときだけ書き出し／復元できます。")
    +'<div class="card"><b>✓ この端末に自動保存されています</b><p class="muted small">IndexedDBを優先し、利用できない環境ではlocalStorageへ保存します。</p><div class="grid2"><button class="soft" onclick="exportBackup()">バックアップを書き出す</button><button class="soft" onclick="document.getElementById(\'restoreFile\').click()">バックアップから復元</button></div><input id="restoreFile" class="hidden" type="file" accept="application/json,.json" onchange="restoreBackup(this.files&&this.files[0]);this.value=\'\'"></div>'
    +'<div class="dangerzone"><h2 style="font-size:16px">危険な操作</h2><p class="muted small">全タスク・プロジェクト・設定をこの端末から削除します。元に戻せません。</p><button class="warn" onclick="deleteAllData()">全データを削除</button></div>';
}
function renderPage(){
  if(currentView==="today")return todayPage();
  if(currentView==="inbox")return inboxPage();
  if(currentView==="next")return simpleListPage("next","次の行動","今すぐ着手できる、具体的な行動だけを置いておきます。","例: 郵便局で切手を買う","まだ行動がありません。");
  if(currentView==="calendar")return calendarPage();
  if(currentView==="scheduled")return simpleListPage("scheduled","日時指定","日時が決まっているものはここへ。編集画面で日付や時間を設定できます。","例: 15時に歯科へ電話","日時指定の項目はありません。");
  if(currentView==="waiting")return simpleListPage("waiting","連絡待ち","人に頼んだこと、返事を待っていることを置いておきます。","例: 見積もりの返信を待つ","待っていることはありません。");
  if(currentView==="projects")return projectsPage();
  if(currentView==="someday")return simpleListPage("someday","いつか","今はやらないと決めたもの。手放しても、消えません。","例: 写真の整理をする","「いつか」はまだ空です。");
  if(currentView==="notes")return simpleListPage("notes","メモ","行動ではないけれど、残しておきたいこと。","例: おすすめされた本の名前","メモはまだありません。");
  if(currentView==="done")return donePage();
  if(currentView==="trash")return trashPage();
  if(currentView==="guide")return guidePage();
  if(currentView==="backup")return backupPage();
  return todayPage();
}
function drawerHtml(){
  if(!drawerOpen)return "";
  return '<div class="drawerback" onclick="if(event.target===this)toggleDrawer()"><aside class="drawer"><div class="drawerhead"><div><b>ハチワレたすくん</b><div class="small muted">COLLECT. CLEAR. DO.</div></div><button class="iconbtn" onclick="toggleDrawer()" aria-label="メニューを閉じる">×</button></div><nav>'
    +NAV.map(function(n){return '<button class="'+(currentView===n[0]?'active':'')+'" onclick="go(\''+n[0]+'\')">'+n[2]+'　'+esc(n[1])+'</button>'}).join("")
    +'</nav></aside></div>';
}
function bottomNavHtml(){
  var items=[["today","今日","⌂"],["inbox","受信","□"],["next","次","→"],["menu","メニュー","☰"]];
  return '<div class="bottomnav"><div class="inner">'+items.map(function(n){
    if(n[0]==="menu")return '<button class="navbtn" onclick="toggleDrawer()"><b>'+n[2]+'</b>'+n[1]+'</button>';
    return '<button class="navbtn '+(currentView===n[0]?'active':'')+'" onclick="go(\''+n[0]+'\')"><b>'+n[2]+'</b>'+n[1]+'</button>';
  }).join("")+'</div></div>';
}
function editorHtml(){
  if(!editorTaskId&&!editorNewList)return "";
  var t=editorTaskId?state.tasks.find(function(x){return x.id===editorTaskId}):null;
  var isNew=!t;
  if(!t)t={id:"",title:"",notes:"",list:editorNewList||"inbox",projectId:null,dueDate:null,scheduledDateTime:null,waitingFor:null,priority:"normal",today:false};
  var projectOpts='<option value="">なし</option>'+state.projects.map(function(p){return '<option value="'+esc(p.id)+'" '+(t.projectId===p.id?'selected':'')+'>'+esc(p.name)+'</option>'}).join("");
  var listOpts=Object.keys(LIST_LABELS).map(function(k){return '<option value="'+k+'" '+(t.list===k?'selected':'')+'>'+esc(LIST_LABELS[k])+'</option>'}).join("");
  return '<div class="modalback" onclick="if(event.target===this)closeEditor()"><div class="modal"><div class="modalhead"><h2>'+(isNew?'タスクを追加':'タスクを編集')+'</h2><button class="iconbtn" onclick="closeEditor()">×</button></div><form id="taskForm" class="formgrid" onsubmit="event.preventDefault();saveTaskForm()">'
    +'<div class="field"><label>タイトル</label><input name="title" required value="'+esc(t.title)+'"></div>'
    +'<div class="field"><label>メモ</label><textarea name="notes">'+esc(t.notes)+'</textarea></div>'
    +'<div class="grid2"><div class="field"><label>リスト</label><select name="list">'+listOpts+'</select></div><div class="field"><label>プロジェクト</label><select name="projectId">'+projectOpts+'</select></div></div>'
    +'<div class="grid2"><div class="field"><label>期限</label><input name="dueDate" type="date" value="'+esc(t.dueDate||"")+'"></div><div class="field"><label>日時指定</label><input name="scheduledDateTime" type="datetime-local" value="'+esc((t.scheduledDateTime||"").slice(0,16))+'"></div></div>'
    +'<div class="grid2"><div class="field"><label>連絡待ちの相手</label><input name="waitingFor" value="'+esc(t.waitingFor||"")+'"></div><div class="field"><label>優先度</label><select name="priority"><option value="high" '+(t.priority==="high"?'selected':'')+'>高</option><option value="normal" '+(t.priority==="normal"?'selected':'')+'>ふつう</option><option value="low" '+(t.priority==="low"?'selected':'')+'>低</option></select></div></div>'
    +'<label style="display:flex;gap:9px;align-items:center;min-height:44px"><input name="today" type="checkbox" '+(t.today?'checked':'')+'> 今日やる</label>'
    +'<div class="actions"><button type="button" class="soft" onclick="closeEditor()">キャンセル</button><button class="primary" type="submit">保存</button></div></form></div></div>';
}
function render(){
  var root=q("#app");
  root.innerHTML='<div class="shell"><header class="topbar"><div class="brandrow"><div class="brand"><div class="brandmark">✓</div><div>ハチワレたすくん<small>COLLECT. CLEAR. DO.</small></div></div><button class="iconbtn" onclick="toggleDrawer()" aria-label="メニュー">☰</button></div></header><main>'+renderPage()+'</main></div>'+bottomNavHtml()+drawerHtml()+editorHtml();
}
function notify(msg){
  var old=q(".toast");if(old)old.remove();
  var d=document.createElement("div");d.className="toast";d.textContent=msg;document.body.appendChild(d);
  clearTimeout(toastTimer);toastTimer=setTimeout(function(){d.remove()},2400);
}

window.go=function(v){currentView=v;drawerOpen=false;editorTaskId=null;editorNewList=null;window.scrollTo(0,0);render()};
window.toggleDrawer=function(){drawerOpen=!drawerOpen;render()};
window.captureInbox=function(input){var title=input.value.trim();if(!title)return;addTask({title:title,list:"inbox"});input.value=""};
window.quickAdd=function(list,input){var title=input.value.trim();if(!title)return;addTask({title:title,list:list});input.value=""};
function addTask(data){
  var ts=now();
  state.tasks.push({id:id(),title:data.title,notes:data.notes||"",list:data.list||"inbox",projectId:data.projectId||null,dueDate:data.dueDate||null,scheduledDateTime:data.scheduledDateTime||null,waitingFor:data.waitingFor||null,priority:data.priority||"normal",today:!!data.today,createdAt:ts,updatedAt:ts,completedAt:null,deletedAt:null});
  saveAndRender();
}
window.editTask=function(taskId){editorTaskId=taskId;editorNewList=null;render()};
window.newTaskForProject=function(pid){editorTaskId=null;editorNewList="project";render();setTimeout(function(){var f=q("#taskForm");if(f)f.elements.projectId.value=pid},0)};
window.closeEditor=function(){editorTaskId=null;editorNewList=null;render()};
window.saveTaskForm=function(){
  var f=q("#taskForm");if(!f)return;
  var data=new FormData(f);
  var title=String(data.get("title")||"").trim();if(!title)return;
  var payload={title:title,notes:String(data.get("notes")||""),list:String(data.get("list")||"inbox"),projectId:String(data.get("projectId")||"")||null,dueDate:String(data.get("dueDate")||"")||null,scheduledDateTime:String(data.get("scheduledDateTime")||"")||null,waitingFor:String(data.get("waitingFor")||"")||null,priority:String(data.get("priority")||"normal"),today:data.get("today")==="on"};
  if(editorTaskId){
    var t=state.tasks.find(function(x){return x.id===editorTaskId});
    if(t){Object.assign(t,payload);t.updatedAt=now()}
  }else addTask(payload);
  editorTaskId=null;editorNewList=null;saveAndRender();notify("保存しました");
};
window.toggleComplete=function(taskId){
  var t=state.tasks.find(function(x){return x.id===taskId});if(!t)return;
  t.completedAt=t.completedAt?null:now();t.updatedAt=now();saveAndRender();
};
window.toggleToday=function(taskId){var t=state.tasks.find(function(x){return x.id===taskId});if(!t)return;t.today=!t.today;t.updatedAt=now();saveAndRender()};
window.moveTask=function(taskId,list){var t=state.tasks.find(function(x){return x.id===taskId});if(!t)return;t.list=list;t.updatedAt=now();saveAndRender();notify(LIST_LABELS[list]+"へ移動しました")};
window.trashTask=function(taskId){var t=state.tasks.find(function(x){return x.id===taskId});if(!t)return;t.deletedAt=now();t.updatedAt=now();saveAndRender();notify("ごみ箱へ移動しました")};
window.restoreTask=function(taskId){var t=state.tasks.find(function(x){return x.id===taskId});if(!t)return;t.deletedAt=null;t.updatedAt=now();saveAndRender();notify("復元しました")};
window.hardDeleteTask=function(taskId){if(!confirm("この項目を完全に削除しますか？"))return;state.tasks=state.tasks.filter(function(t){return t.id!==taskId});saveAndRender();notify("完全に削除しました")};
window.createProject=function(input){var name=input.value.trim();if(!name)return;var ts=now();state.projects.push({id:id(),name:name,createdAt:ts,updatedAt:ts});input.value="";saveAndRender()};
window.renameProject=function(pid){var p=state.projects.find(function(x){return x.id===pid});if(!p)return;var name=prompt("新しいプロジェクト名",p.name);if(name===null)return;name=name.trim();if(!name)return;p.name=name;p.updatedAt=now();saveAndRender()};
window.deleteProject=function(pid){var p=state.projects.find(function(x){return x.id===pid});if(!p)return;if(!confirm("「"+p.name+"」を削除しますか？\n紐づくタスク自体は削除されません。"))return;state.projects=state.projects.filter(function(x){return x.id!==pid});state.tasks.forEach(function(t){if(t.projectId===pid)t.projectId=null});saveAndRender()};
window.exportBackup=function(){
  var data={schemaVersion:SCHEMA_VERSION,exportedAt:now(),tasks:state.tasks,projects:state.projects,settings:state.settings};
  var blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="hitotsuzutsu-backup-"+dateKey()+".json";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},1000);notify("バックアップを書き出しました");
};
window.restoreBackup=async function(file){
  if(!file)return;
  try{
    var text=await file.text();var raw=JSON.parse(text);
    if(!raw||typeof raw!=="object"||(!Array.isArray(raw.tasks)&&!Array.isArray(raw.projects)))throw new Error("形式");
    if(!confirm("現在のデータを上書きします。よろしいですか？"))return;
    state=cleanState(raw);await persist();render();notify("バックアップを復元しました");
  }catch(e){alert("バックアップを復元できませんでした。ファイル形式を確認してください。")}
};
window.deleteAllData=async function(){
  if(!confirm("全データを削除します。続けますか？"))return;
  if(!confirm("最終確認です。タスク・プロジェクト・設定をすべて削除します。元に戻せません。"))return;
  state={schemaVersion:1,tasks:[],projects:[],settings:{}};await persist();render();notify("全データを削除しました");
};
window.installApp=async function(){
  if(!installPrompt){notify("ブラウザのメニューから「ホーム画面に追加」を選んでください");return}
  installPrompt.prompt();
  try{await installPrompt.userChoice}catch(e){}
  installPrompt=null;render();
};

window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();installPrompt=e;if(currentView==="guide")render()});
window.addEventListener("appinstalled",function(){installPrompt=null;notify("アプリをインストールしました")});
window.addEventListener("online",function(){if(currentView==="guide")render()});
window.addEventListener("offline",function(){if(currentView==="guide")render()});

async function boot(){
  await loadState();
  render();
  if("serviceWorker" in navigator){
    try{await navigator.serviceWorker.register("./sw.js",{scope:"./"})}catch(e){}
  }
}
boot();
})();