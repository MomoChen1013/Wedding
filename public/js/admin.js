/* ============================================================
   admin.js — 新人後台
   ------------------------------------------------------------
   一個地方管九件事：
     1. 出席回覆   — 賓客送出的 RSVP：統計、篩選、匯出
     2. 悄悄話     — 賓客投進信箱的悄悄話（原本的 /inbox 頁已併進這裡）
     3. 大廳內容   — 地點、Dress Code、禮金說明、當日流程（寫回 sites 文件）
     4. 桌次       — 上傳桌次圖、匯入賓客名單
     4b. 排桌管理  — 把賓客排進桌位（js/seating-plan.js），存好之後
                     再由新人自己決定要不要同步到賓客的桌次查詢
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

/* 寫入失敗多半是規則擋下來的，講清楚原因比丟 code 有用。
   retry 有傳進來時，toast 上會多一顆「重試」（弱網最需要的就是這一顆）。 */
function writeFailed(err, retry){
  console.warn('[admin] 寫入失敗', err);

  /* 逾時 ≠ 失敗：Firestore 把它排進本機佇列了，連線回來還是會送達。
     所以文案講的是「還沒送出去」，不要嚇到新人以為資料不見了。 */
  if(err && err.code === 'write-timeout'){
    showToast('網路好像不太穩，這一筆還沒送出去（連線回來會自己補送）', {
      isError: true,
      duration: 7000,
      actionLabel: retry ? '重試' : '',
      onAction: retry,
    });
    return;
  }

  if(err && err.code === 'permission-denied'){
    toast('沒有寫入權限：這個 Google 帳號不在新人帳號名單裡', true);
  }else{
    showToast(`存檔失敗：${(err && err.message) || '請再試一次'}`, {
      isError: true,
      actionLabel: retry ? '重試' : '',
      onAction: retry,
    });
  }
}

/* ============================================================
   儲存的狀態
   ------------------------------------------------------------
   按下去之後如果畫面完全沒有反應，使用者會再按一次、再按一次。
   所以每一顆儲存鈕都走這裡：disabled ＋「儲存中…」，回來才恢復。
   失敗（含逾時）會附一顆「重試」，重試走的是同一段程式。
============================================================ */
async function runSave(btn, fn, opts){
  opts = opts || {};
  if(btn && btn._adBusy) return false;

  const origText = btn ? btn.textContent : '';
  if(btn){
    btn._adBusy = true;
    btn.disabled = true;
    btn.classList.add('is-saving');
    btn.textContent = opts.savingText || '儲存中…';
  }

  try{
    const out = await fn();
    if(opts.okText) toast(opts.okText);
    return out === undefined ? true : out;
  }catch(err){
    writeFailed(err, ()=> runSave(btn, fn, opts));
    return false;
  }finally{
    if(btn){
      btn._adBusy = false;
      btn.disabled = false;
      btn.classList.remove('is-saving');
      btn.textContent = origText;
    }
  }
}

/* ============================================================
   目前是不是窄螢幕
   ------------------------------------------------------------
   有幾張清單在手機上是完全不同的畫面（表格 → 卡片），
   不是 CSS 換個排版就好，所以要由 JS 決定畫哪一種，
   並在轉向／改變視窗大小時重畫。
============================================================ */
const narrowMq = window.matchMedia('(max-width: 899px)');
function isNarrow(){ return narrowMq.matches; }

const narrowHandlers = [];
function onNarrowChange(fn){ narrowHandlers.push(fn); }
narrowMq.addEventListener('change', ()=> narrowHandlers.forEach(fn => { try{ fn(); }catch{} }));

/* ============================================================
   sticky 的位移
   ------------------------------------------------------------
   頂列、子分頁列、篩選彙總在手機上是一層疊一層黏著的，
   高度寫死一定會對不準（頂列的信箱換一行就變了），所以量出來。
============================================================ */
function syncStickyMetrics(){
  const bar = document.getElementById('adBar');
  const off = document.getElementById('adOffline');
  const root = document.documentElement.style;

  const barH = bar ? Math.round(bar.getBoundingClientRect().height) : 63;
  const offH = (off && !off.hidden) ? Math.round(off.getBoundingClientRect().height) : 0;
  root.setProperty('--ad-bar-h', `${barH}px`);
  root.setProperty('--ad-stick-top', `${barH + offH}px`);

  const nav = document.querySelector('.ad-panel.is-on .ad-subtabs');
  root.setProperty('--ad-subtabs-h',
    `${nav && isNarrow() ? Math.round(nav.getBoundingClientRect().height) : 0}px`);
}
window.addEventListener('resize', syncStickyMetrics);
window.addEventListener('orientationchange', ()=> setTimeout(syncStickyMetrics, 220));

/* ============================================================
   離線偵測
   ------------------------------------------------------------
   navigator.onLine 只看得到「有沒有連上網路介面」，不保證連得到
   Firestore；但「飛航模式／進電梯」這種最常見的情況它抓得到，
   剩下的交給寫入逾時。兩層加起來就夠了。
============================================================ */
const offlineBarEl = document.getElementById('adOffline');

function syncOnlineState(){
  const off = !navigator.onLine;
  if(offlineBarEl) offlineBarEl.hidden = !off;
  syncStickyMetrics();
}
window.addEventListener('online', ()=>{
  syncOnlineState();
  toast('網路回來了，剛才排隊的改動會自己送出去');
});
window.addEventListener('offline', syncOnlineState);
syncOnlineState();

/* ============================================================
   橫向捲動的提示
   ------------------------------------------------------------
   子分頁列與寬表格都把捲軸藏起來了，「右邊還有東西」就沒有線索。
   捲得動的那一側掛上 class，由 CSS 把邊緣淡掉。
============================================================ */
function bindScrollHints(el){
  if(!el || el._adScrollHint) return;
  el._adScrollHint = true;
  el.classList.add('ad-scrollx');
  const sync = ()=>{
    const max = el.scrollWidth - el.clientWidth;
    el.classList.toggle('can-left', el.scrollLeft > 4);
    el.classList.toggle('can-right', el.scrollLeft < max - 4);
  };
  el.addEventListener('scroll', sync, { passive:true });
  window.addEventListener('resize', sync);
  el._adSyncScrollHint = sync;
  requestAnimationFrame(sync);
}
function refreshScrollHints(root){
  (root || document).querySelectorAll('.ad-scrollx').forEach(el => {
    if(el._adSyncScrollHint) el._adSyncScrollHint();
  });
}

/* ============================================================
   彈窗層（背景鎖捲 ＋ 返回鍵）
   ------------------------------------------------------------
   兩件在手機上一定會踩到的事：
     1. 彈窗開著時背景照樣捲，關掉之後停在完全不同的位置
        （iOS 上 overflow:hidden 鎖不住，要 position:fixed）
     2. 使用者按返回鍵想關掉彈窗，結果直接離開後台，填到一半的表單全沒了

   實作刻意用 MutationObserver 監看 [hidden]／class，而不是去改
   十幾處 `mask.hidden = false`：開關彈窗的地方太多，漏掉一處就會
   留下一個鎖住的畫面。看「現在到底開著沒」最不會錯。
============================================================ */
const layerStack = [];       /* [{ el, close }]，最上面那一層在最後 */
let lockScrollY = 0;
let skipNextPop = false;

function lockBodyScroll(){
  lockScrollY = window.scrollY || window.pageYOffset || 0;
  document.body.style.top = `-${lockScrollY}px`;
  document.body.classList.add('ad-lock');
}
function unlockBodyScroll(){
  if(!document.body.classList.contains('ad-lock')) return;
  document.body.classList.remove('ad-lock');
  document.body.style.top = '';
  window.scrollTo(0, lockScrollY);
}

function pushLayer(el, close){
  if(layerStack.some(l => l.el === el)) return;
  if(!layerStack.length) lockBodyScroll();
  layerStack.push({ el, close });
  try{ history.pushState({ adLayer: layerStack.length }, ''); }catch{}
}

function popLayer(el){
  const i = layerStack.findIndex(l => l.el === el);
  if(i < 0) return;
  layerStack.splice(i, 1);
  if(!layerStack.length) unlockBodyScroll();
  /* 彈窗是被自己的按鈕關掉的 → 把當初推進去的那一格歷史紀錄退掉，
     不然使用者要按兩次返回才離得開這一頁。
     但只有在那一格仍然是「現在這一格」時才退 —— 中途換過分頁（hash 又推了
     一格）的話，退回去等於把使用者的分頁切換一起撤銷。 */
  if(history.state && history.state.adLayer === i + 1){
    skipNextPop = true;
    try{ history.back(); }catch{ skipNextPop = false; }
  }
}

window.addEventListener('popstate', ()=>{
  if(skipNextPop){ skipNextPop = false; return; }
  const top = layerStack[layerStack.length - 1];
  if(!top) return;
  /* 使用者按了返回鍵：關掉最上面那一層就好，不要離開後台。
     真正的關閉交給彈窗自己的 close（該問的還是會問） */
  layerStack.pop();
  if(!layerStack.length) unlockBodyScroll();
  try{ top.close(); }catch(err){ console.warn('[admin] 關閉彈窗失敗', err); }
});

/* el 顯示出來時推一層、收起來時退一層。
   isOpen 預設看 [hidden]，抽屜那種用 class 的自己傳。 */
function watchLayer(el, close, isOpen){
  if(!el || el._adLayerWatched) return;
  el._adLayerWatched = true;
  const open = isOpen || (() => !el.hidden);
  let was = open();
  const obs = new MutationObserver(()=>{
    const now = open();
    if(now === was) return;
    was = now;
    if(now) pushLayer(el, close);
    else popLayer(el);
  });
  obs.observe(el, { attributes:true, attributeFilter:['hidden', 'class', 'style'] });
  if(was) pushLayer(el, close);
}

/* 讓「按遮罩就關」的彈窗也能被返回鍵關掉：
   直接在遮罩上補一次 click，走的是它原本註冊的那條關閉路徑
   （該先問一句的（例如貼了一半的桌次名單）仍然會問） */
function closeViaMask(mask){
  return ()=> mask.dispatchEvent(new MouseEvent('click', { bubbles:true }));
}

/* 全站的彈窗都掛上去。cropper 是動態插入的，另外用一個 observer 接。 */
function bindAllLayers(){
  document.querySelectorAll('.ad-modal-mask').forEach(mask => {
    watchLayer(mask, closeViaMask(mask));
  });
  const spDrawer = document.getElementById('spDrawer');
  const spClose  = document.getElementById('spDrawerClose');
  if(spDrawer && spClose) watchLayer(spDrawer, ()=> spClose.click());
}

/* 裁切器（cropper.js）是 document.body.appendChild 進來的 */
new MutationObserver((records)=>{
  records.forEach(rec => {
    rec.addedNodes.forEach(node => {
      if(node.nodeType !== 1 || !node.classList.contains('cr-mask')) return;
      const cancel = node.querySelector('#crCancel');
      watchLayer(node, ()=>{ if(cancel) cancel.click(); });
    });
    rec.removedNodes.forEach(node => {
      if(node.nodeType !== 1 || !node.classList.contains('cr-mask')) return;
      popLayer(node);
    });
  });
}).observe(document.body, { childList:true });

/* ---------- 往下滑關掉 bottom sheet ----------
   手機上的彈窗是貼著底部出現的，那個手勢就該是「往下推走」。
   只從卡片最上緣那一段（drag handle 所在的 44px）起手 ——
   從內容區起手的話，會和表單本身的捲動、輸入打架。 */
(function bindSheetSwipe(){
  const sheetMq = window.matchMedia('(max-width: 560px)');
  let card = null, startY = 0, moved = 0, mask = null;

  document.addEventListener('pointerdown', (e)=>{
    if(!sheetMq.matches || e.pointerType === 'mouse') return;
    const c = e.target.closest('.ad-modal-card, .cr-card');
    if(!c) return;
    const r = c.getBoundingClientRect();
    if(e.clientY - r.top > 44) return;      /* 只認最上緣那一條 */
    if(c.scrollTop > 0) return;             /* 內容捲到一半時不接手 */
    card = c;
    mask = c.closest('.ad-modal-mask, .cr-mask');
    startY = e.clientY;
    moved = 0;
  }, true);

  document.addEventListener('pointermove', (e)=>{
    if(!card) return;
    moved = Math.max(0, e.clientY - startY);
    card.style.transform = `translateY(${moved}px)`;
    card.style.transition = 'none';
  }, { passive:true });

  function end(){
    if(!card) return;
    const c = card, m = mask, far = moved > 90;
    card = null; mask = null;
    c.style.transition = 'transform .18s ease';
    c.style.transform = '';
    if(far && m) m.dispatchEvent(new MouseEvent('click', { bubbles:true }));
  }
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
})();

/* ============================================================
   一列一顆的「⋮ 更多」選單
   ------------------------------------------------------------
   為什麼要有這個東西：
     ・「編輯」和「刪除」原本只隔 10px，拇指一按很容易點錯
     ・可排序的清單在觸控裝置上完全沒有排序工具（拖曳觸控用不了）
   兩件事收在同一顆按鈕裡：危險的動作排最後、用危險色，
   排序改成「上移／下移／移到最前／移到最後」的選單。
============================================================ */
const rowMenuBuilders = {};

function registerRowMenu(key, build){ rowMenuBuilders[key] = build; }

function rowMenuBtn(key, id){
  return `<button class="ad-rowmenu-btn" type="button" data-rowmenu="${key}:${escapeHtml(id)}"
    aria-label="更多操作" aria-haspopup="true">⋮</button>`;
}

const rowMenuEl = document.createElement('div');
rowMenuEl.className = 'ad-rowmenu';
rowMenuEl.hidden = true;
document.body.appendChild(rowMenuEl);
let rowMenuOwner = null;
let rowMenuAt = 0;

function closeRowMenu(){
  rowMenuEl.hidden = true;
  rowMenuEl.innerHTML = '';
  if(rowMenuOwner) rowMenuOwner.classList.remove('is-open');
  rowMenuOwner = null;
}

