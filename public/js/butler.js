/* ============================================================
   butler.js — 收禮小幫手（婚宴當天的收禮台工具）
   ------------------------------------------------------------
   網址：/butler#{token}，和站台網址（/w/{slug}/…）與新人後台都分開。
   它不吃 site-context.js —— 那一支是「解析 slug、載入這組新人的設定」，
   而這裡連 slug 都不需要：拿到連結與通行碼就能用，
   是一個「連得起來的小工具」，不是站台的一頁。

   進得來的條件（見 js/butler-key.js 的長註解）：
     bookId = PBKDF2(通行碼, salt='butler:'+token)
   連結與通行碼兩個都對，才算得出收禮簿在 Firestore 的哪個位置。

   四五個人會同時記帳，所以：
     ・每一筆收禮是自己一份文件（不是塞在同一份裡），才不會互相蓋掉
     ・清單與統計都吃 onSnapshot，別人記的當場就看得到
     ・記錄者的名字存在自己手機（localStorage），寫進每一筆的 by

   會場網路常常很糟：Firestore SDK 會把寫入排進本機佇列，
   斷線時照樣按得下「儲存」，恢復連線自己送出去 ——
   所以頂列的連線點只是告知，不會擋住任何操作。
============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, onSnapshot, collection, query, orderBy,
  addDoc, updateDoc, deleteDoc, connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCU9_kkUzqiAjouvbf-_d7geeHXup-ltYA",
  authDomain: "wedding-22b94.firebaseapp.com",
  projectId: "wedding-22b94",
  storageBucket: "wedding-22b94.firebasestorage.app",
  messagingSenderId: "246468418759",
  appId: "1:246468418759:web:a2340dabefae916ad0b2e2",
};

const app = initializeApp(firebaseConfig);

/* 離線持久化：婚宴會場的收訊常常很差，而這一頁記的是錢。
   預設的記憶體快取一關掉分頁就沒了 —— 排在佇列裡還沒送出去的那幾筆
   會直接消失。開了 persistentLocalCache 才撐得過「手機沒電重開」。 */
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch (err) {
  console.warn('[butler] 離線快取開不起來，改用記憶體快取', err);
  db = getFirestore(app);
}

/* ============================================================
   寫入逾時
   ------------------------------------------------------------
   Firestore 離線時，addDoc／updateDoc 回傳的 Promise
   **永遠不會 resolve，也不會 reject** —— 它只是排進本機佇列。
   對資料是好事（不會掉），但按鈕會一直停在「儲存中…」，
   現場的人只好再按一次、再按一次，結果同一筆記了三遍。
   所以超過 8 秒就當作「還沒送出去」，把畫面交還給使用者。
============================================================ */
const WRITE_TIMEOUT_MS = 8000;

function withWriteTimeout(promise) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error('網路好像不太穩，這一筆還沒送出去');
        err.code = 'write-timeout';
        reject(err);
      }, WRITE_TIMEOUT_MS);
    }),
  ]);
}

/* 同其他頁面：本機預設連 emulator，?live=1 可強制讀正式資料庫 */
const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const wantsLive = new URLSearchParams(location.search).get('live') === '1';
if (isLocal && !wantsLive) connectFirestoreEmulator(db, '127.0.0.1', 8080);

/* 現場最常出現的紅包金額，點一下就填好。
   收禮台最花時間的就是打數字，這一排大概省掉八成的鍵盤操作。 */
const QUICK_AMOUNTS = [1200, 1600, 2000, 2200, 2600, 3600, 6000, 12000];

const $ = (id) => document.getElementById(id);

/* ============================================================
   小工具
============================================================ */

/* 名字比對的正規化，和 common.js 的 normKey() 同一套規則：
   去空白、全形轉半形、英文轉小寫 —— 賓客報名字、小幫手打字都很隨性 */
function normKey(s) {
  return String(s == null ? '' : s)
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, '');
}

function money(n) {
  return '$' + (Number(n) || 0).toLocaleString('en-US');
}

