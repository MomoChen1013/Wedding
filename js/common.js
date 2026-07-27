/* ============================================================
   婚禮網站 — 共用 JS
   提供：
     - DataStore（localStorage 持久化）
     - me_user（名字 + icon）
     - 主題切換
     - 特效（煙火 / 彩帶 / 鞭炮 / 金箔 / 飄浮 emoji）
     - BGM（婚禮進行曲・華格納〈婚禮合唱〉音樂盒版）
     - 新人專屬信箱（網址加 WED.ownerKey 才出現）
     - 子場景的回大廳 / 左右轉導覽自動套用
     - escapeHtml 等小工具
============================================================ */

/* ---------- 小工具 ---------- */
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function $(sel, root){ return (root||document).querySelector(sel); }
function $all(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }

/* ---------- localStorage 包裝 ---------- */
const LS = {
  get(key, def){
    try{ const v = localStorage.getItem('momo.'+key); return v===null ? def : JSON.parse(v); }
    catch{ return def; }
  },
  set(key, val){
    try{ localStorage.setItem('momo.'+key, JSON.stringify(val)); }catch{}
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
  _subscribed:false,

  init(){
    if(!window.fb){ console.warn('[DataStore] window.fb 還沒就緒'); return; }
    const { auth, onAuthStateChanged } = window.fb;
    onAuthStateChanged(auth, user => {
      if(!user || this._subscribed) return;
      this._subscribed = true;
      this._subscribe();
    });
  },

  _subscribe(){
    const { db, auth, collection, onSnapshot, query, orderBy, where, doc } = window.fb;
    const uid = auth.currentUser && auth.currentUser.uid;

    const sub = (key, qFn) => {
      onSnapshot(qFn(), snap => {
        this['_'+key] = snap.docs.map(d => ({ id:d.id, ...d.data() }));
        document.dispatchEvent(new CustomEvent('data:'+key));
      }, err => console.warn('[DataStore] onSnapshot', key, err));
    };

    /* 全站共用（大家都看得到） */
    sub('wishes',  () => query(collection(db, 'wishes'),  orderBy('time', 'asc')));
    sub('letters', () => query(collection(db, 'letters'), orderBy('time', 'asc')));
    sub('cakes',   () => query(collection(db, 'cakes'),   orderBy('time', 'asc')));
    sub('compat',  () => query(collection(db, 'compat'),  orderBy('time', 'asc')));
    sub('rsvps',   () => query(collection(db, 'rsvps'),   orderBy('time', 'asc')));

    /* 抽卡收藏：per-uid，只訂閱自己的卡
       （不加 orderBy 以免要建立複合索引；排序在 getCollected() 由前端做） */
    sub('collected', () => query(collection(db, 'collected'), where('uid', '==', uid)));

    /* 愛心是單一計數器，存在 meta/hearts */
    onSnapshot(doc(db, 'meta', 'hearts'), snap => {
      this._hearts = (snap.data()?.count) || 0;
      document.dispatchEvent(new CustomEvent('data:hearts'));
    }, err => console.warn('[DataStore] onSnapshot hearts', err));
  },

  /* ===== 寫入（async；可不 await） ===== */
  async addWish(w){
    const { db, collection, addDoc } = window.fb;
    return addDoc(collection(db, 'wishes'), { ...w, time: w.time || Date.now() });
  },
  async addLetter(l){
    const { db, collection, addDoc } = window.fb;
    return addDoc(collection(db, 'letters'), { ...l, time: l.time || Date.now() });
  },
  async addCollected(c){
    const { db, auth, collection, addDoc } = window.fb;
    const uid = auth.currentUser ? auth.currentUser.uid : null;
    const userName = (typeof me_user !== 'undefined' && me_user) ? me_user.name : '';
    return addDoc(collection(db, 'collected'), {
      ...c,
      uid,                  // ← 用 Firebase Auth UID 隔離（每位訪客各自獨立）
      userName,             // ← 順便存名字，方便日後查
      time: Date.now(),
    });
  },
  async addCake(c){
    const { db, collection, addDoc } = window.fb;
    return addDoc(collection(db, 'cakes'), { ...c, time: c.time || Date.now() });
  },
  async addCompat(answers){
    const { db, collection, addDoc } = window.fb;
    return addDoc(collection(db, 'compat'), { answers, time: Date.now() });
  },
  async addRSVP(r){
    const { db, auth, collection, addDoc } = window.fb;
    const uid = auth.currentUser ? auth.currentUser.uid : null;
    return addDoc(collection(db, 'rsvps'), { ...r, uid, time: r.time || Date.now() });
  },
  async addHeart(){
    const { db, doc, runTransaction } = window.fb;
    const ref = doc(db, 'meta', 'hearts');
    await runTransaction(db, async tx => {
      const cur = (await tx.get(ref)).data()?.count || 0;
      tx.set(ref, { count: cur + 1 });
    });
    return this._hearts + 1;
  },

  /* ===== 新人專用：清空某個 collection（用於重置票數） ===== */
  async wipeCollection(name){
    const { db, collection, getDocs, deleteDoc, doc } = window.fb;
    const snap = await getDocs(collection(db, name));
    /* 並行刪除（小資料量 OK；超過幾百筆建議改用 writeBatch） */
    await Promise.all(snap.docs.map(d => deleteDoc(doc(db, name, d.id))));
    return snap.docs.length;
  },

  /* ===== 讀取（同步回本地快取） ===== */
  getWishes()     { return this._wishes; },
  getLetters()    { return this._letters; },
  getLetterCount(){ return this._letters.length; },
  getHearts()     { return this._hearts; },
  /* 抽卡收藏按時間排序（snapshot 沒帶 orderBy，所以在這裡排） */
  getCollected()  { return this._collected.slice().sort((a,b)=>(a.time||0)-(b.time||0)); },
  getCakes()      { return this._cakes; },
  /* compat 早期是「直接陣列」，現在統一包成 {answers:[...]}，取出時還原 */
  getCompat()     { return this._compat.map(c => c.answers || c); },
  /* RSVP 出席回覆（新人可看完整名單） */
  getRSVPs()      { return this._rsvps.slice().sort((a,b)=>(a.time||0)-(b.time||0)); },
  getRSVPCount()  { return this._rsvps.length; },
  /* 「將出席」的總人數（依每筆的 headcount 加總；沒填視為 1 位） */
  getAttendingCount(){
    return this._rsvps
      .filter(r => r.attending === 'yes')
      .reduce((sum, r) => sum + (Number(r.headcount) || 1), 0);
  },
};

/* 等 firebase-init.js 載入完成才啟動 */
if(window.fb) DataStore.init();
else window.addEventListener('fb:ready', () => DataStore.init());

/* ============================================================
   使用者（名字 + 隨機 icon）
============================================================ */
const ICONS = ['💍','🤍','🌷','🕊️','🥂','💐','✨','🌿','🍾','💒','🎀','🌸','💌','🫶','🥰','👰','🤵','💕'];
let me_user = LS.get('user', null) || { name:'朋友', icon:'🎀' };
function saveUser(u){ me_user = u; LS.set('user', u); }
function clearUser(){ me_user = { name:'朋友', icon:'🎀' }; localStorage.removeItem('momo.user'); }

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
  try{ localStorage.removeItem('momo.compatLast'); }catch{}
  location.href = 'index.html';
}

