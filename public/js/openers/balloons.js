/* ============================================================
   openers/balloons.js — 開場：氣球升空（美式戶外婚禮派對）
   ------------------------------------------------------------
   一開始整個畫面塞滿了氣球（珊瑚紅、奶油黃、天空藍、薄荷綠、白、腮紅粉、
   一點點金色 —— 都是真的乳膠氣球照片），每一顆都在原地輕輕晃：

     氣球一顆一顆被放開 → 慢慢升空、越飛越快、左右飄
     → 底下露出一片真的夏日藍天與白雲（img/party/sky.webp），
       兩條串燈橫過天空 → 名字浮在天空上 → 溶進網站
       （美式戶外派對的首頁 hero 就是同一片天空）

   自己演完就進站（fn.auto），點畫面任何地方可以跳過。
   氣球是依照當下視窗大小排出來的（手機直立、桌機橫向都塞得滿），
   亂數有固定的種子：每一次打開都是同一批氣球。

   ▸ 天空上的串燈（window.PartySky.svg()）也給大廳用：
     lobby-party.html 的 hero 是用同一支函式產出來的
     （scripts/build-party-sky.js），開場和大廳才會是同一片天空。
============================================================ */
(function () {
  const T_RELEASE = 1300;   /* 開始放氣球 */
  const T_REVEAL = 6400;    /* 天空露出來、名字也出來了，開始溶進網站 */
  const T_DONE = 7400;

  const f = (n) => +(+n).toFixed(1);
  function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  /* 圖檔（public/img/party/）：從這一支自己的網址往回推，正式站與 preview 都對得上。
     build-party-sky.js 在 Node 裡跑這一支時沒有 document，用不到圖，給個預設值就好 */
  const IMG = (() => {
    try { return new URL('../../img/party/', document.currentScript.src).href; } catch (e) { return '/img/party/'; }
  })();

  /* ==========================================================
     天空上的串燈（viewBox 1600×1000；xMidYMax slice）
     天空本身是一張真的照片（img/party/sky.webp，CSS 鋪在後面），
     這裡只畫橫過天空的兩條串燈 —— 開場與大廳 hero 共用
     ========================================================== */
  function sky() {
    let s = `<defs>
      <radialGradient id="ps-bulb"><stop offset="0" stop-color="#fffbe6"/><stop offset=".25" stop-color="#ffe9a8" stop-opacity=".9"/><stop offset="1" stop-color="#ffd36a" stop-opacity="0"/></radialGradient>
    </defs>`;
    const strand = (x0, y0, x1, y1, sag, n, cls) => {
      const cx = (x0 + x1) / 2, cy = Math.max(y0, y1) + sag;
      let g = `<path d="M${x0} ${y0}Q${cx} ${cy} ${x1} ${y1}" fill="none" stroke="#2f3338" stroke-width="2.4"/>`;
      for (let i = 1; i < n; i++) {
        const t = i / n, u = 1 - t;
        const x = u * u * x0 + 2 * u * t * cx + t * t * x1, y = u * u * y0 + 2 * u * t * cy + t * t * y1;
        g += `<g transform="translate(${f(x)} ${f(y)})" class="ps-bulb" style="--i:${i}"><circle r="26" cy="16" fill="url(#ps-bulb)" class="ps-glow"/><rect x="-3" y="0" width="6" height="7" fill="#2f3338"/><ellipse cy="16" rx="7" ry="9.5" fill="#fff6d2"/></g>`;
      }
      return `<g class="${cls}">${g}</g>`;
    };
    s += strand(-40, 40, 1640, 110, 260, 22, 'ps-lights ps-lights-a');
    s += strand(-40, -20, 900, -40, 150, 12, 'ps-lights ps-lights-b');
    return s;
  }

  window.PartySky = {
    svg: () => `<svg class="ps-sky" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">${sky()}</svg>`,
  };

  const LM = window.LobbyMotion;
  if (!LM) return;

  /* ==========================================================
     氣球
     ========================================================== */
  /* 真的乳膠氣球：一顆白氣球的照片去背，再依它的明暗套上每一種顏色（img/party/balloon-*.webp） */
  const COLORS = ['coral', 'butter', 'sky', 'mint', 'pearl', 'blush'];

  function balloon(i, r) {
    const c = r() < .08 ? 'gold' : COLORS[Math.floor(r() * COLORS.length)];
    const sx = (r() - .5) * 14, sy = 108 + r() * 14;
    return `<img class="bp-img" src="${IMG}balloon-${c}.webp" alt="" draggable="false">` +
      `<svg class="bp-str" viewBox="0 0 40 130"><path d="M20 0C${f(20 + sx)} 34 ${f(20 - sx)} 70 ${f(20 + sx * .6)} ${f(sy)}"/></svg>`;
  }

  function crowd(W, H) {
    const r = rng(20260704);
    const R = Math.max(34, Math.min(72, Math.min(W, H) * .09));
    const out = [];
    let row = 0;
    for (let y = -R * .6; y < H + R * 1.4; y += R * 1.18, row++) {
      for (let x = -R * .5 + (row % 2) * R * .78; x < W + R; x += R * 1.5) {
        const k = .82 + r() * .4, s = R * k;
        const px = x + (r() - .5) * R * .5, py = y + (r() - .5) * R * .4;
        out.push({ x: px, y: py, s, z: Math.round(py + r() * R), html: balloon(out.length, r),
          del: (1 - py / H) * .35 + r() * 1.1, dur: 3 + r() * 1.7, drift: (r() - .5) * 140, bob: 2.2 + r() * 1.6, ph: r() * -3 });
      }
    }
    return out;
  }

  function balloons(host, ctx) {
    host.classList.add('bp-host');
    host.tabIndex = 0;
    host.setAttribute('role', 'button');
    host.setAttribute('aria-label', '開場動畫，點一下直接進入邀請函');
    const W = innerWidth, H = innerHeight;
    const list = crowd(W, H);
    host.innerHTML = `
      <div class="bp-scene" aria-hidden="true">${window.PartySky.svg()}</div>
      <div class="bp-text" aria-hidden="true">
        <div class="bp-kicker">Let’s celebrate!</div>
        <div class="bp-names">${LM.namesHtml(ctx)}</div>
        <div class="bp-date">${LM.esc(ctx.date)}</div>
      </div>
      <div class="bp-crowd" aria-hidden="true">${list.map((b) =>
        `<div class="bp-b" style="left:${f(b.x - b.s)}px;top:${f(b.y - b.s * 1.2)}px;width:${f(b.s * 2)}px;z-index:${b.z};` +
        `--dy:${f(-(b.y + b.s * 4.4))}px;--del:${b.del.toFixed(2)}s;--dur:${b.dur.toFixed(2)}s;--dx:${f(b.drift)};--bob:${b.bob.toFixed(2)}s;--ph:${b.ph.toFixed(2)}s">` +
        `<div class="bp-rise"><div class="bp-sway">${b.html}</div></div></div>`).join('')}</div>
      <div class="bp-skip">輕觸畫面・直接進入</div>`;

    if (ctx.reduce) { host.classList.add('is-still'); return; }
    ctx.later(() => host.classList.add('is-up'), T_RELEASE);
    ctx.later(() => { host.classList.add('is-leaving'); ctx.reveal(); }, T_REVEAL);
    ctx.later(ctx.done, T_DONE);
  }
  balloons.auto = true;

  LM.register('balloons', balloons);
})();
