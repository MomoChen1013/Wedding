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

  /* 緞面的布紋：一張真的絲綢掃描（Khronos glTF Sample Assets 的 SpecularSilkPouf，
     © 2023 Wayfair，CC BY 4.0）的 normal map，打光成灰階之後放在 css/openers/satin-silk.jpg。
     緞帶的顏色與光澤是程式畫的漸層，布紋用 soft-light 疊上去 —— 所以有真的絲綢紋理，又能動。
     路徑從這支 script 自己的位置推回去（預覽頁與正式站的根目錄不一樣） */
  const SCRIPT = document.currentScript && document.currentScript.src;
  const TEX = SCRIPT ? SCRIPT.replace(/js\/openers\/ribbon\.js.*$/, 'css/openers/satin-silk.jpg') : '/css/openers/satin-silk.jpg';

  /* 蝴蝶結：兩個折起來的圈（看得到圈裡面那一面比較暗）、兩條魚尾剪口的尾巴、中間一個有皺褶的結。
     每一塊畫兩次：一次是緞面的漸層，一次是布紋（soft-light） */
  const SHAPES = {
    tailL: 'M-7 6C-14 22-24 40-38 60L-29 56L-24 66C-12 46-4 26 5 9Z',
    tailR: 'M7 6C13 24 20 42 30 62L36 55L44 58C30 38 18 22 5 4Z',
    loopL: 'M-5-5C-22-40-66-46-74-16C-80 8-54 20-22 10C-14 8-8 6-4 6Z',
    loopLin: 'M-8-2C-24-26-52-30-58-14C-44-22-26-16-9 5Z',
    loopR: 'M5-5C22-40 66-46 74-16C80 8 54 20 22 10C14 8 8 6 4 6Z',
    loopRin: 'M8-2C24-26 52-30 58-14C44-22 26-16 9 5Z',
    knot: 'M-11-10C-4-14 4-14 11-10C14 0 14 6 11 14C4 18-4 18-11 14C-14 6-14 0-11-10Z',
  };
  const part = (cls, key, grad) =>
    `<g class="${cls}"><use href="#rb-${key}" fill="url(#${grad})"/><use class="rb-tex" href="#rb-${key}" fill="url(#rbTex)"/></g>`;
  const BOW = `
    <svg class="rb-bow" viewBox="-80 -52 160 124" aria-hidden="true">
      <defs>
        ${Object.entries(SHAPES).map(([k, d]) => `<path id="rb-${k}" d="${d}"/>`).join('')}
        <pattern id="rbTex" patternUnits="userSpaceOnUse" width="64" height="22" patternTransform="rotate(-24)">
          <image href="${TEX}" width="64" height="22" preserveAspectRatio="none"/></pattern>
        <linearGradient id="rbLoopL" x1="0" y1="0" x2=".35" y2="1">
          <stop offset="0" style="stop-color:var(--rb-lo)"/><stop offset=".3" style="stop-color:var(--rb-ribbon)"/>
          <stop offset=".46" style="stop-color:var(--rb-hi)"/><stop offset=".6" style="stop-color:var(--rb-ribbon)"/>
          <stop offset="1" style="stop-color:var(--rb-lo)"/></linearGradient>
        <linearGradient id="rbLoopR" x1="1" y1="0" x2=".65" y2="1">
          <stop offset="0" style="stop-color:var(--rb-lo)"/><stop offset=".3" style="stop-color:var(--rb-ribbon)"/>
          <stop offset=".46" style="stop-color:var(--rb-hi)"/><stop offset=".6" style="stop-color:var(--rb-ribbon)"/>
          <stop offset="1" style="stop-color:var(--rb-lo)"/></linearGradient>
        <linearGradient id="rbIn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style="stop-color:var(--rb-deep)"/><stop offset="1" style="stop-color:var(--rb-lo)"/></linearGradient>
        <linearGradient id="rbTail" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style="stop-color:var(--rb-lo)"/><stop offset=".4" style="stop-color:var(--rb-hi)"/>
          <stop offset=".62" style="stop-color:var(--rb-ribbon)"/><stop offset="1" style="stop-color:var(--rb-lo)"/></linearGradient>
        <radialGradient id="rbKnot" cx=".42" cy=".38" r=".7">
          <stop offset="0" style="stop-color:var(--rb-hi)"/><stop offset=".55" style="stop-color:var(--rb-ribbon)"/>
          <stop offset="1" style="stop-color:var(--rb-lo)"/></radialGradient>
        <filter id="rbSoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.4"/></filter>
      </defs>
      ${part('rb-tail rb-tail-r', 'tailR', 'rbTail')}
      ${part('rb-tail rb-tail-l', 'tailL', 'rbTail')}
      <g class="rb-loop rb-loop-l">${part('', 'loopL', 'rbLoopL')}${part('', 'loopLin', 'rbIn')}
        <path class="rb-glint" d="M-12-10C-30-34-58-36-64-18" filter="url(#rbSoft)"/></g>
      <g class="rb-loop rb-loop-r">${part('', 'loopR', 'rbLoopR')}${part('', 'loopRin', 'rbIn')}
        <path class="rb-glint" d="M12-10C30-34 58-36 64-18" filter="url(#rbSoft)"/></g>
      <g class="rb-knot">${part('', 'knot', 'rbKnot')}
        <path class="rb-crease" d="M-6-9C-3-2-3 6-6 13M5-9C3-2 3 6 6 13"/>
        <path class="rb-glint" d="M-4-8C-1-3-1 4-3 9" filter="url(#rbSoft)"/></g>
    </svg>`;

  /* 左扇封面上的一枝壓花：一張真的壓花照片（樣子在 css/openers/ribbon.css 的 .rb-sprig） */
  const SPRIG = '<i class="rb-sprig" aria-hidden="true"></i>';

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

    /* 光澤跟著游標走：手一動，緞面上的亮光就跟著滑（手機上沒有游標，就讓它自己慢慢飄） */
    host.addEventListener('pointermove', (e) => {
      const r = host.getBoundingClientRect();
      host.style.setProperty('--rb-lx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
      host.style.setProperty('--rb-ly', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
      host.classList.add('is-lit');
    });

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
