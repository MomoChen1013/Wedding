/* ============================================================
   婚禮網站 — 共用 JS
   提供：
     - DataStore（Firestore 讀寫 + 本地快取）
     - me_user（名字 + 記號）
     - 頂部導覽列（每頁共用，由本檔注入）
     - 主題切換
     - 特效（煙火 / 彩帶 / 金箔 / 飄浮記號）
     - BGM（艾爾加〈愛的禮讚 Salut d'Amour〉音樂盒版）
     - 新人專屬信箱（網址加 WED.ownerKey 才出現）
     - escapeHtml 等小工具
============================================================ */

/* ---------- 小工具 ---------- */
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
/* 名字／關鍵詞比對用的正規化。
   賓客打字很隨性：「  王小明 」「Ｗang」「wang ming」都該找得到同一個人。
   ・去掉頭尾與中間的空白
   ・全形英數轉半形（手機中文鍵盤很容易打出全形）
   ・英文一律小寫 */
function normKey(s){
  return String(s == null ? '' : s)
    .replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, '');
}

/* 找出寫給這個名字（或專屬暗號）的祝福信。
   回傳 { item, personal }：
     personal:true  → 對到某封信的專屬詞彙
     personal:false → 沒對到，退回新人設定的「通用信」
   都沒有就回 null。

   比對規則與桌次查詢一致，由寬到嚴：
     1. 詞彙完全相同
     2. 互相包含（取最長的詞彙，越長代表越精準）
   桌次頁與祝福信頁共用這一份，兩邊的判斷才不會走鐘。 */
function findBlessing(input, list){
  const q = normKey(input);
  const all = Array.isArray(list) ? list : [];
  const termsOf = (b) =>
    (Array.isArray(b.terms) ? b.terms : []).map(normKey).filter(Boolean);

  if(!q) return null;

  const personal = all.filter(b => termsOf(b).length);

  const exact = personal.find(b => termsOf(b).includes(q));
  if(exact) return { item: exact, personal: true };

  let best = null, bestLen = 0;
  personal.forEach(b => {
    termsOf(b).forEach(t => {
      if((t.includes(q) || q.includes(t)) && t.length > bestLen){
        best = b; bestLen = t.length;
      }
    });
  });
  if(best) return { item: best, personal: true };

  const def = all.find(b => b.isDefault === true);
  return def ? { item: def, personal: false } : null;
}

function $(sel, root){ return (root||document).querySelector(sel); }
function $all(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }

/* ---------- localStorage 包裝 ----------
   key 以 siteId 分隔，同一位賓客逛兩組新人的網站時，
   名字、主題、回覆紀錄不會互相污染 */
const LS = {
  _k(key){ return `wed.${(window.SITE && window.SITE.siteId) || 'default'}.${key}`; },
  get(key, def){
    try{ const v = localStorage.getItem(this._k(key)); return v===null ? def : JSON.parse(v); }
    catch{ return def; }
  },
  set(key, val){
    try{ localStorage.setItem(this._k(key), JSON.stringify(val)); }catch{}
  },
  remove(key){
    try{ localStorage.removeItem(this._k(key)); }catch{}
  }
};

