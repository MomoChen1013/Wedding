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

/* 使用者在系統層關掉動畫時，JS 寫死的那幾段 transition 也要跟著關。
   CSS 的 @media (prefers-reduced-motion) 蓋不到 element.style。 */
const reduceMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
function reduceMotion(){ return reduceMotionMq.matches; }

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
    /* CSS 那條 prefers-reduced-motion 管不到這裡（transition 是 JS 寫死的），
       所以自己問一次 —— 不然「不要動畫」的使用者仍然會看到卡片滑回去 */
    c.style.transition = reduceMotion() ? 'none' : 'transform var(--dur-btn) var(--ease)';
    c.style.transform = '';
    if(far && m) m.dispatchEvent(new MouseEvent('click', { bubbles:true }));
  }
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
})();

/* ============================================================
   就地回饋：欄位旁的「✓ 已更新」
   ------------------------------------------------------------
   Feedback 分兩層，不要用同一個元件：

     就地回饋（這裡）  單一欄位存好了 —— 1.5 秒淡出，不佔畫面、
                       不需要被看見也沒關係（值已經在欄位上了）
     Toast（保留機制） 錯誤、重試、復原、離線 —— 這幾件事必須可見、
                       可點、夠久，writeFailed() 的「重試」與
                       scheduleUndoDelete() 的「復原」都靠它

   文案維持安靜：「已更新」。不要「🎉 成功！您的資料已成功更新！」——
   一次成功的存檔不值得一次慶祝。
============================================================ */
function flashSaved(el, text){
  if(!el) return;
  const host = el.parentElement;
  if(!host) return;
  if(getComputedStyle(host).position === 'static') host.style.position = 'relative';

  let tip = el._adSavedTip;
  if(!tip || !tip.isConnected){
    tip = document.createElement('span');
    tip.className = 'ad-saved';
    tip.setAttribute('role', 'status');
    host.appendChild(tip);
    el._adSavedTip = tip;
  }
  tip.textContent = text || '✓ 已更新';
  clearTimeout(tip._adTimer);
  tip.classList.remove('is-out');
  /* reflow 一下，連續存兩次時動畫才會重新播 */
  void tip.offsetWidth;
  tip.classList.add('is-on');
  tip._adTimer = setTimeout(()=>{
    tip.classList.remove('is-on');
    tip.classList.add('is-out');
  }, 1500);
}

