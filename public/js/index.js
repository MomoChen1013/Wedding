/* ============================================================
   index.js — 首頁
   ------------------------------------------------------------
   流程：
     首次造訪 → gate（填名字 + 抽記號）→ 倒數 5 秒 → 開幕 → 進入首頁
     已入場   → 跳過 gate，直接顯示首頁

   內容（原本的 info 頁已併進本頁）：
     置中開場 → 婚禮資訊卡 → 當日流程 → Dress Code → 日期倒數 → RSVP
     → 卡片連結（兩欄）
============================================================ */

const W = window.WED || {};

const iconPick = document.getElementById('iconPick');
const nameInput= document.getElementById('nameInput');
const app      = document.getElementById('app');
const gate     = document.getElementById('gate');
let currentIcon = ICONS[Math.floor(Math.random()*ICONS.length)];

/* ============================================================
   固定背景：素材資料夾有影片就播影片，否則用大圖
   （兩者都是 position:fixed，滾動時不會跟著移動）
============================================================ */
(function applyLobbyBackground(){
  const a   = (window.SITE && window.SITE.assets) || {};
  const box = document.getElementById('siteBg');
  const img = document.getElementById('siteBgImg');
  const vid = document.getElementById('siteBgVideo');
  if(!box) return;

  const videoSrc = a.lobbyVideo || '';
  /* 只認這組新人真的有的素材；沒有就不設 src，瀏覽器不會去要一張不存在的圖 */
  const imgSrc   = a.lobby || a.cover || W.coverImageUrl || '';

  if(videoSrc && vid){
    vid.src = videoSrc;
    vid.hidden = false;
    if(img) img.remove();
    box.classList.remove('is-empty');
    /* 影片載不起來（格式不支援、檔案不在）就退回大圖 */
    vid.addEventListener('error', ()=>{
      vid.remove();
      if(imgSrc) box.insertAdjacentHTML('beforeend', `<img class="bg" src="${imgSrc}" alt="" aria-hidden="true">`);
      else box.classList.add('is-empty');
    }, { once:true });
    return;
  }

  if(vid) vid.remove();
  if(img && imgSrc){
    img.hidden = false;
    img.src = imgSrc;
    img.addEventListener('load',  ()=> box.classList.remove('is-empty'), { once:true });
    img.addEventListener('error', ()=>{ img.remove(); box.classList.add('is-empty'); }, { once:true });
  }else if(img){
    img.remove();
  }
})();

/* ============================================================
   入場 gate
============================================================ */
function rollIcon(){
  currentIcon = ICONS[Math.floor(Math.random()*ICONS.length)];
  iconPick.textContent = currentIcon;
  iconPick.classList.remove('roll'); void iconPick.offsetWidth; iconPick.classList.add('roll');
}
iconPick.textContent = currentIcon;
iconPick.addEventListener('click', rollIcon);
document.getElementById('rerollIcon').addEventListener('click', rollIcon);

function shake(){
  const c=document.querySelector('.gate-card');
  c.animate([{transform:'translateX(0)'},{transform:'translateX(-8px)'},
             {transform:'translateX(8px)'},{transform:'translateX(0)'}],{duration:300});
}

function enterSite(){
  app.style.display='block';
  app.classList.add('app-show');
  setNavVisible(true);
  syncNavUser();
}

function runCountdown(){
  const cd=document.getElementById('countdown'); const num=document.getElementById('countNum');
  cd.style.display='flex'; let n=5; num.textContent=n;
  const t=setInterval(()=>{
    n--;
    if(n<=0){ clearInterval(t); cd.style.display='none'; openCurtain(); return; }
    num.textContent=n;
    num.style.animation='none'; void num.offsetWidth; num.style.animation='countPop .9s ease';
  },1000);
}
function openCurtain(){
  const cur=document.getElementById('curtain'); cur.style.display='block';
  requestAnimationFrame(()=>cur.classList.add('curtain-open'));
  setTimeout(()=>{
    cur.style.display='none';
    enterSite();
    goldFall();
  },1500);
}

