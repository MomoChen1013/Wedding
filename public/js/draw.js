/* ============================================================
   draw.js — 抽婚禮小卡
   ============================================================
   ▸ 卡池從哪裡來？（由上而下，先找到就用）
     1. 新人在後台 /w/{slug}/admin「婚禮小卡」分頁上傳的卡（Firestore `cards`）
     2. 素材資料夾 public/assets/{slug}/cards/
     兩邊都沒有 ＝ 卡池是空的：抽卡按鈕停用，底下寫「等待新人上傳照片」。

     **這一頁沒有內建範例卡。** 以前這裡寫死了一整組某位新人的生活照
     （「小時候的Mo」那一批），新開的站台只要沒放素材，賓客就會抽到
     別人的照片。與其給一組不屬於這對新人的卡，不如什麼都不給，
     然後老實說「還在等新人上傳」。

   ▸ 一張卡有哪些欄位？
       art     圖片網址（後台上傳的是整段 data URL）或一個符號
       name    卡名（顯示在卡片下方）
       rarity  等級：SSR / SR / R / N
       desc    說明（選填，顯示在大卡下方的小紙條）
     後台上傳的卡圖是整段 data URL，塞不進收藏紀錄的 art 欄位，
     所以收藏只存 cardId，畫面再回卡池取圖。

   ▸ art 寫什麼？
     ・後台上傳、或放進 public/assets/{slug}/cards/ 的圖：程式自動帶入
     ・外部網址：    'https://example.com/photo.jpg'
     ・想用符號：    '✦'
     程式會自動分辨：含「/」或副檔名（.png .jpg .webp 等）→ 當圖片
                   其他 → 當 emoji 顯示

   ▸ 等級（rarity）會影響什麼？
     ・SSR／SR：卡面有彩虹光膜 + 抽到時放煙火
     ・R／N   ：一般卡（沒光膜、沒煙火）
     ・目前每張卡的抽中機率相同
       想做「越稀有越難抽」？把高稀有卡少放幾張、N 卡多放幾張即可

   ▸ 圖片建議
     ・卡片比例約 2:3（直式）
     ・解析度 800×1200 以上比較清楚
============================================================ */
if(!requireUser()) { /* requireUser 已導向首頁 */ }

/* 現在畫面上用的卡池。空的就是「新人還沒上傳」——
   applyOwnerCards() 會整批換掉它，所以固定用同一個陣列（不重新指派）。 */
const CARDS = [];

/* 素材資料夾（public/assets/{slug}/cards/）掃到的卡，
   後台一張都沒上傳時就用這一組。 */
const ASSET_CARDS = ((window.SITE && window.SITE.assets && window.SITE.assets.cards) || [])
  .map((item, i) => ({
    art:    item.src,
    name:   item.name   || `囍卡 ${i + 1}`,
    rarity: item.rarity || 'N',
    desc:   item.desc   || '',
  }));
ASSET_CARDS.forEach(c => CARDS.push(c));

/* 後台上傳的卡（Firestore）優先於素材資料夾。
   非同步讀進來，到齊之後整批換掉卡池；換完把已經畫好的收藏重畫一次，
   因為收藏只存 cardId，要有卡池才找得到圖。 */

/* Firestore 的第一份 snapshot 回來了沒。
   還沒回來時的「卡池是空的」是「還沒讀到」，不是「新人沒上傳」——
   兩者長得一樣，但只有後者可以把那行字寫出去。 */
let cardsLoaded = false;

function applyOwnerCards(){
  cardsLoaded = true;
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
  updateDrawState();
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
const drawBtn   = document.getElementById('drawBtn');
const drawEmpty = document.getElementById('drawEmpty');
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
/* 讀不到 cards（規則擋下、網路掛掉）就當作「新人沒上傳」處理 ——
   卡池裡剩下的是素材資料夾那一組，空的話一樣要把等待的字寫出來，
   而不是留一顆永遠停用、什麼都不說的按鈕。 */
document.addEventListener('data:cards:denied', ()=>{ cardsLoaded = true; updateDrawState(); });
DataStore.subscribeCards();
renderCollection();

/* ===== 抽卡 ===== */
/* 卡池是空的就不讓人抽 —— 抽出來也只會是一張沒有照片的空卡。
   HTML 上按鈕預設就是 disabled，所以 JS 還沒跑完之前也點不下去。 */
function updateDrawState(){
  const empty = !CARDS.length;
  drawBtn.disabled = empty;
  /* 還沒讀到 Firestore 之前不寫那行字：那時候的「空」是還沒讀到 */
  if(drawEmpty) drawEmpty.hidden = !(empty && cardsLoaded);
}
updateDrawState();

drawBtn.addEventListener('click', ()=>{
  if(drawing || !CARDS.length) return; drawing = true;
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
