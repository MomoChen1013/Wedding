/* ============================================================
   quiz.js — 你有多了解新人？ + 與新人的契合度
   ============================================================
   ▸ 主測驗題型
     ── 單選：{category:'簡單題', type:'single', q:'問題',
                opts:['A','B','C','D'], answer:0}
     ── 多選：{category:'小困難題', type:'multi', q:'問題',
                opts:[...], answer:[1,3]}（全對才得分）
     ── 開放：{category:'開放題', type:'open', q:'問題'}
                ・不計分，回答會寄到新人的悄悄話信箱

   ▸ category 會顯示在題目上方的徽章；換到新分類時會自動有 "新章節" 動畫

   ▸ 答案索引從 0 開始：第一個選項是 0
============================================================ */
if(!requireUser()) { /* requireUser 已導向首頁 */ }

/* ============================================================
   契合度題庫（只用於下方契合度區塊；不再自動併入主測驗）
   momoAnswer：0=A、1=B、2=C、3=D
============================================================ */
const COMPAT = [
  {
    emoji:'💰', title:'金錢觀',
    self:      '對你來說，錢最大的意義是？',
    aboutMomo: '你覺得對 Momo 來說，錢最大的意義是？',
    opts:[
      '安全感的來源，存款足夠我才安心',
      '我能力與成就的證明，越多越能肯定自己',
      '夠用就好，更在意能不能幫助別人或支持理念',
      '讓我體驗新事物、保有選擇與自由的工具',
    ],
    momoAnswer: 3,
  },
  {
    emoji:'🌱', title:'人生觀',
    self:      '你覺得「過得好的一生」最重要的是？',
    aboutMomo: '你覺得對 Momo 來說，「過得好的一生」最重要的是？',
    opts:[
      '不斷探索與嘗試，活得新鮮、有變化',
      '對他人或世界有正面影響，活得有意義',
      '達成目標、做出成績，留下屬於自己的成就',
      '安穩平順，少一點波折地把日子過好',
    ],
    momoAnswer: 0,
  },
  {
    emoji:'💗', title:'戀愛觀',
    self:      '一段感情裡你最看重的是？',
    aboutMomo: '你覺得對 Momo 來說，一段感情裡最看重的是？',
    opts:[
      '彼此扶持，願意無條件為對方著想',
      '穩定、忠誠、可以長久依靠',
      '對方欣賞我、讓我覺得自己更好、更有自信',
      '兩人能一起冒險、保持新鮮與成長',
    ],
    momoAnswer: 1,
  },
  {
    emoji:'🏠', title:'家庭觀',
    self:      '你心中理想的家庭是？',
    aboutMomo: '你覺得對 Momo 來說，理想的家庭是？',
    opts:[
      '重視傳統與和諧，凝聚、有秩序',
      '家人各有所成、彼此成長、為家庭爭光',
      '彼此包容照顧，把愛無條件給家人',
      '尊重每個人的獨立與自由，各自精彩',
    ],
    momoAnswer: 3,
  },
  {
    emoji:'💼', title:'職場觀',
    self:      '工作中最讓你有動力的是？',
    aboutMomo: '你覺得對 Momo 來說，工作中最有動力的是？',
    opts:[
      '升遷、被看見、證明自己的實力',
      '工作能幫助別人、對社會有貢獻',
      '能發揮創意、自由探索新做法',
      '穩定有保障、流程清楚可預期',
    ],
    momoAnswer: 2,
  },
];

