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

/* 比對邏輯在 common.js 的 findBlessing()，與桌次頁共用同一份 */

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
  openedLetter = { letter: b, typed };
  saveHint('');
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
  openedLetter = null;
  saveHint('');
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
  const hit = findBlessing(typed, DataStore.getBlessings());
  if(!hit){
    shakeEnvelope();
    showMsg(`還沒有寫給「${typed}」的信，換個寫法或問問新人吧`);
    return;
  }
  openLetter(hit.item, typed);
});

document.getElementById('wlAgain').addEventListener('click', closeLetter);

/* ============================================================
   儲存下載（JPG）
   ------------------------------------------------------------
   信是一張信紙，賓客會想留著 —— 所以做的是「一張圖」而不是截圖：
   用 canvas 重畫一次同一張信紙（同樣的邊框、手寫內文、署名），
   輸出 1080×1920 的直式 JPG，比例就是手機螢幕的 9:16，
   存進相簿或設成限時動態的底圖都剛好。

   為什麼不直接截 DOM：不引第三方函式庫（html2canvas 之類）是全站的規矩，
   而且信紙的版面很單純，自己畫反而拿得到更好的解析度與留白。
============================================================ */
const wlSaveBtn  = document.getElementById('wlSave');
const wlSaveHint = document.getElementById('wlSaveHint');

const SAVE_HINT = '存成 JPG 圖片，收進手機或電腦相簿';
function saveHint(text){ wlSaveHint.textContent = text || SAVE_HINT; }

/* 目前開著的是哪一封（closeLetter 之後清掉，避免存到上一封） */
let openedLetter = null;

