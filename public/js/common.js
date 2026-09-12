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
  /* 喜餅：現場領取＝婚宴當天在會場拿；自行領取＝另外跟新人約時間拿。
     兩件事在台灣的婚禮是分開的，合成一個選項的話新人分不出要準備幾盒在會場。 */
  gift: [
    ['pickup', '現場領取'],
    ['self',   '自行領取'],
    ['mail',   '郵寄'],
  ],
};

/* 「郵寄」這個選項可以由新人在後台整個關掉（rsvpMailEnabled）——
   不寄送喜帖喜餅的新人，不該讓賓客填了地址才發現沒有這回事。
   關掉時喜帖的「紙本要怎麼給」與喜餅的「領取方式」都少一個郵寄。 */
const MAIL_OPTION_GROUPS = ['cardDelivery', 'gift'];
window.RSVP_OPTIONS = RSVP_OPTIONS;

/* 某一題現在真正要給賓客看的選項。
   目前只有一條規則：新人關掉郵寄時，兩題各少一個「郵寄」。
   表單（rsvp-form.js）讀這一份而不是 RSVP_OPTIONS，
   已經送出的回覆仍然靠 rsvpLabel() 翻譯得回來（選項只是不再出現）。 */
function rsvpOptions(group){
  const all = RSVP_OPTIONS[group] || [];
  if(!MAIL_OPTION_GROUPS.includes(group)) return all;
  return rsvpConfig().allowMail ? all : all.filter(([v]) => v !== 'mail');
}

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
    /* 郵寄：沒設定過就視為提供（舊站台的選項不會突然少一個） */
    allowMail:   on(d.rsvpMailEnabled),
    askMessage:  on(d.rsvpAskMessage),   // 想對新人說的話
    contacts,                            // 要問哪幾種聯絡方式
    /* 照片集：現在是首頁 Explore 的最後一張卡（本來在邀請函上）。
       欄位沿用 rsvpShowGallery —— 已經關掉的站台不會因為搬家又打開。
       rsvpShowStory 則整個不再讀：出席表單那一頁已經不放兩人的故事，
       那是首頁的事，有寫就出現。 */
    showGallery: on(d.rsvpShowGallery),
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

/* ============================================================
   婚禮的活動（sites.events）
   ------------------------------------------------------------
   台灣的婚禮常常不只一場：「文訂＋迎娶＋婚宴」「證婚＋婚宴＋派對」
   都是常見組合，而且**每一場有自己的地點**。

   這一整段只做讀取，不寫入任何東西。核心是 weddingEvents()：

     ・站台有 events[]        → 用它
     ・沒有（＝所有既有站台） → 用站台既有的 eventDate／venueName…
                              合成一個虛擬活動，**不寫回資料庫**

   所以既有站台在這裡永遠是「一個活動的婚禮」，前台照原本的路徑走，
   畫面一個字都不會變。新人第一次在後台按「儲存婚禮流程」，
   才把那一筆真的寫進 events[] —— 那是使用者主動觸發的 migration。

   兩層開關（和 guestTagsEnabled 同一套）：
     ・multiEventEnabled（站台文件，新人改不動）＝後台看不看得到「婚禮流程」
     ・events.length     ＝前台實際上有幾個活動
   ★ 旗標打開不等於前台變複雜：只要新人只留一個活動，
     大廳與邀請函仍然是單一活動的樣子。
============================================================ */

const EVENT_MAX = 10;              // 規則也擋同一個數字
const EVENT_QUESTION_MAX = 3;      // 一個活動最多幾個追加題目
const EVENT_OPT_MAX = 4;           // 一個單選題最多幾個選項
const EVENT_ID_MAX = 24;           // 規則也擋同一個長度
const EVENT_NAME_MAX = 30;

/* 合成出來的那一個活動的 id。存不進資料庫，只在記憶體裡代表
   「這場婚禮只有一個活動」，讓下游不必到處寫 if (沒有 events) */
const MAIN_EVENT_ID = 'main';

/* ============================================================
   活動型別
   ------------------------------------------------------------
   新人在後台選了型別，名稱、英文 kicker、要不要 RSVP、要問哪幾題
   就一次帶好 —— 「證婚 ＋ 婚宴」這種最常見的組合，
   新人一個勾都不用動，預設就是對的。

   name 一律**兩個字**：大廳資訊卡的左欄只有 4.5em 寬（見 css/index.css
   的 .info-row），名稱太長會擠壞那一欄。

   文訂與迎娶預設 requiresRsvp:false —— 它們會出現在婚禮流程與邀請函上，
   但不會出現在賓客的回覆表單裡（那兩場通常只有兩家人）。
============================================================ */
const EVENT_TYPES = {
  engagement: { name:'文訂', nameEn:'ENGAGEMENT',        requiresRsvp:false,
                ask:{ count:false, meal:false, childSeat:false, diet:false } },
  fetching:   { name:'迎娶', nameEn:'FETCHING',          requiresRsvp:false,
                ask:{ count:false, meal:false, childSeat:false, diet:false } },
  ceremony:   { name:'證婚', nameEn:'CEREMONY',          requiresRsvp:true,
                ask:{ count:true,  meal:false, childSeat:false, diet:false } },
  /* 婚宴是唯一四題全開的：要排桌，所以人數、葷素、兒童椅、飲食都要問 */
  reception:  { name:'婚宴', nameEn:'WEDDING RECEPTION', requiresRsvp:true,
                ask:{ count:true,  meal:true,  childSeat:true,  diet:true  } },
  afterparty: { name:'派對', nameEn:'AFTER PARTY',       requiresRsvp:true,
                ask:{ count:true,  meal:false, childSeat:false, diet:false } },
  custom:     { name:'',     nameEn:'',                  requiresRsvp:true,
                ask:{ count:true,  meal:false, childSeat:false, diet:false } },
};
const EVENT_TYPE_KEYS = Object.keys(EVENT_TYPES);

function eventTypeDefaults(type){
  return EVENT_TYPES[type] || EVENT_TYPES.custom;
}