function clampInt(v, min, max, dflt) {
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

function fmtTime(ms) {
  const d = new Date(ms || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toast(msg, isError) {
  const el = document.createElement('div');
  el.className = 'ad-toast' + (isError ? ' is-error' : '');
  el.innerHTML = '<span class="ad-toast-msg"></span>';
  el.querySelector('.ad-toast-msg').textContent = msg;
  $('btToasts').appendChild(el);
  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 220);
  }, isError ? 4200 : 2200);
}

function showFatal(title, msg) {
  $('btGate').hidden = true;
  $('btApp').hidden = true;
  $('btFatalTitle').textContent = title;
  $('btFatalMsg').innerHTML = msg;
  $('btFatal').hidden = false;
}

/* ============================================================
   狀態
============================================================ */
const TOKEN = readToken();
const LS_KEY = `butler.${TOKEN}`;

let bookId = '';
let book = null;         /* butlers/{bookId} 的內容，含賓客名單 */
let entries = [];        /* 所有人記過的每一筆收禮，新的在前 */
let meName = '';         /* 記錄者（存在自己手機） */
let filter = 'all';
let listQuery = '';
let logQuery = '';
let sheet = null;        /* { entryId, guestId, guest } */

/* token 放在 fragment（#），查詢字串也收 —— 有人轉貼時會被改掉格式 */
function readToken() {
  const hash = (location.hash || '').replace(/^#/, '').trim();
  if (/^[a-z0-9]{8,64}$/i.test(hash)) return hash.toLowerCase();
  const q = new URLSearchParams(location.search).get('t');
  if (q && /^[a-z0-9]{8,64}$/i.test(q)) return q.toLowerCase();
  return '';
}

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; }
  catch { return {}; }
}
function saveLocal(patch) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ ...loadLocal(), ...patch }));
  } catch { /* 無痕模式寫不進去，忘記就忘記，不影響記帳 */ }
}

/* ============================================================
   進場：通行碼 → 收禮簿
============================================================ */
async function openBook(id, opts) {
  const silent = opts && opts.silent;
  let snap;
  try {
    snap = await getDoc(doc(db, 'butlers', id));
  } catch (err) {
    if (!silent) gateError('連不上伺服器，請確認網路後再試一次');
    console.warn('[butler] 讀取失敗', err);
    return false;
  }

  /* 文件不存在＝通行碼算出來的位置是空的＝通行碼錯了。
     規則不會、也沒辦法告訴我們「密碼錯誤」，這就是唯一的訊號。 */
  if (!snap.exists()) {
    if (!silent) gateError('通行碼不對，請再確認一次');
    return false;
  }

  const data = snap.data();
  if (data.revoked === true) {
    showFatal('這個連結已經停用', '新人已經把這組連結收起來了。<br>需要的話請跟新人要一組新的');
    return true;
  }

  bookId = id;
  book = data;
  saveLocal({ bookId: id });
  enterApp();
  return true;
}

function gateError(msg) {
  $('btGateErr').textContent = msg;
  $('btPass').select();
}

/* 頂列的第二行：這場婚禮 ・ 這組連結的名稱 */
function paintBrand() {
  $('btCouple').textContent = book.couple || '';
  $('btLabel').textContent = book.label
    ? (book.couple ? `・${book.label}` : book.label)
    : '';
}

function enterApp() {
  $('btGate').hidden = true;
  $('btFatal').hidden = true;
  $('btApp').hidden = false;
  /* 頂列這時候才量得到高度，下面那幾條 sticky 才對得準 */
  requestAnimationFrame(syncStickyTop);

  paintBrand();
  meName = loadLocal().name || '';
  renderWho();

  /* 名單之後可能會被新人重新匯入（有人臨時補報名），所以持續訂閱 */
  onSnapshot(doc(db, 'butlers', bookId), (s) => {
    if (!s.exists()) {
      showFatal('這本收禮簿不見了', '新人可能已經把它刪掉了');
      return;
    }
    book = s.data();
    if (book.revoked === true) {
      showFatal('這個連結已經停用', '新人已經把這組連結收起來了');
      return;
    }
    paintBrand();
    renderAll();
  }, (err) => console.warn('[butler] 名單訂閱中斷', err));

  onSnapshot(
    query(collection(db, 'butlers', bookId, 'entries'), orderBy('createdAt', 'desc')),
    (s) => {
      entries = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAll();
    },
    (err) => {
      console.warn('[butler] 紀錄訂閱中斷', err);
      toast('讀取紀錄時斷線了，恢復連線會自己補上', true);
    },
  );

  renderAll();
}

