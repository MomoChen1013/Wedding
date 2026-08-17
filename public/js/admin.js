/* ============================================================
   admin.js — 新人後台
   ------------------------------------------------------------
   一個地方管九件事：
     1. 出席回覆   — 賓客送出的 RSVP：統計、篩選、匯出
     2. 悄悄話     — 賓客投進信箱的悄悄話（原本的 /inbox 頁已併進這裡）
     3. 大廳內容   — 地點、Dress Code、禮金說明、當日流程（寫回 sites 文件）
     4. 桌次       — 上傳桌次圖、匯入賓客名單
     5. 感謝信     — 寫給特定賓客的電子信
     6. 首頁卡片   — Explore 區的自訂模組（連結型／彈窗型）
     7. 婚禮小卡   — 抽卡頁的卡池：裁切上傳照片、設等級與說明
     8. 新人故事牆 — 戀愛時光的故事與章節分隔卡
     9. 熟悉測驗   — 「看你多了解我們」的題目、選項與正確答案

   門檻是 Google 登入，不是密碼：
   Security Rules 只讓 sites.ownerEmails 名單內、信箱已驗證的帳號讀寫，
   所以這裡沒有任何「純前端遮罩」——改了 DOM 也讀不到、寫不進去。
============================================================ */

const pwGate   = document.getElementById('pwGate');
const pwErr    = document.getElementById('pwErr');
const loginBtn = document.getElementById('ownerLoginBtn');
const adPage   = document.getElementById('adPage');

/* ============================================================
   小工具
============================================================ */

/* ---------- Toast（可以同時疊好幾則，各自獨立計時淡出） ---------- */
const toastStackEl = document.getElementById('adToastStack');

function showToast(msg, opts){
  opts = opts || {};
  const el = document.createElement('div');
  el.className = 'ad-toast' + (opts.isError ? ' is-error' : '');
  el.innerHTML = `<span class="ad-toast-msg"></span>` +
    (opts.actionLabel ? `<button type="button" class="ad-toast-action"></button>` : '');
  el.querySelector('.ad-toast-msg').textContent = msg;
  toastStackEl.appendChild(el);

  const duration = opts.duration ?? (opts.isError ? 5200 : 2600);
  let dismissed = false;
  function dismiss(){
    if(dismissed) return;
    dismissed = true;
    clearTimeout(timer);
    el.classList.add('is-out');
    setTimeout(()=> el.remove(), 220);
  }
  const timer = setTimeout(dismiss, duration);

  if(opts.actionLabel){
    const btn = el.querySelector('.ad-toast-action');
    btn.textContent = opts.actionLabel;
    btn.addEventListener('click', ()=>{
      if(opts.onAction) opts.onAction();
      dismiss();
    });
  }
  return { dismiss };
}

/* 既有呼叫點都是 toast(msg, isError)，維持相容，不用逐一改 */
function toast(msg, isError){
  return showToast(msg, { isError: !!isError });
}

/* 寫入失敗多半是規則擋下來的，講清楚原因比丟 code 有用 */
function writeFailed(err){
  console.warn('[admin] 寫入失敗', err);
  if(err && err.code === 'permission-denied'){
    toast('沒有寫入權限：這個 Google 帳號不在 ownerEmails 名單裡', true);
  }else{
    toast(`存檔失敗：${(err && err.message) || '請再試一次'}`, true);
  }
}

