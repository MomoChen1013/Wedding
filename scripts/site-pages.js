/* ============================================================
   site-pages.js — 頁面開關的共用定義
   ------------------------------------------------------------
   create-site.js（建站時）與 set-pages.js（建站後修改）共用，
   兩邊才不會各寫一份、日後改了一邊忘了另一邊。

   key 對應三個地方，名稱必須一致：
     ・網址          /w/{slug}/{key}
     ・Firestore     sites/{siteId}.pages[key]
     ・安全規則      firestore.rules 的 pageOn(siteId, key)

   大廳（首頁）與新人後台（/w/{slug}/admin）永遠存在，不列在這裡。
   後台的門檻是 ownerEmails 白名單（Security Rules），不是頁面開關。
   悄悄話信箱也不在這裡 —— 它已經是後台的一個分頁，
   賓客投信的入口在祝福牆（wall），跟著祝福牆的開關走。
============================================================ */

export const OPTIONAL_PAGES = [
  'rsvp', 'wall', 'cake', 'draw', 'exhibition', 'quiz',
  'seating', 'letter',
];

/* 只在新人後台出現、沒有自己網址的功能開關。
   和上面那些頁面共用同一個 sites.pages map（新人自己改不動，
   要開要關都得經過我們），差別只在它不對應 /w/{slug}/{key}。

   seatingPlan（排桌管理）＝把 Excel 排桌搬上線的工作台。
   它產出的結果最後同步進 seating（我的桌次）那一份公開名單，
   所以兩個開關是獨立的：可以先開排桌管理慢慢排，
   婚禮當天才打開賓客那一頁。

   butler（收禮小幫手）＝婚宴當天收禮金、送禮餅的記帳工具。
   工具本身在 /butler#{token}，和站台網址、後台都分開，
   由親友拿連結加通行碼進去用；這個開關只決定
   「後台要不要長出產生連結／看統計的分頁」，以及規則放不放行寫入。 */
export const ADMIN_PAGES = ['seatingPlan', 'butler'];

/* pages map 裡會出現的所有代號（頁面 ＋ 後台功能） */
export const ALL_PAGE_KEYS = [...OPTIONAL_PAGES, ...ADMIN_PAGES];

/* 建站時沒特別指定就開這些 */
export const DEFAULT_PAGES = ['rsvp', 'wall'];

/* 給人看的名稱，印在 CLI 訊息裡 */
export const PAGE_LABELS = {
  /* 出席回覆的網址是 /w/{slug}/invitation（婚禮資訊與表單在同一頁），
     但開關代號仍然是 rsvp —— 規則與既有站台的 pages 設定都靠它 */
  rsvp:       '出席回覆（邀請函）',
  wall:       '祝福牆',
  cake:       '集氣送祝福',
  draw:       '抽卡',
  exhibition: '我們的故事',
  quiz:       '新人小測驗',
  seating:    '我的桌次',
  letter:     '給你的信',
  /* 沒有對外網址，只是新人後台的一個分頁 */
  seatingPlan: '排桌管理（後台）',
  butler:      '收禮小幫手（後台＋/butler）',
};

export function labelOf(key) {
  return PAGE_LABELS[key] ? `${key}（${PAGE_LABELS[key]}）` : key;
}

/* 決定要開哪些頁，回傳 { rsvp:true, wall:false, ... }
   values  : CLI 參數（pages / enable / disable）
   baseOn  : 沒給 --pages 時的起點（陣列）

   --pages 是「整組覆蓋」：沒列到的一律關掉。
   --enable／--disable 則是在起點上加減。 */
export function resolvePages(values, baseOn = DEFAULT_PAGES) {
  const known = new Set(ALL_PAGE_KEYS);
  const assertKnown = (key, flag) => {
    if (!known.has(key)) {
      throw new Error(`${flag} 「${key}」不是有效的頁面，可用值：${ALL_PAGE_KEYS.join('、')}`);
    }
  };

  let on;
  if (values.pages !== undefined) {
    on = new Set(values.pages.split(',').map((v) => v.trim()).filter(Boolean));
    on.forEach((k) => assertKnown(k, '--pages'));
  } else {
    on = new Set(baseOn);
  }

  (values.enable || []).forEach((k) => { assertKnown(k, '--enable'); on.add(k); });
  (values.disable || []).forEach((k) => { assertKnown(k, '--disable'); on.delete(k); });

  return Object.fromEntries(ALL_PAGE_KEYS.map((k) => [k, on.has(k)]));
}