/* ============================================================
   資料整理
============================================================ */
function guests() {
  return Array.isArray(book && book.guests) ? book.guests : [];
}

/* 賓客 id → 他的收禮紀錄（同一位可能被記了不只一筆，全部收進來） */
function entryMap() {
  const map = new Map();
  entries.forEach((e) => {
    if (!e.guestId) return;
    if (!map.has(e.guestId)) map.set(e.guestId, []);
    map.get(e.guestId).push(e);
  });
  return map;
}

function totals() {
  let amount = 0, boxes = 0, people = 0, gifted = 0;
  entries.forEach((e) => {
    amount += Number(e.amount) || 0;
    boxes  += Number(e.boxes)  || 0;
    people += Number(e.people) || 0;
    if (e.gift === true) gifted += 1;
  });
  return { amount, boxes, people, gifted, count: entries.length };
}

/* ============================================================
   畫面：收禮台
============================================================ */
function renderAll() {
  renderList();
  renderLog();
  renderStat();
}

function renderList() {
  const map = entryMap();
  const all = guests();
  const q = normKey(listQuery);

  const rows = all.filter((g) => {
    const has = (map.get(g.id) || []).length > 0;
    if (filter === 'todo' && has) return false;
    if (filter === 'done' && !has) return false;
    if (!q) return true;
    return normKey(`${g.name}${g.code}${g.table}${g.cat || ''}`).includes(q);
  });

  const doneCount = all.filter((g) => (map.get(g.id) || []).length).length;
  const t = totals();
  $('btStripDone').textContent = doneCount;
  $('btStripLeft').textContent = Math.max(0, all.length - doneCount);
  $('btStripSum').textContent = money(t.amount);

  const host = $('btList');
  if (!all.length) {
    host.innerHTML = `<div class="ad-empty">
      這本收禮簿還沒有賓客名單<br>
      請新人在後台按「匯入賓客名單」，或直接用上面的「＋ 名單外的賓客」記帳</div>`;
    return;
  }
  if (!rows.length) {
    host.innerHTML = `<div class="ad-empty">沒有符合的賓客<br>
      名單上沒有的人可以用「＋ 名單外的賓客」直接記</div>`;
    return;
  }

  host.innerHTML = rows.map((g) => {
    const es = map.get(g.id) || [];
    const sum = es.reduce((n, e) => n + (Number(e.amount) || 0), 0);
    const box = es.reduce((n, e) => n + (Number(e.boxes) || 0), 0);
    const sub = [g.table, g.count ? `${g.count} 位` : '', g.cat]
      .filter(Boolean).join('・');

    const side = es.length
      ? `<span class="bt-amt">${money(sum)}</span>
         <span class="bt-sub">${box ? `禮餅 ${box} 盒` : '沒領禮餅'}${
           es.length > 1 ? `・${es.length} 筆` : ''}</span>`
      : `<span class="bt-sub">點一下收禮</span>`;

    return `<button class="ad-item bt-row${es.length ? ' is-done' : ''}" type="button"
              data-guest="${esc(g.id)}">
      <span class="ad-item-main">
        <span class="ad-item-title">${
          g.code ? `<i class="bt-code">${esc(g.code)}</i>` : ''}${esc(g.name)}</span>
        ${es.length ? '<span class="ad-tag ad-tag-yes">已收</span>' : ''}
        ${sub ? `<span class="ad-item-sub">${esc(sub)}</span>` : ''}
      </span>
      <span class="ad-item-actions bt-side">${side}</span>
    </button>`;
  }).join('');
}

