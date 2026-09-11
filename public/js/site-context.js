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

/* 站台資料模型：與 scripts/build-og.js 共用同一份。
   建置期烤進 HTML 的字，和這裡執行期算出來的字必須逐字相同，
   否則賓客會看到「名字換成另一個名字」——那只是把閃爍換個地方。 */
import {
  TEMPLATES, templateKey, buildWed,
  tplValue, swapTokens, hashtagList,
} from './wed-model.js';

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

/* ============================================================
   還沒對外開放的功能
   ------------------------------------------------------------
   「沒開」有兩種，後台長得不一樣：

     沒開，不在這份清單裡 → **可加購**：側欄留著、掛一顆鎖頭，
                             點得進去看預覽（見 admin.js 的 lockPanel）
     沒開，而且在這裡     → **單純關閉**：整顆收起來，新人看不到

   放進來的代號代表「這個功能本身還沒好、還沒開賣」，
   跟某一組新人買了什麼無關 —— 所以它是寫死在程式裡的一份清單，
   不是每個站台各自的設定（那種是 sites.pages）。
   把還在做的功能掛上「進階方案」的鎖頭，等於在賣一個賣不了的東西：
   新人問了、我們也開不了。

   開賣的那一天就把代號從這裡刪掉，一個站台的資料都不用動。
   反過來，要先給某一組新人試用，照樣是 set-pages 打開那個 key ——
   這份清單只管「沒開的時候要不要被看見」，不擋任何已經開了的功能。

   scripts/site-pages.js 有同一份清單（CLI 用），改這裡記得一起改。
============================================================ */
const UNRELEASED_FEATURES = new Set([
  /* 集氣送祝福：功能還沒開賣，先不要出現在任何地方 */
  'cake',
]);

/* 版型（sites.template）、資料模型 buildWed() 都搬到 js/wed-model.js，
   因為 scripts/build-og.js 在建置期要用同一份。改版型清單請改那一支。 */

/* 套上版型：寫 <body data-template>，需要的話再補字檔。

   **預產過的頁面不會走到這裡做事**：build-og 已經把正確的
   data-template 與字體 link 印進 HTML 了，所以下面兩件事都是 no-op
   （dataset 寫回同一個值、link 被 querySelector 擋掉），賓客不會看到換色。

   沒預產到的頁面才真的在這裡換 —— 那種頁面由 .boot-veil 遮著，
   換色發生在遮罩底下，賓客一樣看不到。 */
