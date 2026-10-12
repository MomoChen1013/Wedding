/* ============================================================
   story-chapters.js — 敘事模組「章節式故事」（sites.storyLayout='chapters'）
   ------------------------------------------------------------
   和 exhibition.js（橫向時間軸）是同一頁的兩種編排，吃同一份 exhibits：
   來源優先序、排序、分章全部在 js/exhibit-story.js，這裡只管畫面。
   site-context.js 依 sites.storyLayout 決定載入哪一支（見 js/wed-model.js
   的 STORY_LAYOUTS），兩支不會同時出現在同一頁。

   ▸ 一章一種節奏，但節奏是**規則**不是亂數
     一則故事落在哪個版面（滿版／左右／細節／留白）由「這一章的第幾張
     有照片的故事」決定。重整理一次，每一則的位置與大小都一樣 ——
     隨機位移看久了是雜訊，不是設計。

   ▸ 素材不足不是壞掉的畫面
     沒有照片的那幾則走 quiet（大量留白＋一句話），沒有年份就不顯示時間列，
     沒有描述就只留標題。新人只寫了文字、一張照片都還沒上傳的時候，
     這一頁會是一本純文字的短篇，而不是一排空框。
============================================================ */
if(!requireUser()) { /* requireUser 已導向首頁 */ }

const panel   = document.querySelector('[data-panel="exhibition"]');
const sceneBody = panel && panel.querySelector('.scene-body');

/* 時間軸的骨架不屬於這一版：CSS 已經先擋住不讓它閃出來，
   這裡把節點真的移除，免得留一堆對不上的 id 在 DOM 裡 */
document.querySelectorAll('.tl-topbar, #tlSec').forEach(el => el.remove());

const wrap = document.createElement('div');
wrap.className = 'sc-wrap';
if(panel) panel.insertBefore(wrap, sceneBody);

/* ============================================================
   版面節奏
   ------------------------------------------------------------
   k = 這一章裡「有照片的第幾則」（從 0 起算）
     第一則一律 full —— 一章的開場要先把調子定下來
     之後 split → detail → split → full 循環

   flip 只換邊（左圖右文 ↔ 右圖左文），照的是**這個版面在這一章出現第幾次**，
   不是 k 的單雙數：CYCLE 長度 4、單雙數週期 2，兩個剛好同步，
   拿 k 判斷的話每一個 split 都會翻面、每一個 detail 都不翻，
   等於沒有換邊。改成各自數各自的，同一種版面才會左一次右一次。

   seen 每一章重來一次：每章的第一張圖都落在同一邊，是這一版刻意的節奏。
============================================================ */
const CYCLE = ['split', 'detail', 'split', 'full'];

function beatShape(item, k, seen){
  if(!item.src) return { shape:'quiet', flip:false };
  const shape = k === 0 ? 'full' : CYCLE[(k - 1) % CYCLE.length];
  const n = seen[shape] = (seen[shape] || 0) + 1;
  return { shape, flip: n % 2 === 0 };
}

/* 時間列：有年份才出現。年份與時間補充都有就用「2019・春天」，
   兩個都沒有就退回 act 字串（素材資料夾常常只填得出這個）。 */
function whenText(item){
  if(item.year) return item.when ? `${item.year}・${item.when}` : item.year;
  return item.when || item.act || '';
}

/* ---------- 一則故事 ---------- */
const photos = [];   /* 供 lightbox 用：畫面上的順序就是這個陣列的順序 */

function buildBeat(item, k, seen){
  const { shape, flip } = beatShape(item, k, seen);
  const beat = document.createElement('div');
  beat.className = `sc-beat is-${shape}` + (flip ? ' flip' : '') + (item.src ? '' : ' no-img');

  const when  = whenText(item);
  const idx   = photos.length;

  if(item.src){
    const media = document.createElement('button');
    media.type = 'button';
    media.className = 'sc-media';
    media.setAttribute('aria-label', `放大：${item.title || '照片'}`);

    const img = document.createElement('img');
    img.className = 'sc-ph';
    img.src = item.src;
    img.alt = item.title || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    /* 載不到就把整格收掉，不要留一個空框在版面中間 */
    img.addEventListener('error', ()=>{ beat.classList.add('no-img'); img.remove(); });

    media.appendChild(img);
    media.addEventListener('click', ()=> openLightbox(idx));
    beat.appendChild(media);
    photos.push(item);
  }

  const cap = document.createElement('div');
  cap.className = 'sc-cap';
  cap.innerHTML =
    (when ? `<div class="sc-when">${escapeHtml(when)}</div>` : '') +
    (item.title ? `<div class="sc-title">${escapeHtml(item.title)}</div>` : '') +
    (item.desc  ? `<p class="sc-desc">${escapeHtml(item.desc)}</p>` : '');
  beat.appendChild(cap);

  return beat;
}

