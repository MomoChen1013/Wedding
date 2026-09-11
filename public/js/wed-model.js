/* ============================================================
   wed-model.js — 站台資料模型（瀏覽器與 Node 共用的唯一一份）
   ------------------------------------------------------------
   這支被兩個地方 import：

     瀏覽器  js/site-context.js  → 執行期組出 window.WED
     Node    scripts/build-og.js → 建置期把同一組值烤進靜態 HTML

   **為什麼一定要共用而不是各寫一份**：
   build-og 會在 HTML 裡先把新人的姓名、日期填好，讓賓客第一次繪製
   看到的就是成品。但如果建置期算出來的字跟執行期 fillTemplates()
   算出來的差一個字，賓客就會看到「名字閃一下換成另一個名字」——
   那只是把 {{couple}} 的閃爍換個地方發作，沒有解決任何事。
   兩邊 import 同一個 buildWed()，這件事才不可能發生。

   這裡只放**純資料**：不碰 document、不碰 window、不發請求，
   Node 才 import 得動。DOM 的部分留在 site-context.js。

   ▸ 什麼可以烤、什麼不行（firestore.rules 的 isValidSiteContentUpdate）
     新人在後台**改不動**的欄位才可以烤進靜態檔：
       groomName／brideName／groomNameEn／brideNameEn／template／
       pages／status／eventDate 的年月日
     這些只有我們用 Admin SDK 改得動，所以靜態檔不可能過期。
     反過來，新人改得動的（hashtags／schedule／dressCode／story／
     giftNote／transportPublic／coupleTitle…）一律留在執行期填，
     烤了只會在新人改完之後製造新的閃爍。
     TPL_KEYS 就是這條線的程式碼版本。
============================================================ */

/* ============================================================
   版型（sites.template）
   ------------------------------------------------------------
   一份婚禮資料，多套視覺。key 就是寫進 <body data-template> 的值，
   對得上 css/common.css 的 body[data-template="…"] 色票。

   ・**新開的站台一律是 classic**：沒有 template 欄位、值不認得、
     或是拼錯了，都會落回 classic，不會變成沒有樣式的白畫面。
   ・要換版型只能到 Firestore 改 sites/{siteId}.template ——
     它不在 firestore.rules 的可更新白名單裡，新人自己改不動，
     和 pages、entryLoginEnabled 是同一個層級的設定。
   ・賓客也沒有切換的入口：版型是我們幫這組新人挑好的樣子，
     不是賓客的偏好。

   ▸ fonts：整個版型都要用，每一頁都載。
   ▸ lobbyCss：**只有大廳要**。lobby-korean.css／lobby-forest.css 裡
     每一條規則都收在 .k-* ／ .f-* 這些大廳容器底下，對子頁一條都不生效
     —— 「給你的信」載它等於白白多擋一次首次繪製（korean 那份 10KB）。
     所以名字寫成 lobbyCss，作用域直接寫在名字上，兩端才不會各自解讀。

   兩者都由 build-og 直接寫進產出頁面的 <head>（讓瀏覽器的 preload
   scanner 掃得到），沒預產到的頁面才由 site-context.js 在執行期補上。
============================================================ */
export const TEMPLATES = {
  'classic':       { label:'Classic 香檳金' },
  'classic-blush': { label:'Classic 霧玫瑰' },
  'classic-sage':  { label:'Classic 鼠尾草綠' },
  'classic-dusk':  { label:'Classic 霧霾藍' },
  /* korean／forest 的大廳有自己的版面結構（lobbyFile）：
     由 scripts/build-og.js 產出 public/w/{slug}/index.html 時選用，
     Hosting 的靜態檔優先於 /w/** 的 rewrite 所以會命中它；
     沒跑過 build-og 的站台落回 index.html（Classic 骨架＋版型色票）。
     其餘子頁全部共用，靠色票與字體換裝。 */
  'korean':        { label:'Korean Modern', lobbyFile:'lobby-korean.html',
                     lobbyCss:['/css/lobby-korean.css'],
                     fonts:['https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=Noto+Sans+TC:wght@300;400;500&display=swap'] },
  'forest':        { label:'Forest Botanical', lobbyFile:'lobby-forest.html',
                     lobbyCss:['/css/lobby-forest.css'],
                     fonts:['https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=Noto+Sans+TC:wght@300;400;500&display=swap'] },
};
export const DEFAULT_TEMPLATE = 'classic';

/* 認不得的版型一律落回 classic。
   用 hasOwn 而不是 TEMPLATES[name] —— 'toString'、'__proto__' 這些
   原型上的屬性是 truthy，直接判斷會讓它們通過，然後寫出一個
   CSS 對不上的 data-template，整站只剩 :root 的預設值（沒有 --bg1／
   --primary），畫面會壞掉。 */
export function templateKey(name) {
  return Object.hasOwn(TEMPLATES, name) ? name : DEFAULT_TEMPLATE;
}

/* ---------- 把站台設定攤平成各頁看得懂的 WED ---------- */
const WEEKDAYS = ['日','一','二','三','四','五','六'];