/* ============================================================
   資料層（DataStore）— Firestore 版
   ・寫入 → 走 Firestore（非同步）
   ・讀取 → 同步取本地快取，由 onSnapshot 即時推回
   ・資料變動時 dispatch 'data:<key>'，畫面可監聽重渲染
============================================================ */
const DataStore = {
  _wishes:[], _letters:[], _hearts:0, _collected:[], _cakes:[], _compat:[], _rsvps:[],
  _letterCount:0,
  _subscribed:false,

  /* 這組新人的資料都掛在 sites/{siteId} 底下，各站台互不相見 */
  _col(name){
    const { db, collection } = window.fb;
    return collection(db, 'sites', window.SITE.siteId, name);
  },
  _doc(...path){
    const { db, doc } = window.fb;
    return doc(db, 'sites', window.SITE.siteId, ...path);
  },

  init(){
    if(!window.fb || !window.SITE){ console.warn('[DataStore] 站台脈絡還沒就緒'); return; }
    const { auth, onAuthStateChanged } = window.fb;
    onAuthStateChanged(auth, user => {
      if(!user || this._subscribed) return;
      this._subscribed = true;
      this._subscribe();
    });
  },

  _subscribe(){
    const { auth, onSnapshot, query, orderBy, where } = window.fb;
    const uid = auth.currentUser && auth.currentUser.uid;

    const sub = (key, qFn) => {
      onSnapshot(qFn(), snap => {
        this['_'+key] = snap.docs.map(d => ({ id:d.id, ...d.data() }));
        document.dispatchEvent(new CustomEvent('data:'+key));
      }, err => console.warn('[DataStore] onSnapshot', key, err));
    };

    /* 本站台共用（賓客都看得到） */
    sub('wishes',  () => query(this._col('wishes'),  orderBy('time', 'asc')));
    sub('cakes',   () => query(this._col('cakes'),   orderBy('time', 'asc')));
    sub('compat',  () => query(this._col('compat'),  orderBy('time', 'asc')));

    /* 抽卡收藏：per-uid，只訂閱自己的卡
       （不加 orderBy 以免要建立複合索引；排序在 getCollected() 由前端做） */
    sub('collected', () => query(this._col('collected'), where('uid', '==', uid)));

    /* 愛心是單一計數器，存在 sites/{siteId}/meta/hearts */
    onSnapshot(this._doc('meta', 'hearts'), snap => {
      this._hearts = (snap.data()?.count) || 0;
      document.dispatchEvent(new CustomEvent('data:hearts'));
    }, err => console.warn('[DataStore] onSnapshot hearts', err));

    /* 信件數量：內容讀不到，但數量是公開的，祝福牆才顯示得出「已有幾封信」 */
    onSnapshot(this._doc('meta', 'letterCount'), snap => {
      this._letterCount = (snap.data()?.count) || 0;
      document.dispatchEvent(new CustomEvent('data:letters'));
    }, err => console.warn('[DataStore] onSnapshot letterCount', err));

    /* 悄悄話信箱依規則只有站台擁有者讀得到，等登入成功再訂閱 */
    /* RSVP 依規則不開放前端讀取，這裡不訂閱；名單請用 export-rsvps.js 匯出 */
  },

  /* 新人以 Google 登入後才呼叫，開始接收信件 */
  _lettersSubscribed: false,
  subscribeLetters(){
    if(this._lettersSubscribed) return;
    const { onSnapshot, query, orderBy } = window.fb;
    this._lettersSubscribed = true;
    onSnapshot(
      query(this._col('letters'), orderBy('time', 'asc')),
      snap => {
        this._letters = snap.docs.map(d => ({ id:d.id, ...d.data() }));
        document.dispatchEvent(new CustomEvent('data:letters'));
      },
      err => {
        this._lettersSubscribed = false;
        console.warn('[DataStore] 讀取信箱失敗', err.code);
        document.dispatchEvent(new CustomEvent('data:letters:denied'));
      },
    );
  },

  /* ===== 寫入（async；可不 await） ===== */
  async addWish(w){
    const { addDoc } = window.fb;
    return addDoc(this._col('wishes'), { ...w, time: w.time || Date.now() });
  },
  async addLetter(l){
    const { addDoc } = window.fb;
    const ref = await addDoc(this._col('letters'), { ...l, time: l.time || Date.now() });
    /* 數量另外記在公開的計數器；失敗只會少算，不影響信件本身 */
    this._bumpLetterCount().catch(() => {});
    return ref;
  },
  async _bumpLetterCount(){
    const { db, runTransaction } = window.fb;
    const ref = this._doc('meta', 'letterCount');
    await runTransaction(db, async tx => {
      const cur = (await tx.get(ref)).data()?.count || 0;
      tx.set(ref, { count: cur + 1 });
    });
  },
  async addCollected(c){
    const { auth, addDoc } = window.fb;
    const uid = auth.currentUser ? auth.currentUser.uid : null;
    const userName = (typeof me_user !== 'undefined' && me_user) ? me_user.name : '';
    return addDoc(this._col('collected'), {
      ...c,
      uid,                  // ← 用 Firebase Auth UID 隔離（每位訪客各自獨立）
      userName,             // ← 順便存名字，方便日後查
      time: Date.now(),
    });
  },
  async addCake(c){
    const { addDoc } = window.fb;
    return addDoc(this._col('cakes'), { ...c, time: c.time || Date.now() });
  },
  async addCompat(answers){
    const { addDoc } = window.fb;
    return addDoc(this._col('compat'), { answers, time: Date.now() });
  },
  /* RSVP 的欄位由規則嚴格白名單控管，這裡不能再自動塞 time */
  async addRSVP(r){
    const { addDoc } = window.fb;
    return addDoc(this._col('rsvps'), r);
  },
  async addHeart(){
    const { db, runTransaction } = window.fb;
    const ref = this._doc('meta', 'hearts');
    await runTransaction(db, async tx => {
      const cur = (await tx.get(ref)).data()?.count || 0;
      tx.set(ref, { count: cur + 1 });
    });
    return this._hearts + 1;
  },

  /* ============================================================
     桌次 / 祝福信 / Explore 自訂卡片
     ------------------------------------------------------------
     這三組資料不是每頁都要用（桌次圖還是整包 data URL），
     所以不放進 _subscribe() 一律訂閱，而是各頁自己叫用。
     重複呼叫是安全的，只會訂閱一次。
  ============================================================ */
  _seating:[], _seatingImages:[], _blessings:[], _explore:[],
  _subs:{},

  _lazySub(key, colName, orderField){
    if(this._subs[key]) return;
    this._subs[key] = true;
    const { onSnapshot, query, orderBy } = window.fb;
    const q = orderField
      ? query(this._col(colName), orderBy(orderField, 'asc'))
      : this._col(colName);
    onSnapshot(q, snap => {
      this['_'+key] = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      document.dispatchEvent(new CustomEvent('data:'+key));
    }, err => {
      /* 讀不到就當作沒有資料，畫面顯示空狀態而不是壞掉 */
      this._subs[key] = false;
      console.warn('[DataStore] onSnapshot', key, err.code || err);
      document.dispatchEvent(new CustomEvent('data:'+key+':denied'));
    });
  },

  subscribeSeating(){
    this._lazySub('seating', 'seating', 'name');
    this._lazySub('seatingImages', 'seatingImages', 'order');
  },
  subscribeBlessings(){ this._lazySub('blessings', 'blessings', 'time'); },
  subscribeExplore(){   this._lazySub('explore',   'explore',   'order'); },

  getSeating()       { return this._seating; },
  getSeatingImages() { return this._seatingImages; },
  getBlessings()     { return this._blessings; },
  getExplore()       { return this._explore; },

  /* ===== 新人專用的寫入（規則只認 ownerEmails 名單內的 Google 帳號） =====
     沒有 id 就新增，有 id 就覆寫同一份文件。 */
  async saveDoc(colName, id, data){
    const { addDoc, setDoc, doc, db } = window.fb;
    if(id){
      await setDoc(doc(db, 'sites', window.SITE.siteId, colName, id), data);
      return id;
    }
    const ref = await addDoc(this._col(colName), data);
    return ref.id;
  },
  async removeDoc(colName, id){
    const { deleteDoc, doc, db } = window.fb;
    await deleteDoc(doc(db, 'sites', window.SITE.siteId, colName, id));
  },

  /* 大量匯入桌次名單：400 筆一批送出（batch 上限 500，留一點餘裕） */
  async importSeating(rows){
    const { writeBatch, doc, db } = window.fb;
    const col = this._col('seating');
    for(let i = 0; i < rows.length; i += 400){
      const batch = writeBatch(db);
      rows.slice(i, i + 400).forEach(r => {
        batch.set(doc(col), {
          name: r.name, table: r.table, note: r.note || '', time: Date.now(),
        });
      });
      await batch.commit();
    }
    return rows.length;
  },

  /* ===== 新人專用：清空某個子集合（用於重置票數） ===== */
  async wipeCollection(name){
    const { getDocs, deleteDoc } = window.fb;
    const snap = await getDocs(this._col(name));
    /* 並行刪除（小資料量 OK；超過幾百筆建議改用 writeBatch） */
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    return snap.docs.length;
  },

  /* ===== 讀取（同步回本地快取） ===== */
  getWishes()     { return this._wishes; },
  getLetters()    { return this._letters; },
  /* 新人登入後用實際筆數，賓客看公開的計數器 */
  getLetterCount(){
    return this._lettersSubscribed ? this._letters.length : this._letterCount;
  },
  getHearts()     { return this._hearts; },
  /* 抽卡收藏按時間排序（snapshot 沒帶 orderBy，所以在這裡排） */
  getCollected()  { return this._collected.slice().sort((a,b)=>(a.time||0)-(b.time||0)); },
  getCakes()      { return this._cakes; },
  /* compat 早期是「直接陣列」，現在統一包成 {answers:[...]}，取出時還原 */
  getCompat()     { return this._compat.map(c => c.answers || c); },
  /* ===== RSVP 出席回覆 =====
     規則只讓 ownerEmails 名單內的帳號讀，所以不放進 _subscribe()，
     由新人後台登入成功後才呼叫。
     欄位以 rsvp.js 實際寫入的為準：
       attending  bool   只有「會出席」是 true
       tentative  bool   true 代表「未定」
       guestCount int    出席人數
       createdAt  Timestamp（伺服器時間） */
  subscribeRsvps(){
    this._lazySub('rsvps', 'rsvps', 'createdAt');
  },

  /* 新的排前面，新人最關心的是剛進來的回覆 */
  getRSVPs(){
    return this._rsvps.slice().reverse();
  },
  getRSVPCount(){ return this._rsvps.length; },

  /* 每一筆回覆歸成三類，畫面與統計共用同一個判斷 */
  rsvpStatus(r){
    if(r.attending === true)  return 'yes';
    if(r.tentative === true)  return 'maybe';
    return 'no';
  },

  /* 「確定出席」的總人數（依每筆 guestCount 加總；沒填視為 1 位） */
  getAttendingCount(){
    return this._rsvps
      .filter(r => this.rsvpStatus(r) === 'yes')
      .reduce((sum, r) => sum + (Number(r.guestCount) || 1), 0);
  },

  /* 三類各有幾「筆」回覆（不是人數） */
  getRsvpTally(){
    const t = { yes:0, maybe:0, no:0 };
    this._rsvps.forEach(r => { t[this.rsvpStatus(r)]++; });
    return t;
  },
};

