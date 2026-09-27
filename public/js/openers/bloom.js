/* ============================================================
   openers/bloom.js — 開場：花朵盛開
   ------------------------------------------------------------
   一開始只有土裡冒出來的一小截芽：

     莖一路長上去 → 葉子一片一片張開 → 頂端結出花苞
     → 花瓣由內而外打開 → 「Our story begins here」與兩個人的名字浮出來
     → 花朵留在原地、畫面溶進網站

   自己演完就進站（fn.auto），點畫面任何地方可以跳過。
   植物是用程式算出來的 SVG（莖是一條曲線，葉子沿著曲線長），
   每一段的出場時間寫在元素的 --d 上，動作本身在 css/openers/bloom.css。
============================================================ */
(function () {
  const LM = window.LobbyMotion;
  const T_REVEAL = 5600;   /* 花開完、字出來之後，開始溶進網站 */
  const T_DONE = 6600;

  const f = (n) => +n.toFixed(1);

  /* 莖：一條從土裡往上的三次曲線 */
  const P0 = [200, 540], P1 = [168, 420], P2 = [236, 300], P3 = [200, 196];
  function at(t) {
    const u = 1 - t;
    const x = u*u*u*P0[0] + 3*u*u*t*P1[0] + 3*u*t*t*P2[0] + t*t*t*P3[0];
    const y = u*u*u*P0[1] + 3*u*u*t*P1[1] + 3*u*t*t*P2[1] + t*t*t*P3[1];
    const dx = 3*u*u*(P1[0]-P0[0]) + 6*u*t*(P2[0]-P1[0]) + 3*t*t*(P3[0]-P2[0]);
    const dy = 3*u*u*(P1[1]-P0[1]) + 6*u*t*(P2[1]-P1[1]) + 3*t*t*(P3[1]-P2[1]);
    return [x, y, Math.atan2(dy, dx) * 180 / Math.PI];
  }

  function plant() {
    let s = '';
    s += `<ellipse class="bl-soil" cx="200" cy="544" rx="70" ry="7"/>`;
    s += `<path class="bl-stem" pathLength="1" d="M${P0} C${P1} ${P2} ${P3}"/>`;
    /* 葉子：沿著莖交錯長出來，越上面越小、越晚 */
    const leaves = [[.16, 1], [.3, -1], [.45, 1], [.6, -1], [.74, 1]];
    leaves.forEach(([t, side], i) => {
      const [x, y, a] = at(t);
      const len = 70 - i * 9;
      const rot = a + side * 62;
      s += `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})">` +
        `<path class="bl-leaf" style="--d:${(1.05 + t * 1.3).toFixed(2)}s" ` +
        `d="M0 0C${f(len*.3)} ${f(-len*.24)} ${f(len*.72)} ${f(-len*.2)} ${len} 0C${f(len*.72)} ${f(len*.2)} ${f(len*.3)} ${f(len*.24)} 0 0Z"/>` +
        `<path class="bl-vein" style="--d:${(1.2 + t * 1.3).toFixed(2)}s" pathLength="1" d="M4 0L${f(len*.86)} 0"/></g>`;
    });
    /* 兩朵小花苞，在側枝上 */
    for (const [t, side, d] of [[.52, -1, 3.2], [.66, 1, 3.4]]) {
      const [x, y, a] = at(t);
      const r = a + side * 70;
      const ex = x + Math.cos(r * Math.PI / 180) * 34, ey = y + Math.sin(r * Math.PI / 180) * 34;
      s += `<path class="bl-twig" style="--d:${(d - .8).toFixed(1)}s" pathLength="1" d="M${f(x)} ${f(y)}Q${f((x + ex) / 2)} ${f(Math.min(y, ey) - 8)} ${f(ex)} ${f(ey)}"/>`;
      s += `<g transform="translate(${f(ex)} ${f(ey)})"><g class="bl-bud" style="--d:${d}s">` +
        [0, 72, 144, 216, 288].map((k) => `<ellipse rx="5" ry="8" transform="rotate(${k}) translate(0 -6)"/>`).join('') +
        `<circle r="3.2" class="bl-heart"/></g></g>`;
    }
    /* 主花：外、中、內三圈花瓣，由內而外一圈一圈打開 */
    s += `<g transform="translate(${P3[0]} ${P3[1]})"><g class="bl-flower">`;
    s += `<g class="bl-sepals">` + [0, 72, 144, 216, 288].map((k) =>
      `<path d="M0 0C-6 10-4 26 0 34C4 26 6 10 0 0Z" transform="rotate(${k + 36})"/>`).join('') + `</g>`;
    const rings = [
      { n: 8, len: 58, w: 30, d: 3.05, cls: 'bl-p3', off: 0 },
      { n: 8, len: 44, w: 24, d: 2.8, cls: 'bl-p2', off: 22.5 },
      { n: 6, len: 30, w: 18, d: 2.55, cls: 'bl-p1', off: 10 },
    ];
    for (const r of rings) {
      for (let k = 0; k < r.n; k++) {
        const rot = r.off + k * 360 / r.n;
        s += `<g transform="rotate(${f(rot)})"><path class="bl-petal ${r.cls}" style="--d:${(r.d + k * .045).toFixed(2)}s" ` +
          `d="M0 0C${-r.w * .6} ${-r.len * .3} ${-r.w * .55} ${-r.len * .9} 0 ${-r.len}C${r.w * .55} ${-r.len * .9} ${r.w * .6} ${-r.len * .3} 0 0Z"/></g>`;
      }
    }
    s += `<circle class="bl-center" r="11"/>`;
    for (let k = 0; k < 14; k++) {
      const a = k * 137.5 * Math.PI / 180, rr = 2.2 * Math.sqrt(k + 1);
      s += `<circle class="bl-seed" style="--d:${(3.3 + k * .02).toFixed(2)}s" cx="${f(Math.cos(a) * rr)}" cy="${f(Math.sin(a) * rr)}" r="1.3"/>`;
    }
    s += `</g></g>`;
    return s;
  }

  function bloom(host, ctx) {
    host.classList.add('bl-host');
    host.tabIndex = 0;
    host.setAttribute('role', 'button');
    host.setAttribute('aria-label', '開場動畫，點一下直接進入邀請函');
    host.innerHTML = `
      <div class="bl-bg" aria-hidden="true"></div>
      <div class="bl-light" aria-hidden="true"></div>
      <div class="bl-stage" aria-hidden="true">
        <svg class="bl-plant" viewBox="0 0 400 560">${plant()}</svg>
        <div class="bl-text">
          <div class="bl-kicker">Our story begins here</div>
          <div class="bl-names">${LM.namesHtml(ctx)}</div>
          <div class="bl-date">${LM.esc(ctx.date)}</div>
        </div>
      </div>
      <div class="bl-skip">輕觸畫面・直接進入</div>`;

    if (ctx.reduce) { host.classList.add('is-still'); return; }
    ctx.later(() => { host.classList.add('is-leaving'); ctx.reveal(); }, T_REVEAL);
    ctx.later(ctx.done, T_DONE);
  }
  bloom.auto = true;

  LM.register('bloom', bloom);
})();