function applyTemplate(name, isLobby) {
  const key = templateKey(name);
  document.body.dataset.template = key;
  const t = TEMPLATES[key];
  /* 字體整個版型都要；版面 CSS 只有大廳要（見 wed-model.js 的 lobbyCss）。
     以前這裡是每一頁都插，子頁等於多擋一次首次繪製在一份用不到的樣式上。 */
  const sheets = [...(t.fonts || []), ...(isLobby ? (t.lobbyCss || []) : [])];
  for (const href of sheets) {
    if (document.querySelector(`link[href="${href}"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
  return key;
}

/* ---------- 大廳骨架：執行期換成版型自己的版面 ----------
   korean／forest 的大廳結構跟 Classic 不一樣（照片被設計進版面／
   照片就是整個畫面），光換 data-template 只會換到顏色與字體。

   /w/{slug}/ 由 firebase.json rewrite 到 index.html，Hosting 不可能知道
   這組新人的版型，所以只能在這裡補：抓版型自己的那份 HTML，
   把 <body> 的內容整個換掉，之後才載入 common.js 與 index.js
   —— 它們是在這一步之後才注入的，所以拿到的已經是新骨架。

   ・build-og 產過的站台，命中的檔案本來就是對的（body 上有 data-lobby），
     這時直接跳過，連 fetch 都不發
   ・抓不到（網路不穩、檔案被改名）就維持 Classic 骨架 —— 顏色與字體
     還是對的，只是版面不是專屬的，不會變成空白頁
   ・模板裡的 <script> 用 innerHTML 塞進來不會執行，所以模板不放邏輯，
     照片一律由 common.js 的 applyLobbyPhotos() 依 data-photo 處理 */
async function swapLobbyLayout(templateKey) {
  const file = TEMPLATES[templateKey].lobbyFile;
  if (!file) return;                                   /* Classic 系列不用換 */
  if (document.body.dataset.lobby === templateKey) return;  /* 已經是對的骨架 */

  try {
    const res = await fetch(`/${file}`);
    if (!res.ok) return;
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    if (!doc.body || !doc.body.children.length) return;
    document.body.innerHTML = doc.body.innerHTML;
    document.body.dataset.lobby = templateKey;
  } catch {
    /* 維持 Classic 骨架 */
  }
}

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
  /* 錯誤畫面本身就是「最終狀態」，遮罩該收掉。
     body.innerHTML 整個換掉會順手把 .boot-veil 也拿走，
     旗標則讓任何吃 [data-site-ready] 的規則一起生效。 */
  document.documentElement.dataset.siteReady = '1';
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

/* ---------- 站台素材 ----------
   public/assets/{slug}/manifest.json 由 scripts/sync-assets.js 產生。
   沒有這個檔案（還沒放素材）就回傳空物件，頁面照樣能跑。 */
async function loadAssets(slug) {
  try {
    const res = await fetch(`/assets/${slug}/manifest.json`);
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

  /* 素材清單只需要 slug，而 slug 從網址就讀得到 —— 完全不必等 Firestore。
     以前它排在兩次 getDoc 之後，等於白白多串一個來回在關鍵路徑上。
     這裡先發動、下面再 await，讓它跟 Firestore 的查詢平行跑。
     （catch 掛在發動的當下而不是等到 await：先發動的 promise 若在
       await 之前就 reject，會變成 unhandledrejection） */
  const assetsPromise = loadAssets(loc.slug).catch(() => ({}));

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

  /* 版型：越早套上，換色閃一下的時間越短，所以排在讀素材之前 */
  const template = applyTemplate(site.template, pageKey === 'lobby');

  /* 大廳再換一次骨架（korean／forest 的版面結構跟 Classic 不同）。
     一定要排在載入 common.js／index.js 之前 —— 那兩支一載入就開始
     抓 DOM，骨架換晚了它們會綁到舊節點上。 */
  if (pageKey === 'lobby') await swapLobbyLayout(template);

  const assets = await assetsPromise;

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
    template,
    data: site,
    pages: PAGES,
    templates: TEMPLATES,
    adminFeatures: ADMIN_FEATURES,
    isEnabled,
    isPageOn,
    /* 沒開的功能要在後台掛鎖頭（可加購）還是整顆收起來（還沒開放）；
       只有後台用得到，賓客那一側兩種都一樣是「這頁不存在」 */
    isUnreleased: (key) => UNRELEASED_FEATURES.has(key),
    /* 產生站內連結：pathFor('cake') → /w/{slug}/cake
       出席回覆的網址片段是 invitation，不是它的開關代號 rsvp */
    pathFor(key) {
      return key === 'lobby' ? `/w/${loc.slug}/` : `/w/${loc.slug}/${pathOf(key)}`;
    },
    fileToKey: FILE_TO_KEY,
  };
  window.WED = buildWed(site);

  /* 給 common.js 用的資料模型。
     common.js 是被 loadScript() 注入的**傳統 script**，不是 module，
     所以 import 不動 wed-model.js —— 由這裡代為掛上去，
     fillTemplates() 才能跟建置期共用同一套 token 邏輯。 */
  window.WEDMODEL = { tplValue, swapTokens, hashtagList };

  /* hero 的名字是中文還是英文：korean 的 hero 字級要分兩套（見 css/lobby-korean.css）。
     Cormorant 吃 font-size-adjust，同字級下拉丁字會被放大約 17%，
     一套字級不可能同時餵飽中文名字與英文名字。
     這一行要排在載入 common.js 之前 —— fillTemplates() 一跑，名字就填進去了。 */
  document.body.dataset.heroName = window.WED.heroNameLang;

  document.title = window.WED.couple
    ? `${PAGES[pageKey].label}｜${window.WED.couple} 婚禮`
    : PAGES[pageKey].label;

  /* 資料到齊了才**執行**頁面 JS。
     下載本身已經由 HTML 的 <link rel="preload" as="script"> 提前了，
     所以這兩行多半是直接從快取拿，不是兩個新的來回。
     順序仍然要維持：頁面 JS 一載入就會讀 common.js 的全域函式。 */
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