/* site-context.js 已確保 window.fb 與 window.SITE 就緒才載入本檔 */
DataStore.init();

/* ============================================================
   站內導覽：把舊有的 xxx.html 連結改寫成 /w/{slug}/xxx
   ・未啟用的頁面連結會整個移除，大廳不會出現死入口
============================================================ */
function sitePath(key){
  return window.SITE ? window.SITE.pathFor(key) : '/';
}
/* ============================================================
   文字樣板：把 HTML 裡的 {{couple}}、{{date}} 等換成這組新人的資料
   ・純文字節點與 placeholder／alt／title／content 屬性都會處理
   ・找不到對應的 key 就換成空字串，畫面不會露出 {{...}}
============================================================ */
const TPL_ATTRS = ['placeholder', 'alt', 'title', 'content', 'aria-label'];

function fillTemplates(root){
  const W = window.WED || {};
  const val = (key) => {
    if(key === 'hashtag') return (W.hashtags && W.hashtags[0]) || '';
    return W[key] != null ? String(W[key]) : '';
  };
  const swap = (text) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => val(k));

  const scope = root || document;

  /* 文字節點 */
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const hits = [];
  while(walker.nextNode()){
    if(walker.currentNode.nodeValue.includes('{{')) hits.push(walker.currentNode);
  }
  hits.forEach(n => { n.nodeValue = swap(n.nodeValue); });

  /* 屬性 */
  scope.querySelectorAll('*').forEach(el => {
    TPL_ATTRS.forEach(attr => {
      const v = el.getAttribute && el.getAttribute(attr);
      if(v && v.includes('{{')) el.setAttribute(attr, swap(v));
    });
  });
}

