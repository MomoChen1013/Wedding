/* ============================================================
   samples/demos.js — 總覽頁（/samples/）裡可以操作的後台示範
   ------------------------------------------------------------
   畫面在 scripts/sample-index.html（<li class="demo" data-try="…">），全是假資料、
   不連任何帳號；每一支只示範一個功能，點一點、拖一拖就懂：

     form     出席表單：預設題目開開關關、加自由發問的題目（最多 3 題）
     stats    出席統計：幫長輩新增一筆，數字跟著算好
     seat     排桌：待安排的人拖進桌位（或點名字、再點桌子），超過人數、重複的名字、還有誰沒排都標出來
     content  自訂內容：按一下多一則
     pages    自訂顯示：開關一按，「賓客看到的」跟著變
     butler   收禮小幫手：點名字就記好

   玩到底的示範，按鈕會換成「↺ 再…一次」，把畫面還原成一開始的樣子。
   每一支第一次被操作時送一筆 demo_try { demo }（見 samples.js 的 track）。
============================================================ */

/* 剛加進來、剛變動的那一個：淡淡閃一下 */
function flash(el) {
  el.classList.remove('is-new');
  void el.offsetWidth;
  el.classList.add('is-new');
}

function setNum(el, n) {
  el.textContent = String(n);
  flash(el.parentElement);
}

/* ---------- 01 出席表單 ---------- */
const CUSTOM_QS = [
  { label: '需要接駁車嗎？', opts: ['需要', '不需要'] },
  { label: '想點播的一首歌', ph: '婚宴上幫你放' },
  { label: '會參加 After Party 嗎？', opts: ['會', '不會'] },
];

