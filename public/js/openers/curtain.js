/* ============================================================
   openers/curtain.js — 開場：窗簾拉開
   ------------------------------------------------------------
   一開始是一個很暗的畫面，兩側垂著布幕：

     點一下 → 布幕往兩側收攏（不是滑走：是被收到兩邊、褶子擠在一起）
     → 光線從中間照進來 → 場景裡浮出兩個人的名字 → 溶進網站

   布幕後面是什麼由 [data-variant] 決定：
     預設            舞台：一束頂光打在名字上（戲劇、古典莊園）
     morning-window  一扇有窗格的窗、晨光，布幕是半透明的亞麻紗簾
============================================================ */
(function () {
  const LM = window.LobbyMotion;
  const T = { open: 2300, hold: 1900, leave: 1100 };

  function curtain(host, ctx) {
    host.classList.add('ct-host');
    host.innerHTML = `
      <div class="ct-scene" aria-hidden="true">
        <div class="ct-window"><i></i><i></i><i></i></div>
        <div class="ct-light"></div>
        <div class="ct-text">
          <div class="ct-kicker">Welcome to our wedding</div>
          <div class="ct-names">${LM.namesHtml(ctx)}</div>
          <div class="ct-date">${LM.esc(ctx.date)}</div>
        </div>
      </div>
      <div class="ct-panel ct-l" aria-hidden="true"></div>
      <div class="ct-panel ct-r" aria-hidden="true"></div>
      <div class="ct-valance" aria-hidden="true"></div>
      <div class="ct-dim" aria-hidden="true"></div>
      <div class="ct-hint"><span class="en">Draw the curtains</span><span class="cn">輕觸畫面・拉開窗簾</span></div>`;

    LM.hitButton(host, '拉開窗簾，進入邀請函', () => {
      if (host.classList.contains('is-open')) { ctx.finish(); return; }
      ctx.gesture();
      if (ctx.reduce) { ctx.finish(); return; }
      host.classList.add('is-open');
      ctx.later(() => { host.classList.add('is-leaving'); ctx.reveal(); }, T.open + T.hold);
      ctx.later(ctx.done, T.open + T.hold + T.leave);
    });
  }

  LM.register('curtain', curtain);
})();