function rewriteNavLinks(root){
  const S = window.SITE;
  if(!S) return;
  (root || document).querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    const key = S.fileToKey[href];
    if(!key) return;
    if(S.isEnabled(key)){
      a.setAttribute('href', S.pathFor(key));
    }else{
      /* 這組新人沒開這個頁面 */
      a.remove();
    }
  });
}

/* ============================================================
   使用者（名字 + 隨機記號）
   ・極簡風格：不用 emoji，改用單色的幾何線條符號
============================================================ */
const ICONS = ['✦','✧','◇','◈','○','◎','△','▽','□','◻','✕','＋','∞','♢','⬦','❖'];
const DEFAULT_ICON = '✦';
let me_user = LS.get('user', null) || { name:'朋友', icon:DEFAULT_ICON };
function saveUser(u){ me_user = u; LS.set('user', u); }
function clearUser(){ me_user = { name:'朋友', icon:DEFAULT_ICON }; LS.remove('user'); }

/* 登出：清掉本地 user / session、Firebase 也 signOut，最後回到入場頁
   （firebase-init 會在沒有 user 時自動匿名登入新 uid，等於是一個全新的訪客） */
async function logout(){
  try{
    if(window.fb && window.fb.auth && window.fb.signOut){
      await window.fb.signOut(window.fb.auth);
    }
  }catch(e){ console.warn('[logout] signOut failed', e); }
  clearUser();
  try{ sessionStorage.clear(); }catch{}
  /* 清掉 compat 暫存（避免下個 user 看到上一位的答案） */
  LS.remove('compatLast');
  location.href = sitePath('lobby');
}

/* 子場景：沒登入就丟回大廳 */
function requireUser(){
  if(!LS.get('user', null)){
    location.href = sitePath('lobby');
    return false;
  }
  return true;
}

/* ============================================================
   主題切換（記到 localStorage）
============================================================ */
function setTheme(t){
  document.body.dataset.theme = t;
  LS.set('theme', t);
}
function initTheme(){
  const saved = LS.get('theme', 'champagne');
  document.body.dataset.theme = saved;
}
initTheme();

/* ============================================================
   全畫面特效 canvas（fireworksBurst / confettiRain / firecracker / goldFall / spawnFloat）
============================================================ */
let fx, ctx, parts = [], fxRunning = false;
function initFx(){
  fx = document.getElementById('fx');
  if(!fx) return;
  ctx = fx.getContext('2d');
  const resize = ()=>{ fx.width = innerWidth; fx.height = innerHeight; };
  resize(); addEventListener('resize', resize);
}