function fmtTime(ts){
  const d = new Date(ts || Date.now());
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------- 匯出 CSV（出席回覆與悄悄話共用） ----------
   檔名一律是 {名稱}-{slug}-{日期}.csv。
   Excel 打開中文會亂碼，所以開頭加上 BOM。 */
function csvCell(v){
  return `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
}

function downloadCsv(name, header, rows){
  const csv  = '﻿' + [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `${name}-${window.SITE.slug}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ============================================================
   表單即時驗證
   ------------------------------------------------------------
   離開欄位（blur）才第一次驗證；驗出錯之後，改成跟著 input 即時更新 ——
   使用者一開始打字不會馬上被罵，改到對為止才會立刻看到「對了」。
============================================================ */
function setFieldError(el, msg){
  el.classList.toggle('is-invalid', !!msg);
  let err = el._adErrEl;
  if(!err){
    err = document.createElement('div');
    err.className = 'ad-field-err';
    el.insertAdjacentElement('afterend', err);
    el._adErrEl = err;
  }
  err.textContent = msg || '';
}

/* 表單重置時用：連「動過沒」一起清掉，重開彈窗才是一張乾淨的表單 */
function clearFieldError(el){
  el._adTouched = false;
  setFieldError(el, '');
}

function liveValidate(el, validateFn){
  const run = ()=>{
    const msg = validateFn(el.value);
    setFieldError(el, msg);
    return !msg;
  };
  /* 沒動過的空欄位不會因為「路過」就變紅：一來剛打開彈窗就被罵很煩，
     二來錯誤訊息一冒出來會把底下的按鈕往下推，使用者按到一半的那一下就落空了。
     真的要送出時還是會整份驗一次（submit 各自呼叫 _adValidate）。 */
  el.addEventListener('blur', ()=>{ if(el._adTouched || el.value.trim()) run(); });
  el.addEventListener('input', ()=>{
    el._adTouched = true;
    if(el.classList.contains('is-invalid')) run();
  });
  el._adValidate = run;
  return run;
}

const notBlank = (label) => (v) => v.trim() ? '' : `${label}不能是空的`;
const urlOrBlank = (v) => (!v.trim() || /^https?:\/\//i.test(v.trim()))
  ? '' : '請輸入 http:// 或 https:// 開頭的網址';

/* ============================================================
   分頁筆數（RSVP／桌次名單／悄悄話清單共用）
============================================================ */
const PAGE_SIZES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

function pagerState(key){
  return { key, page: 1, size: LS.get(`pageSize.${key}`, 20) };
}

/* 在 listEl 後面插入／更新分頁列；total 是篩選後的筆數。
   onChange(state) 在頁碼或每頁筆數變動時呼叫，通常是重新呼叫對應的 renderXxx()。 */
function renderPager(listEl, state, total, onChange){
  const pages = Math.max(1, Math.ceil(total / state.size));
  if(state.page > pages) state.page = pages;
  if(state.page < 1) state.page = 1;

  let el = listEl._adPagerEl;
  if(!el){
    el = document.createElement('div');
    el.className = 'ad-pager';
    listEl.insertAdjacentElement('afterend', el);
    listEl._adPagerEl = el;
  }

  if(total <= PAGE_SIZES[0] && pages <= 1){
    el.innerHTML = '';
    return;
  }

  el.innerHTML = `
    <span>共 ${total} 筆・第 ${state.page} / ${pages} 頁</span>
    <div class="ad-pager-nav">
      <button class="ad-pager-btn" type="button" data-pg="prev" ${state.page <= 1 ? 'disabled' : ''}>上一頁</button>
      <button class="ad-pager-btn" type="button" data-pg="next" ${state.page >= pages ? 'disabled' : ''}>下一頁</button>
      <label class="ad-pager-size">每頁
        <select>${PAGE_SIZES.map(n => `<option value="${n}"${n === state.size ? ' selected' : ''}>${n}</option>`).join('')}</select>
      筆</label>
    </div>`;

  el.querySelector('[data-pg="prev"]').addEventListener('click', ()=>{
    state.page = Math.max(1, state.page - 1);
    onChange();
  });
  el.querySelector('[data-pg="next"]').addEventListener('click', ()=>{
    state.page = Math.min(pages, state.page + 1);
    onChange();
  });
  el.querySelector('select').addEventListener('change', (e)=>{
    state.size = Number(e.target.value) || 20;
    state.page = 1;
    LS.set(`pageSize.${state.key}`, state.size);
    onChange();
  });
}

/* ============================================================
   Loading skeleton
   ------------------------------------------------------------
   訂閱剛送出、Firestore 第一筆 snapshot 還沒回來時顯示，
   跟「真的沒有資料」的空狀態區分開，畫面才不會忽閃忽現。
============================================================ */
const loadedOnce = new Set();
['rsvps', 'letters', 'seating', 'seatingImages', 'blessings', 'explore', 'cards', 'exhibits', 'quiz']
  .forEach(key => {
    document.addEventListener(`data:${key}`, ()=> loadedOnce.add(key));
    document.addEventListener(`data:${key}:denied`, ()=> loadedOnce.add(key));
  });

function skeletonHtml(rows, widths){
  widths = widths || ['70%', '40%'];
  let out = '<div class="ad-skel">';
  for(let i = 0; i < rows; i++){
    out += '<div class="ad-skel-row">' +
      widths.map(w => `<div class="ad-skel-line" style="--w:${w}"></div>`).join('') +
      '</div>';
  }
  return out + '</div>';
}

/* ============================================================
   站內統一的確認 Modal（取代原生 confirm()）
   ------------------------------------------------------------
   requirePhrase 有值時，輸入框要完全比對才能按確定 —— 用在整批清空這類
   一旦按下去就回不來的操作；一般的單筆刪除只需要按一下確定。
============================================================ */
const modalMaskEl    = document.getElementById('adModalMask');
const modalCardEl    = modalMaskEl.querySelector('.ad-modal-card');
const modalTitleEl   = document.getElementById('adModalTitle');
const modalMsgEl     = document.getElementById('adModalMsg');
const modalPhraseEl  = document.getElementById('adModalPhrase');
const modalCancelBtn = document.getElementById('adModalCancel');
const modalConfirmBtn= document.getElementById('adModalConfirm');

function confirmModal({ title, message, danger, requirePhrase, confirmText, cancelText }){
  return new Promise(resolve => {
    modalTitleEl.textContent = title || '確定嗎？';
    modalMsgEl.textContent = message || '';
    modalCardEl.classList.toggle('is-danger', !!danger);
    modalConfirmBtn.textContent = confirmText || '確定';
    modalCancelBtn.textContent = cancelText || '取消';

    modalPhraseEl.hidden = !requirePhrase;
    modalPhraseEl.value = '';
    modalPhraseEl.placeholder = requirePhrase ? `輸入「${requirePhrase}」` : '';
    modalConfirmBtn.disabled = !!requirePhrase;

    function onPhraseInput(){
      modalConfirmBtn.disabled = modalPhraseEl.value.trim() !== requirePhrase;
    }
    if(requirePhrase) modalPhraseEl.addEventListener('input', onPhraseInput);

    function close(result){
      modalMaskEl.hidden = true;
      modalPhraseEl.removeEventListener('input', onPhraseInput);
      modalConfirmBtn.removeEventListener('click', onConfirm);
      modalCancelBtn.removeEventListener('click', onCancel);
      modalMaskEl.removeEventListener('click', onMaskClick);
      document.removeEventListener('keydown', onKeydown);
      resolve(result);
    }
    function onConfirm(){ if(!modalConfirmBtn.disabled) close(true); }
    function onCancel(){ close(false); }
    function onMaskClick(e){ if(e.target === modalMaskEl) close(false); }
    function onKeydown(e){ if(e.key === 'Escape') close(false); }

    modalConfirmBtn.addEventListener('click', onConfirm);
    modalCancelBtn.addEventListener('click', onCancel);
    modalMaskEl.addEventListener('click', onMaskClick);
    document.addEventListener('keydown', onKeydown);

    modalMaskEl.hidden = false;
    (requirePhrase ? modalPhraseEl : modalConfirmBtn).focus();
  });
}

/* ============================================================
   表單彈窗（桌次名單、感謝信、故事牆、測驗題目、自訂內容共用）
   ------------------------------------------------------------
   點灰底、按 Esc 都等於「取消」。要先問一句再關的彈窗（例如
   貼了一半的桌次名單）就自己傳 requestClose 進來接手。
   確認框自己也吃 Esc，兩層一起關掉會很怪，所以它開著的時候不動作。
============================================================ */
function registerFormModal(mask, requestClose){
  const close = requestClose || (()=>{ mask.hidden = true; });
  mask.addEventListener('click', (e)=>{ if(e.target === mask) close(); });
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape' && !mask.hidden && modalMaskEl.hidden) close();
  });
  return close;
}

/* ============================================================
   單筆刪除：復原 toast（5 秒內可以按「復原」）
   ------------------------------------------------------------
   confirm 完先在畫面上藏起來（不是真的刪），5 秒後才真的送出刪除；
   按「復原」就取消，畫面上的項目原地回來。
============================================================ */
const pendingDeletes = {}; // { colName: Set<id> }

function isPendingDelete(col, id){
  return !!(pendingDeletes[col] && pendingDeletes[col].has(id));
}

function scheduleUndoDelete(col, id, label, rerender){
  (pendingDeletes[col] || (pendingDeletes[col] = new Set())).add(id);
  rerender();
  const timer = setTimeout(async ()=>{
    pendingDeletes[col].delete(id);
    try{
      await DataStore.removeDoc(col, id);
    }catch(err){
      writeFailed(err);
      rerender();
    }
  }, 5000);

  showToast(`${label}已刪除`, {
    actionLabel: '復原',
    duration: 5000,
    onAction(){
      clearTimeout(timer);
      pendingDeletes[col].delete(id);
      rerender();
    },
  });
}

/* ============================================================
   登入
============================================================ */
function showError(msg){
  pwErr.textContent = msg;
  const card = document.querySelector('#pwGate .gate-card');
  if(card){
    card.animate(
      [{transform:'translateX(0)'},{transform:'translateX(-8px)'},
       {transform:'translateX(8px)'},{transform:'translateX(0)'}],
      { duration:300 }
    );
  }
}

/* ============================================================
   哪一個分頁對應到哪一個頁面開關
   ------------------------------------------------------------
   這組新人沒開的頁面，後台就不該出現那一區的編輯內容 ——
   關掉「抽卡」卻還在後台傳婚禮小卡，傳完賓客也看不到。
   值是 null 代表「永遠都在」：大廳是必開的頁面。
============================================================ */
const TAB_PAGE = {
  rsvp:     'rsvp',
  lobby:    null,
  seating:  'seating',
  letters:  'letter',
  cards:    'draw',
  exhibits: 'exhibition',
  quiz:     'quiz',
};

function tabEnabled(tab){
  const key = TAB_PAGE[tab];
  if(!key) return true;
  return !!(window.SITE && window.SITE.isEnabled(key));
}

/* 關掉的分頁連按鈕帶內容一起收起來（面板的顯示交給 activateTab 統一處理） */
function applyTabVisibility(){
  document.querySelectorAll('#adSide .ad-tab').forEach(btn => {
    btn.hidden = !tabEnabled(btn.dataset.tab);
  });
}

let opened = false;
function openAdmin(){
  if(opened) return;
  opened = true;
  pwGate.style.display = 'none';
  adPage.hidden = false;

  const user = window.fb.auth.currentUser;
  document.getElementById('adWho').textContent =
    `${(window.WED && window.WED.couple) || ''}・${user ? user.email : ''}`;
  /* 「查看網站」在桌機留在頂列，<900px 搬進抽屜底部（見 CSS），兩顆都要指到同一個網址 */
  document.getElementById('adViewBtn').href = sitePath('lobby');
  document.getElementById('adViewBtnMobile').href = sitePath('lobby');

  applyTabVisibility();
  initRouter();

  /* 訂閱各份資料，畫面隨著資料變動重畫。
     沒開的頁面連訂閱都省下來，不做白工的讀取。 */
  if(tabEnabled('rsvp')){
    DataStore.subscribeRsvps();
    fillRsvpFormSettings();
    renderRsvps();
  }
  if(tabEnabled('seating')){
    DataStore.subscribeSeating();
    renderSeatList();
    renderImages();
    syncSeatSearchUI();
  }
  if(tabEnabled('letters')){ DataStore.subscribeBlessings(); renderLetters(); }
  if(tabEnabled('cards')){ DataStore.subscribeCards(); renderCards(); }
  if(tabEnabled('exhibits')){ DataStore.subscribeExhibits(); renderExhibits(); }
  if(tabEnabled('quiz')){
    DataStore.subscribeQuiz();
    DataStore.subscribeQuizVotes();
    renderQuiz();
    renderQuizVotes();
  }
  /* 悄悄話與首頁卡片沒有對應的頁面開關，永遠都在：
     信是從祝福牆投進來的，就算祝福牆之後關掉，收到的信也要看得到 */
  DataStore.subscribeLetters();
  renderInbox();
  DataStore.subscribeExplore();
  renderExplore();

  /* 大廳文案不是子集合，是站台文件本身；載入時已經讀進 window.SITE.data */
  fillSiteForm();
  renderSchedule(siteSchedule());
}

loginBtn.addEventListener('click', async ()=>{
  pwErr.innerHTML = '&nbsp;';
  loginBtn.disabled = true;
  try{
    const email = await signInAsOwner();
    if(isSiteOwner()){
      openAdmin();
    }else{
      showError(`${email || '這個帳號'} 不在這場婚禮的新人名單裡`);
    }
  }catch(e){
    if(e && e.code === 'auth/popup-closed-by-user'){
      pwErr.innerHTML = '&nbsp;';
    }else{
      showError('登入沒有成功，請再試一次');
    }
  }
  loginBtn.disabled = false;
});

async function ownerLogout(){
  try{ await window.fb.signOut(window.fb.auth); }catch{}
  location.reload();
}
document.getElementById('adLock').addEventListener('click', ownerLogout);
document.getElementById('adLockMobile').addEventListener('click', ownerLogout);

if(!ownerEmails().length){
  loginBtn.disabled = true;
  pwErr.textContent = '這個站台還沒設定新人的 Google 信箱（ownerEmails）';
}else{
  window.fb.onAuthStateChanged(window.fb.auth, ()=>{
    if(isSiteOwner()) openAdmin();
  });
}

/* ============================================================
   分頁路由
   ------------------------------------------------------------
   網址格式：#tab 或 #tab/subtab（有橫向子分頁的分頁見 SUBTABS）。
   這樣重新整理、分享連結、瀏覽器上一頁都能回到原本開著的那一頁。
============================================================ */
const SUBTABS = {
  lobby:   ['info', 'schedule', 'explore'],
  seating: ['map', 'list'],
  quiz:    ['questions', 'votes'],
};

function parseHash(){
  const raw = location.hash.replace(/^#/, '');
  const [tab, subtab] = raw.split('/');
  return { tab: tab || '', subtab: subtab || '' };
}

function tabButtons(){
  return Array.from(document.querySelectorAll('#adSide .ad-tab'));
}

/* 對不上的子分頁一律退回第一個（清單的第一項就是預設） */
function activateSubtab(tab, subtab){
  const list = SUBTABS[tab];
  if(!list) return '';
  const valid = list.includes(subtab) ? subtab : list[0];
  document.querySelectorAll(`.ad-subtabs[data-subtabs="${tab}"] .ad-subtab`).forEach(b =>
    b.classList.toggle('is-on', b.dataset.subtab === valid));
  document.querySelectorAll(`.ad-panel[data-panel="${tab}"] .ad-subpanel`).forEach(p =>
    p.classList.toggle('is-on', p.dataset.subpanel === valid));
  return valid;
}

/* 找不到／被關掉的分頁就退回第一個還在的分頁；網址跟著修正，
   但用 replaceState 不佔用歷史紀錄，不會讓使用者按「上一頁」卡住。 */
function activateTab(tab, subtab){
  const btns = tabButtons();
  const target = btns.find(b => b.dataset.tab === tab && !b.hidden) || btns.find(b => !b.hidden);
  if(!target) return;

  btns.forEach(b => b.classList.toggle('is-on', b === target));
  document.querySelectorAll('.ad-panel').forEach(p =>
    p.classList.toggle('is-on', p.dataset.panel === target.dataset.tab));

  let wantHash = `#${target.dataset.tab}`;
  if(SUBTABS[target.dataset.tab]){
    wantHash = `#${target.dataset.tab}/${activateSubtab(target.dataset.tab, subtab)}`;
  }

  closeDrawer();
  window.scrollTo({ top:0, behavior:'instant' });

  if(location.hash !== wantHash) history.replaceState(null, '', wantHash);
}

function initRouter(){
  const { tab, subtab } = parseHash();
  activateTab(tab, subtab);
}

window.addEventListener('hashchange', ()=>{
  const { tab, subtab } = parseHash();
  activateTab(tab, subtab);
});

document.getElementById('adSide').addEventListener('click', (e)=>{
  const btn = e.target.closest('.ad-tab');
  if(!btn || btn.hidden) return;
  const tab = btn.dataset.tab;
  location.hash = SUBTABS[tab] ? `${tab}/${SUBTABS[tab][0]}` : tab;
});

document.querySelectorAll('.ad-subtabs').forEach(nav => {
  nav.addEventListener('click', (e)=>{
    const btn = e.target.closest('.ad-subtab');
    if(!btn) return;
    location.hash = `${nav.dataset.subtabs}/${btn.dataset.subtab}`;
  });
});

/* ---------- 手機／平板：側欄變抽屜 ---------- */
const adMenuBtn = document.getElementById('adMenuBtn');
const adSideEl  = document.getElementById('adSide');
const adBackdropEl = document.getElementById('adSideBackdrop');

function openDrawer(){
  adSideEl.classList.add('is-open');
  adBackdropEl.hidden = false;
  requestAnimationFrame(()=> adBackdropEl.classList.add('is-on'));
  adMenuBtn.setAttribute('aria-expanded', 'true');
}
function closeDrawer(){
  if(!adSideEl.classList.contains('is-open')) return;
  adSideEl.classList.remove('is-open');
  adBackdropEl.classList.remove('is-on');
  adMenuBtn.setAttribute('aria-expanded', 'false');
  setTimeout(()=>{ adBackdropEl.hidden = true; }, 220);
}
adMenuBtn.addEventListener('click', ()=>{
  adSideEl.classList.contains('is-open') ? closeDrawer() : openDrawer();
});
adBackdropEl.addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') closeDrawer(); });

/* ============================================================
   0. 出席回覆
   ------------------------------------------------------------
   規則只讓 ownerEmails 名單內的帳號讀得到，賓客彼此看不到。
   這裡只看與匯出，不提供修改 —— 回覆是賓客送出的紀錄。
============================================================ */
const RSVP_LABEL = { yes:'熱情出席', maybe:'視情況而定', no:'無法出席' };

const rsvpListEl   = document.getElementById('adRsvpList');
const rsvpFilterEl = document.getElementById('adRsvpFilter');
const rsvpChartsEl = document.getElementById('adRsvpCharts');
let rsvpFilter = 'all';
const rsvpPager = pagerState('rsvp');

/* createdAt 是 Firestore 的 Timestamp（伺服器時間），不是數字 */
function rsvpTime(r){
  const t = r.createdAt;
  if(t && typeof t.toDate === 'function') return t.toDate().getTime();
  return 0;
}

function visibleRsvps(){
  const q = normKey(rsvpFilterEl.value);
  return DataStore.getRSVPs().filter(r => {
    if(rsvpFilter !== 'all' && DataStore.rsvpStatus(r) !== rsvpFilter) return false;
    if(!q) return true;
    return normKey(r.name).includes(q)
        || normKey(r.message).includes(q)
        || normKey(r.note).includes(q);
  });
}

/* ============================================================
   環狀圖
   ------------------------------------------------------------
   不引入圖表函式庫（第 1 節：原生 HTML/CSS/JS，無框架）。
   SVG 的圓半徑取 15.9155，圓周正好是 100，
   stroke-dasharray 就可以直接寫百分比，不用自己算弧長。
   dashoffset 從 25 起算，第一段才會從十二點鐘方向開始。
============================================================ */
const DONUT_R = 15.9155;

function donutSvg(slices, total){
  /* 一筆都沒有時畫一個完整的灰圈，比空白更看得懂 */
  if(!total){
    return `<svg class="ad-donut-svg" viewBox="0 0 42 42" aria-hidden="true">
      <circle class="ad-donut-seg" cx="21" cy="21" r="${DONUT_R}"
              stroke="var(--dn-na)" stroke-dasharray="100 0" stroke-dashoffset="25"></circle>
    </svg>`;
  }

  let acc = 0;
  const arcs = slices.map((s, i) => {
    if(!s.value) return '';
    const pct = (s.value / total) * 100;
    const offset = 25 - acc;
    acc += pct;
    /* 每段之間留 .6 的縫，分界看得出來又不會歪掉 */
    const len = Math.max(pct - 0.6, 0.4);
    return `<circle class="ad-donut-seg" cx="21" cy="21" r="${DONUT_R}"
              stroke="${donutColor(s.key, i)}"
              stroke-dasharray="${len.toFixed(2)} ${(100 - len).toFixed(2)}"
              stroke-dashoffset="${offset.toFixed(2)}"></circle>`;
  }).join('');

  return `<svg class="ad-donut-svg" viewBox="0 0 42 42" aria-hidden="true">
    <circle class="ad-donut-track" cx="21" cy="21" r="${DONUT_R}"></circle>${arcs}
  </svg>`;
}

/* 顏色走同一條由深到淺的主題色階；「未填」固定用最淡的灰 */
function donutColor(key, i){
  return key === 'na' ? 'var(--dn-na)' : `var(--dn-${(i % 5) + 1})`;
}

function donutCard(chart){
  const total = chart.total || 0;
  const unit = chart.unit || '筆';
  const pct = (v) => total ? Math.round((v / total) * 100) : 0;

  const legend = chart.slices.map((s, i) => `
    <li class="ad-donut-item">
      <i class="ad-donut-dot" style="background:${donutColor(s.key, i)}"></i>
      <span class="ad-donut-name">${escapeHtml(s.label)}</span>
      <span class="ad-donut-val">${s.value}<small>${unit}</small> ・ ${pct(s.value)}%</span>
    </li>`).join('');

  return `
    <figure class="ad-donut">
      <figcaption class="ad-donut-title">
        ${escapeHtml(chart.title)}<small>${escapeHtml(chart.hint || '')}</small>
      </figcaption>
      <div class="ad-donut-body">
        <div class="ad-donut-chart">
          ${donutSvg(chart.slices, total)}
          <div class="ad-donut-center">
            <b>${total}</b><span>${unit}</span>
          </div>
        </div>
        <ul class="ad-donut-legend">${legend}</ul>
      </div>
    </figure>`;
}

function renderRsvpCharts(){
  const c = DataStore.getRsvpCharts();
  const cfg = rsvpConfig();
  const cards = [
    { ...c.attend, title:'出席',     hint:'依回覆筆數' },
    { ...c.meal,   title:'飲食',     hint:'依出席人數' },
    { ...c.child,  title:'兒童座椅',
      hint: c.child.seats ? `共需 ${c.child.seats} 張` : '依回覆筆數' },
    /* 新人關掉的題目就不畫圖 —— 一張全是「未填」的圖沒有任何資訊，
       只會讓人以為賓客都跳過不答 */
    cfg.askCard ? { ...c.card, title:'喜帖', hint:'依回覆筆數' } : null,
    cfg.askGift ? { ...c.gift, title:'喜餅', hint:'依回覆筆數' } : null,
  ].filter(Boolean);
  rsvpChartsEl.innerHTML = cards.map(donutCard).join('');
}

function renderRsvps(){
  const total = DataStore.getRSVPCount();
  const head  = DataStore.getAttendingCount();
  const tally = DataStore.getRsvpTally();

  document.getElementById('adRsvpTotal').textContent = total;
  document.getElementById('adRsvpSub').textContent = total
    ? `確定出席 ${head} 位・熱情出席 ${tally.yes} 筆・視情況而定 ${tally.maybe} 筆・無法出席 ${tally.no} 筆`
    : '還沒有人回覆';

  renderRsvpCharts();

  if(!loadedOnce.has('rsvps')){
    rsvpListEl.innerHTML = skeletonHtml(4);
    return;
  }

  const all = visibleRsvps();
  if(!all.length){
    rsvpListEl.innerHTML = `<div class="ad-empty">${
      total ? '沒有符合的回覆' : '還沒有人回覆出席'}</div>`;
    renderPager(rsvpListEl, rsvpPager, 0, renderRsvps);
    return;
  }

  renderPager(rsvpListEl, rsvpPager, all.length, renderRsvps);
  const list = all.slice((rsvpPager.page - 1) * rsvpPager.size, rsvpPager.page * rsvpPager.size);

  rsvpListEl.innerHTML = list.map(r => {
    const st = DataStore.rsvpStatus(r);
    const t = rsvpTime(r);

    /* 一筆回覆的重點濃縮成一行，細節（留言、備註、地址）另起一行 */
    const bits = [];
    if(r.relation) bits.push(rsvpLabel('relation', r.relation));
    const contacts = [
      r.contactPhone && `電話 ${r.contactPhone}`,
      r.contactLine && `LINE ${r.contactLine}`,
      r.contactEmail && `Email ${r.contactEmail}`,
    ].filter(Boolean);
    if(st === 'yes'){
      bits.push(`${Number(r.guestCount) || 1} 位`);
      const meat = Number(r.mealMeat) || 0;
      const veg  = Number(r.mealVeg)  || 0;
      if(meat || veg) bits.push(`葷 ${meat}／素 ${veg}`);
      else if(r.meal) bits.push(`餐點：${r.meal}`);
      if(Number(r.childSeat) > 0) bits.push(`兒童椅 ${Number(r.childSeat)} 張`);
      if(r.dietaryNote) bits.push(`飲食：${r.dietaryNote}`);
    }
    if(r.cardType){
      bits.push(`喜帖：${rsvpLabel('card', r.cardType)}${
        r.cardType === 'paper' && r.cardDelivery
          ? `（${rsvpLabel('cardDelivery', r.cardDelivery)}）` : ''}`);
    }
    if(r.giftDelivery) bits.push(`喜餅：${rsvpLabel('gift', r.giftDelivery)}`);

    const addrs = [];
    if(r.cardEmail) addrs.push(`喜帖寄：${r.cardEmail}`);
    if(r.cardAddress) addrs.push(`喜帖寄：${r.cardZip || ''} ${r.cardAddress}`);
    if(r.giftAddress) addrs.push(`喜餅寄：${r.giftZip || ''} ${r.giftAddress}`);

    return `
      <div class="ad-item">
        <div class="ad-item-main">
          <span class="ad-item-title">${escapeHtml(r.icon || '')} ${escapeHtml(r.name || '（沒有名字）')}</span>
          <span class="ad-tag ad-tag-${st}">${RSVP_LABEL[st]}</span>
          ${bits.length ? `<span class="ad-item-sub">${escapeHtml(bits.join('・'))}</span>` : ''}
          ${contacts.length ? `<span class="ad-item-sub">${escapeHtml(contacts.join('　'))}</span>` : ''}
          ${addrs.length ? `<span class="ad-item-sub">${escapeHtml(addrs.join('　'))}</span>` : ''}
          ${r.message ? `<span class="ad-item-sub">「${escapeHtml(r.message)}」</span>` : ''}
          ${r.note ? `<span class="ad-item-sub">備註：${escapeHtml(r.note)}</span>` : ''}
          <span class="ad-item-sub">${t ? fmtTime(t) : '時間未知'}</span>
        </div>
      </div>`;
  }).join('');
}

document.addEventListener('data:rsvps', renderRsvps);
rsvpFilterEl.addEventListener('input', ()=>{ rsvpPager.page = 1; renderRsvps(); });

document.getElementById('adRsvpChips').addEventListener('click', (e)=>{
  const chip = e.target.closest('.ad-chip');
  if(!chip) return;
  rsvpFilter = chip.dataset.filter;
  document.querySelectorAll('#adRsvpChips .ad-chip')
    .forEach(c => c.classList.toggle('is-on', c === chip));
  rsvpPager.page = 1;
  renderRsvps();
});

/* 規則拒絕讀取時（例如帳號被移出 ownerEmails）講清楚，不要留一個空名單。
   統計也一起收起來 —— 一排 0 和五個空圓圈看起來像「真的沒人回覆」，
   但實際上是讀不到，兩件事不能長得一樣。 */
document.addEventListener('data:rsvps:denied', ()=>{
  document.getElementById('adRsvpSub').textContent = '目前讀不到回覆';
  document.getElementById('adRsvpTotal').textContent = '—';
  rsvpChartsEl.innerHTML = '';
  loadedOnce.add('rsvps');
  rsvpListEl.innerHTML =
    `<div class="ad-empty">沒有讀取出席回覆的權限<br>請確認這個帳號在 ownerEmails 名單內</div>`;
});

/* ---------- 匯出 CSV ----------
   欄位與 scripts/export-rsvps.js 對齊，兩邊拿到的檔案格式一致 */
document.getElementById('adRsvpExport').addEventListener('click', ()=>{
  const rows = visibleRsvps();
  if(!rows.length){ toast('目前沒有可以匯出的回覆', true); return; }

  downloadCsv(
    'rsvps',
    ['稱呼','是否出席','與新人關係','電話','LINE','Email','人數','葷食','素食','兒童座椅',
     '飲食習慣','喜帖','喜帖領取','喜帖郵遞區號','喜帖地址','喜帖 Email',
     '喜餅','喜餅郵遞區號','喜餅地址','給新人的話','其他備註','回覆時間'],
    rows.map(r => {
      const st = DataStore.rsvpStatus(r);
      const t  = rsvpTime(r);
      const going = st === 'yes';
      return [
        r.name || '',
        RSVP_LABEL[st],
        rsvpLabel('relation', r.relation),
        r.contactPhone || '',
        r.contactLine || '',
        r.contactEmail || '',
        going ? (Number(r.guestCount) || 1) : '',
        going ? (Number(r.mealMeat) || 0) : '',
        going ? (Number(r.mealVeg)  || 0) : '',
        going ? (Number(r.childSeat) || 0) : '',
        r.dietaryNote || '',
        rsvpLabel('card', r.cardType),
        r.cardType === 'paper' ? rsvpLabel('cardDelivery', r.cardDelivery) : '',
        r.cardZip || '',
        r.cardAddress || '',
        r.cardEmail || '',
        rsvpLabel('gift', r.giftDelivery),
        r.giftZip || '',
        r.giftAddress || '',
        r.message || '',
        r.note || '',
        t ? fmtTime(t) : '',
      ];
    }),
  );
  toast(`已匯出 ${rows.length} 筆回覆`);
});

/* ============================================================
   0a. 表單與頁面設定
   ------------------------------------------------------------
   決定邀請函那一頁要問什麼、要放什麼。寫回 sites 文件的幾個布林值
   （規則的白名單有放行 —— 它們只改變畫面，不是規則的判斷依據；
   rsvpEnabled／rsvpDeadline 那兩個仍然改不動）。

   一律「沒設定過就視為開著」，和 common.js 的 rsvpConfig() 同一套判斷 ——
   舊站台不會因為少了這幾個欄位就整塊消失。
============================================================ */
const RSVP_FORM_TOGGLES = {
  adAskCard:      'rsvpAskCard',
  adAskGift:      'rsvpAskGift',
  adAskMessage:   'rsvpAskMessage',
  adShowStory:    'rsvpShowStory',
  adShowGallery:  'rsvpShowGallery',
};
const RSVP_CONTACT_BOXES = {
  adContactPhone: 'phone',
  adContactLine:  'line',
  adContactEmail: 'email',
};

function fillRsvpFormSettings(){
  const cfg = rsvpConfig();
  const on = {
    adAskCard: cfg.askCard, adAskGift: cfg.askGift, adAskMessage: cfg.askMessage,
    adShowStory: cfg.showStory, adShowGallery: cfg.showGallery,
  };
  Object.keys(RSVP_FORM_TOGGLES).forEach(id => {
    document.getElementById(id).checked = on[id];
  });
  Object.entries(RSVP_CONTACT_BOXES).forEach(([id, key]) => {
    document.getElementById(id).checked = cfg.contacts.includes(key);
  });
}

document.getElementById('adRsvpFormReset')
  .addEventListener('click', fillRsvpFormSettings);

document.getElementById('adRsvpForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const patch = {};
  Object.entries(RSVP_FORM_TOGGLES).forEach(([id, field]) => {
    patch[field] = document.getElementById(id).checked;
  });
  /* 順序固定照 RSVP_OPTIONS.contact 走，賓客看到的欄位順序才不會跟著勾選順序跑 */
  patch.rsvpContactMethods = Object.entries(RSVP_CONTACT_BOXES)
    .filter(([id]) => document.getElementById(id).checked)
    .map(([, key]) => key);

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try{
    await DataStore.saveSiteFields(patch);
    toast('表單設定已更新');
    /* 圖表跟著題目開關增減，存完就重畫 */
    renderRsvps();
  }catch(err){
    writeFailed(err);
  }
  btn.disabled = false;
});

/* ============================================================
   0b. 悄悄話信箱
   ------------------------------------------------------------
   賓客從祝福牆投進來的信。原本是獨立的 /w/{slug}/inbox 頁面，
   門檻同樣是 Google 登入，等於後台的一個分頁多開一次登入 ——
   所以整個併進來，新人只要進後台就看得到。

   規則只讓 ownerEmails 名單內的帳號讀，所以訂閱寫在 openAdmin()：
   登入成功之後才會開始接收。
============================================================ */
const inboxListEl   = document.getElementById('adInboxList');
const inboxFilterEl = document.getElementById('adInboxFilter');
const inboxPager = pagerState('inbox');

/* 新的排前面，新人最關心的是剛投進來的那幾封 */
function allLetters(){
  return DataStore.getLetters().slice().reverse();
}

function visibleLetters(){
  const q = normKey(inboxFilterEl.value);
  if(!q) return allLetters();
  return allLetters().filter(l =>
    normKey(l.name).includes(q) || normKey(l.text).includes(q));
}

function renderInbox(){
  const all  = allLetters();
  const list = visibleLetters();

  document.getElementById('adInboxCount').textContent =
    list.length === all.length ? `目前 ${all.length} 封` : `${list.length} / ${all.length} 封`;

  if(!loadedOnce.has('letters')){
    inboxListEl.innerHTML = skeletonHtml(3, ['50%', '90%']);
    return;
  }

  if(!list.length){
    inboxListEl.innerHTML = `<div class="ad-empty">${
      all.length
        ? '沒有符合的悄悄話'
        : '還沒有人投信進來<br>等賓客從祝福牆寫信給你們，這裡就會出現'}</div>`;
    renderPager(inboxListEl, inboxPager, 0, renderInbox);
    return;
  }

  renderPager(inboxListEl, inboxPager, list.length, renderInbox);
  const page = list.slice((inboxPager.page - 1) * inboxPager.size, inboxPager.page * inboxPager.size);

  inboxListEl.innerHTML = page.map(l => `
    <article class="ad-msg">
      <div class="ad-msg-head">
        <span class="ad-msg-ic">${escapeHtml(l.icon || DEFAULT_ICON)}</span>
        <span class="ad-msg-name">${escapeHtml(l.name || '朋友')}</span>
        <span class="ad-msg-time">${fmtTime(l.time)}</span>
      </div>
      <div class="ad-msg-body">${escapeHtml(l.text || '')}</div>
    </article>`).join('');
}

document.addEventListener('data:letters', renderInbox);
inboxFilterEl.addEventListener('input', ()=>{ inboxPager.page = 1; renderInbox(); });

/* 規則拒絕讀取時（例如帳號被移出 ownerEmails）講清楚，不要留一個空信箱 */
document.addEventListener('data:letters:denied', ()=>{
  loadedOnce.add('letters');
  inboxListEl.innerHTML =
    `<div class="ad-empty">沒有讀取悄悄話的權限<br>請確認這個帳號在 ownerEmails 名單內</div>`;
});

document.getElementById('adInboxExport').addEventListener('click', ()=>{
  const rows = visibleLetters();
  if(!rows.length){ toast('目前沒有可以匯出的悄悄話', true); return; }

  downloadCsv(
    'letters',
    ['稱呼','記號','悄悄話','投進來的時間'],
    rows.map(l => [l.name || '', l.icon || '', l.text || '', fmtTime(l.time)]),
  );
  toast(`已匯出 ${rows.length} 封悄悄話`);
});

/* ============================================================
   1-0 桌次搜尋開關
   ------------------------------------------------------------
   關掉的話，賓客的桌次頁只剩下新人上傳的桌次圖。
   沒設定過的舊站台一律視為開著，不會因為多了這個欄位就突然關掉。
============================================================ */
const seatSearchEl = document.getElementById('adSeatSearch');
const seatListOffEl = document.getElementById('adSeatListOff');

function seatSearchOn(){ return siteData().seatingSearchEnabled !== false; }

function syncSeatSearchUI(){
  const on = seatSearchOn();
  seatSearchEl.checked = on;
  seatListOffEl.hidden = on;
}

seatSearchEl.addEventListener('change', async ()=>{
  const on = seatSearchEl.checked;
  try{
    await DataStore.saveSiteFields({ seatingSearchEnabled: on });
    syncSeatSearchUI();
    toast(on ? '已開啟桌次搜尋' : '已關閉桌次搜尋，賓客只會看到桌次圖');
  }catch(err){
    /* 存不進去就把開關扳回原本的狀態，畫面不要和資料庫說不一樣的話 */
    syncSeatSearchUI();
    writeFailed(err);
  }
});

/* ============================================================
   1-1 桌次圖上傳
   ------------------------------------------------------------
   Firestore 單一文件上限 1MB，所以上傳前先在瀏覽器縮圖：
   最長邊縮到 1800px、轉成 JPEG，還是太大就降畫質、再不行就再縮一輪。
   （不用 Firebase Storage：Storage 規則讀不到 Firestore，
     沒辦法用 ownerEmails 白名單判斷是不是新人本人。）
============================================================ */
const MAX_DATAURL = 900000;

async function shrinkImage(file, maxBytes, startEdge){
  maxBytes = maxBytes || MAX_DATAURL;
  const url = URL.createObjectURL(file);
  try{
    const img = await new Promise((resolve, reject)=>{
      const im = new Image();
      im.onload  = ()=> resolve(im);
      im.onerror = ()=> reject(new Error('這個檔案不是瀏覽器讀得懂的圖片'));
      im.src = url;
    });

    let edge = startEdge || 1800;   /* 桌次圖上有字，解析度不能砍太兇 */
    for(let round = 0; round < 6; round++){
      const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth  * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));

      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const cx = cv.getContext('2d');
      /* JPEG 沒有透明度，PNG 的透明區不鋪白底會變成黑塊 */
      cx.fillStyle = '#fff';
      cx.fillRect(0, 0, w, h);
      cx.drawImage(img, 0, 0, w, h);

      for(const q of [0.86, 0.74, 0.62]){
        const out = cv.toDataURL('image/jpeg', q);
        if(out.length <= maxBytes) return out;
      }
      edge = Math.round(edge * 0.75);
    }
    throw new Error('圖片太大，請先裁切或縮小再上傳');
  } finally {
    URL.revokeObjectURL(url);
  }
}