/* ============================================================
   Detail drawer（共用元件）
   ------------------------------------------------------------
   規格不重新設計：min(92vw,400px)、暖白底、左側 1px border、
   CTA 貼底 —— 排桌的賓客抽屜（.sp-drawer）本來就是這一套，
   這裡只是把它抽出來讓出席回覆與收禮明細也用得到（CSS 兩邊共用選擇器）。

   為什麼一定要接進 pushLayer()／popLayer()
   ・Android 的實體返回鍵、iOS 的邊緣手勢：使用者的直覺是「關掉這一層」，
     不是「離開後台」。
   ・背景鎖捲：抽屜是可捲的，不鎖的話手指一滑就變成整頁在動。
   ・Esc 也走同一條路徑，桌機與手機的關法才是同一件事。

   遮罩只有 .2 —— 這個元件的前提是「背景頁面保持可見」，
   壓到 .42 就跟開一個 modal 沒兩樣了。
============================================================ */
const Drawer = (() => {
  let mask = null, box = null, titleEl, subEl, bodyEl, footEl;
  let onCloseCb = null;

  function build(){
    if(mask) return;
    mask = document.createElement('div');
    mask.className = 'ad-drawer-mask';
    mask.hidden = true;

    box = document.createElement('aside');
    box.className = 'ad-drawer';
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.innerHTML = `
      <div class="ad-drawer-head">
        <div>
          <div class="ad-drawer-title"></div>
          <div class="ad-drawer-sub"></div>
        </div>
        <button class="ad-drawer-close" type="button" aria-label="關閉">✕</button>
      </div>
      <div class="ad-drawer-body"></div>
      <div class="ad-drawer-foot" hidden></div>`;

    document.body.append(mask, box);
    titleEl = box.querySelector('.ad-drawer-title');
    subEl   = box.querySelector('.ad-drawer-sub');
    bodyEl  = box.querySelector('.ad-drawer-body');
    footEl  = box.querySelector('.ad-drawer-foot');

    mask.addEventListener('click', close);
    box.querySelector('.ad-drawer-close').addEventListener('click', close);
    document.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape' && !box.hidden) close();
    });
  }

  function open(opts){
    build();
    const { title, sub, body, foot, onClose } = opts || {};
    titleEl.textContent = title || '';
    subEl.innerHTML = sub || '';
    subEl.hidden = !sub;
    bodyEl.innerHTML = body || '';
    footEl.innerHTML = foot || '';
    footEl.hidden = !foot;
    box.setAttribute('aria-label', title || '詳細資料');
    onCloseCb = onClose || null;

    mask.hidden = false;
    box.hidden = false;
    bodyEl.scrollTop = 0;
    pushLayer(box, close);
    /* 焦點交給關閉鈕：鍵盤使用者一按 Enter 就回得去，
       也讓螢幕閱讀器把焦點帶進這一層 */
    box.querySelector('.ad-drawer-close').focus();
  }

  function close(){
    if(!box || box.hidden) return;
    box.hidden = true;
    mask.hidden = true;
    popLayer(box);
    const cb = onCloseCb;
    onCloseCb = null;
    if(cb) try{ cb(); }catch(err){ console.warn('[admin] 抽屜收尾失敗', err); }
  }

  /* 資料變動時就地更新內容，不要整個重開（重開會把捲動位置與焦點都丟掉） */
  function isOpen(){ return !!box && !box.hidden; }
  function setBody(html){ if(isOpen()) bodyEl.innerHTML = html; }
  function bodyEl_(){ return bodyEl; }

  return { open, close, isOpen, setBody, body: bodyEl_ };
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
rowMenuEl.setAttribute('role', 'menu');
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
         role="menuitem" data-i="${i}"${it.disabled ? ' disabled' : ''}>${escapeHtml(it.label)}</button>`).join('');
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
  const owner = rowMenuOwner;
  closeRowMenu();
  /* 用鍵盤選的話，焦點現在在一個已經被移除的節點上 —— 交還給原本那顆按鈕 */
  if(owner && document.activeElement === document.body) owner.focus();
  if(it && it.run) it.run();
});

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-rowmenu]');
  if(btn){
    e.preventDefault();
    if(rowMenuOwner === btn){ closeRowMenu(); return; }
    openRowMenu(btn);
    /* detail === 0 ＝ 這一下 click 是鍵盤（Enter／空白）合成出來的，
       不是滑鼠 —— 那就把焦點帶進選單，不然按了等於什麼都沒發生 */
    if(e.detail === 0) requestAnimationFrame(()=> focusRowMenuItem(0));
    return;
  }
  if(!e.target.closest('.ad-rowmenu')) closeRowMenu();
});
/* ---------- 「⋮」選單的鍵盤導覽 ----------
   選單打開之後焦點必須進得去，而且方向鍵要能走 ——
   不然用鍵盤的人只能打開它，卻選不到任何一項（等於這個入口是壞的）。
   焦點鎖在選單裡（Tab 也在裡面繞），Esc／關閉時交還給原本那顆按鈕。 */
function rowMenuItems(){
  return Array.from(rowMenuEl.querySelectorAll('.ad-rowmenu-item:not(:disabled)'));
}
function focusRowMenuItem(i){
  const items = rowMenuItems();
  if(!items.length) return;
  const n = items.length;
  items[((i % n) + n) % n].focus();
}

document.addEventListener('keydown', (e)=>{
  if(rowMenuEl.hidden){
    /* 按鈕上按 Enter／空白／↓ 都是「打開並走進第一項」 */
    /* Enter／空白鍵在 <button> 上原生就會發一次 click，那條路徑已經會開選單了；
       這裡再開一次的話，接著那一下 click 會把它當成「再按一次」直接關掉。
       所以只接 ↓（原生不發 click 的那一顆），其餘交給 click handler。 */
    const btn = e.target.closest && e.target.closest('[data-rowmenu]');
    if(btn && e.key === 'ArrowDown'){
      e.preventDefault();
      openRowMenu(btn);
      requestAnimationFrame(()=> focusRowMenuItem(0));
    }
    return;
  }

  const items = rowMenuItems();
  const at = items.indexOf(document.activeElement);

  if(e.key === 'Escape'){
    const owner = rowMenuOwner;
    closeRowMenu();
    if(owner) owner.focus();
    return;
  }
  if(e.key === 'ArrowDown'){ e.preventDefault(); focusRowMenuItem(at + 1); return; }
  if(e.key === 'ArrowUp'){   e.preventDefault(); focusRowMenuItem(at - 1); return; }
  if(e.key === 'Home'){      e.preventDefault(); focusRowMenuItem(0); return; }
  if(e.key === 'End'){       e.preventDefault(); focusRowMenuItem(items.length - 1); return; }
  if(e.key === 'Tab'){
    /* focus trap：選單是一個 menu，Tab 不該把人丟回背後那張表 */
    e.preventDefault();
    focusRowMenuItem(at + (e.shiftKey ? -1 : 1));
  }
});
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
   匯出前先問要匯出什麼
   ------------------------------------------------------------
   出席回覆那一份有 23 欄，但多數時候新人只要其中三四欄：
   給飯店的是姓名／人數／葷素，印喜帖的是姓名／地址。
   先問一句，比事後在 Excel 裡刪 19 欄快得多。

   ⚠️ 欄位一定要由呼叫端「當下」算出來傳進來 ——
   出席回覆的欄位是動態的（標籤／聯絡資訊／喜帖／喜餅／留言
   五欄由表單設定決定在不在），寫死一組 checkbox 會匯出
   根本不存在的欄位。

   記住上次的選擇（localStorage）：同一場婚禮會匯出很多次，
   每次都要重勾一遍等於這個功能只幫了第一次。
============================================================ */
const csvMaskEl  = document.getElementById('adCsvMask');
const csvColsEl  = document.getElementById('adCsvCols');
const csvCountEl = document.getElementById('adCsvCount');
const csvNoteEl  = document.getElementById('adCsvNote');
const csvGoBtn   = document.getElementById('adCsvGo');

function csvPrefKey(name){ return `ad:csvcols:${name}`; }

function pickCsvColumns({ name, note, columns }){
  return new Promise(resolve => {
    let saved = null;
    try{
      const raw = localStorage.getItem(csvPrefKey(name));
      if(raw) saved = new Set(JSON.parse(raw));
    }catch{}

    csvNoteEl.textContent = note || '選擇要匯出的內容：';
    csvColsEl.innerHTML = columns.map((c, i) => {
      /* 上次沒存過就全選；存過的話照上次，但新增的欄位預設也是勾的
         （新欄位是新功能，預設不給他反而像壞了） */
      const on = !saved || saved.has(c.key) || !columns.some(x => saved.has(x.key));
      return `<label class="ad-check">
        <input type="checkbox" value="${escapeHtml(c.key)}"${on ? ' checked' : ''}
               data-i="${i}">
        <span>${escapeHtml(c.label)}</span>
      </label>`;
    }).join('');

    function syncCount(){
      const n = csvColsEl.querySelectorAll('input:checked').length;
      csvCountEl.textContent = `已選 ${n} / ${columns.length} 欄`;
      csvGoBtn.disabled = n === 0;
    }
    syncCount();

    function setAll(on){
      csvColsEl.querySelectorAll('input').forEach(i => { i.checked = on; });
      syncCount();
    }

    function finish(keys){
      csvMaskEl.hidden = true;
      csvColsEl.removeEventListener('change', syncCount);
      allBtn.removeEventListener('click', onAll);
      noneBtn.removeEventListener('click', onNone);
      csvGoBtn.removeEventListener('click', onGo);
      cancelBtn.removeEventListener('click', onCancel);
      csvMaskEl.removeEventListener('click', onMask);
      resolve(keys);
    }

    const allBtn    = document.getElementById('adCsvAll');
    const noneBtn   = document.getElementById('adCsvNone');
    const cancelBtn = document.getElementById('adCsvCancel');

    const onAll   = ()=> setAll(true);
    const onNone  = ()=> setAll(false);
    const onCancel= ()=> finish(null);
    const onMask  = (e)=>{ if(e.target === csvMaskEl) finish(null); };
    const onGo = ()=>{
      const keys = [...csvColsEl.querySelectorAll('input:checked')].map(i => i.value);
      if(!keys.length) return;
      try{ localStorage.setItem(csvPrefKey(name), JSON.stringify(keys)); }catch{}
      finish(keys);
    };

    csvColsEl.addEventListener('change', syncCount);
    allBtn.addEventListener('click', onAll);
    noneBtn.addEventListener('click', onNone);
    csvGoBtn.addEventListener('click', onGo);
    cancelBtn.addEventListener('click', onCancel);
    csvMaskEl.addEventListener('click', onMask);

    csvMaskEl.hidden = false;
  });
}

/* 選好的 key 對回欄位定義，只留下被勾的那幾欄 */
function csvSubset(columns, keys, rows){
  const keep = columns.map((c, i) => [c, i]).filter(([c]) => keys.includes(c.key));
  return {
    header: keep.map(([c]) => c.label),
    rows: rows.map(r => keep.map(([, i]) => r[i])),
  };
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
  /* 一列三條（自訂規範 §3.20）：兩條看起來像「標題＋一行」，
     而真正載進來的每一列大多是三行，骨架和實體要長得像同一件事 */
  widths = widths || ['70%', '45%', '30%'];
  let out = '<div class="ad-skel">';
  for(let i = 0; i < rows; i++){
    out += '<div class="ad-skel-row">' +
      widths.map(w => `<div class="ad-skel-line" style="--w:${w}"></div>`).join('') +
      '</div>';
  }
  return out + '</div>';
}

/* 表格形狀的骨架
   ------------------------------------------------------------
   通用的兩行灰條在表格情境是錯的訊號：它長得像清單，
   但一秒後跳出來的是一張有 16 欄的表 —— 版面整個換掉。
   骨架要先把欄位的形狀站好，資料回來時只是「填進去」。

   cols 是欄寬（['22%','12%','18%']）；表頭有給就畫真的欄位名，
   那幾個字在載入時就已經是確定的資訊，沒有理由讓它也是灰條。 */
function skeletonTableHtml(rows, cols, heads){
  const body = [];
  for(let i = 0; i < rows; i++){
    body.push(`<tr>${cols.map(w =>
      `<td><div class="ad-skel-line" style="--w:${w}"></div></td>`).join('')}</tr>`);
  }
  const head = heads && heads.length
    ? `<thead><tr>${heads.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`
    : `<thead><tr>${cols.map(() =>
        '<th><div class="ad-skel-line" style="--w:60%"></div></th>').join('')}</tr></thead>`;
  return `<div class="ad-tablewrap is-skel" aria-hidden="true"><table class="ad-table ad-skel-table">
    ${head}<tbody>${body.join('')}</tbody>
  </table></div>`;
}

/* ============================================================
   空狀態
   ------------------------------------------------------------
   「目前沒有資料」只講了一件已經看得出來的事。一個好的空狀態要回答
   三個問題：這裡本來會有什麼、為什麼現在沒有、我接下來該做什麼。

   結構刻意做成 { title, body, action } 三格，強迫每個呼叫點都想過
   那三件事；只傳字串時退回原本的一行灰字（舊呼叫點不會壞）。
   Headline 用明朝體 20–24px —— 空畫面是少數可以給版面感的地方。
   不放 SaaS 插畫：這個品牌的空白就是它的樣子。
============================================================ */
function emptyState(opts){
  if(typeof opts === 'string') return `<div class="ad-empty">${opts}</div>`;
  const { title, body, action } = opts || {};
  const act = action
    ? `<div class="ad-empty-act"><button class="btn small ghost" type="button"${
        action.hash ? ` data-empty-hash="${escapeHtml(action.hash)}"` : ''}${
        action.id ? ` id="${escapeHtml(action.id)}"` : ''}>${escapeHtml(action.label)}</button></div>`
    : '';
  return `<div class="ad-empty is-rich">
    ${title ? `<div class="ad-empty-title">${escapeHtml(title)}</div>` : ''}
    ${body ? `<p class="ad-empty-body">${escapeHtml(body)}</p>` : ''}
    ${act}
  </div>`;
}

/* 空狀態上的 CTA 幾乎都是「去另一個分頁」，統一在這裡接住，
   每個呼叫點就不用各自綁一次 click */
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-empty-hash]');
  if(btn) location.hash = btn.dataset.emptyHash;
});

/* 頁面標題底下那一行說明（「共 12 筆回覆」）。
   節點不在就靜靜跳過 —— 不是每一頁都有 */
function setPageSub(id, html){
  const el = document.getElementById(id);
  if(el) el.innerHTML = html || '';
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
  /* 某些站台沒開排桌管理／收禮小幫手，那一組可能只剩兩顆、甚至一顆都不剩 ——
     一個什麼都沒有的「婚禮管理」標題比沒有標題還糟。整組空了就連 label 一起收。 */
  document.querySelectorAll('#adSide .ad-navgroup').forEach(g => {
    const tabs = Array.from(g.querySelectorAll('.ad-tab'));
    g.hidden = tabs.length > 0 && tabs.every(b => b.hidden);
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
  const couple = (window.WED && window.WED.couple) || '';
  const email  = user ? (user.email || '') : '';

  /* 原本是一個字串塞兩件事。拆成兩個節點之後：
     新人姓名留在頂列（那是身分），email 降到帳號選單裡（那是「用哪個帳號登入」）。 */
  document.getElementById('adWho').textContent = couple;
  document.getElementById('adAcctPopName').textContent = couple || '新人帳號';
  document.getElementById('adAcctPopEmail').textContent = email;
  document.getElementById('adSideWho').textContent = [couple, email].filter(Boolean).join('\n');
  /* 頭像是 email 的第一個字元 —— 不放照片、不放 emoji，維持全站的克制 */
  document.getElementById('adAcctIc').textContent = (email[0] || '·').toUpperCase();
  document.getElementById('adAcctNm').textContent = email ? email.split('@')[0] : '帳號';
  document.getElementById('adAcctBtn').setAttribute('aria-label', `帳號：${email || '未登入'}`);

  /* 「查看網站」現在有三份：頂列、帳號選單裡、抽屜底部。都指到同一個網址 */
  ['adViewBtn', 'adViewBtnMobile', 'adViewBtnDrawer'].forEach(id => {
    const a = document.getElementById(id);
    if(a) a.href = sitePath('lobby');
  });
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
  restoreNavGroups();
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

/* ============================================================
   帳號 popover
   ------------------------------------------------------------
   「登出」是一年按一次的動作，卻一直是頂列上最顯眼的兩顆之一。
   收進這裡之後，頂列剩下的都是每天會用到的東西。
============================================================ */
(function bindAcctPop(){
  const btn = document.getElementById('adAcctBtn');
  const pop = document.getElementById('adAcctPop');
  if(!btn || !pop) return;

  function close(){
    if(pop.hidden) return;
    pop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }
  function open(){
    pop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    /* 打開就把焦點交出去：鍵盤使用者不用再 Tab 一次才進得來 */
    const first = pop.querySelector('.ad-acct-item');
    if(first) first.focus();
  }

  btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    pop.hidden ? open() : close();
  });
  document.addEventListener('click', (e)=>{
    if(!pop.hidden && !e.target.closest('#adAcct')) close();
  });
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape' && !pop.hidden){ close(); btn.focus(); }
  });
  /* 選單裡按下任何一項就收起來（登出會整頁換掉，查看網站會離開） */
  pop.addEventListener('click', (e)=>{ if(e.target.closest('.ad-acct-item')) close(); });
})();

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
  butler:  ['stats', 'entries', 'links'],
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

  /* 收合狀態永遠不能贏過「現在在哪一頁」。
     activateTab 的 fallback 會在指定分頁被關掉時退回第一個看得到的分頁 ——
     如果那一組剛好是收起來的，使用者就被丟進一個看不見的群組裡了。 */
  openGroupOf(target);

  let wantHash = `#${target.dataset.tab}`;
  if(SUBTABS[target.dataset.tab]){
    wantHash = `#${target.dataset.tab}/${activateSubtab(target.dataset.tab, subtab)}`;
  }

  closeDrawer();
  window.scrollTo({ top:0, behavior:'instant' });

  /* 換了分頁＝換了一組子分頁列與表格，sticky 的高度、捲動提示、
     標籤那一排「要不要長出展開鈕」都得等它真的顯示出來才量得到 */
  requestAnimationFrame(()=>{
    syncStickyMetrics();
    refreshScrollHints();
    if(!tagFilterRowEl.hidden) syncTagChipsClamp();
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

/* ============================================================
   側欄分組的收合
   ------------------------------------------------------------
   height:auto 不能 transition，所以 CSS 用 grid-template-rows 0fr → 1fr
   （見 .ad-navgroup-body）。這裡只負責掛 class 與記住狀態。

   記在 localStorage：新人一天會進來十幾次，「每次都要再收一遍」
   就等於這個功能不存在。
============================================================ */
const NAVGROUP_KEY = 'ad:navgroups';

function readClosedGroups(){
  try{
    const raw = localStorage.getItem(NAVGROUP_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  }catch{ return new Set(); }
}
function writeClosedGroups(set){
  try{ localStorage.setItem(NAVGROUP_KEY, JSON.stringify([...set])); }catch{}
}

function setGroupOpen(group, open){
  group.classList.toggle('is-closed', !open);
  const lab = group.querySelector('.ad-navgroup-lab');
  if(lab) lab.setAttribute('aria-expanded', String(open));
  const closed = readClosedGroups();
  const key = group.dataset.navgroup;
  open ? closed.delete(key) : closed.add(key);
  writeClosedGroups(closed);
}

/* 這一顆分頁所在的群組一定要是展開的（不寫回 localStorage：
   使用者刻意收起來的那一組，只是這一次被撐開，下次還是收著） */
function openGroupOf(tabBtn){
  const g = tabBtn && tabBtn.closest('.ad-navgroup');
  if(!g || !g.classList.contains('is-closed')) return;
  g.classList.remove('is-closed');
  const lab = g.querySelector('.ad-navgroup-lab');
  if(lab) lab.setAttribute('aria-expanded', 'true');
}

function restoreNavGroups(){
  const closed = readClosedGroups();
  document.querySelectorAll('#adSide .ad-navgroup').forEach(g => {
    const shut = closed.has(g.dataset.navgroup)
      && !g.querySelector('.ad-tab.is-on');   /* active 那一組永遠開著 */
    g.classList.toggle('is-closed', shut);
    const lab = g.querySelector('.ad-navgroup-lab');
    if(lab) lab.setAttribute('aria-expanded', String(!shut));
  });
}

document.getElementById('adSide').addEventListener('click', (e)=>{
  const lab = e.target.closest('.ad-navgroup-lab');
  if(!lab) return;
  const g = lab.closest('.ad-navgroup');
  setGroupOpen(g, g.classList.contains('is-closed'));
});

/* ============================================================
   側欄 tooltip
   ------------------------------------------------------------
   後台的分頁名稱都是兩到五個字（「桌次」「收禮小幫手」），
   第一次進來的人猜不出裡面裝了什麼。一句話講完就好，不要大型卡片。

   兩個定位前提：
     1. .ad-side 是 overflow-y:auto —— tooltip 放進側欄會被裁掉，
        所以 render 到 body 並 position:fixed（照 .sp-peek 那一套）。
     2. <900px 時側欄是觸控抽屜：整個關掉。
        「點一下跳出說明、再點一次才切分頁」是壞掉的互動。
============================================================ */
const NAV_TIPS = {
  rsvp:        '賓客填的出席回覆都在這裡：人數、葷素、聯絡方式、喜帖與喜餅的寄送，也能篩選、貼標籤、匯出 CSV。',
  seating:     '婚宴當天貼在門口的那張桌次表：整理賓客與桌號的對照名單，也可以直接上傳桌次圖。',
  seatingPlan: '把人拖到桌上的工作區：看得到每一桌坐了幾位、還剩幾個位子，排完再一次同步給桌次名單。',
  butler:      '婚宴當天收禮金、送禮餅用的工具。產生連結交給幫忙的親友，他們記的每一筆都會即時回到這裡。',
  lobby:       '賓客會在首頁看見的婚禮重要資訊，可以編輯時間、交通資訊、禮金、Dress Code 等，也能新增自訂連結或內容。',
  letters:     '寫給賓客的感謝信。可以寫好幾封，賓客抽到的是哪一封由這裡決定。',
  cards:       '賓客抽卡時會抽到的婚禮小卡：上傳圖片、設定卡名與稀有度。',
  exhibits:    '新人的故事牆：一張照片配一段文字，賓客可以慢慢看完你們的故事。',
  inbox:       '賓客留給新人的悄悄話。只有你們讀得到，別人在祝福牆上看不到內容。',
  quiz:        '賓客玩的「你有多認識新人」小測驗：出題、設定正確答案，也看得到大家答了什麼。',
};

(function bindNavTips(){
  /* 能力判斷，不是寬度判斷 —— iPad 橫向有 1194px 但它是觸控裝置 */
  const fineMq = window.matchMedia('(hover:hover) and (pointer:fine)');
  const side = document.getElementById('adSide');
  if(!side) return;

  const tip = document.createElement('div');
  tip.className = 'ad-nav-tip';
  tip.hidden = true;
  document.body.appendChild(tip);

  let openFor = null, timer = 0;

  function hide(){
    clearTimeout(timer);
    openFor = null;
    tip.classList.remove('is-on');
    /* 等淡出跑完再收起來，不然下一次會從「上一則的位置」閃現 */
    timer = setTimeout(()=>{ tip.hidden = true; }, 200);
  }

  function show(btn){
    const text = NAV_TIPS[btn.dataset.tab];
    if(!text || openFor === btn) return;
    clearTimeout(timer);
    openFor = btn;
    tip.innerHTML =
      `<div class="ad-nav-tip-title">${escapeHtml(btn.textContent.trim())}</div>` +
      `<div class="ad-nav-tip-body">${escapeHtml(text)}</div>`;
    tip.hidden = false;

    /* 貼著側欄右緣放；下面塞不下就往上收，永遠不要跑出畫面 */
    const r = btn.getBoundingClientRect();
    const h = tip.offsetHeight;
    const w = tip.offsetWidth;
    let top = r.top - 2;
    if(top + h > window.innerHeight - 10) top = Math.max(10, window.innerHeight - h - 10);
    let left = r.right + 12;
    if(left + w > window.innerWidth - 10) left = Math.max(10, r.left - w - 12);
    tip.style.top = `${Math.round(top)}px`;
    tip.style.left = `${Math.round(left)}px`;
    requestAnimationFrame(()=> tip.classList.add('is-on'));
  }

  side.addEventListener('pointerover', (e)=>{
    if(!fineMq.matches || e.pointerType === 'touch') return;
    const btn = e.target.closest('.ad-tab');
    if(!btn || btn.hidden){ if(!e.target.closest('.ad-nav-tip')) hide(); return; }
    show(btn);
  });
  side.addEventListener('pointerleave', hide);
  /* 鍵盤走過去也要看得到說明（focus-within 只給了框，沒給內容） */
  side.addEventListener('focusin', (e)=>{
    if(!fineMq.matches) return;
    const btn = e.target.closest('.ad-tab');
    if(btn && !btn.hidden) show(btn);
  });
  side.addEventListener('focusout', hide);
  side.addEventListener('click', hide);
  window.addEventListener('scroll', hide, true);
  fineMq.addEventListener('change', hide);
})();

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

/* 子分頁上直接寫著「回覆（12）」：這一頁最常被問的問題就是「現在幾筆了」，
   本來要先點進去、捲到清單上方才看得到。
   載入完成前不掛數字 —— 掛 0 的話和「真的還沒有人回覆」長得一樣。 */
function renderRepliesSubtabLabel(n){
  const btn = document.getElementById('adRepliesSubtab');
  if(!btn) return;
  const next = Number.isFinite(n) ? `回覆（${n}）` : '回覆';
  if(btn.textContent === next) return;
  btn.textContent = next;
  /* 文字變寬變窄會改變這一列捲不捲得動，邊緣的淡出提示要跟著重算 */
  refreshScrollHints(btn.closest('.ad-subtabs'));
}

function renderRsvps(){
  /* 載入中的畫面要和「真的沒人回覆」分得開。
     這個檢查一定要在最前面 —— 先把 0 寫上去再檢查的話，行動網路的那 1–3 秒裡
     新人看到的就是一個大大的「0」加「還沒有人回覆」，和真的沒人一模一樣。 */
  if(!loadedOnce.has('rsvps')){
    renderRepliesSubtabLabel(null);
    rsvpTotalEl.textContent = '—';
    rsvpSubEl.innerHTML = '<li class="ad-hero-item is-note">讀取中…</li>';
    rsvpMetaEl.hidden = true;
    renderRsvpCharts('loading');
    /* 桌機等一下會長出一張表，骨架就要先站成表的形狀；
       手機等一下是卡片，維持原本的兩行灰條 */
    rsvpListEl.innerHTML = isNarrow()
      ? skeletonHtml(4)
      : skeletonTableHtml(5, ['20%','14%','12%','8%','8%','18%','20%'],
          ['姓名','出席回應','分類','人數','葷','素','填表時間']);
    setPageSub('adRsvpPageSub', '讀取中…');
    rsvpFilterSumEl.hidden = true;
    return;
  }

  const total = DataStore.getRSVPCount();
  const head  = DataStore.getAttendingCount();
  const tally = DataStore.getRsvpTally();

  renderRepliesSubtabLabel(total);
  rsvpTotalEl.textContent = total;
  /* 四個數字各自佔一列（右邊）。擠成一段長句的話會換行三次，
     而且「12 位」和「5 筆」混在同一行讀不出來誰是誰 */
  rsvpSubEl.innerHTML = total
    ? [
        ['確定出席', `${head} 位`],
        ['熱情出席', `${tally.yes} 筆`],
        ['視情況而定', `${tally.maybe} 筆`],
        ['無法出席', `${tally.no} 筆`],
      ].map(([lab, val]) =>
        `<li class="ad-hero-item"><span>${lab}</span><b>${val}</b></li>`).join('')
    : '<li class="ad-hero-item is-note">還沒有人回覆</li>';

  setPageSub('adRsvpOverviewSub', total
    ? `<b>${head}</b> 位確定出席・共 <b>${total}</b> 筆回覆`
    : '還沒有人回覆');
  renderRsvpMeta(total);
  renderRsvpCharts(total ? '' : 'empty');

  const all = visibleRsvps();
  renderRsvpFilterSum(all.length, total);
  setPageSub('adRsvpPageSub', all.length === total
    ? `共 <b>${total}</b> 筆回覆`
    : `<b>${all.length}</b> 筆符合條件（全部 ${total} 筆）`);

  if(!all.length){
    rsvpListEl.innerHTML = total
      ? emptyState({
          title: '沒有符合的回覆',
          body: '把篩選條件放寬一點，或清掉搜尋關鍵字再看一次。',
        })
      : emptyState({
          title: '尚未收到賓客回覆',
          body: '賓客在邀請函上按下送出之後，回覆就會一筆一筆出現在這裡。'
              + '現在可以先去確認表單問了哪些問題。',
          action: { label:'去看表單設定', hash:'rsvp/form' },
        });
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

    return `<tr data-rsvp="${r.id}" tabindex="0" aria-label="${
      escapeHtml(`${r.name || '（沒有名字）'}的回覆，按 Enter 看完整內容`)}">
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
      <td class="is-act">${rowMenuBtn('rsvp', r.id)}</td>
    </tr>`;
  }).join('');

  return `<div class="ad-tablewrap"><table class="ad-table">
    <thead><tr>${head}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

/* ============================================================
   回覆的詳細抽屜
   ------------------------------------------------------------
   表格一列有 16 欄，橫著讀完一位賓客要滑三個螢幕。整列可 click、
   從右邊滑出來，背景名單保持可見 —— 不跳頁，關掉就回到原本的位置。

   只做桌機：<900px 走的是卡片上的「展開更多」（.ad-rcard-more），
   那已經是就地展開了，再疊一層抽屜只會多一個關法。
============================================================ */
function rsvpDrawerRow(label, value, mono){
  if(value === '' || value == null) return '';
  return `<div class="ad-drawer-row"><span>${escapeHtml(label)}</span>` +
    `<b${mono ? ' style="font-variant-numeric:tabular-nums"' : ''}>${value}</b></div>`;
}

function rsvpDrawerHtml(r){
  const col = rsvpColumns();
  const st = DataStore.rsvpStatus(r);
  const going = st === 'yes';
  const t = rsvpTime(r);

  const contacts = [
    r.contactPhone && `電話　${r.contactPhone}`,
    r.contactLine && `LINE　${r.contactLine}`,
    r.contactEmail && `Email　${r.contactEmail}`,
  ].filter(Boolean).join('\n');

  const card = [
    r.cardType ? rsvpLabel('card', r.cardType)
      + (r.cardType === 'paper' && r.cardDelivery ? `（${rsvpLabel('cardDelivery', r.cardDelivery)}）` : '') : '',
    r.cardEmail || '',
    r.cardAddress ? `${r.cardZip || ''} ${r.cardAddress}`.trim() : '',
  ].filter(Boolean).join('\n');

  const gift = [
    r.giftDelivery ? rsvpLabel('gift', r.giftDelivery) : '',
    r.giftAddress ? `${r.giftZip || ''} ${r.giftAddress}`.trim() : '',
  ].filter(Boolean).join('\n');

  const tags = col.tags ? rsvpTagIds(r) : [];

  return `
    <div class="ad-drawer-rows">
      ${rsvpDrawerRow('出席回應', `<span class="ad-tag ad-tag-${st}">${RSVP_LABEL[st]}</span>`)}
      ${rsvpDrawerRow('分類', escapeHtml(rsvpLabel('relation', r.relation)))}
      ${going ? rsvpDrawerRow('人數', `${Number(r.guestCount) || 1} 位`, true) : ''}
      ${going ? rsvpDrawerRow('葷／素',
          `葷 ${Number(r.mealMeat) || 0}　素 ${Number(r.mealVeg) || 0}`, true) : ''}
      ${going && Number(r.childSeat) > 0
          ? rsvpDrawerRow('兒童椅', `${Number(r.childSeat)} 張`, true) : ''}
      ${rsvpDrawerRow('飲食習慣', escapeHtml(r.dietaryNote || ''))}
      ${col.contact ? rsvpDrawerRow('聯絡資訊', escapeHtml(contacts)) : ''}
      ${col.card ? rsvpDrawerRow('喜帖', escapeHtml(card)) : ''}
      ${col.gift ? rsvpDrawerRow('喜餅', escapeHtml(gift)) : ''}
      ${col.message ? rsvpDrawerRow('給新人的話', escapeHtml(r.message || '')) : ''}
      ${rsvpDrawerRow('其他備註', escapeHtml(r.note || ''))}
      ${rsvpDrawerRow('填表時間', t ? escapeHtml(fmtTime(t)) : '時間未知')}
    </div>
    ${col.tags ? `<div class="ad-drawer-sec">
      <div class="ad-drawer-sec-title">標籤</div>
      <div class="ad-drawer-tags">${
        tags.length
          ? tags.map(id => `<span class="ad-tag ad-tag-guest">${escapeHtml(guestTagName(id))}</span>`).join('')
          : '<span class="ad-td-empty">還沒有貼標籤</span>'
      }</div>
      <div class="ad-row"><button class="btn small ghost" type="button"
        data-tag-edit="${escapeHtml(r.id)}">設定標籤</button></div>
    </div>` : ''}`;
}

let drawerRsvpId = '';

function markPeekingRow(id){
  document.querySelectorAll('#adRsvpList tr.is-peeking, #adBtTableWrap tr.is-peeking')
    .forEach(tr => tr.classList.remove('is-peeking'));
  if(!id) return;
  const tr = document.querySelector(`#adRsvpList tr[data-rsvp="${CSS.escape(id)}"]`);
  if(tr) tr.classList.add('is-peeking');
}

function openRsvpDrawer(id){
  const r = DataStore.getRSVPs().find(x => x.id === id);
  if(!r) return;
  drawerRsvpId = id;
  markPeekingRow(id);
  Drawer.open({
    title: `${r.icon || ''} ${r.name || '（沒有名字）'}`.trim(),
    sub: escapeHtml(RSVP_LABEL[DataStore.rsvpStatus(r)]),
    body: rsvpDrawerHtml(r),
    onClose(){ drawerRsvpId = ''; markPeekingRow(''); },
  });
}

/* 快照回來時抽屜要跟著更新（例如剛在抽屜裡改完標籤），
   但只換內容、不重開 —— 重開會把捲動位置與焦點都丟掉 */
function refreshRsvpDrawer(){
  if(!drawerRsvpId || !Drawer.isOpen()) return;
  const r = DataStore.getRSVPs().find(x => x.id === drawerRsvpId);
  if(!r){ Drawer.close(); return; }
  Drawer.setBody(rsvpDrawerHtml(r));
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

    /* 三行：
         第一行  姓名 …………………… 填表時間 ＋ 出席狀態
         第二行  N 位・葷 X／素 Y
         第三行  標籤 ……………………………… ＋ 展開更多
       「展開更多」本來自己佔一整行（第二行的右邊），底下標籤又佔一行 ——
       兩行都只用掉左半邊或右半邊，卡片白白長高一截。合成同一行之後，
       沒有標籤的人那一行也還在（只剩右邊那顆按鈕），
       每張卡片的高度才一致，掃過去不會忽高忽低。 */
    return `<li class="ad-rcard" data-rsvp="${r.id}">
      <div class="ad-rcard-head">
        <span class="ad-rcard-name">${escapeHtml(`${r.icon || ''} ${r.name || '（沒有名字）'}`.trim())}</span>
        <span class="ad-rcard-time">${t ? escapeHtml(fmtTime(t)) : '時間未知'}</span>
        <span class="ad-tag ad-tag-${st}">${RSVP_LABEL[st]}</span>
      </div>
      <div class="ad-rcard-line">
        ${keyBits
          ? `<span class="ad-rcard-key">${escapeHtml(keyBits)}</span>`
          : `<span class="ad-rcard-key is-off">${escapeHtml(rsvpLabel('relation', r.relation) || '—')}</span>`}
      </div>
      <div class="ad-rcard-tags">
        ${tags.map(id =>
          `<span class="ad-tag ad-tag-guest">${escapeHtml(guestTagName(id))}</span>`).join('')}
        <button class="ad-rcard-more" type="button" data-rcard-more="${r.id}"
                aria-expanded="false"><i aria-hidden="true">＋</i>展開更多</button>
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

/* 常駐的「刪除」改成 ⋯ row menu：
   預設狀態乾淨，滑到那一列（或鍵盤 Tab 進去）才長出操作。
   婚禮小卡、故事牆、桌次名單早就是這一套，這裡只是換掉入口 —— 
   registerRowMenu／rowMenuBtn 都是現成的。 */
registerRowMenu('rsvp', (id)=>{
  const r = DataStore.getRSVPs().find(x => x.id === id);
  if(!r) return [];
  const items = [];
  if(!isNarrow()) items.push({ label:'看完整內容', run: ()=> openRsvpDrawer(id) });
  if(guestTagsOn()) items.push({ label:'設定標籤', run: ()=> openTagPick(id) });
  if(items.length) items.push('-');
  items.push({ label:'刪除這筆回覆', danger:true, run: ()=> deleteRsvp(id) });
  return items;
});

/* ============================================================
   整列可 click
   ------------------------------------------------------------
   四個必要條件，少一個就會變成「明明想做別的事，卻跳出抽屜」：

   1. 列裡本來就有互動元素（標籤欄的按鈕、動作欄的「⋯」）——
      那幾顆自己 stopPropagation，不能被整列的 handler 接走。
   2. 使用者會選取儲存格文字 —— 備註、地址、給新人的話都是長文字，
      拖曳選字之後放開會是一次 click。selection 還在就不要開。
   3. 這是「看」的動作，不是「改」的動作，所以中鍵、Ctrl/Cmd 點擊
      （使用者想開新分頁的手勢）一律不接。
   4. 手機不是表格 —— isNarrow() 時走的是卡片上的「展開更多」。
============================================================ */
function rowClickShouldOpen(e){
  if(e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if(isNarrow()) return false;
  /* 列裡的按鈕、連結、輸入框各自有自己的事要做 */
  if(e.target.closest('button, a, input, select, textarea, label')) return false;
  const sel = window.getSelection && window.getSelection();
  if(sel && !sel.isCollapsed) return false;
  return true;
}

rsvpListEl.addEventListener('click', (e)=>{
  const more = e.target.closest('[data-rcard-more]');
  if(more){
    const rest = more.closest('.ad-rcard').querySelector('.ad-rcard-rest');
    const open = rest.hidden;
    rest.hidden = !open;
    more.setAttribute('aria-expanded', String(open));
    more.innerHTML = open
      ? '<i aria-hidden="true">－</i>收起來'
      : '<i aria-hidden="true">＋</i>展開更多';
    return;
  }
  const del = e.target.closest('[data-del-rsvp]');
  if(del){ deleteRsvp(del.dataset.delRsvp); return; }
  if(e.target.id === 'adRsvpTagSetupHead'){ location.hash = 'rsvp/tags'; return; }

  const tr = e.target.closest('tr[data-rsvp]');
  if(tr && rowClickShouldOpen(e)) openRsvpDrawer(tr.dataset.rsvp);
});

/* 鍵盤：走到那一列按 Enter／空白鍵，和用滑鼠點它是同一件事 */
rsvpListEl.addEventListener('keydown', (e)=>{
  if(e.key !== 'Enter' && e.key !== ' ') return;
  const tr = e.target.closest && e.target.closest('tr[data-rsvp]');
  if(!tr || e.target !== tr) return;
  e.preventDefault();
  openRsvpDrawer(tr.dataset.rsvp);
});

document.addEventListener('data:rsvps', ()=>{
  renderRsvps();
  refreshTagCounts();
  refreshRsvpDrawer();
});
/* ---------- 搜尋框：全站同一組事件 ----------
   後台所有搜尋框都是 type="search"（見 admin.html／butler.html），
   而 type="search" 右邊那顆原生清除鈕（✕）在 Safari 只發 `search`、
   不發 `input`。少接一個，就會出現「按了 ✕、字消失了、清單卻沒變回全部」
   ——使用者會以為資料不見了。
   所以規則是：**每一個 .ad-filter 都要同時接 input 與 search**。 */
rsvpFilterEl.addEventListener('input', ()=>{ rsvpPager.page = 1; renderRsvps(); });
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
  rsvpSubEl.innerHTML = '<li class="ad-hero-item is-note">目前讀不到回覆</li>';
  document.getElementById('adRsvpTotal').textContent = '—';
  rsvpMetaEl.hidden = true;
  rsvpChartsEl.classList.remove('ad-donuts');
  rsvpChartsEl.innerHTML = '';
  loadedOnce.add('rsvps');
  rsvpListEl.innerHTML =
    emptyState({
      title: '讀不到出席回覆',
      body: '這個 Google 帳號不在新人帳號名單裡，所以規則擋下了讀取。'
          + '換一個帳號登入，或告訴我們要加哪一個。',
    });
});

/* ---------- 匯出 CSV ----------
   欄位與 scripts/export-rsvps.js 對齊，兩邊拿到的檔案格式一致 */
/* ⚠️ 欄位是動態的：rsvpColumns() 依表單設定決定標籤／聯絡資訊／
   喜帖／喜餅／留言這五欄在不在。選擇器一定要從它生成，
   寫死一組 checkbox 會讓人勾到根本沒有的欄位。 */
function rsvpCsvColumns(){
  const col = rsvpColumns();
  return [
    { key:'name',     label:'稱呼',        val:(r)=> r.name || '' },
    { key:'status',   label:'是否出席',    val:(r)=> RSVP_LABEL[DataStore.rsvpStatus(r)] },
    { key:'relation', label:'與新人關係',  val:(r)=> rsvpLabel('relation', r.relation) },
    col.tags && { key:'tags', label:'標籤',
      val:(r)=> rsvpTagIds(r).map(guestTagName).join('／') },
    col.contact && { key:'phone', label:'電話', val:(r)=> r.contactPhone || '' },
    col.contact && { key:'line',  label:'LINE',  val:(r)=> r.contactLine || '' },
    col.contact && { key:'email', label:'Email', val:(r)=> r.contactEmail || '' },
    { key:'guestCount', label:'人數', val:(r, going)=> going ? (Number(r.guestCount) || 1) : '' },
    { key:'mealMeat',   label:'葷食', val:(r, going)=> going ? (Number(r.mealMeat) || 0) : '' },
    { key:'mealVeg',    label:'素食', val:(r, going)=> going ? (Number(r.mealVeg)  || 0) : '' },
    { key:'childSeat',  label:'兒童座椅', val:(r, going)=> going ? (Number(r.childSeat) || 0) : '' },
    { key:'dietaryNote', label:'飲食習慣', val:(r)=> r.dietaryNote || '' },
    col.card && { key:'card',        label:'喜帖', val:(r)=> rsvpLabel('card', r.cardType) },
    col.card && { key:'cardDelivery', label:'喜帖領取',
      val:(r)=> r.cardType === 'paper' ? rsvpLabel('cardDelivery', r.cardDelivery) : '' },
    col.card && { key:'cardZip',     label:'喜帖郵遞區號', val:(r)=> r.cardZip || '' },
    col.card && { key:'cardAddress', label:'喜帖地址',     val:(r)=> r.cardAddress || '' },
    col.card && { key:'cardEmail',   label:'喜帖 Email',   val:(r)=> r.cardEmail || '' },
    col.gift && { key:'gift',        label:'喜餅', val:(r)=> rsvpLabel('gift', r.giftDelivery) },
    col.gift && { key:'giftZip',     label:'喜餅郵遞區號', val:(r)=> r.giftZip || '' },
    col.gift && { key:'giftAddress', label:'喜餅地址',     val:(r)=> r.giftAddress || '' },
    col.message && { key:'message', label:'給新人的話', val:(r)=> r.message || '' },
    { key:'note', label:'其他備註', val:(r)=> r.note || '' },
    { key:'time', label:'回覆時間', val:(r)=> { const t = rsvpTime(r); return t ? fmtTime(t) : ''; } },
  ].filter(Boolean);
}

document.getElementById('adRsvpExport').addEventListener('click', async ()=>{
  const rows = visibleRsvps();
  if(!rows.length){ toast('目前沒有可以匯出的回覆', true); return; }

  const columns = rsvpCsvColumns();
  const keys = await pickCsvColumns({
    name: 'rsvp',
    note: `要匯出目前篩選出來的 ${rows.length} 筆回覆。選擇要帶哪幾欄：`,
    columns,
  });
  if(!keys) return;

  const keep = columns.filter(c => keys.includes(c.key));
  /* 欄位與 scripts/export-rsvps.js 對齊，兩邊拿到的檔案格式一致 */
  downloadCsv(
    'rsvps',
    keep.map(c => c.label),
    rows.map(r => {
      const going = DataStore.rsvpStatus(r) === 'yes';
      return keep.map(c => c.val(r, going));
    }),
  );
  toast(`已匯出 ${rows.length} 筆回覆・${keep.length} 欄`);
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
      emptyState({
        title: '還沒有任何標籤',
        body: '標籤是給賓客分類用的（VIP、長輩、小孩、大學同學…），'
            + '貼上之後名單可以照標籤篩選，排桌也會照著分組。',
        action: { label:'加入常用標籤', id:'adTagPresetEmptyBtn' },
      });
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

/* 空狀態上的「加入常用標籤」指的是右上角那一顆，走同一條路徑 */
document.addEventListener('click', (e)=>{
  if(e.target.id === 'adTagPresetEmptyBtn'){
    const btn = document.getElementById('adTagPresetBtn');
    if(btn) btn.click();
  }
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
    + `<button class="ad-chip ad-chip-link" type="button" data-tag-setup="1">設定標籤 ↗</button>`;
  syncTagChipsClamp();
}

/* ---------- 標籤只先露兩排 ----------
   標籤數量沒有上限（新人可以一直加），全部攤開的話光是篩選列就佔掉半個螢幕。
   量一下實際高度：真的超過兩排才長出「展開全部標籤」。 */
const tagMoreBtn = document.getElementById('adRsvpTagMore');
let tagChipsOpen = false;

function syncTagChipsClamp(){
  tagChipsEl.classList.toggle('is-open', tagChipsOpen);
  /* 先讓它回到收起來的高度才量得準 */
  const clamped = tagChipsEl.classList.contains('is-open');
  if(clamped) tagChipsEl.classList.remove('is-open');
  const boxH = tagChipsEl.clientHeight;
  const overflow = tagChipsEl.scrollHeight - boxH > 2;
  if(clamped) tagChipsEl.classList.add('is-open');

  /* 這一排住在「回覆」子分頁裡，而預設打開的是「總覽」——
     子分頁還沒顯示時量到的高度全是 0，這時候什麼都不要判斷，
     等 activateTab 切過來再量一次（見那裡的 requestAnimationFrame） */
  if(!boxH) return;

  tagMoreBtn.hidden = !overflow;
  tagMoreBtn.textContent = tagChipsOpen ? '收起來' : '展開全部';
  tagMoreBtn.setAttribute('aria-expanded', String(tagChipsOpen));
}

tagMoreBtn.addEventListener('click', ()=>{
  tagChipsOpen = !tagChipsOpen;
  syncTagChipsClamp();
});
window.addEventListener('resize', ()=>{ if(!tagFilterRowEl.hidden) syncTagChipsClamp(); });

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

/* data-tag-edit 出現在三個地方：表格的標籤欄、手機卡片、詳細抽屜。
   用 document 委派一次接完，不用每個容器各綁一份 */
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-tag-edit]');
  if(!btn) return;
  e.stopPropagation();          /* 不要順便把整列的 click 一起觸發 */
  openTagPick(btn.dataset.tagEdit);
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
  refreshRsvpDrawer();
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
  setPageSub('adInboxPageSub', all.length
    ? `共 <b>${all.length}</b> 封悄悄話，只有你們讀得到`
    : '賓客寫給你們的信會出現在這裡');

  if(!loadedOnce.has('letters')){
    inboxListEl.innerHTML = skeletonHtml(3, ['50%', '90%']);
    return;
  }

  if(!list.length){
    inboxListEl.innerHTML = all.length
      ? emptyState({ title:'沒有符合的悄悄話', body:'換個關鍵字再找一次，或把篩選清掉。' })
      : emptyState({
          title: '還沒有人投信進來',
          body: '賓客可以在祝福牆寫一封只有你們讀得到的信。'
              + '信件內容不會出現在牆上，只會出現在這裡。',
          action: { label:'去看祝福牆長什麼樣', hash:'lobby/info' },
        });
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
inboxFilterEl.addEventListener('search', ()=>{ inboxPager.page = 1; renderInbox(); });

/* 規則拒絕讀取時（例如帳號被移出 ownerEmails）講清楚，不要留一個空信箱 */
document.addEventListener('data:letters:denied', ()=>{
  loadedOnce.add('letters');
  inboxListEl.innerHTML =
    emptyState({
      title: '讀不到悄悄話',
      body: '這個 Google 帳號不在新人帳號名單裡。換一個帳號登入，或告訴我們要加哪一個。',
    });
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
    imgsEl.innerHTML = emptyState({
      title: '還沒有桌次圖',
      body: '把會場給的座位圖上傳上來，賓客在桌次頁就能自己對照著找位子。',
    });
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
    /* 就地編輯就該就地回饋：值已經在欄位上了，
       一則橫跨畫面的 toast 反而在說「發生了一件大事」 */
    flashSaved(el);
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
  setPageSub('adSeatPageSub', `名單上有 <b>${all.length}</b> 位賓客`);

  const q = normKey(seatFilterEl.value);
  const filtered = q
    ? all.filter(r => normKey(r.name).includes(q) || normKey(r.table).includes(q))
    : all;

  if(!filtered.length){
    seatListEl.innerHTML = all.length
      ? emptyState({ title:'沒有符合的賓客', body:'換個名字或桌次再找一次。' })
      : emptyState({
          title: '還沒有桌次名單',
          body: '賓客在桌次頁輸入自己的名字，就查得到坐第幾桌。'
              + '名單可以一次貼進來，也可以從排桌管理同步過來。',
          action: { label:'匯入名單', id:'adSeatEmptyImport' },
        });
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
seatFilterEl.addEventListener('search', ()=>{ seatPager.page = 1; renderSeatList(); });

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
  filter:  document.getElementById('adLetterFilter'),
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
    setPageSub('adLetterPageSub', '賓客領到的那一封信，寫在這裡');
    lf.list.innerHTML = emptyState({
      title: '還沒有寫任何一封感謝信',
      body: '賓客輸入自己的名字或專屬詞彙，就會領到你們留給他的那一封。'
          + '先寫一封通用信，沒對到詞彙的人也接得住。',
      action: { label:'寫一封信', id:'adLetterEmptyAddBtn' },
    });
    return;
  }

  const byKind = letterKind === 'all' ? all
    : all.filter(b => (letterKind === 'default') === isDefaultLetter(b));

  /* 關鍵字吃三個欄位：標題、專屬詞彙、內文。
     「詞彙」是最常拿來找的 —— 新人記得寫過給「伴娘」的那一封，
     但想不起來標題叫什麼。 */
  const q = normKey(lf.filter ? lf.filter.value : '');
  const list = !q ? byKind : byKind.filter(b =>
    normKey(b.title).includes(q)
    || normKey(b.body).includes(q)
    || (Array.isArray(b.terms) && b.terms.some(t => normKey(t).includes(q))));

  setPageSub('adLetterPageSub', list.length === all.length
    ? `共 <b>${all.length}</b> 封信`
    : `<b>${list.length}</b> 封符合條件（全部 ${all.length} 封）`);

  /* 搜尋沒東西、和這個分類本來就沒東西，是兩件事：
     前者要說「換個關鍵字」，後者要說「去寫一封」。 */
  if(!list.length && q){
    lf.list.innerHTML = emptyState({
      title: '沒有符合的信',
      body: '換個關鍵字再找一次，或把搜尋清掉。標題、專屬詞彙、內文都找得到。',
    });
    return;
  }

  if(!list.length){
    lf.list.innerHTML = letterKind === 'default'
      ? emptyState({
          title: '還沒有通用信',
          body: '沒對到任何詞彙的賓客現在會撲空 —— 一封通用信就能接住他們。',
          action: { label:'寫一封通用信', id:'adLetterEmptyAddBtn' },
        })
      : emptyState({
          title: '還沒有指定信',
          body: '指定信要填「專屬詞彙」，賓客輸入對到才領得到。適合寫給伴郎伴娘、家人。',
          action: { label:'寫一封指定信', id:'adLetterEmptyAddBtn' },
        });
    return;
  }

  /* 一封信一張卡、桌機兩張並排。信是要「讀」的東西 ——
     排成一列一行的清單時，每一封都只剩前半句，
     根本認不出來哪一封是給誰的。 */
  lf.list.innerHTML = list.map(b => {
    const body = String(b.body || '');
    const excerpt = body.slice(0, 90);
    return `
    <article class="ad-letter-card${isDefaultLetter(b) ? ' is-default' : ''}">
      <header class="ad-letter-head">
        <h3 class="ad-letter-title">${escapeHtml(b.title || '（沒有標題）')}</h3>
        <span class="ad-tag">${isDefaultLetter(b) ? '通用信' : '指定信'}</span>
      </header>
      <p class="ad-letter-terms">
        ${(Array.isArray(b.terms) && b.terms.length)
          ? `詞彙：${escapeHtml(b.terms.join('、'))}`
          : (isDefaultLetter(b) ? '不用對詞彙，沒對到的賓客就領這一封' : '沒有專屬詞彙')}
      </p>
      <p class="ad-letter-body">${escapeHtml(excerpt)}${body.length > 90 ? '…' : ''}</p>
      <footer class="ad-letter-foot">
        <span class="ad-letter-time">${fmtTime(b.time)}</span>
        <span class="ad-letter-acts">
          <button class="ad-edit" data-edit-letter="${b.id}" type="button">編輯</button>
          <button class="ad-del"  data-del-letter="${b.id}"  type="button">刪除</button>
        </span>
      </footer>
    </article>`;
  }).join('');
}
document.addEventListener('data:blessings', renderLetters);

letterChipsEl.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-letter-kind]');
  if(!btn) return;
  letterKind = btn.dataset.letterKind;
  renderLetters();
});

if(lf.filter){
  lf.filter.addEventListener('input', renderLetters);
  lf.filter.addEventListener('search', renderLetters);
}

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
    ef.list.innerHTML = emptyState({
      title: '還沒有自訂內容',
      body: '想放的東西如果不在既有的欄位裡（停車資訊、包車時刻、電子紅包連結…），'
          + '就從這裡加上去，它會出現在婚禮資訊頁的最後面。',
      action: { label:'新增自訂內容', id:'adExpEmptyAddBtn' },
    });
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
  /* ↑↓ 放在時間欄左邊：這一列在講「第幾個發生」，
     排序鈕就該和時間站在一起，而不是躲在最右邊的刪除旁邊 */
  return `
    <div class="ad-sch-row">
      <div class="ad-sch-move">
        <button class="ad-edit" type="button" data-sch-move="up"   aria-label="往上移">↑</button>
        <button class="ad-edit" type="button" data-sch-move="down" aria-label="往下移">↓</button>
      </div>
      <input class="ad-input ad-sch-time"  type="text" maxlength="20"
             value="${escapeHtml(it.time || '')}"  placeholder="11:30">
      <input class="ad-input ad-sch-title" type="text" maxlength="40"
             value="${escapeHtml(it.title || '')}" placeholder="入場迎賓">
      <input class="ad-input ad-sch-desc"  type="text" maxlength="80"
             value="${escapeHtml(it.desc || '')}"  placeholder="說明（選填）">
      <button class="ad-del ad-sch-del" type="button" data-sch-del="1"
              aria-label="刪除這一列">刪除</button>
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
      emptyState({
        title: '還沒有婚禮小卡',
        body: '賓客抽到的就是這裡的卡片。先不上傳也沒關係 ——'
            + '抽卡頁會沿用素材資料夾裡的圖，或是內建的範例卡。',
      });
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
        <!-- 「重新裁切／刪除」收進 ⋯ 裡：卡片本身就窄（桌機 180px、
             手機半個螢幕），兩顆文字按鈕擠在同一行時很容易點到旁邊那顆，
             而且它們都不是每天要按的東西 -->
        <div class="ad-card-actions">
          <span class="ad-order">#${c.order ?? 0}</span>
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
    { label:'重新裁切', run: ()=> recropCard(id) },
    { label:'刪除這張小卡', danger:true, run: async ()=>{
      const ok = await confirmModal({ title:'刪除婚禮小卡', message:'確定要刪掉這張小卡嗎？' });
      if(!ok) return;
      scheduleUndoDelete('cards', id, '這張婚禮小卡', renderCards);
    } },
  ];
});

/* 拿現有的圖再裁一次：只能往內縮，但對「當初切歪了」很夠用。
   只有 ⋯ 選單會叫到它（卡片上不再有「重新裁切」那顆按鈕）。 */
async function recropCard(id){
  const item = DataStore.getCards().find(c => c.id === id);
  if(!item) return;
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
}

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
    flashSaved(e.target);
  }catch(err){ writeFailed(err); }
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
    xf.list.innerHTML = emptyState({
      title: '還沒有故事牆內容',
      body: '一張照片配一段文字，賓客可以慢慢看完你們的故事。'
          + '先不設定也可以 —— 戀愛時光會沿用素材資料夾或內建的範例。',
      action: { label:'載入預設內容來改', id:'adExhSeed' },
    });
    return;
  }
  /* 章節與故事長得要不一樣：章節是分段的標題（賓客那一頁會看到
     「第一幕・我們的相遇」整頁翻過去），故事是掛在它底下的一則。
     章節給底色與粗一級的字自己站成一條帶子，故事往內縮一格 ——
     這樣不用讀那顆「章節／故事」的標籤，掃過去就看得出結構。
     順序改用拖曳（和測驗題目同一套 setupDragSort）。 */
  xf.list.innerHTML = list.map(it => {
    const isAct = it.kind === 'act';
    const desc = String(it.desc || '');
    return `
    <div class="ad-exh-item ${isAct ? 'is-act' : 'is-photo'}" data-id="${it.id}">
      <button class="ad-drag-handle" type="button" aria-label="拖曳調整順序">⠿</button>
      ${!isAct
        ? (it.img
            ? `<img class="ad-exh-thumb" src="${escapeHtml(it.img)}" alt="">`
            : '<span class="ad-exh-thumb is-empty" aria-hidden="true">無圖</span>')
        : ''}
      <div class="ad-item-main">
        <span class="ad-exh-kind">${isAct ? '章節' : '故事'}</span>
        <span class="ad-item-title">${escapeHtml(it.title || '（沒有標題）')}</span>
        ${it.year ? `<span class="ad-tag">${escapeHtml(it.year)}</span>` : ''}
        ${it.sub ? `<span class="ad-item-sub">${escapeHtml(it.sub)}</span>` : ''}
        ${desc ? `<span class="ad-item-sub">${escapeHtml(desc.slice(0, 60))}${
          desc.length > 60 ? '…' : ''}</span>` : ''}
      </div>
      <div class="ad-item-actions">
        <button class="ad-edit" type="button" data-edit-exh="${it.id}">編輯</button>
        <button class="ad-del ad-del-inline" type="button" data-del-exh="${it.id}">刪除</button>
        ${rowMenuBtn('exh', it.id)}
      </div>
    </div>`;
  }).join('');
}

