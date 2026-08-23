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
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, addDoc, onSnapshot,
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
   key      : sites.pages 裡使用的開關代號（規則與後台也用同一組）
   path     : 網址片段；沒寫就等於 key
   file     : 實際的 HTML 檔名
   label    : 給大廳／後台顯示的中文名稱
   optional : false 代表這頁一定存在，不可關閉
============================================================ */
const PAGES = {
  lobby:      { file:'index.html',      label:'首頁',       optional:false },
  /* 出席回覆＝單頁邀請函：婚禮資訊與表單收在同一頁。
     原本 /rsvp 與 /invitation 是兩頁、兩份表單、寫進同一個子集合，
     等於同一件事做兩次，所以合併成一頁。

     網址沿用 /invitation（對外分享的是這個連結），
     但開關代號仍然是 rsvp —— firestore.rules 的 pageOn()、後台分頁、
     set-pages CLI 都靠它，改 key 會讓既有站台的 pages 設定失效。
     所以「網址片段」與「開關代號」在這裡分開記。 */
  rsvp:       { file:'invitation.html', path:'invitation',
                label:'邀請函',     optional:true  },
  wall:       { file:'wall.html',       label:'祝福牆',     optional:true  },
  cake:       { file:'cake.html',       label:'集氣送祝福', optional:true  },
  draw:       { file:'draw.html',       label:'抽卡',       optional:true  },
  exhibition: { file:'exhibition.html', label:'我們的故事', optional:true  },
  quiz:       { file:'quiz.html',       label:'新人小測驗', optional:true  },
  seating:    { file:'seating.html',    label:'我的桌次',   optional:true  },
  letter:     { file:'letter.html',     label:'給你的信',   optional:true  },
  /* 新人後台：不放進導覽列、不對外連結，但永遠開著，
     這樣新人不必先「打開某一頁」才能進去設定內容。
     真正的門檻在 Security Rules（ownerEmails 白名單），不是這個開關。 */
  admin:      { file:'admin.html',      label:'新人後台',   optional:false },
};

/* ============================================================
   只在新人後台出現的功能開關
   ------------------------------------------------------------
   和上面的頁面共用同一個 sites.pages map，差別是它們沒有自己的網址：
   不會出現在導覽列、也走不到 /w/{slug}/{key}，只決定後台要不要
   長出那一個分頁（firestore.rules 的 pageOn() 用的是同一個 key）。

   seatingPlan（排桌管理）＝把 Excel 排桌搬上線的工作台，
   排完之後由新人自己按「同步」寫進 seating（我的桌次）那一份公開名單。

   butler（收禮小幫手）比較特別：它有自己的網址（/butler#{token}），
   但那個網址不在 /w/{slug}/ 底下、也不吃 site-context ——
   它是一個「連得起來的小工具」，靠新人在後台產生的連結與通行碼進去。
   對這裡來說它就只是一個後台分頁的開關。
============================================================ */
const ADMIN_FEATURES = {
  seatingPlan: { label:'排桌管理' },
  butler:      { label:'收禮小幫手' },
};

/* 開關代號 → 網址片段 */
function pathOf(key) {
  return (PAGES[key] && PAGES[key].path) || key;
}

/* 網址片段 → 開關代號 */
const PATH_TO_KEY = Object.fromEntries(
  Object.keys(PAGES).map((key) => [pathOf(key), key])
);

/* 已經搬家的舊網址片段 → 現在的網址片段。
   ・inbox：悄悄話信箱本來是獨立一頁、要新人自己再登入一次，
     現在是後台的一個分頁，舊連結（或書籤）直接帶過去
   ・rsvp ：出席回覆已經併進單頁邀請函
   正式站台由 Hosting 的 301 轉址處理，這裡是本機與直接開檔的後路。 */
const MOVED_PATHS = {
  inbox: 'admin',
  rsvp: 'invitation',
};

/* 檔名 → 代號，給連結改寫用 */
const FILE_TO_KEY = Object.fromEntries(
  Object.entries(PAGES).map(([key, p]) => [p.file, key])
);

/* ---------- Firebase ---------- */
const app  = initializeApp(firebaseConfig);

/* 離線持久化：預設的記憶體快取一關掉分頁就沒了 ——
   新人在捷運上改的東西「看起來存好了」，回到家卻不見。
   開了 persistentLocalCache 之後，離線期間的改動會排在 IndexedDB 的佇列裡，
   連線回來自己送出去，關掉分頁也撐得住。
   ・multipleTab：後台常常同時開好幾個分頁（一邊排桌一邊看回覆）
   ・無痕視窗、瀏覽器擋 site data 時會開不起來，退回記憶體快取就好 */