/* ============================================================
   畫面：紀錄
============================================================ */
function renderLog() {
  const q = normKey(logQuery);
  const rows = entries.filter((e) => !q
    || normKey(`${e.name}${e.code || ''}${e.table || ''}${e.note || ''}${e.by || ''}`).includes(q));

  const host = $('btLog');
  $('btLogCount').textContent = `目前 ${rows.length} 筆`;

  if (!entries.length) {
    host.innerHTML = `<div class="ad-empty">還沒有任何紀錄<br>從「收禮台」開始收第一筆吧</div>`;
    return;
  }
  if (!rows.length) {
    host.innerHTML = `<div class="ad-empty">沒有符合的紀錄</div>`;
    return;
  }

  host.innerHTML = rows.map((e) => {
    const sub = [
      e.table,
      e.gift ? `禮餅 ${Number(e.boxes) || 0} 盒` : '沒領禮餅',
      e.people ? `${e.people} 位` : '',
      e.note,
    ].filter(Boolean).join('・');
    return `<button class="ad-item bt-row" type="button" data-entry="${esc(e.id)}">
      <span class="ad-item-main">
        <span class="ad-item-title">${
          e.code ? `<i class="bt-code">${esc(e.code)}</i>` : ''}${esc(e.name)}</span>
        <span class="ad-item-sub">${esc(sub)}</span>
      </span>
      <span class="ad-item-actions bt-side">
        <span class="bt-amt">${money(e.amount)}</span>
        <span class="bt-sub">${esc(e.by || '—')}・${fmtTime(e.createdAt)}</span>
      </span>
    </button>`;
  }).join('');
}

/* ============================================================
   畫面：統計
============================================================ */
function renderStat() {
  const t = totals();
  const map = entryMap();
  const left = guests().filter((g) => !(map.get(g.id) || []).length).length;

  $('btSumMoney').textContent = money(t.amount);
  /* 台灣一場婚禮禮金破百萬很常見：$1,280,000 有 10 個字元，
     在 390px 的手機上會溢出容器、被 body{overflow-x:hidden} 切掉 */
  $('btSumMoney').classList.toggle('is-long', $('btSumMoney').textContent.length > 8);
  $('btSumSub').textContent = t.count
    ? `共 ${t.count} 筆・平均 ${money(Math.round(t.amount / t.count))}`
    : '還沒有任何紀錄';

  /* 四格，和新人後台那一排看到的是同一組數字 */
  const tiles = [
    ['禮餅總盒數', t.boxes],
    ['發出禮餅', `${t.gifted} 筆`],
    ['到場人數', `${t.people} 位`],
    ['名單未收', `${left} 位`],
  ];
  $('btTiles').innerHTML = tiles.map(([label, v]) =>
    `<div class="ad-stat"><div class="ad-stat-num">${esc(String(v))}</div>
     <div class="ad-stat-lab">${label}</div></div>`).join('');

  /* 誰記了多少：四五個人分頭收，事後對帳看的就是這一份 */
  const byWho = new Map();
  entries.forEach((e) => {
    const who = e.by || '（沒署名）';
    const cur = byWho.get(who) || { count: 0, amount: 0, boxes: 0 };
    cur.count += 1;
    cur.amount += Number(e.amount) || 0;
    cur.boxes += Number(e.boxes) || 0;
    byWho.set(who, cur);
  });

  const host = $('btByWho');
  if (!byWho.size) {
    host.innerHTML = `<div class="ad-empty">還沒有人記過</div>`;
    return;
  }
  host.innerHTML = [...byWho.entries()]
    .sort((a, b) => b[1].amount - a[1].amount)
    .map(([who, v]) => `<div class="ad-item">
      <div class="ad-item-main">
        <span class="ad-item-title">${esc(who)}</span>
        <span class="ad-item-sub">${v.count} 筆・禮餅 ${v.boxes} 盒</span>
      </div>
      <div class="ad-item-actions"><span class="bt-amt">${money(v.amount)}</span></div>
    </div>`).join('');
}

function renderWho() {
  $('btWhoName').textContent = meName || '設定名字';
}

