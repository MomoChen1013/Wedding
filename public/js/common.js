/* ============================================================
   婚禮網站 — 共用 JS
   提供：
     - DataStore（Firestore 讀寫 + 本地快取）
     - me_user（名字 + 記號）
     - 頂部導覽列（每頁共用，由本檔注入）
     - 主題切換
     - 特效（煙火 / 彩帶 / 金箔 / 飄浮記號）
     - BGM（新人自己的音檔 → 內建預設 /audio/bgm.mp3 → 合成的〈愛的禮讚〉）
     - 新人專屬區塊（網址加 WED.ownerKey 才出現）
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

  /* 沒對到專屬詞彙 → 給通用信。新人可以寫好幾封通用信（給男方朋友一封、
     給同事一封…），這裡用輸入字串挑一封：同一個人不管開幾次都拿到同一封，
     不同的人則平均分散開來。排序過才不會因為讀取順序不同而換信。 */
  const defs = all.filter(b => b.isDefault === true);
  if(!defs.length) return null;
  if(defs.length === 1) return { item: defs[0], personal: false };

  const sorted = defs.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  let h = 0;
  for(let i = 0; i < q.length; i++) h = (h * 31 + q.charCodeAt(i)) >>> 0;
  return { item: sorted[h % sorted.length], personal: false };
}

function $(sel, root){ return (root||document).querySelector(sel); }
function $all(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }

/* ============================================================
   出席回覆的題目選項（表單與後台儀表板共用同一份）
   ------------------------------------------------------------
   ・js/rsvp-form.js 拿它畫出選項按鈕
   ・js/admin.js 拿它畫環狀圖的標籤與順序
   兩邊共用，圖表的分類才不會和賓客實際看到的選項對不起來。
   陣列順序＝畫面順序＝圖表區段順序。
============================================================ */
const RSVP_OPTIONS = {
  attend: [
    ['yes',   '熱情出席'],
    ['maybe', '視情況而定'],
    ['no',    '誠摯祝福但無法出席'],
  ],
  relation: [
    ['groom', '男方親友'],
    ['bride', '女方親友'],
    ['both',  '雙方親友'],
    ['other', '其他'],
  ],
  /* 聯絡方式：新人在後台複選要問哪幾種，賓客至少要填其中一種 */
  contact: [
    ['phone', '電話號碼'],
    ['line',  'LINE ID'],
    ['email', 'Email'],
  ],
  meal: [
    ['meat', '葷食'],
    ['veg',  '素食'],
  ],
  card: [
    ['paper',   '需要紙本喜帖'],
    ['digital', '需要電子喜帖'],
    ['none',    '不需要喜帖'],
  ],
  cardDelivery: [
    ['pickup', '自行領取'],
    ['mail',   '郵寄'],
  ],
  gift: [
    ['pickup', '現場領取'],
    ['mail',   '郵寄'],
  ],
};
window.RSVP_OPTIONS = RSVP_OPTIONS;

/* 代號 → 中文（找不到就原樣回傳，舊資料才不會變成空白） */
function rsvpLabel(group, value){
  const hit = (RSVP_OPTIONS[group] || []).find(([v]) => v === value);
  return hit ? hit[1] : (value || '');
}

/* ============================================================
   出席回覆頁的開關（新人在後台「出席回覆」分頁設定）
   ------------------------------------------------------------
   一律「沒設定過就視為開著」——
   欄位是後來才加的，舊站台不會因為少了這幾個欄位就整塊消失。
   表單（rsvp-form.js）、頁面（invitation.js）與後台儀表板（admin.js）
   讀的是同一份，三邊才不會各自解讀。
============================================================ */
const CONTACT_KEYS = RSVP_OPTIONS.contact.map(([k]) => k);

function rsvpConfig(){
  const d = (window.SITE && window.SITE.data) || {};
  const on = (v) => v !== false;   /* 只有明確存了 false 才算關掉 */

  /* 沒設定過就三種都問；存了空陣列代表「不問聯絡方式」 */
  const contacts = Array.isArray(d.rsvpContactMethods)
    ? d.rsvpContactMethods.filter(m => CONTACT_KEYS.includes(m))
    : CONTACT_KEYS.slice();

  return {
    askCard:     on(d.rsvpAskCard),      // 喜帖
    askGift:     on(d.rsvpAskGift),      // 喜餅
    askMessage:  on(d.rsvpAskMessage),   // 想對新人說的話
    contacts,                            // 要問哪幾種聯絡方式
    showStory:   on(d.rsvpShowStory),    // 頁面上的「兩人的故事」
    showGallery: on(d.rsvpShowGallery),  // 頁面上的「照片集」
    /* 賓客標籤：整個功能預設是關的，由我們在 Firebase 打開（見下面說明） */
    tagsOn:      guestTagsOn(),
    tags:        guestTagList(),
    tagOptions:  guestTagsOn() ? guestTagList().filter(t => t.onForm) : [],
  };
}