function initForm(root, tried) {
  const body = root.querySelector('[data-form-body]');
  const custom = root.querySelector('[data-custom]');
  const add = root.querySelector('[data-q-add]');
  const addLabel = add.textContent;

  root.querySelectorAll('[data-q]').forEach((btn) => btn.addEventListener('click', () => {
    tried();
    const on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const f = body.querySelector(`[data-f="${btn.dataset.q}"]`);
    f.hidden = !on;
    if (on) flash(f);
  }));

  add.addEventListener('click', () => {
    tried();
    const n = custom.children.length;
    if (n >= CUSTOM_QS.length) {               /* 3 題加滿之後：再按一次就清掉重來 */
      custom.replaceChildren();
      add.textContent = addLabel;
      body.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const q = CUSTOM_QS[n];
    const f = document.createElement('div');
    f.className = 'gf-f';
    const lb = document.createElement('span');
    lb.className = 'lb';
    lb.textContent = q.label;
    const own = document.createElement('span');
    own.className = 'own';
    own.textContent = '自由發問';
    lb.append(own);
    f.append(lb);
    if (q.opts) {
      const pick = document.createElement('div');
      pick.className = 'gf-pick';
      for (const o of q.opts) { const s = document.createElement('span'); s.textContent = o; pick.append(s); }
      f.append(pick);
    } else {
      const inp = document.createElement('span');
      inp.className = 'gf-in ph';
      inp.textContent = q.ph;
      f.append(inp);
    }
    custom.append(f);
    flash(f);
    body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
    add.textContent = n + 1 >= CUSTOM_QS.length ? '↺ 3 題加滿了，再試一次' : `＋ 自由發問（${n + 1}／3）`;
  });
}

/* ---------- 02 出席統計 ---------- */
const ELDERS = [
  { name: '陳阿嬤', n: 2, veg: 2, kids: 0, desc: '2 位・素 2' },
  { name: '林伯伯', n: 1, veg: 0, kids: 0, desc: '1 位・葷 1' },
  { name: '王奶奶', n: 3, veg: 1, kids: 1, desc: '3 位・葷 2 素 1・兒童椅' },
];

function initStats(root, tried) {
  const screen = root.querySelector('.adm-body');
  const original = screen.innerHTML;
  const btn = root.querySelector('[data-elder]');
  const label = btn.textContent;
  let i = 0;

  btn.addEventListener('click', () => {
    tried();
    if (i >= ELDERS.length) {
      screen.innerHTML = original;
      btn.textContent = label;
      i = 0;
      return;
    }
    const e = ELDERS[i++];
    const stat = (k) => screen.querySelector(`[data-stat="${k}"]`);
    const bump = (k, d) => { if (d) setNum(stat(k), Number(stat(k).textContent) + d); };
    bump('replies', 1);
    bump('guests', e.n);
    bump('veg', e.veg);
    bump('kids', e.kids);

    const row = document.createElement('div');
    row.className = 'st-row';
    const b = document.createElement('b'); b.textContent = e.name;
    const s = document.createElement('span'); s.textContent = e.desc;
    const by = document.createElement('em'); by.className = 'by'; by.textContent = '新人代填';
    row.append(b, s, by);
    screen.querySelector('[data-list] h4').after(row);
    flash(row);
    screen.scrollTo({ top: 0, behavior: 'smooth' });
    btn.textContent = i >= ELDERS.length ? '↺ 再示範一次' : label;
  });
}

/* ---------- 03 排桌 ---------- */
function initSeat(root, tried) {
  const box = root.querySelector('[data-seat]');
  const original = box.innerHTML;
  const hint = root.querySelector('[data-seat-hint]');
  const resetBtn = root.querySelector('[data-seat-reset]');
  let sel = null;           /* 點名字、再點桌子：先選起來的那一位 */
  let drag = null;          /* { chip, id, x0, y0, ghost, over } */
  let justDragged = false;  /* 拖完放開時瀏覽器還會補一個 click，略過它 */
  let changed = false;      /* 排過、清過才出現「再排一次」 */

  const people = (scope) => Array.from(scope.querySelectorAll('.sp-chip[data-n]'))
    .reduce((n, c) => n + Number(c.dataset.n), 0);

  function sync() {
    const pool = box.querySelector('[data-pool]');
    const left = people(pool);
    const status = box.querySelector('[data-seat-status]');
    if (left) {
      status.classList.remove('done');
      status.innerHTML = `還沒排<span><b data-left>${left}</b>位</span>`;
    } else {
      status.classList.add('done');
      status.textContent = '✓ 全部排好了，賓客已經查得到桌號';
    }
    for (const t of box.querySelectorAll('.sp-table')) {
      const cap = Number(t.dataset.cap);
      const n = Number(t.dataset.base) + people(t);
      t.classList.toggle('over', n > cap);
      t.querySelector('[data-cnt]').textContent = n > cap ? `${n}／${cap}・超過 ${n - cap} 位` : `${n}／${cap}`;
    }
    hint.hidden = !left;
    resetBtn.hidden = !changed;
  }

  function select(chip) {
    if (sel) sel.classList.remove('sel');
    sel = chip && chip !== sel ? chip : null;
    if (sel) sel.classList.add('sel');
  }

  /* 放進桌子：名字變成桌上的一般名牌（不能再拖），桌子的人數重算 */
  function place(chip, table) {
    tried();
    const seated = document.createElement('span');
    seated.className = 'sp-chip';
    seated.dataset.n = chip.dataset.n;
    seated.append(...Array.from(chip.childNodes).filter((n) => !(n.classList && n.classList.contains('dup-tag'))).map((n) => n.cloneNode(true)));
    const more = table.querySelector('.sp-more');
    table.insertBefore(seated, more);
    (chip.closest('.sp-dup') || chip).remove();
    if (sel === chip) sel = null;
    changed = true;
    flash(seated);
    flash(table.querySelector('h4'));
    sync();
  }

  function endDrag() {
    if (!drag) return;
    if (drag.ghost) drag.ghost.remove();
    if (drag.over) drag.over.classList.remove('hot');
    drag = null;
  }

  box.addEventListener('pointerdown', (e) => {
    const chip = e.target.closest('button.sp-chip');
    if (!chip || e.button > 0) return;
    drag = { chip, id: e.pointerId, x0: e.clientX, y0: e.clientY, ghost: null, over: null };
    try { chip.setPointerCapture(e.pointerId); } catch { /* 有些瀏覽器拿不到 capture，一樣拖得動 */ }
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      drag.ghost = drag.chip.cloneNode(true);
      drag.ghost.classList.add('sp-ghost');
      drag.ghost.classList.remove('sel');
      drag.ghost.setAttribute('aria-hidden', 'true');
      document.body.append(drag.ghost);
    }
    e.preventDefault();
    drag.ghost.style.left = `${e.clientX}px`;
    drag.ghost.style.top = `${e.clientY}px`;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const t = under && box.contains(under) ? under.closest('.sp-table') : null;
    if (t !== drag.over) {
      if (drag.over) drag.over.classList.remove('hot');
      if (t) t.classList.add('hot');
      drag.over = t;
    }
  });
  box.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { chip, ghost, over } = drag;
    endDrag();
    if (ghost) {
      justDragged = true;
      setTimeout(() => { justDragged = false; }, 0);
      if (over) place(chip, over);
    }
  });
  box.addEventListener('pointercancel', endDrag);

  box.addEventListener('click', (e) => {
    if (justDragged) { justDragged = false; return; }
    const x = e.target.closest('[data-dup-x]');
    if (x) {
      tried();
      const wrap = x.closest('.sp-dup');
      if (sel && wrap.contains(sel)) sel = null;
      wrap.remove();
      changed = true;
      sync();
      return;
    }
    const chip = e.target.closest('button.sp-chip');
    if (chip) { tried(); select(chip); return; }
    const table = e.target.closest('.sp-table');
    if (table && sel) place(sel, table);
  });
  box.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const table = e.target.closest('.sp-table');
    if (!table || e.target !== table) return;
    e.preventDefault();
    if (sel) place(sel, table);
  });

  resetBtn.addEventListener('click', () => {
    box.innerHTML = original;
    sel = null;
    changed = false;
    sync();
    box.scrollTo({ top: 0 });
  });
}