/* ============================================================
   記帳表單
============================================================ */
function openSheet(state) {
  sheet = state;
  const g = state.guest;
  const e = state.entry;

  const manual = !g;
  $('btNameField').hidden = !manual;
  $('btFormName').textContent = e ? (e.name || '這一筆')
    : (g ? g.name : '名單外的賓客');
  $('btFormMeta').textContent = e
    ? `${e.code ? e.code + '・' : ''}${e.table || ''}${e.by ? `・${e.by} 記的` : ''}`
    : (g ? [g.code, g.table, g.cat].filter(Boolean).join('・') : '不在名單上的賓客');

  $('btInName').value = e ? (e.name || '') : '';
  $('btInAmount').value = e && e.amount ? String(e.amount) : '';
  $('btInNote').value = e ? (e.note || '') : '';
  $('btInPeople').value = String(e ? (Number(e.people) || 0)
    : (g && Number(g.count) ? Number(g.count) : 0));

  const gift = e ? e.gift === true : false;
  setGift(gift);
  $('btInBoxes').value = String(e && Number(e.boxes) ? Number(e.boxes) : 1);

  $('btDelete').hidden = !e;
  $('btFormBy').textContent = meName
    ? `這一筆會記成「${meName}」收的`
    : '還沒設定你的名字，右上角可以填';
  $('btSave').textContent = e ? '更新' : '儲存';

  $('btSheet').hidden = false;
  pushSheetLayer($('btSheet'), closeSheet);
  /* 名單上的賓客直接把游標放到金額；名單外的先問名字 */
  setTimeout(() => {
    (manual && !e ? $('btInName') : $('btInAmount')).focus();
  }, 60);
}

function closeSheet() {
  $('btSheet').hidden = true;
  sheet = null;
  popSheetLayer($('btSheet'));
}

/* ============================================================
   彈窗層：背景鎖捲 ＋ 返回鍵
   ------------------------------------------------------------
   兩件在手機上一定會踩到的事：
     1. 彈窗開著時背景照樣捲，關掉之後停在完全不同的位置
        （iOS 上 overflow:hidden 鎖不住，要 position:fixed）
     2. 使用者按返回鍵想關掉表單，結果直接離開收禮台 ——
        婚宴當天最不該發生的事
============================================================ */
const sheetStack = [];
let sheetScrollY = 0;
let skipSheetPop = false;

function pushSheetLayer(el, close) {
  if (sheetStack.some((l) => l.el === el)) return;
  if (!sheetStack.length) {
    sheetScrollY = window.scrollY || 0;
    document.body.style.top = `-${sheetScrollY}px`;
    document.body.classList.add('ad-lock');
  }
  sheetStack.push({ el, close });
  try { history.pushState({ btLayer: sheetStack.length }, ''); } catch {}
}

function popSheetLayer(el) {
  const i = sheetStack.findIndex((l) => l.el === el);
  if (i < 0) return;
  sheetStack.splice(i, 1);
  if (!sheetStack.length) {
    document.body.classList.remove('ad-lock');
    document.body.style.top = '';
    window.scrollTo(0, sheetScrollY);
  }
  if (history.state && history.state.btLayer === i + 1) {
    skipSheetPop = true;
    try { history.back(); } catch { skipSheetPop = false; }
  }
}

window.addEventListener('popstate', () => {
  if (skipSheetPop) { skipSheetPop = false; return; }
  const top = sheetStack[sheetStack.length - 1];
  if (!top) return;
  sheetStack.pop();
  if (!sheetStack.length) {
    document.body.classList.remove('ad-lock');
    document.body.style.top = '';
    window.scrollTo(0, sheetScrollY);
  }
  top.close();
});

function setGift(on) {
  $('btGiftSeg').querySelectorAll('[data-gift]').forEach((b) => {
    b.classList.toggle('is-on', (b.dataset.gift === '1') === !!on);
  });
  $('btBoxField').hidden = !on;
}

function giftOn() {
  return $('btGiftSeg').querySelector('[data-gift="1"]').classList.contains('is-on');
}

