/* ============================================================
   demo-firebase.js — 版型展示頁（/samples）用的「假 Firebase」
   ------------------------------------------------------------
   /samples/{版型}/… 跑的是正式網站**同一套**頁面程式（大廳、出席回覆、
   祝福牆、抽卡…），只是把 window.fb 換成這一份：

     ・資料全部在這個分頁的記憶體裡，一筆都不會寫進正式的 Firestore
     ・一開始就有示範資料（samples/sample-site.js 的 collections）
     ・賓客一律是「沒登入」的匿名訪客；Google 登入一律不開放

   只做頁面真的有用到的那幾個函式，簽名跟 Firebase v12 的 modular API 一樣，
   所以 common.js 的 DataStore、rsvp-form.js 這些程式一行都不用改。
   重新整理就回到示範資料的原樣（賓客在示範頁送出的東西不會留下來）。
============================================================ */

const DB = { type: 'demo-firestore' };

/* 文件路徑 → 資料。集合不另外存，用路徑前綴算出來 */
const store = new Map();
const listeners = new Set();
let autoId = 0;

const newId = () => `demo${Date.now().toString(36)}${(autoId++).toString(36)}`;
/* 讀出去的是一份淺拷貝：頁面改它不會改到這裡存的那一份 */
const clone = (v) => (v && typeof v === 'object' && !(v instanceof DemoTimestamp) ? (Array.isArray(v) ? v.slice() : { ...v }) : v);

/* serverTimestamp() 回傳的東西：頁面有時候會 toMillis()／toDate() */
class DemoTimestamp {
  constructor(ms) { this.ms = ms; this.seconds = Math.floor(ms / 1000); this.nanoseconds = 0; }
  toMillis() { return this.ms; }
  toDate() { return new Date(this.ms); }
  valueOf() { return this.ms; }
}

/* ---------- 參照 ---------- */
function collection(db, ...segs) {
  return { type: 'collection', path: segs.join('/') };
}
function doc(base, ...segs) {
  /* doc(db, 'sites', id, 'meta', 'hearts')／doc(collectionRef)／doc(collectionRef, id) */
  if (base && base.type === 'collection') {
    const id = segs.length ? segs.join('/') : newId();
    return docRef(`${base.path}/${id}`);
  }
  return docRef(segs.join('/'));
}
function docRef(path) {
  const id = path.split('/').pop();
  return { type: 'document', path, id };
}

/* ---------- 查詢 ---------- */
function query(ref, ...constraints) {
  return { type: 'query', path: ref.path, constraints };
}
const orderBy = (field, dir = 'asc') => ({ kind: 'orderBy', field, dir });
const where = (field, op, value) => ({ kind: 'where', field, op, value });

function docsUnder(path) {
  const prefix = `${path}/`;
  const out = [];
  for (const [p, data] of store) {
    if (p.startsWith(prefix) && !p.slice(prefix.length).includes('/')) out.push({ path: p, data });
  }
  return out;
}

const cmp = (a, b) => {
  const x = a instanceof DemoTimestamp ? a.ms : a;
  const y = b instanceof DemoTimestamp ? b.ms : b;
  if (x == null && y == null) return 0;
  if (x == null) return -1;
  if (y == null) return 1;
  return x < y ? -1 : x > y ? 1 : 0;
};

function runQuery(q) {
  let rows = docsUnder(q.path);
  for (const c of q.constraints || []) {
    if (c.kind === 'where') {
      rows = rows.filter(({ data }) => {
        const v = data[c.field];
        switch (c.op) {
          case '==': return v === c.value;
          case '!=': return v !== c.value;
          case '<': return cmp(v, c.value) < 0;
          case '<=': return cmp(v, c.value) <= 0;
          case '>': return cmp(v, c.value) > 0;
          case '>=': return cmp(v, c.value) >= 0;
          case 'in': return Array.isArray(c.value) && c.value.includes(v);
          case 'array-contains': return Array.isArray(v) && v.includes(c.value);
          default: return true;
        }
      });
    }
  }
  const sorts = (q.constraints || []).filter((c) => c.kind === 'orderBy');
  if (sorts.length) {
    rows.sort((a, b) => {
      for (const s of sorts) {
        const r = cmp(a.data[s.field], b.data[s.field]);
        if (r) return s.dir === 'desc' ? -r : r;
      }
      return 0;
    });
  }
  return rows;
}