/* ============================================================
   賓客標籤（VIP、長輩、大學同學…）
   ------------------------------------------------------------
   為什麼分成兩段開關：
   ・guestTagsEnabled（站台文件，新人改不動）＝整個功能的總開關。
     這是要配合排桌次一起用的進階功能，操作有一定複雜度，
     所以和 pages 一樣由我們決定哪一組新人要用（Firebase Console
     或 `npm run set-pages -- --guest-tags on`）。
   ・guestTags[].onForm ＝這個標籤要不要變成表單上的選項。
     新人可以自己維護標籤庫，但不是每個標籤都適合讓賓客自己選
     （「VIP」「行動不便」這種通常是新人自己掛的）。

   標籤存的是 id 不是名字：新人日後改名，已經送出的回覆
   與後台掛好的分類都還對得到同一個標籤。
============================================================ */
/* 「加入常用標籤」帶進來的那一組。onForm＝預設要不要當表單選項：
   賓客自己答得出來的（大學同學、公司同事…）才預設打開，
   VIP／長輩／小孩／行動不便通常是新人自己判斷的，預設只在後台掛。 */
const DEFAULT_GUEST_TAGS = [
  { name:'VIP',      onForm:false },
  { name:'長輩',     onForm:false },
  { name:'小孩',     onForm:false },
  { name:'行動不便', onForm:false },
  { name:'大學同學', onForm:true  },
  { name:'公司同事', onForm:true  },
  { name:'教會朋友', onForm:true  },
  { name:'親戚',     onForm:true  },
];

const GUEST_TAG_MAX = 30;        // 一個站台最多幾個標籤（規則也擋同一個數字）
const GUEST_TAG_NAME_MAX = 20;   // 一個標籤最多幾個字
const GUEST_TAGS_PER_RSVP = 20;  // 一位賓客最多掛幾個標籤

function guestTagsOn(){
  return !!(window.SITE && window.SITE.data && window.SITE.data.guestTagsEnabled === true);
}

/* 站台文件裡的標籤庫；壞掉的資料（沒有 id／名字）直接略過，不讓畫面出現空標籤 */
function guestTagList(){
  const raw = (window.SITE && window.SITE.data && window.SITE.data.guestTags) || [];
  if(!Array.isArray(raw)) return [];
  return raw
    .map(t => (t && typeof t === 'object' ? {
      id:     String(t.id || '').slice(0, 40),
      name:   String(t.name || '').trim().slice(0, GUEST_TAG_NAME_MAX),
      onForm: t.onForm === true,
    } : null))
    .filter(t => t && t.id && t.name)
    .slice(0, GUEST_TAG_MAX);
}

/* id → 名字。找不到（新人把標籤刪了）就回空字串，讓呼叫端自己決定要不要顯示 */
function guestTagName(id){
  const hit = guestTagList().find(t => t.id === id);
  return hit ? hit.name : '';
}

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
   寫入逾時
   ------------------------------------------------------------
   Firestore 在離線時的行為很反直覺：setDoc()／updateDoc() 回傳的
   Promise **永遠不會 resolve，也不會 reject** —— 它只是靜靜地排進
   本機佇列，等連線回來才送出去。

   對資料是好事（不會掉），對使用者是災難：
     ・try/catch 抓不到，成功的 toast 不會出現、失敗的也不會
     ・按鈕沒有恢復，使用者會連按好幾次
     ・onSnapshot 的本地樂觀更新讓畫面看起來已經存好了

   所以每一筆寫入都套一層逾時：超過就丟一個看得懂的錯誤出去，
   讓呼叫端有機會說「網路好像不太穩，這筆還沒送出去」。
   注意：逾時不代表寫入被取消 —— 佇列仍然在，連線回來還是會送達，
   所以文案講的是「還沒送出去」，不是「存檔失敗」。
============================================================ */
const WRITE_TIMEOUT_MS = 8000;

class WriteTimeoutError extends Error{
  constructor(){
    super('網路好像不太穩，這一筆還沒送出去');
    this.name = 'WriteTimeoutError';
    this.code = 'write-timeout';
  }
}
window.WriteTimeoutError = WriteTimeoutError;

function withWriteTimeout(promise, ms){
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(()=> clearTimeout(timer)),
    new Promise((_, reject)=>{
      timer = setTimeout(()=> reject(new WriteTimeoutError()), ms || WRITE_TIMEOUT_MS);
    }),
  ]);
}
window.withWriteTimeout = withWriteTimeout;