async function saveEntry() {
  if (!sheet) return;
  const g = sheet.guest;
  const name = (g ? g.name : $('btInName').value.trim()).slice(0, 40);
  if (!name) { toast('請先填賓客的名字', true); $('btInName').focus(); return; }

  if (!meName) { openNameSheet(); return; }

  const gift = giftOn();
  const payload = {
    guestId: g ? String(g.id || '').slice(0, 60) : '',
    name,
    code: g ? String(g.code || '').slice(0, 12) : '',
    table: g ? String(g.table || '').slice(0, 40) : '',
    amount: clampInt($('btInAmount').value, 0, 9999999, 0),
    gift,
    boxes: gift ? clampInt($('btInBoxes').value, 0, 99, 0) : 0,
    people: clampInt($('btInPeople').value, 0, 99, 0),
    note: $('btInNote').value.trim().slice(0, 200),
    by: meName.slice(0, 40),
    updatedAt: Date.now(),
  };

  const btn = $('btSave');
  const btnText = btn.textContent;
  btn.disabled = true;
  btn.classList.add('is-saving');
  btn.textContent = '儲存中…';
  try {
    if (sheet.entry) {
      /* createdAt 留著原本的：那是「這位賓客什麼時候到的」，不該被改動 */
      await withWriteTimeout(
        updateDoc(doc(db, 'butlers', bookId, 'entries', sheet.entry.id), payload));
      toast(`已更新 ${name}`);
    } else {
      await withWriteTimeout(addDoc(collection(db, 'butlers', bookId, 'entries'),
        { ...payload, createdAt: Date.now() }));
      toast(`${name}　${money(payload.amount)}${gift ? `・禮餅 ${payload.boxes} 盒` : ''}`);
    }
    closeSheet();
  } catch (err) {
    console.warn('[butler] 寫入失敗', err);
    if (err && err.code === 'permission-denied') {
      toast('存不進去：這個連結可能已經被停用了', true);
    } else if (err && err.code === 'write-timeout') {
      /* 逾時 ≠ 失敗：Firestore 已經排進本機佇列，連線回來還是會送出去。
         現場最怕的是「以為沒存成功又記一次」，所以文案要講清楚 */
      toast('網路不太穩，這一筆還沒送出去（連線回來會自己補送）', true);
    } else {
      toast('存檔失敗，請再試一次', true);
    }
  }
  btn.disabled = false;
  btn.classList.remove('is-saving');
  btn.textContent = btnText;
}

async function removeEntry() {
  if (!sheet || !sheet.entry) return;
  const e = sheet.entry;
  if (!confirm(`確定要刪掉「${e.name}　${money(e.amount)}」這一筆嗎？`)) return;
  try {
    await withWriteTimeout(deleteDoc(doc(db, 'butlers', bookId, 'entries', e.id)));
    toast('已刪除');
    closeSheet();
  } catch (err) {
    console.warn('[butler] 刪除失敗', err);
    toast(err && err.code === 'write-timeout'
      ? '網路不太穩，這一筆還沒刪掉（連線回來會自己補送）'
      : '刪不掉，請再試一次', true);
  }
}

/* ---------- 記錄者名字 ---------- */
function closeNameSheet() {
  $('btNameSheet').hidden = true;
  popSheetLayer($('btNameSheet'));
}

function openNameSheet() {
  $('btInWho').value = meName;
  $('btNameSheet').hidden = false;
  pushSheetLayer($('btNameSheet'), closeNameSheet);
  setTimeout(() => $('btInWho').focus(), 60);
}

