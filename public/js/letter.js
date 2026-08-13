/* ============================================================
   letter.js — 給你的信（新人寫的電子祝福信）
   ------------------------------------------------------------
   ・新人在後台寫好一封封信，每封信掛幾個「專屬詞彙」
     （名字、綽號、只有你們兩個知道的暗號都可以）
   ・賓客輸入任一個詞彙就領到那封信
   ・沒有對到任何一封，但新人有設「通用信」的話就給通用信

   比對規則跟桌次頁一致：正規化後完全相同 → 互相包含。
   詞彙寫得越短越容易誤中，這件事在後台的說明文字裡會講。
============================================================ */

const wlStage = document.getElementById('wlStage');
const wlForm  = document.getElementById('wlForm');
const wlInput = document.getElementById('wlInput');
const wlMsg   = document.getElementById('wlMsg');
const wlSheet = document.getElementById('wlSheet');
const wlEnv   = document.getElementById('wlEnvelope');

let blessingsLoaded = false;

DataStore.subscribeBlessings();

/* ============================================================
   比對
============================================================ */
function termsOf(b){
  return (Array.isArray(b.terms) ? b.terms : [])
    .map(normKey)
    .filter(Boolean);
}

function matchBlessing(input){
  const q = normKey(input);
  if(!q) return null;

  const list = DataStore.getBlessings();
  const personal = list.filter(b => termsOf(b).length);

  /* 1. 詞彙完全相同 */
  const exact = personal.find(b => termsOf(b).includes(q));
  if(exact) return exact;

  /* 2. 詞彙包含輸入的字，或輸入的字包含詞彙
        （「小明」對得到「王小明」，「王小明先生」也對得到「王小明」）
        取最長的詞彙，越長代表越精準 */
  let best = null, bestLen = 0;
  personal.forEach(b => {
    termsOf(b).forEach(t => {
      if((t.includes(q) || q.includes(t)) && t.length > bestLen){
        best = b; bestLen = t.length;
      }
    });
  });
  if(best) return best;

  /* 3. 通用信 */
  return list.find(b => b.isDefault === true) || null;
}

/* ============================================================
   開信
============================================================ */
function showMsg(text){
  wlMsg.textContent = text || ' ';
}

function shakeEnvelope(){
  wlEnv.animate(
    [{transform:'translateX(0)'},{transform:'translateX(-7px)'},
     {transform:'translateX(7px)'},{transform:'translateX(0)'}],
    { duration:320 }
  );
}

function openLetter(b, typed){
  document.getElementById('wlToName').textContent = typed;
  document.getElementById('wlTitle').textContent =
    b.title || `給 ${typed} 的一封信`;
  document.getElementById('wlText').textContent = b.body || '';
  document.getElementById('wlSign').textContent =
    b.sign || (window.WED && window.WED.couple) || '';

  /* 先讓信封掀蓋，動畫跑完再把信紙推上來 */
  wlEnv.classList.add('is-open');
  showMsg('');
  setTimeout(()=>{
    wlStage.classList.add('is-sent');
    wlSheet.hidden = false;
    requestAnimationFrame(()=> wlSheet.classList.add('show'));
    wlSheet.scrollIntoView({ behavior:'smooth', block:'start' });
    try{ confettiRain(); }catch{}
  }, 700);
}

function closeLetter(){
  wlSheet.classList.remove('show');
  wlSheet.hidden = true;
  wlStage.classList.remove('is-sent');
  wlEnv.classList.remove('is-open');
  wlInput.value = '';
  wlInput.focus();
  showMsg('');
  wlStage.scrollIntoView({ behavior:'smooth', block:'center' });
}

wlForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const typed = wlInput.value.trim();
  if(!typed){
    wlInput.focus();
    shakeEnvelope();
    showMsg('先輸入你的名字或暗號吧');
    return;
  }
  if(!blessingsLoaded){
    showMsg('正在把信拿出來…');
    return;
  }
  const hit = matchBlessing(typed);
  if(!hit){
    shakeEnvelope();
    showMsg(`還沒有寫給「${typed}」的信，換個寫法或問問新人吧`);
    return;
  }
  openLetter(hit, typed);
});

document.getElementById('wlAgain').addEventListener('click', closeLetter);

/* ============================================================
   資料進來後
============================================================ */
document.addEventListener('data:blessings', ()=>{
  blessingsLoaded = true;
  const n = DataStore.getBlessings().length;
  if(!n){
    showMsg('新人還沒開始寫信，晚點再回來看看');
    document.getElementById('wlBtn').disabled = true;
  }else{
    document.getElementById('wlBtn').disabled = false;
    if(wlMsg.textContent.trim() === '正在把信拿出來…') showMsg('');
  }
});

document.addEventListener('data:blessings:denied', ()=>{
  blessingsLoaded = true;
  showMsg('信件暫時讀不到，請稍後再試一次');
});

/* 進場時填過名字的話先幫他帶上 */
if(me_user && me_user.name && me_user.name !== '朋友'){
  wlInput.value = me_user.name;
  document.getElementById('wlToName').textContent = me_user.name;
}

/* 打字時信封上的收件人跟著改，開信前就有「這封是寫給我的」的感覺 */
wlInput.addEventListener('input', ()=>{
  document.getElementById('wlToName').textContent = wlInput.value.trim() || '你';
});
