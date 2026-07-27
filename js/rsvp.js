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
    showErr('出席的話，順手選一下餐點需求 🍽️'); return;
  }

  const payload = {
    name,
    icon:      (me_user && me_user.icon) || '🎀',
    attending,                                        // yes / no / maybe
    headcount: attending === 'yes' ? headcount : 0,
    meal:      attending === 'yes' ? meal : '',
    note:      rNote.value.trim(),
  };

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  try{
    await DataStore.addRSVP(payload);
  }catch(e){
    console.warn('[rsvp] 送出失敗', e);
    btn.disabled = false;
    showErr('送出時發生問題，請稍後再試 🙏');
    return;
  }
  btn.disabled = false;

  /* 記在本機，回訪就顯示「已回覆」 */
  LS.set('rsvp.mine', payload);
  /* 名字同步回個人資料 */
  try{ saveUser({ name, icon: payload.icon }); }catch{}

  showThanks(payload);
  confettiRain();
  if(attending === 'yes') setTimeout(fireworksBurst, 300);
});

/* ---------- 感謝畫面 ---------- */
function showThanks(p){
  const msgByAttend = {
    yes:   { t:'太好了，收到你的回覆！',  m:`我們幫你（和另外 ${Math.max(0,(p.headcount||1)-1)} 位）留好位置，超期待相見 ♡` },
    no:    { t:'收到你的回覆了',           m:'雖然這次無法相聚，還是謝謝你的祝福，會想念你的 🤍' },
    maybe: { t:'收到～先幫你記著',          m:'等你確定了，隨時回來把回覆更新成出席就好 ♡' },
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

/* ---------- 統計 ---------- */
function renderCount(){
  document.getElementById('rsvpCount').textContent   = DataStore.getRSVPCount();
  document.getElementById('attendCount').textContent = DataStore.getAttendingCount();
}
document.addEventListener('data:rsvps', renderCount);
renderCount();

/* ---------- 新人專屬：完整名單 ---------- */
const ownerList = document.getElementById('ownerList');
const ATTEND_LABEL = { yes:'✅ 出席', no:'❌ 不克出席', maybe:'🤔 未定' };
const MEAL_LABEL   = { meat:'葷食', veg:'素食', none:'不用餐' };
function renderOwner(){
  if(!ownerList || !isOwnerVisitor()) return;
  ownerList.hidden = false;
  const all = DataStore.getRSVPs().slice().reverse();
  const yes = all.filter(r=>r.attending==='yes');
  const heads = DataStore.getAttendingCount();
  document.getElementById('olSummary').innerHTML =
    `共 <b>${all.length}</b> 份回覆　|　出席 <b>${yes.length}</b> 組・<b>${heads}</b> 位　|　`+
    `不克出席 <b>${all.filter(r=>r.attending==='no').length}</b>　|　未定 <b>${all.filter(r=>r.attending==='maybe').length}</b>`;

  document.getElementById('olItems').innerHTML = all.length
    ? all.map(r=>`
        <div class="ol-item ol-${r.attending||'maybe'}">
          <div class="ol-head">
            <span class="ol-ic">${r.icon||'🎀'}</span>
            <span class="ol-name">${escapeHtml(r.name||'朋友')}</span>
            <span class="ol-badge">${ATTEND_LABEL[r.attending]||''}</span>
          </div>
          <div class="ol-meta">
            ${r.attending==='yes' ? `👥 ${r.headcount||1} 位・🍽️ ${MEAL_LABEL[r.meal]||'—'}　` : ''}
            <span class="ol-time">${timeStr(r.time||Date.now())}</span>
          </div>
          ${r.note ? `<div class="ol-note">${escapeHtml(r.note)}</div>` : ''}
        </div>`).join('')
    : `<div class="ol-empty">還沒有人回覆，等賓客們填完就會出現在這裡 💭</div>`;
}
document.addEventListener('data:rsvps', renderOwner);
renderOwner();
