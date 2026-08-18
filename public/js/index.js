/* ============================================================
   index.js — 首頁
   ------------------------------------------------------------
   流程：
     首次造訪 → gate（填名字 + 抽記號）→ 倒數 5 秒 → 開幕 → 進入首頁
     已入場   → 跳過 gate，直接顯示首頁
     入場登入關掉（站台文件 entryLoginEnabled: false）
              → 沒有 gate、不倒數，一進來就是首頁

   內容（原本的 info 頁已併進本頁）：
     置中開場 → 婚禮資訊卡（含尋找我的座位）→ 當日流程 → 出席前的小提醒
     → 日期倒數 → RSVP
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
   ------------------------------------------------------------
   entryLoginEnabled 關掉的站台整道 gate 都不出現（見下面的 setupGate）：
   只用大廳與桌次查詢時，賓客沒有一件事需要名字，
   先擋一道「輸入名字」只是把人擋在門外。
============================================================ */
function rollIcon(){
  currentIcon = ICONS[Math.floor(Math.random()*ICONS.length)];
  iconPick.textContent = currentIcon;
  iconPick.classList.remove('roll'); void iconPick.offsetWidth; iconPick.classList.add('roll');
}

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

function setupGate(){
  iconPick.textContent = currentIcon;
  iconPick.addEventListener('click', rollIcon);
  document.getElementById('rerollIcon').addEventListener('click', rollIcon);

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
}

/* 這組新人不用入場登入：整道 gate 從畫面上移除，直接看到大廳。
   ・不跑倒數與開幕簾 —— 那兩段是「按下進場」的獎賞，沒有那個動作就不放
   ・BGM 也不自動開 —— 沒有使用者手勢，瀏覽器本來就會擋掉自動播放，
     賓客想聽的話按右下角那顆音樂鈕（浮動控制照舊） */
function skipGate(){
  gate.remove();
  enterSite();
}

if(entryLoginOn()) setupGate();
else               skipGate();

/* ============================================================
   婚禮資訊（原 info.js；資料全部來自站台設定 window.WED）
============================================================ */
function setText(id, txt){
  const el = document.getElementById(id);
  if(el) el.textContent = txt || '';
}

/* 有填就顯示、沒填就整格收起來（回傳有沒有內容） */
function setOptionalText(id, boxId, txt){
  const val = (txt || '').trim();
  setText(id, val);
  const box = document.getElementById(boxId);
  if(box) box.hidden = !val;
  return !!val;
}

/* ---------- 新人姓名 ----------
   coupleTitle 是新人自己寫的稱呼（後台限 20 個字），沒填就用兩人的名字 */
setText('infoCouple',   W.coupleTitle || W.couple || '');
setText('infoCoupleCn', W.coupleCn || '');

/* ---------- 婚禮 hashtag ----------
   新人沒填的話用預設的兩個，開場不會空一排 */
const tagBox = document.getElementById('lobbyTags');
if(tagBox){
  tagBox.innerHTML = hashtagList()
    .map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
}

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

  /* 資訊卡「時間」那一列的捷徑：有流程可看才出現 */
  const jump = document.getElementById('infoTimeJump');
  if(jump){
    jump.hidden = !list.length;
    jump.addEventListener('click', (e)=>{
      const target = document.getElementById('scheduleBlock');
      if(!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior:'smooth', block:'start' });
    });
  }

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

/* ---------- Dress code / 禮金 / 交通 / 兩人的故事 ----------
   新人沒寫的就不出現：一格都沒填的話整個區塊也收起來，
   大廳才不會出現一堆「我們幫你想好的」罐頭文案。 */