function openRowMenu(btn){
  const [key, ...rest] = String(btn.dataset.rowmenu).split(':');
  const id = rest.join(':');
  const build = rowMenuBuilders[key];
  if(!build) return;
  const items = build(id) || [];
  if(!items.length) return;

  closeRowMenu();
  rowMenuOwner = btn;
  rowMenuAt = Date.now();
  btn.classList.add('is-open');
  rowMenuEl.innerHTML = items.map((it, i) => it === '-'
    ? '<div class="ad-rowmenu-sep"></div>'
    : `<button class="ad-rowmenu-item${it.danger ? ' is-danger' : ''}" type="button"
         data-i="${i}"${it.disabled ? ' disabled' : ''}>${escapeHtml(it.label)}</button>`).join('');
  rowMenuEl.hidden = false;

  /* 貼著按鈕放；下面塞不下就翻到上面，右邊超出畫面就往內收 */
  const r = btn.getBoundingClientRect();
  const w = rowMenuEl.offsetWidth;
  const h = rowMenuEl.offsetHeight;
  let top = r.bottom + 4;
  if(top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
  let left = r.right - w;
  if(left < 8) left = 8;
  if(left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
  rowMenuEl.style.top = `${Math.round(top)}px`;
  rowMenuEl.style.left = `${Math.round(left)}px`;

  rowMenuEl._adItems = items;
}

rowMenuEl.addEventListener('click', (e)=>{
  const btn = e.target.closest('.ad-rowmenu-item');
  if(!btn) return;
  const it = (rowMenuEl._adItems || [])[Number(btn.dataset.i)];
  closeRowMenu();
  if(it && it.run) it.run();
});

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-rowmenu]');
  if(btn){
    e.preventDefault();
    if(rowMenuOwner === btn) closeRowMenu();
    else openRowMenu(btn);
    return;
  }
  if(!e.target.closest('.ad-rowmenu')) closeRowMenu();
});
document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') closeRowMenu(); });
/* 捲動就收起來（選單是 fixed 的，跟著捲會離開它那一列）。
   但「按下去」本身常常會先把那一列捲進畫面，那一下的 scroll 不能算 ——
   不擋的話選單會在打開的同一瞬間又被關掉。 */
window.addEventListener('scroll', ()=>{
  if(Date.now() - rowMenuAt < 350) return;
  closeRowMenu();
}, true);

/* 一份清單的「上移／下移／移到最前／移到最後」。
   list 是目前的順序、id 是這一列，apply(newIds) 負責寫回去。 */
