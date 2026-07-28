/* ============================================================
   rsvp.js — 出席回覆
   ・賓客填：稱呼 / 是否出席 / 人數 / 餐點 / 悄悄話
   ・送出 → DataStore.addRSVP（Firestore）；同時記在本機，回訪顯示已回覆
   ・新人（網址加 #couple）可看完整名單
============================================================ */
if(!requireUser()) { /* requireUser 已導向首頁 */ }

/* ---------- DOM ---------- */
const rName    = document.getElementById('rName');
const rNote    = document.getElementById('rNote');
const rErr     = document.getElementById('rErr');
const detailBox= document.getElementById('detailBox');
const headNum  = document.getElementById('headNum');
const formCard = document.getElementById('formCard');
const thanksCard = document.getElementById('thanksCard');

/* ---------- 狀態 ---------- */
let attending = null;      // 'yes' | 'no' | 'maybe'
let meal      = 'meat';    // 'meat' | 'veg' | 'none'
let headcount = 1;

/* 預填名字（用進場時填的名字） */
if(me_user && me_user.name && me_user.name !== '朋友') rName.value = me_user.name;

/* ---------- 選項 chip ---------- */
function wireChoices(rowId, onPick){
  const row = document.getElementById(rowId);
  if(!row) return;
  row.querySelectorAll('.choice').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      row.querySelectorAll('.choice').forEach(b=>b.classList.remove('on'));
      btn.classList.add('on');
      onPick(btn.dataset.val);
    });
  });
}
wireChoices('attendRow', val=>{
  attending = val;
  detailBox.hidden = (val !== 'yes');
  clearErr();
});
wireChoices('mealRow', val=>{ meal = val; });

/* ---------- 人數 stepper ---------- */
function setHead(n){ headcount = Math.max(1, Math.min(20, n)); headNum.textContent = headcount; }
document.getElementById('minusBtn').addEventListener('click', ()=>setHead(headcount-1));
document.getElementById('plusBtn').addEventListener('click', ()=>setHead(headcount+1));

/* ---------- 送出 ---------- */
function clearErr(){ rErr.textContent = ' '; }
function showErr(msg){ rErr.textContent = msg; }

document.getElementById('submitBtn').addEventListener('click', async ()=>{
  const name = rName.value.trim();
  if(!name){ showErr('請先填上你的名字～'); rName.focus(); return; }
  if(!attending){ showErr('請選擇能不能出席唷'); return; }
  if(attending === 'yes' && !document.querySelector('#mealRow .choice.on')){
    showErr('出席的話，順手選一下餐點需求'); return;
  }

  /* 三選一的 yes / no / maybe 要落成 Firestore 的欄位：
     attending 為 boolean（只有 yes 是 true），
     未定另外用 tentative 標記，資訊才不會遺失 */
  const payload = {
    name,
    icon:        (me_user && me_user.icon) || DEFAULT_ICON,
    attending:   attending === 'yes',
    tentative:   attending === 'maybe',
    guestCount:  attending === 'yes' ? headcount : 1,
    meal:        attending === 'yes' ? meal : '',
    dietaryNote: '',
    message:     rNote.value.trim().slice(0, 300),
    createdAt:   window.fb.serverTimestamp(),
  };

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  try{
    await DataStore.addRSVP(payload);
  }catch(e){
    console.warn('[rsvp] 送出失敗', e);
    btn.disabled = false;
    showErr('送出時發生問題，請稍後再試');
    return;
  }
  btn.disabled = false;

  /* 記在本機，回訪就顯示「已回覆」（存人看得懂的形式） */
  const mine = { name, icon: payload.icon, attending, headcount, meal, note: payload.message };
  LS.set('rsvp.mine', mine);
  /* 名字同步回個人資料 */
  try{ saveUser({ name, icon: payload.icon }); }catch{}

  showThanks(mine);
  confettiRain();
  if(attending === 'yes') setTimeout(fireworksBurst, 300);
});

/* ---------- 感謝畫面 ---------- */
function showThanks(p){
  const msgByAttend = {
    yes:   { t:'太好了，收到你的回覆',  m:`我們幫你（和另外 ${Math.max(0,(p.headcount||1)-1)} 位）留好位置，超期待相見` },
    no:    { t:'收到你的回覆了',        m:'雖然這次無法相聚，還是謝謝你的祝福，會想念你的' },
    maybe: { t:'先幫你記著',            m:'等你確定了，隨時回來把回覆更新成出席就好' },
  };
  const info = msgByAttend[p.attending] || msgByAttend.maybe;
  document.getElementById('tkTitle').textContent = info.t;
  document.getElementById('tkMsg').textContent   = info.m;
  formCard.hidden = true;
  thanksCard.hidden = false;
}

/* ---------- 修改回覆 ---------- */
document.getElementById('editBtn').addEventListener('click', ()=>{
  thanksCard.hidden = true;
  formCard.hidden = false;
  formCard.scrollIntoView({ behavior:'smooth', block:'start' });
});

/* ---------- 回訪：帶出上次的回覆 ---------- */
(function restoreMine(){
  const mine = LS.get('rsvp.mine', null);
  if(!mine) return;
  rName.value = mine.name || rName.value;
  rNote.value = mine.note || '';
  attending = mine.attending || null;
  if(attending){
    const b = document.querySelector(`#attendRow .choice[data-val="${attending}"]`);
    if(b) b.classList.add('on');
    detailBox.hidden = (attending !== 'yes');
  }
  if(mine.meal){
    meal = mine.meal;
    const mb = document.querySelector(`#mealRow .choice[data-val="${meal}"]`);
    if(mb) mb.classList.add('on');
  }
  if(mine.headcount) setHead(mine.headcount);
  showThanks(mine);
})();

/* ---------- 統計與名單 ----------
   出席回覆屬於個人資料，Security Rules 禁止前端讀取，
   因此這裡不顯示即時統計；名單請用管理端指令匯出：
     node scripts/export-rsvps.js --slug <slug> --out 名單.csv
============================================================ */
(function hideGuestStats(){
  /* 統計數字讀不到，整塊藏起來比顯示 0 更誠實 */
  const stats = document.getElementById('rsvpCount');
  const box = stats && stats.closest('.stat-row, .stats, .rsvp-stats');
  if(box) box.hidden = true;
  else if(stats) stats.closest('div')?.setAttribute('hidden', '');
})();

const ownerList = document.getElementById('ownerList');
if(ownerList && isOwnerVisitor()){
  ownerList.hidden = false;
  const summary = document.getElementById('olSummary');
  const items = document.getElementById('olItems');
  if(summary) summary.textContent = '出席名單不會顯示在網頁上';
  if(items){
    items.innerHTML =
      `<div class="ol-empty">為了保護賓客隱私，回覆內容只有你用管理金鑰才讀得到。<br>` +
      `請在專案目錄執行：<br><br>` +
      `<code>node scripts/export-rsvps.js --slug ${escapeHtml(window.SITE.slug)} --out 名單.csv</code></div>`;
  }
}
