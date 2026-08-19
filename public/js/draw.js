/* ============================================================
   draw.js — 抽 Momo 小卡
   ============================================================
   ▸ 怎麼加 / 改 / 刪小卡？
     在下方 CARDS 陣列加一行：
       {
         art:    '✦',                 // ① 圖片網址或符號
         name:   '日常 Momo',            // ② 卡名（顯示在卡片下方）
         rarity: 'R',                   // ③ 等級：SSR / SR / R / N
         desc:   '咖啡與書的下午',       // ④ 說明（選填）
       },
     ・刪除 = 把整行刪掉
     ・順序、總張數隨便調，程式會自動處理

   ▸ 卡池從哪裡來？（由上而下，先找到就用）
     1. 新人在後台 /w/{slug}/admin「囍卡」分頁上傳的卡（Firestore `cards`）
     2. 素材資料夾 public/assets/{slug}/cards/
     3. 下方 CARDS 的內建範例卡
     後台上傳的卡圖是整段 data URL，塞不進收藏紀錄的 art 欄位，
     所以收藏只存 cardId，畫面再回卡池取圖。

   ▸ art 寫什麼？
     ・自己上傳的圖：放 public/assets/{slug}/cards/，程式會自動帶入
     ・外部網址：    'https://example.com/photo.jpg'
     ・想用符號：    '✦'
     程式會自動分辨：含「/」或副檔名（.png .jpg .webp 等）→ 當圖片
                   其他 → 當 emoji 顯示

   ▸ 等級（rarity）會影響什麼？
     ・SSR ＝ SSR：卡面有彩虹光膜 + 抽到時放煙火
     ・SR  ＝ SR ：卡面有彩虹光膜 + 抽到時放煙火
     ・R   ＝ R  ：一般卡（沒光膜、沒煙火）
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

/* 以下 52 張為範例卡（卡名與描述沿用原作 Momo 的生活照）
   art 一律留成記號：真正的卡圖請放 public/assets/{slug}/cards/，
   由下面的 applyCardAssets() 整批取代，沒放素材時也不會去要不存在的圖。 */
