/* ============================================================
   exhibition.js — 橫向時間軸照片牆
   ・整條時間軸就是一個橫向捲動容器：手機直接用手指左右滑，
     桌機可以拖曳、按左右方向鍵，或點兩側的箭頭
   ・每張展品用 scroll-snap 停在畫面正中間，停住的那張會放大聚焦
   ・每筆資料依照 n（編號）排序，混入幕別分隔卡
   ・沒填年份的卡片不顯示時間列（內建範例就是這種）
   ・卡片下方提供美術館式的描述文字

   內容從哪裡來？（由上而下，先找到就用）
     1. 新人在後台 /w/{slug}/admin「新人故事牆」分頁設定的故事（Firestore `exhibits`）
     2. 素材資料夾 public/assets/{slug}/exhibition/
     3. js/exhibit-defaults.js 的內建範例（EXHIBIT_DEFAULTS）

   改內建範例：去 js/exhibit-defaults.js —— 那一份後台也在用，
   新人第一次打開「新人故事牆」分頁時會整份寫進他自己的站台當起點。
============================================================ */
if(!requireUser()) { /* requireUser 已導向首頁 */ }

/* exhibits 的欄位（kind/title/sub/desc/year/act/img）→ 這支檔案的時間軸格式。
   後台設定的內容與 EXHIBIT_DEFAULTS 都是同一種欄位，所以共用同一個轉換。
   （kind='act' 是章節分隔卡，sub 在故事是時間補充、在章節是副標） */
function toTimelineItem(it, i){
  const n = (typeof it.order === 'number') ? it.order : (i + 1);
  return it.kind === 'act'
    ? { n, type:'act', label: it.title || '', subtitle: it.sub || '' }
    : { n, type:'photo', src: it.img || '',
        year: it.year || '', when: it.sub || '',
        title: it.title || '', desc: it.desc || '', act: it.act || '',
        finale: it.finale === true };
}

/* 內建範例：一則不綁定任何人的新人故事，任何一組新人都能直接用。
   ・不寫年份：範例不曉得這對新人是哪一年相遇的，與其填錯不如不填，
     卡片會自動套用 no-year 版型。
   ・照片一律留空：真正的照片請放 public/assets/{slug}/exhibition/，
     由下面的 applyExhibitionAssets() 整批取代，沒放素材時也不會去要不存在的圖。 */
const ITEMS = EXHIBIT_DEFAULTS.map(toTimelineItem);

/* 素材資料夾有 exhibition/ 就用客戶自己的展品，否則沿用上面的預設 */
(function applyExhibitionAssets(){
  const list = (window.SITE && window.SITE.assets && window.SITE.assets.exhibition) || [];
  if(!list.length) return;
  ITEMS.length = 0;
  list.forEach((item, i) => {
    ITEMS.push({
      n:     i + 1,
      type:  'photo',
      src:   item.src,
      year:  item.year  || '',
      when:  item.when  || '',
      title: item.title || '',
      desc:  item.desc  || '',
      act:   item.act   || '',
    });
  });
})();

/* 依編號排序 */
ITEMS.sort((a,b)=> a.n - b.n);

const track     = document.getElementById('tlTrack');
const yearBack  = document.getElementById('tlYearBack');
const topProg   = document.getElementById('tlTopbar');
const dotsWrap  = document.getElementById('tlDots');
const prevBtn   = document.getElementById('tlPrev');
const nextBtn   = document.getElementById('tlNext');

/* ===== 渲染所有節點（混合 photo 與 act） ===== */
let photoNodes = [];
let photoData  = [];
let dots       = [];

/* 後台設定的故事牆內容 → 這支檔案的時間軸格式 */
function ownerItems(){
  return DataStore.getExhibits().map(toTimelineItem);
}

