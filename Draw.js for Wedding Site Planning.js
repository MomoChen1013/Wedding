/* ============================================================
   draw.js — 抽 Momo 小卡
   ============================================================
   ▸ 怎麼加 / 改 / 刪小卡？
     在下方 CARDS 陣列加一行：
       {
         art:    'images/card-01.png',  // ① 圖片或 emoji
         name:   '日常 Momo',            // ② 卡名（顯示在卡片下方）
         rarity: 'R',                   // ③ 等級：SSR / SR / R / N
         desc:   '咖啡與書的下午 ☕',     // ④ 說明（選填）
       },
     ・刪除 = 把整行刪掉
     ・順序、總張數隨便調，程式會自動處理

   ▸ art 寫什麼？
     ・自己上傳的圖：'images/card-01.png'（檔案放 images/ 資料夾下）
     ・外部網址：    'https://example.com/photo.jpg'
     ・想用 emoji ：  '🎀'
     程式會自動分辨：含「/」或副檔名（.png .jpg .webp 等）→ 當圖片
                   其他 → 當 emoji 顯示

   ▸ 等級（rarity）會影響什麼？
     ・SSR ＝ ✦✦ SSR：卡面有彩虹光膜 + 抽到時放煙火 🎆
     ・SR  ＝ ✦ SR ：卡面有彩虹光膜 + 抽到時放煙火 🎆
     ・R   ＝ ★ R  ：一般卡（沒光膜、沒煙火）
     ・N   ＝ N    ：一般卡
     ・目前每張卡的抽中機率相同
       想做「越稀有越難抽」？把高稀有卡少放幾張、N 卡多放幾張即可

   ▸ desc（說明）寫什麼？
     ・選填，留空就不顯示
     ・短一點比較好看，建議一句話內
     ・會顯示在大卡片下方的小紙條上

   ▸ 圖片建議
     ・卡片比例約 2:3（直式）
     ・解析度 800×1200 以上比較清楚
     ・檔名愛叫什麼都行，path 對到 art 就好
============================================================ */
if(!requireUser()) { /* requireUser 已導向首頁 */ }

/* ★ 以下 52 張為範例卡（沿用原作 Momo 的生活照）
   換成你們的婚紗照 / 生活照：把 art 換成 images/ 內的新圖、name/desc 改成你們的故事即可 */
const CARDS = [
  {art:'images/cards-01.png', name:'看劇前的Mo', rarity:'N', desc:'大愛CMusical'},
  {art:'images/cards-02.png', name:'覺得自己可愛的Mo', rarity:'N', desc:'是拍貼機✨'},
  {art:'images/cards-03.png', name:'神射手Momo', rarity:'N', desc:'百發百中'},
  {art:'images/cards-04.png', name:'攝影師Momo', rarity:'N'},
  {art:'images/cards-05.png', name:'春系Momo', rarity:'N'},
  {art:'images/cards-06.png', name:'小時候的Mo', rarity:'SSR', desc:'不怕高又不怕鏡頭'},
  {art:'images/cards-07.png', name:'中秋節的Momo', rarity:'SSR', desc:'覺得自己超帥氣'},
  {art:'images/cards-08.png', name:'畢業展覽開幕的 Momo', rarity:'SR', desc:'鮮少膝上裙'},
  {art:'images/cards-09.png', name:'超長髮的Momo', rarity:'SR', desc:'澳門的軍餐廳'},
  {art:'images/cards-10.png', name:'拆聖誕交換禮物的Momo', rarity:'N', desc:'喜獲大禮包！'},
  {art:'images/cards-11.png', name:'黑魔女Momo', rarity:'SR', desc:'DressCode暗黑系'},
  {art:'images/cards-12.png', name:'快離職的Momo', rarity:'N', desc:'藏不住的雀躍'},
  {art:'images/cards-13.png', name:'錄音室的Momo', rarity:'R', desc:'然後就完全沒聽過'},
  {art:'images/cards-14.png', name:'男裝版Momo', rarity:'R', desc:'謝安哥支援'},
  {art:'images/cards-15.png', name:'超尬的Momo', rarity:'N', desc:'謝姐側拍'},
  {art:'images/cards-16.png', name:'黑道大姐Momo', rarity:'N'},
  {art:'images/cards-17.png', name:'拔腿Momo', rarity:'N', desc:'一切都是角度'},
  {art:'images/cards-18.png', name:'模特Momo', rarity:'R', desc:'不看鏡頭才不尬'},
  {art:'images/cards-19.png', name:'和服Momo', rarity:'R'},
  {art:'images/cards-20.png', name:'夜釣Momo', rarity:'N', desc:'好長的白帶魚'},
  {art:'images/cards-21.png', name:'三眼怪Momo', rarity:'R', desc:'解鎖日本卡丁車'},
  {art:'images/cards-22.png', name:'畫畫Momo', rarity:'N', desc:'畫Hana'},
  {art:'images/cards-23.png', name:'和服Momo', rarity:'R'},
  {art:'images/cards-24.png', name:'短髮做黑暗料理的Momo', rarity:'R', desc:'炒火龍果'},
  {art:'images/cards-25.png', name:'青春大隊接力Momo', rarity:'R', desc:'第一名！'},
  {art:'images/cards-26.png', name:'高原上騎馬的Momo', rarity:'SR', desc:'好喜歡'},
  {art:'images/cards-27.png', name:'BaristaMomo', rarity:'N', desc:'跟杯子一樣顏色'},
  {art:'images/cards-28.png', name:'婚宴Momo', rarity:'R', desc:'我就是在裝可愛'},
  {art:'images/cards-29.png', name:'玩小孩Momo', rarity:'N'},
  {art:'images/cards-30.png', name:'不是Momo', rarity:'SSR', desc:'是Hana'},
  {art:'images/cards-31.png', name:'歐膩Momo', rarity:'N', desc:'是日出還是日落？'},
  {art:'images/cards-32.png', name:'女友照（？）Momo', rarity:'N', desc:'超愛的寶藏店'},
  {art:'images/cards-33.png', name:'獨旅Momo', rarity:'R', desc:'謝謝韓國姊姊幫拍'},
  {art:'images/cards-34.png', name:'油菜花田裡的Momo', rarity:'N'},
  {art:'images/cards-36.png', name:'吃不下Momo', rarity:'R', desc:'這一盤我可以吃一天'},
  {art:'images/cards-35.png', name:'主持人Momo', rarity:'SR', desc:'一群人我就敢這樣綁'},
  {art:'images/cards-37.png', name:'橘子園裡的Momo', rarity:'N', desc:'天氣超好✨'},
  {art:'images/cards-38.png', name:'滑冰的Momo', rarity:'N', desc:'超難'},
  {art:'images/cards-39.png', name:'黑道大姐Momo', rarity:'N'},
  {art:'images/cards-40.png', name:'白馬上的Momo', rarity:'N'},
  {art:'images/cards-41.png', name:'講台上報告的Momo', rarity:'R'},
  {art:'images/cards-42.png', name:'女團Momo', rarity:'SR', desc:'好青春'},
  {art:'images/cards-43.png', name:'輕井澤的Momo', rarity:'N', desc:'好愛這個光跟景'},
  {art:'images/cards-44.png', name:'意外到粉紅草裡的Momo', rarity:'R'},
  {art:'images/cards-45.png', name:'東京迪士尼的Momo', rarity:'SR', desc:'熊耳朵'},
  {art:'images/cards-46.png', name:'裝日本人Momo', rarity:'N', desc:'日本人才不會穿這個顏色'},
  {art:'images/cards-47.png', name:'做奇怪的事情的Momo', rarity:'N'},
  {art:'images/cards-48.png', name:'婚宴Momo', rarity:'SR'},
  {art:'images/cards-49.png', name:'追星的Momo', rarity:'SR'},
  {art:'images/cards-50.png', name:'餵大貓咪的Momo', rarity:'R', desc:'是老虎'},
  {art:'images/cards-51.png', name:'去膩沖繩的Momo', rarity:'N'},
  {art:'images/cards-52.png', name:'馬祖的Momo', rarity:'N'}
];