/* Google 登入：彈窗成功後自動填名字 + 進場 */
const googleBtn = document.getElementById('googleBtn');
googleBtn.addEventListener('click', async ()=>{
  if(!window.fb || !window.fb.auth){
    console.warn('Firebase 尚未就緒'); shake(); return;
  }
  googleBtn.disabled = true;
  try{
    const provider = new window.fb.GoogleAuthProvider();
    const result   = await window.fb.signInWithPopup(window.fb.auth, provider);
    const dn       = result.user?.displayName || '朋友';
    nameInput.value = dn.slice(0, 12);   // input maxlength=12，超過裁掉
    document.getElementById('enterBtn').click();
  }catch(e){
    console.warn('Google 登入失敗或取消：', e);
    shake();
    googleBtn.disabled = false;
  }
});

/* 進場按鈕 */
document.getElementById('enterBtn').addEventListener('click', ()=>{
  const n = nameInput.value.trim();
  if(!n){ nameInput.focus(); shake(); return; }
  try { saveUser({ name:n, icon:currentIcon }); } catch(e){ console.warn('saveUser failed', e); }
  syncNavUser();
  gate.style.display='none';                   // 先把入口畫面收掉
  runCountdown();                              // 馬上開始倒數
  try { startBGM(); } catch(e){ console.warn('BGM 啟動失敗', e); }  // 音樂掛掉也不影響流程
});

/* 若已經入場過，直接跳過 gate */
if(LS.get('user', null)){
  gate.style.display='none';
  enterSite();
}

/* ============================================================
   婚禮資訊（原 info.js；資料全部來自站台設定 window.WED）
============================================================ */
function setText(id, txt){
  const el = document.getElementById(id);
  if(el) el.textContent = txt || '';
}

/* ---------- 新人姓名 ---------- */
setText('infoCouple',   W.couple || '');
setText('infoCoupleCn', W.coupleCn || '');

/* ---------- 基本資訊 ---------- */
setText('infoDate',  [W.date, W.weekday].filter(Boolean).join('・'));
setText('infoTime',  W.time || '');
setText('infoVenue', [W.city, W.venue].filter(Boolean).join('　'));
setText('infoAddr',  W.address || '');

/* ---------- 日期倒數 ---------- */
startCountdown(document.getElementById('cdGrid'), W.dateISO, 'grid');
setText('cdTarget', W.date ? `${W.date}（${W.weekday || ''}）${W.time || ''}` : '');

/* ---------- 地圖連結 ---------- */
const mapBtn = document.getElementById('mapBtn');
if(mapBtn){
  const q = encodeURIComponent(W.address || W.venue || '');
  mapBtn.href = W.mapUrl || `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/* ---------- 加入行事曆（Google 日曆）---------- */
const calBtn = document.getElementById('calBtn');
if(calBtn){
  const fmt = iso => {
    const d = new Date(iso);
    if(isNaN(d)) return '';
    const p = n => String(n).padStart(2,'0');
    // 用 UTC 產生 Google Calendar 需要的 YYYYMMDDTHHMMSSZ 格式
    return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}T`
         + `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  };
  const start = fmt(W.dateISO);
  const end   = fmt(W.dateEndISO || W.dateISO);
  const title = encodeURIComponent(`${W.couple || ''} 婚禮`);
  const loc   = encodeURIComponent([W.venue, W.address].filter(Boolean).join(' '));
  const det   = encodeURIComponent('一起見證我們的幸福時刻');
  if(start && end){
    calBtn.href = `https://calendar.google.com/calendar/render?action=TEMPLATE`
                + `&text=${title}&dates=${start}/${end}&location=${loc}&details=${det}`;
  } else {
    calBtn.style.display = 'none';
  }
}

/* ---------- 當日流程 ---------- */
const sch = document.getElementById('schedule');
if(sch){
  const list = Array.isArray(W.schedule) ? W.schedule : [];
  if(!list.length){
    sch.innerHTML = `<div class="tl-empty">流程稍後公布，敬請期待</div>`;
  } else {
    sch.innerHTML = list.map(s => `
      <div class="tl-item">
        <div class="tl-time">${escapeHtml(s.time || '')}</div>
        <div class="tl-dot"></div>
        <div class="tl-content">
          <div class="tl-t">${escapeHtml(s.title || '')}</div>
          ${s.desc ? `<div class="tl-d">${escapeHtml(s.desc)}</div>` : ''}
        </div>
      </div>`).join('');
  }
}

/* ---------- Dress code / 禮金 ---------- */
setText('dressCode', W.dressCode || '輕鬆舒適就好，一起把畫面拍得漂漂亮亮');
setText('giftNote',  W.giftNote  || '您的到來就是最好的禮物');