/* ============================================================
   資料層（DataStore）— Firestore 版
   ・寫入 → 走 Firestore（非同步）
   ・讀取 → 同步取本地快取，由 onSnapshot 即時推回
   ・資料變動時 dispatch 'data:<key>'，畫面可監聽重渲染
============================================================ */
const DataStore = {
  _wishes:[], _letters:[], _hearts:0, _collected:[], _cakes:[], _rsvps:[],
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
    /* 測驗的題目與作答紀錄只有測驗頁與後台要用，改由 subscribeQuiz() 自己叫 */

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

    /* 悄悄話信箱依規則只有站台擁有者讀得到，
       等新人在後台用 Google 登入之後才由 subscribeLetters() 訂閱 */
    /* RSVP 依規則不開放前端讀取，這裡不訂閱；名單請用 export-rsvps.js 匯出 */
  },

  /* 新人在後台以 Google 登入後才呼叫，開始接收信件 */
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
  /* 賓客送出的測驗作答。
     picks 是「題目 id → 選了哪幾個選項」的 map ——
     用題目 id 而不是題號，新人之後調順序或刪題目，票也不會對到別題去。
     （Firestore 不接受陣列裡再放陣列，所以外層一定是 map） */
  async addQuizVote({ picks, score, total }){
    const { addDoc } = window.fb;
    return addDoc(this._col('quizVotes'), {
      picks,
      score: Number(score) || 0,
      total: Number(total) || 0,
      time: Date.now(),
    });
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
  _cards:[], _exhibits:[], _quiz:[], _quizVotes:[], _rsvpTags:[],
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
    this.subscribeSeatingImages();
  },
  /* 新人關掉桌次搜尋時，賓客那一頁只需要桌次圖，不必讀整份名單 */
  subscribeSeatingImages(){ this._lazySub('seatingImages', 'seatingImages', 'order'); },
  subscribeBlessings(){ this._lazySub('blessings', 'blessings', 'time'); },
  subscribeExplore(){   this._lazySub('explore',   'explore',   'order'); },
  /* 囍卡與展品：新人自己上傳的圖是整段 data URL，資料量大，
     所以只有抽卡頁、戀愛時光頁與後台才訂閱 */
  subscribeCards(){    this._lazySub('cards',    'cards',    'order'); },
  subscribeExhibits(){ this._lazySub('exhibits', 'exhibits', 'order'); },
  /* 測驗：題目由新人維護（order 決定題號），作答紀錄是賓客送上來的票 */
  subscribeQuiz(){      this._lazySub('quiz',      'quiz',      'order'); },
  subscribeQuizVotes(){ this._lazySub('quizVotes', 'quizVotes', 'time'); },
  /* 新人幫賓客掛的標籤：文件 id 就是那筆回覆的 id，沒有排序欄位。
     只有後台讀得到（規則和 rsvps 一樣只開給 ownerEmails）。 */
  subscribeRsvpTags(){ this._lazySub('rsvpTags', 'rsvpTags'); },

  getSeating()       { return this._seating; },
  getSeatingImages() { return this._seatingImages; },
  getBlessings()     { return this._blessings; },
  getExplore()       { return this._explore; },
  getCards()         { return this._cards; },
  getExhibits()      { return this._exhibits; },
  getQuiz()          { return this._quiz; },
  getQuizVotes()     { return this._quizVotes; },

  /* rsvpId → 標籤 id 陣列。畫名單、篩選、匯出都查這一份 */
  getRsvpTagMap(){
    const map = {};
    this._rsvpTags.forEach(d => {
      map[d.id] = Array.isArray(d.tags) ? d.tags.map(String) : [];
    });
    return map;
  },
  /* 一位賓客的標籤整組覆寫；空陣列就把整份刪掉，不留空文件 */
  async saveRsvpTags(rsvpId, tags){
    const list = [...new Set((tags || []).map(String).filter(Boolean))]
      .slice(0, GUEST_TAGS_PER_RSVP);
    if(!list.length){
      try{ await this.removeDoc('rsvpTags', rsvpId); }
      catch(err){ if(err && err.code !== 'not-found') throw err; }
      return [];
    }
    await this.saveDoc('rsvpTags', rsvpId, { tags:list, updatedAt: Date.now() });
    return list;
  },

  /* ===== 新人專用的寫入（規則只認 ownerEmails 名單內的 Google 帳號） =====
     沒有 id 就新增，有 id 就覆寫同一份文件。 */
  async saveDoc(colName, id, data){
    const { addDoc, setDoc, doc, db } = window.fb;
    if(id){
      await withWriteTimeout(setDoc(doc(db, 'sites', window.SITE.siteId, colName, id), data));
      return id;
    }
    const ref = await withWriteTimeout(addDoc(this._col(colName), data));
    return ref.id;
  },
  async removeDoc(colName, id){
    const { deleteDoc, doc, db } = window.fb;
    await withWriteTimeout(deleteDoc(doc(db, 'sites', window.SITE.siteId, colName, id)));
  },

  /* 站台文件本身的大廳文案（地點、dress code、流程…）。
     規則只放行白名單內的欄位，其他欄位（status、ownerEmails…）寫不進去。
     寫完順手更新 window.SITE.data，後台不用重新整理就看得到最新值。 */
  async saveSiteFields(patch){
    const { updateDoc, doc, db, serverTimestamp } = window.fb;
    const data = { ...patch, updatedAt: serverTimestamp() };
    await withWriteTimeout(updateDoc(doc(db, 'sites', window.SITE.siteId), data));
    Object.assign(window.SITE.data, patch);
    return patch;
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
  /* ===== RSVP 出席回覆 =====
     規則只讓 ownerEmails 名單內的帳號讀，所以不放進 _subscribe()，
     由新人後台登入成功後才呼叫。
     欄位以 js/rsvp-form.js 實際寫入的為準：
       attending  bool   只有「熱情出席」是 true
       tentative  bool   true 代表「視情況而定」
       guestCount int    出席人數
       relation   string 與新人的關係
       mealMeat / mealVeg  int  葷素分配（加起來＝guestCount）
       childSeat  int    兒童座椅張數（0 代表不需要）
       cardType / cardDelivery / cardZip / cardAddress    喜帖
       giftDelivery / giftZip / giftAddress               喜餅
       note       string 其他備註
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

  /* ===== 後台儀表板用的統計 =====
     每一組回傳 { total, slices:[{ key, label, value }] }，
     admin.js 直接拿去畫環狀圖，不必自己再算一次。

     分母刻意不一致，因為問的問題不一樣：
       出席／喜帖／喜餅／兒童座椅 → 以「回覆筆數」計（一筆回覆一個決定）
       飲食                      → 以「人數」計（葷素是分配到每個人身上的）
     沒填到的舊資料歸進「未填」，總數才跟回覆筆數對得起來。 */
  getRsvpCharts(){
    const rows = this._rsvps;
    const NA = { key:'na', label:'未填' };

    /* 依 key 累加成 slices，順序照 RSVP_OPTIONS 走，最後補上「未填」 */
    const tally = (group, pickKey) => {
      const counts = new Map((RSVP_OPTIONS[group] || []).map(([k]) => [k, 0]));
      let na = 0;
      rows.forEach(r => {
        const k = pickKey(r);
        if(k != null && counts.has(k)) counts.set(k, counts.get(k) + 1);
        else na++;
      });
      const slices = (RSVP_OPTIONS[group] || [])
        .map(([k, label]) => ({ key:k, label, value: counts.get(k) }));
      if(na) slices.push({ ...NA, value: na });
      return { total: rows.length, slices };
    };

    /* 出席：三選一，用同一個 rsvpStatus() 判斷，和名單上的標籤一致 */
    const attend = tally('attend', r => this.rsvpStatus(r));

    /* 飲食：只算「會來」的那些回覆，單位是人 */
    const going = rows.filter(r => this.rsvpStatus(r) === 'yes');
    let meat = 0, veg = 0, unset = 0;
    going.forEach(r => {
      const m = Number(r.mealMeat) || 0;
      const v = Number(r.mealVeg) || 0;
      if(m + v > 0){ meat += m; veg += v; }
      else unset += Number(r.guestCount) || 1;   /* 舊資料沒有葷素分配 */
    });
    const mealSlices = [
      { key:'meat', label:'葷食', value: meat },
      { key:'veg',  label:'素食', value: veg },
    ];
    if(unset) mealSlices.push({ ...NA, value: unset });
    const meal = { total: meat + veg + unset, slices: mealSlices, unit:'位' };

    /* 兒童座椅：需要／不需要，另外附上總張數 */
    let seatRows = 0, seats = 0;
    rows.forEach(r => {
      const n = Number(r.childSeat) || 0;
      if(n > 0){ seatRows++; seats += n; }
    });
    const child = {
      total: rows.length,
      seats,
      slices: [
        { key:'need',   label:'需要兒童座椅', value: seatRows },
        { key:'noneed', label:'不需要',       value: rows.length - seatRows },
      ],
    };

    /* 喜帖：紙本再拆成自行領取／郵寄，新人才知道要寄幾份 */
    const cardCounts = { pickup:0, mail:0, paper:0, digital:0, none:0, na:0 };
    rows.forEach(r => {
      const t = r.cardType;
      if(t === 'paper'){
        cardCounts.paper++;
        if(r.cardDelivery === 'mail') cardCounts.mail++;
        else if(r.cardDelivery === 'pickup') cardCounts.pickup++;
      }
      else if(t === 'digital') cardCounts.digital++;
      else if(t === 'none') cardCounts.none++;
      else cardCounts.na++;
    });
    const cardSlices = [
      { key:'pickup',  label:'紙本・自行領取', value: cardCounts.pickup },
      { key:'mail',    label:'紙本・郵寄',     value: cardCounts.mail },
      { key:'digital', label:'電子喜帖',       value: cardCounts.digital },
      { key:'none',    label:'不需要喜帖',     value: cardCounts.none },
    ];
    /* 選了紙本卻沒選領取方式的（舊資料）不要憑空消失 */
    const cardOrphan = cardCounts.paper - cardCounts.pickup - cardCounts.mail;
    if(cardOrphan > 0) cardSlices.push({ key:'paper', label:'紙本・未指定', value: cardOrphan });
    if(cardCounts.na) cardSlices.push({ ...NA, value: cardCounts.na });
    const card = { total: rows.length, slices: cardSlices };

    /* 喜餅：現場領取／郵寄 */
    const gift = tally('gift', r => r.giftDelivery || null);

    return { attend, meal, child, card, gift };
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

/* 婚禮 hashtag：新人沒在後台填的話用這兩個當預設，
   大廳與各頁的 {{hashtag}} 都走這裡，兩邊不會一個有、一個沒有 */
const DEFAULT_HASHTAGS = ['#我們結婚了', '#Married'];

function hashtagList(){
  const tags = ((window.WED && window.WED.hashtags) || [])
    .map(t => String(t).trim()).filter(Boolean);
  return tags.length ? tags : DEFAULT_HASHTAGS.slice();
}

function fillTemplates(root){
  const W = window.WED || {};
  const val = (key) => {
    if(key === 'hashtag') return hashtagList()[0];
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
  /* 清掉測驗暫存（避免下個 user 看到上一位的答案） */
  LS.remove('quizLast');
  location.href = sitePath('lobby');
}

/* ============================================================
   入場登入（大廳那道 gate）的總開關
   ------------------------------------------------------------
   entryLoginEnabled（站台文件，新人改不動）＝要不要請賓客先報上名來。
   ・沒有這個欄位＝視為開著，既有站台的入場動畫不會突然消失
   ・關掉時：大廳不出現 gate，賓客直接看到內容；
     需要名字的動作（寫祝福、送甜點）改成在那一刻才用 ensureUser() 問
   只用大廳與桌次查詢的站台，賓客其實沒有一件事需要名字，
   多一道「輸入名字」只是把人擋在門外，所以做成可以整個關掉。
============================================================ */
function entryLoginOn(){
  return !(window.WED && window.WED.entryLogin === false);
}

/* 子場景：沒登入就丟回大廳 */
function requireUser(){
  /* 入場登入關掉的站台沒有 gate 可以報到，這時不能把賓客彈回大廳 ——
     否則祝福牆、抽卡這些頁面變成誰都進不去的死路。 */
  if(!entryLoginOn()) return true;
  if(!LS.get('user', null)){
    location.href = sitePath('lobby');
    return false;
  }
  return true;
}

/* ============================================================
   需要名字才能做的事（寫祝福、寄信、送甜點）
   ------------------------------------------------------------
   入場登入開著 → 賓客一定在大廳報到過，直接沿用那個名字。
   入場登入關著 → 沒有報到這回事，所以在真的要送出的那一刻才問，
                  填過一次就存進 localStorage，之後不再打擾。
   回傳 Promise<user|null>，null＝賓客按了取消（呼叫端就別送出）。
============================================================ */
function ensureUser(){
  if(LS.get('user', null)) return Promise.resolve(me_user);
  return askName();
}

/* 問名字的小視窗（沿用信件視窗的外框樣式，只換內容） */
function askName(){
  return new Promise(resolve => {
    let icon = ICONS[Math.floor(Math.random() * ICONS.length)];

    const modal = document.createElement('div');
    /* 直接帶著 open 進場：這個視窗是「按了送出才出現」的，
       晚一個 frame 才顯示會讓按鈕看起來像沒反應 */
    modal.className = 'letter-modal ask-name open';
    modal.innerHTML = `
      <div class="letter-card">
        <span class="letter-close" data-act="cancel" role="button" aria-label="關閉">✕</span>
        <h3>先報上名來</h3>
        <div class="ltip">讓新人知道這份心意是誰送的</div>
        <div class="ask-icon" data-act="reroll" role="button" aria-label="換一個記號"></div>
        <div class="ask-hint">這是你的專屬記號・<b data-act="reroll">換一個</b></div>
        <input class="ask-input" type="text" maxlength="12" placeholder="輸入你的名字">
        <div class="letter-actions">
          <button class="btn ghost" type="button" data-act="cancel">再等等</button>
          <button class="btn" type="button" data-act="ok">就是我</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const iconEl = modal.querySelector('.ask-icon');
    const input  = modal.querySelector('.ask-input');
    iconEl.textContent = icon;

    const close = (user) => { modal.remove(); resolve(user); };
    const submit = () => {
      const name = input.value.trim();
      if(!name){ input.focus(); return; }
      saveUser({ name, icon });
      /* 有名字之後導覽列才要長出那塊 User（原本是整塊不畫的） */
      refreshSiteNav();
      close(me_user);
    };

    modal.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if(act === 'reroll'){ icon = ICONS[Math.floor(Math.random()*ICONS.length)]; iconEl.textContent = icon; }
      else if(act === 'ok') submit();
      else if(act === 'cancel' || e.target === modal) close(null);
    });
    input.addEventListener('keydown', (e) => { if(e.key === 'Enter') submit(); });

    requestAnimationFrame(() => input.focus());
  });
}

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
   BGM（由上而下，先找到就用）
   ・素材資料夾放了 bgm.mp3 → 播放新人自己的音樂（循環）
   ・沒放 → 播放內建的預設背景音樂 /audio/bgm.mp3
   ・連預設音檔都載不起來（離線、格式不支援）→ 最後才退回
     Web Audio 合成的「愛的禮讚」音樂盒版（艾爾加 Salut d'Amour,
     Op.12・公共領域曲目，不需音檔）
============================================================ */
let audioCtx=null, bgmOn=false, bgmTimer=null, bgmAudio=null;

/* 內建的預設背景音樂：新人沒放自己的音檔時，全站共用這一首 */
const DEFAULT_BGM = '/audio/bgm.mp3';

/* 這一頁要播的音檔：新人自己的優先，其次是內建預設 */
function bgmSrc(){
  return (window.SITE && window.SITE.assets && window.SITE.assets.bgm) || DEFAULT_BGM;
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
  fab.title = on ? '關閉背景音樂' : '播放背景音樂';
  const slash = fab.querySelector('.bgm-slash');
  if(slash) slash.style.display = on ? 'none' : '';
}

function startBGM(){
  if(bgmOn) return;

  /* 有音檔就播它（新人自己的，或內建的預設背景音樂） */
  const src = bgmSrc();
  if(src){
    if(!bgmAudio){
      bgmAudio = new Audio(src);
      bgmAudio.loop = true;
      bgmAudio.volume = 0.5;
      /* 檔案壞掉或格式不支援時，退回合成音樂而不是靜悄悄地不動 */
      bgmAudio.addEventListener('error', ()=>{
        console.warn('[BGM] 音檔載入失敗，改用合成音樂');
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

/* 最後一道保險：音檔載不起來時用的音樂盒版本，不需要任何音檔 */
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
   新人專屬區塊：網址加 WED.ownerKey（預設 #couple）才出現
   ・只是把畫面上的東西叫出來，不是權限；真正讀得到什麼由規則決定
============================================================ */
const OWNER_KEY = (window.WED && window.WED.ownerKey) || '#couple';
function isOwnerVisitor(){
  return location.hash === OWNER_KEY || /[?&]owner/.test(location.search);
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
/* ============================================================
   頂部導覽列（每一頁共用，由這裡注入，各頁 HTML 不用重複寫）
   顯示順序：新人名稱(lobby) → 桌次(seating) → 祝福(wall)
             → 給你的信(letter) → 故事(exhibition) → 測驗(quiz)
             → 抽卡(draw) → 集氣(cake) → User
   ・站台沒開的頁面不會出現在列上
   ・出席回覆（邀請函）不放進導覽列：它是單獨分享出去的一頁，
     大廳本來就有一塊 RSVP 的入口，不需要在每一頁都再擺一次
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

/* 這幾頁不掛導覽列：
   ・admin ：新人自己的工作畫面，有自己的一套介面
   ・rsvp  ：邀請函是單獨分享出去的一頁，只留邀請函本身的內容 */
const NO_NAV_PAGES = new Set(['admin', 'rsvp']);

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

  /* 還沒在大廳報到過的訪客（例如直接點邀請函連結進來的）沒有名字，
     這時不該出現「朋友 ▾ / 登出（換一位賓客）」—— 他根本沒登入過。 */
  const entered = !!LS.get('user', null);
  const userBox = !entered ? '' : `
      <div class="nav-user">
        <button class="nav-user-btn" id="navUserBtn" type="button" aria-haspopup="true" aria-expanded="false">
          <span class="nav-user-ic" id="navUserIc"></span>
          <span class="nav-user-nm" id="navUserNm"></span>
        </button>
        <div class="nav-user-pop" id="navUserPop">
          <button type="button" data-act="logout">登出（換一位賓客）</button>
        </div>
      </div>`;

  const nav = document.createElement('header');
  nav.className = 'site-nav';
  nav.id = 'siteNav';
  nav.innerHTML = `
    <nav class="nav-inner">
      <a class="nav-brand" href="${S.pathFor('lobby')}">${escapeHtml(couple)}</a>
      <div class="nav-links">${links}</div>${userBox}
    </nav>`;
  document.body.insertBefore(nav, document.body.firstChild);

  syncNavUser();

  const btn = document.getElementById('navUserBtn');
  const pop = document.getElementById('navUserPop');
  if(btn && pop){
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
  }

  /* 還沒進場就先藏起來，index.js / admin.js 進場後再叫出來 */
  const gate = document.getElementById('gate') || document.getElementById('pwGate');
  setNavVisible(!(gate && gate.style.display !== 'none'));
}

/* 從沒名字變成有名字（入場登入關著的站台，在祝福牆填完名字）時，
   整塊 User 要重新長出來 —— syncNavUser() 只改得動已經存在的節點 */
function refreshSiteNav(){
  const nav = document.getElementById('siteNav');
  if(!nav) return;                       /* 沒有導覽列的頁面（邀請函／後台）不用管 */
  const visible = !nav.hidden;
  nav.remove();
  buildSiteNav();
  setNavVisible(visible);
}

/* 名字或記號變動後重新畫一次導覽列上的 User */
function syncNavUser(){
  const ic = document.getElementById('navUserIc');
  const nm = document.getElementById('navUserNm');
  if(ic) ic.textContent = me_user.icon || DEFAULT_ICON;
  if(nm) nm.textContent = me_user.name || '朋友';
}

/* ============================================================
   浮動控制（BGM）— 同樣由這裡注入，線條圖示、無 emoji
   ・原本旁邊還有一顆「換主題色」：版型現在由 sites.template 決定
     （見 site-context.js 的 TEMPLATES），賓客不再自己切換，所以拿掉了
============================================================ */
function buildFloating(){
  if(document.querySelector('.floating')) return;
  const box = document.createElement('div');
  box.className = 'floating';
  box.innerHTML = `
    <button class="fab" id="bgmFab" type="button" title="播放背景音樂"
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
   版型的植物線稿（korean／forest 才有；Classic 完全不注入）
   ------------------------------------------------------------
   ・korean → 一小枝（弧形細莖＋幾片小葉），forest → 一支蕨葉
   ・線稿是迴圈生出來的，不手刻一長串 path
   ・生長動畫：stroke-dash 讓每一筆從 0 畫到滿 —— 莖先走，
     葉子一片一片跟上，像手繪一樣慢慢長出來，不是整棵突然出現。
     捲到看得見才開始（IntersectionObserver），畫過就不再重畫。
   ・prefers-reduced-motion：全站的 reduce 規則會把 transition 壓成
     1ms，等於直接顯示完成的線稿，這裡不必再判斷一次
   ・素材資料夾放了 deco.png／deco.svg 的話就用新人自己的圖，不畫預設
============================================================ */
function buildFernSvg(){
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 120 190');
  svg.setAttribute('aria-hidden', 'true');

  const stem = document.createElementNS(ns, 'path');
  stem.setAttribute('d', 'M60 188 C 58 140, 54 90, 62 8');
  stem.setAttribute('fill', 'none');
  stem.setAttribute('stroke', 'currentColor');
  stem.setAttribute('stroke-width', '1.1');
  svg.appendChild(stem);

  const leaves = 13;
  for(let i = 0; i < leaves; i++){
    const t = i / (leaves - 1);
    const y = 178 - t * 158;
    const x = 59 + t * 3;
    const len = 34 * Math.sin(Math.PI * (0.18 + t * 0.72)) + 6;
    for(const dir of [-1, 1]){
      const leaf = document.createElementNS(ns, 'ellipse');
      leaf.setAttribute('cx', String(x + dir * len * 0.5));
      leaf.setAttribute('cy', String(y - len * 0.16));
      leaf.setAttribute('rx', String(len * 0.5));
      leaf.setAttribute('ry', String(3 + len * 0.09));
      leaf.setAttribute('fill', 'none');
      leaf.setAttribute('stroke', 'currentColor');
      leaf.setAttribute('stroke-width', '0.9');
      leaf.setAttribute('transform', `rotate(${dir * (24 + t * 14)} ${x} ${y})`);
      /* 由下往上長：越上面的葉子越晚出來 */
      leaf.dataset.order = String(1 + i * 2 + (dir > 0 ? 1 : 0));
      svg.appendChild(leaf);
    }
  }
  return svg;
}

function buildSprigSvg(){
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 120 150');
  svg.setAttribute('aria-hidden', 'true');

  const stem = document.createElementNS(ns, 'path');
  stem.setAttribute('d', 'M28 146 C 42 108, 58 74, 92 14');
  stem.setAttribute('fill', 'none');
  stem.setAttribute('stroke', 'currentColor');
  stem.setAttribute('stroke-width', '1');
  svg.appendChild(stem);

  const leaves = 7;
  for(let i = 0; i < leaves; i++){
    const t = (i + 1) / (leaves + 1);
    /* 沿著莖的弧線取近似點就夠了，裝飾不用精準 */
    const x = 28 + 40 * t * t + 26 * t;
    const y = 146 - 130 * t;
    const dir = i % 2 ? 1 : -1;
    const len = 15 + 9 * Math.sin(Math.PI * t);
    const leaf = document.createElementNS(ns, 'path');
    leaf.setAttribute('d',
      `M${x} ${y} q ${dir * len * 0.7} ${-len * 0.45} ${dir * len} ${-len * 0.1}` +
      ` q ${-dir * len * 0.35} ${len * 0.4} ${-dir * len} ${len * 0.1} z`);
    leaf.setAttribute('fill', 'none');
    leaf.setAttribute('stroke', 'currentColor');
    leaf.setAttribute('stroke-width', '0.9');
    leaf.dataset.order = String(1 + i);
    svg.appendChild(leaf);
  }
  return svg;
}

const DECO_STEM_MS = 1600;   /* 莖畫完的時間 */
const DECO_LEAF_MS = 520;    /* 一片葉子的時間 */
const DECO_GAP_MS  = 110;    /* 葉與葉之間的間隔 */

function growDeco(svg){
  const strokes = svg.querySelectorAll('path,ellipse');
  strokes.forEach(el => {
    const len = el.getTotalLength ? el.getTotalLength() : 0;
    if(!len) return;
    const order = +(el.dataset.order || 0);
    /* 一定要帶 px：CSS 的 stroke-dashoffset 沒單位會被當成非法值整條丟掉，
       computed 直接落回 0 —— 葉子就不是長出來，是跳出來 */
    el.style.strokeDasharray  = `${len}px`;
    el.style.strokeDashoffset = `${len}px`;
    el.style.transition = `stroke-dashoffset ${order ? DECO_LEAF_MS : DECO_STEM_MS}ms ease-out`;
    el.style.transitionDelay = order
      ? `${Math.round(DECO_STEM_MS * 0.45 + order * DECO_GAP_MS)}ms`
      : '0ms';
  });
  /* 初始狀態要先被瀏覽器「看過一次」，transition 才有起點可以走 ——
     否則起點與終點擠進同一次 style flush，整棵直接跳出來。
     讀一次版面強制 reflow，開始畫的那一步再包進 rAF 隔開一個 frame。 */
  void svg.getBoundingClientRect();
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if(!e.isIntersecting) return;
      io.unobserve(e.target);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        e.target.querySelectorAll('path,ellipse')
          .forEach(el => { el.style.strokeDashoffset = '0px'; });
      }));
    });
  }, { threshold: 0.35 });
  io.observe(svg);
}

