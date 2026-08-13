/* ============================================================
   quiz.js — 看你多了解我們（整頁式測驗）
   ------------------------------------------------------------
   一頁把所有題目排完，不再一題一張卡：
     ・單選：點了選項就自動捲到下一題（最後一題捲到送出鈕）
     ・複選：可以複選，全對才得分，不會自動跳題
     ・全部作答完才送得出去，送出後看到「分數」與每題的長條圖
       —— 長條是「其他人選了幾票」，你選的那格掛上「你」的標籤

   題目從哪裡來（先找到就用）：
     1. 新人在後台 /w/{slug}/admin「測驗」分頁設定的題目（Firestore `quiz`）
     2. js/quiz-defaults.js 裡的 QUIZ_DEFAULTS（還沒設定時的預設 3 題）
   新人不必自己作答：正確答案在後台就設好了，長條圖上只會出現「你」。

   作答紀錄寫進 `quizVotes`，key 是題目 id ——
   新人之後調順序或刪題目，舊票不會對到別題去。
============================================================ */
if(!requireUser()) { /* requireUser 已導向首頁 */ }

/* 結算文案：依正確率顯示不同訊息（從高到低判斷） */
const QUIZ_MSG = [
  {min:1.0, text:'全部命中，你是新人的頭號粉絲'},
  {min:0.8, text:'根本是新人本人吧'},
  {min:0.6, text:'超級了解這對新人'},
  {min:0.3, text:'還不錯，再多認識一點吧'},
  {min:0,   text:'沒關係，今天開始更認識這對新人'},
];

const cardEl        = document.getElementById('quizCard');
const SESSION_KEY   = `wed.${window.SITE.siteId}.quizSubmitted`;
const FALLBACK_WAIT = 6000;   /* 題目遲遲讀不到時，先用預設題目把畫面撐起來 */

let questions   = [];      /* 目前這份測驗的題目 */
let picks       = {};      /* 題目 id → 選了哪幾個選項（數字陣列） */
let myScore     = 0;
let ready       = false;   /* 第一份題目的 snapshot 到了沒 */
let renderedIds = '';      /* 目前畫面上是哪一組題目，用來判斷要不要重畫 */
let myVoteId    = null;    /* 我剛送出的那筆作答；還沒回來時先樂觀疊進長條圖 */
let pending     = false;

DataStore.subscribeQuiz();
DataStore.subscribeQuizVotes();

function letter(i){ return String.fromCharCode(65 + i); }   // 0→A, 1→B…

/* ============================================================
   題目
============================================================ */
/* 後台存的資料與預設題目走同一個正規化，畫面只認正規化後的形狀 */
function normalizeQuestion(raw, i){
  const type = raw.type === 'multi' ? 'multi' : 'single';
  const opts = [];
  for(let k = 0; k < QUIZ_LIMITS.OPT_COUNT; k++){
    opts.push(String((Array.isArray(raw.opts) ? raw.opts[k] : '') ?? '').trim());
  }
  const answer = (Array.isArray(raw.answer) ? raw.answer : [])
    .map(Number)
    .filter(n => Number.isInteger(n) && n >= 0 && n < QUIZ_LIMITS.OPT_COUNT);

  return {
    id:     String(raw.id || `q${i + 1}`),
    type,
    q:      String(raw.q || '').trim(),
    opts,
    answer: type === 'single' ? answer.slice(0, 1) : answer,
  };
}

/* 題目或選項沒填完的就跳過，畫面不要出現半題 */
function isUsable(it){
  return !!it.q && it.opts.every(Boolean) && it.answer.length > 0;
}

function loadQuestions(){
  const saved = DataStore.getQuiz().map(normalizeQuestion).filter(isUsable);
  if(saved.length) return saved.slice(0, QUIZ_LIMITS.MAX_QUESTIONS);
  return QUIZ_DEFAULTS
    .map((d, i) => normalizeQuestion({ ...d, id:`default-${i + 1}` }, i))
    .filter(isUsable);
}

function idsOf(list){ return list.map(q => q.id).join('|'); }

/* ============================================================
   作答狀態（同個 session 已送出 → 直接看結果）
============================================================ */
function savedVote(){
  const v = LS.get('quizLast', null);
  if(!v || typeof v !== 'object' || !v.picks) return null;
  /* 新人改過題目就當作沒作答過，重新來一次 */
  if(v.ids !== idsOf(questions)) return null;
  return v;
}

function hasSubmitted(){
  return sessionStorage.getItem(SESSION_KEY) === '1' && !!savedVote();
}

function pickedOf(id){ return Array.isArray(picks[id]) ? picks[id] : []; }

function answeredCount(){
  return questions.filter(it => pickedOf(it.id).length > 0).length;
}