const fileInput  = document.getElementById('adFile');
const uploadBox  = document.getElementById('adUploadBox');
const progressEl = document.getElementById('adProgress');

async function uploadFiles(files){
  const list = Array.from(files).filter(f => f.type.startsWith('image/'));
  if(!list.length){ toast('請選圖片檔', true); return; }

  progressEl.hidden = false;
  let done = 0, failed = 0;
  const base = DataStore.getSeatingImages().length;

  for(const file of list){
    progressEl.textContent = `處理中… ${done + failed + 1} / ${list.length}`;
    try{
      const img = await shrinkImage(file);
      await DataStore.saveDoc('seatingImages', null, {
        img,
        title: file.name.replace(/\.[^.]+$/, '').slice(0, 60),
        order: base + done + 1,
        time: Date.now(),
      });
      done++;
    }catch(err){
      failed++;
      console.warn('[admin] 上傳失敗', file.name, err);
    }
  }

  progressEl.hidden = true;
  fileInput.value = '';
  if(failed) toast(`上傳 ${done} 張，${failed} 張失敗（可能是檔案太大或格式不支援）`, true);
  else toast(`已上傳 ${done} 張桌次圖`);
}

fileInput.addEventListener('change', ()=> uploadFiles(fileInput.files));

['dragenter','dragover'].forEach(ev =>
  uploadBox.addEventListener(ev, (e)=>{ e.preventDefault(); uploadBox.classList.add('is-over'); }));
