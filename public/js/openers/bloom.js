/* ============================================================
   openers/bloom.js — 開場：花朵盛開（爬滿藤蔓的花牆，開滿白玫瑰）
   ------------------------------------------------------------
   一開始是一整面爬滿藤蔓的植物牆，葉子密密的：

     牆上到處冒出小小的花苞（一顆一顆，不規則）
     → 花苞從中間往外一波一波開：花苞先鼓起來，外圈花瓣先翻開，
       再來中圈、內圈，最後是捲起來的花心
     → 整面牆開滿白色玫瑰 → 中間浮出「Our story begins here」與名字
     → 整面牆往前一點、淡掉，溶進網站

   自己演完就進站（fn.auto），點畫面任何地方可以跳過。
   牆是依照當下視窗大小算出來的 SVG（單位就是 px），花的密度跟面積走，
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

  /* 一片葉子：尖頭的橢圓（長度 1，往 +x 長） */
  const LEAF = 'M0 0C.25 -.34 .7 -.36 1 0C.7 .36 .25 .34 0 0Z';
  /* 一片玫瑰花瓣：寬圓的瓣（長度 1，往 -y 長），瓣緣有一點點波浪 */
  const PETAL = 'M0 0C-.62 -.12 -.78 -.62 -.5 -.9C-.3 -1.06 -.12 -.98 0 -1.02C.12 -.98 .3 -1.06 .5 -.9C.78 -.62 .62 -.12 0 0Z';

  function wall(W, H) {
    const r = rng(20260919);
    const A = W * H;
    let defs = `<defs>
      <linearGradient id="bl-lf1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7f9b62"/><stop offset="1" stop-color="#4c6a3c"/></linearGradient>
      <linearGradient id="bl-lf2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9bb47a"/><stop offset="1" stop-color="#5f7d48"/></linearGradient>
      <linearGradient id="bl-lf3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5d7a4a"/><stop offset="1" stop-color="#344d2b"/></linearGradient>
      <radialGradient id="bl-po" cx=".5" cy=".95" r="1"><stop offset="0" stop-color="#e9e2cf"/><stop offset=".45" stop-color="#fbf8f0"/><stop offset="1" stop-color="#ffffff"/></radialGradient>
      <radialGradient id="bl-pm" cx=".5" cy=".95" r="1"><stop offset="0" stop-color="#e2d9c1"/><stop offset=".5" stop-color="#f7f2e5"/><stop offset="1" stop-color="#fffdf7"/></radialGradient>
      <radialGradient id="bl-pi" cx=".5" cy=".9" r="1"><stop offset="0" stop-color="#d8cdb0"/><stop offset=".6" stop-color="#f1ead8"/><stop offset="1" stop-color="#fbf7ec"/></radialGradient>
      <radialGradient id="bl-sh"><stop offset=".5" stop-color="#14200e" stop-opacity=".55"/><stop offset="1" stop-color="#14200e" stop-opacity="0"/></radialGradient>
      <radialGradient id="bl-bud" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#fffdf4"/><stop offset=".7" stop-color="#e9ecd6"/><stop offset="1" stop-color="#c3cf9f"/></radialGradient>
    </defs>`;

    /* ---- 藤：幾條長長的莖，從下往上斜斜地爬 ---- */
    let vines = '';
    const nV = Math.max(6, Math.round(A / 60000));
    for (let i = 0; i < nV; i++) {
      let x = r() * W, y = H + 20;
      let d = `M${f(x)} ${f(y)}`;
      const dir = r() < .5 ? -1 : 1;
      while (y > -40) {
        const nx = x + dir * (40 + r() * 80) * (r() < .5 ? -1 : 1), ny = y - (60 + r() * 90);
        d += `Q${f((x + nx) / 2 + (r() - .5) * 90)} ${f((y + ny) / 2)} ${f(nx)} ${f(ny)}`;
        x = nx; y = ny;
      }
      vines += `<path d="${d}"/>`;
    }

    /* ---- 葉子：滿滿一面牆（抖動過的格子，每一格兩三片） ---- */
    const leaves = [];
    const ls = Math.max(26, Math.min(40, Math.sqrt(A / 900)));
    for (let gy = -ls; gy < H + ls; gy += ls * .62) {
      for (let gx = -ls; gx < W + ls; gx += ls * .7) {
        const x = gx + (r() - .5) * ls, y = gy + (r() - .5) * ls;
        const len = ls * (.75 + r() * .55);
        const k = r();
        leaves.push(`<path class="bl-lf" fill="url(#bl-lf${k < .45 ? 1 : k < .75 ? 2 : 3})" ` +
          `transform="translate(${f(x)} ${f(y)}) rotate(${f(r() * 360)}) scale(${f(len)})" d="${LEAF}"/>`);
      }
    }
    /* 葉子分三組，各自輕輕晃（風） */
    const third = Math.ceil(leaves.length / 3);
    const leafG = [0, 1, 2].map((g) => `<g class="bl-sway s${g}">${leaves.slice(g * third, (g + 1) * third).join('')}</g>`).join('');

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
        roses.push({ x, y, size: s * (.24 + r() * .18), rot: r() * 360, dist, j: r() });
      }
    }
    /* 花苞先冒出來（亂序），再從中間往外一波一波開 */
    const rose = ({ x, y, size, rot, dist, j }) => {
      const d = (.35 + j * 1.25).toFixed(2);            /* 花苞冒出來 */
      const b = (1.9 + dist * 2.6 + j * .45).toFixed(2); /* 開花 */
      const ring = (n, scale, off, cls) => Array.from({ length: n }, (_, k) =>
        `<g transform="rotate(${f(off + k * 360 / n)})"><path class="bl-pt ${cls}" d="${PETAL}" transform="scale(${scale})"/></g>`).join('');
      const sepals = [0, 72, 144, 216, 288].map((k) =>
        `<path d="M0 0C-.14 .3 -.08 .7 0 .98C.08 .7 .14 .3 0 0Z" transform="rotate(${k + 18})"/>`).join('');
      return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${f(size)})">` +
        `<g class="bl-rose" style="--d:${d}s;--b:${b}s">` +
        `<ellipse class="bl-shade" cx=".1" cy=".16" rx="1.25" ry="1.2"/>` +
        `<g class="bl-sepal">${sepals}</g>` +
        `<g class="bl-ring o">${ring(5, 1, 0, 'po')}</g>` +
        `<g class="bl-ring m">${ring(5, .78, 36, 'pm')}</g>` +
        `<g class="bl-ring i">${ring(4, .54, 15, 'pi')}</g>` +
        `<g class="bl-core"><circle r=".32"/><path d="M-.26 .08C-.3 -.18 .02 -.32 .22 -.16C.36 -.02 .22 .22 0 .2C-.16 .18 -.18 0 -.06 -.06C.04 -.1 .12 -.02 .08 .06M-.3 .16C-.12 .3 .2 .3 .3 .08"/></g>` +
        `<g transform="scale(1.45)"><g class="bl-budhead"><path class="h" d="M0 -.46C.2 -.3 .24 -.02 .14 .1C.06 .16 -.06 .16 -.14 .1C-.24 -.02 -.2 -.3 0 -.46Z"/>` +
        `<path class="c" d="M-.15 .1C-.24 -.06 -.18 -.22 -.05 -.28C-.12 -.12 -.1 0 -.02 .14ZM.15 .1C.24 -.06 .18 -.22 .05 -.28C.12 -.12 .1 0 .02 .14ZM-.02 .16C-.06 0 0 -.16 .02 -.2C.06 -.08 .06 .06 .02 .16Z"/></g></g>` +
        `</g></g>`;
    };
    return `<svg class="bl-wall" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${defs}` +
      `<g class="bl-vines">${vines}</g>${leafG}<g class="bl-roses">${roses.map(rose).join('')}</g></svg>`;
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
