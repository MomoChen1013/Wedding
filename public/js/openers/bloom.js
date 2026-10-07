/* ============================================================
   openers/bloom.js — 開場：花朵盛開（一整面綠籬，開滿白玫瑰）
   ------------------------------------------------------------
   一開始是一整面密密的綠籬（一張真的照片）：

     綠籬上到處冒出小小的花苞（一顆一顆，不規則）
     → 花苞從中間往外一波一波開：花苞鼓起來、轉一點點、開成一朵白玫瑰
     → 整面牆開滿白色玫瑰 → 中間浮出「Our story begins here」與名字
     → 整面牆往前一點、淡掉，溶進網站

   自己演完就進站（fn.auto），點畫面任何地方可以跳過。
   綠籬與玫瑰都是真的照片（public/img/orangerie/，出處見 README）：
     leaf-wall.webp        綠籬（Wyxina Tresse／Unsplash）
     bloom-rose1.webp      帶水珠的白玫瑰（Wyxina Tresse／Unsplash）
     bloom-rose3a/b/c.webp 三朵白玫瑰，從同一張照片去背（Gomezgai Jere／Unsplash）
   花的位置依照當下視窗大小算出來（單位就是 px），花的密度跟面積走，
   手機直立、桌機橫向都是滿版；名字那一塊會空出來不放花，字才讀得清楚。
   亂數有固定的種子：每一次打開都是同一面牆。
   每一朵花的出場時間寫在它自己的 --d、--b 上，動作在 css/openers/bloom.css。
============================================================ */
(function () {
  const LM = window.LobbyMotion;
  const T_REVEAL = 6300;   /* 花開滿、字出來之後，開始溶進網站 */
  const T_DONE = 7300;

  const f = (n) => +n.toFixed(1);
  function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  /* 圖檔的位置從這支 script 自己的位置推回去（預覽頁與正式站的根目錄不一樣） */
  const SCRIPT = document.currentScript && document.currentScript.src;
  const IMG = SCRIPT ? SCRIPT.replace(/js\/openers\/bloom\.js.*$/, 'img/orangerie/') : '/img/orangerie/';
  const ROSES = ['bloom-rose1', 'bloom-rose3a', 'bloom-rose3b', 'bloom-rose3c'];

  function wall(W, H) {
    const r = rng(20260919);
    /* ---- 花：抖動過的格子，名字那一塊（中間的橢圓）空出來 ---- */
    const s = Math.max(78, Math.min(150, Math.min(W, H) / 5.6));
    const cx = W / 2, cy = H / 2;
    const zx = Math.min(W * .36, 330), zy = Math.min(H * .17, 120);
    const roses = [];
    for (let gy = s * .3; gy < H + s * .3; gy += s * .7) {
      const row = Math.round(gy / (s * .7));
      for (let gx = s * .25 + (row % 2) * s * .38; gx < W + s * .3; gx += s * .76) {
        const x = gx + (r() - .5) * s * .5, y = gy + (r() - .5) * s * .45;
        const ex = (x - cx) / (zx + s * .45), ey = (y - cy) / (zy + s * .45);
        if (ex * ex + ey * ey < 1) continue;
        if (r() < .06) continue;
        const dist = Math.hypot((x - cx) / W, (y - cy) / H);
        roses.push({ x, y, size: s * (.62 + r() * .4), rot: r() * 360, dist, j: r(), k: Math.floor(r() * ROSES.length) });
      }
    }
    /* 花苞先冒出來（亂序），再從中間往外一波一波開 */
    const rose = ({ x, y, size, rot, dist, j, k }) => {
      const d = (.35 + j * 1.25).toFixed(2);            /* 花苞冒出來 */
      const b = (1.9 + dist * 2.6 + j * .45).toFixed(2); /* 開花 */
      return `<i class="bl-rose" style="left:${f(x)}px;top:${f(y)}px;width:${f(size)}px;` +
        `background-image:url(${IMG}${ROSES[k]}.webp);--rot:${f(rot)}deg;--d:${d}s;--b:${b}s"></i>`;
    };
    return `<div class="bl-wall" style="--leaf:url(${IMG}leaf-wall.webp)">` +
      `<div class="bl-leaves"></div>${roses.map(rose).join('')}</div>`;
  }

  function bloom(host, ctx) {
    host.classList.add('bl-host');
    host.tabIndex = 0;
    host.setAttribute('role', 'button');
    host.setAttribute('aria-label', '開場動畫，點一下直接進入邀請函');
    const W = Math.max(320, Math.round(host.clientWidth || window.innerWidth));
    const H = Math.max(480, Math.round(host.clientHeight || window.innerHeight));
    host.innerHTML = `
      <div class="bl-bg" aria-hidden="true"></div>
      <div class="bl-stage" aria-hidden="true">${wall(W, H)}</div>
      <div class="bl-light" aria-hidden="true"></div>
      <div class="bl-text" aria-hidden="true">
        <div class="bl-kicker">Our story begins here</div>
        <div class="bl-names">${LM.namesHtml(ctx)}</div>
        <div class="bl-date">${LM.esc(ctx.date)}</div>
      </div>
      <div class="bl-skip">輕觸畫面・直接進入</div>`;

    if (ctx.reduce) { host.classList.add('is-still'); return; }
    ctx.later(() => { host.classList.add('is-leaving'); ctx.reveal(); }, T_REVEAL);
    ctx.later(ctx.done, T_DONE);
  }
  bloom.auto = true;

  LM.register('bloom', bloom);
})();