/* ---------- 快照 ---------- */
function docSnap(path) {
  const data = store.get(path);
  const ref = docRef(path);
  return {
    id: ref.id, ref,
    exists: () => data !== undefined,
    data: () => (data === undefined ? undefined : clone(data)),
    get: (f) => (data === undefined ? undefined : data[f]),
  };
}
function querySnap(q) {
  const docs = runQuery(q).map(({ path }) => docSnap(path));
  return { docs, size: docs.length, empty: !docs.length, forEach: (fn) => docs.forEach(fn) };
}
const snapOf = (target) => (target.type === 'document' ? docSnap(target.path) : querySnap(target));

/* ---------- 讀 ---------- */
async function getDoc(ref) { return docSnap(ref.path); }
async function getDocs(q) { return querySnap(q.type === 'query' ? q : query(q)); }

function onSnapshot(target, next, error) {
  const q = target.type === 'collection' ? query(target) : target;
  const fn = typeof next === 'function' ? next : (next && next.next);
  const entry = { q, fn };
  listeners.add(entry);
  /* 跟真的 Firestore 一樣是非同步回第一份 */
  setTimeout(() => { if (listeners.has(entry)) fn(snapOf(q)); }, 0);
  return () => listeners.delete(entry);
}

function notify() {
  /* 每次寫入都重推一次（示範資料量很小，不值得算差異） */
  setTimeout(() => listeners.forEach(({ q, fn }) => fn(snapOf(q))), 0);
}

/* ---------- 寫 ---------- */
const resolveValue = (data) => {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) out[k] = v === SERVER_TS ? new DemoTimestamp(Date.now()) : v;
  return out;
};
const SERVER_TS = { __serverTimestamp: true };
const serverTimestamp = () => SERVER_TS;

function write(path, data, merge) {
  const prev = store.get(path);
  store.set(path, merge && prev ? { ...prev, ...resolveValue(data) } : resolveValue(data));
}
async function addDoc(colRef, data) {
  const ref = doc(colRef);
  write(ref.path, data);
  notify();
  return ref;
}
async function setDoc(ref, data, opts) { write(ref.path, data, opts && opts.merge); notify(); }
async function updateDoc(ref, data) {
  if (!store.has(ref.path)) throw Object.assign(new Error('No document to update'), { code: 'not-found' });
  write(ref.path, data, true); notify();
}
async function deleteDoc(ref) { store.delete(ref.path); notify(); }

async function runTransaction(db, fn) {
  const tx = {
    get: async (ref) => docSnap(ref.path),
    set: (ref, data, opts) => { write(ref.path, data, opts && opts.merge); return tx; },
    update: (ref, data) => { write(ref.path, data, true); return tx; },
    delete: (ref) => { store.delete(ref.path); return tx; },
  };
  const result = await fn(tx);
  notify();
  return result;
}
function writeBatch() {
  const ops = [];
  const batch = {
    set: (ref, data, opts) => { ops.push(() => write(ref.path, data, opts && opts.merge)); return batch; },
    update: (ref, data) => { ops.push(() => write(ref.path, data, true)); return batch; },
    delete: (ref) => { ops.push(() => store.delete(ref.path)); return batch; },
    commit: async () => { ops.forEach((op) => op()); notify(); },
  };
  return batch;
}

/* ---------- 登入：永遠是匿名訪客 ---------- */
const auth = { currentUser: { uid: 'demo-guest', isAnonymous: true, displayName: null, email: null } };
function onAuthStateChanged(a, cb) {
  setTimeout(() => cb(auth.currentUser), 0);
  return () => {};
}
const notHere = () => Promise.reject(Object.assign(new Error('示範頁不開放登入'), { code: 'demo/sign-in-disabled' }));
class GoogleAuthProvider { setCustomParameters() {} addScope() {} }

/* ---------- 對外 ---------- */
/* collections：{ '集合名': [ {id?, ...欄位} ] }、docs：{ '相對路徑': 欄位 }，
   路徑都是相對於 sites/{siteId} */
export function createDemoFirebase(siteId, { collections = {}, docs = {} } = {}) {
  const base = `sites/${siteId}`;
  for (const [name, rows] of Object.entries(collections)) {
    rows.forEach((row, i) => {
      const { id, ...data } = row;
      store.set(`${base}/${name}/${id || `${name}${i + 1}`}`, data);
    });
  }
  for (const [path, data] of Object.entries(docs)) store.set(`${base}/${path}`, data);

  return {
    db: DB, auth,
    collection, addDoc, onSnapshot, query, orderBy, where, doc, getDoc,
    runTransaction, serverTimestamp, getDocs, deleteDoc, setDoc, updateDoc, writeBatch,
    signInAnonymously: async () => ({ user: auth.currentUser }),
    signInWithPopup: notHere, linkWithPopup: notHere,
    signOut: async () => {},
    GoogleAuthProvider, onAuthStateChanged,
    demo: true,
  };
}