const PCOLORS=['#c9a86a','#e7d3a6','#f3e8d3','#d8b98a','#d98fa0','#fffdf5'];
function addParts(x,y,n,opt={}){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, sp=(opt.speed||4)*(0.4+Math.random());
    parts.push({x,y,vx:Math.cos(a)*sp*(opt.spread||1),vy:Math.sin(a)*sp - (opt.up||0),
      g:opt.g??0.08, life:60+Math.random()*30, c:PCOLORS[(Math.random()*PCOLORS.length)|0],
      size:opt.size||(3+Math.random()*4), rect:opt.rect});
  }
}
function fireworksBurst(){
  if(!fx) return;
  for(let k=0;k<3;k++){
    const x=fx.width*(0.25+Math.random()*0.5), y=fx.height*(0.2+Math.random()*0.3);
    setTimeout(()=>addParts(x,y,60,{speed:6,spread:1}),k*180);
  }
  runFx();
}
function confettiRain(){
  if(!fx) return;
  for(let i=0;i<80;i++){
    parts.push({x:Math.random()*fx.width,y:-20,vx:(Math.random()-0.5)*2,vy:2+Math.random()*3,
      g:0.05,life:120,c:PCOLORS[(Math.random()*PCOLORS.length)|0],size:5+Math.random()*5,rect:true,rot:Math.random()*6});
  }
  runFx();
}
function firecracker(){
  if(!fx) return;
  const x=fx.width/2, y=fx.height-40;
  addParts(x,y,50,{speed:8,up:6,g:0.18}); runFx();
}
const GOLDS=['#c9a06b','#e3ca9a','#d8b074','#bfa15f','#f0dca0'];
function goldFall(){
  if(!fx) return;
  for(let i=0;i<34;i++){
    parts.push({x:Math.random()*fx.width,y:-20,vx:(Math.random()-0.5)*1.2,vy:0.8+Math.random()*1.4,
      g:0.012,life:200,c:GOLDS[(Math.random()*GOLDS.length)|0],size:3+Math.random()*4,rect:true,rot:Math.random()*6});
  }
  runFx();
}
function runFx(){ if(fxRunning||!fx) return; fxRunning=true; loopFx(); }
function loopFx(){
  ctx.clearRect(0,0,fx.width,fx.height);
  parts.forEach(p=>{
    p.x+=p.vx; p.y+=p.vy; p.vy+=p.g; p.life--;
    ctx.globalAlpha=Math.max(p.life/60,0); ctx.fillStyle=p.c;
    if(p.rect){ ctx.save(); ctx.translate(p.x,p.y); ctx.rotate((p.rot=(p.rot||0)+0.1)); ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*0.6); ctx.restore(); }
    else{ ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,7); ctx.fill(); }
  });
  ctx.globalAlpha=1;
  parts=parts.filter(p=>p.life>0 && p.y<fx.height+30);
  if(parts.length){ requestAnimationFrame(loopFx); } else { ctx.clearRect(0,0,fx.width,fx.height); fxRunning=false; }
}

function spawnFloat(emoji,x,y){
  const h=document.createElement('div'); h.className='float-heart'; h.textContent=emoji;
  h.style.left=(x-13)+'px'; h.style.top=(y-13)+'px'; document.body.appendChild(h);
  setTimeout(()=>h.remove(),1400);
}

/* ============================================================
   BGM
   ・素材資料夾放了 bgm.mp3 → 播放新人自己的音樂（循環）
   ・沒放 → 退回用 Web Audio 合成「愛的禮讚」音樂盒版
     （艾爾加 Salut d'Amour, Op.12・公共領域曲目，不需音檔）
============================================================ */
let audioCtx=null, bgmOn=false, bgmTimer=null, bgmAudio=null;

/* 這組新人有沒有自己的背景音樂 */
function bgmSrc(){
  return (window.SITE && window.SITE.assets && window.SITE.assets.bgm) || '';
}
const _NOTE={
  E4:329.63, 'F#4':369.99, 'G#4':415.30, A4:440.00, B4:493.88,
  'C#5':554.37, 'D#5':622.25, E5:659.25, 'F#5':739.99, 'G#5':830.61, A5:880.00, B5:987.77,
};
const _MELODY=[
  ['B4',.5],
  ['E5',1.5],['D#5',.5],['E5',1],  ['F#5',.5],['E5',.5],
  ['D#5',1.5],['B4',.5],['C#5',1], ['B4',1],
  ['A4',1.5],['B4',.5],['C#5',1],  ['B4',.5],['A4',.5],
  ['G#4',1.5],['E4',.5],['F#4',1], ['G#4',1],
  ['A4',1],['B4',1],['C#5',1],['D#5',1],
  ['E5',3],
];
function playNote(freq,start,dur){
  const o=audioCtx.createOscillator(), g=audioCtx.createGain();
  o.type='triangle'; o.frequency.value=freq;
  o.connect(g); g.connect(audioCtx.destination);
  const t=audioCtx.currentTime+start;
  g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(.16,t+.03);
  g.gain.exponentialRampToValueAtTime(.001,t+dur*0.92);
  o.start(t); o.stop(t+dur);
}
function playMelodyOnce(){
  const beat=.5; let t=0;
  _MELODY.forEach(([n,d])=>{ playNote(_NOTE[n],t,d*beat); t+=d*beat; });
  return t;
}
function setBgmFab(on){
  const fab=document.getElementById('bgmFab');
  if(!fab) return;
  fab.classList.toggle('is-on', on);
  fab.setAttribute('aria-pressed', String(on));
  fab.title = on
    ? '關閉背景音樂'
    : (bgmSrc() ? '播放背景音樂' : '播放背景音樂（愛的禮讚）');
  const slash = fab.querySelector('.bgm-slash');
  if(slash) slash.style.display = on ? 'none' : '';
}