/* ============================================================
   Explore：新人自訂的卡片
   ------------------------------------------------------------
   內建的五張卡是模板功能，這裡再補上新人自己寫的內容
   （這場婚禮規劃了什麼、要注意什麼、附上的連結…）。

   兩種類型：
     kind='link'  → 點了開外部連結（另開分頁）
     kind='popup' → 點了跳出彈窗顯示 body 的內文

   資料在 sites/{siteId}/explore，由新人後台 /w/{slug}/admin 維護。
============================================================ */
const linkGrid = document.getElementById('linkGrid');

/* HTML 裡寫死的五張是模板卡，重新渲染時要保留 */
const builtinCards = linkGrid
  ? Array.from(linkGrid.querySelectorAll('.link-card'))
  : [];

function renderExploreCards(){
  if(!linkGrid) return;

  /* 只清掉上一輪自訂的，內建的原地不動 */
  linkGrid.querySelectorAll('.link-card.is-custom').forEach(el => el.remove());

  const items = DataStore.getExplore().filter(it => it.title);
  items.forEach(it => {
    const isLink = it.kind === 'link' && /^https?:\/\//i.test(it.url || '');
    const el = document.createElement(isLink ? 'a' : 'button');
    el.className = 'link-card is-custom';

    if(isLink){
      el.href = it.url;
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
    }else{
      el.type = 'button';
      el.addEventListener('click', ()=> openExploreModal(it));
    }

    el.innerHTML =
      `<span class="lc-index"></span>` +
      `<span class="lc-title">${escapeHtml(it.title)}</span>` +
      (it.sub ? `<span class="lc-sub">${escapeHtml(it.sub)}</span>` : '') +
      `<span class="lc-go">${isLink ? '開啟連結' : '看內容'}</span>`;

    linkGrid.appendChild(el);
  });

  /* 內建的頁面全關、但新人寫了自訂卡片時，整個區塊要重新露出來 */
  const section = linkGrid.closest('.link-section');
  if(section) section.hidden = !(builtinCards.length || items.length);

  renumberLinkCards();
}

/* ---------- 彈窗 ---------- */
const lcModal = document.getElementById('lcModal');

function openExploreModal(it){
  document.getElementById('lcModalTitle').textContent = it.title || '';
  const sub = document.getElementById('lcModalSub');
  sub.textContent = it.sub || '';
  sub.hidden = !it.sub;
  document.getElementById('lcModalBody').textContent = it.body || '';
  lcModal.classList.add('open');
}
function closeExploreModal(){ lcModal.classList.remove('open'); }

if(lcModal){
  document.getElementById('lcModalClose').addEventListener('click', closeExploreModal);
  lcModal.addEventListener('click', (e)=>{ if(e.target === lcModal) closeExploreModal(); });
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape') closeExploreModal();
  });
}

document.addEventListener('data:explore', renderExploreCards);
DataStore.subscribeExplore();

/* ============================================================
   卡片連結的編號
   HTML 裡寫死的 01～05 是「全部頁面都開」時的號碼；
   這組新人關掉的頁面已經被 rewriteNavLinks 移掉，
   自訂卡片則是接在後面，所以每次都從 01 重編一次，
   不會跳號（例：01、04）。只剩一張時編號沒有意義，直接不顯示。
============================================================ */
function renumberLinkCards(){
  const cards = document.querySelectorAll('.link-grid .link-card');
  cards.forEach((cardEl, i) => {
    const idx = cardEl.querySelector('.lc-index');
    if(!idx) return;
    if(cards.length < 2) idx.remove();
    else idx.textContent = String(i + 1).padStart(2, '0');
  });
}

/* ============================================================
   收尾：站台沒開的頁面，rewriteNavLinks 已把連結整個移除，
   這裡把只剩空殼的區塊也一起收起來
   （自訂卡片是非同步讀進來的，到齊後 renderExploreCards 會再判斷一次）
============================================================ */
(function hideEmptySections(){
  const cta = document.querySelector('.rsvp-cta');
  if(cta && !cta.querySelector('a')) cta.closest('.info-block').hidden = true;

  const grid = document.querySelector('.link-grid');
  if(grid && !grid.querySelector('.link-card')) grid.closest('.link-section').hidden = true;
})();

renumberLinkCards();
