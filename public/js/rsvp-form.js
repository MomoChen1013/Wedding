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

  function formHtml(cfg) {
    const hasEmail = cfg.contacts.includes('email');

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

    return `
<div class="cardbox rf-card" id="formCard">
  <div class="section-title">你的出席回覆</div>
  <form id="rsvpForm" novalidate>

    <label class="rf-label" for="rName">怎麼稱呼你？<i class="rf-req">必填</i></label>
    <div class="field">
      <input type="text" id="rName" maxlength="${MAX.name}" autocomplete="name"
             placeholder="輸入你的名字">
    </div>

    <label class="rf-label">能來參加嗎？<i class="rf-req">必填</i></label>
    ${choiceRow('attendRow', 'attend')}

    <label class="rf-label">與新人的關係<i class="rf-req">必填</i></label>
    ${choiceRow('relationRow', 'relation', 'sm')}

    ${contactBlock(cfg.contacts)}

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
    </div>
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
    host.innerHTML = formHtml(cfg);
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
      $('detailBox').hidden = state.attending !== 'yes';
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

    syncCounts();
    if (refreshCardEmailSame) refreshCardEmailSame();
    if (refreshGiftAddrSame) refreshGiftAddrSame();

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
      if (!state.attending) return showErr('請選擇能不能出席唷');
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
    function buildPayload() {
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
      };
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
      state.card = mine.card || null;
      state.cardDelivery = mine.cardDelivery || null;
      state.gift = mine.gift || null;
      state.head = mine.headcount || 1;
      state.veg = mine.veg || 0;
      state.childSeat = mine.childSeat || 0;

      pick('attendRow', state.attending);
      pick('relationRow', state.relation);
      pick('cardRow', state.card);
      pick('cardDeliveryRow', state.cardDelivery);
      pick('giftRow', state.gift);
      $('childSeatOn').checked = state.childSeat > 0;
      $('childSeatBox').hidden = state.childSeat <= 0;

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
