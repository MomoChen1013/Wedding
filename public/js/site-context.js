/* ============================================================
   site-context.js — 多租戶站台載入器（每一頁唯一的進入點）
   ------------------------------------------------------------
   做的事，依序：
     1. 初始化 Firebase（Firestore + 匿名登入）
     2. 從網址 /w/{slug}/... 解析出 slug
     3. 查 slugs/{slug} → sites/{siteId}，載入這組新人的設定
     4. 檢查站台是否已發布、本頁是否被啟用
     5. 把設定攤成 window.SITE 與 window.WED（給舊有頁面 JS 使用）
     6. 依序注入 js/common.js 與該頁自己的 JS

   為什麼要用注入的方式：
     站台設定是非同步讀來的，但舊頁面的 JS（rsvp.js 等）在載入當下
     就會直接讀 window.WED、操作畫面。所以必須等資料到齊才載入它們，
     否則會讀到空設定。

   每一頁的 <body> 需要標上 data-page="頁面代號"，
   例如 <body data-page="cake">，代號要對得上 PAGES。
============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot,
  query, orderBy, where, doc, getDoc, runTransaction, serverTimestamp,
  getDocs, deleteDoc, setDoc, updateDoc, writeBatch, connectFirestoreEmulator
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import {
  getAuth, signInAnonymously, signInWithPopup, signOut,
  GoogleAuthProvider, onAuthStateChanged, connectAuthEmulator
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCU9_kkUzqiAjouvbf-_d7geeHXup-ltYA",
  authDomain: "wedding-22b94.firebaseapp.com",
  projectId: "wedding-22b94",
  storageBucket: "wedding-22b94.firebasestorage.app",
  messagingSenderId: "246468418759",
  appId: "1:246468418759:web:a2340dabefae916ad0b2e2",
};

/* ============================================================
   頁面清單
   key      : 網址與 sites.pages 裡使用的代號
   file     : 實際的 HTML 檔名
   label    : 給大廳／後台顯示的中文名稱
   optional : false 代表這頁一定存在，不可關閉
============================================================ */
const PAGES = {
  lobby:      { file:'index.html',      label:'首頁',       optional:false },
  rsvp:       { file:'rsvp.html',       label:'出席回覆',   optional:true  },
  wall:       { file:'wall.html',       label:'祝福牆',     optional:true  },
  cake:       { file:'cake.html',       label:'集氣送祝福', optional:true  },
  draw:       { file:'draw.html',       label:'抽卡',       optional:true  },
  exhibition: { file:'exhibition.html', label:'我們的故事', optional:true  },
  quiz:       { file:'quiz.html',       label:'新人小測驗', optional:true  },
  inbox:      { file:'inbox.html',      label:'悄悄話信箱', optional:true  },
  seating:    { file:'seating.html',    label:'我的桌次',   optional:true  },
  letter:     { file:'letter.html',     label:'給你的信',   optional:true  },
  /* 新人後台：不放進導覽列、不對外連結，但永遠開著，
     這樣新人不必先「打開某一頁」才能進去設定內容。
     真正的門檻在 Security Rules（ownerEmails 白名單），不是這個開關。 */
  admin:      { file:'admin.html',      label:'新人後台',   optional:false },
};

/* 檔名 → 代號，給連結改寫用 */
const FILE_TO_KEY = Object.fromEntries(
  Object.entries(PAGES).map(([key, p]) => [p.file, key])
);

/* ---------- Firebase ---------- */
const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

/* 本機開發時連 emulator；?live=1 可強制讀正式資料庫 */
const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const wantsLive = new URLSearchParams(location.search).get('live') === '1';
if (isLocal && !wantsLive) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  try { connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings:true }); } catch {}
}

window.fb = {
  db, auth,
  collection, addDoc, onSnapshot, query, orderBy, where, doc, getDoc,
  runTransaction, serverTimestamp, getDocs, deleteDoc, setDoc, updateDoc, writeBatch,
  signInAnonymously, signInWithPopup, signOut,
  GoogleAuthProvider, onAuthStateChanged,
};

/* 還沒登入才匿名登入；用 Google 登入過的訪客保留原帳號 */
onAuthStateChanged(auth, (user) => {
  if (!user) signInAnonymously(auth).catch(() => { /* 靜默失敗，頁面仍可瀏覽 */ });
});