function injectTemplateDeco(){
  const template = document.body.dataset.template;
  if(template !== 'korean' && template !== 'forest') return;

  const hosts = document.querySelectorAll('.lobby-hero, .scene-hero');
  if(!hosts.length) return;

  const custom = (window.SITE && window.SITE.assets && window.SITE.assets.deco) || '';
  hosts.forEach(host => {
    if(host.querySelector('.tpl-deco')) return;
    const box = document.createElement('div');
    box.className = 'tpl-deco';
    box.setAttribute('aria-hidden', 'true');
    if(getComputedStyle(host).position === 'static') host.style.position = 'relative';
    if(custom){
      box.innerHTML = `<img src="${custom}" alt="">`;
      host.appendChild(box);
    }else{
      const svg = template === 'forest' ? buildFernSvg() : buildSprigSvg();
      box.appendChild(svg);
      host.appendChild(box);
      growDeco(svg);
    }
  });
}

/* korean 的紙質紋理：素材資料夾有 paper 才把變數寫上去，
   common.css 的 body[data-template="korean"]::after 讀這個變數 */
function applyPaperTexture(){
  const paper = (window.SITE && window.SITE.assets && window.SITE.assets.paper) || '';
  if(paper) document.body.style.setProperty('--paper', `url("${paper}")`);
}

