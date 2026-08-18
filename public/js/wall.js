/* ============================================================
   wall.js — 祝福牆：寫小卡、寄信
============================================================ */
if(!requireUser()) { /* requireUser 已導向首頁 */ }

/* ---------- 簽到祝福留言牆 ---------- */
const WISH_TONES = 6;                       /* 對應 wall.css 的 .wish-note[data-tone] */
const WISH_TILTS = [-1.1, .8, -.5, 1.2, -.8, .5];

/* 由留言本身算出固定的色票／傾角：重新渲染或多人同時留言都不會跳色 */
function wishSeed(w, i){
  const key = String(w.id || (w.time + '' + (w.name || '')) || i);
  let h = 0;
  for(let k = 0; k < key.length; k++) h = (h * 31 + key.charCodeAt(k)) >>> 0;
  return h;
}

function renderWishes(){
  const wall=document.getElementById('wishWall'); wall.innerHTML='';
  DataStore.getWishes().slice().reverse().forEach((w, i)=>{
    const seed = wishSeed(w, i);
    const d=document.createElement('div'); d.className='wish-note';
    d.dataset.tone = seed % WISH_TONES;
    d.style.setProperty('--note-tilt', WISH_TILTS[(seed >> 3) % WISH_TILTS.length] + 'deg');
    d.innerHTML=`${escapeHtml(w.text)}`
      + `<div class="by">${escapeHtml(w.icon||DEFAULT_ICON)} ${escapeHtml(w.name)}</div>`;
    wall.appendChild(d);
  });
}

/* 名字：入場登入開著時就是大廳報到的那個；關著的話 ensureUser() 會在這一刻補問，
   賓客按了取消就不送出（留言留在輸入框裡，不會白打一次） */
document.getElementById('postWish').addEventListener('click',async ()=>{
  const t=document.getElementById('wishText').value.trim();
  if(!t) return;
  const u = await ensureUser();
  if(!u) return;
  DataStore.addWish({name:u.name, icon:u.icon, text:t});
  document.getElementById('wishText').value='';
  confettiRain();
  /* 不需手動 renderWishes，onSnapshot 會推 'data:wishes' 回來自動重畫 */
});

document.addEventListener('data:wishes', renderWishes);
renderWishes();

/* ---------- 信箱 ---------- */
const letterModal = document.getElementById('letterModal');
const letterText  = document.getElementById('letterText');
const letterCount = document.getElementById('letterCount');

function renderLetterCount(){
  letterCount.textContent = DataStore.getLetterCount();
  const oc=document.getElementById('ownerCount'); if(oc) oc.textContent=DataStore.getLetterCount();
}
function openLetter(){ letterModal.classList.add('open'); setTimeout(()=>letterText.focus(),60); }
function closeLetter(){ letterModal.classList.remove('open'); }
async function submitLetter(){
  const t=letterText.value.trim();
  if(!t){ letterText.focus(); return; }
  const u = await ensureUser();
  if(!u) return;
  DataStore.addLetter({name:u.name, icon:u.icon, text:t});
  letterText.value='';
  closeLetter();
  spawnFloat(DEFAULT_ICON, innerWidth/2, innerHeight*0.7);
  confettiRain();
  /* renderLetterCount 會由 'data:letters' 事件觸發 */
}

document.addEventListener('data:letters', renderLetterCount);

document.getElementById('mailbox').addEventListener('click', openLetter);
document.getElementById('writeLetter').addEventListener('click', openLetter);
document.getElementById('letterClose').addEventListener('click', closeLetter);
document.getElementById('letterCancel').addEventListener('click', closeLetter);
document.getElementById('letterSend').addEventListener('click', submitLetter);
letterModal.addEventListener('click', e=>{ if(e.target===letterModal) closeLetter(); });

renderLetterCount();