const CARDS = [
  {art:'✦', name:'看劇前的Mo', rarity:'N', desc:'大愛CMusical'},
  {art:'✦', name:'覺得自己可愛的Mo', rarity:'N', desc:'是拍貼機'},
  {art:'✦', name:'神射手Momo', rarity:'N', desc:'百發百中'},
  {art:'✦', name:'攝影師Momo', rarity:'N'},
  {art:'✦', name:'春系Momo', rarity:'N'},
  {art:'✦', name:'小時候的Mo', rarity:'SSR', desc:'不怕高又不怕鏡頭'},
  {art:'✦', name:'中秋節的Momo', rarity:'SSR', desc:'覺得自己超帥氣'},
  {art:'✦', name:'畢業展覽開幕的 Momo', rarity:'SR', desc:'鮮少膝上裙'},
  {art:'✦', name:'超長髮的Momo', rarity:'SR', desc:'澳門的軍餐廳'},
  {art:'✦', name:'拆聖誕交換禮物的Momo', rarity:'N', desc:'喜獲大禮包！'},
  {art:'✦', name:'黑魔女Momo', rarity:'SR', desc:'DressCode暗黑系'},
  {art:'✦', name:'快離職的Momo', rarity:'N', desc:'藏不住的雀躍'},
  {art:'✦', name:'錄音室的Momo', rarity:'R', desc:'然後就完全沒聽過'},
  {art:'✦', name:'男裝版Momo', rarity:'R', desc:'謝安哥支援'},
  {art:'✦', name:'超尬的Momo', rarity:'N', desc:'謝姐側拍'},
  {art:'✦', name:'黑道大姐Momo', rarity:'N'},
  {art:'✦', name:'拔腿Momo', rarity:'N', desc:'一切都是角度'},
  {art:'✦', name:'模特Momo', rarity:'R', desc:'不看鏡頭才不尬'},
  {art:'✦', name:'和服Momo', rarity:'R'},
  {art:'✦', name:'夜釣Momo', rarity:'N', desc:'好長的白帶魚'},
  {art:'✦', name:'三眼怪Momo', rarity:'R', desc:'解鎖日本卡丁車'},
  {art:'✦', name:'畫畫Momo', rarity:'N', desc:'畫Hana'},
  {art:'✦', name:'和服Momo', rarity:'R'},
  {art:'✦', name:'短髮做黑暗料理的Momo', rarity:'R', desc:'炒火龍果'},
  {art:'✦', name:'青春大隊接力Momo', rarity:'R', desc:'第一名！'},
  {art:'✦', name:'高原上騎馬的Momo', rarity:'SR', desc:'好喜歡'},
  {art:'✦', name:'BaristaMomo', rarity:'N', desc:'跟杯子一樣顏色'},
  {art:'✦', name:'婚宴Momo', rarity:'R', desc:'我就是在裝可愛'},
  {art:'✦', name:'玩小孩Momo', rarity:'N'},
  {art:'✦', name:'不是Momo', rarity:'SSR', desc:'是Hana'},
  {art:'✦', name:'歐膩Momo', rarity:'N', desc:'是日出還是日落？'},
  {art:'✦', name:'女友照（？）Momo', rarity:'N', desc:'超愛的寶藏店'},
  {art:'✦', name:'獨旅Momo', rarity:'R', desc:'謝謝韓國姊姊幫拍'},
  {art:'✦', name:'油菜花田裡的Momo', rarity:'N'},
  {art:'✦', name:'吃不下Momo', rarity:'R', desc:'這一盤我可以吃一天'},
  {art:'✦', name:'主持人Momo', rarity:'SR', desc:'一群人我就敢這樣綁'},
  {art:'✦', name:'橘子園裡的Momo', rarity:'N', desc:'天氣超好'},
  {art:'✦', name:'滑冰的Momo', rarity:'N', desc:'超難'},
  {art:'✦', name:'黑道大姐Momo', rarity:'N'},
  {art:'✦', name:'白馬上的Momo', rarity:'N'},
  {art:'✦', name:'講台上報告的Momo', rarity:'R'},
  {art:'✦', name:'女團Momo', rarity:'SR', desc:'好青春'},
  {art:'✦', name:'輕井澤的Momo', rarity:'N', desc:'好愛這個光跟景'},
  {art:'✦', name:'意外到粉紅草裡的Momo', rarity:'R'},
  {art:'✦', name:'東京迪士尼的Momo', rarity:'SR', desc:'熊耳朵'},
  {art:'✦', name:'裝日本人Momo', rarity:'N', desc:'日本人才不會穿這個顏色'},
  {art:'✦', name:'做奇怪的事情的Momo', rarity:'N'},
  {art:'✦', name:'婚宴Momo', rarity:'SR'},
  {art:'✦', name:'追星的Momo', rarity:'SR'},
  {art:'✦', name:'餵大貓咪的Momo', rarity:'R', desc:'是老虎'},
  {art:'✦', name:'去膩沖繩的Momo', rarity:'N'},
  {art:'✦', name:'馬祖的Momo', rarity:'N'}
];

/* 素材資料夾有 cards/ 就用客戶自己的卡圖，否則沿用上面的預設 */
(function applyCardAssets(){
  const list = (window.SITE && window.SITE.assets && window.SITE.assets.cards) || [];
  if(!list.length) return;
  CARDS.length = 0;
  list.forEach((item, i) => {
    CARDS.push({
      art:    item.src,
      name:   item.name   || `囍卡 ${i + 1}`,
      rarity: item.rarity || 'N',
      desc:   item.desc   || '',
    });
  });
})();

