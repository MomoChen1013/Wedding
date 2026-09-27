/* ============================================================
   lobby-motion.js — 大廳的「開場」與「滾動編排」
   ------------------------------------------------------------
   版型的 HTML 不能帶 <script>（site-context.js 用 innerHTML 換骨架，
   塞進來的 script 不會執行），所以動作一律寫在這裡，
   版型只用屬性**宣告**自己要什麼：

     #envelope          這個大廳的開場是一封信（取代兩句字幕＋簾幕）
     [data-reveal]      捲到的時候進場一次，值是進場的方式：
                          rise    淡入＋往上浮
                          stitch  由下往上「繡」出來（插圖）
                          unfurl  從中間往兩邊展開（緞帶標題）
                          seam    從中間往兩邊縫出去（分隔線）
     [data-scroll]      跟著捲動連續變化，這裡只負責算三個數字：
                          --sp  整個元素穿過視窗的進度（0 → 1）
                          --ap  元素頂端越過視窗 62% 那條線之後走了多少（0 → 1）
                          --lp  元素往上離開視窗的進度（0 → 1）
                        要拿這些數字做什麼，是版型 CSS 的事。

   由 wed-model.js 的 TEMPLATES[x].lobbyJs 宣告要不要載；
   site-context.js 在 index.js 之前載它，index.js 看得到 window.LobbyMotion
   才走信封開場，看不到就維持原本的字幕＋簾幕。

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

  /* ---------- 信封 ----------
     一封從背面看的信：左、右、下三片摺進來的紙，最上面蓋著封口，
     封口的尖端壓著一顆封蠟。點一下：

       1. 封蠟裂開，上半顆跟著封口走
       2. 封口從尖端開始往上掀（以上緣為軸，往賓客這一側翻起來）
       3. 信紙從袋口往上抽出一小段
       4. 左右下三片往畫面外退開，信紙放大溶進邀請函本身

     時間軸寫在這裡，每一段的樣子寫在版型 CSS（.is-opening／.is-leaving）。
     opts.onOpen   點下去的那一刻（使用者手勢還在，可以開音樂）
     opts.onReveal 信封開始退場，底下的內容要出現了
     opts.onDone   信封整個收掉 */
  const T_LIFT = 1750;   /* 點下去 → 開始退場：封蠟裂開 ＋ 掀封口 ＋ 抽信紙（對齊 lobby-tapestry.css） */
  const T_LEAVE = 1250;  /* 退場本身 */

  function envelope(el, opts) {
    const o = opts || {};
    const hit = el.querySelector('[data-envelope-open]') || el;
    el.hidden = false;
    el.style.display = '';
    requestAnimationFrame(() => el.classList.add('is-ready'));

    let opened = false;
    function open() {
      if (opened) return;
      opened = true;
      try { o.onOpen && o.onOpen(); } catch (e) { console.warn(e); }

      if (reduce()) {
        try { o.onReveal && o.onReveal(); } catch (e) { console.warn(e); }
        el.classList.add('is-fading');
        setTimeout(() => { el.remove(); o.onDone && o.onDone(); }, 400);
        return;
      }

      el.classList.add('is-opening');
      setTimeout(() => {
        try { o.onReveal && o.onReveal(); } catch (e) { console.warn(e); }
        el.classList.add('is-leaving');
      }, T_LIFT);
      setTimeout(() => {
        el.remove();
        try { o.onDone && o.onDone(); } catch (e) { console.warn(e); }
      }, T_LIFT + T_LEAVE);
    }

    hit.addEventListener('click', open);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  }

  function init(root) {
    const r = root || document;
    initReveal(r);
    initScroll(r);
  }

  window.LobbyMotion = { envelope, init };
})();
