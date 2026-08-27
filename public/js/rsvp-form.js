/* ============================================================
   rsvp-form.js — 出席回覆表單
   ------------------------------------------------------------
   出席回覆只有一頁（/w/{slug}/invitation），但表單獨立成一支檔案：
   HTML 只放一個 <div id="rsvpFormHost">，其餘由這裡產生。
   題目會依新人在後台的設定增減，寫死在 HTML 裡就做不到。

   這支檔案是「一般 script」（不是 module），由頁面 HTML 直接載入，
   載入當下只定義函式，等頁面 JS 呼叫 RSVPForm.mount() 才動到畫面 ——
   因為 window.SITE / DataStore 要等 site-context.js 準備好才有。

   選項的文字集中在 common.js 的 RSVP_OPTIONS，
   後台儀表板讀的是同一份，圖表標籤才不會和表單對不起來。
   哪些題目要問則由 common.js 的 rsvpConfig() 決定。
============================================================ */
(function () {
  /* 郵遞區號：台灣 3 碼或 3+2 碼，這裡放寬到 3–6 位數字 */
  const ZIP_RE = /^\d{3,6}$/;
  /* Email 只做基本形狀檢查：擋掉明顯打錯的，不做 RFC 等級的驗證
     （太嚴格會誤擋真實信箱，真正的驗證只有寄一封信才做得到） */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const MAX = {
    name: 40, diet: 300, message: 300, note: 300, address: 200, zip: 10,
    phone: 30, line: 60, email: 120, guest: 10, child: 10,
  };

  function opts(key) {
    return (window.RSVP_OPTIONS && window.RSVP_OPTIONS[key]) || [];
  }

  function esc(s) {
    return typeof escapeHtml === 'function'
      ? escapeHtml(s)
      : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* 一排選項按鈕；size='sm' 是比較窄的那種 */
  function choiceRow(id, key, size) {
    const cls = size === 'sm' ? 'choice sm' : 'choice';
    return `<div class="choice-row" id="${id}">${
      opts(key).map(([val, label]) =>
        `<button type="button" class="${cls}" data-val="${esc(val)}">${esc(label)}</button>`
      ).join('')
    }</div>`;
  }

  function stepper(id, unit) {
    return `<div class="stepper">
      <button type="button" class="st-btn" id="${id}Minus" aria-label="減少一${unit}">−</button>
      <span class="st-num" id="${id}Num">0</span>
      <button type="button" class="st-btn" id="${id}Plus" aria-label="增加一${unit}">＋</button>
      <span class="st-unit">${unit}</span>
    </div>`;
  }

  /* 「同上」勾選框：勾了就把上面填過的值帶下來，欄位轉成唯讀
     （不是隱藏 —— 賓客要看得到自己帶了什麼下來） */
  function sameAs(id, label) {
    return `<label class="rf-check rf-check-sm" id="${id}Wrap" hidden>
      <input type="checkbox" id="${id}">
      <span>${esc(label)}</span>
    </label>`;
  }

  /* 郵寄地址：郵遞區號 + 地址，兩個欄位一組 */
  function addressBox(id, zipId, addrId) {
    return `<div class="rf-addr" id="${id}" hidden>
      <div class="field rf-zip">
        <input type="text" id="${zipId}" inputmode="numeric" maxlength="${MAX.zip}"
               placeholder="郵遞區號" autocomplete="postal-code">
      </div>
      <div class="field">
        <input type="text" id="${addrId}" maxlength="${MAX.address}"
               placeholder="收件地址" autocomplete="street-address">
      </div>
    </div>`;
  }

  /* 聯絡方式：新人選了哪幾種就問哪幾種，賓客至少要填一種 */
  const CONTACT_FIELDS = {
    phone: { id: 'rPhone', type: 'tel',   max: MAX.phone, ac: 'tel',
             placeholder: '0912-345-678' },
    line:  { id: 'rLine',  type: 'text',  max: MAX.line,  ac: 'off',
             placeholder: 'LINE ID' },
    email: { id: 'rEmail', type: 'email', max: MAX.email, ac: 'email',
             placeholder: 'name@example.com' },
  };

  function contactBlock(contacts) {
    if (!contacts.length) return '';
    const rows = contacts.map((key) => {
      const f = CONTACT_FIELDS[key];
      const label = opts('contact').find(([k]) => k === key)?.[1] || key;
      return `<div class="rf-contact">
        <span class="rf-contact-name">${esc(label)}</span>
        <div class="field">
          <input type="${f.type}" id="${f.id}" maxlength="${f.max}"
                 autocomplete="${f.ac}" placeholder="${esc(f.placeholder)}">
        </div>
      </div>`;
    }).join('');

    return `
    <label class="rf-label">聯絡方式<i class="rf-req">至少填一種</i></label>
    <div class="rf-contacts">${rows}</div>
    <div class="rf-hint">婚禮前有事要通知你時，我們會用這裡的資料聯絡</div>`;
  }

  /* ============================================================
     多活動的活動卡
     ------------------------------------------------------------
     只有「兩個以上需要回覆的活動」才走這一段。
     一場婚宴的站台走的還是下面那份原本的表單，一個字都沒改 ——
     這是整個改版的第一原則，靠 mount() 開頭那一行分岔保證。

     一張卡回答一件事：「這一場你來不來」。
     選了會參加才展開人數、葷素那些細節（和原本表單的
     detailBox 同一個機制，賓客不用學新的互動）。
  ============================================================ */

  /* 活動多的時候，答完的卡片收成一行 —— 五個活動全部攤開，
     手機要滑很久才走得到送出。兩個以下不收：那時候頁面本來就短，
     收起來反而多一個「要再點開」的動作。 */
  const FOLD_FROM = 3;
  /* 四個以上才給進度提示與「全部參加」；更少的時候那兩樣都是噪音 */
  const HINT_FROM = 4;

  function evWhenLine(ev){
    const w = eventWhen(ev);
    return [w.md ? w.md.replace('/', ' / ') : '', w.wdEn, w.range]
      .filter(Boolean).join('　');
  }

  /* 這個活動要問的細節。全部關掉時整塊不出現 —— 證婚通常就是這樣，
     只問「來不來」，卡片短短一張，一眼看完。 */
  function evDetailHtml(ev){
    const p = `ev_${ev.id}_`;
    const bits = [];

    if(ev.askCount){
      bits.push(`<label class="rf-label">包含你，共幾位出席？</label>
        ${stepper(p + 'head', '位')}`);
    }
    if(ev.askMeal){
      bits.push(`<label class="rf-label">餐點分配 <small>（依出席人數分配）</small></label>
      <div class="rf-split">
        <div class="rf-split-item">
          <span class="rf-split-name">葷食</span>${stepper(p + 'meat', '位')}
        </div>
        <div class="rf-split-item">
          <span class="rf-split-name">素食</span>${stepper(p + 'veg', '位')}
        </div>
      </div>
      <div class="rf-hint" id="${p}mealHint"></div>`);
    }
    if(ev.askChildSeat){
      bits.push(`<label class="rf-label">兒童座椅</label>
      <label class="rf-check">
        <input type="checkbox" id="${p}childOn"><span>需要兒童座椅</span>
      </label>
      <div class="rf-sub" id="${p}childBox" hidden>${stepper(p + 'child', '張')}</div>`);
    }
    if(ev.askDiet){
      bits.push(`<label class="rf-label" for="${p}diet">飲食習慣補充 <small>（選填）</small></label>
      <div class="field">
        <input type="text" id="${p}diet" maxlength="${MAX.diet}"
               placeholder="例：不吃牛、海鮮過敏、孕婦餐">
      </div>`);
    }

    /* 這個活動自己的追加題目（後台每個活動最多 3 題，一律選填） */
    ev.questions.forEach(q => {
      const qid = `${p}q_${q.id}`;
      if(q.kind === 'text'){
        bits.push(`<label class="rf-label" for="${qid}">${esc(q.label)} <small>（選填）</small></label>
        <div class="field">
          <input type="text" id="${qid}" maxlength="${MAX.note}"
                 placeholder="${esc(q.hint || '')}">
        </div>`);
        return;
      }
      bits.push(`<label class="rf-label">${esc(q.label)} <small>（選填）</small></label>
      <div class="choice-row" id="${qid}" data-ev-q="${esc(q.id)}">${
        q.opts.map(o =>
          `<button type="button" class="choice sm" data-val="${esc(o.id)}">${esc(o.label)}</button>`
        ).join('')}</div>`);
    });

    if(!bits.length) return '';
    return `<div class="ev-detail" id="${p}detail" hidden>${bits.join('\n')}</div>`;
  }

  function evCardHtml(ev){
    const map = eventMapUrl(ev);
    const addr = ev.address && ev.address !== ev.venueName ? ev.address : '';
    return `
    <article class="ev-card" data-ev="${esc(ev.id)}">
      <button type="button" class="ev-fold" data-ev-unfold>
        <span class="ev-fold-name">${esc(ev.name)}</span>
        <span class="ev-fold-ans" data-ev-ans></span>
        <span class="ev-fold-edit">修改</span>
      </button>

      <div class="ev-body">
        <div class="ev-head">
          ${ev.nameEn ? `<div class="ev-kicker">${esc(ev.nameEn)}</div>` : ''}
          <h3 class="ev-name">${esc(ev.name)}</h3>
          ${evWhenLine(ev) ? `<div class="ev-when">${esc(evWhenLine(ev))}</div>` : ''}
          ${ev.venueName ? `<div class="ev-venue">${esc(ev.venueName)}</div>` : ''}
          ${addr ? `<div class="ev-addr">${esc(addr)}</div>` : ''}
          ${ev.desc ? `<div class="ev-desc">${esc(ev.desc)}</div>` : ''}
          ${map ? `<a class="ev-map" href="${esc(map)}" target="_blank"
                      rel="noopener noreferrer">查看地圖 →</a>` : ''}
        </div>

        <div class="ev-ask">
          <label class="rf-label">你會參加嗎？<i class="rf-req">必填</i></label>
          <div class="choice-row ev-choice">
            <button type="button" class="choice" data-ev-go="yes">會參加</button>
            <button type="button" class="choice" data-ev-go="no">無法參加</button>
          </div>
          ${evDetailHtml(ev)}
          <div class="ev-err" data-ev-err></div>
        </div>
      </div>
    </article>`;
  }

  function eventsHtml(evs){
    const many = evs.length >= HINT_FROM;
    return `
    <p class="inv-lead ev-lead">請依照你的安排，告訴我們哪些活動可以與我們一起參與。</p>
    ${many ? `<div class="ev-bar">
      <span class="ev-progress" id="evProgress"></span>
      <button type="button" class="ev-allyes" id="evAllYes">全部參加</button>
    </div>` : ''}
    <section class="rsvp-events" id="rsvpEvents">${evs.map(evCardHtml).join('')}</section>
    <div class="ev-sep"><span>你的資料</span></div>`;
  }

  function formHtml(cfg, evs) {
    const hasEmail = cfg.contacts.includes('email');
    /* 兩個以上要回覆的活動才長出活動卡；一場的話下面全部照舊 */
    const multi = evs.length > 1;

    /* 標籤：新人在後台勾了「當表單選項」的那幾個才會出現在這裡。
       賓客只能選一個（後台可以再幫同一位賓客加掛別的標籤），
       而且是選填 —— 對不上的人硬要選一個反而更難排座位。 */
    const tagBlock = !cfg.tagOptions.length ? '' : `
    <label class="rf-label">更具體是哪一種？ <small>（選填）</small></label>
    <div class="choice-row" id="tagRow">${cfg.tagOptions.map((t) =>
      `<button type="button" class="choice sm" data-val="${esc(t.id)}">${esc(t.name)}</button>`
    ).join('')}</div>
    <div class="rf-hint">選一個最接近的就好，方便我們安排座位；選錯再點一次可以取消</div>`;

    /* 喜帖：紙本要問怎麼給、郵寄要問地址；電子要問寄到哪個 Email */
    const cardBlock = !cfg.askCard ? '' : `
    <label class="rf-label">喜帖發送方式<i class="rf-req">必填</i></label>
    ${choiceRow('cardRow', 'card', 'sm')}
    <div class="rf-sub" id="cardPaperBox" hidden>
      <label class="rf-label rf-label-sub">紙本喜帖要怎麼給你？</label>
      ${choiceRow('cardDeliveryRow', 'cardDelivery', 'sm')}
      ${addressBox('cardAddrBox', 'rCardZip', 'rCardAddr')}
    </div>
    <div class="rf-sub" id="cardDigitalBox" hidden>
      <label class="rf-label rf-label-sub" for="rCardEmail">電子喜帖要寄到哪個 Email？</label>
      ${hasEmail ? sameAs('cardEmailSame', '同上（與聯絡方式的 Email 相同）') : ''}
      <div class="field">
        <input type="email" id="rCardEmail" maxlength="${MAX.email}"
               autocomplete="email" placeholder="name@example.com">
      </div>
    </div>`;

    /* 喜餅：郵寄要問地址，可以直接沿用喜帖的地址 */
    const giftBlock = !cfg.askGift ? '' : `
    <label class="rf-label">喜餅領取方式<i class="rf-req">必填</i></label>
    ${choiceRow('giftRow', 'gift', 'sm')}
    <div class="rf-sub" id="giftMailBox" hidden>
      ${cfg.askCard ? sameAs('giftAddrSame', '同上（與喜帖的郵寄地址相同）') : ''}
      ${addressBox('giftAddrBox', 'rGiftZip', 'rGiftAddr')}
    </div>`;

    const messageBlock = !cfg.askMessage ? '' : `
    <label class="rf-label" for="rNote">想對新人說的話 <small>（選填）</small></label>
    <div class="field">
      <textarea id="rNote" maxlength="${MAX.message}" placeholder="給 {{couple}} 的悄悄話…"></textarea>
    </div>`;

    /* 多活動時「能來參加嗎」變成每張活動卡上的按鈕，這裡就不再問一次 */
    const attendBlock = multi ? '' : `
    <label class="rf-label">能來參加嗎？<i class="rf-req">必填</i></label>
    ${choiceRow('attendRow', 'attend')}`;

    /* 人數、葷素、兒童椅、飲食也一樣，多活動時掛在各自的活動卡上 */
    const detailBlock = multi ? '' : `
    <!-- 以下只有「熱情出席」才要填 -->
    <div class="rf-detail" id="detailBox" hidden>

      <label class="rf-label">包含你，共幾位出席？</label>
      ${stepper('head', '位')}

      <label class="rf-label">餐點分配 <small>（依出席人數分配）</small></label>
      <div class="rf-split">
        <div class="rf-split-item">
          <span class="rf-split-name">葷食</span>
          ${stepper('meat', '位')}
        </div>
        <div class="rf-split-item">
          <span class="rf-split-name">素食</span>
          ${stepper('veg', '位')}
        </div>
      </div>
      <div class="rf-hint" id="mealHint"></div>

      <label class="rf-label">兒童座椅</label>
      <label class="rf-check">
        <input type="checkbox" id="childSeatOn">
        <span>需要兒童座椅</span>
      </label>
      <div class="rf-sub" id="childSeatBox" hidden>
        ${stepper('child', '張')}
      </div>

      <label class="rf-label" for="rDiet">飲食習慣補充 <small>（選填）</small></label>
      <div class="field">
        <input type="text" id="rDiet" maxlength="${MAX.diet}"
               placeholder="例：不吃牛、海鮮過敏、孕婦餐">
      </div>
    </div>`;

    return `
<div class="cardbox rf-card" id="formCard">
  <div class="section-title">你的出席回覆</div>
  <form id="rsvpForm" novalidate>
${multi ? eventsHtml(evs) : ''}
    <label class="rf-label" for="rName">怎麼稱呼你？<i class="rf-req">必填</i></label>
    <div class="field">
      <input type="text" id="rName" maxlength="${MAX.name}" autocomplete="name"
             placeholder="輸入你的名字">
    </div>
${attendBlock}
    <label class="rf-label">與新人的關係<i class="rf-req">必填</i></label>
    ${choiceRow('relationRow', 'relation', 'sm')}
${tagBlock}

    ${contactBlock(cfg.contacts)}
${detailBlock}
${cardBlock}
${giftBlock}
${messageBlock}
    <label class="rf-label" for="rMemo">其他備註 <small>（選填）</small></label>
    <div class="field">
      <textarea id="rMemo" maxlength="${MAX.note}" placeholder="還有什麼想讓我們知道的嗎？"></textarea>
    </div>

    <!-- honeypot：只有機器人會填。填了就照樣顯示成功，但不寫入資料庫 -->
    <div class="rf-hp" aria-hidden="true">
      <label for="rWebsite">請留空</label>
      <input type="text" id="rWebsite" tabindex="-1" autocomplete="off">
    </div>

    <div class="rf-err" id="rErr" role="status" aria-live="polite">&nbsp;</div>
    <button type="submit" class="btn" id="submitBtn">送出回覆</button>
  </form>
</div>

<div class="cardbox thanks-card" id="thanksCard" hidden>
  <h3 id="tkTitle">收到你的回覆囉</h3>
  <p id="tkMsg">謝謝你，我們超期待與你相見</p>
  <!-- 多活動時逐條列出每一場的答案（單一活動不會出現這一塊） -->
  <ul class="tk-events" id="tkEvents" hidden></ul>
  <button type="button" class="btn ghost small" id="editBtn">修改我的回覆</button>
</div>

<p class="rf-closed" id="rsvpClosed" hidden></p>`;
  }

  /* ---------- 還能不能回覆 ----------
     規則層本來就會擋（rsvpEnabled / rsvpDeadline），
     這裡先擋一次，賓客才不會填完一長串才被拒絕。 */
  function closedReason() {
    const site = (window.SITE && window.SITE.data) || {};
    if (site.rsvpEnabled !== true) {
      return '這場婚禮的線上回覆尚未開放，請直接與新人聯繫';
    }
    const dl = site.rsvpDeadline;
    const at = dl && typeof dl.toDate === 'function' ? dl.toDate().getTime() : null;
    if (at && Date.now() > at) {
      return '回覆時間已經截止了，若仍想出席請直接與新人聯繫';
    }
    return null;
  }

  function mount(options) {
    const opt = options || {};
    const host = typeof opt.host === 'string' ? document.getElementById(opt.host) : opt.host;
    if (!host) return null;

    const cfg = rsvpConfig();
    /* ★ 整個改版的第一原則就在這一行：
       只有「兩個以上需要回覆的活動」才長出活動卡。
       一場婚宴的站台（＝目前全部）走的是原本那份表單，一個字都沒改。 */
    const evs = rsvpEvents();
    const multi = evs.length > 1;
    host.innerHTML = formHtml(cfg, evs);
    if (typeof fillTemplates === 'function') fillTemplates(host);

    const $ = (id) => document.getElementById(id);
    const formCard = $('formCard');
    const thanks = $('thanksCard');
    const closed = $('rsvpClosed');
    const errEl = $('rErr');

    /* 回覆已關閉／已截止：表單整塊收起來，只留一句說明 */
    const reason = closedReason();
    if (reason) {
      formCard.hidden = true;
      closed.hidden = false;
      closed.textContent = reason;
      return { closed: true };
    }

    /* ---------- 狀態 ---------- */
    const state = {
      attending: null,      // 'yes' | 'no' | 'maybe'
      relation: null,       // groom | bride | both | other
      tag: null,            // 新人開放的標籤 id（單選、選填）
      head: 1,
      veg: 0,               // 葷食人數 = head - veg
      childSeat: 0,
      card: null,           // paper | digital | none
      cardDelivery: null,   // pickup | mail
      gift: null,           // pickup | mail
    };

    /* ---------- 選項 chip ---------- */
    function pick(rowId, val) {
      const row = $(rowId);
      if (!row) return;
      row.querySelectorAll('.choice').forEach((b) =>
        b.classList.toggle('on', b.dataset.val === val));
    }

    function wireRow(rowId, onPick) {
      const row = $(rowId);
      if (!row) return;
      row.addEventListener('click', (e) => {
        const btn = e.target.closest('.choice');
        if (!btn) return;
        pick(rowId, btn.dataset.val);
        onPick(btn.dataset.val);
        clearErr();
      });
    }

    /* ---------- 數量 stepper ---------- */
    function wireStepper(id, onDelta) {
      $(id + 'Minus').addEventListener('click', () => onDelta(-1));
      $(id + 'Plus').addEventListener('click', () => onDelta(1));
    }

    function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

    /* 葷素兩格永遠加起來等於出席人數 —— 改一邊，另一邊跟著動，
       賓客才不會分配出一個和人數對不上的組合 */
    function syncCounts() {
      if(multi) return;      /* 多活動時人數在各張活動卡上，這裡沒有東西可以同步 */
      state.head = clamp(state.head, 1, MAX.guest);
      state.veg = clamp(state.veg, 0, state.head);
      state.childSeat = clamp(state.childSeat, 0, state.head);
      const meat = state.head - state.veg;

      $('headNum').textContent = state.head;
      $('meatNum').textContent = meat;
      $('vegNum').textContent = state.veg;
      $('childNum').textContent = state.childSeat;
      $('mealHint').textContent = `葷食 ${meat} 位・素食 ${state.veg} 位，共 ${state.head} 位`;

      $('headMinus').disabled = state.head <= 1;
      $('headPlus').disabled = state.head >= MAX.guest;
      $('meatMinus').disabled = meat <= 0;
      $('meatPlus').disabled = meat >= state.head;
      $('vegMinus').disabled = state.veg <= 0;
      $('vegPlus').disabled = state.veg >= state.head;
      $('childMinus').disabled = state.childSeat <= 0;
      $('childPlus').disabled = state.childSeat >= state.head;
    }

    /* 這幾個只有單一活動的表單才有；多活動時它們掛在各自的活動卡上 */
    if(!multi){
      wireStepper('head', (d) => { state.head += d; syncCounts(); });
      /* 葷食加一 = 素食減一（總數固定） */
      wireStepper('meat', (d) => { state.veg -= d; syncCounts(); });
      wireStepper('veg', (d) => { state.veg += d; syncCounts(); });
      wireStepper('child', (d) => { state.childSeat += d; syncCounts(); });

      $('childSeatOn').addEventListener('change', (e) => {
        $('childSeatBox').hidden = !e.target.checked;
        state.childSeat = e.target.checked ? Math.max(1, state.childSeat) : 0;
        syncCounts();
      });
    }

    /* ---------- 「同上」：把上面填過的值帶下來 ----------
       ・勾起來時目標欄位轉成唯讀，跟著來源即時更新
       ・來源是空的就不出現這個選項（沒東西可以帶） */
    function wireSameAs(boxId, sources, targets) {
      const box = $(boxId);
      if (!box) return null;
      const wrap = $(boxId + 'Wrap');
      const srcEls = sources.map($).filter(Boolean);
      const tgtEls = targets.map($).filter(Boolean);

      const apply = () => {
        if (!box.checked) return;
        tgtEls.forEach((el, i) => { el.value = srcEls[i] ? srcEls[i].value : ''; });
      };
      const refresh = () => {
        /* 來源全空時把選項收起來，順手取消勾選 */
        const hasSource = srcEls.some((el) => el.value.trim() !== '');
        wrap.hidden = !hasSource;
        if (!hasSource && box.checked) { box.checked = false; setReadonly(false); }
        apply();
      };
      const setReadonly = (ro) => {
        tgtEls.forEach((el) => {
          el.readOnly = ro;
          el.classList.toggle('is-locked', ro);
        });
      };

      box.addEventListener('change', () => {
        setReadonly(box.checked);
        apply();
        clearErr();
      });
      srcEls.forEach((el) => el.addEventListener('input', refresh));
      return refresh;
    }

    /* 喜帖：電子喜帖的 Email ← 聯絡方式的 Email */
    const refreshCardEmailSame = wireSameAs('cardEmailSame', ['rEmail'], ['rCardEmail']);
    /* 喜餅：郵寄地址 ← 喜帖的郵寄地址 */
    const refreshGiftAddrSame = wireSameAs(
      'giftAddrSame', ['rCardZip', 'rCardAddr'], ['rGiftZip', 'rGiftAddr']);

    /* ---------- 條件顯示 ---------- */
    function syncAttend() {
      const box = $('detailBox');
      if(box) box.hidden = state.attending !== 'yes';
    }
    function syncCard() {
      if (!cfg.askCard) return;
      const paper = state.card === 'paper';
      $('cardPaperBox').hidden = !paper;
      $('cardAddrBox').hidden = !(paper && state.cardDelivery === 'mail');
      $('cardDigitalBox').hidden = state.card !== 'digital';
      if (refreshCardEmailSame) refreshCardEmailSame();
      /* 喜帖不是紙本郵寄時，喜餅就沒有地址可以「同上」 */
      if (refreshGiftAddrSame) refreshGiftAddrSame();
    }
    function syncGift() {
      if (!cfg.askGift) return;
      $('giftMailBox').hidden = state.gift !== 'mail';
      $('giftAddrBox').hidden = state.gift !== 'mail';
      if (refreshGiftAddrSame) refreshGiftAddrSame();
    }

    wireRow('attendRow', (v) => { state.attending = v; syncAttend(); });
    wireRow('relationRow', (v) => { state.relation = v; });
    wireRow('cardRow', (v) => { state.card = v; syncCard(); });
    wireRow('cardDeliveryRow', (v) => { state.cardDelivery = v; syncCard(); });
    wireRow('giftRow', (v) => { state.gift = v; syncGift(); });

    /* 選填的題目：再點一次選好的那顆就取消，不然賓客手滑選了就拿不掉 */
    (function wireTagRow() {
      const row = $('tagRow');
      if (!row) return;
      row.addEventListener('click', (e) => {
        const btn = e.target.closest('.choice');
        if (!btn) return;
        state.tag = state.tag === btn.dataset.val ? null : btn.dataset.val;
        pick('tagRow', state.tag);
        clearErr();
      });
    }());

    syncCounts();
    if (refreshCardEmailSame) refreshCardEmailSame();
    if (refreshGiftAddrSame) refreshGiftAddrSame();


    /* ============================================================
       多活動：每張活動卡自己的狀態與互動
       ------------------------------------------------------------
       單一活動的站台完全走不到這一段（evs.length <= 1）。
    ============================================================ */
    const evState = {};      /* eventId → { going, head, veg, child, answers } */
    /* 剛剛回答的是哪一張 —— 那一張要留著打開，賓客才填得了人數。
       其餘答過的收起來（見 syncEvCard 的 is-folded）。 */
    let evLastId = '';

    function initEvState(){
      evs.forEach(ev => {
        evState[ev.id] = { going:null, head:1, veg:0, child:0, answers:{} };
      });
    }
    initEvState();

    function evCard(id){
      return host.querySelector(`.ev-card[data-ev="${CSS.escape(id)}"]`);
    }

    /* 這一場的人數／葷素／兒童椅互相連動，規則和單一活動那份一模一樣：
       葷素加起來永遠等於出席人數，賓客配不出一個對不上的組合 */
    function syncEvCounts(ev){
      const st = evState[ev.id];
      const p = `ev_${ev.id}_`;
      st.head  = clamp(st.head, 1, MAX.guest);
      st.veg   = clamp(st.veg, 0, st.head);
      st.child = clamp(st.child, 0, st.head);
      const meat = st.head - st.veg;

      const set = (id, v) => { const el = $(id); if(el) el.textContent = v; };
      const dis = (id, v) => { const el = $(id); if(el) el.disabled = v; };
      set(p + 'headNum', st.head);
      set(p + 'meatNum', meat);
      set(p + 'vegNum', st.veg);
      set(p + 'childNum', st.child);
      const hint = $(p + 'mealHint');
      if(hint) hint.textContent = `葷食 ${meat} 位・素食 ${st.veg} 位，共 ${st.head} 位`;

      dis(p + 'headMinus', st.head <= 1);
      dis(p + 'headPlus',  st.head >= MAX.guest);
      dis(p + 'meatMinus', meat <= 0);
      dis(p + 'meatPlus',  meat >= st.head);
      dis(p + 'vegMinus',  st.veg <= 0);
      dis(p + 'vegPlus',   st.veg >= st.head);
      dis(p + 'childMinus', st.child <= 0);
      dis(p + 'childPlus',  st.child >= st.head);
    }

    /* 收合那一行要說的話：「會參加・2 位」／「無法參加」 */
    function evAnswerText(ev){
      const st = evState[ev.id];
      if(st.going === null) return '';
      if(!st.going) return '無法參加';
      return ev.askCount ? `會參加・${st.head} 位` : '會參加';
    }

    function syncEvCard(ev){
      const card = evCard(ev.id);
      if(!card) return;
      const st = evState[ev.id];

      card.querySelectorAll('.ev-choice .choice').forEach(b =>
        b.classList.toggle('on', st.going !== null
          && b.dataset.evGo === (st.going ? 'yes' : 'no')));

      const detail = $(`ev_${ev.id}_detail`);
      if(detail) detail.hidden = st.going !== true;

      card.classList.toggle('is-no', st.going === false);
      card.classList.toggle('is-done', st.going !== null);
      /* 活動多的時候答完就收起來，頁面才不會一路長下去。
         但**剛剛回答的那一張要留著打開** —— 說了「會參加」還要填人數、
         葷素，一按下去就收起來的話賓客根本填不到（這是實作時撞到的）。
         說「無法參加」的沒有東西要填，就可以馬上收。 */
      const fold = st.going !== null && evs.length >= FOLD_FROM
        && (st.going === false || ev.id !== evLastId);
      card.classList.toggle('is-folded', fold);
      const ans = card.querySelector('[data-ev-ans]');
      if(ans) ans.textContent = evAnswerText(ev);
      if(st.going !== null) evClearErr(ev.id);
    }

    function syncEvProgress(){
      const el = $('evProgress');
      if(!el) return;
      const done = evs.filter(ev => evState[ev.id].going !== null).length;
      el.textContent = done === evs.length
        ? `${evs.length} 場都回覆好了`
        : `${done} / ${evs.length} 已回覆`;
    }

    function evClearErr(id){
      const card = evCard(id);
      const el = card && card.querySelector('[data-ev-err]');
      if(el) el.textContent = '';
    }
    function evShowErr(ev, msg){
      const card = evCard(ev.id);
      if(!card) return false;
      card.classList.remove('is-folded');
      const el = card.querySelector('[data-ev-err]');
      if(el) el.textContent = msg;
      card.scrollIntoView({ behavior:'smooth', block:'center' });
      return false;
    }

    function setEvGoing(ev, going){
      evState[ev.id].going = going;
      evLastId = ev.id;
      /* 換了一張卡，之前那張答過的就收起來（手風琴） */
      evs.forEach(syncEvCard);
      syncEvProgress();
      clearErr();
    }

    if(multi){
      const eventsBox = $('rsvpEvents');

      eventsBox.addEventListener('click', (e) => {
        const card = e.target.closest('.ev-card');
        if(!card) return;
        const ev = evs.find(x => x.id === card.dataset.ev);
        if(!ev) return;

        /* 收起來的那一行，點了就重新打開 */
        if(e.target.closest('[data-ev-unfold]')){
          card.classList.remove('is-folded');
          return;
        }
        const go = e.target.closest('[data-ev-go]');
        if(go){ setEvGoing(ev, go.dataset.evGo === 'yes'); return; }

        /* 追加題目的單選：再點一次可以取消（和「更具體是哪一種」同一套） */
        const opt = e.target.closest('.choice-row[data-ev-q] .choice');
        if(opt){
          const row = opt.closest('[data-ev-q]');
          const qid = row.dataset.evQ;
          const st = evState[ev.id];
          st.answers[qid] = st.answers[qid] === opt.dataset.val ? '' : opt.dataset.val;
          row.querySelectorAll('.choice').forEach(b =>
            b.classList.toggle('on', b.dataset.val === st.answers[qid]));
        }
      });

      evs.forEach(ev => {
        const p = `ev_${ev.id}_`;
        const st = evState[ev.id];
        const wire = (id, fn) => {
          const minus = $(id + 'Minus');
          const plus  = $(id + 'Plus');
          if(minus) minus.addEventListener('click', () => { fn(-1); syncEvCounts(ev); });
          if(plus)  plus.addEventListener('click',  () => { fn(1);  syncEvCounts(ev); });
        };
        wire(p + 'head',  (d) => { st.head += d; });
        /* 葷食加一＝素食減一（總數固定） */
        wire(p + 'meat',  (d) => { st.veg -= d; });
        wire(p + 'veg',   (d) => { st.veg += d; });
        wire(p + 'child', (d) => { st.child += d; });

        const childOn = $(p + 'childOn');
        if(childOn){
          childOn.addEventListener('change', (e) => {
            $(p + 'childBox').hidden = !e.target.checked;
            st.child = e.target.checked ? Math.max(1, st.child) : 0;
            syncEvCounts(ev);
          });
        }
        syncEvCounts(ev);
      });

      const allYes = $('evAllYes');
      if(allYes){
        allYes.addEventListener('click', () => {
          /* 「全部參加」是「就照預設，我都到」——
             全部收起來是對的，要調人數再點開那一張 */
          evLastId = '';
          evs.forEach(ev => { evState[ev.id].going = true; });
          evs.forEach(syncEvCard);
          syncEvProgress();
          clearErr();
          toastAllYes();
        });
      }
      syncEvProgress();
    }

    /* 「全部參加」按完給一句話 —— 一次改了五張卡，沒有回饋會讓人以為沒按到。
       這一頁沒有 toast 元件，所以就用進度那一行講。 */
    function toastAllYes(){
      const el = $('evProgress');
      if(!el) return;
      el.textContent = '都幫你選好「會參加」了，要改再點單張卡片';
      setTimeout(syncEvProgress, 2600);
    }

    /* 這一份回覆的「主要活動」：頂層欄位講的就是它。
       ★ 一定要從賓客實際看到的那幾張卡裡挑，不能用 common.js 的
         primaryEventId() —— 那個看的是全部活動，可能挑到一個
         requiresRsvp:false、根本不在表單上的活動，events 裡就會沒有那一格。 */
    function formPrimary(){
      return evs.find(ev => ev.type === 'reception') || evs[0];
    }

    /* ---------- 錯誤訊息 ---------- */
    function clearErr() { errEl.innerHTML = '&nbsp;'; }
    function showErr(msg, focusId) {
      errEl.textContent = msg;
      const el = focusId && $(focusId);
      if (el) el.focus();
      errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }

    /* ---------- 送出 ---------- */
    const val = (id) => { const el = $(id); return el ? el.value.trim() : ''; };

    function validate() {
      if (!val('rName')) return showErr('請先填上你的名字～', 'rName');
      /* 多活動：一次只指出**第一張**還沒回答的卡，並且捲到它。
         把五個錯誤一次列出來只會讓人不知道從哪裡開始。 */
      if (multi) {
        const miss = evs.find(ev => evState[ev.id].going === null);
        if (miss) {
          clearErr();
          return evShowErr(miss, '這一場還沒回答，來得了嗎？');
        }
      } else if (!state.attending) {
        return showErr('請選擇能不能出席唷');
      }
      if (!state.relation) return showErr('請選一下你與新人的關係');

      /* 聯絡方式：至少一種，填了就要像那麼一回事 */
      if (cfg.contacts.length) {
        const filled = cfg.contacts.filter((k) => val(CONTACT_FIELDS[k].id));
        if (!filled.length) {
          return showErr('請至少留一種聯絡方式', CONTACT_FIELDS[cfg.contacts[0]].id);
        }
        if (val('rEmail') && !EMAIL_RE.test(val('rEmail'))) {
          return showErr('Email 的格式看起來怪怪的，再確認一下', 'rEmail');
        }
      }

      if (cfg.askCard) {
        if (!state.card) return showErr('請選擇喜帖的發送方式');
        if (state.card === 'paper') {
          if (!state.cardDelivery) return showErr('紙本喜帖要自行領取還是郵寄呢？');
          if (state.cardDelivery === 'mail') {
            if (!ZIP_RE.test(val('rCardZip'))) {
              return showErr('喜帖郵寄的郵遞區號請填 3–6 位數字', 'rCardZip');
            }
            if (!val('rCardAddr')) return showErr('請填寫喜帖的郵寄地址', 'rCardAddr');
          }
        }
        if (state.card === 'digital') {
          if (!EMAIL_RE.test(val('rCardEmail'))) {
            return showErr('請填寫電子喜帖要寄到的 Email', 'rCardEmail');
          }
        }
      }

      if (cfg.askGift) {
        if (!state.gift) return showErr('請選擇喜餅的領取方式');
        if (state.gift === 'mail') {
          if (!ZIP_RE.test(val('rGiftZip'))) {
            return showErr('喜餅郵寄的郵遞區號請填 3–6 位數字', 'rGiftZip');
          }
          if (!val('rGiftAddr')) return showErr('請填寫喜餅的郵寄地址', 'rGiftAddr');
        }
      }
      return true;
    }

    /* 欄位必須與 firestore.rules 的白名單完全一致，多一個就整筆被拒 */
    /* 每個活動的回應。key 就是 eventId —— 同一個活動只會有一筆，
       這件事由資料結構本身保證，不必自己去重。 */
    function buildEventMap() {
      const map = {};
      evs.forEach(ev => {
        const st = evState[ev.id];
        const go = st.going === true;
        const answers = {};
        ev.questions.forEach(q => {
          const qid = `ev_${ev.id}_q_${q.id}`;
          const v = q.kind === 'text' ? val(qid) : (st.answers[q.id] || '');
          if (go && v) answers[q.id] = String(v).slice(0, MAX.note);
        });
        map[ev.id] = {
          going: go,
          count: go && ev.askCount ? st.head : (go ? 1 : 0),
          veg:   go && ev.askMeal ? st.veg : 0,
          note:  go && ev.askDiet ? val(`ev_${ev.id}_diet`).slice(0, MAX.diet) : '',
          answers,
        };
      });
      return map;
    }

    function buildPayload() {
      /* ---------- 多活動 ----------
         頂層欄位的語意沒有變：它們永遠代表**主要活動**（婚宴）。
         排桌、收禮、匯出 CSV、後台既有的統計圖表讀的都是頂層那一份，
         所以那些地方完全不必知道多活動這件事存在。 */
      if (multi) {
        const map = buildEventMap();
        const primary = formPrimary();
        const pr = map[primary.id];
        const pSt = evState[primary.id];
        const user0 = (typeof me_user !== 'undefined' && me_user) || {};
        const contact0 = (key) => (cfg.contacts.includes(key)
          ? val(CONTACT_FIELDS[key].id).slice(0, CONTACT_FIELDS[key].max) : '');
        const paperMail0 = cfg.askCard && state.card === 'paper' && state.cardDelivery === 'mail';
        const giftMail0 = cfg.askGift && state.gift === 'mail';

        return {
          name: val('rName').slice(0, MAX.name),
          icon: user0.icon || (typeof DEFAULT_ICON !== 'undefined' ? DEFAULT_ICON : '✦'),
          attending: pr.going,
          tentative: false,          /* 活動卡只有「會／不會」，沒有「視情況而定」 */
          guestCount: pr.going ? Math.max(1, pr.count) : 1,
          relation: state.relation || '',
          tag: cfg.tagOptions.some((t) => t.id === state.tag) ? state.tag : '',
          contactPhone: contact0('phone'),
          contactLine: contact0('line'),
          contactEmail: contact0('email'),
          mealMeat: pr.going ? Math.max(1, pr.count) - pr.veg : 0,
          mealVeg: pr.going ? pr.veg : 0,
          childSeat: pr.going && primary.askChildSeat ? pSt.child : 0,
          dietaryNote: pr.note,
          cardType: cfg.askCard ? state.card : '',
          cardDelivery: cfg.askCard && state.card === 'paper' ? state.cardDelivery : '',
          cardZip: paperMail0 ? val('rCardZip').slice(0, MAX.zip) : '',
          cardAddress: paperMail0 ? val('rCardAddr').slice(0, MAX.address) : '',
          cardEmail: cfg.askCard && state.card === 'digital'
            ? val('rCardEmail').slice(0, MAX.email) : '',
          giftDelivery: cfg.askGift ? state.gift : '',
          giftZip: giftMail0 ? val('rGiftZip').slice(0, MAX.zip) : '',
          giftAddress: giftMail0 ? val('rGiftAddr').slice(0, MAX.address) : '',
          message: cfg.askMessage ? val('rNote').slice(0, MAX.message) : '',
          note: val('rMemo').slice(0, MAX.note),
          primaryEventId: primary.id,
          events: map,
          createdAt: window.fb.serverTimestamp(),
        };
      }

      const going = state.attending === 'yes';
      const paperMail = cfg.askCard && state.card === 'paper' && state.cardDelivery === 'mail';
      const giftMail = cfg.askGift && state.gift === 'mail';
      const user = (typeof me_user !== 'undefined' && me_user) || {};
      /* 新人沒問的那幾種一律存空字串，不留上一版填過的殘值 */
      const contact = (key) => (cfg.contacts.includes(key)
        ? val(CONTACT_FIELDS[key].id).slice(0, CONTACT_FIELDS[key].max)
        : '');

      return {
        name: val('rName').slice(0, MAX.name),
        icon: user.icon || (typeof DEFAULT_ICON !== 'undefined' ? DEFAULT_ICON : '✦'),
        attending: going,
        tentative: state.attending === 'maybe',
        guestCount: going ? state.head : 1,
        relation: state.relation || '',
        /* 新人沒開標籤功能、或這個標籤已經被拿掉時一律存空字串 */
        tag: cfg.tagOptions.some((t) => t.id === state.tag) ? state.tag : '',
        contactPhone: contact('phone'),
        contactLine: contact('line'),
        contactEmail: contact('email'),
        mealMeat: going ? state.head - state.veg : 0,
        mealVeg: going ? state.veg : 0,
        childSeat: going ? state.childSeat : 0,
        dietaryNote: going ? val('rDiet').slice(0, MAX.diet) : '',
        cardType: cfg.askCard ? state.card : '',
        cardDelivery: cfg.askCard && state.card === 'paper' ? state.cardDelivery : '',
        cardZip: paperMail ? val('rCardZip').slice(0, MAX.zip) : '',
        cardAddress: paperMail ? val('rCardAddr').slice(0, MAX.address) : '',
        cardEmail: cfg.askCard && state.card === 'digital'
          ? val('rCardEmail').slice(0, MAX.email) : '',
        giftDelivery: cfg.askGift ? state.gift : '',
        giftZip: giftMail ? val('rGiftZip').slice(0, MAX.zip) : '',
        giftAddress: giftMail ? val('rGiftAddr').slice(0, MAX.address) : '',
        message: cfg.askMessage ? val('rNote').slice(0, MAX.message) : '',
        note: val('rMemo').slice(0, MAX.note),
        createdAt: window.fb.serverTimestamp(),
      };
    }

    const submitBtn = $('submitBtn');

    $('rsvpForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErr();
      if (!validate()) return;

      const payload = buildPayload();
      /* honeypot 有值代表是機器人：畫面照樣顯示成功，但不寫進資料庫 */
      const isBot = val('rWebsite') !== '';

      submitBtn.disabled = true;
      submitBtn.textContent = '送出中…';
      try {
        if (!isBot) await DataStore.addRSVP(payload);
      } catch (err) {
        console.warn('[rsvp] 送出失敗', err);
        submitBtn.disabled = false;
        submitBtn.textContent = '送出回覆';
        showErr('送出時發生問題，請稍後再試一次');
        return;
      }
      submitBtn.disabled = false;
      submitBtn.textContent = '送出回覆';

      /* 記在本機，回訪就顯示「已回覆」；存的是人看得懂的形式 */
      const mine = {
        name: payload.name,
        icon: payload.icon,
        attending: state.attending,
        relation: state.relation,
        tag: payload.tag,
        phone: payload.contactPhone,
        line: payload.contactLine,
        email: payload.contactEmail,
        headcount: payload.guestCount,
        veg: payload.mealVeg,
        childSeat: payload.childSeat,
        diet: payload.dietaryNote,
        card: state.card,
        cardDelivery: state.cardDelivery,
        cardZip: payload.cardZip,
        cardAddress: payload.cardAddress,
        cardEmail: payload.cardEmail,
        gift: state.gift,
        giftZip: payload.giftZip,
        giftAddress: payload.giftAddress,
        note: payload.message,
        memo: payload.note,
        /* 多活動：把每一場的答案也記下來，回訪時整份帶回畫面。
           存的是「賓客實際選了什麼」，不是送出去的 payload。 */
        events: multi ? evs.reduce((acc, ev) => {
          const st = evState[ev.id];
          acc[ev.id] = { going: st.going, head: st.head, veg: st.veg,
                         child: st.child, answers: { ...st.answers },
                         diet: val(`ev_${ev.id}_diet`),
                         texts: ev.questions.filter(q => q.kind === 'text')
                           .reduce((a, q) => {
                             a[q.id] = val(`ev_${ev.id}_q_${q.id}`); return a;
                           }, {}) };
          return acc;
        }, {}) : null,
      };
      if(multi) mine.attending = payload.attending ? 'yes' : 'no';
      try { LS.set('rsvp.mine', mine); } catch { /* 無痕模式寫不進去，不影響送出 */ }
      try { if (typeof saveUser === 'function') saveUser({ name: payload.name, icon: payload.icon }); } catch { }

      showThanks(mine);
      if (typeof opt.onDone === 'function') opt.onDone(mine);
    });

    /* ---------- 感謝畫面 ---------- */
    function showThanks(p) {
      const byAttend = {
        yes: {
          t: '太好了，收到你的回覆',
          m: `我們幫你留好 ${p.headcount || 1} 個位置，超期待相見`,
        },
        no: {
          t: '收到你的回覆了',
          m: '雖然這次無法相聚，還是謝謝你的祝福，會想念你的',
        },
        maybe: {
          t: '先幫你記著',
          m: '等你確定了，隨時回來把回覆更新成出席就好',
        },
      };
      const info = byAttend[p.attending] || byAttend.maybe;

      /* 多活動：只寫一句「收到回覆」不夠 —— 賓客一次答了三、四件事，
         要看得到自己到底答了什麼，才敢關掉這一頁。 */
      const list = $('tkEvents');
      if(list && multi){
        const rows = evs.map(ev => {
          const st = evState[ev.id];
          const yes = st.going === true;
          return `<li class="tk-ev${yes ? '' : ' is-no'}">
            <span class="tk-ev-name">${esc(ev.name)}</span>
            <span class="tk-ev-ans">${esc(evAnswerText(ev) || '未回覆')}</span>
          </li>`;
        }).join('');
        list.innerHTML = rows;
        list.hidden = false;
        const anyYes = evs.some(ev => evState[ev.id].going === true);
        $('tkTitle').textContent = anyYes ? '收到你的回覆了' : '收到你的回覆了';
        $('tkMsg').textContent = anyYes
          ? '下面是你這次的安排，之後有變動隨時回來改'
          : '雖然這次無法相聚，還是謝謝你的祝福，會想念你的';
        formCard.hidden = true;
        thanks.hidden = false;
        return;
      }

      $('tkTitle').textContent = info.t;
      $('tkMsg').textContent = info.m;
      formCard.hidden = true;
      thanks.hidden = false;
    }

    $('editBtn').addEventListener('click', () => {
      thanks.hidden = true;
      formCard.hidden = false;
      formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    /* ---------- 回訪：帶出上一次的回覆 ---------- */
    function setVal(id, value) { const el = $(id); if (el) el.value = value || ''; }

    function restore() {
      let mine = null;
      try { mine = LS.get('rsvp.mine', null); } catch { mine = null; }

      /* 沒回覆過，就先把大廳填的名字帶進來（沒進過大廳就是空的） */
      if (!mine) {
        const user = (typeof me_user !== 'undefined' && me_user) || {};
        if (user.name && user.name !== '朋友') setVal('rName', user.name);
        return;
      }

      setVal('rName', mine.name);
      setVal('rPhone', mine.phone);
      setVal('rLine', mine.line);
      setVal('rEmail', mine.email);
      setVal('rNote', mine.note);
      setVal('rMemo', mine.memo);
      setVal('rDiet', mine.diet);
      setVal('rCardZip', mine.cardZip);
      setVal('rCardAddr', mine.cardAddress);
      setVal('rCardEmail', mine.cardEmail);
      setVal('rGiftZip', mine.giftZip);
      setVal('rGiftAddr', mine.giftAddress);

      state.attending = mine.attending || null;
      state.relation = mine.relation || null;
      /* 新人事後把標籤拿掉或改成不當選項時，本機記的那個就當作沒選過 */
      state.tag = cfg.tagOptions.some((t) => t.id === mine.tag) ? mine.tag : null;
      state.card = mine.card || null;
      state.cardDelivery = mine.cardDelivery || null;
      state.gift = mine.gift || null;
      state.head = mine.headcount || 1;
      state.veg = mine.veg || 0;
      state.childSeat = mine.childSeat || 0;

      /* 多活動：把每一場答過的內容整份帶回來。
         活動被新人拿掉、或事後才加的那幾場，就當作沒答過（不硬塞） */
      if(multi && mine.events && typeof mine.events === 'object'){
        evs.forEach(ev => {
          const saved = mine.events[ev.id];
          if(!saved) return;
          const st = evState[ev.id];
          st.going = saved.going === true ? true : (saved.going === false ? false : null);
          st.head  = Number(saved.head) || 1;
          st.veg   = Number(saved.veg) || 0;
          st.child = Number(saved.child) || 0;
          st.answers = (saved.answers && typeof saved.answers === 'object')
            ? { ...saved.answers } : {};
          setVal(`ev_${ev.id}_diet`, saved.diet);
          ev.questions.forEach(q => {
            if(q.kind === 'text') setVal(`ev_${ev.id}_q_${q.id}`, (saved.texts || {})[q.id]);
            else {
              const row = $(`ev_${ev.id}_q_${q.id}`);
              if(row) row.querySelectorAll('.choice').forEach(b =>
                b.classList.toggle('on', b.dataset.val === st.answers[q.id]));
            }
          });
          const childOn = $(`ev_${ev.id}_childOn`);
          if(childOn){
            childOn.checked = st.child > 0;
            const box = $(`ev_${ev.id}_childBox`);
            if(box) box.hidden = st.child <= 0;
          }
          syncEvCounts(ev);
        });
        evLastId = '';
        evs.forEach(syncEvCard);
        syncEvProgress();
      }

      pick('attendRow', state.attending);
      pick('relationRow', state.relation);
      pick('tagRow', state.tag);
      pick('cardRow', state.card);
      pick('cardDeliveryRow', state.cardDelivery);
      pick('giftRow', state.gift);
      /* 這兩個只有單一活動的表單才有；多活動的兒童椅在各張活動卡上（前面已還原） */
      if(!multi){
        $('childSeatOn').checked = state.childSeat > 0;
        $('childSeatBox').hidden = state.childSeat <= 0;
      }

      syncAttend();
      syncCard();
      syncGift();
      syncCounts();
      showThanks(mine);
    }
    restore();

    return { closed: false, state, config: cfg };
  }

  window.RSVPForm = { mount, closedReason };
})();