/* 後台上傳的卡（Firestore）優先於上面兩種來源。
   非同步讀進來，到齊之後整批換掉卡池；換完把已經畫好的收藏重畫一次，
   因為收藏只存 cardId，要有卡池才找得到圖。 */
const ASSET_CARDS = CARDS.slice();

function applyOwnerCards(){
  const list = DataStore.getCards();
  CARDS.length = 0;
  if(list.length){
    list.forEach((c, i) => {
      CARDS.push({
        cardId: c.id,
        art:    c.img,
        name:   c.name   || `囍卡 ${i + 1}`,
        rarity: RANK[c.rarity] ? c.rarity : 'N',
        desc:   c.desc   || '',
      });
    });
  }else{
    ASSET_CARDS.forEach(c => CARDS.push(c));
  }
  redrawCollection();
}

/* 收藏紀錄裡的一筆 → 拿得到圖的樣子 */
function cardArtOf(item){
  if(item.cardId){
    const hit = DataStore.getCards().find(c => c.id === item.cardId);
    if(hit) return hit.img;
  }
  return item.art || DEFAULT_ICON;
}

const RANK = {SSR:'SSR', SR:'SR', R:'R', N:'N'};

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

/* ===== 收藏（mini-card） =====
   點得下去：開放大檢視（見下面的「收藏卡放大看」），
   所以要有 button 的語意 —— 鍵盤也走得到、Enter 也打得開。 */
function appendMini(pick){
  const art = cardArtOf(pick);
  const mc = document.createElement('div');
  mc.className = 'mini-card' + (isImage(art) ? ' has-img' : '');
  if(isImage(art)){
    mc.innerHTML = `<img src="${art}" alt="" draggable="false" onerror="this.parentNode.classList.remove('has-img');this.outerHTML='${DEFAULT_ICON}'">`;
  } else {
    mc.innerHTML = escapeHtml(art);
  }
  if(pick.rarity === 'SSR' || pick.rarity === 'SR'){
    mc.insertAdjacentHTML('beforeend', '<div class="mh"></div>');
  }
  mc.title = pick.name + '・' + pick.rarity + (pick.desc ? '\n' + pick.desc : '');
  mc.setAttribute('role', 'button');
  mc.setAttribute('tabindex', '0');
  mc.setAttribute('aria-label', `看大圖：${pick.name || '婚禮小卡'}`);
  /* 卡池之後可能被後台的卡換掉，所以存的是「這一筆收藏」本身，
     圖每次開的時候再用 cardArtOf() 取一次 */
  mc._rec = pick;
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
/* 卡池換了（後台剛上傳完）就整批重畫，收藏才拿得到新的圖 */
function redrawCollection(){
  collectedRendered.clear();
  coll.innerHTML = '';
  renderCollection();
}

/* ============================================================
   收藏卡放大看 ＋ 儲存下載
   ------------------------------------------------------------
   點收藏裡的小卡 → 蓋上一張 2:3 的大卡。卡面上只有照片，
   SSR／SR 多一層會動的彩虹光膜；等級、卡名、說明都不畫上去 ——
   放大看的重點就是那張照片，字疊在上面只會擋到人。

   「儲存下載」把同一張照片畫進 canvas 輸出 JPG，
   照片底下只留一行「新人名字・日期」，其餘什麼都不加。

   為什麼是自己畫而不是截圖：全站不引第三方函式庫（html2canvas 之類），
   而且卡面就是一張照片，自己畫拿得到更好的解析度。

   跨網域的卡圖（新人把 art 指到外部網址）會把 canvas 染色，
   toBlob 會丟 SecurityError —— 接住它，改叫使用者長按存圖。
============================================================ */
const cvEl    = document.getElementById('cardView');
const cvArt   = document.getElementById('cardViewArt');
const cvHolo  = document.getElementById('cardViewHolo');
const cvSave  = document.getElementById('cardViewSave');
const cvHint  = document.getElementById('cardViewHint');

const CV_HINT = '存成 JPG 圖片，收進手機或電腦相簿';
function cvSetHint(text){ cvHint.textContent = text || CV_HINT; }

/* 現在開著的是哪一張（關掉之後清掉，避免存到上一張） */
let cvOpen = null;
let cvLastFocus = null;

function openCardView(rec, index){
  const art = cardArtOf(rec);
  cvOpen = { rec, art, index };
  cvLastFocus = document.activeElement;

  cvArt.textContent = '';
  if(isImage(art)){
    const img = new Image();
    img.alt = rec.name || '婚禮小卡';
    img.draggable = false;
    /* 圖掛掉時退回記號，不要留一個破圖 */
    img.onerror = () => { cvArt.textContent = DEFAULT_ICON; };
    img.src = art;
    cvArt.appendChild(img);
  }else{
    cvArt.textContent = art || DEFAULT_ICON;
  }
  cvHolo.hidden = !(rec.rarity === 'SSR' || rec.rarity === 'SR');
  cvSetHint('');

  cvEl.hidden = false;
  document.body.style.overflow = 'hidden';
  cvSave.focus();
}

function closeCardView(){
  cvEl.hidden = true;
  cvOpen = null;
  document.body.style.overflow = '';
  if(cvLastFocus && cvLastFocus.isConnected) cvLastFocus.focus();
  cvLastFocus = null;
}

/* 點收藏裡的小卡就打開（鍵盤也走得到） */
coll.addEventListener('click', (e)=>{
  const mc = e.target.closest('.mini-card');
  if(!mc || !mc._rec) return;
  openCardView(mc._rec, [...coll.children].indexOf(mc) + 1);
});
coll.addEventListener('keydown', (e)=>{
  if(e.key !== 'Enter' && e.key !== ' ') return;
  const mc = e.target.closest('.mini-card');
  if(!mc || !mc._rec) return;
  e.preventDefault();
  openCardView(mc._rec, [...coll.children].indexOf(mc) + 1);
});

document.getElementById('cardViewClose').addEventListener('click', closeCardView);
/* 點卡片以外的地方（背景）也關得掉 */
cvEl.addEventListener('click', (e)=>{ if(e.target === cvEl) closeCardView(); });
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape' && !cvEl.hidden) closeCardView();
});