/* ============================================================
   匯出 CSV（開頭加 BOM，Excel 開中文才不會亂碼）
============================================================ */
function exportCsv() {
  if (!entries.length) { toast('還沒有任何紀錄', true); return; }
  const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const header = ['編號', '姓名', '桌次', '禮金', '禮餅', '盒數', '人數', '備註', '記錄者', '時間'];
  const rows = entries.slice().reverse().map((e) => [
    e.code || '', e.name || '', e.table || '',
    Number(e.amount) || 0,
    e.gift ? '已發送' : '沒有發',
    Number(e.boxes) || 0,
    Number(e.people) || 0,
    e.note || '', e.by || '',
    new Date(e.createdAt || Date.now()).toLocaleString('zh-TW'),
  ]);
  const t = totals();
  rows.push(['', '總計', '', t.amount, '', t.boxes, t.people, `${t.count} 筆`, '', '']);

  const csv = '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `收禮紀錄-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ============================================================
   事件
============================================================ */

/* ---------- 通行碼 ---------- */
$('btGateForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const pass = $('btPass').value.trim();
  if (!/^\d{4,10}$/.test(pass)) { gateError('通行碼是一組數字'); return; }

  const btn = $('btEnter');
  btn.disabled = true;
  btn.textContent = '確認中…';
  $('btGateErr').innerHTML = '&nbsp;';
  try {
    /* 這一步刻意慢（PBKDF2 20 萬次）：合法使用者等 0.1 秒，
       想暴力試通行碼的人每一次都要付同樣的代價 */
    const id = await window.ButlerKey.derive(TOKEN, pass);
    await openBook(id);
  } catch (err) {
    console.warn('[butler] 推導失敗', err);
    gateError('這個瀏覽器沒辦法計算通行碼，請換一個瀏覽器試試');
  }
  btn.disabled = false;
  btn.textContent = '進入';
});

$('btPass').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
});

/* ---------- 分頁 ---------- */
$('btTabbar').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-go]');
  if (!btn) return;
  const go = btn.dataset.go;
  document.querySelectorAll('.ad-subpanel[data-view]').forEach((v) => {
    v.classList.toggle('is-on', v.dataset.view === go);
  });
  $('btTabbar').querySelectorAll('button').forEach((b) => {
    b.classList.toggle('is-on', b === btn);
  });
  window.scrollTo({ top: 0 });
});

/* ---------- 收禮台 ---------- */
$('btSearch').addEventListener('input', (e) => { listQuery = e.target.value; renderList(); });
$('btLogSearch').addEventListener('input', (e) => { logQuery = e.target.value; renderLog(); });

$('btChips').addEventListener('click', (ev) => {
  const chip = ev.target.closest('[data-filter]');
  if (!chip) return;
  filter = chip.dataset.filter;
  $('btChips').querySelectorAll('[data-filter]')
    .forEach((c) => c.classList.toggle('is-on', c === chip));
  renderList();
});

$('btList').addEventListener('click', (ev) => {
  const row = ev.target.closest('[data-guest]');
  if (!row) return;
  const g = guests().find((x) => String(x.id) === row.dataset.guest);
  if (!g) return;
  /* 已經記過就直接開那一筆來改（最常見的是金額打錯）；
     同一位被記了好幾筆時開最新的，其他的從「紀錄」進去改 */
  const es = entryMap().get(g.id) || [];
  openSheet({ guest: g, entry: es[0] || null });
});

$('btLog').addEventListener('click', (ev) => {
  const row = ev.target.closest('[data-entry]');
  if (!row) return;
  const e = entries.find((x) => x.id === row.dataset.entry);
  if (!e) return;
  const g = e.guestId ? guests().find((x) => String(x.id) === e.guestId) : null;
  openSheet({ guest: g || null, entry: e });
});

$('btAddManual').addEventListener('click', () => openSheet({ guest: null, entry: null }));

/* ---------- 表單 ---------- */
$('btForm').addEventListener('submit', (ev) => { ev.preventDefault(); saveEntry(); });
$('btDelete').addEventListener('click', removeEntry);

$('btSheet').addEventListener('click', (ev) => {
  if (ev.target === $('btSheet') || ev.target.closest('[data-close]')) closeSheet();
});

$('btGiftSeg').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-gift]');
  if (!b) return;
  setGift(b.dataset.gift === '1');
});

/* 加減按鈕：手機上比鍵盤快，也不會不小心打出 22 位 */
document.querySelectorAll('.bt-step').forEach((box) => {
  box.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-d]');
    if (!b) return;
    const input = box.querySelector('input');
    const cur = clampInt(input.value, 0, 99, 0);
    input.value = String(Math.min(99, Math.max(0, cur + Number(b.dataset.d))));
  });
});

