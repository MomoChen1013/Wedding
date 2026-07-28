/* ============================================================
   inbox.js — 悄悄話信箱（新人專屬）
   ------------------------------------------------------------
   ・門檻是 Google 登入，不是密碼。
     Security Rules 只讓 sites.ownerEmails 名單內、且信箱已驗證的
     帳號讀取 letters；賓客寫得進去、讀不出來。
   ・因此這裡沒有「解鎖畫面」這種純前端遮罩，
     沒權限的人就算改了 DOM 也拿不到任何資料。
============================================================ */
const pwGate   = document.getElementById('pwGate');
const pwErr    = document.getElementById('pwErr');
const loginBtn = document.getElementById('ownerLoginBtn');
const ibPage   = document.getElementById('inboxPage');
const lockBtn  = document.getElementById('ibLock');

function showError(msg){
  pwErr.textContent = msg;
  const card = document.querySelector('#pwGate .gate-card');
  if(card){
    card.animate(
      [{transform:'translateX(0)'},{transform:'translateX(-8px)'},
       {transform:'translateX(8px)'},{transform:'translateX(0)'}],
      {duration:300}
    );
  }
}

/* ---------- 開啟 / 關閉信箱 ---------- */
function openInbox(){
  if(!ibPage.hidden) return;
  pwGate.style.display = 'none';
  ibPage.hidden = false;
  setNavVisible(true);
  DataStore.subscribeLetters();
  renderInbox();
  setTimeout(()=>window.scrollTo({top:0, behavior:'instant'}), 0);
}

function closeInbox(){
  ibPage.hidden = true;
  setNavVisible(false);
  pwGate.style.display = '';
}

/* ---------- 登入 ---------- */
loginBtn.addEventListener('click', async ()=>{
  pwErr.innerHTML = '&nbsp;';
  loginBtn.disabled = true;
  try{
    const email = await signInAsOwner();
    if(isSiteOwner()){
      openInbox();
    }else{
      showError(`${email || '這個帳號'} 不是這場婚禮的新人帳號`);
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

/* 上鎖：登出回到匿名訪客身分 */
lockBtn.addEventListener('click', async ()=>{
  try{ await window.fb.signOut(window.fb.auth); }catch{}
  location.reload();
});

/* 這個站台還沒設定新人信箱時，講清楚而不是讓人一直按登入 */
if(!ownerEmails().length){
  loginBtn.disabled = true;
  pwErr.textContent = '這個站台還沒設定新人的 Google 信箱';
}else{
  /* 已經是登入狀態就直接進信箱 */
  window.fb.onAuthStateChanged(window.fb.auth, ()=>{
    if(isSiteOwner()) openInbox();
  });
}

/* 規則拒絕讀取（例如信箱不在名單內）→ 退回登入畫面 */
document.addEventListener('data:letters:denied', ()=>{
  closeInbox();
  showError('這個帳號沒有讀取信件的權限');
});

/* 有新信進來自動重畫 */
document.addEventListener('data:letters', ()=>{
  if(!ibPage.hidden) renderInbox();
});

/* ---------- 信箱渲染 ---------- */
function timeStr(ts){
  const d = new Date(ts);
  const m = d.getMonth()+1, day = d.getDate();
  const h = String(d.getHours()).padStart(2,'0');
  const mn = String(d.getMinutes()).padStart(2,'0');
  return `${m}/${day} ${h}:${mn}`;
}

function renderInbox(){
  const letters = DataStore.getLetters().slice().reverse();
  document.getElementById('ibCount').textContent = letters.length;

  const list = document.getElementById('ibList');
  if(!letters.length){
    list.innerHTML = `
      <div class="ib-empty">
        目前還沒有人投信進來<br>
        等賓客們從祝福牆寫信給你們，這裡就會出現囉
      </div>`;
    return;
  }
  list.innerHTML = letters.map(l => `
    <div class="ib-letter">
      <div class="ib-head">
        <span class="ib-ic">${escapeHtml(l.icon || DEFAULT_ICON)}</span>
        <span class="ib-name">${escapeHtml(l.name || '朋友')}</span>
        <span class="ib-time">${timeStr(l.time || Date.now())}</span>
      </div>
      <div class="ib-body">${escapeHtml(l.text || '')}</div>
    </div>
  `).join('');
}