/* ---------- 一章 ---------- */
function buildChapter(ch){
  const sec = document.createElement('section');
  sec.className = 'sc-chapter' + (ch.lead ? ' is-lead' : '');

  const head = document.createElement('header');
  head.className = 'sc-chap-head';
  head.innerHTML =
    '<div class="sc-chap-no"></div>' +
    (ch.label ? `<h2 class="sc-chap-title">${escapeHtml(ch.label)}</h2>` : '') +
    (ch.subtitle ? `<div class="sc-chap-sub">${escapeHtml(ch.subtitle)}</div>` : '') +
    '<div class="sc-chap-rule"></div>';
  sec.appendChild(head);

  let k = 0;
  const seen = {};
  ch.photos.forEach(item => {
    /* 最後一張「換你入鏡」的空白卡不進章節，它是整份故事的結尾 */
    if(item.finale) return;
    sec.appendChild(buildBeat(item, k, seen));
    if(item.src) k++;
  });

  return sec;
}

/* ---------- 結尾卡 ---------- */
function buildFinale(item){
  const box = document.createElement('section');
  box.className = 'sc-finale sc-beat is-quiet';
  box.innerHTML =
    '<div class="sc-chap-no"></div>' +
    (item.title ? `<div class="sc-title">${escapeHtml(item.title)}</div>` : '') +
    (item.desc  ? `<p class="sc-desc">${escapeHtml(item.desc)}</p>` : '');
  return box;
}

/* ---------- 整份重畫 ---------- */
let io = null;

function render(){
  if(!wrap) return;
  if(io){ io.disconnect(); io = null; }
  wrap.innerHTML = '';
  photos.length = 0;

  const items = EXHIBIT_STORY.items();
  const chapters = EXHIBIT_STORY.chapters(items);

  chapters.forEach(ch => wrap.appendChild(buildChapter(ch)));

  const finale = items.find(it => it.type === 'photo' && it.finale);
  if(finale) wrap.appendChild(buildFinale(finale));

  /* 新人把故事全刪光了：給一句話，不要留一片空白讓人以為壞了 */
  if(!wrap.children.length){
    const empty = document.createElement('div');
    empty.className = 'sc-beat is-quiet';
    empty.innerHTML = '<div class="sc-title">故事還在寫</div>' +
      '<p class="sc-desc">新人正在整理他們的故事，過幾天再回來看看。</p>';
    wrap.appendChild(empty);
  }

  revealOnScroll();
}

/* ---------- 進場：進畫面才浮上來 ----------
   一次性的（進來過就不再觀察），往回捲不會再演一次 —— 那會變成
   捲上捲下都在閃。觀察不到（舊瀏覽器沒有 IntersectionObserver）
   就直接全部顯示，內容不會卡在 opacity:0。 */
function revealOnScroll(){
  const targets = wrap.querySelectorAll('.sc-beat, .sc-chap-head');
  if(!('IntersectionObserver' in window)){
    targets.forEach(el => el.classList.add('is-in'));
    return;
  }
  io = new IntersectionObserver((entries, obs)=>{
    entries.forEach(e => {
      if(!e.isIntersecting) return;
      e.target.classList.add('is-in');
      obs.unobserve(e.target);
    });
  }, { rootMargin:'0px 0px -12% 0px' });
  targets.forEach(el => io.observe(el));
}

/* ---------- 放大看照片（沿用 exhibition.html 的 #lb） ---------- */
const lb      = document.getElementById('lb');
const lbPh    = document.getElementById('lbPh');
const lbDate  = document.getElementById('lbDate');
const lbT     = document.getElementById('lbT');
const lbDesc  = document.getElementById('lbDesc');

function openLightbox(i){
  const item = photos[i];
  if(!item || !lb) return;
  if(lbPh) lbPh.innerHTML = item.src
    ? `<img src="${item.src}" alt="${escapeHtml(item.title || '')}">` : '';
  if(lbT)    lbT.textContent    = item.title || '';
  if(lbDate) lbDate.textContent = whenText(item);
  if(lbDesc) lbDesc.textContent = item.desc || '';
  lb.classList.add('open');
}

if(lb){
  const close = ()=> lb.classList.remove('open');
  const closeBtn = document.getElementById('lbClose');
  if(closeBtn) closeBtn.onclick = close;
  lb.addEventListener('click', e=>{ if(e.target === lb) close(); });
  addEventListener('keydown', e=>{ if(e.key === 'Escape') close(); });
}

/* 先用素材資料夾／內建範例畫一次，後台設定的故事到了再整批換掉 */
render();
document.addEventListener('data:exhibits', render);
DataStore.subscribeExhibits();
