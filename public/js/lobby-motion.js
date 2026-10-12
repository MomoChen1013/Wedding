/* ============================================================
   lobby-motion.js — 大廳的「開場」與「滾動編排」
   ------------------------------------------------------------
   版型的 HTML 不能帶 <script>（site-context.js 用 innerHTML 換骨架，
   塞進來的 script 不會執行），所以動作一律寫在這裡，
   版型只用屬性**宣告**自己要什麼：

     [data-reveal]      捲到的時候進場一次，值是進場的方式：
                          rise    淡入＋往上浮
                          stitch  由下往上「繡」出來（插圖）
                          unfurl  從中間往兩邊展開（緞帶標題）
                          seam    從中間往兩邊縫出去（分隔線）
                          list    容器不動，子元素一個接一個進來
     [data-scroll]      跟著捲動連續變化，這裡只負責算三個數字：
                          --sp  整個元素穿過視窗的進度（0 → 1）
                          --ap  元素頂端越過視窗 62% 那條線之後走了多少（0 → 1）
                          --lp  元素往上離開視窗的進度（0 → 1）
                        要拿這些數字做什麼，是版型 CSS 的事。

   ▸ 開場（opener）
     開場是獨立的一軸（sites.opening，見 wed-model.js 的 OPENINGS）：
     信封、古書、花開、窗簾、燭光、星圖、門、絲帶……每一種是一支
     js/openers/{key}.js ＋ 一份 css/openers/{key}.css，載入時呼叫
     LobbyMotion.register(key, fn) 把自己登記上來。

     fn(host, ctx) 的約定：
       host  一個滿版的空容器（.opener），開場自己把畫面蓋進去
       ctx.names     { a, b } 兩個人的名字（hero 用的那一組）
       ctx.date      '2027.01.16' 這種字串，可能是空的
       ctx.variant   版型代號：同一種開場在不同版型可以長得不一樣
                     （法式莊園的門和秘密花園的門不是同一扇）
       ctx.reduce    系統要求減少動態：直接給一個靜態畫面、點了就進
       ctx.gesture() 賓客親手做了那個動作（點、拖）—— 背景音樂在這時候開
       ctx.reveal()  底下的內容可以出現了（通常在開場開始退場時）
       ctx.done()    開場整個收掉
       ctx.finish()  reveal ＋ 淡出 ＋ done 一次做完（跳過、減少動態都用它）
       ctx.later(fn, ms) 排一個計時；跳過時會一起取消

     每一步都只會生效一次，順序叫錯也不會讓內容出現兩次。
     自動播放的開場（花開、星圖）宣告 fn.auto = true：
     賓客點畫面任何地方就直接跳到結尾。

   這支不讀 window.WED、不碰 Firestore —— preview/ 底下的示範頁
   不起 Firebase 也能直接用同一支。
============================================================ */
(function () {
  const reduce = () =>
    !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  /* ---------- 捲動進場 ---------- */
  function initReveal(root) {
    const els = Array.from(root.querySelectorAll('[data-reveal]'));
    if (!els.length) return;
    if (reduce() || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-in'));
      return;
    }
    /* 隱藏狀態只在這一刻才掛上去（html.tp-motion）：
       這支沒載到、或瀏覽器說不要動畫，內容一開始就是看得到的 */
    document.documentElement.classList.add('tp-motion');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
    els.forEach((el) => io.observe(el));
  }

  /* ---------- 捲動連動 ---------- */
  function initScroll(root) {
    const els = Array.from(root.querySelectorAll('[data-scroll]'));
    if (!els.length || reduce()) return;

    let queued = false;
    function update() {
      queued = false;
      const vh = window.innerHeight || 1;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (!r.height) continue;                         /* 還沒顯示（#app 仍是 display:none） */
        if (r.bottom < -vh || r.top > vh * 2) continue;  /* 離得很遠，不必算 */
        el.style.setProperty('--sp', clamp((vh - r.top) / (vh + r.height)).toFixed(4));
        el.style.setProperty('--ap', clamp((vh * 0.62 - r.top) / r.height).toFixed(4));
        el.style.setProperty('--lp', clamp(-r.top / r.height).toFixed(4));
      }
    }
    const queue = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    };
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    /* #app 從 display:none 變成看得到、照片載進來把版面撐高 ——
       這些都不會發 scroll 事件，所以版面尺寸一變就重算一次 */
    if ('ResizeObserver' in window) new ResizeObserver(queue).observe(document.body);
    queue();
  }

  /* ---------- 開場 ---------- */
  const OPENERS = {};
  function register(key, fn) { OPENERS[key] = fn; }
  function has(key) { return Object.hasOwn(OPENERS, key); }

  /* host：滿版的空容器；key：哪一種開場；opts 見檔頭 */
  function opening(host, key, opts) {
    const fn = OPENERS[key];
    if (!host || !fn) return false;
    const o = opts || {};
    const timers = [];
    const once = (f) => { let did = false; return (...a) => { if (did) return; did = true; return f && f(...a); }; };
    const safe = (f) => () => { try { f && f(); } catch (e) { console.warn('[opener]', e); } };

    const ctx = {
      names: o.names || { a: '', b: '' },
      date: o.date || '',
      variant: o.variant || '',
      reduce: reduce(),
      later(f, ms) { timers.push(setTimeout(f, ms)); },
    };
    ctx.gesture = once(safe(o.onOpen));
    ctx.reveal = once(safe(o.onReveal));
    ctx.done = once(() => {
      timers.forEach(clearTimeout);
      host.remove();
      safe(o.onDone)();
    });
    ctx.finish = once(() => {
      timers.forEach(clearTimeout);
      ctx.reveal();
      host.classList.add('is-fading');
      setTimeout(ctx.done, 450);
    });

    host.innerHTML = '';
    host.hidden = false;
    host.style.display = '';
    host.classList.add('opener');
    host.dataset.opener = key;
    if (ctx.variant) host.dataset.variant = ctx.variant;
    fn(host, ctx);
    requestAnimationFrame(() => host.classList.add('is-ready'));

    /* 自動播放的開場：點任何地方就跳到結尾（花開、星圖不必等它演完） */
    if (fn.auto) {
      host.addEventListener('click', () => { ctx.gesture(); ctx.finish(); });
      host.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); ctx.finish(); }
      });
    }
    return true;
  }

  /* 共用的小工具：開場們都要蓋 DOM、都要對名字做跳脫 */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function namesHtml(ctx, amp) {
    const a = esc(ctx.names.a), b = esc(ctx.names.b);
    if (a && b) return `<span>${a}</span><i class="op-amp">${amp || '&amp;'}</i><span>${b}</span>`;
    return `<span>${a || b}</span>`;
  }
  /* 一顆「點這裡」的透明按鈕蓋滿整個開場：點哪裡都算、鍵盤也按得到 */
  function hitButton(host, label, onHit) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'op-hit';
    b.setAttribute('aria-label', label);
    b.addEventListener('click', onHit);
    host.prepend(b);
    return b;
  }

  function init(root) {
    const r = root || document;
    initReveal(r);
    initScroll(r);
  }

  window.LobbyMotion = { init, register, has, opening, esc, namesHtml, hitButton };
})();