['dragleave','drop'].forEach(ev =>
  uploadBox.addEventListener(ev, (e)=>{ e.preventDefault(); uploadBox.classList.remove('is-over'); }));
uploadBox.addEventListener('drop', (e)=>{
  if(e.dataTransfer && e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
});

/* ---------- 已上傳的圖 ---------- */
const imgsEl = document.getElementById('adImgs');

function renderImages(){
  if(!loadedOnce.has('seatingImages')){
    imgsEl.innerHTML = skeletonHtml(2, ['100%']);
    return;
  }
  const list = DataStore.getSeatingImages().filter(it => !isPendingDelete('seatingImages', it.id));
  if(!list.length){
    imgsEl.innerHTML = `<div class="ad-empty">還沒有桌次圖</div>`;
    return;
  }
  imgsEl.innerHTML = list.map(it => `
    <figure class="ad-img">
      <img src="${escapeHtml(it.img)}" alt="${escapeHtml(it.title || '')}">
      <figcaption>
        <input class="ad-img-title" data-id="${it.id}" type="text" maxlength="60"
               value="${escapeHtml(it.title || '')}" placeholder="這張圖的標題">
        <button class="ad-del" data-del-img="${it.id}" type="button">刪除</button>
      </figcaption>
    </figure>`).join('');
}
document.addEventListener('data:seatingImages', renderImages);

imgsEl.addEventListener('click', async (e)=>{
  const id = e.target.dataset.delImg;
  if(!id) return;
  const ok = await confirmModal({ title:'刪除桌次圖', message:'確定要刪掉這張桌次圖嗎？' });
  if(!ok) return;
  scheduleUndoDelete('seatingImages', id, '桌次圖', renderImages);
});

/* 標題改完（離開欄位）就存回去 */
imgsEl.addEventListener('change', async (e)=>{
  const el = e.target.closest('.ad-img-title');
  if(!el) return;
  const item = DataStore.getSeatingImages().find(i => i.id === el.dataset.id);
  if(!item) return;
  try{
    await DataStore.saveDoc('seatingImages', item.id, {
      img: item.img,
      title: el.value.trim().slice(0, 60),
      order: item.order || 0,
      time: item.time || Date.now(),
    });
    toast('標題已更新');
  }catch(err){ writeFailed(err); }
});

/* ============================================================
   1-2 桌次名單
============================================================ */
/* 一行一位：姓名, 桌次, 備註
   Excel 貼過來可能是 Tab 分隔，全形逗號也一併接受 */
function parseSeatRows(text){
  const rows = [], bad = [];
  text.split(/\r?\n/).forEach((line, i)=>{
    const raw = line.trim();
    if(!raw) return;
    const parts = raw.split(/[,\t，]/).map(s => s.trim());
    const name  = parts[0];
    const table = parts[1];
    if(!name || !table){ bad.push(i + 1); return; }
    rows.push({
      name:  name.slice(0, 40),
      table: table.slice(0, 40),
      note:  parts.slice(2).filter(Boolean).join(' ').slice(0, 100),
    });
  });
  return { rows, bad };
}

/* ---------- 匯入名單的彈窗 ----------
   「取消匯入」＝放棄剛剛貼進來的這一份，所以要再問一次才真的關掉。 */
const seatModalMask = document.getElementById('adSeatModalMask');
const bulkEl = document.getElementById('adSeatBulk');

function openSeatModal(){
  seatModalMask.hidden = false;
  bulkEl.focus();
}

async function cancelSeatImport(){
  if(bulkEl.value.trim()){
    const ok = await confirmModal({
      title: '取消匯入',
      message: '要放棄剛剛貼進來的這一份名單嗎？關掉之後內容不會留著。',
      danger: true,
      confirmText: '放棄這份名單',
      cancelText: '繼續編輯',
    });
    if(!ok) return;
  }
  bulkEl.value = '';
  seatModalMask.hidden = true;
}

registerFormModal(seatModalMask, cancelSeatImport);
document.getElementById('adSeatImportOpen').addEventListener('click', openSeatModal);
document.getElementById('adSeatCancel').addEventListener('click', cancelSeatImport);

document.getElementById('adSeatImport').addEventListener('click', async ()=>{
  const { rows, bad } = parseSeatRows(bulkEl.value);
  if(!rows.length){
    toast('沒有讀到任何一行有效的名單（每行至少要有「姓名, 桌次」）', true);
    return;
  }
  const ok = await confirmModal({
    title: '匯入名單',
    message: `要匯入 ${rows.length} 位賓客嗎？（原本的名單會保留，這次是「加上去」）`,
  });
  if(!ok) return;
  try{
    await DataStore.importSeating(rows);
    bulkEl.value = '';
    seatModalMask.hidden = true;
    toast(bad.length
      ? `已匯入 ${rows.length} 位；第 ${bad.join('、')} 行格式不完整，已略過`
      : `已匯入 ${rows.length} 位`);
  }catch(err){ writeFailed(err); }
});

document.getElementById('adSeatClear').addEventListener('click', async ()=>{
  const n = DataStore.getSeating().length;
  if(!n){ toast('名單本來就是空的'); return; }
  const ok = await confirmModal({
    title: '清空整份名單',
    message: `確定要清空整份名單嗎？共 ${n} 位，刪掉就回不來了。`,
    danger: true,
    requirePhrase: '確認刪除',
  });
  if(!ok) return;
  try{
    await DataStore.wipeCollection('seating');
    seatModalMask.hidden = true;
    toast('名單已清空');
  }catch(err){ writeFailed(err); }
});

const seatListEl   = document.getElementById('adSeatList');
const seatFilterEl = document.getElementById('adSeatFilter');
const seatPager = pagerState('seating');

function renderSeatList(){
  if(!loadedOnce.has('seating')){
    document.getElementById('adSeatCount').textContent = '目前 — 位';
    seatListEl.innerHTML = skeletonHtml(4);
    return;
  }

  const all = DataStore.getSeating().filter(r => !isPendingDelete('seating', r.id));
  document.getElementById('adSeatCount').textContent = `目前 ${all.length} 位`;

  const q = normKey(seatFilterEl.value);
  const filtered = q
    ? all.filter(r => normKey(r.name).includes(q) || normKey(r.table).includes(q))
    : all;

  if(!filtered.length){
    seatListEl.innerHTML = all.length
      ? `<div class="ad-empty">沒有符合的賓客</div>`
      : `<div class="ad-empty">
           還沒有桌次名單
           <div class="ad-row" style="justify-content:center">
             <button class="btn small ghost" id="adSeatEmptyImport" type="button">匯入名單</button>
           </div>
         </div>`;
    renderPager(seatListEl, seatPager, 0, renderSeatList);
    return;
  }

  renderPager(seatListEl, seatPager, filtered.length, renderSeatList);
  const list = filtered.slice((seatPager.page - 1) * seatPager.size, seatPager.page * seatPager.size);

  seatListEl.innerHTML = list.map(r => `
    <div class="ad-item">
      <div class="ad-item-main">
        <span class="ad-item-title">${escapeHtml(r.name)}</span>
        <span class="ad-tag">${escapeHtml(r.table)}</span>
        ${r.note ? `<span class="ad-item-sub">${escapeHtml(r.note)}</span>` : ''}
      </div>
      <button class="ad-del" data-del-seat="${r.id}" type="button">刪除</button>
    </div>`).join('');
}

document.addEventListener('data:seating', renderSeatList);
seatFilterEl.addEventListener('input', ()=>{ seatPager.page = 1; renderSeatList(); });

seatListEl.addEventListener('click', async (e)=>{
  if(e.target.id === 'adSeatEmptyImport'){ openSeatModal(); return; }
  const id = e.target.dataset.delSeat;
  if(!id) return;
  const ok = await confirmModal({ title:'刪除賓客', message:'確定要把這位賓客從桌次名單移除嗎？' });
  if(!ok) return;
  scheduleUndoDelete('seating', id, '這位賓客', renderSeatList);
});

/* ============================================================
   2. 感謝信
   ------------------------------------------------------------
   畫面上只看得到已經寫好的信；「寫一封信」與「編輯」都開同一個彈窗。
============================================================ */
const lf = {
  modalMask:  document.getElementById('adLetterModalMask'),
  modalTitle: document.getElementById('adLetterModalTitle'),
  form:    document.getElementById('adLetterForm'),
  id:      document.getElementById('adLetterId'),
  terms:   document.getElementById('adLetterTerms'),
  title:   document.getElementById('adLetterTitle'),
  body:    document.getElementById('adLetterBody'),
  sign:    document.getElementById('adLetterSign'),
  isDef:   document.getElementById('adLetterDefault'),
  len:     document.getElementById('adLetterLen'),
  list:    document.getElementById('adLetterList'),
};

lf.body.addEventListener('input', ()=>{ lf.len.textContent = lf.body.value.length; });
liveValidate(lf.body, notBlank('信的內容'));

function resetLetterForm(){
  lf.form.reset();
  lf.id.value = '';
  lf.len.textContent = '0';
  clearFieldError(lf.body);
  clearFieldError(lf.terms);
}

function openLetterModal(b){
  resetLetterForm();
  if(b){
    lf.modalTitle.textContent = '編輯這封信';
    lf.id.value      = b.id;
    lf.terms.value   = (b.terms || []).join(', ');
    lf.title.value   = b.title || '';
    lf.body.value    = b.body  || '';
    lf.sign.value    = b.sign  || '';
    lf.isDef.checked = b.isDefault === true;
    lf.len.textContent = lf.body.value.length;
  }else{
    lf.modalTitle.textContent = '寫一封信';
  }
  lf.modalMask.hidden = false;
  lf.terms.focus();
}
function closeLetterModal(){ lf.modalMask.hidden = true; }

registerFormModal(lf.modalMask, closeLetterModal);
document.getElementById('adLetterAddBtn').addEventListener('click', ()=> openLetterModal(null));
document.getElementById('adLetterCancelBtn').addEventListener('click', closeLetterModal);

lf.form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const body = lf.body.value.trim();
  if(!lf.body._adValidate()){ lf.body.focus(); return; }

  const terms = lf.terms.value
    .split(/[,，\n]/).map(s => s.trim()).filter(Boolean).slice(0, 20)
    .map(s => s.slice(0, 40));

  if(!terms.length && !lf.isDef.checked){
    setFieldError(lf.terms, '請填專屬詞彙，或把這封設為通用信');
    toast('請填專屬詞彙，或把這封設為通用信', true);
    lf.terms.focus();
    return;
  }
  setFieldError(lf.terms, '');

  try{
    await DataStore.saveDoc('blessings', lf.id.value || null, {
      terms,
      title: lf.title.value.trim().slice(0, 60),
      body:  body.slice(0, 2000),
      sign:  lf.sign.value.trim().slice(0, 60),
      isDefault: lf.isDef.checked,
      time: Date.now(),
    });
    closeLetterModal();
    resetLetterForm();
    toast('信已儲存');
  }catch(err){ writeFailed(err); }
});

