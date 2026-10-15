/* ============================================================
   openers/balloons.js — 開場：氣球升空（美式戶外婚禮派對）
   ------------------------------------------------------------
   一開始整個畫面塞滿了一顆一顆霧面的粉彩氣球（奶油白、腮紅粉、蜜桃、奶油黃、薄荷、薰衣草、粉藍 ——
   AI 生成的霧面乳膠氣球，一個顏色一張、同一個外框，去背後放在 300:389 的透明底上、結貼著底邊正中，
   public/img/party/balloon-*.webp；線是 SVG 畫的；用哪幾種顏色看 <body data-balloons>，見下面的 PALETTES），
   分成遠、中、近三層：遠的小、淡一點；近的大、有一點景深的糊。每一顆都在原地輕輕晃：

     氣球一顆一顆各自被放開（每一顆的時間、速度、往哪邊飄都不一樣）→ 慢慢升空、越飛越快
     → 底下露出藍天下的後院婚宴：草坪、白色尖頂帳篷、長桌與串燈（img/party/tent.webp）
     → 名字浮在天空上 → 溶進網站（美式戶外派對的首頁 hero 就是同一張）

   自己演完就進站（fn.auto），點畫面任何地方可以跳過。
   氣球是依照當下視窗大小排出來的（手機直立、桌機橫向都塞得滿），
   亂數有固定的種子：每一次打開都是同一批氣球。
============================================================ */
(function () {
  const T_RELEASE = 1200;   /* 開始放氣球 */
  const T_REVEAL = 6200;    /* 帳篷草坪露出來、名字也出來了，開始溶進網站 */
  const T_DONE = 7200;

  const LM = window.LobbyMotion;
  if (!LM) return;

  const f = (n) => +(+n).toFixed(1);
  function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  /* 圖檔（public/img/party/）：從這一支自己的網址往回推，正式站與 preview 都對得上 */
  const IMG = (() => {
    try { return new URL('../../img/party/', document.currentScript.src).href; } catch (e) { return '/img/party/'; }
  })();

  /* 一顆氣球的照片：寬 / 高（結也在照片裡，線另外畫） */
  const AR = 300 / 389;

  /* 氣球配色（sites.balloonPalette → <body data-balloons>，代號與名字在 wed-model.js 的 BALLOON_PALETTES）。
     每一組是一副牌：rainbow 七色各一張；其他是主色 6、白 3、點綴 1。
     排氣球時一副洗好、照順序發完再洗下一副 —— 每連續十顆的比例都剛好，
     不會因為排列的方式讓某一層整片偏白。洗牌用另一條亂數，所以不管哪一組配色，氣球的位置都一樣 */
  const PALETTES = {
    rainbow:  { white: 1, blush: 1, peach: 1, butter: 1, mint: 1, lilac: 1, sky: 1 },
    lavender: { lilac: 6, white: 3, sky: 1 },
    blush:    { blush: 6, white: 3, peach: 1 },
    sky:      { sky: 6, white: 3, mint: 1 },
    sage:     { mint: 6, white: 3, butter: 1 },
    peach:    { peach: 6, white: 3, butter: 1 },
  };
  function dealer(seed) {
    const mix = PALETTES[document.body.dataset.balloons] || PALETTES.rainbow;
    const deck = Object.entries(mix).flatMap(([c, n]) => Array(n).fill(c));
    const r = rng(seed);
    let hand = [];
    return () => {
      if (!hand.length) {
        hand = deck.slice();
        for (let i = hand.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [hand[i], hand[j]] = [hand[j], hand[i]]; }
      }
      return hand.pop();
    };
  }

  /* 三層：遠、中、近。k = 相對大小、gap = 間距（相對於氣球的寬）、sp = 飛得多慢（越近越快）、cls = 景深 */
  const LAYERS = [
    { k: .55, gap: 2.8, sp: 1.15, cls: 'is-far' },
    { k: 1, gap: 1.08, sp: 1, cls: 'is-mid' },
    { k: 1.6, gap: 1.9, sp: .78, cls: 'is-near' },
  ];

  function crowd(W, H) {
    const r = rng(20260704);
    const color = dealer(20261015);
    /* 中景一顆氣球的寬 */
    const base = Math.max(76, Math.min(128, Math.min(W, H) * .17));
    const out = [];
    LAYERS.forEach((L, li) => {
      const w0 = base * L.k, step = w0 * L.gap;
      let row = 0;
      for (let y = -w0 * .4; y < H + w0 * .3; y += step * .8, row++) {
        for (let x = -w0 * .3 + (row % 2) * step * .5; x < W + w0 * .3; x += step) {
          if (li === 2 && r() < .5) continue;            /* 近景稀一點，不要整片糊掉 */
          const w = w0 * (.88 + r() * .24), h = w / AR;
          const cx = x + (r() - .5) * step * .4, cy = y + (r() - .5) * step * .35;   /* 氣球的中心 */
          const sx = (r() - .5) * 16, len = 1.15 + r() * .4;   /* 線：擺多少、多長（氣球高的幾倍） */
          out.push({
            color: color(), cls: L.cls, w, h,
            left: cx - w / 2, top: cy - h / 2,
            z: li * 100 + Math.round(r() * 60),
            flip: r() < .5,
            str: `M20 0C${f(20 + sx)} 40 ${f(20 - sx)} 80 ${f(20 + sx * .6)} 120`, len,
            /* 每一顆自己的時間：上面的稍微早一點（天空從上面開始露出來），但大多是亂的 */
            del: ((Math.max(0, cy) / H) * .7 + r() * 1.6) * L.sp,
            dur: (2.2 + r() * 1.3) * L.sp,
            tilt: (r() - .5) * 14,
            drift: (r() - .5) * 160,
            dy: -(cy + h * (1 + len) + 40),
            bob: 2 + r() * 1.8, ph: r() * -3,
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
        `<div class="bp-rise"><div class="bp-sway"><img class="bp-img${b.flip ? ' is-flip' : ''}" src="${IMG}balloon-${b.color}.webp" alt="" draggable="false">` +
        `<svg class="bp-str" viewBox="0 0 40 120" preserveAspectRatio="none" style="height:${f(b.h * b.len)}px"><path d="${b.str}"/></svg></div></div></div>`).join('')}</div>
      <div class="bp-skip">輕觸畫面・直接進入</div>`;

    if (ctx.reduce) { host.classList.add('is-still'); return; }
    ctx.later(() => host.classList.add('is-up'), T_RELEASE);
    ctx.later(() => { host.classList.add('is-leaving'); ctx.reveal(); }, T_REVEAL);
    ctx.later(ctx.done, T_DONE);
  }
  balloons.auto = true;

  LM.register('balloons', balloons);
})();