/* ============================================================
   主測驗題庫（分三大類 + 開放題）
============================================================ */
const QUIZ = [
  /* ============ 簡單題 ============ */
  {category:'簡單題', type:'single', q:'Momo 的職業是？',
    opts:['工程師','UIUX／產品設計師','平面設計師','行銷企劃'], answer:1},
  {category:'簡單題', type:'single', q:'我最近在忙的大事？',
    opts:['準備換工作','做產品','籌備活動','以上皆是'], answer:3},
  {category:'簡單題', type:'single', q:'我手機桌布通常是？',
    opts:['我家貓咪','旅行風景','低調的男人照','朋友合照'], answer:2},
  {category:'簡單題', type:'single', q:'哪一個不會在我每日例行中？',
    opts:['吃保健食品','看劇','記帳','當鏟屎官'], answer:3},
  {category:'簡單題', type:'single', q:'我家貓咪最近很愛？',
    opts:['睡整天','討摸','亂翻東西','看著我工作'], answer:1},
  {category:'簡單題', type:'single', q:'我最近看的日劇是？',
    opts:['地獄占星師','最後的英雄','九條的大罪','逆轉球團'], answer:1},
  {category:'簡單題', type:'single', q:'我最愛的古裝劇是？',
    opts:['逐玉','慶餘年','蓮花樓','皓鑭傳'], answer:1},

  /* ============ 小困難題 ============ */
  {category:'小困難題', type:'single', q:'我壓力大時的放鬆方式？',
    opts:['運動（跑步、騎腳踏車）','做料理','安靜獨處看劇','到處找朋友聊天'], answer:1},
  {category:'小困難題', type:'multi', q:'Momo 沒學過下列哪些？答案有3項',
    opts: '射箭 騎馬 跆拳道 街舞 書法 素描 鋼琴 芭蕾 設計 拉花 甜點 羊毛氈 鉤針'.split(' '),
    answer:[2, 7, 12]},
  {category:'小困難題', type:'multi', q:'Momo 沒做過哪些事？答案有3項',
    opts: '開車 夜釣 參加遊行 露營 看鋼管秀 去音樂祭 攀岩 浮潛 搭小飛機 去雪山 穿旗袍 跑大隊接力 帶團出國'.split(' '),
    answer:[2, 5, 10]},
  {category:'小困難題', type:'single', q:'去過哪打工賺錢？',
    opts:['日本','澳洲','韓國','小琉球'], answer:1},

  /* ============ 困難題 ============ */
  {category:'困難題', type:'single', q:'我「沒有」過哪一個的夢想？',
    opts:['開一間店','養很多貓','環遊世界','在日本生活一段時間'], answer:1},
  {category:'困難題', type:'single', q:'我做決定最看重的是？',
    opts:['對未來有沒有幫助','自己的內心平安','會不會影響重要的人','是不是「對的事」'], answer:1},
  {category:'困難題', type:'single', q:'我最不想變成的樣子？',
    opts:['失去熱情、變得麻木','只看現實、放棄理想','對人冷漠','隨波逐流沒方向'], answer:0},
  {category:'困難題', type:'single', q:'如果我突然消沉，最可能因為？',
    opts:['工作／未來卡關','跟在乎的人有摩擦','覺得自己不夠好','太累沒休息'], answer:3},

  /* ============ 開放題（不計分；答案會寄到悄悄話信箱） ============ */
  {category:'開放題', type:'open', q:'你覺得我這一年最大的改變？'},
];

/* ============================================================
   結算文案：依正確率顯示不同訊息（從高到低判斷）
============================================================ */
const QUIZ_MSG = [
  {min:1.0,  text:'你是新人的頭號粉絲！💛'},
  {min:0.8,  text:'根本是新人本人吧 ✨'},
  {min:0.6,  text:'超級了解這對新人～ ♡'},
  {min:0.3,  text:'還不錯，再多認識一點吧！'},
  {min:0,    text:'沒關係，今天開始更認識這對新人 ♡'},
];

/* ============================================================
   以下為渲染與計分邏輯，編題不用動
============================================================ */
let qi = 0, qscore = 0;
const quizCard      = document.getElementById('quizCard');
const SCOREABLE_TOTAL = QUIZ.filter(q => q.type !== 'open').length;

function categoryBadge(item, isNew){
  return `<div class="q-cat-row">
    <span class="q-category${isNew ? ' is-new' : ''}">${escapeHtml(item.category || '')}</span>
  </div>`;
}