/* ---------- 畫成一張圖 ---------- */
/* 先試著用 CORS 載，載不到再退回一般載入（外部圖多半沒有 CORS 標頭，
   退回來的圖畫得出來但會染色，toBlob 那一步才會知道） */
function loadCardImage(src){
  return new Promise((resolve, reject) => {
    const attempt = (useCors) => {
      const img = new Image();
      if(useCors) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => (useCors ? attempt(false) : reject(new Error('圖片載入失敗')));
      img.src = src;
    };
    attempt(!/^data:/.test(src));
  });
}

function cssVar(name, fallback){
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function roundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* object-fit: cover —— 短邊填滿，長邊置中裁掉 */
function drawCover(ctx, img, x, y, w, h){
  const ir = img.naturalWidth / img.naturalHeight;
  const br = w / h;
  let dw = w, dh = h;
  if(ir > br) dw = h * ir; else dh = w / ir;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

async function drawCardCanvas(art){
  const W = 1080;
  const PAD = 60;
  const CW = W - PAD * 2;            /* 卡寬 */
  const CH = Math.round(CW * 1.5);   /* 2:3 */
  const RADIUS = 26;

  const inkSoft = cssVar('--ink-soft', '#7c7267');
  const soft    = cssVar('--primary-soft', '#f3eee3');
  const bg2     = cssVar('--bg2', '#f4f1ea');
  const line    = cssVar('--line', 'rgba(47,43,38,.18)');
  const serif   = '"Noto Serif TC", "Songti TC", "PingFang TC", "Microsoft JhengHei", serif';

  /* 照片下面只留一行「新人名字・日期」，高度是固定的 */
  const footH = 74;
  const H = PAD + CH + footH + PAD;

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');

  ctx.fillStyle = bg2;
  ctx.fillRect(0, 0, W, H);

  /* ---- 照片 ---- */
  ctx.save();
  roundRect(ctx, PAD, PAD, CW, CH, RADIUS);
  ctx.clip();

  ctx.fillStyle = soft;
  ctx.fillRect(PAD, PAD, CW, CH);

  if(isImage(art)){
    try{
      const img = await loadCardImage(art);
      drawCover(ctx, img, PAD, PAD, CW, CH);
    }catch{
      /* 圖載不進來就留底色 ＋ 記號，不要整張空白 */
      ctx.fillStyle = inkSoft;
      ctx.font = `160px ${serif}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(DEFAULT_ICON, W / 2, PAD + CH / 2);
    }
  }else{
    ctx.fillStyle = inkSoft;
    ctx.font = `160px ${serif}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(art || DEFAULT_ICON, W / 2, PAD + CH / 2);
  }
  ctx.restore();

  /* 照片的細邊框（clip 之外才畫得到整條線） */
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  roundRect(ctx, PAD + 1, PAD + 1, CW - 2, CH - 2, RADIUS);
  ctx.stroke();

  /* ---- 這是誰的婚禮 ---- */
  const WED = window.WED || {};
  const foot = [WED.couple, WED.date].filter(Boolean).join('・');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = inkSoft;
  ctx.font = `21px ${serif}`;
  ctx.fillText(foot, W / 2, PAD + CH + 46);

  return cv;
}

/* 檔名維持純英數：中文檔名在部分手機下載器會被換成 "download" */
function cardFileName(index){
  const slug = (window.SITE && window.SITE.slug) || 'wedding';
  const no = String(index || 1).padStart(2, '0');
  return `card-${slug}-${new Date().toISOString().slice(0, 10)}-${no}.jpg`;
}

cvSave.addEventListener('click', async ()=>{
  if(!cvOpen) return;
  cvSave.disabled = true;
  cvSetHint('正在畫成圖片…');
  try{
    /* 字體還在下載時畫出來會變成系統預設字，等它載完再畫 */
    if(document.fonts && document.fonts.ready) await document.fonts.ready;

    const canvas = await drawCardCanvas(cvOpen.art);
    const blob = await new Promise((res, rej) => {
      try{ canvas.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', 0.92); }
      catch(err){ rej(err); }
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = cardFileName(cvOpen.index);
    document.body.appendChild(a);
    a.click();
    a.remove();
    /* 立刻 revoke 會讓部分瀏覽器的下載半路斷掉，晚一點再收 */
    setTimeout(()=> URL.revokeObjectURL(url), 30000);
    cvSetHint('已存成 JPG，去相簿或下載資料夾看看');
  }catch(err){
    console.warn('[抽卡] 存圖失敗', err);
    cvSetHint('這張圖存不下來，改成長按（電腦按右鍵）另存圖片吧');
  }finally{
    cvSave.disabled = false;
  }
});

document.addEventListener('data:collected', renderCollection);
document.addEventListener('data:cards', applyOwnerCards);
DataStore.subscribeCards();
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
      ? `<img src="${pick.art}" alt="${escapeHtml(pick.name)}" draggable="false" onerror="this.outerHTML='${DEFAULT_ICON}'">`
      : escapeHtml(pick.art);
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

    /* 收藏只留必要欄位（規則有白名單）；後台上傳的卡圖太長，
       改存 cardId，畫面再回卡池取圖 */
    const rec = {
      art:    pick.cardId ? '' : String(pick.art || ''),
      name:   pick.name || '',
      rarity: pick.rarity || 'N',
      desc:   pick.desc || '',
    };
    if(pick.cardId) rec.cardId = pick.cardId;
    DataStore.addCollected(rec);
    /* mini-card 與計數會由 'data:collected' 事件自動更新 */
    drawing = false;
  }, 300);
});