/* ============================================================
   共用 UI 綁定（在每頁載入時呼叫一次）
============================================================ */
function bindCommonUI(){
  initFx();

  /* 先套上這組新人的文字，再把站內連結換成 /w/{slug}/xxx */
  fillTemplates();
  rewriteNavLinks();

  /* 每頁共用的導覽列與浮動控制 —— 後台是新人自己的工作畫面，
     不套用賓客那一份導覽列／主題／BGM 浮動按鈕，後台有自己的一套 */
  if(window.SITE && window.SITE.page === 'admin') return;

  /* 邀請函只藏導覽列，主題與 BGM 的浮動按鈕照舊 */
  if(window.SITE && NO_NAV_PAGES.has(window.SITE.page)) setNavVisible(false);
  else buildSiteNav();
  buildFloating();

  /* BGM 按鈕 */
  const bgmFab = document.getElementById('bgmFab');
  if(bgmFab){
    bgmFab.addEventListener('click', ()=>{ bgmOn ? stopBGM() : startBGM(); });
  }

  /* 場景背景照：用這組新人自己的素材
     ・沒有素材就維持純色底，不去要一張不存在的圖（以免 console 一堆 404） */
  applySceneBg();

  /* korean／forest 版型專屬：紙質紋理 ＋ 會慢慢長出來的植物線稿 */
  applyPaperTexture();
  injectTemplateDeco();
}

/* 本檔由 site-context.js 動態注入，載入時 DOM 多半已經就緒 */
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', bindCommonUI);
}else{
  bindCommonUI();
}
