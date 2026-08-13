/* ============================================================
   seating.js — 我的桌次
   ------------------------------------------------------------
   ・上半：輸入名字 → 比對 sites/{siteId}/seating → 顯示桌次
   ・下半：新人上傳的桌次圖（sites/{siteId}/seatingImages）
           加上素材資料夾 assets/{slug}/seating/ 的圖，
           點圖可全螢幕放大、拖曳移動

   比對規則（由寬到嚴，先找到就用）：
     1. 正規化後完全相同         王小明 → 王小明
     2. 名單的名字包含輸入的字   王小明 → 小明
     3. 輸入的字包含名單的名字   王小明先生 → 王小明
   三種都找不到才顯示查無資料。
============================================================ */

const stForm   = document.getElementById('stForm');
const stInput  = document.getElementById('stInput');
const stResult = document.getElementById('stResult');
const stHint   = document.getElementById('stHint');

/* 桌次名單還沒讀回來之前先擋著，避免誤報「查無資料」 */
let seatingLoaded = false;

DataStore.subscribeSeating();

/* 這場婚禮有開「給你的信」的話，順便查一下有沒有寫給這位賓客的信。
   賓客查完桌次通常就走了，這裡是最自然的提醒時機。
   沒開那一頁就完全不訂閱，不做多餘的讀取。 */
const letterOn = !!(window.SITE && window.SITE.isEnabled('letter'));
if(letterOn) DataStore.subscribeBlessings();

/* 查到桌次後，附上「有一封信在等你」的入口。
   帶上 ?name= 讓信件頁直接開信，賓客不用再打一次名字。 */
function letterNote(name){
  if(!letterOn) return '';
  const hit = findBlessing(name, DataStore.getBlessings());
  if(!hit) return '';

  const href = `${window.SITE.pathFor('letter')}?name=${encodeURIComponent(name)}`;
  const text = hit.personal
    ? '新人寫了一封信給你'
    : '新人寫了一封信給大家';
  return `
    <a class="st-letter" href="${escapeHtml(href)}">
      <span class="st-letter-mark">✉</span>
      <span class="st-letter-text">${text}</span>
      <span class="st-letter-go">拆開來看</span>
    </a>`;
}

/* ============================================================
   查詢
============================================================ */
function findSeats(input){
  const q = normKey(input);
  if(!q) return [];

  const rows = DataStore.getSeating()
    .map(r => ({ ...r, _k: normKey(r.name) }))
    .filter(r => r._k);

  const exact = rows.filter(r => r._k === q);
  if(exact.length) return exact;

  /* 只輸入名字（沒有姓）也找得到 */
  const contains = rows.filter(r => r._k.includes(q));
  if(contains.length) return contains;

  /* 「王小明先生」這種多帶了稱謂的情況 */
  return rows.filter(r => q.includes(r._k));
}

/* 同一桌還有誰（讓賓客知道旁邊坐的是誰，也方便一群人一起找位子） */
function tableMates(table, exclude){
  const t = normKey(table);
  return DataStore.getSeating()
    .filter(r => normKey(r.table) === t && r.id !== exclude)
    .map(r => r.name)
    .filter(Boolean);
}

function renderResult(list, typed){
  if(!list.length){
    stResult.innerHTML = `
      <div class="st-card st-card-miss">
        <div class="st-miss-mark">?</div>
        <div class="st-miss-title">找不到「${escapeHtml(typed)}」</div>
        <div class="st-miss-body">
          可能是名字的寫法跟邀請卡上不一樣，換個寫法再試一次；<br>
          或是直接看下面的桌次圖，也可以問問現場的工作人員。
        </div>
      </div>`;
    return;
  }

  stResult.innerHTML = list.map(r => {
    const mates = tableMates(r.table, r.id);
    return `
      <div class="st-card">
        <div class="st-card-name">${escapeHtml(r.name)}</div>
        <div class="st-card-label">你的桌次</div>
        <div class="st-card-table">${escapeHtml(r.table)}</div>
        ${r.note ? `<div class="st-card-note">${escapeHtml(r.note)}</div>` : ''}
        ${mates.length ? `
          <div class="st-mates">
            <div class="st-mates-label">同桌的還有</div>
            <div class="st-mates-list">${mates.map(n =>
              `<span class="st-mate">${escapeHtml(n)}</span>`).join('')}</div>
          </div>` : ''}
        ${letterNote(r.name)}
      </div>`;
  }).join('');

  try{ goldFall(); }catch{}
}

function doSearch(){
  const typed = stInput.value.trim();
  if(!typed){
    stInput.focus();
    stResult.innerHTML = '';
    return;
  }
  if(!seatingLoaded){
    stResult.innerHTML = `<div class="st-loading">正在讀取名單…</div>`;
    return;
  }
  renderResult(findSeats(typed), typed);
}

stForm.addEventListener('submit', (e)=>{ e.preventDefault(); doSearch(); });

