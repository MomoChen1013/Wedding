/* ============================================================
   openers/ribbon.js — 開場：拉開絲帶
   ------------------------------------------------------------
   畫面中央是一張對開的邀請卡，左右兩扇在中間合起來，
   一條緞帶十字綁著、正中間打了一個蝴蝶結：

     拉一下緞帶尾（拖曳；或直接點一下）→ 蝴蝶結鬆開、緞帶滑走
     → 卡片的左右兩扇往外打開，露出裡面的名字與日期
     → 卡片放大溶進網站

   拖曳：按住右邊那條緞帶尾往右拉，拉過門檻就鬆開；沒拉到就彈回去。
   點一下畫面任何地方效果一樣 —— 拖曳是給想玩的人，不是唯一的路。
============================================================ */
(function () {
  const LM = window.LobbyMotion;
  const T = { untie: 900, open: 1300, hold: 1500, leave: 1100 };
  const PULL = 70;   /* 拉多遠（px）算拉開 */

  const BOW = `
    <svg class="rb-bow" viewBox="-64 -44 128 104" aria-hidden="true">
      <defs>
        <linearGradient id="rbSatin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style="stop-color:var(--rb-hi)"/><stop offset=".45" style="stop-color:var(--rb-ribbon)"/>
          <stop offset="1" style="stop-color:var(--rb-lo)"/>
        </linearGradient>
      </defs>
      <g class="rb-tail rb-tail-l"><path d="M-4 6L-30 50L-19 47L-14 57L3 10Z" fill="url(#rbSatin)"/></g>
      <g class="rb-loop rb-loop-l"><path d="M0 0C-18-32-60-34-56 0C-60 26-20 28 0 0Z" fill="url(#rbSatin)"/>
        <path d="M-8-4C-22-20-44-22-46-4" fill="none" style="stroke:var(--rb-lo)" stroke-width="1.4" opacity=".5"/></g>
      <g class="rb-loop rb-loop-r"><path d="M0 0C18-32 60-34 56 0C60 26 20 28 0 0Z" fill="url(#rbSatin)"/>
        <path d="M8-4C22-20 44-22 46-4" fill="none" style="stroke:var(--rb-lo)" stroke-width="1.4" opacity=".5"/></g>
      <ellipse class="rb-knot" cx="0" cy="1" rx="9" ry="11" fill="url(#rbSatin)"/>
    </svg>`;

  /* 左扇封面上的一枝壓花（植物圖鑑式的線稿） */
  const SPRIG = `
    <svg class="rb-sprig" viewBox="0 0 80 160" aria-hidden="true">
      <path d="M40 158C38 120 44 80 38 20" fill="none" stroke="currentColor" stroke-width="1.2"/>
      ${[[40, 130, -1], [41, 108, 1], [40, 86, -1], [39, 64, 1], [39, 44, -1]].map(([x, y, s], i) =>
        `<path d="M${x} ${y}C${x + s * 10} ${y - 10} ${x + s * 22} ${y - 8} ${x + s * 26} ${y - 16}C${x + s * 16} ${y - 18} ${x + s * 6} ${y - 12} ${x} ${y}Z" fill="currentColor" opacity="${.55 + i * .08}"/>`).join('')}
      ${[[38, 18], [30, 26], [46, 28]].map(([x, y]) =>
        [0, 72, 144, 216, 288].map((a) => `<circle cx="${(x + Math.cos(a * Math.PI / 180) * 3).toFixed(1)}" cy="${(y + Math.sin(a * Math.PI / 180) * 3).toFixed(1)}" r="2.3" style="fill:var(--rb-flower)"/>`).join('')).join('')}
    </svg>`;

  function ribbon(host, ctx) {
    host.classList.add('rb-host');
    host.innerHTML = `
      <div class="rb-table" aria-hidden="true"></div>
      <div class="rb-stage" aria-hidden="true">
        <div class="rb-card">
          <div class="rb-inside">
            <div class="rb-kicker">Together with their families</div>
            <div class="rb-names">${LM.namesHtml(ctx)}</div>
            <div class="rb-rule"></div>
            <div class="rb-date">${LM.esc(ctx.date)}</div>
            <div class="rb-note">request the pleasure of your company</div>
          </div>
          <div class="rb-panel rb-pl"><div class="rb-face">${SPRIG}</div><div class="rb-face rb-back"></div></div>
          <div class="rb-panel rb-pr"><div class="rb-face"><div class="rb-label"><b>No. 01</b><span>For our dearest guest</span></div></div><div class="rb-face rb-back"></div></div>
          <div class="rb-band rb-band-v"></div>
          <div class="rb-band rb-band-h"></div>
          ${BOW}
        </div>
      </div>
      <div class="rb-handle" role="presentation"></div>
      <div class="rb-hint"><span class="en">Pull the ribbon</span><span class="cn">拉開緞帶・或輕觸畫面</span></div>`;

    let started = false;
    function untie() {
      if (started) { ctx.finish(); return; }
      started = true;
      ctx.gesture();
      if (ctx.reduce) { ctx.finish(); return; }
      host.classList.add('is-untied');
      ctx.later(() => host.classList.add('is-open'), T.untie);
      const tLeave = T.untie + T.open + T.hold;
      ctx.later(() => { host.classList.add('is-leaving'); ctx.reveal(); }, tLeave);
      ctx.later(ctx.done, tLeave + T.leave);
    }
    LM.hitButton(host, '拉開緞帶，打開邀請函', untie);

    /* 拖曳緞帶尾：跟著手指走一段，過門檻就鬆開，沒到就彈回 */
    const handle = host.querySelector('.rb-handle');
    const tail = host.querySelector('.rb-tail-l');
    let x0 = null;
    handle.addEventListener('pointerdown', (e) => {
      if (started) return;
      x0 = e.clientX;
      handle.setPointerCapture(e.pointerId);
      host.classList.add('is-pulling');
    });
    handle.addEventListener('pointermove', (e) => {
      if (x0 === null) return;
      const dx = Math.max(0, x0 - e.clientX);          /* 往左拉（尾巴在左下） */
      tail.style.transform = `translate(${-Math.min(dx, 120) * .35}px, ${Math.min(dx, 120) * .12}px) rotate(${Math.min(dx, 120) * .12}deg)`;
      if (dx > PULL) { x0 = null; tail.style.transform = ''; host.classList.remove('is-pulling'); untie(); }
    });
    const release = () => {
      if (x0 === null) return;
      x0 = null;
      host.classList.remove('is-pulling');
      tail.style.transform = '';
      untie();                                           /* 只是點了一下：一樣算數 */
    };
    handle.addEventListener('pointerup', release);
    handle.addEventListener('pointercancel', () => { x0 = null; tail.style.transform = ''; host.classList.remove('is-pulling'); });
  }

  LM.register('ribbon', ribbon);
})();