const RANK = {SSR:'✦✦ SSR', SR:'✦ SR', R:'★ R', N:'N'};

/* 判斷 art 是圖片路徑還是 emoji
   含 / 反斜線 或 副檔名 → 圖片；否則當 emoji */
function isImage(s){
  if(typeof s !== 'string') return false;
  return /[\/\\]/.test(s) || /\.(jpe?g|png|webp|gif|svg|avif)(\?|$)/i.test(s);
}

const card      = document.getElementById('photocard');
const coll      = document.getElementById('collection');
const collCount = document.getElementById('collCount');
const descEl    = document.getElementById('cardDesc');
let drawing = false;

/* ===== 收藏（mini-card） ===== */
function appendMini(pick){
  const mc = document.createElement('div');
  mc.className = 'mini-card' + (isImage(pick.art) ? ' has-img' : '');
  if(isImage(pick.art)){
    mc.innerHTML = `<img src="${pick.art}" alt="" draggable="false">`;
  } else {
    mc.style.background = `linear-gradient(135deg,var(--primary-soft),var(--bg-blob2))`;
    mc.innerHTML = pick.art;
  }
  if(pick.rarity === 'SSR' || pick.rarity === 'SR'){
    mc.insertAdjacentHTML('beforeend', '<div class="mh"></div>');
  }
  mc.title = pick.name + '・' + pick.rarity + (pick.desc ? '\n' + pick.desc : '');
  coll.appendChild(mc);
}

/* 還原歷史收藏（Firestore；增量渲染以免重複） */
const collectedRendered = new Set();
function renderCollection(){
  const all = DataStore.getCollected();
  collCount.textContent = all.length;
  all.forEach(c => {
    const key = c.id || (c.name + '|' + c.time);
    if(collectedRendered.has(key)) return;
    collectedRendered.add(key);
    appendMini(c);
  });
}
document.addEventListener('data:collected', renderCollection);
renderCollection();

/* ===== 抽卡 ===== */
document.getElementById('drawBtn').addEventListener('click', ()=>{
  if(drawing) return; drawing = true;
  card.classList.remove('flipped', 'shine');
  if(descEl) descEl.classList.remove('show');

  const pick = CARDS[Math.floor(Math.random() * CARDS.length)];

  setTimeout(()=>{
    const art = document.getElementById('cardArt');
    art.innerHTML = isImage(pick.art)
      ? `<img src="${pick.art}" alt="${escapeHtml(pick.name)}" draggable="false">`
      : pick.art;
    document.getElementById('cardRk').textContent = RANK[pick.rarity];
    document.getElementById('cardNm').textContent = pick.name;

    /* 卡下方的說明小紙條 */
    if(descEl){
      if(pick.desc){
        descEl.textContent = pick.desc;
        descEl.classList.add('show');
      } else {
        descEl.textContent = '';
      }
    }

    card.classList.add('flipped');
    if(pick.rarity === 'SSR' || pick.rarity === 'SR'){
      card.classList.add('shine');
      fireworksBurst();
    }
    confettiRain();

    DataStore.addCollected(pick);
    /* mini-card 與計數會由 'data:collected' 事件自動更新 */
    drawing = false;
  }, 300);
});