function isRight(it){
  const mine = pickedOf(it.id).slice().sort((a, b) => a - b);
  const ans  = it.answer.slice().sort((a, b) => a - b);
  return mine.length === ans.length && mine.every((v, i) => v === ans[i]);
}

function scoreOf(){ return questions.filter(isRight).length; }

/* ============================================================
   畫面
============================================================ */
function render(){
  if(!ready){
    cardEl.innerHTML = `<div class="q-loading">題目載入中…</div>`;
    return;
  }
  questions = loadQuestions();
  renderedIds = idsOf(questions);

  if(!questions.length){
    cardEl.innerHTML = `<div class="q-loading">新人還沒出題，等一下再來玩吧</div>`;
    return;
  }
  if(hasSubmitted()){
    const v = savedVote();
    picks   = v.picks;
    myScore = Number(v.score) || 0;
    renderResult();
    return;
  }
  renderForm();
}

/* ---------- 作答（整頁式） ---------- */
function renderForm(){
  cardEl.innerHTML = `
    <p class="q-intro">
      單選題選完會自動跳到下一題，複選題要全對才得分。<br>
      全部作答完就可以送出，看看大家都選了什麼。
    </p>
    ${questions.map(questionHtml).join('')}
    <div class="q-foot" id="qFoot">
      <div class="q-foot-hint" id="qHint"></div>
      <button class="btn q-submit" id="qSubmit" type="button" disabled>送出，看結果</button>
    </div>`;

  /* 回到表單時把先前的選擇畫回去（例如按了「重新作答」） */
  questions.forEach((it, qi) => {
    pickedOf(it.id).forEach(oi => {
      const btn = optBtn(qi, oi);
      if(btn) btn.classList.add('sel');
    });
  });
  syncFoot();
}

function questionHtml(it, qi){
  const badge = it.type === 'multi' ? '複選・全對才得分' : '單選';
  return `
    <section class="q-block" data-qi="${qi}">
      <div class="q-head">
        <span class="q-num">${String(qi + 1).padStart(2, '0')}</span>
        <span class="q-type ${it.type}">${badge}</span>
      </div>
      <h3 class="q-text">${escapeHtml(it.q)}</h3>
      <div class="q-options">
        ${it.opts.map((o, oi) => `
          <button class="q-opt" type="button" data-qi="${qi}" data-oi="${oi}">
            <span class="q-opt-letter">${letter(oi)}</span>
            <span class="q-opt-text">${escapeHtml(o)}</span>
          </button>`).join('')}
      </div>
    </section>`;
}

function blockEl(qi){ return cardEl.querySelector(`.q-block[data-qi="${qi}"]`); }
function optBtn(qi, oi){
  return cardEl.querySelector(`.q-opt[data-qi="${qi}"][data-oi="${oi}"]`);
}

function syncFoot(){
  const hint   = document.getElementById('qHint');
  const submit = document.getElementById('qSubmit');
  if(!hint || !submit) return;
  const left = questions.length - answeredCount();
  hint.textContent = left
    ? `還有 ${left} 題沒作答`
    : `${questions.length} 題都作答完了`;
  submit.disabled = left > 0;
}

/* 捲到下一題：導覽列是固定的，位置要自己扣掉它的高度 */
function anchorTo(el){
  if(!el) return;
  const nav = document.getElementById('siteNav');
  const off = ((nav && !nav.hidden) ? nav.getBoundingClientRect().height : 0) + 20;
  const top = el.getBoundingClientRect().top + window.scrollY - off;
  window.scrollTo({ top: Math.max(0, top), behavior:'smooth' });
}

cardEl.addEventListener('click', (e)=>{
  const opt = e.target.closest('.q-opt');
  if(opt){ pickOption(+opt.dataset.qi, +opt.dataset.oi); return; }

  if(e.target.id === 'qSubmit'){ submit(); return; }

  if(e.target.id === 'qReset'){
    sessionStorage.removeItem(SESSION_KEY);
    picks = {};
    myScore = 0;
    myVoteId = null;
    renderForm();
    anchorTo(cardEl);
  }
});

function pickOption(qi, oi){
  const it = questions[qi];
  if(!it) return;

  if(it.type === 'multi'){
    const cur  = pickedOf(it.id);
    const next = cur.includes(oi) ? cur.filter(v => v !== oi) : cur.concat(oi);
    picks[it.id] = next.sort((a, b) => a - b);
    const btn = optBtn(qi, oi);
    if(btn) btn.classList.toggle('sel', next.includes(oi));
    syncFoot();
    return;
  }

  /* 單選：同一題只留一個選擇，選完自動跳下一題 */
  picks[it.id] = [oi];
  const block = blockEl(qi);
  if(block){
    block.querySelectorAll('.q-opt').forEach(b =>
      b.classList.toggle('sel', +b.dataset.oi === oi));
  }
  syncFoot();
  /* 等一下再捲，讓選中的動畫看得到 */
  setTimeout(()=> anchorTo(blockEl(qi + 1) || document.getElementById('qFoot')), 260);
}

