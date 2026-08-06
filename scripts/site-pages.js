/* ============================================================
   site-pages.js — 頁面開關的共用定義
   ------------------------------------------------------------
   create-site.js（建站時）與 set-pages.js（建站後修改）共用，
   兩邊才不會各寫一份、日後改了一邊忘了另一邊。

   key 對應三個地方，名稱必須一致：
     ・網址          /w/{slug}/{key}
     ・Firestore     sites/{siteId}.pages[key]
     ・安全規則      firestore.rules 的 pageOn(siteId, key)

   大廳（首頁）一定存在，不列在這裡。
============================================================ */

export const OPTIONAL_PAGES = [
  'rsvp', 'wall', 'cake', 'draw', 'exhibition', 'quiz', 'inbox', 'invitation',
];

/* 建站時沒特別指定就開這些 */
export const DEFAULT_PAGES = ['rsvp', 'wall'];

/* 給人看的名稱，印在 CLI 訊息裡 */
export const PAGE_LABELS = {
  rsvp:       '出席回覆',
  wall:       '祝福牆',
  cake:       '集氣送祝福',
  draw:       '抽卡',
  exhibition: '我們的故事',
  quiz:       '新人小測驗',
  inbox:      '悄悄話信箱',
  invitation: '單頁邀請函',
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
  const known = new Set(OPTIONAL_PAGES);
  const assertKnown = (key, flag) => {
    if (!known.has(key)) {
      throw new Error(`${flag} 「${key}」不是有效的頁面，可用值：${OPTIONAL_PAGES.join('、')}`);
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

  return Object.fromEntries(OPTIONAL_PAGES.map((k) => [k, on.has(k)]));
}