function renderLetters(){
  if(!loadedOnce.has('blessings')){
    lf.list.innerHTML = skeletonHtml(3);
    return;
  }
  const list = DataStore.getBlessings().filter(b => !isPendingDelete('blessings', b.id));
  if(!list.length){
    lf.list.innerHTML = `
      <div class="ad-empty">
        還沒有寫任何一封感謝信
        <div class="ad-row" style="justify-content:center">
          <button class="btn small ghost" id="adLetterEmptyAddBtn" type="button">寫一封信</button>
        </div>
      </div>`;
    return;
  }
  lf.list.innerHTML = list.map(b => `
    <div class="ad-item">
      <div class="ad-item-main">
        <span class="ad-item-title">${escapeHtml(b.title || '（沒有標題）')}</span>
        ${b.isDefault ? `<span class="ad-tag">通用信</span>` : ''}
        <span class="ad-item-sub">
          ${(Array.isArray(b.terms) && b.terms.length)
            ? `詞彙：${escapeHtml(b.terms.join('、'))}`
            : '沒有專屬詞彙'}
        </span>
        <span class="ad-item-sub">${escapeHtml((b.body || '').slice(0, 48))}…・${fmtTime(b.time)}</span>
      </div>
      <div class="ad-item-actions">
        <button class="ad-edit" data-edit-letter="${b.id}" type="button">編輯</button>
        <button class="ad-del"  data-del-letter="${b.id}"  type="button">刪除</button>
      </div>
    </div>`).join('');
}
document.addEventListener('data:blessings', renderLetters);

lf.list.addEventListener('click', async (e)=>{
  if(e.target.id === 'adLetterEmptyAddBtn'){ openLetterModal(null); return; }
  const editId = e.target.dataset.editLetter;
  const delId  = e.target.dataset.delLetter;

  if(editId){
    const b = DataStore.getBlessings().find(x => x.id === editId);
    if(b) openLetterModal(b);
    return;
  }

  if(delId){
    const ok = await confirmModal({ title:'刪除感謝信', message:'確定要刪掉這封信嗎？' });
    if(!ok) return;
    if(lf.id.value === delId){ closeLetterModal(); resetLetterForm(); }
    scheduleUndoDelete('blessings', delId, '這封信', renderLetters);
  }
});

/* ============================================================
   3. 自訂內容（首頁 Explore 區）
   ------------------------------------------------------------
   畫面上只看得到清單＋「新增自訂內容」；新增／編輯都用同一個彈窗，
   刪除也移進彈窗裡（清單列只留「編輯」）。
============================================================ */
const ef = {
  modalMask: document.getElementById('adExpModalMask'),
  modalTitle: document.getElementById('adExpModalTitle'),
  form:  document.getElementById('adExpForm'),
  id:    document.getElementById('adExpId'),
  title: document.getElementById('adExpTitle'),
  sub:   document.getElementById('adExpSub'),
  kind:  document.getElementById('adExpKind'),
  url:   document.getElementById('adExpUrl'),
  body:  document.getElementById('adExpBody'),
  order: document.getElementById('adExpOrder'),
  urlBox:  document.getElementById('adExpUrlBox'),
  bodyBox: document.getElementById('adExpBodyBox'),
  list:  document.getElementById('adExpList'),
  cancelBtn: document.getElementById('adExpCancelBtn'),
  deleteBtn: document.getElementById('adExpDeleteBtn'),
};

/* 選了「開啟連結」就只問網址，選了「跳出說明」就只問內文 */
function syncKindFields(){
  const isLink = ef.kind.value === 'link';
  ef.urlBox.hidden  = !isLink;
  ef.bodyBox.hidden = isLink;
}
ef.kind.addEventListener('change', syncKindFields);
syncKindFields();

liveValidate(ef.title, notBlank('內容標題'));
liveValidate(ef.url, (v)=>{
  if(ef.kind.value !== 'link') return '';
  if(!v.trim()) return '連結網址不能是空的';
  return urlOrBlank(v);
});
liveValidate(ef.body, (v)=> ef.kind.value === 'popup' ? notBlank('彈出視窗內文')(v) : '');

function openExpModal(it){
  ef.form.reset();
  [ef.title, ef.url, ef.body].forEach(clearFieldError);

  if(it){
    ef.modalTitle.textContent = '編輯自訂內容';
    ef.id.value    = it.id;
    ef.title.value = it.title || '';
    ef.sub.value   = it.sub || '';
    ef.kind.value  = it.kind === 'link' ? 'link' : 'popup';
    ef.url.value   = it.url || '';
    ef.body.value  = it.body || '';
    ef.order.value = String(it.order ?? 0);
    ef.deleteBtn.hidden = false;
  }else{
    ef.modalTitle.textContent = '新增自訂內容';
    ef.id.value = '';
    ef.order.value = String(DataStore.getExplore().length + 1);
    ef.deleteBtn.hidden = true;
  }
  syncKindFields();
  ef.modalMask.hidden = false;
  ef.title.focus();
}
function closeExpModal(){ ef.modalMask.hidden = true; }

registerFormModal(ef.modalMask, closeExpModal);
document.getElementById('adExpAddBtn').addEventListener('click', ()=> openExpModal(null));
ef.cancelBtn.addEventListener('click', closeExpModal);

ef.deleteBtn.addEventListener('click', async ()=>{
  const id = ef.id.value;
  if(!id) return;
  const ok = await confirmModal({ title:'刪除自訂內容', message:'確定要刪掉這筆自訂內容嗎？' });
  if(!ok) return;
  closeExpModal();
  scheduleUndoDelete('explore', id, '這筆自訂內容', renderExplore);
});

ef.form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const title = ef.title.value.trim();

  const kind = ef.kind.value === 'link' ? 'link' : 'popup';
  const url  = ef.url.value.trim();
  const body = ef.body.value.trim();

  const checks = [ef.title, kind === 'link' ? ef.url : ef.body];
  const bad = checks.find(el => !el._adValidate());
  if(bad){ bad.focus(); return; }

  try{
    await DataStore.saveDoc('explore', ef.id.value || null, {
      title: title.slice(0, 40),
      sub:   ef.sub.value.trim().slice(0, 120),
      kind,
      url:   kind === 'link' ? url.slice(0, 500) : '',
      body:  kind === 'popup' ? body.slice(0, 2000) : '',
      order: Number(ef.order.value) || 0,
      time:  Date.now(),
    });
    closeExpModal();
    toast('已儲存');
  }catch(err){ writeFailed(err); }
});

function renderExplore(){
  if(!loadedOnce.has('explore')){
    ef.list.innerHTML = skeletonHtml(2);
    return;
  }
  const list = DataStore.getExplore().filter(it => !isPendingDelete('explore', it.id));
  if(!list.length){
    ef.list.innerHTML = `
      <div class="ad-empty">
        目前還沒有自訂內容喔
        <div class="ad-row" style="justify-content:center">
          <button class="btn small ghost" id="adExpEmptyAddBtn" type="button">新增自訂內容</button>
        </div>
      </div>`;
    return;
  }
  ef.list.innerHTML = list.map(it => `
    <div class="ad-item">
      <div class="ad-item-main">
        <span class="ad-item-title">${escapeHtml(it.title)}</span>
        <span class="ad-tag">${it.kind === 'link' ? '連結' : '彈出視窗'}</span>
        ${it.sub ? `<span class="ad-item-sub">${escapeHtml(it.sub)}</span>` : ''}
        <span class="ad-item-sub">${escapeHtml(
          it.kind === 'link' ? (it.url || '') : (it.body || '').slice(0, 48)
        )}</span>
      </div>
      <div class="ad-item-actions">
        <span class="ad-order">#${it.order ?? 0}</span>
        <button class="ad-edit" data-edit-exp="${it.id}" type="button">編輯</button>
      </div>
    </div>`).join('');
}
document.addEventListener('data:explore', renderExplore);

ef.list.addEventListener('click', (e)=>{
  if(e.target.id === 'adExpEmptyAddBtn'){ openExpModal(null); return; }
  const editId = e.target.dataset.editExp;
  if(!editId) return;
  const it = DataStore.getExplore().find(x => x.id === editId);
  if(it) openExpModal(it);
});

/* ============================================================
   4. 大廳內容（寫回 sites/{siteId} 的文案欄位）
   ------------------------------------------------------------
   這一頁改的不是子集合，而是站台文件本身。
   規則只放行白名單內的欄位（地點、dress code、流程…），
   status／ownerEmails／pages 這些「規則自己拿來判斷的欄位」寫不進去 ——
   否則等於讓新人自己開後門。
============================================================ */
const sf = {
  form:      document.getElementById('adSiteForm'),
  title:     document.getElementById('adCoupleTitle'),
  titleLen:  document.getElementById('adCoupleTitleLen'),
  venue:     document.getElementById('adVenueName'),
  addr:      document.getElementById('adVenueAddress'),
  map:       document.getElementById('adVenueMapUrl'),
  eventTime: document.getElementById('adEventTime'),
  eventTimeOff: document.getElementById('adEventTimeOff'),
  transitPub:  document.getElementById('adTransportPublic'),
  transitPark: document.getElementById('adTransportParking'),
  dress:     document.getElementById('adDressCode'),
  gift:      document.getElementById('adGiftNote'),
  story:     document.getElementById('adStory'),
  tags:      document.getElementById('adHashtags'),
};

function siteData(){ return (window.SITE && window.SITE.data) || {}; }

/* eventDate 存回去之後，window.SITE.data.eventDate 會被就地換成一個
   一般的 JS Date（不是 Firestore Timestamp），兩種都可能出現，統一轉成 Date */
function toJsDate(v){
  if(!v) return null;
  if(typeof v.toDate === 'function') return v.toDate();
  if(v instanceof Date) return v;
  return null;
}

/* 把「某個時區裡的年月日時分」換算成正確的 UTC 時間點。
   先假設是 UTC，看它在目標時區實際幾點，再用差值修正一次 ——
   這樣就不用自己處理日光節約時間之類的偏移細節。 */
function zonedTimeToDate(y, m, d, hh, mm, tz){
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
  const p = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit',
  }).formatToParts(guess).forEach(x => { p[x.type] = x.value; });
  const asIfUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return new Date(guess.getTime() + (guess.getTime() - asIfUtc));
}

/* 大廳上的稱呼限 20 個「字」。
   emoji 之類的字元在 JS 裡佔兩格，用 [...str] 拆成字元陣列才數得準
   —— 和 Security Rules 的 size() 算法一致。 */
const COUPLE_TITLE_MAX = 20;
function clampTitle(s){
  return [...String(s || '').trim()].slice(0, COUPLE_TITLE_MAX).join('');
}

sf.title.addEventListener('input', ()=>{
  sf.titleLen.textContent = [...sf.title.value].length;
});
liveValidate(sf.map, urlOrBlank);

/* 標題留白的話，前台會退回兩位的名字 —— 直接把這個預設值填進欄位裡，
   新人一打開就看得到實際會顯示的內容，不用自己想像空白會變成什麼 */