/* ---------- 自訂內容 ---------- */
const MORE_CONTENT = [
  { kind: '跳出說明', title: '接駁車時刻', text: '送客後 14:45，飯店門口有接駁車到捷運站。' },
  { kind: '開啟連結', title: '婚禮直播', text: '來不了的親友，也能在線上一起看。' },
];

function initContent(root, tried) {
  const list = root.querySelector('[data-content-list]');
  const original = list.innerHTML;
  const btn = root.querySelector('[data-content-add]');
  const label = btn.textContent;
  let i = 0;

  btn.addEventListener('click', () => {
    tried();
    if (i >= MORE_CONTENT.length) {
      list.innerHTML = original;
      btn.textContent = label;
      i = 0;
      return;
    }
    const c = MORE_CONTENT[i++];
    const item = document.createElement('div');
    item.className = 'adm-item';
    const kind = document.createElement('span'); kind.className = 'adm-kind'; kind.textContent = c.kind;
    const d = document.createElement('div');
    const b = document.createElement('b'); b.textContent = c.title;
    const s = document.createElement('span'); s.textContent = c.text;
    d.append(b, s);
    item.append(kind, d);
    list.append(item);
    flash(item);
    const scroller = list.closest('.adm-scroll');
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
    btn.textContent = i >= MORE_CONTENT.length ? '↺ 再示範一次' : label;
  });
}

/* ---------- 自訂顯示 ---------- */
function initPages(root, tried) {
  root.querySelectorAll('input[data-page]').forEach((inp) => {
    const see = root.querySelector(`[data-see="${inp.dataset.page}"]`);
    inp.setAttribute('aria-label', inp.closest('.adm-row').querySelector('span').textContent);
    inp.addEventListener('change', () => {
      tried();
      see.hidden = !inp.checked;
      flash(see.parentElement);
    });
  });
}

/* ---------- 收禮小幫手 ---------- */
function initButler(root, tried) {
  const got = root.querySelector('[data-bt="got"]');
  const left = root.querySelector('[data-bt="left"]');
  root.querySelectorAll('.bt-row').forEach((row) => row.addEventListener('click', () => {
    if (row.disabled) return;
    tried();
    row.classList.add('got');
    row.disabled = true;
    row.querySelector('em').textContent = '已收';
    flash(row);
    setNum(got, Number(got.textContent) + 1);
    setNum(left, Math.max(0, Number(left.textContent) - 1));
  }));
}

const INIT = { form: initForm, stats: initStats, seat: initSeat, content: initContent, pages: initPages, butler: initButler };

export function initDemos(track) {
  for (const root of document.querySelectorAll('[data-try]')) {
    const kind = root.dataset.try;
    const init = INIT[kind];
    if (!init) continue;
    let done = false;
    const tried = () => {
      if (done) return;
      done = true;
      track('demo_try', { demo: kind });
    };
    init(root, tried);
  }
}