function startBGM(){
  if(bgmOn) return;

  /* 有自己的音檔就播它 */
  const src = bgmSrc();
  if(src){
    if(!bgmAudio){
      bgmAudio = new Audio(src);
      bgmAudio.loop = true;
      bgmAudio.volume = 0.5;
      /* 檔案壞掉或格式不支援時，退回合成音樂而不是靜悄悄地不動 */
      bgmAudio.addEventListener('error', ()=>{
        console.warn('[BGM] 音檔載入失敗，改用內建音樂');
        bgmAudio = null;
        if(bgmOn){ bgmOn = false; startSynthBGM(); }
      }, { once:true });
    }
    bgmAudio.play().then(()=>{
      bgmOn = true;
      setBgmFab(true);
    }).catch(()=>{
      /* 瀏覽器擋掉自動播放：使用者再點一次就會成功 */
      setBgmFab(false);
    });
    return;
  }

  startSynthBGM();
}

/* 內建的音樂盒版本，不需要任何音檔 */
function startSynthBGM(){
  try{ audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return; }
  if(audioCtx.state==='suspended') audioCtx.resume();
  bgmOn=true;
  setBgmFab(true);
  const loop=()=>{ if(!bgmOn) return; const dur=playMelodyOnce(); bgmTimer=setTimeout(loop,(dur+1.6)*1000); };
  loop();
}

function stopBGM(){
  bgmOn=false;
  clearTimeout(bgmTimer);
  if(bgmAudio) bgmAudio.pause();
  setBgmFab(false);
}

/* ============================================================
   站台擁有者（新人本人）
   ・以 Google 帳號登入，信箱要在 sites.ownerEmails 白名單內
   ・這是規則層真正認得的身分，不是畫面上的遮罩
============================================================ */
function ownerEmails(){
  const list = window.SITE && window.SITE.data && window.SITE.data.ownerEmails;
  return Array.isArray(list) ? list.map(e => String(e).toLowerCase()) : [];
}

/* 目前登入的帳號是不是這組新人 */
function isSiteOwner(){
  const user = window.fb && window.fb.auth && window.fb.auth.currentUser;
  if(!user || !user.email || !user.emailVerified) return false;
  return ownerEmails().includes(user.email.toLowerCase());
}

/* 跳出 Google 登入視窗，回傳登入後的 email（失敗回 null） */
async function signInAsOwner(){
  const { auth, signInWithPopup, GoogleAuthProvider } = window.fb;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  return cred.user && cred.user.email;
}