function renderQuiz(){
  if(qi >= QUIZ.length){ renderQuizResult(); return; }
  const item   = QUIZ[qi];
  const prev   = qi > 0 ? QUIZ[qi-1] : null;
  const isNew  = !prev || prev.category !== item.category;

  const dots = QUIZ.map((_,i)=>`<div class="q-dot ${i<qi?'done':''}"></div>`).join('');
  const cat  = categoryBadge(item, isNew);

  if(item.type === 'open'){ renderOpenQ(item, cat, dots); return; }

  const isMulti = item.type === 'multi';
  const opts = item.opts.map((o,i)=>`<button class="q-opt" data-i="${i}">${escapeHtml(o)}</button>`).join('');
  const badge = isMulti
    ? '<span class="q-type multi">多選・全對才得分</span>'
    : '<span class="q-type single">單選</span>';
  const submitBtn = isMulti
    ? '<button class="btn small q-submit" id="qSubmit">送出答案</button>'
    : '';

  quizCard.innerHTML = `
    ${cat}
    <div class="q-progress">${dots}</div>
    <div class="q-type-row">${badge}</div>
    <div class="q-text"><span class="q-num">Q${qi+1}.</span> ${escapeHtml(item.q)}</div>
    <div class="q-options ${isMulti ? 'multi' : ''}">${opts}</div>
    ${submitBtn}
  `;

  const optBtns = quizCard.querySelectorAll('.q-opt');

  if(isMulti){
    optBtns.forEach(btn => btn.addEventListener('click', ()=> btn.classList.toggle('sel')));
    document.getElementById('qSubmit').addEventListener('click', ()=> gradeMulti(item, optBtns));
  } else {
    optBtns.forEach(btn=>{
      btn.addEventListener('click', ()=> gradeSingle(item, optBtns, +btn.dataset.i));
    });
  }
}

/* 開放題：寫下文字 → 寄到 Momo 的悄悄話信箱 */
function renderOpenQ(item, cat, dots){
  quizCard.innerHTML = `
    ${cat}
    <div class="q-progress">${dots}</div>
    <div class="q-type-row"><span class="q-type open">開放題・寄到新人信箱 💌</span></div>
    <div class="q-text"><span class="q-num">Q${qi+1}.</span> ${escapeHtml(item.q)}</div>
    <div class="q-open">
      <textarea id="qOpenText" class="q-open-textarea" maxlength="500"
                placeholder="寫下你想說的話…（最多 500 字）"></textarea>
      <div class="q-open-foot">送出後會記錄到新人的悄悄話信箱～</div>
    </div>
    <div class="q-open-btns">
      <button class="btn ghost small q-open-skip" id="qOpenSkip">跳過</button>
      <button class="btn small q-submit" id="qOpenSubmit" disabled>送出 💌</button>
    </div>
  `;

  const ta  = document.getElementById('qOpenText');
  const btn = document.getElementById('qOpenSubmit');
  ta.addEventListener('input', ()=>{ btn.disabled = !ta.value.trim(); });

  document.getElementById('qOpenSkip').addEventListener('click', ()=>{ qi++; renderQuiz(); });

  btn.addEventListener('click', async ()=>{
    const text = ta.value.trim();
    if(!text) return;
    btn.disabled = true;
    try{
      await DataStore.addLetter({
        name: me_user.name,
        icon: me_user.icon,
        text: `【測驗開放題】${item.q}\n\n${text}`,
      });
      spawnFloat('💌', innerWidth/2, innerHeight*0.7);
    }catch(e){
      console.warn('開放題寄信失敗', e);
    }
    qi++; renderQuiz();
  });

  setTimeout(()=>ta.focus(), 80);
}