function defaultCoupleTitle(){
  return clampTitle((window.WED && window.WED.couple) || '');
}

/* ---------- 交通資訊：大眾運輸／停車各可以配一張圖 ----------
   選了就馬上壓縮上傳、存回站台文件，跟桌次圖同一套邏輯，
   只是這裡跟很多文字欄位共用同一份文件，圖片刻意壓得更小一點。 */
const TRANSPORT_IMG_MAX_BYTES = 150000;

function setupTransportImageField(key, fileId, prevId, clearId){
  const fileEl  = document.getElementById(fileId);
  const prevEl  = document.getElementById(prevId);
  const clearEl = document.getElementById(clearId);

  function render(){
    const val = siteData()[key] || '';
    prevEl.src = val;
    prevEl.hidden = !val;
    clearEl.hidden = !val;
  }

  fileEl.addEventListener('change', async ()=>{
    const file = fileEl.files && fileEl.files[0];
    fileEl.value = '';
    if(!file) return;
    if(!file.type.startsWith('image/')){ toast('請選圖片檔', true); return; }
    try{
      const img = await shrinkImage(file, TRANSPORT_IMG_MAX_BYTES, 1000);
      await DataStore.saveSiteFields({ [key]: img });
      render();
      toast('圖片已更新');
    }catch(err){ writeFailed(err); }
  });

  clearEl.addEventListener('click', async ()=>{
    try{
      await DataStore.saveSiteFields({ [key]: '' });
      render();
      toast('已移除圖片');
    }catch(err){ writeFailed(err); }
  });

  return render;
}

const renderTransportPublicImg = setupTransportImageField(
  'transportPublicImg', 'adTransportPublicImgFile', 'adTransportPublicImgPrev', 'adTransportPublicImgClear');
const renderTransportParkingImg = setupTransportImageField(
  'transportParkingImg', 'adTransportParkingImgFile', 'adTransportParkingImgPrev', 'adTransportParkingImgClear');

function fillSiteForm(){
  const d = siteData();
  sf.title.value = d.coupleTitle || defaultCoupleTitle();
  sf.titleLen.textContent = [...sf.title.value].length;
  sf.venue.value = d.venueName    || '';
  sf.addr.value  = d.venueAddress || '';
  sf.map.value   = d.venueMapUrl  || '';

  const ev = toJsDate(d.eventDate);
  sf.eventTime.disabled = !ev;
  sf.eventTimeOff.hidden = !!ev;
  if(ev){
    const tp = {};
    new Intl.DateTimeFormat('en-GB', {
      timeZone: d.timezone || 'Asia/Taipei', hour12:false, hour:'2-digit', minute:'2-digit',
    }).formatToParts(ev).forEach(x => { tp[x.type] = x.value; });
    sf.eventTime.value = `${tp.hour}:${tp.minute}`;
  }else{
    sf.eventTime.value = '';
  }

  sf.transitPub.value  = d.transportPublic  || '';
  sf.transitPark.value = d.transportParking || '';
  renderTransportPublicImg();
  renderTransportParkingImg();
  sf.dress.value = d.dressCode    || '';
  sf.gift.value  = d.giftNote     || '';
  sf.story.value = d.story        || '';
  sf.tags.value  = Array.isArray(d.hashtags) ? d.hashtags.join(', ') : '';
}
document.getElementById('adSiteReset').addEventListener('click', fillSiteForm);

sf.form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const map = sf.map.value.trim();
  if(!sf.map._adValidate()){ sf.map.focus(); return; }

  /* hashtag 沒寫 # 就自動補上，大廳才不會出現光禿禿的字；最多 3 個 */
  const hashtags = sf.tags.value
    .split(/[,，\s]+/).map(s => s.trim()).filter(Boolean).slice(0, 3)
    .map(s => (s.startsWith('#') ? s : `#${s}`).slice(0, 40));

  const patch = {
    coupleTitle:      clampTitle(sf.title.value),
    venueName:        sf.venue.value.trim().slice(0, 80),
    venueAddress:     sf.addr.value.trim().slice(0, 200),
    venueMapUrl:      map.slice(0, 500),
    transportPublic:  sf.transitPub.value.trim().slice(0, 500),
    transportParking: sf.transitPark.value.trim().slice(0, 500),
    dressCode:        sf.dress.value.trim().slice(0, 500),
    giftNote:         sf.gift.value.trim().slice(0, 500),
    story:            sf.story.value.trim().slice(0, 2000),
    hashtags,
  };

  /* 只換「幾點開始」，日期沿用原本已經定好的那一天 */
  const d = siteData();
  const ev = toJsDate(d.eventDate);
  if(ev && sf.eventTime.value){
    const tz = d.timezone || 'Asia/Taipei';
    const dp = {};
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit',
    }).formatToParts(ev).forEach(x => { dp[x.type] = x.value; });
    const [hh, mm] = sf.eventTime.value.split(':').map(Number);
    patch.eventDate = zonedTimeToDate(+dp.year, +dp.month, +dp.day, hh, mm, tz);
  }

  try{
    await DataStore.saveSiteFields(patch);
    fillSiteForm();
    toast('婚禮資訊已更新，重新整理大廳就看得到');
  }catch(err){ writeFailed(err); }
});

/* ---------- 當日流程 ----------
   一列一個項目，順序就是大廳時間軸的顯示順序（不依時間重排）。 */
const schListEl = document.getElementById('adSchList');

function siteSchedule(){
  const s = siteData().schedule;
  return Array.isArray(s) ? s : [];
}

function schRowHtml(item){
  const it = item || {};
  return `
    <div class="ad-sch-row">
      <input class="ad-input ad-sch-time"  type="text" maxlength="20"
             value="${escapeHtml(it.time || '')}"  placeholder="11:30">
      <input class="ad-input ad-sch-title" type="text" maxlength="40"
             value="${escapeHtml(it.title || '')}" placeholder="入場迎賓">
      <input class="ad-input ad-sch-desc"  type="text" maxlength="80"
             value="${escapeHtml(it.desc || '')}"  placeholder="說明（選填）">
      <button class="ad-del" type="button" data-sch-del="1">刪除</button>
    </div>`;
}

function renderSchedule(list){
  schListEl.innerHTML = (list && list.length)
    ? list.map(schRowHtml).join('')
    : schRowHtml(null);
}

document.getElementById('adSchAdd').addEventListener('click', ()=>{
  schListEl.insertAdjacentHTML('beforeend', schRowHtml(null));
});

schListEl.addEventListener('click', (e)=>{
  if(!e.target.dataset.schDel) return;
  e.target.closest('.ad-sch-row').remove();
  if(!schListEl.children.length) renderSchedule([]);
});

document.getElementById('adSchSave').addEventListener('click', async ()=>{
  /* 整列都空白的就當作沒填，新人不用先刪乾淨才存得起來 */
  const rows = Array.from(schListEl.querySelectorAll('.ad-sch-row')).map(row => ({
    time:  row.querySelector('.ad-sch-time').value.trim().slice(0, 20),
    title: row.querySelector('.ad-sch-title').value.trim().slice(0, 40),
    desc:  row.querySelector('.ad-sch-desc').value.trim().slice(0, 80),
  })).filter(r => r.time || r.title || r.desc).slice(0, 40);

  const bad = rows.findIndex(r => !r.title);
  if(bad >= 0){
    toast(`第 ${bad + 1} 列還沒填項目名稱`, true);
    return;
  }

  try{
    await DataStore.saveSiteFields({ schedule: rows });
    renderSchedule(rows);
    toast(rows.length ? `已儲存 ${rows.length} 個流程項目` : '流程已清空');
  }catch(err){ writeFailed(err); }
});

/* ============================================================
   5. 婚禮小卡（抽卡頁的卡池）
   ------------------------------------------------------------
   照片先讓新人自己裁成 2:3（cropper.js），再以 data URL 存進文件，
   理由與桌次圖相同：Firebase Storage 的規則讀不到 Firestore，
   沒辦法用 ownerEmails 白名單判斷是不是新人本人。
============================================================ */
const CARD_ASPECT   = 2/3;      /* 卡片是直式 2:3 */
const CARD_OUTWIDTH = 700;      /* 700×1050，手機上顯示寬度約 300px，這個解析度綽綽有餘 */
/* 抽卡頁會一次載入整個卡池（要隨機抽，沒辦法只載一張），
   所以每張卡壓得比桌次圖更小 —— 30 張大約 4MB，手機用行動網路也還行。
   規則的上限仍是 950000，這裡是自我約束。 */
const CARD_MAX_BYTES = 200000;

const cardListEl  = document.getElementById('adCardList');
const cardFileEl  = document.getElementById('adCardFile');
const cardUpload  = document.getElementById('adCardUpload');
const cardProgEl  = document.getElementById('adCardProgress');

async function uploadCards(files){
  const list = Array.from(files).filter(f => f.type.startsWith('image/'));
  if(!list.length){ toast('請選圖片檔', true); return; }

  cardProgEl.hidden = false;
  let done = 0, skipped = 0, failed = 0;
  let order = DataStore.getCards().length;

  for(let i = 0; i < list.length; i++){
    const file = list[i];
    cardProgEl.textContent = `裁切中… ${i + 1} / ${list.length}`;
    try{
      const img = await cropImage(file, {
        aspect:   CARD_ASPECT,
        outWidth: CARD_OUTWIDTH,
        maxBytes: CARD_MAX_BYTES,
        title:    `裁切婚禮小卡（${i + 1} / ${list.length}）`,
        hint:     '直式 2:3・拖曳移動、滑桿或滾輪縮放',
      });
      if(!img){ skipped++; continue; }     /* 新人自己按了取消 */

      order += 1;
      await DataStore.saveDoc('cards', null, {
        img,
        name:   file.name.replace(/\.[^.]+$/, '').slice(0, 60) || `婚禮小卡 ${order}`,
        rarity: 'N',
        desc:   '',
        order,
        time:   Date.now(),
      });
      done++;
    }catch(err){
      failed++;
      console.warn('[admin] 婚禮小卡上傳失敗', file.name, err);
    }
  }

  cardProgEl.hidden = true;
  cardFileEl.value = '';
  if(failed) toast(`已加入 ${done} 張，${failed} 張失敗（可能是格式不支援）`, true);
  else if(done) toast(`已加入 ${done} 張婚禮小卡${skipped ? `（略過 ${skipped} 張）` : ''}`);
  else if(skipped) toast('沒有加入任何一張');
}

cardFileEl.addEventListener('change', ()=> uploadCards(cardFileEl.files));

['dragenter','dragover'].forEach(ev =>
  cardUpload.addEventListener(ev, (e)=>{ e.preventDefault(); cardUpload.classList.add('is-over'); }));
['dragleave','drop'].forEach(ev =>
  cardUpload.addEventListener(ev, (e)=>{ e.preventDefault(); cardUpload.classList.remove('is-over'); }));
cardUpload.addEventListener('drop', (e)=>{
  if(e.dataTransfer && e.dataTransfer.files.length) uploadCards(e.dataTransfer.files);
});

const RARITIES = ['SSR', 'SR', 'R', 'N'];

function renderCards(){
  if(!loadedOnce.has('cards')){
    document.getElementById('adCardCount').textContent = '目前 — 張';
    cardListEl.innerHTML = skeletonHtml(2, ['100%']);
    return;
  }
  const list = DataStore.getCards().filter(c => !isPendingDelete('cards', c.id));
  document.getElementById('adCardCount').textContent = `目前 ${list.length} 張`;

  if(!list.length){
    cardListEl.innerHTML =
      `<div class="ad-empty">還沒有婚禮小卡<br>沒上傳的話，抽卡頁會沿用素材資料夾或內建的範例卡</div>`;
    return;
  }

  cardListEl.innerHTML = list.map(c => `
    <figure class="ad-card" data-id="${c.id}">
      <img src="${escapeHtml(c.img)}" alt="${escapeHtml(c.name || '')}">
      <figcaption>
        <input class="ad-input ad-card-name" type="text" maxlength="60"
               value="${escapeHtml(c.name || '')}" placeholder="卡名">
        <select class="ad-input ad-card-rarity">
          ${RARITIES.map(r =>
            `<option value="${r}"${(c.rarity || 'N') === r ? ' selected' : ''}>${r}</option>`).join('')}
        </select>
        <input class="ad-input ad-card-desc" type="text" maxlength="200"
               value="${escapeHtml(c.desc || '')}" placeholder="說明（選填）">
        <div class="ad-card-actions">
          <span class="ad-order">#${c.order ?? 0}</span>
          <button class="ad-edit" type="button" data-recrop="${c.id}">重新裁切</button>
          <button class="ad-del"  type="button" data-del-card="${c.id}">刪除</button>
        </div>
      </figcaption>
    </figure>`).join('');
}
document.addEventListener('data:cards', renderCards);

/* 卡名／等級／說明改完（離開欄位）就存回去 */
cardListEl.addEventListener('change', async (e)=>{
  const box = e.target.closest('.ad-card');
  if(!box || e.target.matches('input[type="file"]')) return;
  const item = DataStore.getCards().find(c => c.id === box.dataset.id);
  if(!item) return;

  const rarity = box.querySelector('.ad-card-rarity').value;
  try{
    await DataStore.saveDoc('cards', item.id, {
      img:    item.img,
      name:   box.querySelector('.ad-card-name').value.trim().slice(0, 60),
      rarity: RARITIES.includes(rarity) ? rarity : 'N',
      desc:   box.querySelector('.ad-card-desc').value.trim().slice(0, 200),
      order:  item.order || 0,
      time:   item.time || Date.now(),
    });
    toast('已更新');
  }catch(err){ writeFailed(err); }
});

