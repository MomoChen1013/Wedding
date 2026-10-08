/* ============================================================
   openers/candle.js — 開場：燭光點亮
   ------------------------------------------------------------
   一開始整個畫面幾乎是黑的，只看得到三根還沒點的蠟燭：

     賓客點一下 → 中間那根被點燃（火柴擦亮的那一下）
     → 左邊那根 → 右邊那根 → 光一層一層把房間照亮，名字從暗處浮出來
     → 溶進網站

   房間被照得多亮由 host 上的 --lit（0 → 3）決定，
   每一根點起來就加一；牆、名字都照著這個值變亮。
   蠟燭與火焰是真的照片（img/chapel/candle-*.webp、flame.webp，出處見 README）。
   [data-variant="midnight-chapel"] 房間是大廳 hero 那座純白禮堂的照片，先是午夜的樣子：
   三根都點亮之後，燭火熄掉（冒一縷煙）、晨光湧進來，整座教堂變回白天 ——
   那就是走進大廳時看到的教堂。
============================================================ */
(function () {
  const LM = window.LobbyMotion;
  const ORDER = [1, 0, 2];               /* 中 → 左 → 右 */
  const GAP = 850;                       /* 一根接一根的間隔 */
  const T_HOLD = 2100;                   /* 三根都亮了之後停多久 */
  const T_LEAVE = 1200;
  const T_DAWN = 1000;                   /* 午夜教堂：三根都亮了之後多久天亮 */
  const T_DAY = 2300;                    /* 天亮之後停多久 */

  function candle(host, ctx) {
    host.classList.add('cd-host');
    host.style.setProperty('--lit', '0');
    const dawn = ctx.variant === 'midnight-chapel';
    const candles = [0, 1, 2].map((i) => `
      <div class="cd-candle cd-c${i}">
        <div class="cd-glow"></div>
        <div class="cd-flame"><i></i></div>
        <div class="cd-wick"></div>
        <div class="cd-wax"></div>
      </div>`).join('');
    host.innerHTML = `
      <div class="cd-room" aria-hidden="true"></div>
      <div class="cd-day" aria-hidden="true"></div>
      <div class="cd-text" aria-hidden="true">
        <div class="cd-kicker">${dawn ? 'From midnight, into the light' : 'Together, in candlelight'}</div>
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
      if (dawn) ctx.later(() => host.classList.add('is-dawn'), GAP * 2 + T_DAWN);
      const tLeave = dawn ? GAP * 2 + T_DAWN + T_DAY : GAP * 2 + T_HOLD;
      ctx.later(() => { host.classList.add('is-leaving'); ctx.reveal(); }, tLeave);
      ctx.later(ctx.done, tLeave + T_LEAVE);
    });
  }

  LM.register('candle', candle);
})();