async function submit(){
  if(pending || answeredCount() < questions.length) return;
  pending = true;

  myScore = scoreOf();
  const total = questions.length;
  LS.set('quizLast', { ids: idsOf(questions), picks, score: myScore, total, time: Date.now() });
  sessionStorage.setItem(SESSION_KEY, '1');

  renderResult();
  confettiRain();
  anchorTo(cardEl);

  try{
    const ref = await DataStore.addQuizVote({ picks, score: myScore, total });
    myVoteId = ref && ref.id;
    /* onSnapshot 可能比這行還早回來（那時候還不知道自己的 id），
       所以拿到 id 之後再畫一次，自己的票才不會被算成兩票 */
    if(cardEl.querySelector('.q-result-head')) renderResult();
  }catch(err){
    /* 存不進去也讓賓客看得到自己的成績，只是不會被算進大家的票 */
    console.warn('[quiz] 作答沒有存起來', err);
  }
  pending = false;
}

/* ---------- 結果（分數 + 長條圖） ---------- */
function votesForChart(){
  const all = DataStore.getQuizVotes();
  const mineArrived = myVoteId && all.some(v => v.id === myVoteId);
  const list = all.map(v => (v && typeof v.picks === 'object' && v.picks) ? v.picks : {});
  /* 剛送出、Firestore 還沒回 onSnapshot 時先把自己疊上去，
     長條才不會是「你選的那格 0 票」 */
  return mineArrived ? list : list.concat([picks]);
}

function renderResult(){
  const votes = votesForChart();
  const total = questions.length;
  const ratio = total ? myScore / total : 0;
  const msg   = (QUIZ_MSG.find(m => ratio >= m.min) || { text:'' }).text;

  cardEl.innerHTML = `
    <div class="q-result-head">
      <div class="q-score">${myScore} <small>／</small> ${total}</div>
      <div class="q-score-hint">${escapeHtml(msg)}</div>
      <div class="q-total-hint">目前 <b>${votes.length}</b> 人完成這份測驗</div>
    </div>
    <p class="q-legend">長條是大家的選擇，<b>✓</b> 是正確答案，<b>你</b> 是你選的那格</p>
    ${questions.map((it, qi) => chartHtml(it, qi, votes)).join('')}
    <button class="btn ghost small q-reset" id="qReset" type="button">重新作答</button>`;
}

function chartHtml(it, qi, votes){
  const counts = new Array(QUIZ_LIMITS.OPT_COUNT).fill(0);
  votes.forEach(v => {
    const arr = v[it.id];
    if(!Array.isArray(arr)) return;
    arr.forEach(n => { if(Number.isInteger(n) && n >= 0 && n < counts.length) counts[n]++; });
  });
  const max  = Math.max(...counts, 1);
  const mine = pickedOf(it.id);
  const right = isRight(it);

  const bars = it.opts.map((opt, oi) => {
    const isYou = mine.includes(oi);
    const isAns = it.answer.includes(oi);
    const cls   = `${isYou ? ' is-you' : ''}${isAns ? ' is-answer' : ''}`;
    return `
      <div class="q-bar-row${cls}">
        <span class="q-bar-letter">${isAns ? '✓' : letter(oi)}</span>
        <div class="q-bar-track">
          <div class="q-bar-fill" style="width:${counts[oi] / max * 100}%"></div>
          <span class="q-bar-label">${escapeHtml(opt)}</span>
          ${isYou ? '<span class="q-bar-badge">你</span>' : ''}
        </div>
        <span class="q-bar-count">${counts[oi]}</span>
      </div>`;
  }).join('');

  return `
    <div class="q-chart-q">
      <div class="q-head">
        <span class="q-num">${String(qi + 1).padStart(2, '0')}</span>
        <span class="q-verdict ${right ? 'ok' : 'no'}">${right ? '答對了' : '答錯了'}</span>
      </div>
      <div class="q-chart-title">${escapeHtml(it.q)}</div>
      <div class="q-bars">${bars}</div>
    </div>`;
}

/* ============================================================
   資料變動
============================================================ */
render();

document.addEventListener('data:quiz', ()=>{
  ready = true;
  /* 題目沒變就不要重畫，賓客正在作答的選擇才不會被清掉 */
  if(idsOf(loadQuestions()) === renderedIds && renderedIds) return;
  render();
});

/* 讀不到題目（規則或網路）就用預設題目，頁面不要空著 */
document.addEventListener('data:quiz:denied', ()=>{ ready = true; render(); });
setTimeout(()=>{ if(!ready){ ready = true; render(); } }, FALLBACK_WAIT);

document.addEventListener('data:quizVotes', ()=>{
  if(cardEl.querySelector('.q-result-head')) renderResult();
});