cardListEl.addEventListener('click', async (e)=>{
  const recropId = e.target.dataset.recrop;
  const delId    = e.target.dataset.delCard;

  if(recropId){
    const item = DataStore.getCards().find(c => c.id === recropId);
    if(!item) return;
    /* 拿現有的圖再裁一次：只能往內縮，但對「當初切歪了」很夠用 */
    const img = await cropImage(item.img, {
      aspect:   CARD_ASPECT,
      outWidth: CARD_OUTWIDTH,
      maxBytes: CARD_MAX_BYTES,
      title:    '重新裁切婚禮小卡',
    });
    if(!img) return;
    try{
      await DataStore.saveDoc('cards', item.id, {
        img,
        name:   item.name || '',
        rarity: RARITIES.includes(item.rarity) ? item.rarity : 'N',
        desc:   item.desc || '',
        order:  item.order || 0,
        time:   item.time || Date.now(),
      });
      toast('已重新裁切');
    }catch(err){ writeFailed(err); }
    return;
  }

  if(delId){
    const ok = await confirmModal({ title:'刪除婚禮小卡', message:'確定要刪掉這張小卡嗎？' });
    if(!ok) return;
    scheduleUndoDelete('cards', delId, '這張婚禮小卡', renderCards);
  }
});

/* ============================================================
   6. 新人故事牆（戀愛時光）
   ------------------------------------------------------------
   兩種型態，用同一個彈窗填：
     kind='photo' → 時間軸上的一則故事（照片可留空，只放文字）
     kind='act'   → 章節分隔卡（title 是章節名、sub 是副標）
   排序欄位決定先後，章節卡要排在它底下那些故事前面。
   新人第一次打開這個分頁、內容還是空的時候，會把 EXHIBIT_DEFAULTS
   整份寫進來當起點（做法與測驗題目相同），之後改／刪都可以。
============================================================ */
const EXH_OUTWIDTH = 900;
/* 故事牆也是整頁一次載完，同樣壓小一點（理由見婚禮小卡） */
const EXH_MAX_BYTES = 250000;

const xf = {
  modalMask:  document.getElementById('adExhModalMask'),
  modalTitle: document.getElementById('adExhModalTitle'),
  form:   document.getElementById('adExhForm'),
  id:     document.getElementById('adExhId'),
  img:    document.getElementById('adExhImg'),
  kind:   document.getElementById('adExhKind'),
  title:  document.getElementById('adExhTitle'),
  sub:    document.getElementById('adExhSub'),
  year:   document.getElementById('adExhYear'),
  act:    document.getElementById('adExhAct'),
  desc:   document.getElementById('adExhDesc'),
  order:  document.getElementById('adExhOrder'),
  ratio:  document.getElementById('adExhRatio'),
  file:   document.getElementById('adExhFile'),
  prev:   document.getElementById('adExhPrev'),
  descLen:document.getElementById('adExhDescLen'),
  list:   document.getElementById('adExhList'),
  photoBoxes: [document.getElementById('adExhPhotoBox'),
               document.getElementById('adExhPhotoBox2')],
};

xf.desc.addEventListener('input', ()=>{ xf.descLen.textContent = xf.desc.value.length; });

/* 章節卡只有名稱與副標，照片與年份那幾格就收起來 */
function syncExhKind(){
  const isAct = xf.kind.value === 'act';
  xf.photoBoxes.forEach(box => { box.hidden = isAct; });
  document.querySelectorAll('[data-kind-label]').forEach(el => {
    el.hidden = el.dataset.kindLabel !== (isAct ? 'act' : 'photo');
  });
}
xf.kind.addEventListener('change', syncExhKind);
syncExhKind();

liveValidate(xf.title, (v)=> notBlank(xf.kind.value === 'act' ? '章節名稱' : '故事標題')(v));

function setExhPreview(dataUrl){
  xf.img.value = dataUrl || '';
  xf.prev.innerHTML = dataUrl
    ? `<img src="${escapeHtml(dataUrl)}" alt="故事照片預覽">`
    : `<span>還沒有照片</span>`;
}

document.getElementById('adExhPickBtn').addEventListener('click', ()=> xf.file.click());
document.getElementById('adExhClearImg').addEventListener('click', ()=> setExhPreview(''));

xf.file.addEventListener('change', async ()=>{
  const file = xf.file.files && xf.file.files[0];
  xf.file.value = '';
  if(!file) return;
  if(!file.type.startsWith('image/')){ toast('請選圖片檔', true); return; }
  try{
    const img = await cropImage(file, {
      aspect:   Number(xf.ratio.value) || 0.75,
      outWidth: EXH_OUTWIDTH,
      maxBytes: EXH_MAX_BYTES,
      title:    '裁切故事照片',
    });
    if(img) setExhPreview(img);
  }catch(err){
    console.warn('[admin] 故事照片裁切失敗', err);
    toast('這張圖讀不進來，換一張試試', true);
  }
});

function resetExhForm(){
  xf.form.reset();
  xf.id.value = '';
  setExhPreview('');
  xf.descLen.textContent = '0';
  xf.order.value = String(DataStore.getExhibits().length + 1);
  syncExhKind();
  clearFieldError(xf.title);
}

/* 開彈窗：新增時用按下的那顆按鈕決定是故事還是章節，編輯時帶原本那一筆 */
function openExhModal(kind, it){
  resetExhForm();
  if(it){
    xf.modalTitle.textContent = it.kind === 'act' ? '編輯章節' : '編輯故事';
    xf.id.value    = it.id;
    xf.kind.value  = it.kind === 'act' ? 'act' : 'photo';
    xf.title.value = it.title || '';
    xf.sub.value   = it.sub   || '';
    xf.year.value  = it.year  || '';
    xf.act.value   = it.act   || '';
    xf.desc.value  = it.desc  || '';
    xf.order.value = String(it.order ?? 0);
    xf.descLen.textContent = xf.desc.value.length;
    setExhPreview(it.img || '');
  }else{
    xf.modalTitle.textContent = kind === 'act' ? '新增章節' : '新增故事';
    xf.kind.value = kind === 'act' ? 'act' : 'photo';
  }
  syncExhKind();
  xf.modalMask.hidden = false;
  xf.title.focus();
}
function closeExhModal(){ xf.modalMask.hidden = true; }

registerFormModal(xf.modalMask, closeExhModal);
document.getElementById('adExhAddPhoto').addEventListener('click', ()=> openExhModal('photo', null));
document.getElementById('adExhAddAct').addEventListener('click', ()=> openExhModal('act', null));
document.getElementById('adExhCancelBtn').addEventListener('click', closeExhModal);

xf.form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const kind  = xf.kind.value === 'act' ? 'act' : 'photo';
  const title = xf.title.value.trim();

  if(!xf.title._adValidate()){ xf.title.focus(); return; }
  if(kind === 'photo' && !xf.img.value && !xf.desc.value.trim()){
    toast('故事至少要有一張照片或一段描述', true);
    return;
  }

  try{
    await DataStore.saveDoc('exhibits', xf.id.value || null, {
      kind,
      img:   kind === 'photo' ? xf.img.value : '',
      title: title.slice(0, 60),
      sub:   xf.sub.value.trim().slice(0, 60),
      desc:  kind === 'photo' ? xf.desc.value.trim().slice(0, 500) : '',
      year:  kind === 'photo' ? xf.year.value.trim().slice(0, 20) : '',
      act:   kind === 'photo' ? xf.act.value.trim().slice(0, 40) : '',
      order: Number(xf.order.value) || 0,
      time:  Date.now(),
    });
    closeExhModal();
    resetExhForm();
    toast('已儲存');
  }catch(err){ writeFailed(err); }
});

function renderExhibits(){
  if(!loadedOnce.has('exhibits')){
    xf.list.innerHTML = skeletonHtml(3);
    return;
  }
  const list = DataStore.getExhibits().filter(it => !isPendingDelete('exhibits', it.id));
  if(!list.length){
    xf.list.innerHTML = `
      <div class="ad-empty">
        還沒有故事牆內容<br>
        沒設定的話，戀愛時光會沿用素材資料夾或內建的範例
        <div class="ad-row" style="justify-content:center">
          <button class="btn small ghost" id="adExhSeed" type="button">載入預設內容來改</button>
        </div>
      </div>`;
    return;
  }
  xf.list.innerHTML = list.map(it => `
    <div class="ad-item">
      ${it.kind === 'photo' && it.img
        ? `<img class="ad-exh-thumb" src="${escapeHtml(it.img)}" alt="">`
        : ''}
      <div class="ad-item-main">
        <span class="ad-item-title">${escapeHtml(it.title || '（沒有標題）')}</span>
        <span class="ad-tag">${it.kind === 'act' ? '章節' : '故事'}</span>
        ${it.year ? `<span class="ad-tag">${escapeHtml(it.year)}</span>` : ''}
        ${it.sub ? `<span class="ad-item-sub">${escapeHtml(it.sub)}</span>` : ''}
        ${it.desc ? `<span class="ad-item-sub">${escapeHtml(it.desc.slice(0, 60))}${
          it.desc.length > 60 ? '…' : ''}</span>` : ''}
      </div>
      <div class="ad-item-actions">
        <span class="ad-order">#${it.order ?? 0}</span>
        <button class="ad-edit" type="button" data-edit-exh="${it.id}">編輯</button>
        <button class="ad-del"  type="button" data-del-exh="${it.id}">刪除</button>
      </div>
    </div>`).join('');
}

/* 規則只放行這幾個欄位，預設內容也走這裡組出來的物件（finale 這類旗標會被丟掉） */
function exhibitFields(it, order){
  const kind = it.kind === 'act' ? 'act' : 'photo';
  return {
    kind,
    img:   kind === 'photo' ? String(it.img || '') : '',
    title: String(it.title || '').slice(0, 60),
    sub:   String(it.sub   || '').slice(0, 60),
    desc:  kind === 'photo' ? String(it.desc || '').slice(0, 500) : '',
    year:  kind === 'photo' ? String(it.year || '').slice(0, 20)  : '',
    act:   kind === 'photo' ? String(it.act  || '').slice(0, 40)  : '',
    order: Number(order ?? it.order) || 0,
    time:  it.time || Date.now(),
  };
}

/* 第一次打開、故事牆還空著 → 把預設內容寫進來當起點。
   exhibitSeeded 記在 localStorage（以 siteId 分隔）：
   新人自己把內容全刪掉之後，不會又被我們補回來。 */
let exhSeeding = false;
async function seedExhibits(force){
  if(exhSeeding) return;
  if(DataStore.getExhibits().length) return;
  if(!force && LS.get('exhibitSeeded', false)) return;
  exhSeeding = true;
  try{
    /* 一次全部送出，新人馬上關掉分頁也不會只寫進一半 */
    await Promise.all(EXHIBIT_DEFAULTS.map((d, i) =>
      DataStore.saveDoc('exhibits', null, exhibitFields(d, i + 1))));
    LS.set('exhibitSeeded', true);
    toast(`已載入 ${EXHIBIT_DEFAULTS.length} 筆預設內容，可以直接改`);
  }catch(err){
    writeFailed(err);
  }
  exhSeeding = false;
}

document.addEventListener('data:exhibits', ()=>{
  renderExhibits();
  seedExhibits(false);
});

xf.list.addEventListener('click', async (e)=>{
  if(e.target.id === 'adExhSeed'){ seedExhibits(true); return; }
  const editId = e.target.dataset.editExh;
  const delId  = e.target.dataset.delExh;

  if(editId){
    const it = DataStore.getExhibits().find(x => x.id === editId);
    if(it) openExhModal(it.kind, it);
    return;
  }

  if(delId){
    const ok = await confirmModal({ title:'刪除故事牆內容', message:'確定要刪掉這一筆嗎？' });
    if(!ok) return;
    if(xf.id.value === delId){ closeExhModal(); resetExhForm(); }
    scheduleUndoDelete('exhibits', delId, '這一筆', renderExhibits);
  }
});

/* ============================================================
   7. 新人熟悉測驗（「看你多了解我們」的題目）
   ------------------------------------------------------------
   一題一份文件：type（單選／複選）、q（題目）、opts（固定四個選項）、
   answer（正確答案的索引陣列）、order（題號順序）。
   ・題目與上限來自 js/quiz-defaults.js，賓客那一頁共用同一份，
     兩邊的判斷（幾題、幾個選項、幾個字）才不會走鐘。
   ・新人第一次打開這個分頁、而題目還是空的時候，
     會把 QUIZ_DEFAULTS 的 3 題寫進來當起點，之後改／刪／調順序都可以。
============================================================ */
const qz = {
  modalMask:  document.getElementById('adQuizModalMask'),
  modalTitle: document.getElementById('adQuizModalTitle'),
  form:    document.getElementById('adQuizForm'),
  id:      document.getElementById('adQuizId'),
  type:    document.getElementById('adQuizType'),
  q:       document.getElementById('adQuizQ'),
  qLen:    document.getElementById('adQuizQLen'),
  list:    document.getElementById('adQuizList'),
  count:   document.getElementById('adQuizCount'),
  optEls:  Array.from(document.querySelectorAll('#adQuizOpts .ad-quiz-text')),
  ansEls:  Array.from(document.querySelectorAll('#adQuizOpts .ad-quiz-ans input')),
  voteCnt: document.getElementById('adQuizVoteCount'),
  voteAvg: document.getElementById('adQuizAvg'),
};