let db;
try{
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
}catch(err){
  console.warn('[site] 離線快取開不起來，改用記憶體快取', err);
  db = getFirestore(app);
}

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
/* /w/{slug}            → { slug, seg:'',           page:'lobby' }
   /w/{slug}/cake       → { slug, seg:'cake',       page:'cake'  }
   /w/{slug}/invitation → { slug, seg:'invitation', page:'rsvp'  }
   seg 是網址上的字，page 是 sites.pages 的開關代號，兩者不一定相同 */
function parseLocation() {
  const m = location.pathname.match(/^\/w\/([^/?#]+)(?:\/([^/?#]*))?/);
  if (!m) return null;

  const slug = decodeURIComponent(m[1]).toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;

  const seg = (m[2] || '').replace(/\.html$/, '');
  const page = seg === '' ? 'lobby' : (PATH_TO_KEY[seg] || seg);
  return { slug, seg, page };
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
    /* 新人自己寫的稱呼（後台限 20 個字），沒填就沿用上面的 couple */
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
    transportPublicImg: site.transportPublicImg || '',
    transportParkingImg: site.transportParkingImg || '',
    /* 入場登入（大廳的 gate）：沒設定過就視為開著，舊站台的入場動畫不會突然消失。
       關掉時賓客不必報上名來，直接看到大廳（見 common.js 的 entryLoginOn()） */
    entryLogin: site.entryLoginEnabled !== false,
    /* 沒設定過就視為開著，舊站台的桌次搜尋不會突然消失 */
    seatingSearch: site.seatingSearchEnabled !== false,
    /* 桌次功能的總開關，同樣是沒設定過就視為開著 */
    seatingFeature: site.seatingFeatureEnabled !== false,
    story: site.story || '',
    coverImageUrl: site.coverImageUrl || '',
    photos: Array.isArray(site.photos) ? site.photos : [],
    hashtags: Array.isArray(site.hashtags) ? site.hashtags : [],

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

  /* 搬家的舊網址：先導過去，不用等站台設定讀完 */
  if (MOVED_PATHS[loc.seg]) {
    location.replace(`/w/${loc.slug}/${MOVED_PATHS[loc.seg]}`);
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

  /* 這一頁有沒有開給這組新人用（只看 pages，我們才改得動） */
  const isPageOn = (key) => {
    /* 後台功能沒有 PAGES 條目，但一樣看 pages map（沒設定過＝全開，
       和頁面同一套判斷，前端與 Security Rules 才不會各說各話） */
    if (ADMIN_FEATURES[key]) return pages ? pages[key] === true : true;
    if (!PAGES[key]) return false;
    if (!PAGES[key].optional) return true;
    return pages ? pages[key] === true : true;
  };

  /* 賓客現在看不看得到這一頁。
     桌次另外有一個新人自己控制的總開關（後台「婚禮資訊」分頁的
     「開放桌次功能」）：關著的時候整頁一起收起來 —— 導覽列的連結、
     大廳的「尋找我的座位」都是靠 isEnabled() 判斷的，直接打網址進來
     也會被導回大廳，賓客才不會在婚禮還沒到的時候就先去找位子。
     沒有這個欄位＝視為開著，既有站台的桌次頁不會突然消失。
     （後台自己看的是 isPageOn()，功能關著時新人照樣進得去整理名單） */
  const isEnabled = (key) => {
    /* 後台功能不是賓客看得到的頁面，永遠不算「已啟用」 */
    if (ADMIN_FEATURES[key]) return false;
    if (key === 'seating' && site.seatingFeatureEnabled === false) return false;
    return isPageOn(key);
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
    adminFeatures: ADMIN_FEATURES,
    isEnabled,
    isPageOn,
    /* 產生站內連結：pathFor('cake') → /w/{slug}/cake
       出席回覆的網址片段是 invitation，不是它的開關代號 rsvp */
    pathFor(key) {
      return key === 'lobby' ? `/w/${loc.slug}/` : `/w/${loc.slug}/${pathOf(key)}`;
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
    /* 開關代號 → 頁面 JS 檔名（檔名跟著 HTML 走，不是跟著代號） */
    const pageScript = { lobby:'index', rsvp:'invitation' }[pageKey] || pageKey;
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
