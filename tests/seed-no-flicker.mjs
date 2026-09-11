/* ============================================================
   seed-no-flicker.mjs — 給 tests/no-flicker.mjs 用的兩組站台
   ------------------------------------------------------------
   兩組站台各自代表一種情況：

     flicker-korean   korean 版型、有英文名、全部頁面都開
                      → 驗「預產頁第一次繪製就是 korean 的色票」
                        （信封先淺色再變色，就是在這種站台上發生的）

     flicker-classic  classic 版型，pages 只開 rsvp 與 letter
                      → 驗兩件事：沒開的頁面不會被產出來，
                        以及沒預產到的頁面確實有遮罩接住

     ginny-one-…      forest 版型，而且 public/assets/ 底下**真的有素材**
                      → 驗大廳的首屏大圖有沒有被預載。
                        前兩組沒有素材資料夾，lobbyPhoto() 會回空字串，
                        驗不到那條路徑

   只寫 Admin SDK 改得動的欄位（template、姓名、pages…），
   因為預渲染烤的就是這一批 —— 新人在後台改得動的欄位一律不烤。
============================================================ */
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'wedding-22b94' });
const db = getFirestore();

/* 固定一個日期，測試才不會因為「今天」而飄 */
const EVENT_DATE = new Date('2026-09-19T04:30:00Z');   /* 台北時間 12:30 */

const SITES = {
  'flicker-korean': {
    template: 'korean',
    groomName: '宇辰', brideName: '宜庭',
    groomNameEn: 'Ethan', brideNameEn: 'Ginny',
    pages: {
      rsvp: true, wall: true, letter: true, quiz: true,
      draw: true, exhibition: true, seating: true, admin: true,
    },
  },
  /* 這個 slug 對應 public/assets/ginny-one-20260919/（manifest 裡有 lobby.jpg），
     所以 build-og 的 lobbyPhoto() 挑得出照片、印得出 preload */
  'ginny-one-20260919': {
    template: 'forest',
    groomName: '柏翰', brideName: '思妤',
    pages: { rsvp: true, letter: true, wall: true, admin: true },
  },
  'flicker-classic': {
    template: 'classic',
    groomName: '家豪', brideName: '雅婷',
    /* wall／quiz／draw… 沒列到＝沒開，build-og 不該產它們
       （判準要跟 site-context.js 的 isPageOn() 一致：有 map 就必須明確 true） */
    pages: { rsvp: true, letter: true, admin: true },
  },
};

for (const [slug, extra] of Object.entries(SITES)) {
  const ref = db.collection('sites').doc(`site-${slug}`);
  await ref.set({
    slug,
    status: 'published',
    eventDate: Timestamp.fromDate(EVENT_DATE),
    timezone: 'Asia/Taipei',
    venueName: '晶華酒店',
    venueAddress: '台北市中山北路二段 39 巷 3 號',
    /* hashtag 刻意留空：它是新人改得動的欄位，不該被烤進靜態檔，
       測試要看得到「執行期才填上預設 hashtag」這件事 */
    hashtags: [],
    schedule: [],
    ...extra,
  });
  await db.collection('slugs').doc(slug).set({ siteId: ref.id });
  console.log(`  seeded ${slug}（${extra.template}）`);
}