function renderTimeline(items){
  /* 只清掉上一輪的節點，軌道那條線是版型的一部分要留著 */
  track.querySelectorAll('.tl-node, .tl-act-div').forEach(el => el.remove());
  dotsWrap.innerHTML = '';
  photoNodes = [];
  photoData  = [];

  items.forEach(item=>{
    if(item.type === 'act'){
      const div = document.createElement('div');
      div.className = 'tl-act-div';
      div.innerHTML = `
        <div class="ac-label">${escapeHtml(item.label || '')}</div>
        <div class="ac-line"></div>
        <div class="ac-sub">${escapeHtml(item.subtitle || '')}</div>
      `;
      track.appendChild(div);
      return;
    }

    const idx       = photoData.length;
    const isFinale  = item.finale === true;
    const fallback  = '';
    const photoHtml = item.src
      ? `<img src="${item.src}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.parentNode.classList.add('no-img');this.remove();" data-fallback="${fallback}">`
      : fallback;

    /* 卡片下方的時間標籤：沒有時間就整列隱藏 */
    const eyebrowText = item.year
      ? (item.when ? `${item.year}・${item.when}` : item.year)
      : '';
    const eyebrowHtml = eyebrowText
      ? `<div class="when">${escapeHtml(eyebrowText)}</div>`
      : '';

    const node = document.createElement('div');
    node.className = 'tl-node' + (isFinale ? ' finale' : '') + (item.year ? '' : ' no-year');
    node.dataset.idx = idx;
    /* 交錯的微微傾斜（拍立得隨手擺放感） */
    node.style.setProperty('--tilt', (idx % 2 === 0 ? '-1.4deg' : '1.6deg'));
    node.innerHTML = `
      <div class="tl-media">
        <div class="tl-ph">${photoHtml}</div>
        <div class="tl-cap">${escapeHtml(item.title)}</div>
      </div>
      <div class="tl-meta">
        ${eyebrowHtml}
        <p class="desc">${escapeHtml(item.desc || '')}</p>
      </div>
    `;
    node.querySelector('.tl-media').addEventListener('click', ()=> openLightbox(idx));
    track.appendChild(node);

    photoNodes.push(node);
    photoData.push(item);

    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'pd' + (photoData.length === 1 ? ' on' : '');
    d.setAttribute('aria-label', `第 ${photoData.length} 張`);
    d.addEventListener('click', ()=> goTo(idx));
    dotsWrap.appendChild(d);
  });

  dots = [...dotsWrap.children];

  /* 重畫之後回到第一張（不用動畫，避免載入時看到一段捲動） */
  jumpTo(0, 'instant');
  syncTimeline();
}

/* 後台有設定就整批換掉，沒有就沿用素材資料夾／內建範例 */
function applyExhibits(){
  const owner = ownerItems();
  renderTimeline(owner.length ? owner.slice().sort((a,b)=> a.n - b.n) : ITEMS);
}
document.addEventListener('data:exhibits', applyExhibits);

/* ============================================================
   捲動邏輯
   ------------------------------------------------------------
   軌道本身就是 overflow-x 的捲動容器：
   ・手機／觸控板：原生捲動，CSS 的 scroll-snap 負責停在正中間
   ・桌機滑鼠    ：按住拖曳（下面的 pointer 事件直接改 scrollLeft）
   ・鍵盤／箭頭  ：goTo() 捲到指定的那一張
   這裡只負責「現在停在第幾張」的視覺同步，不再驅動位移。
============================================================ */

/* 軌道中線目前落在哪一張展品上 */
function nearestIndex(){
  const center = track.scrollLeft + track.clientWidth / 2;
  let nearest = 0, nd = Infinity;
  photoNodes.forEach((n, i)=>{
    const dist = Math.abs(n.offsetLeft + n.offsetWidth / 2 - center);
    if(dist < nd){ nd = dist; nearest = i; }
  });
  return nearest;
}

/* 把第 i 張捲到畫面正中間 */
function jumpTo(i, behavior){
  const node = photoNodes[i];
  if(!node) return;
  const left = node.offsetLeft + node.offsetWidth / 2 - track.clientWidth / 2;
  const max  = Math.max(0, track.scrollWidth - track.clientWidth);
  /* behavior:'instant' 才會忽略 CSS 的 scroll-behavior:smooth（載入時不要看到捲動） */
  track.scrollTo({ left: Math.max(0, Math.min(max, left)), behavior: behavior || 'smooth' });
}
function goTo(i){
  jumpTo(Math.max(0, Math.min(photoNodes.length - 1, i)), 'smooth');
}

/* 聚焦的卡片、年份襯底、進度點、頂部進度條 */
function syncTimeline(){
  const max = Math.max(0, track.scrollWidth - track.clientWidth);
  topProg.style.width = (max > 0 ? track.scrollLeft / max * 100 : 0) + '%';

  /* 一張展品都沒有（新人把內容全刪了）就只更新進度條 */
  if(!photoData.length){
    if(prevBtn) prevBtn.disabled = true;
    if(nextBtn) nextBtn.disabled = true;
    return;
  }

  const nearest = nearestIndex();
  photoNodes.forEach((n, i)=> n.classList.toggle('focus', i === nearest));

  const focusItem = photoData[nearest];
  yearBack.textContent = focusItem.year || '';
  yearBack.classList.toggle('hidden', !focusItem.year);
  dots.forEach((d, i)=> d.classList.toggle('on', i === nearest));

  if(prevBtn) prevBtn.disabled = nearest === 0;
  if(nextBtn) nextBtn.disabled = nearest === photoNodes.length - 1;
}

