/* ============================================================
   samples/config.js — 版型展示頁（/samples）的設定常數
   ------------------------------------------------------------
   只有 /samples/ 總覽頁與示範網站（/samples/{版型}/）會載入這一份，
   正式婚禮網站（/w/{slug}/）不會。
   scripts/build-samples.js 也讀這一份，產生卡片上的 LINE 連結。

     LINE_URL      一般的 LINE 按鈕（首屏、開站流程、底部固定列）
     LINE_OA_ID    官方帳號 ID，「♡ 我想用這款」與預覽裡的「開始製作」預填訊息用
     POSTHOG_KEY   PostHog 的 Project API Key（phc_ 開頭）
     POSTHOG_HOST  PostHog 的 host，例如 https://us.i.posthog.com
                   兩個都填了才會載入 PostHog；空字串就完全不載入
     FIREBASE_*    「X 人喜歡這個版型」存在 Firestore 的 sampleLikes/{版型}，用 REST 讀寫
                   （和 js/site-context.js 是同一個專案、同一把公開的 Web API key）
============================================================ */
export const LINE_URL = 'https://lin.ee/8DlfH2K';
export const LINE_OA_ID = '@381tboky';

export const POSTHOG_KEY = '';
export const POSTHOG_HOST = '';

export const FIREBASE_PROJECT_ID = 'wedding-22b94';
export const FIREBASE_API_KEY = 'AIzaSyCU9_kkUzqiAjouvbf-_d7geeHXup-ltYA';

/* LINE 的 oaMessage：開官方帳號的聊天室，訊息框預先填好文字。
   ID 與訊息都交給 encodeURIComponent（@ → %40，中文照 UTF-8 編碼），不要手動編碼 */
export function lineMessageUrl(text) {
  return `https://line.me/R/oaMessage/${encodeURIComponent(LINE_OA_ID)}/?${encodeURIComponent(text)}`;
}

/* 「♡ 我想用這款」的預填訊息；版型中文名來自 scripts/sample-catalog.js 的 name[1] */
export function likeMessage(cnName) {
  return `我想詢問『${cnName}』版型`;
}