/* ---------- 網址解析 ---------- */
/* /w/{slug}            → { slug, page:'lobby' }
   /w/{slug}/cake       → { slug, page:'cake'  } */
function parseLocation() {
  const m = location.pathname.match(/^\/w\/([^/?#]+)(?:\/([^/?#]*))?/);
  if (!m) return null;

  const slug = decodeURIComponent(m[1]).toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;

  const seg = (m[2] || '').replace(/\.html$/, '');
  const page = seg === '' ? 'lobby' : seg;
  return { slug, page };
}

/* ---------- 錯誤畫面 ---------- */
function showFatal(title, message) {
  document.documentElement.style.background = '#FBFAF8';
  document.body.innerHTML = `
    <div data-fatal="1" style="min-height:100svh;display:flex;flex-direction:column;align-items:center;
                justify-content:center;gap:12px;padding:40px 24px;text-align:center;
                font-family:'Noto Serif TC',serif;font-weight:300;
                line-height:1.9;letter-spacing:.04em;color:#2B2F36;background:#FBFAF8">
      <div style="font-size:2.6rem;line-height:1;color:#E8A93C">✦</div>
      <h1 style="font-size:1.35rem;font-weight:500;margin:6px 0 0">${title}</h1>
      <p style="color:#5C646F;font-size:.94rem;margin:0;max-width:34ch">${message}</p>
    </div>`;
  document.title = title;
}

/* ---------- 把站台設定攤平成舊頁面看得懂的 window.WED ---------- */
const WEEKDAYS = ['日','一','二','三','四','五','六'];

function buildWed(site) {
  const tz = site.timezone || 'Asia/Taipei';
  const ev = site.eventDate && typeof site.eventDate.toDate === 'function'
    ? site.eventDate.toDate() : null;

  /* 以婚禮當地時區取出年月日時分，海外賓客才不會看到換算後的時間 */
  let parts = {};
  if (ev) {
    for (const p of new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hour12: false,
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', weekday:'short',
    }).formatToParts(ev)) parts[p.type] = p.value;
  }
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const wdIdx = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday);

  const groom = site.groomName || '';
  const bride = site.brideName || '';

  /* dateISO 給倒數計時用；帶上時區位移才不會被瀏覽器當成本地時間 */
  const isoOffset = ev ? tzOffsetString(ev, tz) : '';

  return {
    groom, groomCn: groom,
    bride, brideCn: bride,
    couple: groom && bride ? `${groom} & ${bride}` : (groom || bride),
    coupleCn: groom && bride ? `${groom} ♡ ${bride}` : (groom || bride),
    /* 新人自己寫的稱呼（後台限 8 個字），沒填就沿用上面的 couple */
    coupleTitle: site.coupleTitle || '',

    date: ev ? `${parts.year}.${parts.month}.${parts.day}` : '',
    dateISO: ev ? `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:00${isoOffset}` : '',
    dateEndISO: site.eventEndDate && typeof site.eventEndDate.toDate === 'function'
      ? site.eventEndDate.toDate().toISOString() : '',
    weekday: wdIdx >= 0 ? `星期${WEEKDAYS[wdIdx]}` : '',
    time: ev ? `${hour}:${parts.minute} 開始` : '',

    venue: site.venueName || '',
    city: '',
    address: site.venueAddress || '',
    mapUrl: site.venueMapUrl || '',

    dressCode: site.dressCode || '',
    schedule: Array.isArray(site.schedule) ? site.schedule : [],
    giftNote: site.giftNote || '',
    transportPublic: site.transportPublic || '',
    transportParking: site.transportParking || '',
    /* 沒設定過就視為開著，舊站台的桌次搜尋不會突然消失 */
    seatingSearch: site.seatingSearchEnabled !== false,
    story: site.story || '',
    coverImageUrl: site.coverImageUrl || '',
    photos: Array.isArray(site.photos) ? site.photos : [],
    hashtags: Array.isArray(site.hashtags) ? site.hashtags : [],

    password: site.inboxPassword || '1010',
    ownerKey: '#couple',
  };
}

