/* ============================================================
   exhibition.js — 橫向時間軸照片牆
   ・每筆資料依照 n（編號）排序，混入幕別分隔卡
   ・沒填年份的卡片不顯示時間列（內建範例就是這種）
   ・卡片下方提供美術館式的描述文字

   內容從哪裡來？（由上而下，先找到就用）
     1. 新人在後台 /w/{slug}/admin「展覽」分頁設定的展品（Firestore `exhibits`）
     2. 素材資料夾 public/assets/{slug}/exhibition/
     3. 下方 ITEMS 的內建範例

   填資料：在下方 ITEMS 陣列加入 {n, type, year, when, src, title, desc, act}
   　　　　幕別分隔卡：{type:'act', label, subtitle, n}
============================================================ */
if(!requireUser()) { /* requireUser 已導向首頁 */ }

/* 以下時間軸是「內建範例」：一則不綁定任何人的新人故事，
   任何一組新人都能直接用，也可以在後台一筆一筆改成自己的。
   ・不寫年份（year 留空）：範例不曉得這對新人是哪一年相遇的，
     與其填錯不如不填，卡片會自動套用 no-year 版型。
   ・src 一律留空：真正的展品照片請放 public/assets/{slug}/exhibition/，
     由下面的 applyExhibitionAssets() 整批取代，沒放素材時也不會去要不存在的圖。
   每筆：{n:編號, type:'photo', year:'年份', when:'說明', src:'照片網址', title:'標題', desc:'描述', act:'第幾幕'}
   幕別分隔卡：{type:'act', label:'第一幕', subtitle:'我們的相遇', n:編號} */
const ITEMS = [
  /* ===== 序章 ===== */
  {n:1,  type:'photo', src:'', title:'我們結婚了',
    desc:'謝謝你走進這條長廊。在說出「我願意」之前，想先讓你看看，我們是怎麼走到今天的。'},
  {n:2,  type:'photo', src:'', title:'在成為「我們」之前',
    desc:'我們曾經是兩條各自往前的線，走過不同的城市、不同的季節，然後在某一天交會了。'},

  /* ===== 第一幕 ===== */
  {n:2.5, type:'act', label:'第一幕', subtitle:'我們的相遇'},
  {n:3,  type:'photo', src:'', act:'第一幕',
    title:'第一次見面',
    desc:'那天其實很平常，平常到我們後來才發現——原來一切就是從那天開始的。'},
  {n:4,  type:'photo', src:'', act:'第一幕',
    title:'聊到捨不得說晚安',
    desc:'從喜歡的電影聊到小時候的糗事，訊息一則接著一則，最後總是誰都不想先說晚安。'},
  {n:5,  type:'photo', src:'', act:'第一幕',
    title:'第一次約會',
    desc:'走了很長一段路，話題沒有停過。回到家才想起來，居然一張合照都忘了拍。'},
  {n:6,  type:'photo', src:'', act:'第一幕',
    title:'從「你和我」變成「我們」',
    desc:'從偶爾見面變成每天分享日常，句子裡的主詞不知不覺就換了。'},

  /* ===== 第二幕 ===== */
  {n:6.5, type:'act', label:'第二幕', subtitle:'一起生活的日子'},
  {n:7,  type:'photo', src:'', act:'第二幕',
    title:'把「回家」講成同一個地方',
    desc:'學會分工洗碗、學會遷就對方的作息，也學會把「回家」講成同一個地方。'},
  {n:8,  type:'photo', src:'', act:'第二幕',
    title:'一起去了很多地方',
    desc:'一起迷過路、一起趕過車、一起在陌生的街角大笑。最好的風景，是回頭時你也在看我。'},
  {n:9,  type:'photo', src:'', act:'第二幕',
    title:'也吵過架',
    desc:'我們當然也吵過架。後來才明白，重要的不是誰有理，而是誰先牽起對方的手。'},
  {n:10, type:'photo', src:'', act:'第二幕',
    title:'見了彼此的家人',
    desc:'手心冒汗的那一天才知道，愛一個人，是連同他的家人一起放進心裡。'},
  {n:11, type:'photo', src:'', act:'第二幕',
    title:'一起撐過的那段時間',
    desc:'工作不順、身體不好、對未來沒把握的時候，你都在——這件事比任何浪漫都重要。'},

  /* ===== 第三幕 ===== */
  {n:11.5, type:'act', label:'第三幕', subtitle:'決定牽著走下去'},
  {n:12, type:'photo', src:'', act:'第三幕',
    title:'求婚那天',
    desc:'沒有電影般的煙火，只有一句「以後每一天都想跟你一起過」，然後兩個人都紅了眼眶。'},
  {n:13, type:'photo', src:'', act:'第三幕',
    title:'一起準備這一天',
    desc:'看場地、試喜餅、選捧花，還為了邀請卡的字體討論了一整晚——原來籌備婚禮也是一種相處練習。'},
  {n:14, type:'photo', src:'', act:'第三幕',
    title:'寫下誓詞',
    desc:'想說的話寫了又刪，最後留下最簡單的那一句：我會陪你走完剩下的路。'},

  /* ===== 第四幕 ===== */
  {n:14.5, type:'act', label:'第四幕', subtitle:'往後的每一天'},
  {n:15, type:'photo', src:'', act:'第四幕',
    title:'給你',
    desc:'往後的日子不會天天浪漫，但我們會天天在一起——這是我們給彼此最實在的承諾。'},
  {n:16, type:'photo', src:'', act:'第四幕',
    title:'給今天在場的你',
    desc:'謝謝你把這一天空下來給我們。故事到這裡才寫到一半，有你在場，這一頁才算完整。'},
  {n:17, type:'photo', src:'', act:'第四幕', finale:true,
    title:'下一張，等你一起入鏡！',
    desc:'這裡留下一張空白照片——來拍一張吧，接下來的故事，換我們一起寫。'},
];

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

/* 後台設定的展品 → 這支檔案原本的資料格式
   （kind='act' 是章節分隔卡，sub 在展品是時間補充、在章節是副標） */
function ownerItems(){
  return DataStore.getExhibits().map((it, i) => (it.kind === 'act'
    ? { n: it.order ?? i, type:'act', label: it.title || '', subtitle: it.sub || '' }
    : { n: it.order ?? i, type:'photo', src: it.img || '',
        year: it.year || '', when: it.sub || '',
        title: it.title || '', desc: it.desc || '', act: it.act || '' }));
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
