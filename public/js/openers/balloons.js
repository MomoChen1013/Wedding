/* ============================================================
   openers/balloons.js — 開場：氣球升空（美式戶外婚禮派對）
   ------------------------------------------------------------
   一開始整個畫面塞滿了氣球（珊瑚紅、奶油黃、天空藍、薄荷綠、白、
   一點點金色），每一顆都在原地輕輕晃：

     氣球一顆一顆被放開 → 慢慢升空、越飛越快、左右飄
     → 底下露出藍天：白雲、太陽、遠山、草地、一頂白色帳篷、
       橫過天空的串燈與三角旗 → 名字浮在天空上 → 溶進網站
       （美式戶外派對的首頁 hero 就是同一片天空）

   自己演完就進站（fn.auto），點畫面任何地方可以跳過。
   氣球是依照當下視窗大小排出來的（手機直立、桌機橫向都塞得滿），
   亂數有固定的種子：每一次打開都是同一批氣球。

   ▸ 天空那一張圖（window.PartySky.svg()）也給大廳用：
     lobby-party.html 的 hero 是用同一支函式產出來的
     （scripts/build-party-sky.js），開場和大廳才會是同一片天空。
============================================================ */
(function () {
  const T_RELEASE = 1300;   /* 開始放氣球 */
  const T_REVEAL = 6400;    /* 天空露出來、名字也出來了，開始溶進網站 */
  const T_DONE = 7400;

  const f = (n) => +(+n).toFixed(1);
  function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  /* ==========================================================
     天空（viewBox 1600×1000；xMidYMax slice：地面永遠貼著底）
     ========================================================== */
  function cloud(cx, cy, s, id) {
    const puffs = [[-1.1, .1, .55], [-.55, -.25, .7], [.1, -.42, .85], [.75, -.2, .68], [1.2, .12, .5], [0, .1, .75]];
    return `<g transform="translate(${cx} ${cy}) scale(${s})" class="ps-cloud" style="--cd:${id}">` +
      puffs.map(([x, y, r]) => `<circle cx="${f(x * 100)}" cy="${f(y * 100)}" r="${f(r * 100)}"/>`).join('') +
      `<rect x="-160" y="0" width="320" height="70" rx="35"/></g>`;
  }

  function sky() {
    const r = rng(20270704);
    let s = `<defs>
      <linearGradient id="ps-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fb0e6"/><stop offset=".45" stop-color="#a6d6f2"/><stop offset=".7" stop-color="#e3f3fb"/><stop offset=".78" stop-color="#fff4dc"/></linearGradient>
      <radialGradient id="ps-sun"><stop offset="0" stop-color="#fffef4"/><stop offset=".18" stop-color="#fff6cf" stop-opacity=".95"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></radialGradient>
      <linearGradient id="ps-cloudG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".65" stop-color="#f6fafd"/><stop offset="1" stop-color="#d3e5f2"/></linearGradient>
      <linearGradient id="ps-hill1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b5d6b0"/><stop offset="1" stop-color="#9cc79a"/></linearGradient>
      <linearGradient id="ps-hill2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#93c482"/><stop offset="1" stop-color="#7cb46c"/></linearGradient>
      <linearGradient id="ps-lawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a6d47f"/><stop offset="1" stop-color="#6fae55"/></linearGradient>
      <linearGradient id="ps-canvas" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e8ecef"/><stop offset=".45" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe5ea"/></linearGradient>
      <linearGradient id="ps-inside" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7b8"/><stop offset="1" stop-color="#f3c98a"/></linearGradient>
      <radialGradient id="ps-bulb"><stop offset="0" stop-color="#fffbe6"/><stop offset=".25" stop-color="#ffe9a8" stop-opacity=".9"/><stop offset="1" stop-color="#ffd36a" stop-opacity="0"/></radialGradient>
      <pattern id="ps-check" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#fff"/><rect width="7" height="14" fill="#f07a5a" opacity=".55"/><rect width="14" height="7" fill="#f07a5a" opacity=".55"/></pattern>
    </defs>`;
    s += `<rect width="1600" height="1000" fill="url(#ps-sky)"/>`;
    s += `<circle class="ps-sun" cx="1260" cy="190" r="300" fill="url(#ps-sun)"/>`;
    s += `<circle cx="1260" cy="190" r="46" fill="#fffdf2"/>`;
    /* 雲：五團，各自往旁邊飄（大廳的 hero 才看得到飄） */
    s += `<g fill="url(#ps-cloudG)">` +
      cloud(260, 210, .9, 0) + cloud(760, 120, .62, 1) + cloud(1040, 300, .75, 2) + cloud(1480, 380, .55, 3) + cloud(120, 470, .45, 4) +
      `</g>`;
    /* 遠山與樹 */
    s += `<path fill="url(#ps-hill1)" d="M0 690C180 640 320 610 520 640S860 700 1040 655 1380 600 1600 640V1000H0Z"/>`;
    let trees = '';
    for (let x = -30; x < 1660; x += 30 + r() * 46) {
      const y = 700 - Math.sin(x / 260) * 16 - r() * 14, rr = 22 + r() * 26;
      trees += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rr)}" fill="${r() < .5 ? '#6fa86a' : '#5f9a5c'}"/><circle cx="${f(x - rr * .3)}" cy="${f(y - rr * .35)}" r="${f(rr * .5)}" fill="#8cc07f" opacity=".7"/>`;
    }
    s += `<g>${trees}</g>`;
    s += `<path fill="url(#ps-hill2)" d="M0 735C240 710 420 720 640 740S1080 770 1300 745 1520 720 1600 728V1000H0Z"/>`;
    s += `<path fill="url(#ps-lawn)" d="M0 770C300 752 600 760 900 772S1400 790 1600 770V1000H0Z"/>`;
    /* 剪草的條紋 */
    let stripes = '';
    for (let k = -6; k < 14; k++) stripes += `<path d="M${k * 140} 1000L${k * 140 + 360} 770H${k * 140 + 430}L${k * 140 + 70} 1000Z"/>`;
    s += `<g fill="#ffffff" opacity=".07">${stripes}</g>`;

    /* 白色帳篷：三個尖頂、扇形的簷、裡面亮著暖光 */
    s += `<g class="ps-tent">
      <ellipse cx="980" cy="812" rx="330" ry="22" fill="#4e8a44" opacity=".35"/>
      <path fill="url(#ps-inside)" d="M690 650H1270V805H690Z"/>
      <g fill="#fff3d0" opacity=".9"><rect x="760" y="725" width="90" height="12" rx="3"/><rect x="900" y="735" width="160" height="12" rx="3"/><rect x="1120" y="728" width="90" height="12" rx="3"/></g>
      <g fill="url(#ps-check)"><rect x="755" y="737" width="100" height="40"/><rect x="895" y="747" width="170" height="40"/><rect x="1115" y="740" width="100" height="40"/></g>
      <path fill="url(#ps-canvas)" d="M670 655L780 560 880 520 980 470 1080 520 1180 560 1290 655Z"/>
      <path fill="#dfe6ec" d="M780 560L980 470 880 520Z M980 470L1180 560 1080 520Z" opacity=".9"/>
      <path stroke="#c8d2da" stroke-width="2" fill="none" d="M780 560V655M980 470V655M1180 560V655"/>
      <path fill="#fff" d="M668 652H1292V676${Array.from({ length: 13 }, (_, i) => `Q${1268 - i * 48} 700 ${1244 - i * 48} 676`).join('')}Z"/>
      <path fill="url(#ps-canvas)" d="M672 676V808H700L716 676Z M1288 676V808H1260L1244 676Z"/>
      <path stroke="#9aa6b0" stroke-width="3" d="M980 470V448M780 560V540M1180 560V540"/>
      <path fill="#f07a5a" d="M980 448L1004 456 980 464Z"/>
    </g>`;
    /* 帳篷前的三角旗 */
    const flags = ['#f07a5a', '#f6c85f', '#7fbfe3', '#9fd6c0', '#f6b8b0'];
    let bunt = `<path d="M690 690Q980 740 1270 690" fill="none" stroke="#fff" stroke-width="2"/>`;
    for (let i = 0; i < 13; i++) {
      const t = (i + .5) / 13, x = 690 + t * 580, y = 690 + Math.sin(t * Math.PI) * 25;
      bunt += `<path d="M${f(x - 18)} ${f(y)}L${f(x + 18)} ${f(y)}L${f(x)} ${f(y + 34)}Z" fill="${flags[i % flags.length]}"/>`;
    }
    s += `<g class="ps-bunting">${bunt}</g>`;
    /* 花叢：左右下角 */
    let bush = '';
    for (const [bx, by, dir] of [[90, 930, 1], [1530, 945, -1]]) {
      for (let k = 0; k < 9; k++) bush += `<circle cx="${f(bx + dir * k * 22 + (r() - .5) * 20)}" cy="${f(by - r() * 70)}" r="${f(26 + r() * 22)}" fill="${r() < .5 ? '#5f9a52' : '#4f8a46'}"/>`;
      for (let k = 0; k < 16; k++) bush += `<circle cx="${f(bx + dir * r() * 190)}" cy="${f(by - 20 - r() * 80)}" r="${f(5 + r() * 4)}" fill="${['#fff', '#f6b8b0', '#f6c85f', '#f07a5a'][k % 4]}"/>`;
    }
    s += `<g>${bush}</g>`;
    /* 串燈：兩條從畫面外拉進來的弧，一顆一顆的燈泡 */
    const strand = (x0, y0, x1, y1, sag, n, cls) => {
      const cx = (x0 + x1) / 2, cy = Math.max(y0, y1) + sag;
      let g = `<path d="M${x0} ${y0}Q${cx} ${cy} ${x1} ${y1}" fill="none" stroke="#3a3f45" stroke-width="2.4"/>`;
      for (let i = 1; i < n; i++) {
        const t = i / n, u = 1 - t;
        const x = u * u * x0 + 2 * u * t * cx + t * t * x1, y = u * u * y0 + 2 * u * t * cy + t * t * y1;
        g += `<g transform="translate(${f(x)} ${f(y)})" class="ps-bulb" style="--i:${i}"><circle r="26" cy="16" fill="url(#ps-bulb)" class="ps-glow"/><rect x="-3" y="0" width="6" height="7" fill="#3a3f45"/><ellipse cy="16" rx="7" ry="9.5" fill="#fff6d2"/></g>`;
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
  const COLORS = [
    ['#ffb39f', '#f07a5a', '#c9533a'],   /* 珊瑚紅 */
    ['#ffe6a8', '#f6c85f', '#d49b2a'],   /* 奶油黃 */
    ['#cfeafb', '#7fbfe3', '#4a8fbf'],   /* 天空藍 */
    ['#dcf5ea', '#9fd6c0', '#5fae92'],   /* 薄荷綠 */
    ['#ffffff', '#f5f2ec', '#cfc8bb'],   /* 珍珠白 */
    ['#ffe2de', '#f6b8b0', '#d98a80'],   /* 腮紅粉 */
    ['#fff5d1', '#e2b85a', '#9c7424'],   /* 金色（少一點） */
  ];
  const BODY = 'M0 -50C28 -50 44 -28 42 -4C40 22 18 42 3 48H-3C-18 42 -40 22 -42 -4C-44 -28 -28 -50 0 -50Z';

  function defs() {
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>` +
      COLORS.map(([a, b, c], i) =>
        `<radialGradient id="bp-g${i}" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></radialGradient>`).join('') +
      `</defs></svg>`;
  }

  function balloon(i, r) {
    const c = r() < .07 ? 6 : Math.floor(r() * 6);
    const sx = (r() - .5) * 30, sy = 128 + r() * 20;
    return `<svg viewBox="-50 -60 100 200"><path class="bp-str" d="M0 52C${f(sx)} 80 ${f(-sx)} 105 ${f(sx * .6)} ${f(sy)}"/>` +
      `<path d="${BODY}" fill="url(#bp-g${c})"/>` +
      `<path d="M-4 54L4 54L2 47L-2 47Z" fill="url(#bp-g${c})"/>` +
      `<ellipse cx="-17" cy="-26" rx="7" ry="13" transform="rotate(-28 -17 -26)" fill="#fff" opacity="${c === 6 ? .8 : .55}"/>` +
      `<circle cx="-24" cy="-6" r="2.6" fill="#fff" opacity=".45"/></svg>`;
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
    host.innerHTML = defs() + `
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
