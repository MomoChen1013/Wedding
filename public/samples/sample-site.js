/* ============================================================
   samples/sample-site.js — 版型展示頁（/samples）的示範婚禮
   ------------------------------------------------------------
   /samples/{版型}/… 由 js/site-context.js 的示範模式載入這一份，
   取代 Firestore 的 sites/{siteId}：

     site         站台文件（欄位跟正式站台一樣，見 README〈資料模型〉）
     assets       素材清單（等同 assets/{slug}/manifest.json）
     collections  子集合的示範資料（祝福牆、桌次、給你的信…）
     docs         單一文件（愛心數、信件數）

   新人、日期、場地、地址、故事、賓客全部是**虛構的**，不要換成任何一位客人的資料：
   這是公開連結，會用 LINE 傳給還沒簽約的客人。

   照片是 Unsplash 上 Vino Li 拍的同一對新人（Unsplash License：可商用、
   可修改、不必標示出處；出處仍記在 README 的〈版型展示頁〉與總覽頁尾）。
============================================================ */

const P = '/samples/photos';
const at = (iso) => ({ toDate: () => new Date(iso) });
/* 示範資料的時間：從現在往回推，祝福牆的「幾分鐘前」才會像真的 */
const ago = (min) => Date.now() - min * 60e3;

export const SAMPLE_SITE = {
  status: 'published',
  groomName: 'Ethan', brideName: 'Claire',
  groomNameEn: 'Ethan', brideNameEn: 'Claire',
  eventDate: at('2027-05-22T12:00:00+08:00'),
  timezone: 'Asia/Taipei',
  venueName: '星光花園酒店　二樓宴會廳',
  venueAddress: '台北市大安區星光路 520 號',
  venueMapUrl: '',
  transportPublic: '捷運星光站 2 號出口，沿星光路步行約 5 分鐘。',
  transportParking: '酒店 B1–B3 有停車場，當日憑喜帖可免費停車四小時。',
  dressCode: '穿得舒服就好。\n想配合的話，我們的主色是奶油白與霧藍。',
  giftNote: '你能來就是最好的禮物。\n紅包桌在宴會廳入口左手邊。',
  story: '我們是在一班誤點兩小時的高鐵上認識的。\n' +
         '他把位子讓給我，自己在走道站了一路，\n' +
         '下車的時候才鼓起勇氣問我要不要一起吃晚餐。\n\n' +
         '六年後的今天，換我們邀請你，來吃這一頓晚餐。',
  hashtags: ['#Ethan和Claire結婚了', '#ClaireSaidYes'],
  schedule: [
    { time: '11:00', title: '迎賓・拍照', desc: '入口有一面照片牆，歡迎先來跟我們拍一張' },
    { time: '11:30', title: '證婚儀式' },
    { time: '12:00', title: '婚宴開席', desc: '第二道菜之後，有一段我們偷偷準備的影片' },
    { time: '14:30', title: '送客' },
  ],
  rsvpEnabled: true,
  rsvpDeadline: at('2027-04-30T23:59:00+08:00'),
  seatingSearchEnabled: true,
  seatingFeatureEnabled: true,
  /* 賓客看得到的頁面全開；集氣送祝福還沒開賣（site-context.js 的 UNRELEASED_FEATURES），不放 */
  pages: {
    rsvp: true, wall: true, draw: true, exhibition: true, quiz: true,
    seating: true, letter: true, cake: false,
  },
};

const photo = (n) => `${P}/${n}.webp`;

export const SAMPLE_ASSETS = {
  cover: `${P}/cover.webp`,
  lobby: `${P}/cover.webp`,
  gallery: ['01', '02', '03', '04', '05', '06'].map((n, i) => ({ src: photo(n), order: i + 1 })),
  exhibition: [
    { src: photo('02'), order: 1, year: '2021', title: '誤點兩小時的高鐵', desc: '他把位子讓給我，在走道站了一路', act: '第一幕・相遇' },
    { src: photo('05'), order: 2, year: '2022', title: '第一次一起旅行', desc: '在京都迷路了一整個下午，卻是最喜歡的一天', act: '第一幕・相遇' },
    { src: photo('04'), order: 3, year: '2025', title: '說好了', desc: '在我們第一次吃晚餐的那間小館子，他拿出了戒指', act: '第二幕・決定' },
    { src: photo('01'), order: 4, year: '2027', title: '換我們邀請你', desc: '5 月 22 日，來吃這一頓晚餐', act: '第二幕・決定' },
  ],
  cards: [
    { src: photo('cover'), order: 1, name: '笑到瞇眼的兩個人', rarity: 'SSR', desc: '拍婚紗那天，攝影師說了一個很冷的笑話' },
    { src: photo('06'), order: 2, name: '頭紗下的新娘', rarity: 'SR', desc: '風很大，頭紗一直飛走' },
    { src: photo('01'), order: 3, name: '草地上的氣球', rarity: 'SR', desc: '那顆紅色的氣球後來飛走了' },
    { src: photo('03'), order: 4, name: '一束滿天星', rarity: 'R', desc: '捧花是新娘自己綁的' },
    { src: photo('04'), order: 5, name: '交握的手', rarity: 'R', desc: '戒指是兩個人一起挑的' },
    { src: photo('05'), order: 6, name: '木牆前的散步', rarity: 'N', desc: '休息時間偷拍到的' },
  ],
};

export const SAMPLE_COLLECTIONS = {
  wishes: [
    { name: '小安', icon: '✦', text: '從大學看你們走到今天，真的好替你們開心！新婚快樂 🎉', time: ago(60 * 26) },
    { name: '阿哲', icon: '◇', text: 'Ethan 終於把那班高鐵的故事講完了，恭喜你們！', time: ago(60 * 20) },
    { name: 'Claire 的同事 Mia', icon: '○', text: '要一直這麼幸福喔，婚禮那天見！', time: ago(60 * 9) },
    { name: '表姊', icon: '❖', text: '祝福你們每天都像拍婚紗那天一樣笑得那麼開心。', time: ago(95) },
    { name: '高中死黨們', icon: '∞', text: '我們已經在練要上台唱的歌了，敬請期待。', time: ago(12) },
  ],
  seating: [
    { name: '王小安', table: '第 3 桌', note: '大學同學', time: 1 },
    { name: '李哲宇', table: '第 3 桌', note: '大學同學', time: 2 },
    { name: '陳美亞', table: '第 5 桌', note: '新娘同事', time: 3 },
    { name: '林佳穎', table: '第 5 桌', note: '新娘同事', time: 4 },
    { name: '張家豪', table: '第 8 桌', note: '新郎家親戚', time: 5 },
    { name: '黃怡君', table: '第 2 桌', note: '新娘家親戚', time: 6 },
  ],
  blessings: [
    {
      terms: ['小安', '王小安'],
      title: '給小安',
      body: '謝謝你在我們每一個重要的時刻都在。\n大學的那些晚上、搬家那天、求婚前一晚陪 Ethan 演練了三次 ——\n這一次，換我們請你吃飯。',
      sign: 'Ethan & Claire',
      isDefault: false, time: 1,
    },
    {
      terms: [],
      title: '給親愛的你',
      body: '謝謝你願意來參加我們的婚禮。\n我們一直覺得，能被這麼多人祝福，是這輩子最幸運的事。\n婚禮那天，請一定要來跟我們說說話。',
      sign: 'Ethan & Claire',
      isDefault: true, time: 2,
    },
  ],
};

export const SAMPLE_DOCS = {
  'meta/hearts': { count: 128 },
  'meta/letterCount': { count: 17 },
};