/* ---------- 清洗 ----------
   規則只擋得了「events 是 list、筆數 ≤10」，裡面每一欄的長度與值域
   規則語言看不到（和 schedule、guestTags 同一個限制）。
   所以讀進來的每一筆都要在這裡切乾淨 —— 沒有 id 或沒有名字的直接略過，
   畫面才不會出現一張空白的活動卡。 */
function clampStr(v, max){
  return String(v == null ? '' : v).trim().slice(0, max);
}

/* 追加題目：型態只有 choice 與 text 兩種，其餘一律丟掉。
   ★ opts 是「map 的陣列」不是「陣列的陣列」——
     Firestore 不接受巢狀陣列，而且是 SDK 在送出前就同步丟例外，
     根本走不到規則（quizVotes.picks 踩過同一個坑）。 */
function normalizeQuestion(raw){
  if(!raw || typeof raw !== 'object') return null;
  const id = clampStr(raw.id, 40);
  const label = clampStr(raw.label, 30);
  if(!id || !label) return null;

  const kind = raw.kind === 'text' ? 'text' : 'choice';
  if(kind === 'text'){
    return { id, kind, label, hint: clampStr(raw.hint, 30), opts: [] };
  }
  const opts = (Array.isArray(raw.opts) ? raw.opts : [])
    .map(o => (o && typeof o === 'object'
      ? { id: clampStr(o.id, 40), label: clampStr(o.label, 20) }
      : null))
    .filter(o => o && o.id && o.label)
    .slice(0, EVENT_OPT_MAX);
  if(!opts.length) return null;      /* 單選題沒有選項＝壞掉的題目，不要畫出來 */
  return { id, kind, label, hint:'', opts };
}

function normalizeEvent(raw){
  if(!raw || typeof raw !== 'object') return null;
  const id = clampStr(raw.id, EVENT_ID_MAX);
  if(!id) return null;

  const type = EVENT_TYPE_KEYS.includes(raw.type) ? raw.type : 'custom';
  const def = EVENT_TYPES[type];
  /* 名稱留白時退回型別的預設名；custom 沒有預設名，那就真的是壞資料 */
  const name = clampStr(raw.name, EVENT_NAME_MAX) || def.name;
  if(!name) return null;

  /* ask* 沒設定過就用型別的預設 —— 欄位是後來才加的，
     早期存進去的活動不會因為少了這幾個布林就整題消失 */
  const ask = (key) => (typeof raw['ask' + key] === 'boolean'
    ? raw['ask' + key]
    : def.ask[key.charAt(0).toLowerCase() + key.slice(1)]);

  return {
    id, type, name,
    nameEn:    clampStr(raw.nameEn, EVENT_NAME_MAX) || def.nameEn,
    /* 牆上日期／時間，不是 Timestamp（見 SPEC 第 2 節）。
       格式不對的一律當成沒填，畫面就不顯示那一段 */
    date:      /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : '',
    startTime: /^\d{2}:\d{2}$/.test(raw.startTime) ? raw.startTime : '',
    endTime:   /^\d{2}:\d{2}$/.test(raw.endTime) ? raw.endTime : '',
    venueName: clampStr(raw.venueName, 80),
    address:   clampStr(raw.address, 200),
    /* 只收 http(s)；留白時由呼叫端用 address 去組 Google Maps（既有做法） */
    mapUrl:    /^https?:\/\//i.test(raw.mapUrl) ? clampStr(raw.mapUrl, 500) : '',
    desc:      clampStr(raw.desc, 300),
    requiresRsvp: typeof raw.requiresRsvp === 'boolean' ? raw.requiresRsvp
                                                       : def.requiresRsvp,
    askCount:     ask('Count'),
    askMeal:      ask('Meal'),
    askChildSeat: ask('ChildSeat'),
    askDiet:      ask('Diet'),
    questions: (Array.isArray(raw.questions) ? raw.questions : [])
      .map(normalizeQuestion).filter(Boolean).slice(0, EVENT_QUESTION_MAX),
  };
}

/* ---------- 合成單一活動 ----------
   既有站台（沒有 events）在系統裡就是「一個婚宴」。
   日期與時間取自 WED.dateISO —— 它已經是用婚禮當地時區算好的
   YYYY-MM-DDTHH:mm:00+08:00，切開就是牆上日期與牆上時間，
   不必在這裡再處理一次時區。 */
function mainEventFromSite(){
  const W = window.WED || {};
  const iso = typeof W.dateISO === 'string' ? W.dateISO : '';
  const def = EVENT_TYPES.reception;
  return {
    id: MAIN_EVENT_ID,
    type: 'reception',
    name: def.name,
    nameEn: def.nameEn,
    date:      iso.slice(0, 10),
    startTime: iso.slice(11, 16),
    endTime:   '',
    venueName: W.venue || '',
    address:   W.address || '',
    mapUrl:    /^https?:\/\//i.test(W.mapUrl) ? W.mapUrl : '',
    desc: '',
    requiresRsvp: true,
    askCount: true, askMeal: true, askChildSeat: true, askDiet: true,
    questions: [],
  };
}

/* ---------- 活動的日期時間 ----------
   邀請函（10 / 18　SAT　14:00）與大廳（10/18（六）14:00）各自組合，
   所以這裡只把零件拆出來，不決定怎麼排。

   ev.date 是牆上日期字串，用 T12:00:00Z 取星期幾 ——
   跨時區都落在同一天，不會因為觀看者在哪裡而差一天。 */
const EVENT_WD_EN = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const EVENT_WD_TW = ['日','一','二','三','四','五','六'];

function eventWhen(ev){
  const out = { md:'', wdEn:'', wdTw:'', time:'', range:'' };
  if(!ev) return out;
  if(ev.date){
    const [y, m, d] = ev.date.split('-');
    out.md = `${m}/${d}`;
    const dt = new Date(`${ev.date}T12:00:00Z`);
    if(!isNaN(dt.getTime())){
      out.wdEn = EVENT_WD_EN[dt.getUTCDay()];
      out.wdTw = EVENT_WD_TW[dt.getUTCDay()];
    }
    out.year = y;
  }
  out.time = ev.startTime || '';
  out.range = ev.endTime && ev.startTime
    ? `${ev.startTime}–${ev.endTime}` : (ev.startTime || '');
  return out;
}