function gradeSingle(item, optBtns, picked){
  optBtns.forEach(b => b.style.pointerEvents = 'none');
  if(picked === item.answer){
    optBtns[picked].classList.add('correct');
    qscore++;
  } else {
    optBtns[picked].classList.add('wrong');
    optBtns[item.answer].classList.add('correct');
  }
  setTimeout(()=>{ qi++; renderQuiz(); }, 900);
}

function gradeMulti(item, optBtns){
  const picked  = [...optBtns].filter(b => b.classList.contains('sel'))
                              .map(b => +b.dataset.i).sort((a,b)=>a-b);
  const correct = [...item.answer].sort((a,b)=>a-b);
  const allRight = picked.length === correct.length &&
                   picked.every((v,i) => v === correct[i]);

  optBtns.forEach(b => b.style.pointerEvents = 'none');
  const submit = document.getElementById('qSubmit');
  if(submit) submit.style.display = 'none';

  optBtns.forEach((b, i)=>{
    const isAns   = item.answer.includes(i);
    const wasPick = b.classList.contains('sel');
    if(isAns)        b.classList.add('correct');
    else if(wasPick) b.classList.add('wrong');
  });

  if(allRight) qscore++;
  setTimeout(()=>{ qi++; renderQuiz(); }, 1600);
}

function renderQuizResult(){
  const total = SCOREABLE_TOTAL;
  const ratio = total ? qscore / total : 0;
  const msg   = (QUIZ_MSG.find(m => ratio >= m.min) || {text:''}).text;

  quizCard.innerHTML = `
    <div class="q-result">
      <div class="big">${qscore}/${total}</div>
      <div class="msg">${msg}</div>
      <button class="btn small" id="quizAgain">再玩一次</button>
    </div>`;
  confettiRain();
  document.getElementById('quizAgain').addEventListener('click', ()=>{
    qi = 0; qscore = 0; renderQuiz();
  });
}

renderQuiz();

/* ============================================================
   與 Momo 的契合度（5 題 + 長條圖）
============================================================ */
const MOMO_COMPAT_ANSWERS = COMPAT.map(c => c.momoAnswer);
const SESSION_COMPAT_KEY  = 'momo.compatSubmitted';
let compatPicks = new Array(COMPAT.length).fill(null);
/* 本次 session 剛送出、但 Firestore 還沒回 onSnapshot 時，
   先把自己的答案疊進長條圖，避免「你的格 0 票、Momo 的格 0 票」的空圖。
   data:compat 事件回來後會清掉這個 flag、再重畫一次。 */
let compatJustSubmitted = false;

function letter(i){ return String.fromCharCode(65 + i); }   // 0→A, 1→B…

/* 判斷 saved 是不是合法的 picks 陣列（5 個 0–3 的整數） */
function isValidPicks(arr){
  return Array.isArray(arr) && arr.length === COMPAT.length &&
    arr.every(v => Number.isInteger(v) && v >= 0 && v < 4);
}
/* 判斷 all 裡有沒有跟我的 picks 完全一樣的紀錄 */
function dataContainsMyPicks(all){
  return all.some(entry =>
    Array.isArray(entry) && entry.length === compatPicks.length &&
    entry.every((v, i) => v === compatPicks[i]));
}

function renderCompat(){
  const card = document.getElementById('compatCard');
  if(!card) return;

  // 同個 session 已作答 → 直接看結果
  if(sessionStorage.getItem(SESSION_COMPAT_KEY) === '1'){
    const saved = LS.get('compatLast', null);
    if(isValidPicks(saved)){
      compatPicks = saved;
      renderCompatChart(card);
      return;
    }
    /* 儲存的 picks 不合法 → 清掉、回到表單 */
    sessionStorage.removeItem(SESSION_COMPAT_KEY);
  }
  renderCompatForm(card);
}

