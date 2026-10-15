/* ============================================================
   openers/pressed.js — 開場：摘下壓花（舊代號 ribbon 照樣認得，見 wed-model.js 的 RENAMED_OPENINGS）
   ------------------------------------------------------------
   畫面中央是一張對開的邀請卡，左右兩扇在中間合起來，
   一小束壓花橫跨中縫，用兩段紙膠帶貼住 —— 卡片就是被它「封」起來的：

     點一下（或按住壓花往外拉）→ 兩段紙膠帶從一端撕起、往回折、被拿走
     → 那束壓花被拿起來（離開紙面、影子變大）、拿走
     → 卡片的左右兩扇往外打開，露出裡面的名字與日期
     → 卡片放大溶進網站

   拖曳：按住壓花往任何方向拉，膠帶跟著翹起來、花跟著手走一點；
   拉過門檻就撕開，沒拉到放手也算數 —— 拖曳是給想玩的人，不是唯一的路。
============================================================ */
(function () {
  const LM = window.LobbyMotion;
  const T = { peel: 700, lift: 350, away: 700, open: 1300, hold: 1500, leave: 1100 };
  const PULL = 90;   /* 拉多遠（px）算撕開 */

  /* 紙膠帶兩端是手撕的：鋸齒不規則。每一段各自隨機一次，兩段長得不一樣 */
  function torn(side) {
    const n = 9, pts = [];
    for (let i = 0; i <= n; i++) {
      const y = (i / n) * 100;
      const x = (i % 2 ? 2.5 : 0) + Math.random() * 5;
      pts.push(side === 'l' ? `${x.toFixed(1)}% ${y.toFixed(1)}%` : `${(100 - x).toFixed(1)}% ${y.toFixed(1)}%`);
    }
    return side === 'l'
      ? `polygon(100% 0,${pts.join(',')},100% 100%)`
      : `polygon(0 0,${pts.join(',')},0 100%)`;
  }
  /* 一段膠帶 = 兩半：右半 (a) 一直貼著，左半 (b) 以中間為軸撕起來往回折 */
  const tape = (cls) =>
    `<div class="pf-tape ${cls}"><i class="pf-tape-a" style="clip-path:${torn('r')}"></i><i class="pf-tape-b" style="clip-path:${torn('l')}"></i></div>`;

  function pressed(host, ctx) {
    host.classList.add('pf-host');
    host.innerHTML = `
      <div class="pf-table" aria-hidden="true"></div>
      <div class="pf-stage" aria-hidden="true">
        <div class="pf-card">
          <div class="pf-inside">
            <div class="pf-kicker">Together with their families</div>
            <div class="pf-names">${LM.namesHtml(ctx)}</div>
            <div class="pf-rule"></div>
            <div class="pf-date">${LM.esc(ctx.date)}</div>
            <div class="pf-note">request the pleasure of your company</div>
          </div>
          <div class="pf-panel pf-pl"><div class="pf-face"></div><div class="pf-face pf-back"></div></div>
          <div class="pf-panel pf-pr"><div class="pf-face"><div class="pf-label"><b>No. 01</b><span>For our dearest guest</span></div></div><div class="pf-face pf-back"></div></div>
          <i class="pf-posy"></i>
          ${tape('pf-tape-1')}
          ${tape('pf-tape-2')}
        </div>
      </div>
      <div class="pf-handle" role="presentation"></div>
      <div class="pf-hint"><span class="en">Peel off the flowers</span><span class="cn">摘下壓花・或輕觸畫面</span></div>`;

    let started = false;
    function peel() {
      if (started) { ctx.finish(); return; }
      started = true;
      ctx.gesture();
      if (ctx.reduce) { ctx.finish(); return; }
      host.classList.remove('is-pulling');
      host.classList.add('is-peeling');
      ctx.later(() => host.classList.add('is-lifted'), T.peel);
      ctx.later(() => host.classList.add('is-gone'), T.peel + T.lift);
      const tOpen = T.peel + T.lift + T.away - 200;
      ctx.later(() => host.classList.add('is-open'), tOpen);
      const tLeave = tOpen + T.open + T.hold;
      ctx.later(() => { host.classList.add('is-leaving'); ctx.reveal(); }, tLeave);
      ctx.later(ctx.done, tLeave + T.leave);
    }
    LM.hitButton(host, '摘下壓花，打開邀請函', peel);

    /* 按住壓花拉：膠帶跟著翹（--pf-pull 0→1）、花跟著手走一點（--pf-dx／--pf-dy） */
    const handle = host.querySelector('.pf-handle');
    let p0 = null;
    const setPull = (dx, dy) => {
      const d = Math.hypot(dx, dy);
      host.style.setProperty('--pf-pull', Math.min(d / PULL, 1).toFixed(3));
      host.style.setProperty('--pf-dx', (dx * .28).toFixed(1));
      host.style.setProperty('--pf-dy', (dy * .28).toFixed(1));
      return d;
    };
    handle.addEventListener('pointerdown', (e) => {
      if (started) return;
      p0 = { x: e.clientX, y: e.clientY };
      handle.setPointerCapture(e.pointerId);
      host.classList.add('is-pulling');
    });
    handle.addEventListener('pointermove', (e) => {
      if (!p0) return;
      if (setPull(e.clientX - p0.x, e.clientY - p0.y) > PULL) { p0 = null; peel(); }
    });
    handle.addEventListener('pointerup', () => {
      if (!p0) return;
      p0 = null;
      peel();                                            /* 只是點了一下：一樣算數 */
    });
    handle.addEventListener('pointercancel', () => {
      p0 = null;
      host.classList.remove('is-pulling');
      setPull(0, 0);
    });
  }

  LM.register('pressed', pressed);
})();