/* 地圖連結：新人沒填就用地址（沒地址就用場地名）去組 Google Maps。
   和 invitation.js 既有的 renderVenue() 是同一套規則，收斂成一份。 */
function eventMapUrl(ev){
  if(!ev) return '';
  if(/^https?:\/\//i.test(ev.mapUrl)) return ev.mapUrl;
  const q = ev.address || ev.venueName;
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : '';
}

/* 後台「婚禮流程」要不要出現。純粹是後台的門檻，不影響前台怎麼畫 */
function multiEventOn(){
  return !!(window.SITE && window.SITE.data
            && window.SITE.data.multiEventEnabled === true);
}

/* 這場婚禮有哪些活動（含不需要回覆的文訂、迎娶）。
   永遠至少回傳一筆 —— 呼叫端不必再處理「一個活動都沒有」 */
function weddingEvents(){
  const raw = (window.SITE && window.SITE.data && window.SITE.data.events) || null;
  if(!Array.isArray(raw)) return [mainEventFromSite()];

  const seen = new Set();
  const list = raw.map(normalizeEvent).filter(ev => {
    /* 同一個 id 出現兩次的話只留第一筆：回覆是用 id 對回來的，
       重複的 id 會讓兩張卡片共用同一個答案 */
    if(!ev || seen.has(ev.id)) return false;
    seen.add(ev.id);
    return true;
  }).slice(0, EVENT_MAX);

  return list.length ? list : [mainEventFromSite()];
}

/* 賓客要回覆的那幾個（文訂、迎娶不在裡面）。
   可能是空陣列 —— 代表這場婚禮不需要任何人回覆，
   邀請函要整塊收起來而不是畫一張空表單。 */
function rsvpEvents(){
  return weddingEvents().filter(ev => ev.requiresRsvp);
}

function findEvent(id){
  return weddingEvents().find(ev => ev.id === id) || null;
}

/* ---------- 主要活動 ----------
   回覆的頂層欄位（attending／guestCount／mealMeat／mealVeg／childSeat）
   永遠代表這一個活動。排桌、收禮、匯出 CSV、後台既有的統計圖表
   讀的都是頂層那一份，所以它們完全不必知道多活動這件事存在。

   挑選順序：婚宴 → 第一個要回覆的 → 第一個。
   婚宴排第一是因為它才是要排桌、要算人數的那一場。 */
function primaryEvent(){
  const list = weddingEvents();
  return list.find(ev => ev.type === 'reception')
      || list.find(ev => ev.requiresRsvp)
      || list[0];
}

function primaryEventId(){
  const ev = primaryEvent();
  return ev ? ev.id : MAIN_EVENT_ID;
}

/* ---------- 一筆回覆對某個活動的回應 ----------
   回傳 null 代表「這個活動沒有回應」——
   和 going:false（明確說不來）是兩件事，後台統計的「待回覆」靠的就是這個區別。

   舊回覆（沒有 events）只答得出主要活動那一格，其餘一律 null。
   這就是相容性的全部：不需要 migration，不需要改任何一筆既有資料。 */
function eventResponse(r, eventId){
  if(!r || !eventId) return null;

  const map = r.events && typeof r.events === 'object' && !Array.isArray(r.events)
    ? r.events : null;
  const hit = map ? map[eventId] : null;
  if(hit && typeof hit === 'object'){
    return {
      going:  hit.going === true,
      count:  Math.max(0, Number(hit.count) || 0),
      veg:    Math.max(0, Number(hit.veg) || 0),
      note:   typeof hit.note === 'string' ? hit.note : '',
      answers: hit.answers && typeof hit.answers === 'object' ? hit.answers : {},
      tentative: false,
      legacy: false,
    };
  }

  /* 沒有 events，或這個活動不在裡面 → 只有主要活動答得出來。
     r.primaryEventId 是送出當下記的；沒有就用現在算出來的主要活動
     （既有站台永遠是 'main'）。 */
  const primary = r.primaryEventId || primaryEventId();
  if(eventId !== primary) return null;

  const going = r.attending === true;
  return {
    going,
    count: going ? Math.max(1, Number(r.guestCount) || 1) : 0,
    veg:   going ? Math.max(0, Number(r.mealVeg) || 0) : 0,
    note:  '',
    answers: {},
    /* 「視情況而定」在多活動的卡片上沒有這個選項，只有舊回覆會帶 */
    tentative: r.tentative === true,
    legacy: true,
  };
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
  _seating:[], _seatingImages:[], _blessings:[], _explore:[], _dressImages:[],
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
  /* Dress Code 的參考圖（整段 data URL）。只有大廳與後台需要，
     所以和囍卡、展品一樣不放進 _subscribe()，各頁自己叫用 */
  subscribeDressImages(){ this._lazySub('dressImages', 'dressImages', 'order'); },
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
  getDressImages()   { return this._dressImages; },
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

  /* ===== 一個活動的出席統計 =====
     多活動的重點就是這個：**每個活動各自算 headcount**。
     婚宴 126 人不代表證婚 126 人，也不代表派對 126 人。

     分母是「總回覆筆數」，三個桶子加起來一定等於它：
       yes     這個活動明確說會來
       no      這個活動明確說不來
       pending 還沒回答這個活動
               —— 包含兩種人：新活動加上去之前就回覆過的（舊資料），
                  以及舊表單選「視情況而定」的那些
     ★ 「沒回答」和「說不來」是兩件事，不能合併成一個數字：
       新人看到「待回覆 21」才知道還要去催，看到「不出席 21」則會直接放棄。

     heads／veg 只算會來的那些，單位是人（不是筆）。 */
  getEventStats(eventId){
    const out = { total: this._rsvps.length, yes:0, no:0, pending:0, heads:0, veg:0 };
    this._rsvps.forEach(r => {
      const res = eventResponse(r, eventId);
      if(!res || res.tentative){ out.pending++; return; }
      if(!res.going){ out.no++; return; }
      out.yes++;
      out.heads += res.count;
      out.veg   += res.veg;
    });
    return out;
  },

  /* 後台「各活動出席統計」那張表要的整份資料。
     只有需要回覆的活動才進得來 —— 文訂、迎娶沒有人要回覆，
     列進去只會多兩排全是 0 的數字。 */
  getEventStatsTable(){
    return rsvpEvents().map(ev => ({ event: ev, ...this.getEventStats(ev.id) }));
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
   文字樣板：把頁面上的空載體填上這組新人的資料
   ------------------------------------------------------------
   HTML 裡的寫法是**空的載體**，不是 {{couple}}：

     <span data-tpl="couple"></span>                    文字
     <textarea data-tpl-placeholder="親愛的 {{couple}}…">  屬性

   為什麼不直接寫 {{couple}}：JS 跑完之前賓客會真的看到那四個
   大括號，看起來就是一個壞掉的網站。空載體最壞只會是「空白」。
   預產過的頁面連空白都沒有 —— build-og 已經先填好了（見 wed-model.js）。

   屬性型的樣板字串收在 data-tpl-* 裡而不是屬性本身，
   所以大括號不會被瀏覽器渲染出來給人看到。

   token 的取值與代換一律走 window.WEDMODEL（＝ js/wed-model.js），
   跟 scripts/build-og.js 建置期用的是同一份邏輯，兩邊算出來的字
   必定相同，才不會「名字閃一下換成另一個名字」。
============================================================ */

/* 舊寫法（文字節點與屬性裡直接寫 {{couple}}）的相容處理。
   新頁面一律用 data-tpl，但既有的頁面或第三方片段漏網時，
   這一道仍然會把它換掉，不會讓大括號留在畫面上。 */
const TPL_ATTRS = ['placeholder', 'alt', 'title', 'content', 'aria-label'];

/* 婚禮 hashtag：實作在 wed-model.js，這裡只是給各頁 JS 的捷徑
   （index.js 的 lobbyTags、各頁 footer 都在用） */
function hashtagList(){
  return window.WEDMODEL.hashtagList(window.WED || {});
}

function fillTemplates(root){
  const W = window.WED || {};
  const M = window.WEDMODEL;
  const swap = (text) => M.swapTokens(text, W);

  const scope = root || document;
  /* scope 自己也可能是載體（例如 fillTemplates(someSpan)），
     querySelectorAll 只往下找，所以要另外把它算進來 */
  const self = scope.nodeType === 1 ? [scope] : [];

  /* ---- 文字載體：<span data-tpl="couple"></span> ---- */
  for(const el of [...self, ...scope.querySelectorAll('[data-tpl]')]){
    if(!el.dataset || !el.dataset.tpl) continue;
    el.textContent = M.tplValue(W, el.dataset.tpl);
  }

  /* ---- 屬性載體：data-tpl-placeholder="親愛的 {{couple}}…" ---- */
  for(const el of [...self, ...scope.querySelectorAll('*')]){
    if(!el.dataset) continue;
    for(const [key, tpl] of Object.entries(el.dataset)){
      /* data-tpl-aria-label → dataset.tplAriaLabel，要換回帶連字號的屬性名 */
      if(key === 'tpl' || !key.startsWith('tpl')) continue;
      const attr = key.slice(3).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
        .replace(/^-/, '');
      if(attr) el.setAttribute(attr, swap(tpl));
    }
  }

  /* ---- 相容：文字節點裡的 {{couple}} ---- */
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const hits = [];
  while(walker.nextNode()){
    if(walker.currentNode.nodeValue.includes('{{')) hits.push(walker.currentNode);
  }
  hits.forEach(n => { n.nodeValue = swap(n.nodeValue); });

  /* ---- 相容：屬性裡的 {{couple}} ---- */
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
/* 沒有 ✕ 與 ＋：那兩個在視窗裡會被讀成「關閉」與「新增」，
   而這是賓客的專屬記號，不該長得像一顆按鈕 */
const ICONS = ['✦','✧','◇','◈','○','◎','△','▽','□','◻','∞','♢','⬦','❖'];
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

   ★ 預設是**關著**的：賓客先進大廳，門口不擋人。
     絕大多數賓客只是想看看時間地點、找自己的桌次，
     這些事一件都不需要名字；先擋一道「輸入你的名字」，
     是把還沒決定要不要留下的人擋在門外。
     真正需要名字的動作（寫祝福、投一封信、送甜點）改成在
     **按下送出的那一刻**才用 ensureUser() 問，問完就記起來。

   ・想回到「先報上名來才進得去」的站台：把 entryLoginEnabled 設成 true
     （scripts/set-pages.js --entry-login on）。那時大廳照舊出現 gate，
     子頁也照舊會把沒報到的賓客請回大廳。
============================================================ */
function entryLoginOn(){
  return !!(window.WED && window.WED.entryLogin === true);
}

/* 子場景：沒登入就丟回大廳
   —— 只有「入場登入開著」的站台才有這回事。預設的站台沒有 gate 可以報到，
   把賓客彈回大廳只會讓祝福牆、抽卡這些頁面變成誰都進不去的死路。 */
function requireUser(){
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
   已經留過名字（大廳報到過，或之前在別頁填過）→ 直接沿用，不再打擾。
   還沒留過 → 在真的要送出的那一刻才問，填過一次就存進 localStorage。

   why：這一句話是「降低門檻」的實作重點 ——
        問名字的時機從「進門」挪到「你正要做一件需要署名的事」，
        賓客這時已經知道自己為什麼要留名字，願意填的比例完全不同。

   reason：這次為什麼需要名字（會印在視窗上），例如「讓新人知道這份祝福是誰寫的」。
   回傳 Promise<user|null>，null＝賓客按了「再等等」（呼叫端就別送出）。
============================================================ */
function ensureUser(reason){
  if(LS.get('user', null)) return Promise.resolve(me_user);
  return askName(reason);
}

/* ============================================================
   用 Google 帳號帶出名字
   ------------------------------------------------------------
   賓客一進站就已經有一個匿名帳號（site-context.js 自動登入的），
   抽卡收藏就綁在那個 uid 上。所以這裡先用 linkWithPopup()
   **把 Google 接到現在這個匿名帳號上**，uid 不變、收藏不會消失。
   只有在這組 Google 已經有自己的帳號時（換手機、之前登入過）才退回
   signInWithPopup()，那是真的換一個身分，本來就該換 uid。
   回傳 displayName（沒有就回空字串）；失敗會 throw，由呼叫端處理。
============================================================ */
async function signInWithGoogleName(){
  const { auth, signInWithPopup, linkWithPopup, GoogleAuthProvider } = window.fb;
  const provider = new GoogleAuthProvider();
  const cur = auth.currentUser;
  let cred;
  if(cur && cur.isAnonymous && linkWithPopup){
    try{
      cred = await linkWithPopup(cur, provider);
    }catch(e){
      /* 這組 Google 已經有自己的帳號了：換過去，不再硬接 */
      if(e && (e.code === 'auth/credential-already-in-use'
            || e.code === 'auth/email-already-in-use'
            || e.code === 'auth/provider-already-linked')){
        cred = await signInWithPopup(auth, provider);
      }else{
        throw e;
      }
    }
  }else{
    cred = await signInWithPopup(auth, provider);
  }
  return (cred && cred.user && cred.user.displayName) || '';
}

/* ============================================================
   問名字的底部視窗（bottom sheet）
   ------------------------------------------------------------
   ★ 這個視窗**不是**把畫面整個蓋掉的那種對話框。三件事是刻意的：

   1. 看得到後面：沒有整片壓黑的遮罩，只在底部鋪一層很淡的漸層，
      讓卡片跟內容分得開而已。賓客剛剛在看的祝福牆、蛋糕櫃
      還在原地，不會有「我怎麼突然被帶到另一個畫面」的斷裂感。
   2. 固定在下方：手機貼齊螢幕底（拇指構得到、鍵盤跳出來也不會擋住輸入框），
      桌機也放在下緣置中。上半部的閱讀區一律不動。
   3. 不鎖畫面：底下照樣捲得動、點得到。賓客可以先滑上去看看
      自己在留言給誰，再回來填名字；不想填就按「再等等」或 Esc。

   reason＝這次為什麼需要名字，直接印在標題底下（見 ensureUser()）。
============================================================ */
const ASK_REASON_DEFAULT = '讓新人知道，這份心意來自你';

function askName(reason){
  return new Promise(resolve => {
    /* 同時只留一個：連點兩次送出不會疊出兩張卡片 */
    document.querySelector('.ask-name')?.remove();

    let icon = ICONS[Math.floor(Math.random() * ICONS.length)];

    const sheet = document.createElement('div');
    sheet.className = 'ask-name id-sheet';
    sheet.setAttribute('role', 'dialog');
    /* aria-modal="false"：底下的內容沒有被關起來，讀屏也該讀得到 */
    sheet.setAttribute('aria-modal', 'false');
    sheet.setAttribute('aria-label', '留下你的名字');
    sheet.innerHTML = `
      <div class="id-scrim" aria-hidden="true"></div>
      <div class="id-card">
        <button class="id-close" type="button" data-act="cancel" aria-label="關閉">✕</button>
        <div class="id-head">
          <h3>留個名字吧</h3>
          <p class="id-why"></p>
        </div>
        <div class="id-mark">
          <span class="id-mark-lab">你的記號</span>
          <span class="ask-icon" data-act="reroll" role="button" tabindex="0"
                aria-label="換一個專屬記號"></span>
          <b class="id-reroll" data-act="reroll" role="button" tabindex="0">換一個</b>
        </div>
        <div class="id-row">
          <input class="ask-input" type="text" maxlength="12" placeholder="請輸入你的名字"
                 autocomplete="nickname" enterkeyhint="done" aria-label="你的名字">
          <button class="btn" type="button" data-act="ok">確認</button>
        </div>
        <div class="id-sep"><span>或</span></div>
        <button class="btn btn-google id-google" type="button" data-act="google">
          <svg viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.61z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.96 10.71A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.33z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"/>
          </svg>
          <span>使用 Google 登入</span>
        </button>
      </div>`;
    document.body.appendChild(sheet);

    const iconEl  = sheet.querySelector('.ask-icon');
    const input   = sheet.querySelector('.ask-input');
    const whyEl   = sheet.querySelector('.id-why');
    const gBtn    = sheet.querySelector('.id-google');
    iconEl.textContent = icon;
    whyEl.textContent  = reason || ASK_REASON_DEFAULT;

    /* 右下角那顆 BGM 浮動鈕本來就在同一塊區域，讓它先讓開 */
    document.body.classList.add('id-sheet-on');
    /* 沒有 Firebase（離線預覽、SDK 掛了）就不留一顆按了沒反應的按鈕；
       只剩一條路的時候，「或」那條分隔線也跟著收掉 */
    if(!(window.fb && window.fb.auth)){
      gBtn.remove();
      sheet.querySelector('.id-sep').remove();
    }

    let done = false;
    const close = (user) => {
      if(done) return;
      done = true;
      document.body.classList.remove('id-sheet-on');
      document.removeEventListener('keydown', onKey, true);
      sheet.classList.add('closing');
      /* 等收起來的動畫跑完再拿掉；呼叫端不必等這 200ms */
      setTimeout(() => sheet.remove(), 200);
      resolve(user);
    };

    const submit = () => {
      const name = input.value.trim();
      if(!name){
        input.focus();
        sheet.querySelector('.id-row').classList.remove('shake');
        void sheet.offsetWidth;
        sheet.querySelector('.id-row').classList.add('shake');
        return;
      }
      saveUser({ name, icon });
      /* 有名字之後導覽列那塊 User 才要長出來（原本是整塊不畫的） */
      refreshSiteNav();
      close(me_user);
    };

    const reroll = () => {
      icon = ICONS[Math.floor(Math.random() * ICONS.length)];
      iconEl.textContent = icon;
    };

    const google = async () => {
      gBtn.disabled = true;
      try{
        const dn = await signInWithGoogleName();
        if(dn){
          input.value = dn.slice(0, 12);   // input maxlength=12，超過裁掉
          submit();
          return;
        }
        /* Google 帳號沒有顯示名稱：不能白登入一場，把游標交回輸入框 */
        input.focus();
      }catch(e){
        console.warn('[askName] Google 登入失敗或取消：', e);
      }
      gBtn.disabled = false;
    };

    sheet.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if(act === 'reroll')      reroll();
      else if(act === 'ok')     submit();
      else if(act === 'google') google();
      else if(act === 'cancel') close(null);
    });
    /* 記號那兩處是 div／b，鍵盤要按得動才算數 */
    sheet.addEventListener('keydown', (e) => {
      if((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-act="reroll"]')){
        e.preventDefault(); reroll();
      }
    });
    input.addEventListener('keydown', (e) => { if(e.key === 'Enter') submit(); });

    /* Esc 收起來。用 capture 才不會被頁面上其他的 Esc 處理搶先 */
    const onKey = (e) => { if(e.key === 'Escape'){ e.stopPropagation(); close(null); } };
    document.addEventListener('keydown', onKey, true);

    /* 進場動畫跑完再搶焦點：手機上太早 focus 會讓鍵盤把動畫壓掉一半 */
    requestAnimationFrame(() => {
      sheet.classList.add('open');
      setTimeout(() => input.focus({ preventScroll:true }), 180);
    });
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

/* 開到幾個功能就把手機的導覽列收成漢堡。
   實測（375／393／360px 的 Chromium）：連結列七項要 312px，但手機
   實際分到的寬度只有 135–229px —— 新人姓名多兩個字吃掉 29px、還沒署名的
   「留下名字」比署名後的頭像多吃 32px，各自都剛好是一項的寬度。
   結果是第 4 項開始橫捲，而且不管開幾個，完整看得到的永遠只有 2–5 項。
   橫捲在這裡撐不住：捲軸是藏起來的（見 common.css 的 .nav-links），
   看不到的那幾項賓客不知道存在；連結熱區也只有 31.5px 高，放在橫捲容器裡，
   手指斜一點就被判成捲動而不是點擊。
   所以 4 項起改漢堡；3 項以內照舊橫排 —— 那時候全部看得到，漢堡只是
   多要一次點擊。桌機不受影響，永遠是橫排。 */
const NAV_DRAWER_MIN = 4;

/* 入場前（大廳的 gate、信箱的登入畫面）先不顯示導覽列 */
function setNavVisible(on){
  const nav = document.getElementById('siteNav');
  if(nav) nav.hidden = !on;
  document.body.classList.toggle('nav-off', !on);
  if(!on) closeNavDrawer({ silent:true });
}

function buildSiteNav(){
  const S = window.SITE;
  if(!S || document.getElementById('siteNav')) return;

  const couple = (window.WED && window.WED.couple) || '婚禮';
  const items = NAV_ITEMS.filter(it => S.isEnabled(it.key));
  const links = items
    .map(it => `<a class="nav-link${it.key === S.page ? ' current' : ''}" `
              + `href="${S.pathFor(it.key)}">${escapeHtml(it.label)}</a>`)
    .join('');

  /* 連結列與抽屜兩份都畫進 DOM，由 CSS 決定哪一份生效（桌機橫排、
     手機抽屜），另一份是 display:none —— 同一時間只有一份看得到、
     也只有一份進得了 tab 順序與朗讀。 */
  const useDrawer = items.length >= NAV_DRAWER_MIN;
  /* 收進抽屜之後，列上就沒有 .current 那條底線了；
     「我現在在哪一頁」要另外有人講，所以把頁名補在新人名字旁邊。 */
  const here = useDrawer ? items.find(it => it.key === S.page) : null;

  /* 還沒留過名字的訪客不該看到「朋友 ▾ / 登出（換一位賓客）」—— 他根本沒登入過。
     取而代之的是一顆很輕的「留下名字」：想主動署名的人有地方按，
     不想的人它就只是一顆字級 12 的文字鈕，不擋路也不催。 */
  const entered = !!LS.get('user', null);
  const userBox = !entered ? `
      <div class="nav-user">
        <button class="nav-signin" id="navSignInBtn" type="button">留下名字</button>
      </div>` : `
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
  nav.className = useDrawer ? 'site-nav has-drawer' : 'site-nav';
  nav.id = 'siteNav';
  nav.innerHTML = `
    <nav class="nav-inner">
      ${useDrawer ? `<button class="nav-burger" id="navBurger" type="button"
        aria-label="開啟選單" aria-expanded="false" aria-controls="navDrawer"
        ><span></span><span></span><span></span></button>` : ''}
      <a class="nav-brand" href="${S.pathFor('lobby')}">${escapeHtml(couple)}</a>
      ${here ? `<span class="nav-here">${escapeHtml(here.label)}</span>` : ''}
      <div class="nav-links">${links}</div>${userBox}
    </nav>`;
  document.body.insertBefore(nav, document.body.firstChild);
  if(useDrawer) buildNavDrawer(items);

  syncNavUser();

  /* 還沒署名的訪客：那顆「留下名字」就是同一個底部視窗，
     只是這次沒有「正在送出的東西」，所以理由寫得比較泛用 */
  const signIn = document.getElementById('navSignInBtn');
  if(signIn){
    signIn.addEventListener('click', () => askName('留下之後，寫祝福、送甜點就不用再填一次'));
  }

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

/* ---------- 手機的漢堡抽屜（功能開到 NAV_DRAWER_MIN 以上才長出來） ----------
   抽屜與遮罩掛在 body 上，不放進 .site-nav 裡面：導覽列有 backdrop-filter，
   那會讓它變成 fixed 子孫的定位基準，遮罩會被關進 52px 高的那一條裡面。 */
let navDrawerOpen = false;
let navDrawerMq   = null;

function buildNavDrawer(items){
  const S = window.SITE;
  const row = (key, label) =>
    `<a class="nav-drawer-item${key === S.page ? ' is-on' : ''}"`
    + ` href="${S.pathFor(key)}"${key === S.page ? ' aria-current="page"' : ''}`
    + `>${escapeHtml(label)}</a>`;

  const mask = document.createElement('div');
  mask.className = 'nav-drawer-mask';
  mask.id = 'navDrawerMask';

  const drawer = document.createElement('nav');
  drawer.className = 'nav-drawer';
  drawer.id = 'navDrawer';
  drawer.setAttribute('aria-label', '網站導覽');
  /* 抽屜打開時會蓋住漢堡鈕，所以自己帶一顆關得掉的 ✕（後台的側欄同理）。
     首頁擺第一個：新人名字那顆連結也在抽屜底下，這裡要有路回得去。 */
  drawer.innerHTML =
    `<button class="nav-drawer-close" id="navDrawerClose" type="button"
       aria-label="關閉選單">✕</button>`
    + row('lobby', '首頁')
    + items.map(it => row(it.key, it.label)).join('');

  document.body.appendChild(mask);
  document.body.appendChild(drawer);

  const burger = document.getElementById('navBurger');
  burger.addEventListener('click', ()=>{
    navDrawerOpen ? closeNavDrawer() : openNavDrawer();
  });
  mask.addEventListener('click', ()=> closeNavDrawer());
  drawer.querySelector('#navDrawerClose').addEventListener('click', ()=> closeNavDrawer());

  /* 轉成橫向、或在平板上把視窗拉寬，橫排會回來 —— 這時抽屜還開著就是
     一塊蓋住半個畫面、卻沒有入口可以關的東西 */
  if(!navDrawerMq){
    navDrawerMq = window.matchMedia('(max-width:720px)');
    navDrawerMq.addEventListener('change', (e)=>{
      if(!e.matches) closeNavDrawer({ silent:true });
    });
  }
}

const onNavDrawerKey = (e) => {
  if(e.key === 'Escape'){ e.stopPropagation(); closeNavDrawer(); }
};

function openNavDrawer(){
  const drawer = document.getElementById('navDrawer');
  if(!drawer || navDrawerOpen) return;
  navDrawerOpen = true;
  drawer.classList.add('is-open');
  document.getElementById('navDrawerMask').classList.add('is-on');
  const burger = document.getElementById('navBurger');
  if(burger) burger.setAttribute('aria-expanded', 'true');
  /* Esc 收起來。用 capture 才不會被頁面上其他的 Esc 處理搶先（同 askName） */
  document.addEventListener('keydown', onNavDrawerKey, true);
  document.getElementById('navDrawerClose').focus({ preventScroll:true });
}

/* silent：不是使用者自己關的（入場前收起導覽列、視窗拉寬回橫排），
   這種時候把焦點丟回漢堡鈕反而會把畫面捲回最上面 */
function closeNavDrawer(opts){
  if(!navDrawerOpen) return;
  navDrawerOpen = false;
  const drawer = document.getElementById('navDrawer');
  const mask   = document.getElementById('navDrawerMask');
  if(drawer) drawer.classList.remove('is-open');
  if(mask)   mask.classList.remove('is-on');
  document.removeEventListener('keydown', onNavDrawerKey, true);
  const burger = document.getElementById('navBurger');
  if(burger){
    burger.setAttribute('aria-expanded', 'false');
    if(!(opts && opts.silent)) burger.focus({ preventScroll:true });
  }
}

/* 從沒名字變成有名字（入場登入關著的站台，在祝福牆填完名字）時，
   整塊 User 要重新長出來 —— syncNavUser() 只改得動已經存在的節點 */
function refreshSiteNav(){
  const nav = document.getElementById('siteNav');
  if(!nav) return;                       /* 沒有導覽列的頁面（邀請函／後台）不用管 */
  const visible = !nav.hidden;
  closeNavDrawer({ silent:true });
  nav.remove();
  /* 抽屜與遮罩是 body 的子節點，不會跟著 nav 一起被拿掉 */
  document.getElementById('navDrawer')?.remove();
  document.getElementById('navDrawerMask')?.remove();
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
    /* display:none 的子樹（開場字幕期間的 #app）量不到長度，會直接 throw ——
       量不到就不做生長動畫，線稿以完成狀態顯示，跟 reduced-motion 一樣 */
    let len = 0;
    try{ len = el.getTotalLength ? el.getTotalLength() : 0; }catch{ return; }
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

/* ============================================================
   大廳的照片：把素材填進模板宣告的 [data-photo] 位置
   ------------------------------------------------------------
   模板只負責「這裡要放一張照片、叫什麼名字」，去哪拿由這裡決定。
   本來寫在 lobby-*.html 的 inline script 裡，但版型改成執行期切換之後，
   用 innerHTML 塞進來的 <script> 不會執行，所以收進來這裡。

     portrait   korean hero 的直式合照
     hero       forest hero 的滿版照
     story      forest「Our Story」照片帶
     countdown  forest「Countdown」照片帶

   優先序和 Classic 的固定背景一致：lobby → cover → Firestore 的封面；
   forest 的兩條照片帶優先用照片牆的前兩張，沒有就退回封面。
============================================================ */
function applyLobbyPhotos(){
  const slots = document.querySelectorAll('[data-photo]');
  if(!slots.length) return;

  const a = (window.SITE && window.SITE.assets) || {};
  const W = window.WED || {};
  const pick = (list, i) => {
    const it = Array.isArray(list) && list[i];
    return (it && (it.src || it)) || '';
  };
  const cover = a.lobby || a.cover || W.coverImageUrl || '';
  const map = {
    portrait:  cover,
    hero:      cover,
    story:     pick(a.gallery, 0) || cover,
    countdown: pick(a.gallery, 1) || cover,
  };

  slots.forEach(el => {
    const src = map[el.dataset.photo];
    if(!src) return;                   /* 沒素材就留著 CSS 畫的示意底 */
    el.style.backgroundImage = `url("${src}")`;
    el.classList.add('has-photo');
  });
}

/* korean 的紙質紋理：素材資料夾有 paper 才把變數寫上去，
   common.css 的 body[data-template="korean"]::after 讀這個變數 */
function applyPaperTexture(){
  const paper = (window.SITE && window.SITE.assets && window.SITE.assets.paper) || '';
  if(paper) document.body.style.setProperty('--paper', `url("${paper}")`);
}

/* ============================================================
   把畫好的圖交給使用者（抽卡的小卡、祝福信）
   ------------------------------------------------------------
   同一件事在桌機和手機上是兩種動作：

   ・桌機：<a download> —— 檔案落進下載資料夾，這是桌機上大家認得的行為。
   ・手機：下載資料夾在手機上是個很難找的地方。iOS Safari 會把 JPG 收進
     「檔案」App，相簿裡一張都不會多；Android 則是跳一條下載通知，
     然後沉進通知列。可是賓客想的是「存進相簿」，所以手機改走兩條路：
       1. 系統分享單（navigator.share 帶 files）：iOS 的「儲存影像」、
          Android 的「儲存到相簿」都在那張單子上，一下就進相簿。
       2. 分享單不吃檔案（部分 Android 瀏覽器、WebView）：把圖攤成一張
          全螢幕的 <img>，長按「儲存影像」是最後一條一定走得通的路。

   回傳一句可以直接寫給使用者的提示；畫不出來／存不下來就丟出例外，
   呼叫端自己決定要說什麼（抽卡與信的退路講法不一樣）。
============================================================ */

/* 「這是一台手機嗎」——只用來決定存圖的方式，判斷錯了最多是退回下載。
   userAgentData.mobile 準但不是每個瀏覽器都有；iOS／iPadOS 沒有，
   補上「有觸控 ＋ 主要指標是粗的」：桌機接觸控螢幕時主要指標仍是滑鼠，
   所以不會被誤判。iPad 報 Macintosh 也還是會落在這一邊（它也該存相簿）。 */
function isMobileLike(){
  const uad = navigator.userAgentData;
  if(uad && typeof uad.mobile === 'boolean' && uad.mobile) return true;
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  return coarse && (navigator.maxTouchPoints || 0) > 0;
}

/* 叫系統的分享單。回傳 true＝送出去了，false＝這台機器不支援帶檔案分享。
   使用者自己取消會丟 AbortError，交給上層分辨（那不是失敗）。 */
async function shareImageFile(blob, filename){
  if(!navigator.share || !navigator.canShare || typeof File !== 'function') return false;
  let file;
  try{ file = new File([blob], filename, { type: blob.type || 'image/jpeg' }); }
  catch{ return false; }
  if(!navigator.canShare({ files: [file] })) return false;
  await navigator.share({ files: [file] });
  return true;
}

/* 長按存圖的蓋版（分享單走不通時的退路）。
   圖放大到整個畫面，底下一行字說怎麼存 —— 只有這一句要說。 */
function openImageSaveSheet(url, alt){
  let el = document.getElementById('imgSaveSheet');
  if(!el){
    el = document.createElement('div');
    el.id = 'imgSaveSheet';
    el.className = 'imgsave';
    el.hidden = true;
    el.innerHTML = `
      <div class="imgsave-box" role="dialog" aria-modal="true" aria-label="儲存圖片">
        <img class="imgsave-img" alt="">
        <p class="imgsave-note">長按圖片 →「儲存影像」就會收進相簿</p>
        <button class="btn small ghost imgsave-close" type="button">關閉</button>
      </div>`;
    document.body.appendChild(el);
    const close = ()=>{
      el.hidden = true;
      const img = el.querySelector('.imgsave-img');
      /* 蓋版關掉才收 objectURL：圖還掛在畫面上時收掉，
         部分瀏覽器會把它變成破圖（長按就沒東西可存了） */
      const old = img.src;
      img.removeAttribute('src');
      if(old.startsWith('blob:')) URL.revokeObjectURL(old);
    };
    el.addEventListener('click', (e)=>{
      if(e.target === el || e.target.closest('.imgsave-close')) close();
    });
    document.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape' && !el.hidden) close();
    });
  }
  const img = el.querySelector('.imgsave-img');
  img.src = url;
  img.alt = alt || '儲存圖片';
  el.hidden = false;
}

/* blob →「存起來」。opts 只有提示文案，四條路各一句（都有預設值）：
     shareHint / cancelHint / pressHint / downloadHint */
async function saveImageBlob(blob, filename, opts = {}){
  if(isMobileLike()){
    try{
      if(await shareImageFile(blob, filename)){
        return opts.shareHint || '分享單開了，選「儲存影像」就會收進相簿';
      }
    }catch(err){
      if(err && err.name === 'AbortError'){
        return opts.cancelHint || '取消了，要存的話再按一次';
      }
      console.warn('[存圖] 分享失敗，改成長按存圖', err);
    }
    openImageSaveSheet(URL.createObjectURL(blob), opts.alt);
    return opts.pressHint || '長按上面那張圖 →「儲存影像」就會收進相簿';
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  /* 立刻 revoke 會讓部分瀏覽器的下載半路斷掉，晚一點再收 */
  setTimeout(()=> URL.revokeObjectURL(url), 30000);
  return opts.downloadHint || '已存成 JPG，去下載資料夾看看';
}

/* canvas → blob → 存起來。
   跨網域的圖把 canvas 染色時 toBlob 會丟 SecurityError，一路往上丟。 */
async function saveCanvasImage(canvas, filename, opts = {}){
  const blob = await new Promise((res, rej) => {
    try{
      canvas.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))),
                    opts.type || 'image/jpeg',
                    opts.quality == null ? 0.92 : opts.quality);
    }catch(err){ rej(err); }
  });
  return saveImageBlob(blob, filename, opts);
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

  /* korean／forest 版型專屬：大廳照片 ＋ 紙質紋理 ＋ 植物線稿 */
  applyLobbyPhotos();
  applyPaperTexture();
  injectTemplateDeco();
}

/* 本檔由 site-context.js 動態注入，載入時 DOM 多半已經就緒 */
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', bindCommonUI);
}else{
  bindCommonUI();
}