/* 拖曳只有桌機用得順，所以每一列也給一份「上移／下移／移到最前／最後」
   （做法與測驗題目相同） */
registerRowMenu('exh', (id)=>{
  const list = DataStore.getExhibits().filter(it => !isPendingDelete('exhibits', it.id));
  return [
    ...reorderMenuItems(list, id, (next)=> saveExhOrder(next)),
    '-',
    { label:'編輯這一則', run: ()=>{
      const it = DataStore.getExhibits().find(x => x.id === id);
      if(it) openExhModal(it.kind, it);
    } },
    { label:'刪除這一則', danger:true, run: async ()=>{
      const ok = await confirmModal({ title:'刪除故事牆內容', message:'確定要刪掉這一則嗎？' });
      if(!ok) return;
      if(xf.id.value === id){ closeExhModal(); resetExhForm(); }
      scheduleUndoDelete('exhibits', id, '這一則', renderExhibits);
    } },
  ];
});

/* 把 order 整批重編成 1…n（只寫真的變了的那幾份）。
   不能用通用的 saveOrder()：規則只放行 exhibitFields() 那幾個欄位。 */
async function saveExhOrder(idsInOrder){
  const list = DataStore.getExhibits();
  const byId = new Map(list.map(it => [it.id, it]));
  try{
    await Promise.all(idsInOrder.map((id, k) => {
      const it = byId.get(id);
      if(!it || it.order === k + 1) return null;
      return DataStore.saveDoc('exhibits', it.id, exhibitFields(it, k + 1));
    }).filter(Boolean));
    toast('順序已更新', {
      actionLabel: '復原',
      duration: 5000,
      onAction: ()=> saveExhOrder(
        list.filter(it => !isPendingDelete('exhibits', it.id)).map(it => it.id)),
    });
  }catch(err){
    writeFailed(err, ()=> saveExhOrder(idsInOrder));
    renderExhibits();
  }
}