/* 子場景：沒登入就丟回大廳 */
function requireUser(){
  if(!LS.get('user', null)){
    location.href = 'index.html';
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
   BGM：用 Web Audio 合成「婚禮進行曲」音樂盒版
   （華格納〈婚禮合唱〉Here Comes the Bride）
============================================================ */
let audioCtx=null, bgmOn=false, bgmTimer=null;
const _NOTE={E4:329.63,F4:349.23,G4:392.00,A4:440.00,B4:493.88,C5:523.25,D5:587.33,E5:659.25,F5:698.46,G5:783.99};
const _MELODY=[
  ['G4',.5],['C5',1.5],['C5',.5],['C5',1],       // Here comes the bride
  ['G4',.5],['A4',1],  ['C5',.5],['B4',1.5],     // all dressed in white
  ['G4',.5],['C5',1.5],['C5',.5],['E5',1],       // sweetly the bride
  ['D5',.5],['C5',1],  ['B4',.5],['C5',2.5],     // comes down the aisle
];
function playNote(freq,start,dur){
  const o=audioCtx.createOscillator(), g=audioCtx.createGain();
  o.type='triangle'; o.frequency.value=freq;
  o.connect(g); g.connect(audioCtx.destination);
  const t=audioCtx.currentTime+start;
  g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(.18,t+.02);
  g.gain.exponentialRampToValueAtTime(.001,t+dur*0.9);
  o.start(t); o.stop(t+dur);
}
function playMelodyOnce(){
  const beat=.42; let t=0;
  _MELODY.forEach(([n,d])=>{ playNote(_NOTE[n],t,d*beat); t+=d*beat; });
  return t;
}
function startBGM(){
  if(bgmOn) return;
  try{ audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return; }
  if(audioCtx.state==='suspended') audioCtx.resume();
  bgmOn=true;
  const fab=document.getElementById('bgmFab'); if(fab) fab.textContent='🎵';
  const loop=()=>{ if(!bgmOn) return; const dur=playMelodyOnce(); bgmTimer=setTimeout(loop,(dur+1.2)*1000); };
  loop();
}
function stopBGM(){
  bgmOn=false; clearTimeout(bgmTimer);
  const fab=document.getElementById('bgmFab'); if(fab) fab.textContent='🔇';
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
        ? `<span class="cd-msg">💍 我們結婚囉！</span>`
        : `<div class="cd-msg">💍 大喜之日・我們結婚囉！</div>`;
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
    list.innerHTML=`<div class="inbox-empty">目前還沒有信件 💭<br>等賓客們投信進來，這裡就會出現囉～<br><br>（接上 Firebase 後，大家寄的悄悄話會自動收進這個信箱）</div>`;
    return;
  }
  list.innerHTML=letters.map(l=>`
    <div class="letter-item">
      <div class="li-head">
        <span class="li-ic">${l.icon||'💌'}</span>
        <span class="li-name">${escapeHtml(l.name||'朋友')}</span>
        <span class="li-time">${timeStr(l.time||Date.now())}</span>
      </div>
      <div class="li-body">${escapeHtml(l.text||'')}</div>
    </div>`).join('');
}

/* ============================================================
   共用 UI 綁定（在每頁載入時呼叫一次）
============================================================ */
function bindCommonUI(){
  initFx();

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
  if(ownerCount) ownerCount.textContent = DataStore.getLetterCount();
  if(ownerFab && isOwnerVisitor()) ownerFab.classList.add('show');
  if(ownerFab) ownerFab.addEventListener('click', ()=>{ renderInbox(); inboxModal.classList.add('open'); });
  if(inboxClose) inboxClose.addEventListener('click', ()=>inboxModal.classList.remove('open'));
  if(inboxModal) inboxModal.addEventListener('click', e=>{ if(e.target===inboxModal) inboxModal.classList.remove('open'); });

  /* 子場景：右上小頭像（點開有登出選單；lobby 沒有 #meMini 就跳過） */
  const meMini = document.getElementById('meMini');
  if(meMini){
    meMini.querySelector('.ic').textContent = me_user.icon || '🎀';
    meMini.querySelector('.nm').textContent = me_user.name || '朋友';

    /* 點頭像 → toggle 下拉選單 */
    meMini.classList.add('clickable');
    const pop = document.createElement('div');
    pop.className = 'me-pop';
    pop.innerHTML = `
      <button class="me-pop-item" data-act="logout">🚪 登出（換一位賓客）</button>
    `;
    meMini.appendChild(pop);

    meMini.addEventListener('click', e=>{
      if(e.target.closest('.me-pop')) return;   // 點選單本身不 toggle
      pop.classList.toggle('open');
    });
    /* 點頁面其他地方收起 */
    document.addEventListener('click', e=>{
      if(!meMini.contains(e.target)) pop.classList.remove('open');
    });
    /* 登出 */
    pop.querySelector('[data-act="logout"]').addEventListener('click', logout);
  }

  /* 顯示場景背景照 */
  document.querySelectorAll('.scene-bg').forEach(el=>{
    requestAnimationFrame(()=>el.classList.add('show'));
  });
}

/* DOMContentLoaded 後自動套用 */
document.addEventListener('DOMContentLoaded', bindCommonUI);