/* ============================================================
   新人專屬信箱：網址加 WED.ownerKey（預設 #couple）才出現
============================================================ */
const OWNER_KEY = (window.WED && window.WED.ownerKey) || '#couple';
function isOwnerVisitor(){
  return location.hash === OWNER_KEY || /[?&]owner/.test(location.search);
}
function timeStr(ts){
  const d=new Date(ts);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

/* ============================================================
   日期倒數：把到 iso 的剩餘時間即時渲染進 el
   mode='grid'   → 天/時/分/秒 大方格（資訊卡用）
   mode='inline' → 「倒數 N 天 hh:mm:ss」一行（大廳用）
   回傳 timer id，需要時可 clearInterval
============================================================ */
function startCountdown(el, iso, mode){
  if(!el || !iso) return null;
  mode = mode || 'grid';
  const target = new Date(iso).getTime();
  if(isNaN(target)) return null;
  const pad = n => String(n).padStart(2,'0');
  const render = ()=>{
    const diff = target - Date.now();
    if(diff <= 0){
      el.classList.add('cd-done');
      el.innerHTML = mode==='inline'
        ? `<span class="cd-msg">我們結婚囉</span>`
        : `<div class="cd-msg">大喜之日・我們結婚囉</div>`;
      return false;
    }
    const d = Math.floor(diff/86400000);
    const h = Math.floor(diff%86400000/3600000);
    const m = Math.floor(diff%3600000/60000);
    const s = Math.floor(diff%60000/1000);
    if(mode==='inline'){
      el.innerHTML = `倒數 <b>${d}</b> 天 <b>${pad(h)}:${pad(m)}:${pad(s)}</b>`;
    } else {
      el.innerHTML =
        `<div class="cd-unit"><span class="cd-num">${d}</span><span class="cd-lab">天</span></div>`+
        `<div class="cd-unit"><span class="cd-num">${pad(h)}</span><span class="cd-lab">時</span></div>`+
        `<div class="cd-unit"><span class="cd-num">${pad(m)}</span><span class="cd-lab">分</span></div>`+
        `<div class="cd-unit"><span class="cd-num">${pad(s)}</span><span class="cd-lab">秒</span></div>`;
    }
    return true;
  };
  render();
  const timer = setInterval(()=>{ if(!render()) clearInterval(timer); }, 1000);
  return timer;
}
function renderInbox(){
  const list=document.getElementById('inboxList');
  if(!list) return;
  const letters=DataStore.getLetters().slice().reverse();
  if(!letters.length){
    list.innerHTML=`<div class="inbox-empty">目前還沒有信件<br>等賓客們投信進來，這裡就會出現囉</div>`;
    return;
  }
  list.innerHTML=letters.map(l=>`
    <div class="letter-item">
      <div class="li-head">
        <span class="li-ic">${escapeHtml(l.icon||DEFAULT_ICON)}</span>
        <span class="li-name">${escapeHtml(l.name||'朋友')}</span>
        <span class="li-time">${timeStr(l.time||Date.now())}</span>
      </div>
      <div class="li-body">${escapeHtml(l.text||'')}</div>
    </div>`).join('');
}

/* ============================================================
   頂部導覽列（每一頁共用，由這裡注入，各頁 HTML 不用重複寫）
   顯示順序：新人名稱(lobby) → 桌次(seating) → 祝福(wall)
             → 給你的信(letter) → 故事(exhibition) → 測驗(quiz)
             → 抽卡(draw) → 集氣(cake) → User
   ・站台沒開的頁面不會出現在列上
============================================================ */
const NAV_ITEMS = [
  { key:'seating',    label:'桌次' },
  { key:'wall',       label:'祝福' },
  { key:'letter',     label:'給你的信' },
  { key:'exhibition', label:'故事' },
  { key:'quiz',       label:'測驗' },
  { key:'draw',       label:'抽卡' },
  { key:'cake',       label:'集氣' },
];

/* 入場前（大廳的 gate、信箱的登入畫面）先不顯示導覽列 */
function setNavVisible(on){
  const nav = document.getElementById('siteNav');
  if(nav) nav.hidden = !on;
  document.body.classList.toggle('nav-off', !on);
}

function buildSiteNav(){
  const S = window.SITE;
  if(!S || document.getElementById('siteNav')) return;

  const couple = (window.WED && window.WED.couple) || '婚禮';
  const links = NAV_ITEMS
    .filter(it => S.isEnabled(it.key))
    .map(it => `<a class="nav-link${it.key === S.page ? ' current' : ''}" `
              + `href="${S.pathFor(it.key)}">${escapeHtml(it.label)}</a>`)
    .join('');

  const nav = document.createElement('header');
  nav.className = 'site-nav';
  nav.id = 'siteNav';
  nav.innerHTML = `
    <nav class="nav-inner">
      <a class="nav-brand" href="${S.pathFor('lobby')}">${escapeHtml(couple)}</a>
      <div class="nav-links">${links}</div>
      <div class="nav-user">
        <button class="nav-user-btn" id="navUserBtn" type="button" aria-haspopup="true" aria-expanded="false">
          <span class="nav-user-ic" id="navUserIc"></span>
          <span class="nav-user-nm" id="navUserNm"></span>
        </button>
        <div class="nav-user-pop" id="navUserPop">
          <button type="button" data-act="logout">登出（換一位賓客）</button>
        </div>
      </div>
    </nav>`;
  document.body.insertBefore(nav, document.body.firstChild);

  syncNavUser();

  const btn = document.getElementById('navUserBtn');
  const pop = document.getElementById('navUserPop');
  btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    const open = pop.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e)=>{
    if(!e.target.closest('.nav-user')){
      pop.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
  pop.querySelector('[data-act="logout"]').addEventListener('click', logout);

  /* 還沒進場就先藏起來，index.js / inbox.js 進場後再叫出來 */
  const gate = document.getElementById('gate') || document.getElementById('pwGate');
  setNavVisible(!(gate && gate.style.display !== 'none'));
}

/* 名字或記號變動後重新畫一次導覽列上的 User */
function syncNavUser(){
  const ic = document.getElementById('navUserIc');
  const nm = document.getElementById('navUserNm');
  if(ic) ic.textContent = me_user.icon || DEFAULT_ICON;
  if(nm) nm.textContent = me_user.name || '朋友';
}

/* ============================================================
   浮動控制（主題 / BGM）— 同樣由這裡注入，線條圖示、無 emoji
============================================================ */
const THEME_DOTS = [
  ['champagne','香檳金'], ['blush','霧玫瑰'], ['sage','鼠尾草綠'], ['dusk','霧霾藍'],
];
function buildFloating(){
  if(document.querySelector('.floating')) return;
  const box = document.createElement('div');
  box.className = 'floating';
  box.innerHTML = `
    <div class="theme-pop" id="themePop">
      ${THEME_DOTS.map(([k,t]) =>
        `<div class="theme-dot t-${k}" data-theme="${k}" title="${t}"></div>`).join('')}
    </div>
    <button class="fab" id="themeFab" type="button" title="換主題色" aria-label="換主題色">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17"/>
      </svg>
    </button>
    <button class="fab" id="bgmFab" type="button" title="播放背景音樂（愛的禮讚）"
            aria-label="背景音樂" aria-pressed="false">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 17.5V5.5l10-2v12"/>
        <circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>
        <path class="bgm-slash" d="M3.5 20.5 20.5 3.5"/>
      </svg>
    </button>`;
  document.body.appendChild(box);
}

/* ============================================================
   子場景的背景照
   ・來源只有這組新人的素材資料夾（public/assets/{slug}/）
   ・data-bg 決定優先挑哪一類素材，挑不到就往下退
   ・完全沒有素材時不設圖，畫面維持純色底
============================================================ */
const SCENE_BG_SOURCES = {
  wishes:  ['cover', 'gallery'],
  gallery: ['gallery', 'cover'],
  cake:    ['cakes', 'cover', 'gallery'],
};

function pickSceneBg(kind){
  const a = (window.SITE && window.SITE.assets) || {};
  for(const key of (SCENE_BG_SOURCES[kind] || ['cover', 'gallery'])){
    const v = a[key];
    if(typeof v === 'string' && v) return v;
    if(Array.isArray(v) && v.length && v[0].src) return v[0].src;
  }
  return (window.WED && window.WED.coverImageUrl) || '';
}

function applySceneBg(){
  document.querySelectorAll('.scene-bg').forEach(el => {
    const src = pickSceneBg(el.dataset.bg);
    if(!src) return;                    // 沒素材 → 不發請求、不蓋白紗
    el.style.backgroundImage = `url("${src}")`;
    requestAnimationFrame(() => el.classList.add('show'));
  });
}

/* ============================================================
   共用 UI 綁定（在每頁載入時呼叫一次）
============================================================ */
function bindCommonUI(){
  initFx();

  /* 先套上這組新人的文字，再把站內連結換成 /w/{slug}/xxx */
  fillTemplates();
  rewriteNavLinks();

  /* 每頁共用的導覽列與浮動控制 */
  buildSiteNav();
  buildFloating();

  /* 主題切換 */
  const themeFab = document.getElementById('themeFab');
  const themePop = document.getElementById('themePop');
  if(themeFab && themePop){
    themeFab.addEventListener('click', ()=>themePop.classList.toggle('open'));
    themePop.querySelectorAll('.theme-dot').forEach(dot=>{
      dot.addEventListener('click', ()=>setTheme(dot.dataset.theme));
    });
  }

  /* BGM 按鈕 */
  const bgmFab = document.getElementById('bgmFab');
  if(bgmFab){
    bgmFab.addEventListener('click', ()=>{ bgmOn ? stopBGM() : startBGM(); });
  }

  /* 新人信箱 */
  const ownerFab  = document.getElementById('ownerFab');
  const inboxModal= document.getElementById('inboxModal');
  const inboxClose= document.getElementById('inboxClose');
  const ownerCount= document.getElementById('ownerCount');
  /* 賓客沒有讀取信件的權限，數量只有新人登入後才會有 */
  if(ownerCount){
    const paint = () => { ownerCount.textContent = DataStore.getLetterCount(); };
    paint();
    document.addEventListener('data:letters', paint);
  }
  if(ownerFab && isOwnerVisitor()) ownerFab.classList.add('show');
  if(ownerFab) ownerFab.addEventListener('click', ()=>{ renderInbox(); inboxModal.classList.add('open'); });
  if(inboxClose) inboxClose.addEventListener('click', ()=>inboxModal.classList.remove('open'));
  if(inboxModal) inboxModal.addEventListener('click', e=>{ if(e.target===inboxModal) inboxModal.classList.remove('open'); });

  /* 場景背景照：用這組新人自己的素材
     ・沒有素材就維持純色底，不去要一張不存在的圖（以免 console 一堆 404） */
  applySceneBg();
}

/* 本檔由 site-context.js 動態注入，載入時 DOM 多半已經就緒 */
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', bindCommonUI);
}else{
  bindCommonUI();
}