qz.q.addEventListener('input', ()=>{ qz.qLen.textContent = qz.q.value.length; });
liveValidate(qz.q, notBlank('題目'));
qz.optEls.forEach((el, oi) => liveValidate(el, notBlank(`選項 ${String.fromCharCode(65 + oi)}`)));

/* 單選用 radio、複選用 checkbox —— 同一組欄位換 type 就好 */
function syncQuizType(){
  const isMulti = qz.type.value === 'multi';
  const checked = qz.ansEls.filter(el => el.checked);
  qz.ansEls.forEach(el => { el.type = isMulti ? 'checkbox' : 'radio'; });
  /* 從複選切回單選：只留第一個，radio 才不會出現兩個被勾起來 */
  if(!isMulti && checked.length > 1){
    checked.slice(1).forEach(el => { el.checked = false; });
  }
}
qz.type.addEventListener('change', syncQuizType);
syncQuizType();

function quizAnswer(){
  return qz.ansEls.filter(el => el.checked).map(el => Number(el.dataset.oi));
}

function resetQuizForm(){
  qz.form.reset();
  qz.id.value = '';
  qz.qLen.textContent = '0';
  syncQuizType();
  clearFieldError(qz.q);
  qz.optEls.forEach(clearFieldError);
}

function openQuizModal(it){
  resetQuizForm();
  if(it){
    qz.modalTitle.textContent = '編輯題目';
    qz.id.value   = it.id;
    qz.type.value = it.type === 'multi' ? 'multi' : 'single';
    qz.q.value    = it.q || '';
    qz.qLen.textContent = qz.q.value.length;
    syncQuizType();
    const answer = Array.isArray(it.answer) ? it.answer : [];
    qz.optEls.forEach((el, oi) => { el.value = (it.opts || [])[oi] || ''; });
    qz.ansEls.forEach((el, oi) => { el.checked = answer.includes(oi); });
  }else{
    qz.modalTitle.textContent = '新增題目';
  }
  qz.modalMask.hidden = false;
  qz.q.focus();
}
function closeQuizModal(){ qz.modalMask.hidden = true; }

registerFormModal(qz.modalMask, closeQuizModal);
document.getElementById('adQuizAddBtn').addEventListener('click', ()=>{
  if(DataStore.getQuiz().length >= QUIZ_LIMITS.MAX_QUESTIONS){
    toast(`最多 ${QUIZ_LIMITS.MAX_QUESTIONS} 題，要新增請先刪掉一題`, true);
    return;
  }
  openQuizModal(null);
});
document.getElementById('adQuizCancelBtn').addEventListener('click', closeQuizModal);

/* 規則只放行這幾個欄位，寫入一律走這裡組出來的物件 */
function quizFields(it, order){
  return {
    type:   it.type === 'multi' ? 'multi' : 'single',
    q:      String(it.q || '').slice(0, QUIZ_LIMITS.Q_MAX),
    opts:   (it.opts || []).slice(0, QUIZ_LIMITS.OPT_COUNT)
              .map(o => String(o || '').slice(0, QUIZ_LIMITS.OPT_MAX)),
    answer: (it.answer || []).slice().sort((a, b) => a - b),
    order:  Number(order ?? it.order) || 0,
    time:   it.time || Date.now(),
  };
}

qz.form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const list = DataStore.getQuiz();
  const editing = qz.id.value;
  const type = qz.type.value === 'multi' ? 'multi' : 'single';

  const q = qz.q.value.trim();
  if(!qz.q._adValidate()){ qz.q.focus(); return; }

  const opts = qz.optEls.map(el => el.value.trim().slice(0, QUIZ_LIMITS.OPT_MAX));
  const badOpt = qz.optEls.find(el => !el._adValidate());
  if(badOpt){ badOpt.focus(); return; }

  const answer = quizAnswer();
  if(!answer.length){ toast('請勾選正確答案', true); return; }
  if(type === 'single' && answer.length !== 1){
    toast('單選題只能有一個正確答案', true);
    return;
  }

  if(!editing && list.length >= QUIZ_LIMITS.MAX_QUESTIONS){
    toast(`最多 ${QUIZ_LIMITS.MAX_QUESTIONS} 題，要新增請先刪掉一題`, true);
    return;
  }

  const cur   = editing ? list.find(x => x.id === editing) : null;
  const order = cur ? (cur.order || 0) : (list.length + 1);

  try{
    await DataStore.saveDoc('quiz', editing || null,
      quizFields({ type, q, opts, answer, time: cur && cur.time }, order));
    closeQuizModal();
    resetQuizForm();
    toast(editing ? '題目已更新' : '已新增一題');
  }catch(err){ writeFailed(err); }
});

function renderQuiz(){
  if(!loadedOnce.has('quiz')){
    qz.count.textContent = '目前 — 題';
    qz.list.innerHTML = skeletonHtml(3);
    return;
  }

  const list = DataStore.getQuiz().filter(it => !isPendingDelete('quiz', it.id));
  qz.count.textContent =
    `目前 ${list.length} 題（最多 ${QUIZ_LIMITS.MAX_QUESTIONS} 題）`;

  if(!list.length){
    qz.list.innerHTML = `
      <div class="ad-empty">
        還沒有題目<br>
        賓客那一頁現在用的是 ${QUIZ_DEFAULTS.length} 題預設題目
        <div class="ad-row" style="justify-content:center">
          <button class="btn small ghost" id="adQuizSeed" type="button">載入預設題目來改</button>
        </div>
      </div>`;
    return;
  }

  qz.list.innerHTML = list.map((it, i) => {
    const answer = Array.isArray(it.answer) ? it.answer : [];
    const opts = (it.opts || []).map((o, oi) =>
      `${answer.includes(oi) ? '✓ ' : ''}${escapeHtml(o)}`).join('　／　');
    return `
      <div class="ad-quiz-item" data-id="${it.id}">
        <button class="ad-drag-handle" type="button" aria-label="拖曳調整順序" title="拖曳調整順序">⠿</button>
        <div class="ad-item-main">
          <span class="ad-item-title">${i + 1}. ${escapeHtml(it.q || '（沒有題目）')}</span>
          <span class="ad-tag">${it.type === 'multi' ? '複選' : '單選'}</span>
          <span class="ad-item-sub">${opts}</span>
        </div>
        <div class="ad-item-actions">
          <button class="ad-edit" type="button" data-edit-quiz="${it.id}">編輯</button>
          <button class="ad-del"  type="button" data-del-quiz="${it.id}">刪除</button>
        </div>
      </div>`;
  }).join('');
}

/* 把 order 整批重編成 1…n（只寫真的變了的那幾份，不必整包重寫）。
   拖曳放開時呼叫一次，不是每移動一格就打一次 Firestore。 */
async function saveQuizOrder(idsInOrder){
  const list = DataStore.getQuiz();
  const byId = new Map(list.map(it => [it.id, it]));
  try{
    await Promise.all(idsInOrder.map((id, k) => {
      const it = byId.get(id);
      if(!it || it.order === k + 1) return null;
      return DataStore.saveDoc('quiz', it.id, quizFields(it, k + 1));
    }));
    toast('順序已更新');
  }catch(err){
    writeFailed(err);
    renderQuiz();
  }
}

/* ---------- 拖曳排序（Pointer Events，滑鼠與觸控通用） ---------- */
(function setupQuizDrag(){
  let dragEl = null, startY = 0;

  qz.list.addEventListener('pointerdown', (e)=>{
    const handle = e.target.closest('.ad-drag-handle');
    if(!handle) return;
    dragEl = handle.closest('.ad-quiz-item');
    if(!dragEl) return;
    startY = e.clientY;
    dragEl.classList.add('is-dragging');
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  qz.list.addEventListener('pointermove', (e)=>{
    if(!dragEl) return;
    dragEl.style.transform = `translateY(${e.clientY - startY}px)`;

    /* 拖過相鄰項目的中點就跟它交換位置。
       DOM 順序換了之後，dragEl 沒被拖曳時「本來會在哪」也跟著往前／往後挪一列，
       所以交換的當下要把 startY 補回相同的量，讓 transform 疊上新的位置後
       視覺上不會跳一下 —— 也因為這樣，才不會在同一個 pointermove 裡
       因為「沒補償、位置估計爆掉」而一次連環跨過好幾列。 */
    const siblings = Array.from(qz.list.querySelectorAll('.ad-quiz-item')).filter(el => el !== dragEl);
    for(const sib of siblings){
      const dragRect = dragEl.getBoundingClientRect();
      const dragMid = dragRect.top + dragRect.height / 2;
      const rect = sib.getBoundingClientRect();
      const sibMid = rect.top + rect.height / 2;
      if(dragEl.compareDocumentPosition(sib) & Node.DOCUMENT_POSITION_FOLLOWING && dragMid > sibMid){
        qz.list.insertBefore(sib, dragEl);
        startY += rect.height;
      }else if(dragEl.compareDocumentPosition(sib) & Node.DOCUMENT_POSITION_PRECEDING && dragMid < sibMid){
        qz.list.insertBefore(dragEl, sib);
        startY -= rect.height;
      }
      dragEl.style.transform = `translateY(${e.clientY - startY}px)`;
    }
  });

  function endDrag(e){
    if(!dragEl) return;
    const el = dragEl;
    dragEl = null;
    el.classList.remove('is-dragging');
    el.style.transform = '';

    const newOrder = Array.from(qz.list.querySelectorAll('.ad-quiz-item')).map(x => x.dataset.id);
    const oldOrder = DataStore.getQuiz()
      .filter(it => !isPendingDelete('quiz', it.id))
      .map(it => it.id);
    if(newOrder.join() !== oldOrder.join()) saveQuizOrder(newOrder);
    else renderQuiz(); // 位置沒變也要把題號（1. 2. 3.…）重畫回原狀
  }
  qz.list.addEventListener('pointerup', endDrag);
  qz.list.addEventListener('pointercancel', endDrag);
})();

/* 第一次打開、題目還空著 → 把預設題目寫進來當起點。
   quizSeeded 記在 localStorage（以 siteId 分隔）：
   新人自己把題目全刪掉之後，不會又被我們補回來。 */
let quizSeeding = false;
async function seedQuiz(force){
  if(quizSeeding) return;
  if(DataStore.getQuiz().length) return;
  if(!force && LS.get('quizSeeded', false)) return;
  quizSeeding = true;
  try{
    /* 一次全部送出，新人馬上關掉分頁也不會只寫進一半 */
    await Promise.all(QUIZ_DEFAULTS.map((d, i) =>
      DataStore.saveDoc('quiz', null, quizFields(d, i + 1))));
    LS.set('quizSeeded', true);
    toast(`已載入 ${QUIZ_DEFAULTS.length} 題預設題目，可以直接改`);
  }catch(err){
    writeFailed(err);
  }
  quizSeeding = false;
}

document.addEventListener('data:quiz', ()=>{
  renderQuiz();
  seedQuiz(false);
});

qz.list.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button');
  if(!btn) return;
  const d = btn.dataset;

  if(btn.id === 'adQuizSeed'){ seedQuiz(true); return; }

  if(d.editQuiz){
    const it = DataStore.getQuiz().find(x => x.id === d.editQuiz);
    if(it) openQuizModal(it);
    return;
  }

  if(d.delQuiz){
    const ok = await confirmModal({ title:'刪除題目', message:'確定要刪掉這一題嗎？' });
    if(!ok) return;
    if(qz.id.value === d.delQuiz){ closeQuizModal(); resetQuizForm(); }
    scheduleUndoDelete('quiz', d.delQuiz, '這一題', renderQuiz);
  }
});

/* ---------- 賓客的作答紀錄 ---------- */
function renderQuizVotes(){
  const votes = DataStore.getQuizVotes();
  qz.voteCnt.textContent = votes.length;

  const scored = votes.filter(v => Number(v.total) > 0);
  if(!scored.length){
    qz.voteAvg.textContent = '—';
    return;
  }
  const avg   = scored.reduce((s, v) => s + (Number(v.score) || 0), 0) / scored.length;
  /* 題數中途改過的話，以最多人作答的那個題數當分母 */
  const total = scored[scored.length - 1].total;
  qz.voteAvg.textContent = `${avg.toFixed(1)} / ${total}`;
}
document.addEventListener('data:quizVotes', renderQuizVotes);

document.getElementById('adQuizWipe').addEventListener('click', async ()=>{
  const n = DataStore.getQuizVotes().length;
  if(!n){ toast('目前還沒有人作答'); return; }
  const ok = await confirmModal({
    title: '清空作答紀錄',
    message: `確定要清空 ${n} 筆作答紀錄嗎？（題目不會被刪掉，但票數回不來）`,
    danger: true,
    requirePhrase: '確認刪除',
  });
  if(!ok) return;
  try{
    const removed = await DataStore.wipeCollection('quizVotes');
    toast(`已清空 ${removed} 筆作答紀錄`);
  }catch(err){ writeFailed(err); }
});