/* 取得某時區在該時間點的 UTC 位移，例如 "+08:00" */
function tzOffsetString(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit',
  });
  const p = {};
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  const asUtc = Date.UTC(+p.year, p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  const mins = Math.round((asUtc - date.getTime()) / 60000);
  const sign = mins >= 0 ? '+' : '-';
  const abs = Math.abs(mins);
  const pad = (n) => String(n).padStart(2, '0');
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/* ---------- 站台素材 ----------
   public/assets/{slug}/manifest.json 由 scripts/sync-assets.js 產生。
   沒有這個檔案（還沒放素材）就回傳空物件，頁面照樣能跑。 */
async function loadAssets(slug) {
  try {
    const res = await fetch(`/assets/${slug}/manifest.json`, { cache: 'no-cache' });
    if (!res.ok) return {};
    const data = await res.json();
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

/* ---------- 依序載入 script ---------- */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`載入失敗：${src}`));
    document.head.appendChild(s);
  });
}

/* ---------- 主流程 ---------- */
async function boot() {
  const loc = parseLocation();
  if (!loc) {
    showFatal('找不到這個頁面', '網址格式不正確，請確認新人給您的連結');
    return;
  }

  const pageKey = document.body.dataset.page || loc.page;

  let site, siteId;
  try {
    const slugSnap = await getDoc(doc(db, 'slugs', loc.slug));
    if (!slugSnap.exists()) return notFound();

    siteId = slugSnap.data().siteId;
    if (!siteId) return notFound();

    const siteSnap = await getDoc(doc(db, 'sites', siteId));
    if (!siteSnap.exists()) return notFound();

    site = siteSnap.data();
    if (site.status !== 'published') return notFound();
  } catch {
    showFatal('暫時無法載入', '網路好像不太穩，請稍後再重新整理一次');
    return;
  }

  /* 沒設定 pages 就視為全部啟用，舊站台不會因此壞掉 */
  const pages = site.pages && typeof site.pages === 'object' ? site.pages : null;
  const isEnabled = (key) => {
    if (!PAGES[key]) return false;
    if (!PAGES[key].optional) return true;
    return pages ? pages[key] === true : true;
  };

  /* 這頁沒開放就導回大廳，不要讓賓客卡在空頁面 */
  if (!isEnabled(pageKey)) {
    location.replace(`/w/${loc.slug}/`);
    return;
  }

  const assets = await loadAssets(loc.slug);

  /* Firestore 沒填的話，就用素材資料夾裡掃到的檔案 */
  if (!site.coverImageUrl && assets.cover) site.coverImageUrl = assets.cover;
  if ((!Array.isArray(site.photos) || !site.photos.length) && assets.gallery) {
    site.photos = assets.gallery.map((p) => p.src);
  }

  /* 對外公開的站台脈絡，各頁 JS 都靠這個 */
  window.SITE = {
    siteId,
    slug: loc.slug,
    assets,
    page: pageKey,
    data: site,
    pages: PAGES,
    isEnabled,
    /* 產生站內連結：pathFor('cake') → /w/{slug}/cake */
    pathFor(key) {
      return key === 'lobby' ? `/w/${loc.slug}/` : `/w/${loc.slug}/${key}`;
    },
    fileToKey: FILE_TO_KEY,
  };
  window.WED = buildWed(site);

  document.title = window.WED.couple
    ? `${PAGES[pageKey].label}｜${window.WED.couple} 婚禮`
    : PAGES[pageKey].label;

  /* 資料到齊了才載入舊有頁面 JS */
  try {
    await loadScript('/js/common.js');
    const pageScript = { lobby:'index' }[pageKey] || pageKey;
    await loadScript(`/js/${pageScript}.js`);
  } catch (err) {
    showFatal('頁面載入失敗', '請重新整理一次，如果一直發生請告訴我們');
    return;
  }

  /* 給測試與外部腳本判斷「整站真的可用了」的旗標 */
  document.documentElement.dataset.siteReady = '1';
  document.dispatchEvent(new Event('site:ready'));

  function notFound() {
    showFatal('找不到這張邀請函',
      '這個網址可能輸入錯誤，或是邀請函已經收起來了。<br>請再確認一次新人給您的連結');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