(function renderOptionalBlocks(){
  /* 兩格只填了一格時，讓它佔滿整列（沒填的那格是 hidden，還在 DOM 裡） */
  const layoutGrid = (blockId, filled) => {
    const block = document.getElementById(blockId);
    if(!block) return;
    block.hidden = !filled.some(Boolean);
    const grid = block.querySelector('.note-grid');
    if(grid) grid.classList.toggle('is-solo', filled.filter(Boolean).length === 1);
  };

  const dress = setOptionalText('dressCode', 'dressCodeItem', W.dressCode);
  const gift  = setOptionalText('giftNote',  'giftNoteItem',  W.giftNote);
  layoutGrid('noteBlock', [dress, gift]);

  /* 文字太長，或是新人有放一張圖時，內文只先露出一小段，
     其餘要點「展開更多」才在彈窗裡看完整內容（含圖片） */
  const TRANSPORT_PREVIEW_LEN = 60;
  function setupTransportItem(textId, boxId, moreBtnId, label, text, imgSrc){
    const val = (text || '').trim();
    const box = document.getElementById(boxId);
    const hasContent = !!val || !!imgSrc;
    if(box) box.hidden = !hasContent;
    if(!hasContent) return false;

    const tooLong = val.length > TRANSPORT_PREVIEW_LEN;
    setText(textId, tooLong ? `${val.slice(0, TRANSPORT_PREVIEW_LEN)}…` : val);

    const moreBtn = document.getElementById(moreBtnId);
    if(moreBtn){
      const needsMore = tooLong || !!imgSrc;
      moreBtn.hidden = !needsMore;
      if(needsMore){
        moreBtn.onclick = () => openInfoModal({ title: label, bodyText: val, imgSrc });
      }
    }
    return true;
  }

  const pub  = setupTransportItem('transportPublic',  'transportPublicItem',  'transportPublicMore',
    '大眾運輸', W.transportPublic, W.transportPublicImg);
  const park = setupTransportItem('transportParking', 'transportParkingItem', 'transportParkingMore',
    '停車資訊', W.transportParking, W.transportParkingImg);
  layoutGrid('transportBlock', [pub, park]);

  /* 資訊卡「地點」那一列的捷徑：新人有寫交通資訊才出現，
     跟「時間」那一列的當日流程捷徑是同一套做法 */
  const venueJump = document.getElementById('infoVenueJump');
  if(venueJump){
    venueJump.hidden = !(pub || park);
    venueJump.addEventListener('click', (e)=>{
      const target = document.getElementById('transportBlock');
      if(!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior:'smooth', block:'start' });
    });
  }

  /* 故事只有一段文字，區塊本身就是那一格 */
  setOptionalText('storyText', 'storyBlock', W.story);
})();

/* ============================================================
   Explore：新人自訂的卡片
   ------------------------------------------------------------
   內建的那幾張是模板功能，這裡再補上新人自己寫的內容
   （這場婚禮規劃了什麼、要注意什麼、附上的連結…）。

   兩種類型：
     kind='link'  → 點了開外部連結（另開分頁）
     kind='popup' → 點了跳出彈窗顯示 body 的內文

   資料在 sites/{siteId}/explore，由新人後台 /w/{slug}/admin 維護。
============================================================ */
const linkGrid = document.getElementById('linkGrid');

/* HTML 裡寫死的那幾張是模板卡，重新渲染時要保留 */
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

/* ---------- 彈窗（自訂內容的「跳出說明」跟交通資訊的「展開更多」共用） ---------- */
const lcModal = document.getElementById('lcModal');

function openInfoModal({ title, sub, bodyText, imgSrc }){
  document.getElementById('lcModalTitle').textContent = title || '';
  const subEl = document.getElementById('lcModalSub');
  subEl.textContent = sub || '';
  subEl.hidden = !sub;

  const bodyEl = document.getElementById('lcModalBody');
  bodyEl.innerHTML = '';
  if(imgSrc){
    const img = document.createElement('img');
    img.className = 'lc-modal-img';
    img.src = imgSrc;
    img.alt = '';
    bodyEl.appendChild(img);
  }
  if(bodyText){
    const p = document.createElement('p');
    p.className = 'lc-modal-text';
    p.textContent = bodyText;
    bodyEl.appendChild(p);
  }
  lcModal.classList.add('open');
}
function openExploreModal(it){
  openInfoModal({ title: it.title, sub: it.sub, bodyText: it.body });
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
   HTML 裡寫死的號碼是「全部頁面都開」時的順序；
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

  /* 新人把「開放桌次功能」關起來 → 連結已被移掉，外框也一起收 */
  const seatCta = document.getElementById('infoSeatCta');
  if(seatCta && !seatCta.querySelector('a')) seatCta.hidden = true;

  const grid = document.querySelector('.link-grid');
  if(grid && !grid.querySelector('.link-card')) grid.closest('.link-section').hidden = true;
})();

renumberLinkCards();