$('btQuick').innerHTML = QUICK_AMOUNTS
  .map((n) => `<button class="ad-chip" type="button" data-amt="${n}">${
    n.toLocaleString('en-US')}</button>`).join('');
$('btQuick').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-amt]');
  if (!b) return;
  $('btInAmount').value = b.dataset.amt;
});

$('btInAmount').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 7);
});

/* ---------- 記錄者 ---------- */
$('btWho').addEventListener('click', openNameSheet);
$('btNameSheet').addEventListener('click', (ev) => {
  /* 點遮罩本身也算取消（和後台的確認框一致） */
  if (ev.target === $('btNameSheet') || ev.target.closest('[data-close]')) {
    closeNameSheet();
  }
});
$('btNameForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  meName = $('btInWho').value.trim().slice(0, 40);
  saveLocal({ name: meName });
  renderWho();
  closeNameSheet();
  renderAll();
  /* 剛剛就是為了補名字才被擋下來的，補完直接接著存 */
  if (sheet && meName) saveEntry();
});

$('btExport').addEventListener('click', exportCsv);

/* ---------- 連線狀態 ---------- */
function paintNet() {
  const off = !navigator.onLine;
  $('btNet').classList.toggle('is-off', off);
  $('btNet').title = off ? '離線中，記下的資料會在恢復連線後送出' : '連線正常';
  /* 現場是站著單手拿手機，頂列那顆 7px 的小圓點看不到 ——
     真的斷線時要有一條橫的講清楚 */
  const bar = $('btOffline');
  if (bar) bar.hidden = !off;
  syncStickyTop();
}
window.addEventListener('online', paintNet);
window.addEventListener('offline', paintNet);

/* 頂列與離線橫幅都是 sticky，下面那一排篩選要黏在它們下面，
   高度寫死一定會對不準（婚禮名稱換一行就變了），所以量出來 */
function syncStickyTop() {
  const bar = document.querySelector('#btApp .ad-bar');
  const off = $('btOffline');
  const h = (bar ? bar.getBoundingClientRect().height : 56)
    + (off && !off.hidden ? off.getBoundingClientRect().height : 0);
  document.documentElement.style.setProperty('--ad-bar-h',
    `${bar ? Math.round(bar.getBoundingClientRect().height) : 56}px`);
  document.documentElement.style.setProperty('--ad-stick-top', `${Math.round(h)}px`);
  /* 子分頁列在窄螢幕也是 sticky（admin.css），下面那一排要黏在它下面 */
  const nav = $('btTabbar');
  const narrow = window.matchMedia('(max-width: 899px)').matches;
  document.documentElement.style.setProperty('--ad-subtabs-h',
    `${nav && narrow ? Math.round(nav.getBoundingClientRect().height) : 0}px`);
}
window.addEventListener('resize', syncStickyTop);
window.addEventListener('orientationchange', () => setTimeout(syncStickyTop, 220));

paintNet();

/* Esc 關閉表單（桌機） */
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (!$('btNameSheet').hidden) { closeNameSheet(); return; }
  if (!$('btSheet').hidden) closeSheet();
});

/* ============================================================
   啟動
============================================================ */
async function boot() {
  if (!TOKEN) {
    showFatal('連結不完整',
      '這個網址少了後面那一段代號。<br>請跟新人再要一次完整的連結');
    return;
  }
  if (!window.ButlerKey || !window.ButlerKey.available()) {
    showFatal('這個瀏覽器不支援',
      '收禮小幫手需要安全連線（https）才能運作。<br>請用新人給的原始連結重新打開');
    return;
  }

  /* 同一支手機開過就不必再打通行碼 —— 婚宴當天不會有人想輸入第二次。
     存的是算好的 bookId，不是通行碼本身。 */
  const saved = loadLocal();
  if (saved.bookId && await openBook(saved.bookId, { silent: true })) return;

  $('btGate').hidden = false;
  setTimeout(() => $('btPass').focus(), 80);
}

boot();
