/* ============================================================
   samples/sample-data.js — 給客人挑版型的示範頁（/samples）用的婚禮資料
   ------------------------------------------------------------
   新人、日期、場地、地址、故事全部是**虛構的**，不要換成任何一位客人的資料：
   這一頁是公開連結，會用 LINE 傳給還沒簽約的客人。

   照片是 Unsplash 上 Vino Li 拍的同一對新人（Unsplash License：可商用、
   可修改、不必標示出處；出處仍記在 README 的〈版型展示頁〉）。

   形狀跟 preview/demo-data.js 一樣，由 samples/demo.js 填進大廳骨架。
============================================================ */
window.DEMO = {
  /* ---------- 新人 ---------- */
  couple:    'Ethan & Claire',
  coupleCn:  'Ethan ♡ Claire',
  nameA:     'ETHAN',
  nameB:     'CLAIRE',
  dateISO:   '2027-05-22T12:00:00+08:00',
  date:      '2027.05.22',
  dateEn:    '22 MAY 2027',
  dateDay:   '22',
  dateMonth: 'MAY',
  dateMonthShort: 'MAY',
  dateYear:  '2027',
  weekday:   '星期六',
  time:      '12:00 開始',

  venue:   '星光花園酒店　二樓宴會廳',
  address: '台北市大安區星光路 520 號',
  mapUrl:  '#',

  hashtags: ['#Ethan和Claire結婚了', '#ClaireSaidYes'],

  photos: {
    cover:   '/samples/photos/cover.webp',
    gallery: ['01', '02', '03', '04', '05', '06'].map((n) => `/samples/photos/${n}.webp`),
  },

  /* ---------- 當日流程 ---------- */
  schedule: [
    { time:'11:00', title:'迎賓・拍照', desc:'入口有一面照片牆，歡迎先來跟我們拍一張' },
    { time:'11:30', title:'證婚儀式',   desc:'' },
    { time:'12:00', title:'婚宴開席',   desc:'第二道菜之後，有一段我們偷偷準備的影片' },
    { time:'14:30', title:'送客',       desc:'' },
  ],

  /* ---------- 出席前的小提醒 ---------- */
  notes: [
    { label:'Dress Code', text:'穿得舒服就好。\n想配合的話，我們的主色是奶油白與霧藍。' },
    { label:'關於禮金',   text:'你能來就是最好的禮物。\n紅包桌在宴會廳入口左手邊。' },
  ],

  /* ---------- 交通 ---------- */
  transport: [
    { label:'大眾運輸', text:'捷運星光站 2 號出口，沿星光路步行約 5 分鐘。' },
    { label:'停車資訊', text:'酒店 B1–B3 有停車場，當日憑喜帖可免費停車四小時。' },
  ],

  /* ---------- 兩人的故事 ---------- */
  story: '我們是在一班誤點兩小時的高鐵上認識的。\n' +
         '他把位子讓給我，自己在走道站了一路，\n' +
         '下車的時候才鼓起勇氣問我要不要一起吃晚餐。\n\n' +
         '六年後的今天，換我們邀請你，來吃這一頓晚餐。',
};