function reorderMenuItems(list, id, apply){
  const ids = list.map(x => (typeof x === 'string' ? x : x.id));
  const i = ids.indexOf(id);
  if(i < 0) return [];
  const move = (to)=>{
    const next = ids.slice();
    const [x] = next.splice(i, 1);
    next.splice(to, 0, x);
    apply(next, ids);
  };
  return [
    { label:'上移一位',   disabled: i === 0,                 run: ()=> move(i - 1) },
    { label:'下移一位',   disabled: i === ids.length - 1,    run: ()=> move(i + 1) },
    { label:'移到最前面', disabled: i === 0,                 run: ()=> move(0) },
    { label:'移到最後面', disabled: i === ids.length - 1,    run: ()=> move(ids.length - 1) },
  ];
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
['rsvps', 'letters', 'seating', 'seatingImages', 'blessings', 'explore', 'cards', 'exhibits', 'quiz',
 'quizVotes', 'rsvpTags']
  .forEach(key => {
    document.addEventListener(`data:${key}`, ()=> loadedOnce.add(key));
    document.addEventListener(`data:${key}:denied`, ()=> loadedOnce.add(key));
  });

/* ============================================================
   正在打字時不要重畫
   ------------------------------------------------------------
   有幾份清單（婚禮小卡、桌次圖、標籤庫）是「欄位就長在清單上、
   離開欄位就存」。這種清單只要有任何一筆 snapshot 回來就會整份重畫 ——
   而重畫等於把使用者打到一半的那個 input 換成一個新的 DOM 節點：
   打的字沒了，接下來的 blur 也落在一個已經被丟掉的節點上，
   那一筆修改就這樣消失。手機上更明顯（改一個欄位就會觸發一次重畫）。

   所以：焦點還在這份清單的欄位裡時先不畫，等他離開欄位再補上。
============================================================ */
function guardedRender(hostEl, render){
  const typing = ()=>{
    const a = document.activeElement;
    return !!a && hostEl.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  };
  if(!typing()){ render(); return; }
  if(hostEl._adPendingRender) return;

  /* 等到焦點真的離開整份清單為止。
     只等「這一個欄位」的 blur 是不夠的 —— 使用者從卡名 tab 到說明時
     也會 blur，那時候重畫等於把他正要打的下一個欄位換掉，
     接著的 change 就落在一個已經被丟掉的節點上，那一筆修改直接消失。
     setTimeout(0) 是為了讓 activeElement 更新成新的焦點之後再判斷；
     欄位的 change 也已經在這之前同步跑完（值都是同步讀出來的）。 */
  hostEl._adPendingRender = true;
  const check = ()=> setTimeout(()=>{
    if(typing()) return;                       /* 還在這份清單裡打字，繼續等 */
    hostEl.removeEventListener('focusout', check);
    hostEl._adPendingRender = false;
    render();
  }, 0);
  hostEl.addEventListener('focusout', check);
}

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

function confirmModal({ title, message, danger, requirePhrase, confirmText, cancelText, input }){
  return new Promise(resolve => {
    modalTitleEl.textContent = title || '確定嗎？';
    modalMsgEl.textContent = message || '';
    modalCardEl.classList.toggle('is-danger', !!danger);
    modalConfirmBtn.textContent = confirmText || '確定';
    modalCancelBtn.textContent = cancelText || '取消';

    /* input 有值＝當成「請輸入一段文字」用（新增標籤這種），
       解析出來的是字串而不是 true／false */
    const asPrompt = !!input;
    modalPhraseEl.hidden = !requirePhrase && !asPrompt;
    modalPhraseEl.value = asPrompt ? (input.value || '') : '';
    modalPhraseEl.placeholder = asPrompt
      ? (input.placeholder || '')
      : (requirePhrase ? `輸入「${requirePhrase}」` : '');
    modalPhraseEl.maxLength = asPrompt ? (input.maxLength || 100) : 200;
    modalConfirmBtn.disabled = !!requirePhrase || (asPrompt && !modalPhraseEl.value.trim());

    function onPhraseInput(){
      modalConfirmBtn.disabled = asPrompt
        ? !modalPhraseEl.value.trim()
        : modalPhraseEl.value.trim() !== requirePhrase;
    }
    if(requirePhrase || asPrompt) modalPhraseEl.addEventListener('input', onPhraseInput);

    function close(result){
      modalMaskEl.hidden = true;
      modalPhraseEl.removeEventListener('input', onPhraseInput);
      modalConfirmBtn.removeEventListener('click', onConfirm);
      modalCancelBtn.removeEventListener('click', onCancel);
      modalMaskEl.removeEventListener('click', onMaskClick);
      document.removeEventListener('keydown', onKeydown);
      resolve(result);
    }
    function onConfirm(){
      if(!modalConfirmBtn.disabled) close(asPrompt ? modalPhraseEl.value.trim() : true);
    }
    function onCancel(){ close(false); }
    function onMaskClick(e){ if(e.target === modalMaskEl) close(false); }
    function onKeydown(e){
      if(e.key === 'Escape') close(false);
      /* 打完字直接按 Enter 就送出，不用再移到按鈕上 */
      if(e.key === 'Enter' && asPrompt && document.activeElement === modalPhraseEl) onConfirm();
    }

    modalConfirmBtn.addEventListener('click', onConfirm);
    modalCancelBtn.addEventListener('click', onCancel);
    modalMaskEl.addEventListener('click', onMaskClick);
    document.addEventListener('keydown', onKeydown);

    modalMaskEl.hidden = false;
    (requirePhrase || asPrompt ? modalPhraseEl : modalConfirmBtn).focus();
  });
}

/* 只要一行字的輸入視窗（新增標籤…）：取消回傳 false，確定回傳去頭尾空白的字串 */
function promptModal({ title, message, placeholder, maxLength, value, confirmText }){
  return confirmModal({
    title, message, confirmText,
    input:{ placeholder, maxLength, value },
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
  /* 排桌管理沒有對外網址，開關同樣放在 pages 裡（見 site-context.js 的
     ADMIN_FEATURES）—— 沒開的站台後台就不會長出這個分頁 */
  seatingPlan: 'seatingPlan',
  /* 收禮小幫手同樣沒有對外網址（工具在 /butler#{token}，不在 /w/{slug}/ 底下），
     開關一樣放在 pages 裡 —— 沒開的站台後台就不會長出這個分頁 */
  butler:   'butler',
  letters:  'letter',
  cards:    'draw',
  exhibits: 'exhibition',
  quiz:     'quiz',
};

function tabEnabled(tab){
  const key = TAB_PAGE[tab];
  if(!key) return true;
  /* 看的是 pages（我們幫這組新人開了哪幾頁），不是 isEnabled()——
     桌次功能被新人自己關起來時，賓客看不到那一頁，
     但後台的「桌次」分頁要留著，名單和桌次圖才有地方先整理。 */
  const S = window.SITE;
  if(!S) return false;
  return !!(S.isPageOn ? S.isPageOn(key) : S.isEnabled(key));
}

/* 關掉的分頁連按鈕帶內容一起收起來（面板的顯示交給 activateTab 統一處理） */
function applyTabVisibility(){
  document.querySelectorAll('#adSide .ad-tab').forEach(btn => {
    btn.hidden = !tabEnabled(btn.dataset.tab);
  });
  /* 子分頁只有「設定賓客標籤」有開關。先在 initRouter 之前決定它在不在，
     #rsvp/tags 這個網址才進得去（進不去的話 activateSubtab 會退回第一個） */
  const tagBtn = document.getElementById('adTagSubtab');
  if(tagBtn) tagBtn.hidden = !guestTagsOn();
  /* 桌次名單的「同步現在的排桌」要有排桌管理才有意義 */
  const seatSyncBtn = document.getElementById('adSeatSyncPlan');
  const seatSyncNote = document.getElementById('adSeatSyncNote');
  if(seatSyncBtn) seatSyncBtn.hidden = !tabEnabled('seatingPlan');
  if(seatSyncNote) seatSyncNote.hidden = !tabEnabled('seatingPlan');
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
  /* 表單設定裡的兩顆按鈕指的都是賓客那一頁（分享出去的就是這個網址） */
  document.getElementById('adRsvpViewForm').href = sitePath('rsvp');
  document.getElementById('adRsvpGalleryView').href = sitePath('rsvp');

  applyTabVisibility();

  /* 子分頁列：捲得動就把邊緣淡掉當提示；只有兩三顆時排成等寬的 segmented control，
     手機上就不用捲了（原本第三、四顆會被切在畫面外，而且沒有任何線索） */
  document.querySelectorAll('.ad-subtabs').forEach(nav => {
    nav.dataset.count = String(nav.querySelectorAll('.ad-subtab:not([hidden])').length);
    bindScrollHints(nav);
  });
  document.querySelectorAll('.ad-tablewrap').forEach(bindScrollHints);
  bindAllLayers();
  syncStickyMetrics();

  initRouter();

  /* 訂閱各份資料，畫面隨著資料變動重畫。
     沒開的頁面連訂閱都省下來，不做白工的讀取。 */
  if(tabEnabled('rsvp')){
    DataStore.subscribeRsvps();
    /* 沒開標籤功能就連訂閱都省下來 */
    if(guestTagsOn()) DataStore.subscribeRsvpTags();
    fillRsvpFormSettings();
    renderTags();
    renderRsvpTagChips();
    renderRsvps();
  }
  if(tabEnabled('seating')){
    DataStore.subscribeSeating();
    renderSeatList();
    renderImages();
    syncSeatSearchUI();
  }
  /* 排桌管理要讀 RSVP（賓客與人數）與賓客標籤，所以連它們一起訂閱 ——
     出席回覆那一頁被關掉時，這裡仍然需要同一份名單 */
  if(tabEnabled('seatingPlan')){
    DataStore.subscribeRsvps();
    if(guestTagsOn()) DataStore.subscribeRsvpTags();
    if(window.SeatingPlan) SeatingPlan.init();
  }
  /* 收禮小幫手：連結簿在 sites/{siteId}/butlerLinks，收禮紀錄在最上層的
     butlers/{bookId}。名單匯出要用到排桌與出席回覆，所以連它們一起訂閱 */
  if(tabEnabled('butler')){
    DataStore.subscribeRsvps();
    Butler.init();
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
  syncSeatFeatureUI();
  fillSiteForm();
  renderSchedule(siteSchedule());
  /* 上次沒存完的婚禮資訊（填完表單之後才問，不然會被 fillSiteForm 蓋掉） */
  offerSiteDraft();
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
  pwErr.textContent = '這個站台還沒設定新人帳號名單（要新增請告訴我們）';
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
  rsvp:    ['overview', 'replies', 'form', 'tags'],
  lobby:   ['info', 'schedule', 'explore'],
  seating: ['map', 'list'],
  seatingPlan: ['board', 'tables', 'io'],
  butler:  ['stats', 'links'],
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

/* 對不上、或被收起來的子分頁一律退回第一個看得到的（清單的第一項就是預設）。
   「設定賓客標籤」在沒開標籤功能時是 hidden 的，用網址直接指過去也要退回去。 */
function activateSubtab(tab, subtab){
  const list = SUBTABS[tab];
  if(!list) return '';
  const btns = Array.from(
    document.querySelectorAll(`.ad-subtabs[data-subtabs="${tab}"] .ad-subtab`));
  const shown = list.filter(k => {
    const b = btns.find(x => x.dataset.subtab === k);
    return !b || !b.hidden;
  });
  const valid = shown.includes(subtab) ? subtab : (shown[0] || list[0]);
  btns.forEach(b => b.classList.toggle('is-on', b.dataset.subtab === valid));
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

  /* 換了分頁＝換了一組子分頁列與表格，sticky 的高度與捲動提示都要重算 */
  requestAnimationFrame(()=>{
    syncStickyMetrics();
    refreshScrollHints();
  });

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
    if(!btn || btn.hidden) return;
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
  /* 返回鍵＝關掉抽屜（Android 的實體返回、iOS 的邊緣手勢都是這個直覺） */
  pushLayer(adSideEl, closeDrawer);
}
function closeDrawer(){
  if(!adSideEl.classList.contains('is-open')) return;
  adSideEl.classList.remove('is-open');
  adBackdropEl.classList.remove('is-on');
  adMenuBtn.setAttribute('aria-expanded', 'false');
  setTimeout(()=>{ adBackdropEl.hidden = true; }, 220);
  popLayer(adSideEl);
}
adMenuBtn.addEventListener('click', ()=>{
  adSideEl.classList.contains('is-open') ? closeDrawer() : openDrawer();
});
adBackdropEl.addEventListener('click', closeDrawer);
document.getElementById('adSideClose').addEventListener('click', closeDrawer);
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
/* 標籤篩選：'all'＝不篩、'none'＝一個標籤都沒有、其他就是標籤 id */
let rsvpTagFilter = 'all';
const rsvpPager = pagerState('rsvp');

/* createdAt 是 Firestore 的 Timestamp（伺服器時間），不是數字 */
function rsvpTime(r){
  const t = r.createdAt;
  if(t && typeof t.toDate === 'function') return t.toDate().getTime();
  return 0;
}

/* 一位賓客身上的標籤 ＝ 他自己在表單選的那一個 ＋ 新人在後台掛的那些。
   賓客選的存在回覆裡（改不動），新人掛的存在 rsvpTags/{回覆 id}，
   這裡合起來當成同一份清單用（已經刪掉的標籤查不到名字，自動略過）。 */
function rsvpTagIds(r){
  const mine = DataStore.getRsvpTagMap()[r.id] || [];
  const all = [String(r.tag || ''), ...mine].filter(Boolean);
  return [...new Set(all)].filter(id => guestTagName(id));
}

function visibleRsvps(){
  const q = normKey(rsvpFilterEl.value);
  const tagsOn = guestTagsOn();
  return DataStore.getRSVPs().filter(r => {
    if(rsvpFilter !== 'all' && DataStore.rsvpStatus(r) !== rsvpFilter) return false;

    if(tagsOn && rsvpTagFilter !== 'all'){
      const ids = rsvpTagIds(r);
      if(rsvpTagFilter === 'none'){ if(ids.length) return false; }
      else if(!ids.includes(rsvpTagFilter)) return false;
    }

    if(!q) return true;
    /* 標籤名字也吃得到搜尋，「大學同學」打進去就找得到那一群 */
    const tagText = tagsOn ? rsvpTagIds(r).map(guestTagName).join(' ') : '';
    return normKey(r.name).includes(q)
        || normKey(r.message).includes(q)
        || normKey(r.note).includes(q)
        || normKey(tagText).includes(q);
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

function renderRsvpCharts(state){
  /* 載入中畫 skeleton，不要先畫五個空圓環 —— 那和「真的沒人回覆」長得一模一樣 */
  if(state === 'loading'){
    rsvpChartsEl.classList.remove('ad-donuts');
    rsvpChartsEl.innerHTML = skeletonHtml(2, ['46%', '70%', '58%']);
    return;
  }
  /* 一筆都還沒進來：與其畫一排 0，不如給下一步的入口 */
  if(state === 'empty'){
    rsvpChartsEl.classList.remove('ad-donuts');
    rsvpChartsEl.innerHTML = `
      <div class="ad-donuts-empty">
        等第一份回覆進來，這裡就會出現出席、飲食、兒童座椅的分布圖
        <div class="ad-row">
          <button class="btn small ghost" id="adRsvpCopyInvite" type="button">複製邀請函連結</button>
        </div>
      </div>`;
    return;
  }

  rsvpChartsEl.classList.add('ad-donuts');
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

const rsvpTotalEl = document.getElementById('adRsvpTotal');
const rsvpSubEl   = document.getElementById('adRsvpSub');
const rsvpMetaEl  = document.getElementById('adRsvpMeta');

function renderRsvps(){
  /* 載入中的畫面要和「真的沒人回覆」分得開。
     這個檢查一定要在最前面 —— 先把 0 寫上去再檢查的話，行動網路的那 1–3 秒裡
     新人看到的就是一個大大的「0」加「還沒有人回覆」，和真的沒人一模一樣。 */
  if(!loadedOnce.has('rsvps')){
    rsvpTotalEl.textContent = '—';
    rsvpSubEl.textContent = '讀取中…';
    rsvpMetaEl.hidden = true;
    renderRsvpCharts('loading');
    rsvpListEl.innerHTML = skeletonHtml(4);
    rsvpFilterSumEl.hidden = true;
    return;
  }

  const total = DataStore.getRSVPCount();
  const head  = DataStore.getAttendingCount();
  const tally = DataStore.getRsvpTally();

  rsvpTotalEl.textContent = total;
  rsvpSubEl.textContent = total
    ? `確定出席 ${head} 位・熱情出席 ${tally.yes} 筆・視情況而定 ${tally.maybe} 筆・無法出席 ${tally.no} 筆`
    : '還沒有人回覆';

  renderRsvpMeta(total);
  renderRsvpCharts(total ? '' : 'empty');

  const all = visibleRsvps();
  renderRsvpFilterSum(all.length, total);

  if(!all.length){
    rsvpListEl.innerHTML = `<div class="ad-empty">${
      total ? '沒有符合的回覆' : '還沒有人回覆出席'}</div>`;
    renderPager(rsvpListEl, rsvpPager, 0, renderRsvps);
    return;
  }

  renderPager(rsvpListEl, rsvpPager, all.length, renderRsvps);
  const list = all.slice((rsvpPager.page - 1) * rsvpPager.size, rsvpPager.page * rsvpPager.size);
  /* 手機是一位一張卡，桌機是表格 —— 16 欄的表格在 390px 上要左右滑 3–4 個螢幕，
     而「人數／葷／素」正好排在最後面 */
  rsvpListEl.innerHTML = isNarrow() ? rsvpCardsHtml(list) : rsvpTableHtml(list);
  refreshScrollHints(rsvpListEl);
  document.querySelectorAll('#adRsvpList .ad-tablewrap').forEach(bindScrollHints);
}
onNarrowChange(renderRsvps);

/* 「這是到目前為止的全部回覆」要明講，並附上最後一筆進來的時間 ——
   現場對帳時，沒有這個時間就會開始懷疑是不是卡住了 */
function renderRsvpMeta(total){
  if(!total){ rsvpMetaEl.hidden = true; return; }
  const list = DataStore.getRSVPs();
  const times = list.map(rsvpTime).filter(Boolean);
  const last = times.length ? Math.max(...times) : 0;
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const fresh = times.filter(t => t >= weekAgo).length;

  rsvpMetaEl.innerHTML =
    `統計區間：<b>全部回覆</b>`
    + (last ? `・最後更新 <b>${escapeHtml(fmtTime(last))}</b>` : '')
    + (fresh ? `<br>近 7 天新增 <b>${fresh}</b> 筆` : '');
  rsvpMetaEl.hidden = false;
}

/* ---------- 篩選彙總 ----------
   手機上出席 chips、標籤 chips、搜尋框分三排，捲下去看名單時全部離開畫面，
   很容易忘記自己還開著篩選，然後以為資料不見了。 */
const rsvpFilterSumEl  = document.getElementById('adRsvpFilterSum');
const rsvpFilterSumTxt = document.getElementById('adRsvpFilterSumText');

function renderRsvpFilterSum(shown, total){
  const bits = [];
  if(rsvpFilter !== 'all') bits.push(RSVP_LABEL[rsvpFilter]);
  if(guestTagsOn() && rsvpTagFilter !== 'all'){
    bits.push(rsvpTagFilter === 'none' ? '沒有標籤' : `標籤「${guestTagName(rsvpTagFilter)}」`);
  }
  const q = rsvpFilterEl.value.trim();
  if(q) bits.push(`搜尋「${q}」`);

  if(!bits.length){ rsvpFilterSumEl.hidden = true; return; }
  rsvpFilterSumTxt.innerHTML =
    `目前顯示：${bits.map(escapeHtml).join(' ・ ')} — <b>${shown}</b> / ${total} 筆`;
  rsvpFilterSumEl.hidden = false;
}

document.getElementById('adRsvpFilterClear').addEventListener('click', ()=>{
  rsvpFilter = 'all';
  rsvpTagFilter = 'all';
  rsvpFilterEl.value = '';
  document.querySelectorAll('#adRsvpChips .ad-chip')
    .forEach(c => c.classList.toggle('is-on', c.dataset.filter === 'all'));
  renderRsvpTagChips();
  rsvpPager.page = 1;
  renderRsvps();
});

/* ============================================================
   回覆名單的表格
   ------------------------------------------------------------
   本來一筆是一張堆疊的卡片，欄位一多就要一行一行讀。
   改成表格：同一欄從上到下對得起來，才比得出「誰吃素、誰要喜餅」。
   欄位多到一定會橫向捲，所以表頭 sticky（見 admin.css）。
   關掉的題目整欄不出現 —— 一整欄的「—」沒有任何資訊。
============================================================ */
function rsvpColumns(){
  const cfg = rsvpConfig();
  return {
    tags: guestTagsOn(),
    contact: cfg.contacts.length > 0,
    card: cfg.askCard,
    gift: cfg.askGift,
    message: cfg.askMessage,
  };
}

/* 空的格子畫一條短破折號，不要留成一片空白讓人以為是漏讀 */
function td(html, cls){
  const c = cls ? ` class="${cls}"` : '';
  return `<td${c}>${html || '<span class="ad-td-empty">—</span>'}</td>`;
}

function rsvpTableHtml(list){
  const col = rsvpColumns();

  /* 姓名放第一欄並且 sticky：欄位多到一定會橫向捲，
     捲到「喜餅」那一欄時還看得到現在讀的是誰 */
  const head = [
    '<th class="is-name">姓名</th>',
    col.tags ? `<th>標籤<button class="ad-th-link" type="button" id="adRsvpTagSetupHead">設定標籤</button></th>` : '',
    '<th>出席回應</th>',
    '<th>分類</th>',
    col.contact ? '<th>聯絡資訊</th>' : '',
    '<th class="is-num">人數</th>',
    '<th class="is-num">葷</th>',
    '<th class="is-num">素</th>',
    '<th class="is-num">兒童椅</th>',
    '<th>飲食習慣</th>',
    col.card ? '<th>喜帖</th>' : '',
    col.gift ? '<th>喜餅</th>' : '',
    col.message ? '<th class="is-wide">給新人的話</th>' : '',
    '<th class="is-wide">備註</th>',
    '<th>填表時間</th>',
    '<th class="is-act"></th>',
  ].filter(Boolean).join('');

  const rows = list.map(r => {
    const st = DataStore.rsvpStatus(r);
    const t = rsvpTime(r);
    const going = st === 'yes';

    const tagCell = !col.tags ? '' : `<td><div class="ad-tagcell">${
      rsvpTagIds(r).map(id =>
        `<span class="ad-tag ad-tag-guest">${escapeHtml(guestTagName(id))}</span>`).join('')
    }<button class="ad-edit" type="button" data-tag-edit="${r.id}">標籤</button></div></td>`;

    const contacts = [
      r.contactPhone && `電話 ${r.contactPhone}`,
      r.contactLine && `LINE ${r.contactLine}`,
      r.contactEmail && r.contactEmail,
    ].filter(Boolean);

    /* 喜帖／喜餅：選了什麼放第一行，寄去哪裡縮小放第二行 */
    const cardBits = [];
    if(r.cardType){
      cardBits.push(rsvpLabel('card', r.cardType)
        + (r.cardType === 'paper' && r.cardDelivery
            ? `（${rsvpLabel('cardDelivery', r.cardDelivery)}）` : ''));
    }
    const cardSub = [
      r.cardEmail,
      r.cardAddress && `${r.cardZip || ''} ${r.cardAddress}`.trim(),
    ].filter(Boolean);

    const giftBits = r.giftDelivery ? [rsvpLabel('gift', r.giftDelivery)] : [];
    const giftSub = r.giftAddress ? [`${r.giftZip || ''} ${r.giftAddress}`.trim()] : [];

    const stack = (main, sub) => {
      if(!main.length && !sub.length) return '';
      return `<div class="ad-td-lines">${
        main.map(x => `<span>${escapeHtml(x)}</span>`).join('')
      }${
        sub.map(x => `<span class="ad-td-sub">${escapeHtml(x)}</span>`).join('')
      }</div>`;
    };

    return `<tr data-rsvp="${r.id}">
      <td class="is-name">${escapeHtml(`${r.icon || ''} ${r.name || '（沒有名字）'}`.trim())}</td>
      ${tagCell}
      <td><span class="ad-tag ad-tag-${st}">${RSVP_LABEL[st]}</span></td>
      ${td(escapeHtml(rsvpLabel('relation', r.relation)))}
      ${col.contact ? td(stack(contacts, [])) : ''}
      ${td(going ? String(Number(r.guestCount) || 1) : '', 'is-num')}
      ${td(going ? String(Number(r.mealMeat) || 0) : '', 'is-num')}
      ${td(going ? String(Number(r.mealVeg) || 0) : '', 'is-num')}
      ${td(going && Number(r.childSeat) > 0 ? String(Number(r.childSeat)) : '', 'is-num')}
      ${td(escapeHtml(r.dietaryNote || ''))}
      ${col.card ? td(stack(cardBits, cardSub)) : ''}
      ${col.gift ? td(stack(giftBits, giftSub)) : ''}
      ${col.message ? td(escapeHtml(r.message || ''), 'is-wide') : ''}
      ${td(escapeHtml(r.note || ''), 'is-wide')}
      <td class="ad-td-sub">${t ? fmtTime(t) : '時間未知'}</td>
      <td class="is-act"><button class="ad-del" type="button" data-del-rsvp="${r.id}">刪除</button></td>
    </tr>`;
  }).join('');

  return `<div class="ad-tablewrap"><table class="ad-table">
    <thead><tr>${head}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

/* ============================================================
   回覆名單的卡片（手機）
   ------------------------------------------------------------
   16 欄的表格在 390px 的手機上實寬約 1400px：要左右滑 3–4 個螢幕寬
   才看得到「人數／葷／素」，而那正是新人最常看的三欄。
   所以手機改成一位一張卡：
     第一行 姓名 ＋ 出席狀態
     第二行 N 位・葷 X／素 Y・兒童椅 Z   ← 最常看的三個數字
   其餘（聯絡、喜帖、喜餅、留言、備註、時間）收進「展開更多」。
============================================================ */
function rsvpCardsHtml(list){
  const col = rsvpColumns();

  return `<ul class="ad-rcards">${list.map(r => {
    const st = DataStore.rsvpStatus(r);
    const going = st === 'yes';
    const t = rsvpTime(r);

    const keyBits = going
      ? [
          `${Number(r.guestCount) || 1} 位`,
          `葷 ${Number(r.mealMeat) || 0}／素 ${Number(r.mealVeg) || 0}`,
          Number(r.childSeat) > 0 ? `兒童椅 ${Number(r.childSeat)}` : '',
        ].filter(Boolean).join('・')
      : '';

    const tags = col.tags ? rsvpTagIds(r) : [];

    const contacts = [
      r.contactPhone && `電話 ${r.contactPhone}`,
      r.contactLine && `LINE ${r.contactLine}`,
      r.contactEmail && r.contactEmail,
    ].filter(Boolean).join('\n');

    const cardText = !col.card ? '' : [
      r.cardType ? rsvpLabel('card', r.cardType)
        + (r.cardType === 'paper' && r.cardDelivery
            ? `（${rsvpLabel('cardDelivery', r.cardDelivery)}）` : '') : '',
      r.cardEmail || '',
      r.cardAddress ? `${r.cardZip || ''} ${r.cardAddress}`.trim() : '',
    ].filter(Boolean).join('\n');

    const giftText = !col.gift ? '' : [
      r.giftDelivery ? rsvpLabel('gift', r.giftDelivery) : '',
      r.giftAddress ? `${r.giftZip || ''} ${r.giftAddress}`.trim() : '',
    ].filter(Boolean).join('\n');

    const row = (name, value) => value
      ? `<div class="ad-rcard-row"><span>${name}</span><b>${escapeHtml(value)}</b></div>` : '';

    const rest = [
      row('分類', rsvpLabel('relation', r.relation)),
      row('聯絡', contacts),
      row('飲食習慣', r.dietaryNote || ''),
      row('喜帖', cardText),
      row('喜餅', giftText),
      col.message ? row('給新人的話', r.message || '') : '',
      row('備註', r.note || ''),
    ].filter(Boolean).join('');

    return `<li class="ad-rcard" data-rsvp="${r.id}">
      <div class="ad-rcard-head">
        <span class="ad-rcard-name">${escapeHtml(`${r.icon || ''} ${r.name || '（沒有名字）'}`.trim())}</span>
        <span class="ad-tag ad-tag-${st}">${RSVP_LABEL[st]}</span>
      </div>
      ${keyBits
        ? `<div class="ad-rcard-key">${escapeHtml(keyBits)}</div>`
        : `<div class="ad-rcard-key is-off">${escapeHtml(rsvpLabel('relation', r.relation) || '—')}</div>`}
      ${tags.length ? `<div class="ad-rcard-tags">${tags.map(id =>
        `<span class="ad-tag ad-tag-guest">${escapeHtml(guestTagName(id))}</span>`).join('')}</div>` : ''}
      <div class="ad-rcard-foot">
        <span class="ad-rcard-time">${t ? escapeHtml(fmtTime(t)) : '時間未知'}</span>
        <button class="ad-rcard-more" type="button" data-rcard-more="${r.id}"
                aria-expanded="false">展開更多</button>
      </div>
      <div class="ad-rcard-rest" hidden>
        ${rest || '<div class="ad-rcard-row"><span>其他</span><b>沒有其他內容</b></div>'}
        <div class="ad-rcard-acts">
          ${col.tags ? `<button class="ad-edit" type="button" data-tag-edit="${r.id}">設定標籤</button>` : ''}
          <button class="ad-del" type="button" data-del-rsvp="${r.id}">刪除這一筆</button>
        </div>
      </div>
    </li>`;
  }).join('')}</ul>`;
}

/* ============================================================
   刪除一筆回覆
   ------------------------------------------------------------
   回覆本來是「誰都改不動」的紀錄（規則仍然擋 update）。
   開放刪除只為了一件事：同一個人重複送出好幾份。
   所以要連過兩關 —— 先看清楚要刪的是哪一筆，再打字確認。

   刪之前先把排桌的自動編號釘住（見 SeatingPlan.freezeCodes）：
   編號是照回覆順序算出來的，少一筆就會讓後面每個人往前挪一號，
   而新人可能已經把 B06 寫在紙本名單上了。
============================================================ */
async function deleteRsvp(id){
  const r = DataStore.getRSVPs().find(x => x.id === id);
  if(!r) return;

  const t = rsvpTime(r);
  const st = DataStore.rsvpStatus(r);
  const who = r.name || '（沒有名字）';

  const first = await confirmModal({
    title: `刪除「${who}」這一筆回覆`,
    message: `${RSVP_LABEL[st]}・${st === 'yes' ? `${Number(r.guestCount) || 1} 位・` : ''}`
           + `${t ? fmtTime(t) : '時間未知'} 送出。`
           + '刪掉之後這筆回覆就找不回來了（統計、匯出、排桌名單都會少一筆）。',
    danger: true,
    confirmText: '繼續',
  });
  if(!first) return;

  const second = await confirmModal({
    title: '再確認一次',
    message: `真的要刪掉「${who}」的這筆回覆嗎？請輸入「刪除」。`,
    danger: true,
    requirePhrase: '刪除',
    confirmText: '刪除',
  });
  if(!second) return;

  /* 排桌編號先定住，其他人的號碼才不會跟著往前挪 */
  if(window.SeatingPlan && SeatingPlan.freezeCodes){
    try{ await SeatingPlan.freezeCodes(); }
    catch(err){ console.warn('[回覆] 排桌編號沒能先定住', err); }
  }

  try{
    await DataStore.removeDoc('rsvps', id);
    /* 新人幫他掛的標籤另外存一份，一起收掉，不然會留下一筆孤兒 */
    if(guestTagsOn() && (DataStore.getRsvpTagMap()[id] || []).length){
      await DataStore.removeDoc('rsvpTags', id).catch(()=>{});
    }
    toast('已刪除這筆回覆');
  }catch(err){ writeFailed(err); }
}

rsvpListEl.addEventListener('click', (e)=>{
  const more = e.target.closest('[data-rcard-more]');
  if(more){
    const rest = more.closest('.ad-rcard').querySelector('.ad-rcard-rest');
    const open = rest.hidden;
    rest.hidden = !open;
    more.setAttribute('aria-expanded', String(open));
    more.textContent = open ? '收起來' : '展開更多';
    return;
  }
  const del = e.target.closest('[data-del-rsvp]');
  if(del){ deleteRsvp(del.dataset.delRsvp); return; }
  if(e.target.id === 'adRsvpTagSetupHead'){ location.hash = 'rsvp/tags'; }
});

document.addEventListener('data:rsvps', ()=>{ renderRsvps(); refreshTagCounts(); });
rsvpFilterEl.addEventListener('input', ()=>{ rsvpPager.page = 1; renderRsvps(); });
/* type="search" 的原生清除鈕按下去只會發 input，這裡一起接住 */
rsvpFilterEl.addEventListener('search', ()=>{ rsvpPager.page = 1; renderRsvps(); });

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
/* 空狀態變成下一步的入口：把邀請函連結複製起來去發給還沒回的人 */
rsvpChartsEl.addEventListener('click', async (e)=>{
  if(!e.target.closest('#adRsvpCopyInvite')) return;
  const url = new URL(sitePath('rsvp'), location.origin).href;
  try{
    await navigator.clipboard.writeText(url);
    toast('邀請函連結已複製');
  }catch{
    toast(url, { duration: 8000 });
  }
});

document.addEventListener('data:rsvps:denied', ()=>{
  document.getElementById('adRsvpSub').textContent = '目前讀不到回覆';
  document.getElementById('adRsvpTotal').textContent = '—';
  rsvpMetaEl.hidden = true;
  rsvpChartsEl.classList.remove('ad-donuts');
  rsvpChartsEl.innerHTML = '';
  loadedOnce.add('rsvps');
  rsvpListEl.innerHTML =
    `<div class="ad-empty">沒有讀取出席回覆的權限<br>請確認這個 Google 帳號在新人帳號名單內</div>`;
});

/* ---------- 匯出 CSV ----------
   欄位與 scripts/export-rsvps.js 對齊，兩邊拿到的檔案格式一致 */
document.getElementById('adRsvpExport').addEventListener('click', ()=>{
  const rows = visibleRsvps();
  if(!rows.length){ toast('目前沒有可以匯出的回覆', true); return; }

  downloadCsv(
    'rsvps',
    ['稱呼','是否出席','與新人關係','標籤','電話','LINE','Email','人數','葷食','素食','兒童座椅',
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
        guestTagsOn() ? rsvpTagIds(r).map(guestTagName).join('／') : '',
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

/* ---------- 表單資訊 ----------
   題目以外，邀請函那一頁還會出現的內容：婚禮資訊那幾列、兩人的故事、照片集。
   內容本身都不在這裡編輯（婚禮資訊在隔壁分頁、照片在素材資料夾），
   所以這裡只把「現在填了什麼」列出來，再給一個過去填寫的入口 ——
   新人才不用自己在兩個分頁之間猜哪一列會出現在邀請函上。 */
const RSVP_INFO_CLIP = 40;

function clip(s){
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return [...t].length > RSVP_INFO_CLIP ? `${[...t].slice(0, RSVP_INFO_CLIP).join('')}…` : t;
}

/* 婚禮日期是我們設定的，後台只能改幾點開始；這裡照婚禮當地時區顯示 */
function weddingDateText(){
  const d = siteData();
  const ev = toJsDate(d.eventDate);
  if(!ev) return '';
  const p = {};
  new Intl.DateTimeFormat('zh-TW', {
    timeZone: d.timezone || 'Asia/Taipei', hour12:false,
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', weekday:'short',
  }).formatToParts(ev).forEach(x => { p[x.type] = x.value; });
  const hour = p.hour === '24' ? '00' : p.hour;
  return `${p.year}.${p.month}.${p.day}（${(p.weekday || '').replace('週', '')}）${hour}:${p.minute}`;
}

function rsvpInfoRows(){
  const d = siteData();
  const tags = Array.isArray(d.hashtags) ? d.hashtags.filter(Boolean) : [];
  const cover = d.coverImageUrl
    || ((window.SITE && window.SITE.assets && window.SITE.assets.cover) || '');
  return [
    { name:'日期與開始時間', value: weddingDateText(),
      empty:'婚禮日期還沒設定，請先找我們排定' },
    { name:'地點名稱',   value: clip(d.venueName) },
    { name:'地址',       value: clip(d.venueAddress) },
    { name:'地圖連結',   value: clip(d.venueMapUrl),
      empty:'留白就用地址自動開 Google 地圖' },
    { name:'服裝',       value: clip(d.dressCode) },
    { name:'關於禮金',   value: clip(d.giftNote) },
    { name:'婚禮 hashtag', value: clip(tags.join('　')),
      empty:'留白就用預設的 #我們結婚了 #Married' },
    { name:'封面照',     value: cover ? '已經放好了' : '',
      empty:'還沒有封面照，需要的話把照片給我們' },
  ];
}

function infoRowHtml(row){
  const empty = !row.value;
  const text = empty ? (row.empty || '還沒填，這一列就不會出現') : row.value;
  return `<div class="ad-info-row">
    <span class="ad-info-name">${escapeHtml(row.name)}</span>
    <span class="ad-info-val${empty ? ' is-empty' : ''}">${escapeHtml(text)}</span>
  </div>`;
}

function renderRsvpFormInfo(){
  const list = document.getElementById('adRsvpInfoList');
  if(!list) return;
  list.innerHTML = rsvpInfoRows().map(infoRowHtml).join('');

  const d = siteData();
  const story = String(d.story || '').trim();
  document.getElementById('adRsvpStoryInfo').innerHTML = infoRowHtml({
    name:'目前的內容', value: clip(story),
    empty:'還沒填，就算打開也不會出現這一塊',
  });

  const photos = (Array.isArray(d.photos) ? d.photos : []).filter(Boolean);
  document.getElementById('adRsvpGalleryInfo').innerHTML = infoRowHtml({
    name:'目前的照片', value: photos.length ? `${photos.length} 張` : '',
    empty:'還沒有照片，就算打開也不會出現這一塊',
  });
}

/* 內容要去「婚禮資訊」那一頁填：切過去之後把該填的欄位捲到畫面中間並游標對好，
   不然新人到了那一頁還要自己找是哪一欄。 */
function jumpToLobbyInfo(fieldId){
  const focus = ()=>{
    const el = document.getElementById(fieldId);
    if(!el) return;
    el.scrollIntoView({ block:'center', behavior:'smooth' });
    el.focus({ preventScroll:true });
  };
  if(location.hash === '#lobby/info'){ focus(); return; }
  /* activateTab 會在 hashchange 時把畫面捲回最上面，所以排在它之後才捲 */
  window.addEventListener('hashchange', ()=> setTimeout(focus, 0), { once:true });
  location.hash = 'lobby/info';
}

document.getElementById('adRsvpInfoJump')
  .addEventListener('click', ()=> jumpToLobbyInfo('adVenueName'));
document.getElementById('adRsvpStoryJump')
  .addEventListener('click', ()=> jumpToLobbyInfo('adStory'));

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

  await runSave(document.getElementById('adRsvpFormSave'), async ()=>{
    await DataStore.saveSiteFields(patch);
    toast('表單設定已更新');
    /* 圖表跟著題目開關增減，存完就重畫 */
    renderRsvps();
  });
});

/* ============================================================
   0c. 賓客標籤
   ------------------------------------------------------------
   標籤庫存在站台文件的 guestTags（新人自己維護），
   掛在誰身上存在 rsvpTags/{回覆 id}（新人自己整理的分類）。
   賓客在表單上選的那一個存在回覆裡，改不動 —— 兩邊在畫面上合起來看。

   整個功能由 guestTagsEnabled 決定要不要出現，新人改不動：
   這是要配合排桌次一起用的進階功能，由我們決定哪一組新人要用
   （Firebase Console，或 `npm run set-pages -- --guest-tags on`）。
============================================================ */
const tagSecEl   = document.getElementById('adTagSec');
const tagSubtabEl= document.getElementById('adTagSubtab');
const tagListEl  = document.getElementById('adTagList');
const tagChipsEl = document.getElementById('adRsvpTagChips');

/* 標籤存的是 id 不是名字，改名才不會讓已經掛好的分類對不到 */
function newTagId(){
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/* 寫回站台文件。規則只擋筆數與型別，每一筆的內容在這裡先切好 */
async function saveGuestTags(list){
  const clean = list
    .map(t => ({
      id:     String(t.id || '').slice(0, 40),
      name:   String(t.name || '').trim().slice(0, GUEST_TAG_NAME_MAX),
      onForm: t.onForm === true,
    }))
    .filter(t => t.id && t.name)
    .slice(0, GUEST_TAG_MAX);
  await DataStore.saveSiteFields({ guestTags: clean });
  return clean;
}

/* 每個標籤現在掛在幾位賓客身上（含賓客自己選的那一個） */
function tagUseCount(){
  const count = {};
  DataStore.getRSVPs().forEach(r => {
    rsvpTagIds(r).forEach(id => { count[id] = (count[id] || 0) + 1; });
  });
  return count;
}

function renderTags(){
  const on = guestTagsOn();
  tagSecEl.hidden = !on;
  /* 標籤是自己一個橫向子分頁，沒開這個功能就連分頁鈕一起收起來；
     已經停在那一頁的話（重新整理、舊網址）退回第一個看得到的子分頁 */
  tagSubtabEl.hidden = !on;
  if(!on && tagSubtabEl.classList.contains('is-on')) activateSubtab('rsvp', '');
  /* 題目清單裡那一列跟著標籤設定走：沒有任何標籤當選項時，賓客也看不到那一題 */
  document.getElementById('adAskTagRow').hidden = !on || !guestTagList().some(t => t.onForm);
  if(!on) return;

  const list = guestTagList();
  if(!list.length){
    tagListEl.innerHTML =
      `<div class="ad-empty">還沒有標籤<br>按「加入常用標籤」可以一次帶入 VIP、長輩、小孩、大學同學…</div>`;
    return;
  }

  const count = tagUseCount();
  tagListEl.innerHTML = list.map(t => `
    <div class="ad-tagrow" data-id="${escapeHtml(t.id)}">
      <input class="ad-input ad-tagrow-name" type="text" maxlength="${GUEST_TAG_NAME_MAX}"
             value="${escapeHtml(t.name)}" aria-label="標籤名稱">
      <label class="ad-check ad-tagrow-check">
        <input type="checkbox" class="ad-tagrow-onform"${t.onForm ? ' checked' : ''}>
        <span>當表單選項</span>
      </label>
      <span class="ad-tagrow-count">${count[t.id] || 0} 位</span>
      <button class="ad-del" type="button" data-del-tag="${escapeHtml(t.id)}">刪除</button>
    </div>`).join('');
}

/* 回覆進來時只換數字，不重畫整排 —— 正在改名字的欄位不會被抽掉 */
function refreshTagCounts(){
  if(tagSecEl.hidden) return;
  const count = tagUseCount();
  tagListEl.querySelectorAll('.ad-tagrow').forEach(row => {
    const el = row.querySelector('.ad-tagrow-count');
    if(el) el.textContent = `${count[row.dataset.id] || 0} 位`;
  });
}

/* 標籤一動，名單的標籤、篩選鈕、題目清單那一列都要跟著換 */
function renderTagsAndList(){
  renderTags();
  renderRsvpTagChips();
  renderRsvps();
}

/* 改名或改「當表單選項」：離開欄位就存 */
tagListEl.addEventListener('change', async (e)=>{
  const row = e.target.closest('.ad-tagrow');
  if(!row) return;
  const name = row.querySelector('.ad-tagrow-name').value.trim();
  if(!name){
    toast('標籤名稱不能空白', true);
    renderTags();
    return;
  }
  const onForm = row.querySelector('.ad-tagrow-onform').checked;
  try{
    await saveGuestTags(guestTagList().map(t =>
      (t.id === row.dataset.id ? { ...t, name, onForm } : t)));
    toast('標籤已更新');
    renderTagsAndList();
  }catch(err){ writeFailed(err); }
});

tagListEl.addEventListener('click', async (e)=>{
  const id = e.target.dataset.delTag;
  if(!id) return;
  const tag = guestTagList().find(t => t.id === id);
  const used = tagUseCount()[id] || 0;

  const ok = await confirmModal({
    title: `刪除「${tag ? tag.name : '這個標籤'}」`,
    message: used
      ? `目前有 ${used} 位賓客掛著這個標籤，刪掉之後他們身上的這個標籤也會一起消失。`
      : '刪掉之後就找不回來了。',
    danger: true,
    confirmText: '刪除',
  });
  if(!ok) return;

  try{
    await saveGuestTags(guestTagList().filter(t => t.id !== id));
    /* 掛在賓客身上的那一份也要拔掉，不然篩選會留下一堆查不到名字的空標籤 */
    const map = DataStore.getRsvpTagMap();
    await Promise.all(Object.entries(map)
      .filter(([, ids]) => ids.includes(id))
      .map(([rsvpId, ids]) => DataStore.saveRsvpTags(rsvpId, ids.filter(x => x !== id))));
    toast('標籤已刪除');
    renderTagsAndList();
  }catch(err){ writeFailed(err); }
});

document.getElementById('adTagAddBtn').addEventListener('click', async ()=>{
  const list = guestTagList();
  if(list.length >= GUEST_TAG_MAX){ toast(`標籤最多 ${GUEST_TAG_MAX} 個`, true); return; }

  const name = await promptModal({
    title: '新增標籤',
    message: '例如：大學同學、公司同事、教會朋友、伴郎伴娘',
    placeholder: '標籤名稱',
    maxLength: GUEST_TAG_NAME_MAX,
    confirmText: '新增',
  });
  if(!name) return;
  if(list.some(t => t.name === name)){ toast('已經有同名的標籤了', true); return; }

  try{
    await saveGuestTags([...list, { id:newTagId(), name, onForm:false }]);
    toast('標籤已新增');
    renderTagsAndList();
  }catch(err){ writeFailed(err); }
});

document.getElementById('adTagPresetBtn').addEventListener('click', async ()=>{
  const list = guestTagList();
  const add = DEFAULT_GUEST_TAGS
    .filter(p => !list.some(t => t.name === p.name))
    .map(p => ({ id:newTagId(), name:p.name, onForm:p.onForm }))
    .slice(0, Math.max(GUEST_TAG_MAX - list.length, 0));

  if(!add.length){ toast('常用標籤都已經在清單裡了'); return; }
  try{
    await saveGuestTags([...list, ...add]);
    toast(`加入了 ${add.length} 個常用標籤`);
    renderTagsAndList();
  }catch(err){ writeFailed(err); }
});

/* ---------- 名單上的標籤篩選 ----------
   最後一顆不是篩選條件，是一個出口：「設定標籤 ↗」直接跳到標籤那一頁。
   一個標籤都還沒建的時候整排也要留著 —— 不然新人根本找不到入口。 */
const tagFilterRowEl = document.getElementById('adRsvpTagRow');

function renderRsvpTagChips(){
  const list = guestTagList();
  const on = guestTagsOn();
  tagFilterRowEl.hidden = !on;
  if(!on){
    rsvpTagFilter = 'all';
    tagChipsEl.innerHTML = '';
    return;
  }
  /* 選著的標籤被刪掉時退回「全部標籤」，不然會篩出一個空名單 */
  if(rsvpTagFilter !== 'all' && rsvpTagFilter !== 'none'
     && !list.some(t => t.id === rsvpTagFilter)) rsvpTagFilter = 'all';

  const chips = list.length
    ? [{ id:'all', name:'全部標籤' }, ...list, { id:'none', name:'沒有標籤' }]
    : [];

  tagChipsEl.innerHTML = chips
    .map(c => `<button class="ad-chip${c.id === rsvpTagFilter ? ' is-on' : ''}" type="button"
             data-tag="${escapeHtml(c.id)}">${escapeHtml(c.name)}</button>`).join('')
    + `<button class="ad-chip ad-chip-link" type="button" data-tag-setup="1"
               title="到「設定賓客標籤」新增或修改標籤">設定標籤 ↗</button>`;
}

tagChipsEl.addEventListener('click', (e)=>{
  const chip = e.target.closest('.ad-chip');
  if(!chip) return;
  if(chip.dataset.tagSetup){ location.hash = 'rsvp/tags'; return; }
  rsvpTagFilter = chip.dataset.tag;
  rsvpPager.page = 1;
  renderRsvpTagChips();
  renderRsvps();
});

/* ---------- 幫某一位賓客掛標籤 ---------- */
const tagPickMask   = document.getElementById('adTagPickMask');
const tagPickListEl = document.getElementById('adTagPickList');
const tagPickWhoEl  = document.getElementById('adTagPickWho');
const tagPickSaveBtn= document.getElementById('adTagPickSave');
let tagPickId = '';
const closeTagPick = registerFormModal(tagPickMask);

function openTagPick(rsvpId){
  const r = DataStore.getRSVPs().find(x => x.id === rsvpId);
  if(!r) return;
  const list = guestTagList();
  if(!list.length){ toast('還沒有標籤，先到「表單設定」建立幾個', true); return; }

  tagPickId = rsvpId;
  /* 賓客自己選的那一個是他送出的紀錄，後台改不動，所以畫成關不掉的勾勾 */
  const own = String(r.tag || '');
  const mine = DataStore.getRsvpTagMap()[rsvpId] || [];
  tagPickWhoEl.textContent = `${r.name || '（沒有名字）'}・可以複選`;
  tagPickListEl.innerHTML = list.map(t => {
    const isOwn = t.id === own;
    const checked = isOwn || mine.includes(t.id);
    return `<label class="ad-check${isOwn ? ' is-fixed' : ''}">
      <input type="checkbox" value="${escapeHtml(t.id)}"${checked ? ' checked' : ''}${isOwn ? ' disabled' : ''}>
      <span>${escapeHtml(t.name)}${isOwn ? '<small>賓客自己選的</small>' : ''}</span>
    </label>`;
  }).join('');
  tagPickMask.hidden = false;
}

rsvpListEl.addEventListener('click', (e)=>{
  const id = e.target.dataset.tagEdit;
  if(id) openTagPick(id);
});

document.getElementById('adTagPickCancel').addEventListener('click', ()=> closeTagPick());

tagPickSaveBtn.addEventListener('click', async ()=>{
  const ids = [...tagPickListEl.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)')]
    .map(el => el.value);
  tagPickSaveBtn.disabled = true;
  try{
    await DataStore.saveRsvpTags(tagPickId, ids);
    toast('標籤已更新');
    closeTagPick();
  }catch(err){ writeFailed(err); }
  tagPickSaveBtn.disabled = false;
});

document.addEventListener('data:rsvpTags', ()=>{
  renderRsvps();
  refreshTagCounts();
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
    `<div class="ad-empty">沒有讀取悄悄話的權限<br>請確認這個 Google 帳號在新人帳號名單內</div>`;
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
   2-0 開放桌次功能（放在「婚禮資訊」分頁最上面）
   ------------------------------------------------------------
   關著的時候賓客那邊完全看不到桌次：大廳沒有「尋找我的座位」、
   導覽列沒有「桌次」、直接打網址也會被導回大廳（見 site-context.js）。
   新人這邊不受影響，「桌次」分頁照樣可以先把名單與桌次圖準備好。
   沒設定過的舊站台一律視為開著，不會因為多了這個欄位就突然關掉。
============================================================ */
const seatFeatureEl = document.getElementById('adSeatFeature');

function seatFeatureOn(){ return siteData().seatingFeatureEnabled !== false; }

function syncSeatFeatureUI(){
  seatFeatureEl.checked = seatFeatureOn();
}

seatFeatureEl.addEventListener('change', async ()=>{
  const on = seatFeatureEl.checked;
  try{
    await DataStore.saveSiteFields({ seatingFeatureEnabled: on });
    syncSeatFeatureUI();
    toast(on ? '已開放桌次功能，賓客現在看得到「尋找我的座位」'
             : '已關閉桌次功能，賓客那邊不會出現桌次');
  }catch(err){
    /* 存不進去就把開關扳回原本的狀態，畫面不要和資料庫說不一樣的話 */
    syncSeatFeatureUI();
    writeFailed(err);
  }
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

/* ============================================================
   圖片上傳的共用零件
   ------------------------------------------------------------
   三件在手機上一定會踩到的事：
     1. iOS 從「檔案」App 選 HEIC 回來時 file.type 常常是空字串，
        `type.startsWith('image/')` 會把它靜默濾掉，只丟一句「請選圖片檔」
     2. 失敗只說「N 張失敗（可能是檔案太大或格式不支援）」——
        不說是哪一個檔案、也不說到底是哪一種原因
     3. 只有文字「處理中… 3 / 8」，沒有進度條；裁切完到下一張之間
        的 Firestore 寫入（弱網可能好幾秒）完全沒有指示
============================================================ */
const IMAGE_EXT_RE = /\.(heic|heif|jpe?g|png|webp|gif|bmp|avif)$/i;

function pickImageFiles(files){
  return Array.from(files).filter(f =>
    (f.type && f.type.startsWith('image/')) || IMAGE_EXT_RE.test(f.name || ''));
}

/* 失敗原因翻成人話。HEIC 是最常見的一種，所以直接告訴他怎麼改設定。 */
function uploadErrorText(file, err){
  const name = file && file.name ? file.name : '這個檔案';
  const heic = /\.(heic|heif)$/i.test(name);
  if(heic || (err && err.code === 'image-decode-failed')){
    return heic
      ? `${name}：這個格式瀏覽器讀不開。iPhone 可以到「設定 → 相機 → 格式」改成「最相容」後重拍，或先轉存成 JPG`
      : `${name}：這個檔案不是瀏覽器讀得懂的圖片`;
  }
  if(err && err.code === 'write-timeout') return `${name}：網路不穩，還沒送出去`;
  if(err && err.code === 'permission-denied') return `${name}：沒有寫入權限`;
  return `${name}：${(err && err.message) || '上傳失敗'}`;
}

/* 失敗清單 ＋「重新上傳這 N 張」。整批重來對 8 張照片來說太貴了 */
function reportUploadFails(fails, retry){
  if(!fails.length) return;
  const first = fails[0].text;
  showToast(
    fails.length === 1 ? first : `${first}（另外還有 ${fails.length - 1} 個檔案也失敗了）`,
    {
      isError: true,
      duration: 9000,
      actionLabel: retry ? `重新上傳這 ${fails.length} 張` : '',
      onAction: retry,
    },
  );
  fails.forEach(f => console.warn('[admin] 上傳失敗', f.text, f.err));
}

/* 進度：文字 ＋ 一條細長條。step 是「第幾個」，phase 是現在在做什麼 */
function setProgress(el, i, total, phase){
  if(!el) return;
  el.hidden = false;
  const txt = el.querySelector('.ad-progress-text');
  const bar = el.querySelector('.ad-progress-bar i');
  if(txt) txt.textContent = `${phase}　${i} / ${total}`;
  if(bar) bar.style.width = `${Math.round((i / Math.max(1, total)) * 100)}%`;
}

const fileInput  = document.getElementById('adFile');
const uploadBox  = document.getElementById('adUploadBox');
const progressEl = document.getElementById('adProgress');

async function uploadFiles(files){
  const list = pickImageFiles(files);
  if(!list.length){
    toast('這幾個檔案不是圖片（支援 JPG／PNG／WebP／HEIC）', true);
    return;
  }

  let done = 0;
  const fails = [];
  const base = DataStore.getSeatingImages().length;

  for(let i = 0; i < list.length; i++){
    const file = list[i];
    setProgress(progressEl, i + 1, list.length, '處理中…');
    try{
      const img = await shrinkImage(file);
      setProgress(progressEl, i + 1, list.length, '儲存中…');
      await DataStore.saveDoc('seatingImages', null, {
        img,
        title: file.name.replace(/\.[^.]+$/, '').slice(0, 60),
        order: base + done + 1,
        time: Date.now(),
      });
      done++;
    }catch(err){
      fails.push({ file, err, text: uploadErrorText(file, err) });
    }
  }

  progressEl.hidden = true;
  fileInput.value = '';
  if(done) toast(`已上傳 ${done} 張桌次圖`);
  reportUploadFails(fails, ()=> uploadFiles(fails.map(f => f.file)));
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
  imgsEl.innerHTML = list.map((it, i) => `
    <figure class="ad-img">
      <img src="${escapeHtml(it.img)}" alt="${escapeHtml(it.title || '')}">
      <figcaption>
        <span class="ad-order">#${i + 1}</span>
        <input class="ad-img-title" data-id="${it.id}" type="text" maxlength="60"
               value="${escapeHtml(it.title || '')}" placeholder="這張圖的標題">
        <button class="ad-del ad-del-inline" type="button" data-del-img="${it.id}">刪除</button>
        ${rowMenuBtn('seatImg', it.id)}
      </figcaption>
    </figure>`).join('');
}

/* 桌次圖原本只能刪不能排序（賓客看到的順序就是這裡的順序）。
   拖曳在觸控上用不了，所以直接給選單。 */
function seatImgList(){
  return DataStore.getSeatingImages().filter(it => !isPendingDelete('seatingImages', it.id));
}

async function saveOrder(col, list, idsInOrder, rerender){
  const byId = new Map(list.map(it => [it.id, it]));
  /* Firestore 不收 undefined，而 DataStore 讀回來的每一筆都多掛了一個 id
     （那是文件本身的 id，不是欄位），寫回去之前要拿掉 */
  const fieldsOf = (it, order)=>{
    const out = { ...it, order };
    delete out.id;
    return out;
  };
  try{
    /* 只寫真的變了的那幾份，不必整包重寫 */
    await Promise.all(idsInOrder.map((id, k) => {
      const it = byId.get(id);
      if(!it || it.order === k + 1) return null;
      return DataStore.saveDoc(col, id, fieldsOf(it, k + 1));
    }).filter(Boolean));
    toast('順序已更新', {
      /* 排錯了就按一下退回去 —— 順序是很容易一口氣改壞的東西 */
      actionLabel: '復原',
      duration: 5000,
      onAction: ()=> saveOrder(col, list, list.map(x => x.id), rerender),
    });
  }catch(err){
    writeFailed(err, ()=> saveOrder(col, list, idsInOrder, rerender));
    rerender();
  }
}

registerRowMenu('seatImg', (id)=>{
  const list = seatImgList();
  return [
    ...reorderMenuItems(list, id, (next)=> saveOrder('seatingImages', list, next, renderImages)),
    '-',
    { label:'刪除這張圖', danger:true, run: async ()=>{
      const ok = await confirmModal({ title:'刪除桌次圖', message:'確定要刪掉這張桌次圖嗎？' });
      if(!ok) return;
      scheduleUndoDelete('seatingImages', id, '桌次圖', renderImages);
    } },
  ];
});
document.addEventListener('data:seatingImages', ()=> guardedRender(imgsEl, renderImages));

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

/* ---------- 從排桌管理同步過來 ----------
   排桌管理排好的結果整份換掉這份名單。同樣的動作在「排桌管理」那一頁
   也有一顆（儲存後會問），這裡只是讓人在桌次名單這邊也按得到。 */
const seatSyncPlanBtn = document.getElementById('adSeatSyncPlan');
seatSyncPlanBtn.addEventListener('click', async ()=>{
  if(!window.SeatingPlan){ toast('尚無排桌資料', true); return; }
  seatSyncPlanBtn.disabled = true;
  try{ await SeatingPlan.syncNow(); }
  finally{ seatSyncPlanBtn.disabled = false; }
});
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

/* 通用信與指定信是兩種完全不同的信，混在一張清單裡分不出來，
   所以上面用 chip 分流。all / default（通用信）/ personal（指定信） */
let letterKind = 'all';
const letterChipsEl = document.getElementById('adLetterChips');

function isDefaultLetter(b){ return b.isDefault === true; }

function renderLetterChips(all){
  const n = {
    all: all.length,
    default: all.filter(isDefaultLetter).length,
    personal: all.filter(b => !isDefaultLetter(b)).length,
  };
  letterChipsEl.querySelectorAll('[data-letter-kind]').forEach(btn => {
    const k = btn.dataset.letterKind;
    btn.classList.toggle('is-on', k === letterKind);
    const label = k === 'all' ? '全部' : (k === 'default' ? '通用信' : '指定信');
    btn.textContent = `${label}（${n[k]}）`;
  });
}

function renderLetters(){
  if(!loadedOnce.has('blessings')){
    lf.list.innerHTML = skeletonHtml(3);
    return;
  }
  const all = DataStore.getBlessings().filter(b => !isPendingDelete('blessings', b.id));
  renderLetterChips(all);

  if(!all.length){
    lf.list.innerHTML = `
      <div class="ad-empty">
        還沒有寫任何一封感謝信
        <div class="ad-row" style="justify-content:center">
          <button class="btn small ghost" id="adLetterEmptyAddBtn" type="button">寫一封信</button>
        </div>
      </div>`;
    return;
  }

  const list = letterKind === 'all' ? all
    : all.filter(b => (letterKind === 'default') === isDefaultLetter(b));

  if(!list.length){
    lf.list.innerHTML = letterKind === 'default'
      ? `<div class="ad-empty">
           還沒有通用信<br>沒對到任何詞彙的賓客現在會撲空，寫一封通用信接住他們
           <div class="ad-row" style="justify-content:center">
             <button class="btn small ghost" id="adLetterEmptyAddBtn" type="button">寫一封通用信</button>
           </div>
         </div>`
      : `<div class="ad-empty">
           還沒有指定信<br>指定信要填「專屬詞彙」，賓客輸入對到才領得到
           <div class="ad-row" style="justify-content:center">
             <button class="btn small ghost" id="adLetterEmptyAddBtn" type="button">寫一封指定信</button>
           </div>
         </div>`;
    return;
  }

  lf.list.innerHTML = list.map(b => `
    <div class="ad-item">
      <div class="ad-item-main">
        <span class="ad-item-title">${escapeHtml(b.title || '（沒有標題）')}</span>
        <span class="ad-tag">${isDefaultLetter(b) ? '通用信' : '指定信'}</span>
        <span class="ad-item-sub">
          ${(Array.isArray(b.terms) && b.terms.length)
            ? `詞彙：${escapeHtml(b.terms.join('、'))}`
            : (isDefaultLetter(b) ? '不用對詞彙，沒對到的賓客就領這一封' : '沒有專屬詞彙')}
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

letterChipsEl.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-letter-kind]');
  if(!btn) return;
  letterKind = btn.dataset.letterKind;
  renderLetters();
});

lf.list.addEventListener('click', async (e)=>{
  if(e.target.id === 'adLetterEmptyAddBtn'){
    /* 從「通用信／指定信」那一格按進來時，先幫他把勾勾設成對的那一種 */
    openLetterModal(null);
    if(letterKind !== 'all') lf.isDef.checked = (letterKind === 'default');
    return;
  }
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
    if(!pickImageFiles([file]).length){
      toast('這不是圖片檔（支援 JPG／PNG／WebP／HEIC）', true);
      return;
    }
    /* 這一顆是 <label>，裡面包著 <input type="file">，
       不能像一般按鈕那樣換 textContent（會把 input 一起砍掉），
       所以狀態走 toast 與欄位本身的 is-saving 樣式 */
    const field = fileEl.closest('.ad-img-field');
    if(field) field.classList.add('is-saving');
    const busy = showToast('圖片上傳中…', { duration: 60000 });
    await runSave(null, async ()=>{
      const img = await shrinkImage(file, TRANSPORT_IMG_MAX_BYTES, 1000);
      await DataStore.saveSiteFields({ [key]: img });
      render();
      toast('圖片已更新（這一欄不用按下面的儲存，選好就存起來了）');
    });
    busy.dismiss();
    if(field) field.classList.remove('is-saving');
  });

  clearEl.addEventListener('click', async (e)=>{
    await runSave(e.currentTarget, async ()=>{
      await DataStore.saveSiteFields({ [key]: '' });
      render();
      toast('已移除圖片');
    }, { savingText:'移除中…' });
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

  /* 出席回覆的「表單資訊」列的就是這些欄位，改完要跟著重畫 */
  renderRsvpFormInfo();
  siteFormBaseline = siteFormSnapshot();
  syncSiteDirtyUI();
}
document.getElementById('adSiteReset').addEventListener('click', ()=>{
  fillSiteForm();
  markSiteFormClean();
});

/* ---------- 有沒有還沒存的變更 ----------
   這一頁在手機上要捲 5–6 個螢幕高，中途沒有自動存檔，
   切到別的分頁、重新整理都會直接消失。所以：
     1. 底部的儲存列會說「有 N 處還沒儲存」
     2. 切分頁／關頁面前問一句
     3. 每 1.5 秒把草稿寫進 localStorage，回來時可以接續
   （交通圖片是例外：選了就立刻上傳存檔，欄位旁邊有寫。） */
const SITE_DRAFT_KEY = 'siteForm.draft';
const siteFields = ()=> [sf.title, sf.venue, sf.addr, sf.map, sf.eventTime,
  sf.transitPub, sf.transitPark, sf.dress, sf.gift, sf.story, sf.tags];

let siteFormBaseline = '';
let siteDraftTimer = 0;

function siteFormSnapshot(){
  return JSON.stringify(siteFields().map(el => (el ? el.value : '')));
}
function siteFormDirty(){ return siteFormSnapshot() !== siteFormBaseline; }

function markSiteFormClean(){
  siteFormBaseline = siteFormSnapshot();
  LS.remove(SITE_DRAFT_KEY);
  syncSiteDirtyUI();
}

function syncSiteDirtyUI(){
  const note = document.getElementById('adSiteDirty');
  const btn  = document.getElementById('adSiteSave');
  const d = siteFormDirty();
  if(note){
    note.textContent = d ? '有還沒儲存的變更' : '目前沒有未儲存的變更';
    note.classList.toggle('is-dirty', d);
  }
  if(btn) btn.classList.toggle('is-dirty', d);
}

sf.form.addEventListener('input', ()=>{
  syncSiteDirtyUI();
  clearTimeout(siteDraftTimer);
  siteDraftTimer = setTimeout(()=>{
    if(siteFormDirty()) LS.set(SITE_DRAFT_KEY, { at: Date.now(), values: siteFormSnapshot() });
  }, 1500);
});

/* 切到別的分頁時提醒一聲 —— activateTab 原本只是換個 class，
   走掉就是走掉，一句話都沒有 */
window.addEventListener('hashchange', ()=>{
  if(!siteFormDirty()) return;
  /* 還留在同一頁（例如只是切到「當日流程」再切回來）就不用囉嗦 */
  const h = parseHash();
  if(h.tab === 'lobby' && h.subtab === 'info') return;
  showToast('婚禮資訊還有沒儲存的變更，回到那一頁按「儲存婚禮資訊」才會存進去', {
    isError: true,
    duration: 6000,
    actionLabel: '回去存',
    onAction(){ location.hash = 'lobby/info'; },
  });
});
window.addEventListener('beforeunload', (e)=>{
  if(!siteFormDirty()) return;
  e.preventDefault();
  e.returnValue = '';
});
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'hidden' && siteFormDirty()){
    LS.set(SITE_DRAFT_KEY, { at: Date.now(), values: siteFormSnapshot() });
  }
});

/* 上次沒存完的內容：填完表單之後才問，不然會被 fillSiteForm 蓋掉 */
async function offerSiteDraft(){
  const d = LS.get(SITE_DRAFT_KEY, null);
  if(!d || !d.values || d.values === siteFormBaseline) return;
  const ok = await confirmModal({
    title: '有一份沒存完的婚禮資訊',
    message: `這台裝置在 ${fmtTime(d.at)} 改過婚禮資訊但沒有儲存。要接回那一份嗎？`,
    confirmText: '接回來',
    cancelText: '用目前存好的',
  });
  if(!ok){ LS.remove(SITE_DRAFT_KEY); return; }
  try{
    const vals = JSON.parse(d.values);
    siteFields().forEach((el, i) => { if(el) el.value = vals[i] ?? el.value; });
  }catch{ return; }
  syncSiteDirtyUI();
  toast('已接回上次沒存完的內容，記得按「儲存婚禮資訊」');
}

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

  const btn = document.getElementById('adSiteSave');
  await runSave(btn, async ()=>{
    await DataStore.saveSiteFields(patch);
    fillSiteForm();
    markSiteFormClean();
    toast('婚禮資訊已更新，重新整理大廳就看得到');
  });
});

/* ---------- 當日流程 ----------
   一列一個項目，順序就是大廳時間軸的顯示順序（不依時間重排）。 */
const schListEl = document.getElementById('adSchList');

function siteSchedule(){
  const s = siteData().schedule;
  return Array.isArray(s) ? s : [];
}

/* 「由上到下就是大廳時間軸的顯示順序」—— 但原本完全沒有排序工具，
   要調順序只能整列重打。這裡補上 ↑↓（32px 的方形按鈕，拇指按得到）。 */
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
      <div class="ad-sch-acts">
        <button class="ad-edit" type="button" data-sch-move="up"   aria-label="往上移">↑</button>
        <button class="ad-edit" type="button" data-sch-move="down" aria-label="往下移">↓</button>
        <button class="ad-del"  type="button" data-sch-del="1" aria-label="刪除這一列">刪除</button>
      </div>
    </div>`;
}

function renderSchedule(list){
  schListEl.innerHTML = (list && list.length)
    ? list.map(schRowHtml).join('')
    : schRowHtml(null);
  schBaseline = schSnapshot();
  syncSchDirty();
}

document.getElementById('adSchAdd').addEventListener('click', ()=>{
  schListEl.insertAdjacentHTML('beforeend', schRowHtml(null));
  syncSchDirty();
});

schListEl.addEventListener('click', (e)=>{
  const move = e.target.closest('[data-sch-move]');
  if(move){
    const row = move.closest('.ad-sch-row');
    if(move.dataset.schMove === 'up' && row.previousElementSibling){
      schListEl.insertBefore(row, row.previousElementSibling);
    }else if(move.dataset.schMove === 'down' && row.nextElementSibling){
      schListEl.insertBefore(row.nextElementSibling, row);
    }
    /* 順序是在畫面上改的，還沒寫進資料庫 —— 要按「儲存流程」 */
    syncSchDirty();
    return;
  }

  if(!e.target.closest('[data-sch-del]')) return;
  e.target.closest('.ad-sch-row').remove();
  if(!schListEl.children.length) renderSchedule([]);
  syncSchDirty();
});

/* 流程也是「按了儲存才算數」，所以要看得出來還沒存 */
function schSnapshot(){
  return JSON.stringify(Array.from(schListEl.querySelectorAll('.ad-sch-row')).map(row => [
    row.querySelector('.ad-sch-time').value,
    row.querySelector('.ad-sch-title').value,
    row.querySelector('.ad-sch-desc').value,
  ]));
}
let schBaseline = '';
function syncSchDirty(){
  document.getElementById('adSchSave').classList.toggle('is-dirty', schSnapshot() !== schBaseline);
}
schListEl.addEventListener('input', syncSchDirty);

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

  await runSave(document.getElementById('adSchSave'), async ()=>{
    await DataStore.saveSiteFields({ schedule: rows });
    renderSchedule(rows);
    toast(rows.length ? `已儲存 ${rows.length} 個流程項目` : '流程已清空');
  });
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
  const list = pickImageFiles(files);
  if(!list.length){
    toast('這幾個檔案不是圖片（支援 JPG／PNG／WebP／HEIC）', true);
    return;
  }

  let done = 0, skipped = 0;
  const fails = [];
  let order = DataStore.getCards().length;

  for(let i = 0; i < list.length; i++){
    const file = list[i];
    setProgress(cardProgEl, i + 1, list.length, '裁切中…');
    try{
      const img = await cropImage(file, {
        aspect:   CARD_ASPECT,
        outWidth: CARD_OUTWIDTH,
        maxBytes: CARD_MAX_BYTES,
        title:    `裁切婚禮小卡（${i + 1} / ${list.length}）`,
        hint:     '直式 2:3・拖曳移動、滑桿或滾輪縮放',
      });
      if(!img){ skipped++; continue; }     /* 新人自己按了取消 */

      /* 裁切確認到下一張之間就是這一段 Firestore 寫入，弱網可能好幾秒 */
      setProgress(cardProgEl, i + 1, list.length, '儲存中…');
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
      fails.push({ file, err, text: uploadErrorText(file, err) });
    }
  }

  cardProgEl.hidden = true;
  cardFileEl.value = '';
  if(done) toast(`已加入 ${done} 張婚禮小卡${skipped ? `（略過 ${skipped} 張）` : ''}`);
  else if(skipped && !fails.length) toast('沒有加入任何一張');
  reportUploadFails(fails, ()=> uploadCards(fails.map(f => f.file)));
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
          <button class="ad-del ad-del-inline" type="button" data-del-card="${c.id}">刪除</button>
          ${rowMenuBtn('card', c.id)}
        </div>
      </figcaption>
    </figure>`).join('');
}
document.addEventListener('data:cards', ()=> guardedRender(cardListEl, renderCards));

/* 小卡原本的 #order 是唯讀的，完全沒辦法重排。抽卡頁看的就是這個順序。 */
registerRowMenu('card', (id)=>{
  const list = DataStore.getCards().filter(c => !isPendingDelete('cards', c.id));
  return [
    ...reorderMenuItems(list, id, (next)=> saveOrder('cards', list, next, renderCards)),
    '-',
    { label:'重新裁切', run: ()=>{
      const btn = cardListEl.querySelector(`[data-recrop="${CSS.escape(id)}"]`);
      if(btn) btn.click();
    } },
    { label:'刪除這張小卡', danger:true, run: async ()=>{
      const ok = await confirmModal({ title:'刪除婚禮小卡', message:'確定要刪掉這張小卡嗎？' });
      if(!ok) return;
      scheduleUndoDelete('cards', id, '這張婚禮小卡', renderCards);
    } },
  ];
});

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
    let img;
    try{
      img = await cropImage(item.img, {
        aspect:   CARD_ASPECT,
        outWidth: CARD_OUTWIDTH,
        maxBytes: CARD_MAX_BYTES,
        title:    '重新裁切婚禮小卡',
      });
    }catch(err){
      toast(uploadErrorText({ name:item.name || '這張小卡' }, err), true);
      return;
    }
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
  if(!pickImageFiles([file]).length){
    toast('這不是圖片檔（支援 JPG／PNG／WebP／HEIC）', true);
    return;
  }
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
    toast(uploadErrorText(file, err), true);
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
        <button class="ad-drag-handle" type="button" aria-label="拖曳調整順序">⠿</button>
        <div class="ad-item-main">
          <span class="ad-item-title">${i + 1}. ${escapeHtml(it.q || '（沒有題目）')}</span>
          <span class="ad-tag">${it.type === 'multi' ? '複選' : '單選'}</span>
          <span class="ad-item-sub">${opts}</span>
        </div>
        <div class="ad-item-actions">
          <button class="ad-edit" type="button" data-edit-quiz="${it.id}">編輯</button>
          <button class="ad-del ad-del-inline" type="button" data-del-quiz="${it.id}">刪除</button>
          ${rowMenuBtn('quiz', it.id)}
        </div>
      </div>`;
  }).join('');
}

/* 拖曳只有桌機用得順；50 題的清單就算能拖，也不可能把第 40 題拖到第 1 位。
   所以每一列都補一份「上移／下移／移到最前／移到最後」，
   刪除也一併收進來（原本它和「編輯」只隔 10px，很容易點錯）。 */
registerRowMenu('quiz', (id)=>{
  const list = DataStore.getQuiz().filter(it => !isPendingDelete('quiz', it.id));
  return [
    ...reorderMenuItems(list, id, (next)=> saveQuizOrder(next)),
    '-',
    { label:'編輯這一題', run: ()=> openQuizModal(DataStore.getQuiz().find(x => x.id === id)) },
    { label:'刪除這一題', danger:true, run: async ()=>{
      const ok = await confirmModal({ title:'刪除題目', message:'確定要刪掉這一題嗎？' });
      if(!ok) return;
      if(qz.id.value === id){ closeQuizModal(); resetQuizForm(); }
      scheduleUndoDelete('quiz', id, '這一題', renderQuiz);
    } },
  ];
});

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
    toast('順序已更新', {
      /* 排錯了就按一下退回去 —— 拖曳很容易一口氣拖過頭 */
      actionLabel: '復原',
      duration: 5000,
      onAction: ()=> saveQuizOrder(list.filter(it => !isPendingDelete('quiz', it.id)).map(it => it.id)),
    });
  }catch(err){
    writeFailed(err, ()=> saveQuizOrder(idsInOrder));
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

  /* 邊緣自動捲動：不加這個的話，清單一長，拖到畫面邊緣就走不動了 */
  let edgeTimer = 0, edgeDir = 0, lastY = 0;
  function stopEdge(){ if(edgeTimer){ cancelAnimationFrame(edgeTimer); edgeTimer = 0; } edgeDir = 0; }
  function edgeStep(){
    edgeTimer = 0;
    if(!dragEl || !edgeDir) return;
    const before = window.scrollY;
    window.scrollBy(0, edgeDir * 12);
    /* 頁面捲動了多少，拖曳的起點就要補回多少，卡片才不會跟著飛走 */
    startY -= (window.scrollY - before);
    dragEl.style.transform = `translateY(${lastY - startY}px)`;
    edgeTimer = requestAnimationFrame(edgeStep);
  }

  qz.list.addEventListener('pointermove', (e)=>{
    if(!dragEl) return;
    lastY = e.clientY;
    const EDGE = 80;
    const dir = e.clientY < EDGE ? -1
      : (e.clientY > window.innerHeight - EDGE ? 1 : 0);
    if(dir !== edgeDir){
      stopEdge();
      edgeDir = dir;
      if(dir) edgeTimer = requestAnimationFrame(edgeStep);
    }
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
    stopEdge();
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
  /* 第一筆 snapshot 回來之前顯示「—」，不要顯示 0 ——
     「0 人作答」和「還在讀」長得一樣，新人會以為真的沒人玩 */
  if(!loadedOnce.has('quizVotes')){
    qz.voteCnt.textContent = '—';
    qz.voteAvg.textContent = '—';
    return;
  }

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

/* ============================================================
   收禮小幫手（後台這一側）
   ------------------------------------------------------------
   工具本身是另一個網址：/butler#{token}，交給婚宴當天幫忙收禮的
   親友用（見 public/js/butler.js）。後台只做兩件事：

     1. 產生／收回那些連結，並把賓客名單「匯」過去
     2. 把現場記下來的每一筆與統計接回來給新人看

   為什麼名單是匯過去而不是接過去
   ------------------------------------------------------------
   收禮台在婚宴當天要的是「現在這一版」名單。如果直接讀排桌草稿，
   新人在休息室調一下桌次，收禮台的畫面就會跟著跳 ——
   而且排桌草稿與出席回覆都是 ownerEmails 才讀得到的資料，
   拿著連結的親友本來就不該讀得到整份 RSVP。
   所以匯入是「複製一份必要欄位過去」，兩件事因此都成立。

   連結與通行碼存在 sites/{siteId}/butlerLinks（只有新人讀得到），
   收禮簿本身在最上層的 butlers/{bookId}——
   bookId 是 token 與通行碼推導出來的（見 js/butler-key.js）。
============================================================ */
const Butler = (() => {
  const el = {
    sum:      document.getElementById('adBtSum'),
    sumSub:   document.getElementById('adBtSumSub'),
    stats:    document.getElementById('adBtStats'),
    count:    document.getElementById('adBtCount'),
    filter:   document.getElementById('adBtFilter'),
    byWho:    document.getElementById('adBtByWho'),
    links:    document.getElementById('adBtLinks'),
    newLink:  document.getElementById('adBtNewLink'),
    exportBtn:document.getElementById('adBtExport'),
    noLink:   document.getElementById('adBtNoLink'),
    meta:     document.getElementById('adBtMeta'),
    tableWrap:document.getElementById('adBtTableWrap'),
  };

  /* 婚宴當天 300 筆全部一次畫出來，手機捲起來會卡；
     回覆名單／桌次名單／悄悄話都有分頁，這裡本來漏了 */
  const pager = pagerState('butler');
  /* 第一筆 snapshot 回來之前不要顯示「目前 0 筆」——
     那和「現場還沒有記下任何一筆」長得一模一樣 */
  let loaded = false;

  let started = false;
  let links = [];                 /* butlerLinks 的內容 */
  const books = new Map();        /* bookId → butlers/{bookId} 的內容 */
  const entriesOf = new Map();    /* bookId → 那一本的收禮紀錄 */
  const subscribed = new Set();   /* 已經訂閱過的 bookId */
  let filterText = '';

  const fb = () => window.fb;
  const siteId = () => window.SITE.siteId;

  function money(n){ return '$' + (Number(n) || 0).toLocaleString('en-US'); }

  /* 所有連結的紀錄合起來看：四五個人共用同一組連結時就是同一本，
     真的分了兩組（收禮台／送客桌）也要加在一起才是這場婚禮的總數 */
  function allEntries(){
    const out = [];
    links.forEach(l => (entriesOf.get(l.bookId) || []).forEach(e => out.push(e)));
    return out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  function totals(list){
    let amount = 0, boxes = 0, people = 0, gifted = 0;
    list.forEach(e => {
      amount += Number(e.amount) || 0;
      boxes  += Number(e.boxes)  || 0;
      people += Number(e.people) || 0;
      if(e.gift === true) gifted += 1;
    });
    return { amount, boxes, people, gifted, count: list.length };
  }

  /* ---------- 訂閱 ---------- */
  function init(){
    if(started) return;
    started = true;

    const { db, collection, query, orderBy, onSnapshot } = fb();
    onSnapshot(
      query(collection(db, 'sites', siteId(), 'butlerLinks'), orderBy('createdAt', 'asc')),
      snap => {
        links = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        /* 一組連結都沒有 → 不會有任何 entries snapshot 回來，
           這時候「目前 0 筆」是真的，不是還在讀 */
        if(!links.length) loaded = true;
        links.forEach(watchBook);
        renderAll();
      },
      err => {
        console.warn('[admin] 收禮連結讀取失敗', err.code || err);
        loaded = true;
        el.links.innerHTML = `<div class="ad-empty">讀不到收禮連結，請重新整理一次</div>`;
        renderAll();
      },
    );

    renderAll();   /* 先畫 skeleton，不要留一張空表 */
  }

  /* 一組連結配一本收禮簿，兩份都要盯著：
     簿子本身有名單與停用狀態，entries 才是現場記下來的每一筆 */
  function watchBook(link){
    if(!link.bookId || subscribed.has(link.bookId)) return;
    subscribed.add(link.bookId);
    const { db, doc, collection, query, orderBy, onSnapshot } = fb();

    onSnapshot(doc(db, 'butlers', link.bookId), s => {
      if(s.exists()) books.set(link.bookId, s.data());
      else books.delete(link.bookId);
      renderAll();
    }, err => console.warn('[admin] 收禮簿讀取失敗', err.code || err));

    onSnapshot(
      query(collection(db, 'butlers', link.bookId, 'entries'), orderBy('createdAt', 'desc')),
      s => {
        entriesOf.set(link.bookId, s.docs.map(d => ({ id: d.id, bookId: link.bookId, ...d.data() })));
        loaded = true;
        renderAll();
      },
      err => console.warn('[admin] 收禮紀錄讀取失敗', err.code || err),
    );
  }

  /* ---------- 統計 ---------- */
  function renderAll(){
    renderStats();
    renderRows();
    renderByWho();
    renderLinks();
  }

  function renderStats(){
    if(!loaded){
      el.sum.textContent = '—';
      el.sumSub.textContent = '讀取中…';
      el.meta.hidden = true;
      el.stats.innerHTML = skeletonHtml(1, ['40%', '60%']);
      return;
    }

    const list = allEntries();
    const t = totals(list);
    const rosterSize = links.reduce((n, l) => {
      const b = books.get(l.bookId);
      return n + ((b && Array.isArray(b.guests)) ? b.guests.length : 0);
    }, 0);
    const done = new Set(list.filter(e => e.guestId).map(e => e.guestId)).size;

    el.sum.textContent = money(t.amount);
    /* 台灣一場婚禮禮金破百萬很常見，字一多就會被 body{overflow-x:hidden} 切掉。
       超過 8 個字元就自動降一級（見 .ad-hero-num.is-long） */
    el.sum.classList.toggle('is-long', el.sum.textContent.length > 8);
    el.sumSub.textContent = t.count
      ? `共 ${t.count} 筆・平均 ${money(Math.round(t.amount / t.count))}`
      : '還沒有任何紀錄';

    /* 「數字是即時的」要有證據 —— 現場對帳時沒有這個時間就會懷疑是不是卡住了 */
    const last = list[0];
    if(last){
      el.meta.innerHTML = `統計區間：<b>全部紀錄</b>・最後更新 <b>${escapeHtml(fmtTime(last.createdAt))}</b>`
        + `<br>最近一筆：${escapeHtml(last.name || '（沒有名字）')}`
        + `${last.by ? `，由 ${escapeHtml(last.by)} 記錄` : ''}`;
      el.meta.hidden = false;
    }else{
      el.meta.hidden = true;
    }

    const tiles = [
      ['禮餅總盒數', t.boxes],
      ['發出禮餅', `${t.gifted} 筆`],
      ['到場人數', `${t.people} 位`],
      ['名單未收', `${Math.max(0, rosterSize - done)} 位`],
    ];
    el.stats.innerHTML = tiles.map(([lab, v]) =>
      `<div class="ad-stat"><div class="ad-stat-num">${escapeHtml(String(v))}</div>
       <div class="ad-stat-lab">${lab}</div></div>`).join('');

    el.noLink.hidden = links.length > 0;
  }

  function renderRows(){
    if(!loaded){
      el.count.textContent = '讀取中…';
      el.tableWrap.innerHTML = skeletonHtml(4);
      return;
    }

    const q = normKey(filterText);
    const all = allEntries().filter(e => !q
      || normKey(`${e.name}${e.code || ''}${e.table || ''}${e.note || ''}${e.by || ''}`).includes(q));

    el.count.textContent = `目前 ${all.length} 筆`;

    if(!all.length){
      el.tableWrap.innerHTML = `<div class="ad-empty">${
        allEntries().length ? '沒有符合的紀錄' : '現場還沒有記下任何一筆'
      }</div>`;
      renderPager(el.tableWrap, pager, 0, renderRows);
      return;
    }

    renderPager(el.tableWrap, pager, all.length, renderRows);
    const list = all.slice((pager.page - 1) * pager.size, pager.page * pager.size);

    /* 手機是一筆一張卡（10 欄的表格一樣要橫滑），桌機維持表格 */
    el.tableWrap.innerHTML = isNarrow() ? btCardsHtml(list) : btTableHtml(list);
    if(!isNarrow()) bindScrollHints(el.tableWrap);
  }

  function btTableHtml(list){
    return `<table class="ad-table">
      <thead>
        <tr>
          <th>編號</th><th class="is-name">姓名</th><th>桌次</th><th>禮金</th>
          <th>禮餅</th><th>盒數</th><th>人數</th><th>備註</th>
          <th>記錄者</th><th>時間</th>
        </tr>
      </thead>
      <tbody id="adBtRows">${list.map(e => `<tr>
        <td>${escapeHtml(e.code || '—')}</td>
        <td class="is-name">${escapeHtml(e.name || '')}</td>
        <td>${escapeHtml(e.table || '—')}</td>
        <td>${money(e.amount)}</td>
        <td>${e.gift ? '已發送' : '沒有發'}</td>
        <td>${Number(e.boxes) || 0}</td>
        <td>${Number(e.people) || 0}</td>
        <td class="ad-td-lines">${escapeHtml(e.note || '')}</td>
        <td>${escapeHtml(e.by || '—')}</td>
        <td class="ad-td-sub">${fmtTime(e.createdAt)}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  function btCardsHtml(list){
    return `<ul class="ad-btcards">${list.map(e => {
      const sub = [
        /* table 存的已經是桌位的完整標籤（例如「01｜主桌」），
           不要再包一層「第 … 桌」，會變成「第 01｜主桌 桌」 */
        e.table || '',
        e.gift ? `禮餅 ${Number(e.boxes) || 0} 盒` : '',
        e.by || '',
        fmtTime(e.createdAt),
      ].filter(Boolean).join('・');
      return `<li class="ad-btcard">
        <div class="ad-btcard-main">
          <div class="ad-btcard-name">${
            e.code ? `<i class="ad-btcard-code">${escapeHtml(e.code)}</i>` : ''
          }${escapeHtml(e.name || '（沒有名字）')}</div>
          <div class="ad-btcard-sub">${escapeHtml(sub)}</div>
          ${e.note ? `<div class="ad-btcard-sub">備註：${escapeHtml(e.note)}</div>` : ''}
        </div>
        <div class="ad-btcard-side">
          <div class="ad-btcard-amt">${money(e.amount)}</div>
          <div class="ad-btcard-people">${Number(e.people) || 0} 位</div>
        </div>
      </li>`;
    }).join('')}</ul>`;
  }

  function renderByWho(){
    const map = new Map();
    allEntries().forEach(e => {
      const who = e.by || '（沒署名）';
      const cur = map.get(who) || { count:0, amount:0, boxes:0 };
      cur.count += 1;
      cur.amount += Number(e.amount) || 0;
      cur.boxes += Number(e.boxes) || 0;
      map.set(who, cur);
    });

    if(!map.size){
      el.byWho.innerHTML = `<div class="ad-empty">還沒有人記過</div>`;
      return;
    }
    el.byWho.innerHTML = [...map.entries()]
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([who, v]) => `<div class="ad-item">
        <div class="ad-item-main">
          <span class="ad-item-title">${escapeHtml(who)}</span>
          <span class="ad-item-sub">${v.count} 筆・禮餅 ${v.boxes} 盒</span>
        </div>
        <div class="ad-item-actions"><b>${money(v.amount)}</b></div>
      </div>`).join('');
  }

  /* ---------- 連結 ---------- */
  function renderLinks(){
    if(!links.length){
      el.links.innerHTML = `<div class="ad-empty">
        還沒有收禮連結
        <div class="ad-row" style="justify-content:center">
          <button class="btn small ghost" id="adBtEmptyNew" type="button">產生第一組連結</button>
        </div>
      </div>`;
      return;
    }

    el.links.innerHTML = links.map(l => {
      const book = books.get(l.bookId);
      const roster = (book && Array.isArray(book.guests)) ? book.guests.length : 0;
      const got = (entriesOf.get(l.bookId) || []).length;
      const url = window.ButlerKey.urlFor(l.token);
      const dead = l.revoked === true || (book && book.revoked === true);
      const missing = !book;

      const state = missing
        ? '<span class="ad-tag ad-tag-no">收禮簿不見了</span>'
        : (dead ? '<span class="ad-tag ad-tag-no">已停用</span>'
                : '<span class="ad-tag ad-tag-yes">使用中</span>');

      const from = book && book.importedFrom === 'rsvp' ? '出席回覆'
        : (book && book.importedFrom === 'plan' ? '排桌名單' : '');

      return `<div class="ad-item ad-bt-link">
        <div class="ad-item-main">
          <span class="ad-item-title">${escapeHtml(l.label || '收禮台')}</span>
          ${state}
          <span class="ad-item-sub">
            名單 ${roster} 位${from ? `（來自${from}${
              book.importedAt ? '・' + fmtTime(book.importedAt) : ''}）` : '・還沒匯入'}
            ・已記 ${got} 筆
          </span>

          <div class="ad-bt-key">
            <label class="ad-label">連結</label>
            <div class="ad-row">
              <input class="ad-input" type="text" readonly value="${escapeHtml(url)}"
                     data-url="${escapeHtml(l.id)}">
              <button class="btn small ghost" data-copy-url="${escapeHtml(l.id)}" type="button">複製</button>
            </div>
            <label class="ad-label">通行碼</label>
            <div class="ad-row">
              <span class="ad-bt-pass">${escapeHtml(l.passcode || '')}</span>
              <button class="btn small ghost" data-copy-both="${escapeHtml(l.id)}" type="button">複製連結＋通行碼</button>
            </div>
          </div>
        </div>

        <div class="ad-item-actions ad-bt-acts">
          <button class="btn small" data-import-plan="${escapeHtml(l.id)}" type="button">匯入排桌名單</button>
          <button class="btn small ghost" data-import-rsvp="${escapeHtml(l.id)}" type="button">匯入出席回覆</button>
          <button class="btn small ghost" data-toggle="${escapeHtml(l.id)}" type="button">${dead ? '重新啟用' : '停用'}</button>
          <button class="ad-del" data-drop="${escapeHtml(l.id)}" type="button">刪除</button>
        </div>
      </div>`;
    }).join('');

    /* 沒開排桌管理就沒有「排桌名單」這回事，那顆按鈕不要出現 */
    if(!tabEnabled('seatingPlan')){
      el.links.querySelectorAll('[data-import-plan]').forEach(b => b.remove());
    }
  }

  /* ---------- 產生連結 ---------- */
  async function createLink(){
    if(!window.ButlerKey || !window.ButlerKey.available()){
      toast('這個瀏覽器不支援產生連結（需要 https）', true);
      return;
    }
    const label = await confirmModal({
      title: '產生收禮連結',
      message: '幫這組連結取個名字，之後在清單上分得出來。'
        + '通常一場婚禮只要一組，四五個人共用同一組，統計才會加在一起。',
      confirmText: '產生',
      input: { placeholder: '例：收禮台', maxLength: 40, value: '收禮台' },
    });
    if(!label) return;

    const btn = el.newLink;
    btn.disabled = true;
    try{
      const token = window.ButlerKey.newToken();
      const passcode = window.ButlerKey.newPasscode();
      const bookId = await window.ButlerKey.derive(token, passcode);
      const now = Date.now();
      const { db, doc, setDoc, collection, addDoc } = fb();
      const wed = window.WED || {};

      /* 先建收禮簿本身，再登記連結 —— 反過來的話，
         中間斷掉會留下一組指向空氣的連結 */
      await setDoc(doc(db, 'butlers', bookId), {
        siteId: siteId(),
        slug: window.SITE.slug || '',
        couple: (wed.couple || '').slice(0, 80),
        label: String(label).slice(0, 40),
        guests: [],
        revoked: false,
        createdAt: now,
        updatedAt: now,
      });
      await addDoc(collection(db, 'sites', siteId(), 'butlerLinks'), {
        bookId, token, passcode,
        label: String(label).slice(0, 40),
        revoked: false,
        createdAt: now,
      });
      toast('連結產生好了，記得順手匯入賓客名單');
    }catch(err){ writeFailed(err); }
    btn.disabled = false;
  }

  /* ---------- 匯入名單 ---------- */

  /* 排桌名單有編號與桌號，收禮台核對最快；沒開排桌管理的站台就用出席回覆。
     出席回覆沒有桌號，但如果桌次名單已經整理好了，順手比對一下補上去。 */
  function rosterFromRsvps(){
    const RELATION = { groom:'男方親友', bride:'女方親友', both:'雙方親友', other:'其他' };
    const seats = new Map();
    (DataStore.getSeating() || []).forEach(s => {
      const k = normKey(s.name);
      if(k && !seats.has(k)) seats.set(k, s.table || '');
    });

    return DataStore.getRSVPs()
      .filter(r => DataStore.rsvpStatus(r) !== 'no')   /* 說了不來的人不會出現在收禮台 */
      .map(r => ({
        id: r.id,
        code: '',
        name: r.name || '（沒有名字）',
        table: seats.get(normKey(r.name)) || '',
        count: Number(r.guestCount) || 1,
        cat: RELATION[r.relation] || '',
        note: r.note || r.dietaryNote || '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  }

  async function importRoster(link, source){
    let list = [];
    try{
      list = source === 'plan'
        ? await window.SeatingPlan.roster()
        : rosterFromRsvps();
    }catch(err){
      console.warn('[admin] 取名單失敗', err);
      toast('讀不到名單，請先到那一個分頁看一下', true);
      return;
    }

    list = list.filter(g => g.name && String(g.name).trim());
    if(!list.length){
      toast(source === 'plan' ? '排桌名單目前是空的' : '還沒有任何出席回覆', true);
      return;
    }

    /* 規則擋 600 筆（和排桌草稿同一個上限），超過的話講清楚而不是整筆被拒 */
    const over = list.length - 600;
    if(over > 0) list = list.slice(0, 600);

    const book = books.get(link.bookId);
    const had = (book && Array.isArray(book.guests)) ? book.guests.length : 0;
    const ok = await confirmModal({
      title: '匯入賓客名單',
      message: `把「${source === 'plan' ? '排桌名單' : '出席回覆'}」的 ${list.length} 位賓客`
        + `匯到「${link.label || '收禮台'}」。`
        + (had ? `原本那 ${had} 位會被整份換掉，` : '')
        + '已經記好的收禮紀錄不受影響。'
        + (over > 0 ? `（超過上限，只會匯前 600 位，還有 ${over} 位沒帶進去）` : ''),
      confirmText: '匯入',
    });
    if(!ok) return;

    try{
      const { db, doc, updateDoc } = fb();
      const now = Date.now();
      await updateDoc(doc(db, 'butlers', link.bookId), {
        guests: list.map(g => ({
          id: String(g.id || '').slice(0, 60),
          code: String(g.code || '').slice(0, 12),
          name: String(g.name || '').slice(0, 40),
          table: String(g.table || '').slice(0, 40),
          count: Math.max(0, Math.min(99, Number(g.count) || 0)),
          cat: String(g.cat || '').slice(0, 20),
          note: String(g.note || '').slice(0, 100),
        })),
        importedAt: now,
        importedFrom: source,
        updatedAt: now,
      });
      toast(`已匯入 ${list.length} 位賓客`);
    }catch(err){ writeFailed(err); }
  }

  /* ---------- 停用／刪除 ---------- */
  async function toggleLink(link){
    const book = books.get(link.bookId);
    const dead = link.revoked === true || (book && book.revoked === true);
    if(!dead){
      const ok = await confirmModal({
        title: '停用這組連結',
        message: '停用之後，拿著連結與通行碼的人會看到「已停用」，也記不進新的資料。'
          + '已經記好的紀錄與統計都留著，隨時可以重新啟用。',
        confirmText: '停用',
        danger: true,
      });
      if(!ok) return;
    }
    try{
      const { db, doc, updateDoc } = fb();
      /* 兩份都要改：規則看的是收禮簿上的 revoked，
         連結簿上的那一份只是後台自己列清單時看的 */
      await updateDoc(doc(db, 'butlers', link.bookId), { revoked: !dead, updatedAt: Date.now() });
      await updateDoc(doc(db, 'sites', siteId(), 'butlerLinks', link.id), { revoked: !dead });
      toast(dead ? '已重新啟用' : '已停用這組連結');
    }catch(err){ writeFailed(err); }
  }

  async function dropLink(link){
    const got = (entriesOf.get(link.bookId) || []).length;
    const ok = await confirmModal({
      title: '刪除這組連結',
      message: got
        ? `這組連結底下有 ${got} 筆收禮紀錄，刪掉就一起沒了，救不回來。`
          + '只是不想再讓人用的話，選「停用」就好。'
        : '這組連結會整個刪掉，之後打開會顯示找不到。',
      danger: true,
      requirePhrase: '刪除',
      confirmText: '刪除',
    });
    if(!ok) return;

    try{
      const { db, doc, collection, getDocs, deleteDoc } = fb();
      /* 先清紀錄再刪簿子：規則靠簿子上的 siteId 判斷身分，
         簿子先不見的話那些紀錄就變成誰也刪不掉的孤兒 */
      const snap = await getDocs(collection(db, 'butlers', link.bookId, 'entries'));
      for(const d of snap.docs){
        await deleteDoc(doc(db, 'butlers', link.bookId, 'entries', d.id));
      }
      await deleteDoc(doc(db, 'butlers', link.bookId));
      await deleteDoc(doc(db, 'sites', siteId(), 'butlerLinks', link.id));
      subscribed.delete(link.bookId);
      books.delete(link.bookId);
      entriesOf.delete(link.bookId);
      toast('已刪除這組連結');
    }catch(err){ writeFailed(err); }
  }

  /* ---------- 匯出 ---------- */
  function exportCsv(){
    const list = allEntries();
    if(!list.length){ toast('現場還沒有記下任何一筆', true); return; }
    const t = totals(list);
    const rows = list.slice().reverse().map(e => [
      e.code || '', e.name || '', e.table || '',
      Number(e.amount) || 0,
      e.gift ? '已發送' : '沒有發',
      Number(e.boxes) || 0,
      Number(e.people) || 0,
      e.note || '', e.by || '', fmtTime(e.createdAt),
    ]);
    rows.push(['', '總計', '', t.amount, '', t.boxes, t.people, `${t.count} 筆`, '', '']);
    downloadCsv('收禮紀錄',
      ['編號', '姓名', '桌次', '禮金', '禮餅', '盒數', '人數', '備註', '記錄者', '時間'],
      rows);
  }

  /* ---------- 事件 ---------- */
  function linkOf(id){ return links.find(l => l.id === id) || null; }

  async function copyText(text, msg){
    try{
      await navigator.clipboard.writeText(text);
      toast(msg);
    }catch{
      /* iOS 沒有使用者手勢或非安全環境時會失敗，退回「選起來讓他自己複製」 */
      toast('複製不了，請長按網址自己複製', true);
    }
  }

  el.newLink.addEventListener('click', createLink);
  el.exportBtn.addEventListener('click', exportCsv);
  el.filter.addEventListener('input', e => { filterText = e.target.value; pager.page = 1; renderRows(); });
  el.filter.addEventListener('search', e => { filterText = e.target.value; pager.page = 1; renderRows(); });
  /* 轉向或改變視窗大小時，表格與卡片要換過來 */
  onNarrowChange(()=>{ if(started) renderRows(); });

  el.links.addEventListener('click', (e)=>{
    if(e.target.id === 'adBtEmptyNew'){ createLink(); return; }

    const btn = e.target.closest('button');
    if(!btn) return;
    const d = btn.dataset;
    const link = linkOf(d.copyUrl || d.copyBoth || d.importPlan || d.importRsvp || d.toggle || d.drop);
    if(!link) return;

    const url = window.ButlerKey.urlFor(link.token);
    if(d.copyUrl)    copyText(url, '連結複製好了');
    if(d.copyBoth)   copyText(`收禮小幫手\n${url}\n通行碼：${link.passcode}`, '連結與通行碼複製好了');
    if(d.importPlan) importRoster(link, 'plan');
    if(d.importRsvp) importRoster(link, 'rsvp');
    if(d.toggle)     toggleLink(link);
    if(d.drop)       dropLink(link);
  });

  return { init };
})();