function renderCompatForm(card){
  card.innerHTML = `
    <p class="compat-intro">與新人的契合度，看看你的價值觀和新人多接近 <br>✦<br>
      </p>
    ${COMPAT.map((c, qi) => `
      <div class="compat-q" data-qi="${qi}">
        <div class="compat-q-title">
          <span class="em">${c.emoji}</span> ${escapeHtml(c.title)}
        </div>
        <div class="compat-q-text">${escapeHtml(c.self)}</div>
        <div class="compat-opts">
          ${c.opts.map((opt, oi) => `
            <button class="compat-opt" data-qi="${qi}" data-oi="${oi}">
              <span class="ltr">${letter(oi)}.</span>
              <span>${escapeHtml(opt)}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `).join('')}
    <button class="btn compat-submit" id="compatSubmit" disabled>送出 → 看結果</button>
  `;

  card.querySelectorAll('.compat-opt').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const qi = +btn.dataset.qi, oi = +btn.dataset.oi;
      compatPicks[qi] = oi;
      card.querySelectorAll(`.compat-opt[data-qi="${qi}"]`)
          .forEach(b => b.classList.toggle('sel', b === btn));
      document.getElementById('compatSubmit').disabled =
        compatPicks.some(p => p === null);
    });
  });

  document.getElementById('compatSubmit').addEventListener('click', ()=>{
    if(compatPicks.some(p => p === null)) return;
    DataStore.addCompat([...compatPicks]);             // async；不 await
    LS.set('compatLast', [...compatPicks]);
    sessionStorage.setItem(SESSION_COMPAT_KEY, '1');
    compatJustSubmitted = true;                        // 樂觀疊圖，避免空 bar
    renderCompatChart(card);
    confettiRain();
  });
}

function renderCompatChart(card){
  let all = DataStore.getCompat();
  /* 剛送出但 Firestore 還沒回時，把自己的 picks 暫時疊上，bar 才不會是空的；
     真資料如果已經有我的紀錄就不疊，避免雙重計算 */
  if(compatJustSubmitted && !dataContainsMyPicks(all)){
    all = all.concat([compatPicks]);
  }
  const total   = all.length;
  const matches = compatPicks.reduce(
    (acc, pick, i) => acc + (pick === MOMO_COMPAT_ANSWERS[i] ? 1 : 0), 0);

  const chartHtml = COMPAT.map((c, qi) => {
    const counts = [0, 0, 0, 0];
    all.forEach(entry => {
      const v = entry[qi];
      if(typeof v === 'number' && v >= 0 && v < 4) counts[v]++;
    });
    const max = Math.max(...counts, 1);

    const bars = c.opts.map((opt, oi) => {
      const cnt   = counts[oi];
      const pct   = cnt / max * 100;
      const isYou  = compatPicks[qi] === oi;
      const isMomo = MOMO_COMPAT_ANSWERS[qi] === oi;
      let cls = '';
      if(isYou && isMomo) cls = 'match';
      else if(isYou)      cls = 'you';
      else if(isMomo)     cls = 'momo';
      const badges =
        (isYou && isMomo) ? '<span class="badge match">⭐ 你+新人</span>' :
        isYou             ? '<span class="badge you">你</span>' :
        isMomo            ? '<span class="badge momo">⭐ 新人</span>' : '';

      return `
        <div class="compat-bar-row ${cls}" title="${escapeHtml(opt)}">
          <span class="compat-bar-letter">${letter(oi)}</span>
          <div class="compat-bar-track">
            <div class="compat-bar-fill" style="width:${pct}%"></div>
            <span class="compat-bar-badges">${badges}</span>
          </div>
          <span class="compat-bar-count">${cnt}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="compat-chart-q">
        <div class="compat-chart-title">
          <span class="em">${c.emoji}</span> ${escapeHtml(c.title)}
        </div>
        <div class="compat-chart-q-text">${escapeHtml(c.self)}</div>
        <div class="compat-bars">${bars}</div>
      </div>
    `;
  }).join('');

  /* 新人專屬：清空所有票數的按鈕（網址加 WED.ownerKey 才出現） */
  const wipeBtn = (typeof isOwnerVisitor === 'function' && isOwnerVisitor())
    ? `<button class="btn ghost small compat-wipe" id="compatWipe">🗑 清空所有票數（新人專用）</button>`
    : '';

  card.innerHTML = `
    <div class="compat-result-head">
      <div class="compat-score">${matches} <small>／</small> ${COMPAT.length}</div>
      <div class="compat-score-hint">與新人的答案一致 ✨</div>
      <div class="compat-total-hint">目前 <b>${total}</b> 人完成這個調查</div>
    </div>
    ${chartHtml}
    <button class="btn ghost small compat-reset" id="compatReset">重新作答</button>
    ${wipeBtn}
  `;

  document.getElementById('compatReset').addEventListener('click', ()=>{
    sessionStorage.removeItem(SESSION_COMPAT_KEY);
    compatPicks = new Array(COMPAT.length).fill(null);
    compatJustSubmitted = false;
    renderCompatForm(card);
    /* 用 viewport 座標，比 offsetTop 穩定（offsetTop 依 offset parent） */
    const top = card.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({top, behavior:'smooth'});
  });

  /* 新人專用：清空整個 compat collection */
  const wipeEl = document.getElementById('compatWipe');
  if(wipeEl){
    wipeEl.addEventListener('click', async ()=>{
      if(!confirm('確定要清空所有人的契合度作答？\n（無法復原；自己的本地紀錄也會一併清掉）')) return;
      wipeEl.disabled = true;
      wipeEl.textContent = '清空中…';
      try{
        const n = await DataStore.wipeCollection('compat');
        sessionStorage.removeItem(SESSION_COMPAT_KEY);
        localStorage.removeItem('momo.compatLast');
        compatPicks = new Array(COMPAT.length).fill(null);
        compatJustSubmitted = false;
        alert(`已清空 ${n} 筆契合度作答 ✨`);
        renderCompatForm(card);
      }catch(e){
        console.error('[wipeCompat]', e);
        alert('清空失敗：' + (e.message || e) + '\n（檢查 Firestore Rules 是否允許新人刪除）');
        wipeEl.disabled = false;
        wipeEl.textContent = '🗑 清空所有票數（新人專用）';
      }
    });
  }
}

renderCompat();

/* ============================================================
   左右轉箭頭：作答中不顯示，捲到契合度或結算才出現
   （quizCard 在視窗內 + 還沒做完主測驗 → 藏；其他狀況 → 顯示）
============================================================ */
const turnNavEls = document.querySelectorAll('.turn-nav');
function updateTurnNav(){
  if(!turnNavEls.length) return;
  const r = quizCard.getBoundingClientRect();
  const quizInView = r.bottom > 80 && r.top < window.innerHeight * 0.6;
  const stillAnswering = qi < QUIZ.length;
  const show = !(stillAnswering && quizInView);
  turnNavEls.forEach(el => el.classList.toggle('show', show));
}
addEventListener('scroll', updateTurnNav, {passive:true});
addEventListener('resize', updateTurnNav);
/* 每次 renderQuiz/renderQuizResult 切換完也要更新一次 */
const _origRenderQuiz       = renderQuiz;
const _origRenderQuizResult = renderQuizResult;
renderQuiz       = function(){ _origRenderQuiz();       updateTurnNav(); };
renderQuizResult = function(){ _origRenderQuizResult(); updateTurnNav(); };
updateTurnNav();

/* Firestore 端資料變動時，若我剛送的那筆已經進來就清掉樂觀 flag，
   並且如果目前顯示的是長條圖就重畫 */
document.addEventListener('data:compat', ()=>{
  if(compatJustSubmitted && dataContainsMyPicks(DataStore.getCompat())){
    compatJustSubmitted = false;
  }
  const card = document.getElementById('compatCard');
  if(card && sessionStorage.getItem(SESSION_COMPAT_KEY) === '1'){
    renderCompatChart(card);
  }
});