setupDragSort(xf.list, '.ad-exh-item', (newOrder)=>{
  const oldOrder = DataStore.getExhibits()
    .filter(it => !isPendingDelete('exhibits', it.id))
    .map(it => it.id);
  if(newOrder.join() !== oldOrder.join()) saveExhOrder(newOrder);
});

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
    qz.list.innerHTML = emptyState({
      title: '還沒有出題',
      body: `賓客那一頁現在用的是 ${QUIZ_DEFAULTS.length} 題預設題目。`
          + '載進來改成你們自己的故事，玩起來才有意思。',
      action: { label:'載入預設題目來改', id:'adQuizSeed' },
    });
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
          <button class="ad-edit ad-edit-inline" type="button" data-edit-quiz="${it.id}">編輯</button>
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

/* ---------- 拖曳排序（Pointer Events，滑鼠與觸控通用） ----------
   測驗題目與故事牆共用同一套。呼叫時給三樣東西：
   清單容器、一列的選擇器、放開時要做什麼（新順序、有沒有真的變）。 */
function setupDragSort(listEl, itemSel, onDrop){
  let dragEl = null, startY = 0;

  const rowsNow = ()=> Array.from(listEl.querySelectorAll(itemSel));

  listEl.addEventListener('pointerdown', (e)=>{
    const handle = e.target.closest('.ad-drag-handle');
    if(!handle || !listEl.contains(handle)) return;
    dragEl = handle.closest(itemSel);
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

  listEl.addEventListener('pointermove', (e)=>{
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
    const siblings = rowsNow().filter(el => el !== dragEl);
    for(const sib of siblings){
      const dragRect = dragEl.getBoundingClientRect();
      const dragMid = dragRect.top + dragRect.height / 2;
      const rect = sib.getBoundingClientRect();
      const sibMid = rect.top + rect.height / 2;
      if(dragEl.compareDocumentPosition(sib) & Node.DOCUMENT_POSITION_FOLLOWING && dragMid > sibMid){
        listEl.insertBefore(sib, dragEl);
        startY += rect.height;
      }else if(dragEl.compareDocumentPosition(sib) & Node.DOCUMENT_POSITION_PRECEDING && dragMid < sibMid){
        listEl.insertBefore(dragEl, sib);
        startY -= rect.height;
      }
      dragEl.style.transform = `translateY(${e.clientY - startY}px)`;
    }
  });

  function endDrag(){
    stopEdge();
    if(!dragEl) return;
    const el = dragEl;
    dragEl = null;
    el.classList.remove('is-dragging');
    el.style.transform = '';
    onDrop(rowsNow().map(x => x.dataset.id));
  }
  listEl.addEventListener('pointerup', endDrag);
  listEl.addEventListener('pointercancel', endDrag);
}

setupDragSort(qz.list, '.ad-quiz-item', (newOrder)=>{
  const oldOrder = DataStore.getQuiz()
    .filter(it => !isPendingDelete('quiz', it.id))
    .map(it => it.id);
  if(newOrder.join() !== oldOrder.join()) saveQuizOrder(newOrder);
  else renderQuiz(); // 位置沒變也要把題號（1. 2. 3.…）重畫回原狀
});

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

  /* 金額預設遮起來（網路銀行的作法）。婚宴當天這一頁常常就開著擺在
     收禮台上，或是新人拿在手上給家人看桌次 —— 旁邊經過的人不該
     一眼看到今天收了多少。刻意「不」記進 localStorage：
     每次重新打開都回到遮住的狀態才有意義。 */
  let moneyHidden = true;
  /* 遮住時的樣子。字元之間夾 U+2060 word joiner、錢字號後面用不斷行空格 ——
     不然「$ ---」在窄欄位（手機的禮金欄）會被拆成「$ --」＋「-」兩行 */
  const MONEY_MASK = '$\u00A0-\u2060-\u2060-';

  const fb = () => window.fb;
  const siteId = () => window.SITE.siteId;

  function money(n){
    if(moneyHidden) return MONEY_MASK;
    return '$' + (Number(n) || 0).toLocaleString('en-US');
  }

  /* 兩顆眼睛（統計、明細）共用同一個狀態，按哪一顆都一樣 */
  function eyeButtons(){ return Array.from(document.querySelectorAll('[data-money-eye]')); }

  function syncEyes(){
    eyeButtons().forEach(btn => {
      const on = !moneyHidden;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('aria-label', on ? '遮住金額' : '顯示金額');
      const tx = btn.querySelector('.ad-eye-tx');
      if(tx) tx.textContent = on ? '遮住金額' : '顯示金額';
    });
  }

  function toggleMoney(){
    moneyHidden = !moneyHidden;
    syncEyes();
    renderAll();
  }

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
        el.links.innerHTML = emptyState({
          title: '讀不到收禮連結',
          body: '可能只是網路慢了一拍。重新整理一次；還是不行的話，確認這個帳號在新人帳號名單裡。',
        });
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
    /* 抽屜開著時也要跟上最新的數字 —— 但正在打字就先不動它（見 guardedRender） */
    refreshEntryDrawer();
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
    setPageSub('adBtPageSub', t.count
      ? `現場已經記下 <b>${t.count}</b> 筆・${links.length} 組連結`
      : '幫忙收禮的親友記下的每一筆，都會即時出現在這裡');

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
      setPageSub('adBtEntryPageSub', '讀取中…');
      el.tableWrap.innerHTML = skeletonHtml(4);
      return;
    }

    const q = normKey(filterText);
    const all = allEntries().filter(e => !q
      || normKey(`${e.name}${e.code || ''}${e.table || ''}${e.note || ''}${e.by || ''}`).includes(q));

    el.count.textContent = `目前 ${all.length} 筆`;
    setPageSub('adBtEntryPageSub', allEntries().length
      ? `現場已經記下 <b>${allEntries().length}</b> 筆`
      : '現場記下來的每一筆都會出現在這裡');

    if(!all.length){
      el.tableWrap.innerHTML = allEntries().length
        ? emptyState({
            title: '沒有符合的紀錄',
            body: '換個關鍵字再找一次 —— 姓名、備註、記錄者都找得到。',
          })
        : emptyState({
            title: '現場還沒有記下任何一筆',
            body: '幫忙收禮的親友在 /butler 記下的每一筆，都會即時出現在這裡。',
            action: { label:'去產生收禮連結', hash:'butler/links' },
          });
      renderPager(el.tableWrap, pager, 0, renderRows);
      return;
    }

    renderPager(el.tableWrap, pager, all.length, renderRows);
    const list = all.slice((pager.page - 1) * pager.size, pager.page * pager.size);

    /* 手機是一筆一張卡（10 欄的表格一樣要橫滑），桌機維持表格。
       走 guardedRender：現場四五個人同時在記，快照一直進來，
       重畫會把使用者正在改的欄位整個換掉（見 guardedRender 的註解）。 */
    guardedRender(el.tableWrap, ()=>{
      el.tableWrap.innerHTML = isNarrow() ? btCardsHtml(list) : btTableHtml(list);
      if(!isNarrow()) bindScrollHints(el.tableWrap);
    });
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
      <tbody id="adBtRows">${list.map(e => `<tr data-entry="${escapeHtml(e.id)}" tabindex="0"
        aria-label="${escapeHtml(`${e.name || '（沒有名字）'} 的收禮紀錄，按 Enter 看細節`)}">
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
      el.byWho.innerHTML = emptyState({
        title: '還沒有人記過',
        body: '每一筆都會記下是誰收的，事後對帳時這一份就是「哪一位親友手上該有多少現金」。',
      });
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
      el.links.innerHTML = emptyState({
        title: '還沒有收禮連結',
        body: '一組連結配一組通行碼，交給婚宴當天幫忙收禮的親友。'
            + '通常一場婚禮只要一組 —— 四五個人共用，統計才會加在一起。',
        action: { label:'產生第一組連結', id:'adBtEmptyNew' },
      });
      return;
    }

    setPageSub('adBtLinkPageSub', `目前有 <b>${links.length}</b> 組連結`);
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

      /* 一組連結＝一張卡。這一頁上的東西（網址、通行碼、名單、四顆動作）
         全都是「這一組連結的」，混在一條 .ad-item 的分隔線裡時，
         第二組開始就看不出來上一組到哪裡結束了。 */
      return `<article class="ad-bt-link">
        <header class="ad-bt-link-head">
          <h3 class="ad-bt-link-title">${escapeHtml(l.label || '收禮台')}</h3>
          ${state}
        </header>
        <p class="ad-bt-link-meta">
          名單 ${roster} 位${from ? `（來自${from}${
            book.importedAt ? '・' + fmtTime(book.importedAt) : ''}）` : '・還沒匯入'}
          ・已記 ${got} 筆
        </p>

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

        <footer class="ad-bt-acts">
          <button class="btn small" data-import-plan="${escapeHtml(l.id)}" type="button">匯入排桌名單</button>
          <button class="btn small ghost" data-import-rsvp="${escapeHtml(l.id)}" type="button">匯入出席回覆</button>
          <button class="btn small ghost" data-toggle="${escapeHtml(l.id)}" type="button">${dead ? '重新啟用' : '停用'}</button>
          <button class="ad-del" data-drop="${escapeHtml(l.id)}" type="button">刪除</button>
        </footer>
      </article>`;
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
  const BT_CSV_COLUMNS = [
    { key:'code',   label:'編號',   val:(e)=> e.code || '',  sum:'' },
    { key:'name',   label:'姓名',   val:(e)=> e.name || '',  sum:'總計' },
    { key:'table',  label:'桌次',   val:(e)=> e.table || '', sum:'' },
    { key:'amount', label:'禮金',   val:(e)=> Number(e.amount) || 0, sum:(t)=> t.amount },
    { key:'gift',   label:'禮餅',   val:(e)=> e.gift ? '已發送' : '沒有發', sum:'' },
    { key:'boxes',  label:'盒數',   val:(e)=> Number(e.boxes) || 0,  sum:(t)=> t.boxes },
    { key:'people', label:'人數',   val:(e)=> Number(e.people) || 0, sum:(t)=> t.people },
    { key:'note',   label:'備註',   val:(e)=> e.note || '',  sum:(t)=> `${t.count} 筆` },
    { key:'by',     label:'記錄者', val:(e)=> e.by || '',    sum:'' },
    { key:'time',   label:'時間',   val:(e)=> fmtTime(e.createdAt), sum:'' },
  ];

  async function exportCsv(){
    const list = allEntries();
    if(!list.length){ toast('現場還沒有記下任何一筆', true); return; }

    const keys = await pickCsvColumns({
      name: 'butler',
      note: `要匯出 ${list.length} 筆收禮紀錄。選擇要帶哪幾欄：`,
      columns: BT_CSV_COLUMNS,
    });
    if(!keys) return;

    const keep = BT_CSV_COLUMNS.filter(c => keys.includes(c.key));
    const t = totals(list);
    const rows = list.slice().reverse().map(e => keep.map(c => c.val(e)));
    /* 最後一行是總計 —— 只有被留下來的那幾欄才有總計可以放 */
    rows.push(keep.map(c => (typeof c.sum === 'function' ? c.sum(t) : c.sum)));
    downloadCsv('收禮紀錄', keep.map(c => c.label), rows);
    toast(`已匯出 ${list.length} 筆・${keep.length} 欄`);
  }

  /* ============================================================
     收禮明細的詳細抽屜 ＋ 就地編輯
     ------------------------------------------------------------
     為什麼這一份可以改：規則本來就允許（firestore.rules 的
     `allow create, update: if butlerOpen(bookId) && isValidButlerEntry()`），
     註解也明講「現場記錯金額是常態，能當場改掉比留一筆錯的有用」。

     兩個條件不做就會壞掉：

     1. ⚠️ 規則是 butlerOpen(bookId) —— 只在收禮簿「開著」的時候。
        新人把簿子停用（婚禮結束的常見狀態）之後，寫入會拿到
        permission-denied。所以 UI 必須先知道這件事，把欄位變唯讀，
        不要讓人打完一整段字才被退回來。
     2. ⚠️ isValidButlerEntry() 有型別與範圍檢查（amount/boxes/people
        是 int、盒數與人數上限 99）。送出前做同樣的驗證，
        不然使用者只會看到一句 permission-denied，完全不知道哪裡錯。

     還有一個技術陷阱：Firestore 的即時快照會把使用者正在打的字洗掉
     （guardedRender() 的註解有完整說明）。所以這裡的重畫一律走
     guardedRender()，不自己接 onSnapshot 直接重畫。
  ============================================================ */
  let drawerEntryId = '';

  function entryOf(id){
    for(const [bookId, list] of entriesOf){
      const hit = list.find(e => e.id === id);
      if(hit) return { entry: hit, bookId };
    }
    return null;
  }

  /* 這一本現在收不收得了禮 —— 和規則的 butlerOpen() 是同一組條件 */
  function bookEditable(bookId){
    const b = books.get(bookId);
    const link = links.find(l => l.bookId === bookId);
    if(!b) return false;
    if(b.revoked === true) return false;
    if(link && link.revoked === true) return false;
    const S = window.SITE;
    return !!(S && (S.isPageOn ? S.isPageOn('butler') : S.isEnabled('butler')));
  }

  const ENTRY_FIELDS = {
    amount: { label:'禮金',   type:'int', max:9999999, unit:'元' },
    boxes:  { label:'盒數',   type:'int', max:99,      unit:'盒' },
    people: { label:'人數',   type:'int', max:99,      unit:'位' },
    note:   { label:'備註',   type:'text', max:200 },
  };

  function entryDrawerHtml(e, bookId){
    const editable = bookEditable(bookId);
    const ro = editable ? '' : ' disabled';

    const field = (key)=>{
      const f = ENTRY_FIELDS[key];
      const val = f.type === 'int' ? (Number(e[key]) || 0) : (e[key] || '');
      const input = f.type === 'int'
        ? `<input class="ad-input ad-inline-input" type="number" inputmode="numeric"
             min="0" max="${f.max}" step="1" value="${escapeHtml(String(val))}"
             data-entry-field="${key}" aria-label="${escapeHtml(f.label)}"${ro}>`
        : `<textarea class="ad-textarea ad-inline-input" maxlength="${f.max}"
             data-entry-field="${key}" aria-label="${escapeHtml(f.label)}"${ro}
             rows="2">${escapeHtml(String(val))}</textarea>`;
      return `<div class="ad-inline-field">
        <label class="ad-label">${escapeHtml(f.label)}${f.unit ? `<small>（${f.unit}）</small>` : ''}</label>
        ${input}
      </div>`;
    };

    return `
      <div class="ad-drawer-rows">
        ${rsvpDrawerRow('編號', escapeHtml(e.code || '—'))}
        ${rsvpDrawerRow('桌次', escapeHtml(e.table || '—'))}
        ${rsvpDrawerRow('禮餅', e.gift ? '已發送' : '沒有發')}
        ${rsvpDrawerRow('記錄者', escapeHtml(e.by || '—'))}
        ${rsvpDrawerRow('記錄時間', escapeHtml(fmtTime(e.createdAt)))}
        ${e.updatedAt && e.updatedAt !== e.createdAt
            ? rsvpDrawerRow('最後修改', escapeHtml(fmtTime(e.updatedAt))) : ''}
      </div>

      <div class="ad-drawer-sec" data-entry-edit="${escapeHtml(e.id)}">
        <div class="ad-drawer-sec-title">就地修改</div>
        ${editable ? `<p class="ad-hint">現場記錯金額是常態。改完按 Enter 存起來，Escape 放棄這次修改。</p>`
                   : `<p class="ad-hint">這本收禮簿已經<b>停用</b>了，所以改不動 ——
                        到「連結與名單」把它重新啟用，才改得回來。</p>`}
        ${field('amount')}
        ${field('boxes')}
        ${field('people')}
        ${field('note')}
      </div>`;
  }

  function openEntryDrawer(id){
    const hit = entryOf(id);
    if(!hit) return;
    drawerEntryId = id;
    Drawer.open({
      title: hit.entry.name || '（沒有名字）',
      sub: `${escapeHtml(money(hit.entry.amount))}${
        hit.entry.gift ? `・禮餅 ${Number(hit.entry.boxes) || 0} 盒` : ''}`,
      body: entryDrawerHtml(hit.entry, hit.bookId),
      onClose(){ drawerEntryId = ''; },
    });
  }

  /* 快照回來時就地更新抽屜 —— 但使用者正在打字的話先不要動它。
     guardedRender() 就是為了這件事寫的：重畫等於把正在編輯的那個
     DOM 節點整個換掉，打的字會消失、接著的 change 也落在孤兒節點上。 */
  function refreshEntryDrawer(){
    if(!drawerEntryId || !Drawer.isOpen()) return;
    const hit = entryOf(drawerEntryId);
    if(!hit){ Drawer.close(); return; }
    guardedRender(Drawer.body(), ()=>{
      Drawer.setBody(entryDrawerHtml(hit.entry, hit.bookId));
    });
  }

  /* 送出前做和規則一樣的驗證：擋在這裡，使用者看到的是
     「盒數最多 99 盒」，而不是一句 permission-denied */
  function normalizeEntryValue(key, raw){
    const f = ENTRY_FIELDS[key];
    if(!f) return { err:'不認得這個欄位' };
    if(f.type === 'int'){
      const n = Math.round(Number(String(raw).trim()));
      if(!Number.isFinite(n)) return { err:`${f.label}要填數字` };
      if(n < 0) return { err:`${f.label}不能是負數` };
      if(n > f.max) return { err:`${f.label}最多 ${f.max}${f.unit || ''}` };
      return { value:n };
    }
    const t = String(raw).slice(0, f.max);
    return { value:t };
  }

  async function saveEntryField(input){
    const sec = input.closest('[data-entry-edit]');
    if(!sec) return;
    const id  = sec.dataset.entryEdit;
    const key = input.dataset.entryField;
    const hit = entryOf(id);
    if(!hit) return;

    if(!bookEditable(hit.bookId)){
      toast('這本收禮簿已經停用了，改不動', true);
      return;
    }

    const cur = ENTRY_FIELDS[key].type === 'int'
      ? (Number(hit.entry[key]) || 0) : (hit.entry[key] || '');
    const out = normalizeEntryValue(key, input.value);
    if(out.err){
      setFieldError(input, out.err);
      return;
    }
    setFieldError(input, '');
    if(out.value === cur){ input.value = String(cur); return; }

    const { doc, updateDoc } = window.fb;
    try{
      await updateDoc(
        doc(fb().db, 'butlers', hit.bookId, 'entries', id),
        { [key]: out.value, updatedAt: Date.now() });
      /* 本機先更新，不要等快照 —— 抽屜上的數字要立刻對得起來 */
      hit.entry[key] = out.value;
      hit.entry.updatedAt = Date.now();
      /* 就地回饋：單一欄位存好了不值得一則橫跨畫面的 toast */
      flashSaved(input);
      renderStats();
      renderRows();
      renderByWho();
    }catch(err){
      /* 規則擋下來多半就是簿子被停用了，講清楚是哪一件事 */
      if(err && err.code === 'permission-denied'){
        toast('這本收禮簿已經停用了，改不動', true);
      }else{
        writeFailed(err, ()=> saveEntryField(input));
      }
      input.value = String(cur);
    }
  }

  /* Enter 存、Escape 取消。textarea 的 Enter 是換行，所以它靠 blur 存。 */
  document.addEventListener('keydown', (e)=>{
    const input = e.target.closest && e.target.closest('[data-entry-field]');
    if(!input) return;
    if(e.key === 'Enter' && input.tagName === 'INPUT'){
      e.preventDefault();
      input.blur();                 /* blur 會走 change → saveEntryField */
    }else if(e.key === 'Escape'){
      e.preventDefault();
      const sec = input.closest('[data-entry-edit]');
      const hit = sec && entryOf(sec.dataset.entryEdit);
      if(hit){
        const key = input.dataset.entryField;
        input.value = ENTRY_FIELDS[key].type === 'int'
          ? String(Number(hit.entry[key]) || 0) : (hit.entry[key] || '');
      }
      setFieldError(input, '');
      input.blur();
    }
  });
  document.addEventListener('change', (e)=>{
    const input = e.target.closest && e.target.closest('[data-entry-field]');
    if(input) saveEntryField(input);
  });

  el.tableWrap.addEventListener('click', (e)=>{
    const tr = e.target.closest('tr[data-entry]');
    if(tr && rowClickShouldOpen(e)) openEntryDrawer(tr.dataset.entry);
  });
  el.tableWrap.addEventListener('keydown', (e)=>{
    if(e.key !== 'Enter' && e.key !== ' ') return;
    const tr = e.target.closest && e.target.closest('tr[data-entry]');
    if(!tr || e.target !== tr) return;
    e.preventDefault();
    openEntryDrawer(tr.dataset.entry);
  });

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
  /* 兩顆眼睛（統計、明細）都是同一個開關 */
  eyeButtons().forEach(btn => btn.addEventListener('click', toggleMoney));
  syncEyes();
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