/* 名單進來後：更新提示文字，若使用者已經打過字就自動重查一次 */
document.addEventListener('data:seating', ()=>{
  seatingLoaded = true;
  const n = DataStore.getSeating().length;
  stHint.textContent = n
    ? `輸入邀請卡上的名字就可以了・大小寫、空白都沒關係`
    : `新人還沒上傳桌次名單，可以先看看下面的桌次圖`;
  if(stInput.value.trim()) doSearch();
});

document.addEventListener('data:seating:denied', ()=>{
  seatingLoaded = true;
  stHint.textContent = '桌次名單暫時讀不到，請看下面的桌次圖';
});

/* 信件比桌次晚到的話，重畫一次結果卡，把「有一封信」補上去 */
document.addEventListener('data:blessings', ()=>{
  if(stInput.value.trim() && stResult.innerHTML) doSearch();
});

/* 進場前先幫賓客把名字填好，少打一次字 */
if(me_user && me_user.name && me_user.name !== '朋友'){
  stInput.value = me_user.name;
}

/* ============================================================
   桌次圖
   ・新人後台上傳的（Firestore，data URL）
   ・素材資料夾 assets/{slug}/seating/ 裡的（manifest.json）
   兩邊都有就一起顯示，後台上傳的排前面
============================================================ */
const chartsSec  = document.getElementById('stCharts');
const chartGrid  = document.getElementById('stChartGrid');

function assetCharts(){
  const list = (window.SITE && window.SITE.assets && window.SITE.assets.seating) || [];
  return list.map((it, i) => ({
    img: it.src,
    title: it.title || `桌次圖 ${i + 1}`,
  }));
}

function renderCharts(){
  const uploaded = DataStore.getSeatingImages().map((it, i) => ({
    img: it.img,
    title: it.title || `桌次圖 ${i + 1}`,
  }));
  const all = uploaded.concat(assetCharts()).filter(it => it.img);

  if(!all.length){
    chartsSec.hidden = true;
    return;
  }
  chartsSec.hidden = false;
  chartGrid.innerHTML = all.map((it, i) => `
    <figure class="st-chart" data-i="${i}" tabindex="0" role="button"
            aria-label="放大看 ${escapeHtml(it.title)}">
      <img src="${escapeHtml(it.img)}" alt="${escapeHtml(it.title)}" loading="lazy">
      <figcaption>${escapeHtml(it.title)}</figcaption>
    </figure>`).join('');

  /* 載不到的圖整格移除，不留破圖 */
  chartGrid.querySelectorAll('img').forEach(img => {
    img.addEventListener('error', ()=> img.closest('.st-chart')?.remove(), { once:true });
  });

  chartGrid.querySelectorAll('.st-chart').forEach(el => {
    const open = ()=> openLightbox(all[+el.dataset.i]);
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); }
    });
  });
}

document.addEventListener('data:seatingImages', renderCharts);
renderCharts();

/* ============================================================
   放大檢視：點一下切換 1x / 2.4x，放大後可拖曳
============================================================ */
const lb      = document.getElementById('stLb');
const lbImg   = document.getElementById('stLbImg');
const lbTitle = document.getElementById('stLbTitle');
const lbStage = document.getElementById('stLbStage');

let zoom = 1, panX = 0, panY = 0;
let dragging = false, startX = 0, startY = 0, movedFar = false;

function applyTransform(){
  lbImg.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  lbStage.classList.toggle('is-zoomed', zoom > 1);
}

function openLightbox(item){
  lbImg.src = item.img;
  lbImg.alt = item.title;
  lbTitle.textContent = item.title;
  zoom = 1; panX = 0; panY = 0; applyTransform();
  lb.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeLightbox(){
  lb.hidden = true;
  lbImg.src = '';
  document.body.style.overflow = '';
}

document.getElementById('stLbClose').addEventListener('click', closeLightbox);
lb.addEventListener('click', (e)=>{ if(e.target === lb) closeLightbox(); });
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape' && !lb.hidden) closeLightbox();
});

/* 拖曳移動（滑鼠與觸控共用 pointer events） */
lbStage.addEventListener('pointerdown', (e)=>{
  if(zoom === 1) return;
  dragging = true; movedFar = false;
  startX = e.clientX - panX; startY = e.clientY - panY;
  lbStage.setPointerCapture(e.pointerId);
});
lbStage.addEventListener('pointermove', (e)=>{
  if(!dragging) return;
  panX = e.clientX - startX; panY = e.clientY - startY;
  movedFar = true;
  applyTransform();
});
lbStage.addEventListener('pointerup', (e)=>{
  if(dragging){
    dragging = false;
    lbStage.releasePointerCapture(e.pointerId);
    /* 剛剛是在拖曳，就不要順便觸發縮放 */
    if(movedFar) return;
  }
  zoom = zoom > 1 ? 1 : 2.4;
  if(zoom === 1){ panX = 0; panY = 0; }
  applyTransform();
});