function cssVar(name, fallback){
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/* 斷行：中文可以斷在任何一個字之間，英數要整個單字一起搬。
   先切成「一串英數」或「單一個字」的 token，再貪婪塞滿每一行。 */
function tokenize(line){
  const out = [];
  let buf = '';
  for(const ch of line){
    if(/[A-Za-z0-9@._'’&/-]/.test(ch)){ buf += ch; continue; }
    if(buf){ out.push(buf); buf = ''; }
    out.push(ch);
  }
  if(buf) out.push(buf);
  return out;
}

function wrapText(ctx, text, maxWidth){
  const lines = [];
  String(text || '').split(/\r?\n/).forEach(raw => {
    if(!raw.trim()){ lines.push(''); return; }
    let cur = '';
    tokenize(raw).forEach(tk => {
      /* 行首的空白不留，不然每一行會被推歪 */
      const next = cur + tk;
      if(cur && ctx.measureText(next).width > maxWidth){
        lines.push(cur);
        cur = tk === ' ' ? '' : tk;
      }else{
        cur = next;
      }
    });
    lines.push(cur);
  });
  return lines;
}

/* 直式 9:16（手機螢幕的比例），信紙就是滿滿的一整頁 */
const SAVE_W = 1080;
const SAVE_H = 1920;

/* 把目前這封信畫成一張 canvas */
function drawLetterCanvas(b, typed){
  const W = SAVE_W;
  const PAD   = 72;                      /* 畫布邊界到信紙 */
  const INNER = 46;                      /* 信紙邊框到文字 */
  const FOOT  = 96;                      /* 信紙下方那行小字的高度 */

  const ink     = cssVar('--ink', '#2f2b26');
  const inkSoft = cssVar('--ink-soft', '#7c7267');
  const line    = cssVar('--line', 'rgba(47,43,38,.18)');
  const lineSoft= cssVar('--line-soft', 'rgba(47,43,38,.09)');
  const deep    = cssVar('--primary-deep', '#8e7748');
  const bg2     = cssVar('--bg2', '#f4f1ea');
  const serif   = '"Noto Serif TC", "Songti TC", "PingFang TC", "Microsoft JhengHei", serif';
  /* 內文的手寫字體，跟網頁上的 --font-hand 同一組 */
  const hand    = '"LXGW WenKai TC", "Klee One", "Kaiti TC", "KaiTi", "DFKai-SB", ' + serif;

  const textLeft = PAD + INNER;
  const textW    = W - textLeft * 2;

  const TITLE_F  = `500 42px ${serif}`;
  const TITLE_LH = 66;

  /* 先量字，才知道要不要把內文縮一級 —— canvas 開下去就不能改大小了 */
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = TITLE_F;
  const titleLines = wrapText(probe, b.title || `給 ${typed} 的一封信`, textW);

  /* 這一頁裡，內文可以用的高度：標題結束到署名開始之間 */
  const headH    = 132;                  /* 上方的 ── ✦ ── */
  const titleH   = titleLines.length * TITLE_LH + 54;
  const signH    = 170;                  /* 署名那一區 */
  const headBase = PAD + INNER + headH;  /* 花飾以下就是正文區 */
  const bodyMax  = (SAVE_H - PAD - FOOT - INNER - signH) - headBase - titleH;

  /* 內文從大到小試一輪，挑塞得進一頁的最大字級 */
  let bodySize = 18, bodyLH = 39, bodyLines = [];
  for(const size of [32, 30, 28, 26, 24, 22, 20, 18]){
    probe.font = `${size}px ${hand}`;
    bodySize  = size;
    bodyLH    = Math.round(size * 2.15);
    bodyLines = wrapText(probe, b.body || '', textW);
    if(bodyLines.length * bodyLH <= bodyMax) break;
  }
  const bodyH = bodyLines.length * bodyLH;

  /* 真的寫了一封超長的信時，寧可把畫布拉長也不要把字截掉 */
  const H = SAVE_H + Math.max(0, Math.ceil(bodyH - bodyMax));

  const sheetTop = PAD;
  const sheetH   = H - PAD - FOOT - sheetTop;

  /* 信短的時候整張紙會空一大片，把「花飾＋標題＋內文」整組往下挪一點，
     讓留白平均分在上下，不要全部堆在署名前面 */
  const slack   = Math.max(0, bodyMax - bodyH);
  const shift   = Math.min(Math.round(slack * 0.42), 320);
  const titleY0 = headBase + shift;
  const bodyTop = titleY0 + titleH;

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');

  /* 背景：和站台同一個底色，信紙浮在上面 */
  ctx.fillStyle = bg2;
  ctx.fillRect(0, 0, W, H);

  /* 信紙 */
  ctx.fillStyle = '#fffdf9';
  ctx.fillRect(PAD, sheetTop, W - PAD * 2, sheetH);
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.strokeRect(PAD + 1, sheetTop + 1, W - PAD * 2 - 2, sheetH - 2);
  ctx.strokeStyle = lineSoft;
  ctx.lineWidth = 2;
  ctx.strokeRect(PAD + 22, sheetTop + 22, W - PAD * 2 - 44, sheetH - 44);

  /* ── ✦ ── */
  let y = sheetTop + INNER + 56 + shift;
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 130, y); ctx.lineTo(W / 2 - 46, y);
  ctx.moveTo(W / 2 + 46, y);  ctx.lineTo(W / 2 + 130, y);
  ctx.stroke();
  ctx.fillStyle = deep;
  ctx.font = `26px ${serif}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✦', W / 2, y);

  /* 標題 */
  y = titleY0 + 30;
  ctx.fillStyle = ink;
  ctx.font = TITLE_F;
  ctx.textBaseline = 'alphabetic';
  titleLines.forEach(ln => { ctx.fillText(ln, W / 2, y); y += TITLE_LH; });

  /* 內文：手寫字體，不畫橫線（網頁上的信紙也拿掉了） */
  ctx.fillStyle = ink;
  ctx.font = `${bodySize}px ${hand}`;
  ctx.textAlign = 'left';
  bodyLines.forEach((ln, i) => {
    ctx.fillText(ln, textLeft, bodyTop + (i + 1) * bodyLH - Math.round(bodySize * 0.5));
  });

  /* 署名：貼著信紙的下緣，中間留白就是信紙該有的樣子 */
  const signY = sheetTop + sheetH - INNER - 46;
  ctx.textAlign = 'right';
  ctx.fillStyle = inkSoft;
  ctx.font = `19px ${serif}`;
  ctx.fillText('F R O M', W - textLeft, signY);
  ctx.fillStyle = ink;
  ctx.font = `500 31px ${serif}`;
  ctx.fillText(b.sign || (window.WED && window.WED.couple) || '', W - textLeft, signY + 46);

  /* 信紙外的一行小字：這是誰的婚禮 */
  const W_ = window.WED || {};
  const foot = [W_.couple, W_.date, (W_.hashtags && W_.hashtags[0]) || '']
    .filter(Boolean).join('・');
  ctx.textAlign = 'center';
  ctx.fillStyle = inkSoft;
  ctx.font = `21px ${serif}`;
  ctx.fillText(foot, W / 2, sheetTop + sheetH + 56);

  return cv;
}

/* 檔名維持純英數：中文檔名在部分手機下載器會被換成 "download" */
function saveFileName(){
  const slug = (window.SITE && window.SITE.slug) || 'wedding';
  return `letter-${slug}-${new Date().toISOString().slice(0, 10)}.jpg`;
}

async function saveLetterImage(){
  if(!openedLetter){ saveHint('先把信打開，再存下來'); return; }

  wlSaveBtn.disabled = true;
  saveHint('正在畫成圖片…');
  try{
    /* 字體還在下載時畫出來會變成系統預設字，等它載完再畫。
       中文字體是切成一段一段下載的，canvas 不會自己去要沒用到的那幾段，
       所以這裡先照著信的內容把手寫字體要用的字胚叫進來 */
    if(document.fonts){
      const txt = `${openedLetter.letter.title || ''}${openedLetter.letter.body || ''}`;
      try{ await document.fonts.load(`28px "LXGW WenKai TC"`, txt); }catch{}
      if(document.fonts.ready) await document.fonts.ready;
    }

    const cv = drawLetterCanvas(openedLetter.letter, openedLetter.typed);
    const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.92));
    if(!blob) throw new Error('toBlob failed');

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = saveFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    /* 立刻 revoke 會讓部分瀏覽器的下載半路斷掉，晚一點再收 */
    setTimeout(()=> URL.revokeObjectURL(url), 30000);
    saveHint('已存成 JPG，去相簿或下載資料夾看看');
  }catch(err){
    console.warn('[信] 存圖失敗', err);
    saveHint('這個瀏覽器存不了圖，可以改用手機截圖');
  }finally{
    wlSaveBtn.disabled = false;
  }
}

wlSaveBtn.addEventListener('click', saveLetterImage);

/* ============================================================
   資料進來後
============================================================ */
/* 從桌次頁的「有一封信在等你」點過來時會帶 ?name=，
   直接幫他把信打開，不用再打一次名字 */
const handoffName = new URLSearchParams(location.search).get('name');
let handoffDone = false;

document.addEventListener('data:blessings', ()=>{
  blessingsLoaded = true;
  const n = DataStore.getBlessings().length;
  if(!n){
    showMsg('新人還沒開始寫信，晚點再回來看看');
    document.getElementById('wlBtn').disabled = true;
    return;
  }
  document.getElementById('wlBtn').disabled = false;
  if(wlMsg.textContent.trim() === '正在把信拿出來…') showMsg('');

  if(handoffName && !handoffDone){
    handoffDone = true;
    wlInput.value = handoffName.slice(0, 40);
    document.getElementById('wlToName').textContent = wlInput.value;
    wlForm.requestSubmit();
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
