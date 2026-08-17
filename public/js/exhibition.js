/* ============================================================
   exhibition.js — 橫向時間軸照片牆
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
const tlSec     = document.getElementById('tlSec');
const yearBack  = document.getElementById('tlYearBack');
const topProg   = document.getElementById('tlTopbar');
const dotsWrap  = document.getElementById('tlDots');

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

    const d = document.createElement('div');
    d.className = 'pd' + (photoData.length === 1 ? ' on' : '');
    dotsWrap.appendChild(d);
  });

  dots = [...dotsWrap.children];

  /* ===== 動態高度（節點越多滾得越久） ===== */
  tlSec.style.height = Math.max(300, 100 + items.length * 70) + 'vh';

  dragOffset = 0;
  recalc();
  onScroll();
}

/* 後台有設定就整批換掉，沒有就沿用素材資料夾／內建範例 */
function applyExhibits(){
  const owner = ownerItems();
  renderTimeline(owner.length ? owner.slice().sort((a,b)=> a.n - b.n) : ITEMS);
}
document.addEventListener('data:exhibits', applyExhibits);

/* ===== 滾動邏輯 ===== */
let dragOffset = 0;
let maxShift   = 0;

function recalc(){
  maxShift = track.scrollWidth - window.innerWidth + window.innerWidth * 0.06;
}
addEventListener('resize', ()=>{ recalc(); onScroll(); });
/* 拍立得寬度跟著照片實際尺寸走，圖片載入完要重算總寬度 */
track.addEventListener('load', e => {
  if(e.target && e.target.tagName === 'IMG'){ recalc(); onScroll(); }
}, true);

function onScroll(){
  const r = tlSec.getBoundingClientRect();
  const total = tlSec.offsetHeight - window.innerHeight;

  const sc = window.scrollY;
  const h  = document.documentElement.scrollHeight - window.innerHeight;
  topProg.style.width = (h > 0 ? sc / h * 100 : 0) + '%';

  /* 一張展品都沒有（新人把內容全刪了）就只更新進度條 */
  if(!photoData.length) return;

  let p = 0;
  if(r.top <= 0 && r.bottom >= window.innerHeight) p = (-r.top) / total;
  else if(r.top > 0) p = 0;
  else p = 1;
  p = Math.max(0, Math.min(1, p));

  const base = p * maxShift;
  const x = Math.max(0, Math.min(maxShift, base - dragOffset));
  track.style.transform = 'translateX(' + (-x) + 'px)';

  const centerX = window.innerWidth / 2;
  let nearest = 0, nd = Infinity;
  photoNodes.forEach((n, i)=>{
    const nr = n.getBoundingClientRect();
    const nc = nr.left + nr.width / 2;
    const dist = Math.abs(nc - centerX);
    if(dist < nd){ nd = dist; nearest = i; }
  });
  photoNodes.forEach((n, i)=> n.classList.toggle('focus', i === nearest));

  const focusItem = photoData[nearest];
  yearBack.textContent = focusItem.year || '';
  yearBack.classList.toggle('hidden', !focusItem.year);
  dots.forEach((d, i)=> d.classList.toggle('on', i === nearest));
}
addEventListener('scroll', onScroll, {passive:true});

/* ===== 拖曳橫向（只在 sticky 釘住時可動） ===== */
let dragging = false, startX = 0, startOffset = 0;
track.addEventListener('pointerdown', e=>{
  const r = tlSec.getBoundingClientRect();
  if(r.top > 0 || r.bottom < window.innerHeight) return;
  dragging = true; startX = e.clientX; startOffset = dragOffset;
  track.setPointerCapture(e.pointerId);
});
track.addEventListener('pointermove', e=>{
  if(!dragging) return;
  dragOffset = startOffset + (e.clientX - startX);
  onScroll();
});
track.addEventListener('pointerup',     ()=> dragging = false);
track.addEventListener('pointercancel', ()=> dragging = false);

/* ===== 鍵盤左右 ===== */
addEventListener('keydown', e=>{
  if(e.target.matches('input, textarea')) return;
  if(e.key === 'ArrowRight'){ dragOffset -= window.innerWidth * 0.35; onScroll(); }
  if(e.key === 'ArrowLeft' ){ dragOffset += window.innerWidth * 0.35; onScroll(); }
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
