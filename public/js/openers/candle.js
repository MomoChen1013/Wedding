/* ============================================================
   openers/candle.js — 開場：燭光點亮
   ------------------------------------------------------------
   一開始整個畫面幾乎是黑的，只看得到三根還沒點的蠟燭：

     賓客點一下 → 中間那根被點燃（火柴擦亮的那一下）
     → 左邊那根 → 右邊那根 → 光一層一層把房間照亮，名字從暗處浮出來
     → 溶進網站

   房間被照得多亮由 host 上的 --lit（0 → 3）決定，
   每一根點起來就加一；牆、名字、背後的窗都照著這個值變亮。
   [data-variant="midnight-chapel"] 牆上多一扇彩繪玻璃的尖拱窗。
============================================================ */
(function () {
  const LM = window.LobbyMotion;
  const ORDER = [1, 0, 2];               /* 中 → 左 → 右 */
  const GAP = 850;                       /* 一根接一根的間隔 */
  const T_HOLD = 2100;                   /* 三根都亮了之後停多久 */
  const T_LEAVE = 1200;

  function candle(host, ctx) {
    host.classList.add('cd-host');
    host.style.setProperty('--lit', '0');
    const candles = [0, 1, 2].map((i) => `
      <div class="cd-candle cd-c${i}">
        <div class="cd-glow"></div>
        <div class="cd-flame"><i></i></div>
        <div class="cd-wick"></div>
        <div class="cd-wax"></div>
      </div>`).join('');
    host.innerHTML = `
      <div class="cd-room" aria-hidden="true">
        <div class="cd-arch"></div>
      </div>
      <div class="cd-text" aria-hidden="true">
        <div class="cd-kicker">Together, in candlelight</div>
        <div class="cd-names">${LM.namesHtml(ctx)}</div>
        <div class="cd-date">${LM.esc(ctx.date)}</div>
      </div>
      <div class="cd-stand" aria-hidden="true">${candles}<div class="cd-base"></div></div>
      <div class="cd-hint"><span class="en">Light the candle</span><span class="cn">輕觸畫面・點亮蠟燭</span></div>`;

    const els = host.querySelectorAll('.cd-candle');
    function light(n) {
      els[ORDER[n]].classList.add('is-lit');
      host.style.setProperty('--lit', String(n + 1));
    }

    LM.hitButton(host, '點亮蠟燭，進入邀請函', () => {
      if (host.classList.contains('is-going')) { ctx.finish(); return; }
      ctx.gesture();
      if (ctx.reduce) { ctx.finish(); return; }
      host.classList.add('is-going');
      light(0);
      ctx.later(() => light(1), GAP);
      ctx.later(() => light(2), GAP * 2);
      const tLeave = GAP * 2 + T_HOLD;
      ctx.later(() => { host.classList.add('is-leaving'); ctx.reveal(); }, tLeave);
      ctx.later(ctx.done, tLeave + T_LEAVE);
    });
  }

  LM.register('candle', candle);
})();