track.addEventListener('scroll', ()=>{
  /* 捲動事件很密集，一格畫面同步一次就夠 */
  if(syncTimeline.queued) return;
  syncTimeline.queued = true;
  requestAnimationFrame(()=>{ syncTimeline.queued = false; syncTimeline(); });
}, { passive:true });

addEventListener('resize', syncTimeline);

/* 拍立得寬度跟著照片實際尺寸走，圖片載入完位置會變，要重新同步一次 */
track.addEventListener('load', e => {
  if(e.target && e.target.tagName === 'IMG') syncTimeline();
}, true);

/* ===== 桌機：按住左右拖曳 =====
   觸控裝置交給瀏覽器原生的捲動，這裡只接滑鼠，
   免得和手指滑動打架。 */
let dragging = false, startX = 0, startLeft = 0, moved = 0;

track.addEventListener('pointerdown', e=>{
  if(e.pointerType !== 'mouse' || e.button !== 0) return;
  dragging = true; moved = 0;
  startX = e.clientX;
  startLeft = track.scrollLeft;
  track.classList.add('dragging');
});
track.addEventListener('pointermove', e=>{
  if(!dragging) return;
  const dx = e.clientX - startX;
  if(Math.abs(dx) > moved) moved = Math.abs(dx);
  track.scrollLeft = startLeft - dx;
});
function endDrag(){
  if(!dragging) return;
  dragging = false;
  track.classList.remove('dragging');
  /* 放開後停到最近的一張（拖曳中把 snap 關掉了，這裡自己補上） */
  goTo(nearestIndex());
}
track.addEventListener('pointerup', endDrag);
track.addEventListener('pointercancel', endDrag);
track.addEventListener('pointerleave', endDrag);
/* 拖完手放開的那一下不要當成「點開大圖」 */
track.addEventListener('click', e=>{
  if(moved > 6){ e.stopPropagation(); e.preventDefault(); moved = 0; }
}, true);

/* ===== 左右箭頭 ===== */
if(prevBtn) prevBtn.addEventListener('click', ()=> goTo(nearestIndex() - 1));
if(nextBtn) nextBtn.addEventListener('click', ()=> goTo(nearestIndex() + 1));

/* ===== 鍵盤左右 ===== */
addEventListener('keydown', e=>{
  if(e.target.matches('input, textarea')) return;
  if(e.key === 'ArrowRight'){ e.preventDefault(); goTo(nearestIndex() + 1); }
  if(e.key === 'ArrowLeft' ){ e.preventDefault(); goTo(nearestIndex() - 1); }
});

/* ===== lightbox ===== */
const lb     = document.getElementById('lb');
const lbPh   = document.getElementById('lbPh');
const lbT    = document.getElementById('lbT');
const lbDate = document.getElementById('lbDate');
const lbDesc = document.getElementById('lbDesc');

/* 點展品開大圖：節點是重畫的，所以綁在 renderTimeline() 裡逐張掛上 */
function openLightbox(idx){
  const item = photoData[idx];
  if(!item) return;
  lbPh.innerHTML = item.src
    ? `<img src="${item.src}" alt="${escapeHtml(item.title)}" onerror="this.parentNode.innerHTML='';">`
    : '';
  lbT.textContent    = item.title;
  lbDate.textContent = item.year
    ? (item.when ? `${item.year}・${item.when}` : item.year)
    : (item.act || '');
  if(lbDesc) lbDesc.textContent = item.desc || '';
  lb.classList.add('open');
}
document.getElementById('lbClose').onclick = ()=> lb.classList.remove('open');
lb.addEventListener('click', e=>{ if(e.target === lb) lb.classList.remove('open'); });
addEventListener('keydown', e=>{ if(e.key === 'Escape') lb.classList.remove('open'); });

/* 先用素材資料夾／內建範例畫一次，後台設定的展品到了再整批換掉 */
renderTimeline(ITEMS);
DataStore.subscribeExhibits();
