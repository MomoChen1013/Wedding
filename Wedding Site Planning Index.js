/* ============================================================
   index.js — 大廳頁面
   流程：
     首次造訪 → 顯示 gate（填名字 + 抽 icon）→ 倒數 5 秒 → 開幕布幕 → 進入大廳
     已登入  → 跳過 gate，直接顯示大廳
============================================================ */

const iconPick = document.getElementById('iconPick');
const nameInput= document.getElementById('nameInput');
const badgeName= document.getElementById('badgeName');
const badgeIcon= document.getElementById('badgeIcon');
const app      = document.getElementById('app');
const gate     = document.getElementById('gate');
let currentIcon = ICONS[Math.floor(Math.random()*ICONS.length)];

function syncBadge(){
  if(badgeName) badgeName.textContent = me_user.name;
  if(badgeIcon) badgeIcon.textContent = me_user.icon;
}
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
  c.animate([{transform:'translateX(0)'},{transform:'translateX(-8px)'},{transform:'translateX(8px)'},{transform:'translateX(0)'}],{duration:300});
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
    app.style.display='block'; app.classList.add('app-show');
    confettiRain(); setTimeout(fireworksBurst,400); setTimeout(goldFall,200);
  },1700);
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
  syncBadge();
  gate.style.display='none';                   // 先把入口畫面收掉
  runCountdown();                              // 馬上開始倒數
  try { startBGM(); } catch(e){ console.warn('BGM 啟動失敗', e); }  // 音樂掛掉也不影響流程
});

/* 若已經登入過，直接跳過 gate */
if(LS.get('user', null)){
  syncBadge();
  gate.style.display='none';
  app.style.display='block';
  app.classList.add('app-show');
}
