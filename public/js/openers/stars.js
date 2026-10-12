/* ============================================================
   openers/stars.js — 開場：星圖展開
   ------------------------------------------------------------
   一開始只有幾顆星：

     滿天的小星星一顆一顆亮起來 → 星圖的外環畫出來
     → 兩個星座從同一顆星出發、各描半邊，最後在上方交會，合起來是一顆心
     → 兩個人的名字與日期浮出來 → 整張星圖縮小、往上退，溶進網站
       （Night Sky 的首頁 hero 上有同一張星圖，縮小之後就是它）

   自己演完就進站（fn.auto），點畫面任何地方可以跳過。
   星星的位置是固定的亂數種子算出來的：每一次打開都是同一片天空。
============================================================ */
(function () {
  const LM = window.LobbyMotion;
  const T_REVEAL = 5900;
  const T_DONE = 7000;
  const f = (n) => +n.toFixed(1);

  /* 兩個星座：一左一右，從同一顆星（心形的尖端）出發，
     各自描完半邊，最後在心形上緣的凹口交會 */
  const A = [[300, 392], [246, 342], [202, 286], [200, 232], [236, 196], [276, 204], [300, 240]];
  const B = A.map(([x, y]) => [600 - x, y]);

  function rng(seed) {
    let s = seed;
    return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  function chart() {
    const r = rng(20270116);
    let s = '';
    /* 滿天的星 */
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 290;
      const x = 300 + Math.cos(a) * d, y = 300 + Math.sin(a) * d;
      s += `<circle class="st-dust" cx="${f(x)}" cy="${f(y)}" r="${f(.6 + r() * 1.3)}" ` +
        `style="--d:${(r() * 1.4).toFixed(2)}s;--tw:${(2 + r() * 3).toFixed(2)}s"/>`;
    }
    /* 星圖的環：兩圈，外圈有刻度 */
    s += `<circle class="st-ring" cx="300" cy="300" r="270" pathLength="1"/>`;
    s += `<circle class="st-ring st-ring-2" cx="300" cy="300" r="250" pathLength="1"/>`;
    let ticks = '';
    for (let k = 0; k < 72; k++) {
      const a = k * 5 * Math.PI / 180, l = k % 6 === 0 ? 12 : 6;
      ticks += `M${f(300 + Math.cos(a) * 270)} ${f(300 + Math.sin(a) * 270)}L${f(300 + Math.cos(a) * (270 - l))} ${f(300 + Math.sin(a) * (270 - l))}`;
    }
    s += `<path class="st-ticks" d="${ticks}"/>`;
    s += `<circle class="st-ring st-ring-3" cx="300" cy="300" r="130" pathLength="1"/>`;
    /* 星座連線：一段一段接著畫，兩邊同時 */
    const seg = (pts, side) => pts.slice(1).map((p, i) =>
      `<path class="st-line" pathLength="1" style="--d:${(1.8 + i * .34).toFixed(2)}s" d="M${pts[i]} L${p}"/>`).join('') +
      pts.map((p, i) => `<g transform="translate(${p})"><g class="st-node${i === pts.length - 1 ? ' st-heart' : ''}" style="--d:${(1.7 + i * .34).toFixed(2)}s">` +
        `<circle r="${i === pts.length - 1 ? 5 : 3.2}"/><path d="M0 -11V11M-11 0H11" /></g></g>`).join('');
    s += seg(A, 'a') + seg(B, 'b');
    return s;
  }

  function stars(host, ctx) {
    host.classList.add('st-host');
    host.tabIndex = 0;
    host.setAttribute('role', 'button');
    host.setAttribute('aria-label', '開場動畫，點一下直接進入邀請函');
    host.innerHTML = `
      <div class="st-sky" aria-hidden="true"></div>
      <div class="st-stage" aria-hidden="true">
        <svg class="st-chart" viewBox="0 0 600 600">${chart()}</svg>
        <div class="st-text">
          <div class="st-kicker">Written in the stars</div>
          <div class="st-names">${LM.namesHtml(ctx)}</div>
          <div class="st-date">${LM.esc(ctx.date)}</div>
        </div>
      </div>
      <div class="st-skip">輕觸畫面・直接進入</div>`;

    if (ctx.reduce) { host.classList.add('is-still'); return; }
    ctx.later(() => { host.classList.add('is-leaving'); ctx.reveal(); }, T_REVEAL);
    ctx.later(ctx.done, T_DONE);
  }
  stars.auto = true;

  LM.register('stars', stars);
})();
