/* ============================================================
   openers/balloons.js — 開場：氣球升空（美式戶外婚禮派對）
   ------------------------------------------------------------
   一開始整個畫面塞滿了一束一束粉嫩的氣球（粉紅、蜜桃、薄荷、薰衣草、奶油白，
   再夾幾束混色的真乳膠氣球 —— 都是真的氣球照片去背、調成低對比的粉彩，public/img/party/bunch-*.webp），
   分成遠、中、近三層：遠的小、淡一點；近的大、有一點景深的糊。每一束都在原地輕輕晃：

     氣球一束一束被放開 → 慢慢升空、越飛越快（近的飛得比遠的快）
     → 底下露出一片藍天、綠色草原與遠山（img/party/meadow.webp）
     → 名字浮在天空上 → 溶進網站（美式戶外派對的首頁 hero 就是同一片草原）

   自己演完就進站（fn.auto），點畫面任何地方可以跳過。
   氣球是依照當下視窗大小排出來的（手機直立、桌機橫向都塞得滿），
   亂數有固定的種子：每一次打開都是同一批氣球。
============================================================ */
(function () {
  const T_RELEASE = 1200;   /* 開始放氣球 */
  const T_REVEAL = 6200;    /* 草原露出來、名字也出來了，開始溶進網站 */
  const T_DONE = 7200;

  const LM = window.LobbyMotion;
  if (!LM) return;

  const f = (n) => +(+n).toFixed(1);
  function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  /* 圖檔（public/img/party/）：從這一支自己的網址往回推，正式站與 preview 都對得上 */
  const IMG = (() => {
    try { return new URL('../../img/party/', document.currentScript.src).href; } catch (e) { return '/img/party/'; }
  })();

  /* 一束氣球的照片：ar = 寬 / 高；head = 氣球本身佔圖高的比例（下面是線） */
  const BUNCH = {
    pink: { ar: 514 / 899, head: .6 },
    peach: { ar: 514 / 899, head: .6 },
    mint: { ar: 514 / 899, head: .6 },
    lilac: { ar: 514 / 899, head: .6 },
    cream: { ar: 514 / 899, head: .6 },
    mix: { ar: 1000 / 773, head: .72 },
  };
  const MIX = ['pink', 'cream', 'mint', 'peach', 'lilac', 'pink', 'mix', 'cream', 'peach', 'lilac', 'mint', 'mix'];

  /* 三層：遠、中、近。k = 相對大小、gap = 間距（相對於一束氣球頭的寬）、
     sp = 飛的速度（越近越快）、cls = 景深 */
  const LAYERS = [
    { k: .6, gap: 1.15, sp: 1.12, cls: 'is-far' },
    { k: 1, gap: .86, sp: 1, cls: 'is-mid' },
    { k: 1.5, gap: 1.5, sp: .8, cls: 'is-near' },
  ];

  function crowd(W, H) {
    const r = rng(20260704);
    /* 中景一束氣球「頭」的寬度 */
    const base = Math.max(150, Math.min(330, Math.min(W, H) * .5));
    const out = [];
    let n = 0;
    LAYERS.forEach((L, li) => {
      const hw = base * L.k;                /* 氣球頭的寬 */
      const step = hw * L.gap;
      let row = 0;
      for (let y = -hw * .35; y < H + hw * .2; y += step * .82, row++) {
        for (let x = -hw * .3 + (row % 2) * step * .5; x < W + hw * .3; x += step) {
          if (li === 2 && r() < .45) continue;          /* 近景稀一點，不要整片糊掉 */
          const kind = MIX[(n++ + row) % MIX.length];
          const b = BUNCH[kind];
          const s = 1 + (r() - .5) * .22;
          const w = hw * s / .9;                         /* 圖的寬（頭大約佔圖寬的九成） */
          const h = w / b.ar;
          const cx = x + (r() - .5) * step * .35, cy = y + (r() - .5) * step * .3;   /* 頭的中心 */
          out.push({
            kind, cls: L.cls, w, h,
            left: cx - w / 2, top: cy - h * b.head * .5,
            z: li * 100 + Math.round(r() * 60),
            flip: r() < .5,
            /* 從上面的先飛（天空從上面開始露出來），每一束再錯開一點 */
            del: (Math.max(0, cy) / H) * .6 * L.sp + r() * .5,
            dur: (2 + r() * .9) * L.sp,
            tilt: (r() - .5) * 16,
            drift: (r() - .5) * 120,
            dy: -(cy + h + 60),
            bob: 2.4 + r() * 1.8, ph: r() * -3,
          });
        }
      }
    });
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
      <div class="bp-scene" aria-hidden="true"></div>
      <div class="bp-text" aria-hidden="true">
        <div class="bp-kicker">Let’s celebrate!</div>
        <div class="bp-names">${LM.namesHtml(ctx)}</div>
        <div class="bp-date">${LM.esc(ctx.date)}</div>
      </div>
      <div class="bp-crowd" aria-hidden="true">${list.map((b) =>
        `<div class="bp-b ${b.cls}" style="left:${f(b.left)}px;top:${f(b.top)}px;width:${f(b.w)}px;z-index:${b.z};rotate:${f(b.tilt)}deg;` +
        `--dy:${f(b.dy)}px;--del:${b.del.toFixed(2)}s;--dur:${b.dur.toFixed(2)}s;--dx:${f(b.drift)};--bob:${b.bob.toFixed(2)}s;--ph:${b.ph.toFixed(2)}s">` +
        `<div class="bp-rise"><div class="bp-sway"><img class="bp-img${b.flip ? ' is-flip' : ''}" src="${IMG}bunch-${b.kind}.webp" alt="" draggable="false"></div></div></div>`).join('')}</div>
      <div class="bp-skip">輕觸畫面・直接進入</div>`;

    if (ctx.reduce) { host.classList.add('is-still'); return; }
    ctx.later(() => host.classList.add('is-up'), T_RELEASE);
    ctx.later(() => { host.classList.add('is-leaving'); ctx.reveal(); }, T_REVEAL);
    ctx.later(ctx.done, T_DONE);
  }
  balloons.auto = true;

  LM.register('balloons', balloons);
})();