export function buildWed(site) {
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

  /* 英文名（選填，由 create-site.js 寫入）：只給 hero 這種想走拉丁字的地方用。
     沒填就各自退回中文名，所以舊站台什麼都不會變。
     兩邊都有英文名才算「這組新人的 hero 是英文的」—— 只有一邊填的話，
     一行裡會出現「Ginny & 宜庭」這種中英混排，不如整行維持中文。 */
  const groomEn = (site.groomNameEn || '').trim();
  const brideEn = (site.brideNameEn || '').trim();
  const heroNameLang = groomEn && brideEn ? 'en' : 'cn';

  /* dateISO 給倒數計時用；帶上時區位移才不會被瀏覽器當成本地時間 */
  const isoOffset = ev ? tzOffsetString(ev, tz) : '';

  return {
    groom, groomCn: groom, groomEn: groomEn || groom,
    bride, brideCn: bride, brideEn: brideEn || bride,
    couple: groom && bride ? `${groom} & ${bride}` : (groom || bride),
    coupleCn: groom && bride ? `${groom} ♡ ${bride}` : (groom || bride),
    coupleEn: groomEn && brideEn ? `${groomEn} & ${brideEn}`
      : (groom && bride ? `${groom} & ${bride}` : (groom || bride)),
    /* 'en'／'cn'：寫成 <body data-hero-name>，版型的 hero 字級靠它分兩套 */
    heroNameLang,
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
    /* Dress Code 的色票：最多四個 #RRGGBB，後台切好才寫進來。
       這裡再擋一次格式 —— 資料庫裡的舊資料不保證乾淨，
       而這幾個值是直接當成 CSS 顏色用的。
       參考圖不在這裡：那是子集合 dressImages（見 DataStore）。 */
    dressCodeColors: (Array.isArray(site.dressCodeColors) ? site.dressCodeColors : [])
      .map((c) => String(c || '').trim())
      .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c))
      .slice(0, 4),
    schedule: Array.isArray(site.schedule) ? site.schedule : [],
    giftNote: site.giftNote || '',
    transportPublic: site.transportPublic || '',
    transportParking: site.transportParking || '',
    transportPublicImg: site.transportPublicImg || '',
    transportParkingImg: site.transportParkingImg || '',
    /* 入場登入（大廳那道 gate）：**預設關著**，只有明確寫 true 才擋在門口。
       賓客先進大廳，真的要留名字的那一刻才問（見 common.js 的 askName()）。
       想回到「先報上名來才進得去」的站台，把 entryLoginEnabled 設成 true。 */
    entryLogin: site.entryLoginEnabled === true,
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

/* ============================================================
   文字樣板
   ------------------------------------------------------------
   頁面上要填新人資料的地方，寫法是一個空的載體：

     <span data-tpl="couple"></span>          文字節點
     <input data-tpl-placeholder="親愛的 {{couple}}…">  屬性

   **為什麼不直接把 {{couple}} 寫在 HTML 裡**：
   那樣賓客在 JS 跑完之前會真的看到「{{couple}}」四個大括號，
   看起來就是一個壞掉的網站。改成空載體之後，最壞情況是
   「空白」——那只是還沒載完，不是壞掉。
   而預產過的頁面連空白都不會有，build-og 已經先填好了。

   屬性型的樣板字串留在 data-tpl-* 裡（不是 placeholder 本身），
   所以大括號永遠不會被瀏覽器渲染出來給人看到。
============================================================ */

/* 婚禮 hashtag：新人沒在後台填的話用這兩個當預設，
   大廳與各頁的 hashtag 都走這裡，兩邊不會一個有、一個沒有 */
export const DEFAULT_HASHTAGS = ['#我們結婚了', '#Married'];

export function hashtagList(wed) {
  const tags = ((wed && wed.hashtags) || [])
    .map((t) => String(t).trim()).filter(Boolean);
  return tags.length ? tags : DEFAULT_HASHTAGS.slice();
}

/* 一個 token 的值。key 對不上就回空字串，畫面不會露出半截樣板。 */
export function tplValue(wed, key) {
  const W = wed || {};
  if (key === 'hashtag') return hashtagList(W)[0];
  return W[key] != null ? String(W[key]) : '';
}

/* 把一段文字裡的 {{key}} 全部換掉（給 data-tpl-* 的屬性樣板用） */
export function swapTokens(text, wed) {
  return String(text).replace(/\{\{(\w+)\}\}/g, (_, k) => tplValue(wed, k));
}

/* ============================================================
   可以在建置期烤進靜態 HTML 的 token
   ------------------------------------------------------------
   判準只有一條：**新人在後台改不動的，才可以烤**
   （firestore.rules 的 isValidSiteContentUpdate 白名單）。

   在名單內  → build-og 先填好，賓客第一次繪製就是成品
   不在名單內→ 留空，等執行期 fillTemplates() 填

   刻意排除的幾個：
     hashtag  新人在後台改得動，烤了會在他改完之後閃一下
     time     eventDate 的「幾點開始」是後台改得動的
              （admin.js 只送時分，年月日沿用原值，所以 date／weekday 安全）
============================================================ */
export const BAKEABLE_TPL_KEYS = new Set([
  'couple', 'coupleCn', 'coupleEn',
  'groom', 'groomCn', 'groomEn',
  'bride', 'brideCn', 'brideEn',
  'date', 'weekday',
]);
