/* ============================================================
   openers/door.js — 開場：門（莊園的鍛鐵大門／秘密花園的玻璃門）
   ------------------------------------------------------------
   一個晴朗的早上，站在門口：

     點一下 → 兩扇門往裡推開 → 陽光湧出來
     → 鏡頭穿過門口往前走 → 溶進網站

   每個版型有自己的門（[data-variant]，見 css/openers/door.css）：
     french-manor（預設）  一張真的照片：爬滿藤的磚牆圓拱裡，一扇鍛鐵花園門，門後是開滿薰衣草的小徑。
                           鐵門從照片裡分離成自己的一層，點一下繞著鉸鍊往裡轉開；
                           走進去是一座歐式花園（修剪整齊的綠籬、碎石路、盡頭一尊白色雕像）
     midnight-chapel／tapestry  同一種鍛鐵大門，但是中古的尖拱、石柱頂是小尖塔，
                           門後遠遠是一座有圓塔的城堡
     secret-garden         一整面常春藤牆上，一扇白框的玻璃門：上面一扇半圓的氣窗，
                           藤從門楣垂下來，牆腳兩叢花；隔著玻璃看得到後面開滿玫瑰的拱門小徑。
                           門以外用的是真的照片（見下面〈秘密花園的玻璃門〉）

   尖拱的鐵門（教堂、刺繡）是程式畫的 SVG（亂數有固定的種子，每一次都一樣）：
     .dr-land   門後的風景（天空、太陽、遠山、城堡、草地、碎石路），滿版
     .dr-front  門以外的東西（石柱、牆、鐵欄杆、地面、植物），跟門同一個座標
     .dr-leaf   兩扇門，各自一個 SVG，用 CSS 3D 轉開
============================================================ */
(function () {
  const LM = window.LobbyMotion;
  const T = { open: 1700, walk: 1400 };

  const KIND = {
    'secret-garden': 'garden',
    'midnight-chapel': 'gothic',
    'tapestry': 'gothic',
  };

  const f = (n) => +(+n).toFixed(1);
  function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  const IRON = '#1c1d20', GOLD = '#c9a24a';

  /* ==========================================================
     門後的風景（viewBox 1600×1000，slice 滿版；地平線在 y=560）
     ========================================================== */
  function land(kind) {
    const r = rng(3);
    let s = `<defs>
      <linearGradient id="dr-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fc3ea"/><stop offset=".45" stop-color="#cfe6f4"/><stop offset=".56" stop-color="#fff4dc"/></linearGradient>
      <radialGradient id="dr-sunG"><stop offset="0" stop-color="#fffef6"/><stop offset=".25" stop-color="#fff6d6" stop-opacity=".9"/><stop offset="1" stop-color="#fff2cc" stop-opacity="0"/></radialGradient>
      <linearGradient id="dr-lawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c3d99a"/><stop offset="1" stop-color="#7fa95c"/></linearGradient>
      <linearGradient id="dr-path" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6ecd4"/><stop offset="1" stop-color="#e3d2ad"/></linearGradient>
      <filter id="dr-soft"><feGaussianBlur stdDeviation="6"/></filter>
    </defs>`;
    s += `<rect width="1600" height="1000" fill="url(#dr-sky)"/>`;
    s += `<circle cx="800" cy="330" r="380" fill="url(#dr-sunG)"/>`;
    /* 雲：幾團軟軟的白 */
    let clouds = '';
    for (const [cx, cy, w] of [[260, 170, 220], [1180, 120, 260], [1420, 300, 180], [520, 330, 150], [980, 260, 140]]) {
      for (let k = 0; k < 6; k++) clouds += `<ellipse cx="${f(cx + (r() - .5) * w)}" cy="${f(cy + (r() - .5) * w * .18)}" rx="${f(w * (.22 + r() * .2))}" ry="${f(w * (.1 + r() * .08))}"/>`;
    }
    s += `<g fill="#fff" opacity=".85" filter="url(#dr-soft)">${clouds}</g>`;
    /* 遠方的樹：一排淡淡的藍綠（空氣遠近） */
    let far = '';
    for (let x = -40; x < 1660; x += 26 + r() * 30) far += `<circle cx="${f(x)}" cy="${f(548 - r() * 24)}" r="${f(26 + r() * 30)}"/>`;
    s += `<g fill="#a9c3a4">${far}</g>`;
    /* 門後的主角：城堡（莊園）／圓塔城堡（尖拱）／噴泉與玫瑰拱（花園） */
    if (kind === 'gothic') s += castle(800, 560);
    let near = '';
    for (let x = -40; x < 1660; x += 40 + r() * 40) {
      if (x > 640 && x < 960) continue;
      near += `<circle cx="${f(x)}" cy="${f(560 - r() * 14)}" r="${f(34 + r() * 26)}"/>`;
    }
    s += `<g fill="#8fb07c">${near}</g>`;
    /* 草地、碎石路 */
    s += `<rect y="556" width="1600" height="444" fill="url(#dr-lawn)"/>`;
    s += `<path d="M770 560H830L1180 1000H420Z" fill="url(#dr-path)"/>`;
    /* 路兩旁的圓球樹雕 */
    for (const [t, side] of [[.12, -1], [.12, 1], [.32, -1], [.32, 1], [.62, -1], [.62, 1]]) {
      const y = 560 + t * 440, half = 30 + t * 350, x = 800 + side * (half + 20 + t * 60), sc = .3 + t * 1.4;
      s += `<ellipse cx="${f(x + 6 * sc)}" cy="${f(y + 2)}" rx="${f(22 * sc)}" ry="${f(5 * sc)}" fill="#5f8a4a" opacity=".5"/>` +
        `<rect x="${f(x - 2 * sc)}" y="${f(y - 34 * sc)}" width="${f(4 * sc)}" height="${f(34 * sc)}" fill="#7a5a3a"/>` +
        `<circle cx="${f(x)}" cy="${f(y - 46 * sc)}" r="${f(20 * sc)}" fill="#6f9a52"/><circle cx="${f(x - 6 * sc)}" cy="${f(y - 52 * sc)}" r="${f(9 * sc)}" fill="#9cc27a" opacity=".7"/>`;
    }
    /* 花境：路邊一點一點的花 */
    let flowers = '';
    for (let k = 0; k < 160; k++) {
      const t = r(), y = 562 + t * t * 430, side = r() < .5 ? -1 : 1;
      const x = 800 + side * (34 + t * t * 360 + r() * (30 + t * 120));
      flowers += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1.5 + t * 4)}" fill="${['#fff', '#f6d3dc', '#f3e3a6', '#e9c4e6'][k % 4]}"/>`;
    }
    s += flowers;
    return `<svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">${s}</svg>`;
  }

  /* 中古城堡：兩座圓塔、尖尖的屋頂、城垛 */
  function castle(cx, g) {
    const x = (v) => f(cx + v), y = (v) => f(g - v);
    let s = `<g>`;
    s += `<path d="M${x(-120)} ${y(0)}V${y(80)}H${x(120)}V${y(0)}Z" fill="#efe6d4"/>`;
    let crenel = '';
    for (let v = -120; v < 120; v += 16) crenel += `<rect x="${x(v)}" y="${y(90)}" width="9" height="10" fill="#efe6d4"/>`;
    s += crenel;
    for (const dx of [-140, 140]) {
      s += `<rect x="${x(dx - 26)}" y="${y(130)}" width="52" height="130" fill="#f3ead9"/>`;
      s += `<path d="M${x(dx - 32)} ${y(130)}L${x(dx)} ${y(210)}L${x(dx + 32)} ${y(130)}Z" fill="#8d9aa6"/>`;
      s += `<path d="M${x(dx)} ${y(210)}V${y(232)}" stroke="#6b5a45" stroke-width="2"/><path d="M${x(dx)} ${y(232)}L${x(dx + 14)} ${y(226)}L${x(dx)} ${y(220)}Z" fill="#c9a24a"/>`;
      s += `<rect x="${x(dx - 5)}" y="${y(96)}" width="10" height="18" rx="5" fill="#8796a0"/>`;
    }
    s += `<rect x="${x(-24)}" y="${y(150)}" width="48" height="70" fill="#f6eedf"/>`;
    s += `<path d="M${x(-30)} ${y(150)}L${x(0)} ${y(226)}L${x(30)} ${y(150)}Z" fill="#7f8c99"/>`;
    s += `<path d="M${x(-16)} ${y(0)}V${y(30)}A16 16 0 0 1 ${x(16)} ${y(30)}V${y(0)}Z" fill="#6b5a45"/>`;
    for (const dx of [-80, -50, 50, 80]) s += `<rect x="${x(dx - 5)}" y="${y(60)}" width="10" height="18" rx="5" fill="#8796a0"/>`;
    return s + `</g>`;
  }
  /* ==========================================================
     鍛鐵大門（viewBox 0 0 600 640；門洞 x 110–490、y 160–600）
     ========================================================== */
  const GATE = { x0: 110, x1: 490, y0: 160, y1: 600 };

  /* 一扇鐵門（左扇；右扇用 CSS 鏡像）。viewBox 0 0 190 440 */
  function gateLeaf(kind) {
    const W = 190, H = 440;
    /* 上緣：一道往中間升起的尖拱 */
    const topY = (x) => 96 - Math.sqrt(Math.max(0, 1 - Math.pow((W - x) / W, 2))) * 86;
    let bars = '', tips = '', rings = '';
    for (let x = 18; x < W - 6; x += 17) {
      const t = topY(x);
      bars += `M${x} ${f(t - 20)}V${H - 8}`;
      tips += `<path d="M${x - 4} ${f(t - 18)}L${x} ${f(t - 32)}L${x + 4} ${f(t - 18)}Z"/>`;
    }
    for (let x = 26; x < W - 10; x += 17) {
      rings += `<path d="M${x} 262a8 8 0 1 0 .1 0M${x - 8} 270a8 8 0 0 0 16 0" />`;
    }
    /* 上緣的那一道橫檔（跟著弧度） */
    let rail = '';
    for (let x = 0; x <= W; x += 5) rail += (x ? 'L' : 'M') + `${x} ${f(topY(x))}`;
    let rail2 = '';
    for (let x = 0; x <= W; x += 5) rail2 += (x ? 'L' : 'M') + `${x} ${f(topY(x) + 26)}`;
    /* 上面一排 C 形捲草 */
    let scrolls = '';
    for (let x = 18; x < W - 20; x += 34) {
      const t = topY(x + 8) + 30;
      scrolls += `M${x + 2} ${f(t + 28)}C${x + 2} ${f(t + 6)} ${x + 26} ${f(t + 4)} ${x + 26} ${f(t + 20)}C${x + 26} ${f(t + 30)} ${x + 14} ${f(t + 30)} ${x + 14} ${f(t + 22)}`;
    }
    /* 靠中間那一側：半個花押圓章（兩扇合起來是一個完整的圓） */
    const crest = `<path d="M${W} 152A44 44 0 0 0 ${W} 240" fill="none" stroke="${IRON}" stroke-width="6"/>` +
      `<path d="M${W} 162A34 34 0 0 0 ${W} 230" fill="none" stroke="${GOLD}" stroke-width="2.5"/>` +
      `<path d="M${W} 214C${W - 22} 198 ${W - 24} 178 ${W - 10} 176C${W - 4} 176 ${W} 182 ${W} 186" fill="${GOLD}"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <g fill="none" stroke="${IRON}" stroke-linecap="round">
        <path d="${bars}" stroke-width="4.2"/>
        <path d="${bars}" stroke="#5a5c63" stroke-width="1" transform="translate(-1 0)" opacity=".7"/>
        <path d="${rail}" stroke-width="7"/><path d="${rail2}" stroke-width="5"/>
        <path d="${scrolls}" stroke-width="3.4"/>
        <path d="M0 256H${W}M0 284H${W}M0 380H${W}M0 ${H - 6}H${W}" stroke-width="6"/>
        <g stroke-width="3">${rings}</g>
        <path d="M4 ${f(topY(4))}V${H}M${W - 3} ${f(topY(W - 3))}V${H}" stroke-width="8"/>
        <path d="M${f(W * .5)} 300C${f(W * .3)} 300 ${f(W * .3)} 350 ${f(W * .5)} 350C${f(W * .7)} 350 ${f(W * .7)} 300 ${f(W * .5)} 300Z" stroke-width="3"/>
      </g>
      <g fill="${GOLD}" stroke="#8e6d31" stroke-width=".8">${tips}<circle cx="${f(W * .5)}" cy="325" r="6"/></g>
      ${crest}
      <rect x="${W - 14}" y="300" width="10" height="26" rx="2" fill="${IRON}"/><circle cx="${W - 9}" cy="330" r="5" fill="none" stroke="${GOLD}" stroke-width="2"/>
    </svg>`;
  }

  /* 門以外：石柱、柱頂的花、門上的鍛鐵拱、兩旁的矮牆與欄杆、地面、太陽照下來的影子 */
  function gateFront(kind) {
    const r = rng(kind === 'gothic' ? 31 : 17);
    let s = `<defs>
      <linearGradient id="dr-stone" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e2d8c4"/><stop offset=".45" stop-color="#f6efe0"/><stop offset="1" stop-color="#cfc2a8"/></linearGradient>
      <linearGradient id="dr-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1e8d6"/><stop offset="1" stop-color="#dccfb5"/></linearGradient>
      <linearGradient id="dr-gravel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9dcc0"/><stop offset="1" stop-color="#d8c6a0"/></linearGradient>
      <linearGradient id="dr-grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fb36a"/><stop offset="1" stop-color="#5f8a45"/></linearGradient>
    </defs>`;
    /* 地面：草地 ＋ 正中間一條碎石路 */
    s += `<rect x="-3000" y="596" width="6600" height="2000" fill="url(#dr-grass)"/>`;
    s += `<path d="M90 596H510L1100 1700H-500Z" fill="url(#dr-gravel)"/>`;
    /* 太陽在門後：鐵條的影子一條一條往鏡頭這邊拉長（門打開就淡掉） */
    let sh = '';
    for (let x = GATE.x0 + 10; x < GATE.x1; x += 17) {
      const dx = (x - 300) * 2.2;
      sh += `<path d="M${x - 2} 600L${x + 2} 600L${f(x + dx + 10)} 1300L${f(x + dx - 4)} 1300Z"/>`;
    }
    s += `<g class="dr-shadows" fill="#3d3524" opacity=".16">${sh}</g>`;
    /* 兩旁：矮石牆 ＋ 鐵欄杆（一直延伸到畫面外） */
    const wall = (xa, xb) => {
      let bars = '', tips = '';
      const lo = Math.min(xa, xb), hi = Math.max(xa, xb);
      for (let x = lo + 8; x < hi; x += 16) { bars += `M${x} 470V376`; tips += `<path d="M${x - 3.5} 378L${x} 366L${x + 3.5} 378Z"/>`; }
      return `<rect x="${lo}" y="470" width="${hi - lo}" height="130" fill="url(#dr-wall)"/>` +
        `<rect x="${lo}" y="460" width="${hi - lo}" height="12" fill="#e9dfcb" stroke="#c9bb9f"/>` +
        `<path d="${Array.from({ length: Math.ceil((hi - lo) / 60) }, (_, i) => `M${lo + i * 60} 472V600`).join('')}M${lo} 516H${hi}M${lo} 558H${hi}" stroke="#cdbfa3" stroke-width="1.5"/>` +
        `<g stroke="${IRON}" stroke-width="3.2" fill="none"><path d="${bars}"/><path d="M${lo} 392H${hi}M${lo} 452H${hi}" stroke-width="4"/></g>` +
        `<g fill="${GOLD}">${tips}</g>`;
    };
    s += wall(-3000, 40) + wall(560, 3600);
    /* 牆上爬的藤與玫瑰 */
    const ivy = (x0, x1, y0, y1, n) => {
      let t = '';
      for (let k = 0; k < n; k++) {
        const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0);
        t += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(7 + r() * 5)}" ry="${f(4 + r() * 2)}" transform="rotate(${f(r() * 360)} ${f(x)} ${f(y)})" fill="${['#5f8a45', '#7fa65a', '#4c7438'][k % 3]}"/>`;
        if (k % 7 === 0) t += rose(x + 4, y - 3, 6 + r() * 3, r() < .5 ? '#fff' : '#f7d7de');
      }
      return t;
    };
    s += ivy(-420, 40, 440, 600, 120) + ivy(560, 1020, 440, 600, 120);
    /* 石柱 */
    const pillar = (x) => {
      let p = `<rect x="${x - 6}" y="560" width="92" height="40" fill="#d8ccb2"/>`;
      p += `<rect x="${x}" y="150" width="80" height="410" fill="url(#dr-stone)"/>`;
      for (let y = 180; y < 560; y += 30) p += `<path d="M${x} ${y}H${x + 80}" stroke="#cbbd9f" stroke-width="1.6"/>`;
      p += `<rect x="${x + 10}" y="200" width="60" height="300" fill="none" stroke="#d3c6aa" stroke-width="2"/>`;
      /* 小尖塔：方形的塔身 ＋ 尖頂 ＋ 頂上一顆十字花 */
      p += `<rect x="${x - 6}" y="136" width="92" height="16" fill="#e9dfcb" stroke="#c9bb9f"/>`;
      p += `<path d="M${x + 6} 136L${x + 40} 30L${x + 74} 136Z" fill="url(#dr-stone)" stroke="#c9bb9f"/>`;
      for (let k = 0; k < 5; k++) { const yy = 120 - k * 18, w = 30 - k * 5.5; p += `<path d="M${f(x + 40 - w)} ${yy}q-6 -4 -2 -9M${f(x + 40 + w)} ${yy}q6 -4 2 -9" stroke="#c9bb9f" stroke-width="2.5" fill="none"/>`; }
      p += `<path d="M${x + 40} 30V10M${x + 32} 18H${x + 48}" stroke="${GOLD}" stroke-width="3"/>`;
      return p;
    };
    s += pillar(30) + pillar(490);
    /* 門上的那一道鍛鐵拱（固定不動） */
    s += overthrowGothic();
    return `<svg viewBox="0 0 600 640" aria-hidden="true">${s}</svg>`;
  }
  function overthrowGothic() {
    let s = `<g fill="none" stroke="${IRON}" stroke-linecap="round">`;
    s += `<path d="M110 160Q120 70 300 26Q480 70 490 160" stroke-width="7"/><path d="M134 160Q146 92 300 52Q454 92 466 160" stroke-width="4"/>`;
    /* 三葉形的窗花 */
    for (const [cx, cy, rr] of [[300, 96, 22], [214, 126, 14], [386, 126, 14]]) {
      s += `<path d="M${cx} ${cy - rr}a${rr * .55} ${rr * .55} 0 1 1 ${f(rr * .95)} ${f(rr * 1.2)}a${rr * .55} ${rr * .55} 0 1 1 ${f(-rr * 1.9)} 0a${rr * .55} ${rr * .55} 0 1 1 ${f(rr * .95)} ${f(-rr * 1.2)}Z" stroke-width="3"/>`;
    }
    s += `</g><path d="M300 26V2M290 12H310" stroke="${GOLD}" stroke-width="3.5"/><circle cx="300" cy="96" r="5" fill="${GOLD}"/>`;
    return s;
  }
  function rose(x, y, rr, c) {
    return `<g transform="translate(${f(x)} ${f(y)})"><circle r="${f(rr)}" fill="${c}" stroke="#d8cdb6" stroke-width=".8"/>` +
      `<circle r="${f(rr * .55)}" fill="none" stroke="#d8cdb6" stroke-width=".8"/><circle r="${f(rr * .2)}" fill="#e9dcc0"/></g>`;
  }

  /* ==========================================================
     秘密花園的玻璃門（viewBox 0 0 600 640；
     半圓氣窗 x 150–450、y 100–250；兩扇門 x 150–450、y 260–600）
     門是程式畫的（白漆木框、玻璃）；門以外都是真的照片：
       常春藤牆   ivy-wall.webp     Declan Sun／Unsplash
       垂下來的藤 ivy-hang.webp     去背，Dinah Liu／Unsplash
       牆腳的花   flowers-row.webp  去背，Marianne Krohn／Unsplash
       門後的花園 garden-arch.webp  Annie Spratt／Unsplash（.dr-land，見 door.css）
       地上的碎石 gravel.webp       從 garden-arch 的小徑取一塊，接成可以無縫平鋪
     出處與授權見 README〈秘密花園的照片素材〉。路徑從這支 script 自己的位置推回去
     （預覽頁與正式站的根目錄不一樣）
     ========================================================== */
  const GLASS = { x0: 150, x1: 450, y0: 260, y1: 600 };
  const SCRIPT = document.currentScript && document.currentScript.src;
  const ROOT = SCRIPT ? SCRIPT.replace(/js\/openers\/door\.js.*$/, 'img/') : '/img/';
  const IMG = ROOT + 'secret-garden/';

  /* 一扇玻璃門（左扇；右扇用 CSS 鏡像）。viewBox 0 0 150 340 */
  function glassLeaf() {
    const W = 150, H = 340;
    let panes = '', glints = '', holes = '', bevel = '';
    const cols = 2, rows = 4, px0 = 16, py0 = 16, pw = (W - 32 - (cols - 1) * 8) / cols, ph = (236 - (rows - 1) * 8) / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = px0 + i * (pw + 8), y = py0 + j * (ph + 8);
      panes += `<rect x="${f(x)}" y="${f(y)}" width="${f(pw)}" height="${f(ph)}"/>`;
      holes += `M${f(x)} ${f(y)}h${f(pw)}v${f(ph)}h${f(-pw)}Z`;
      /* 窗格的木條：上緣與左緣一道暗線（光從右上來） */
      bevel += `M${f(x)} ${f(y + ph)}V${f(y)}H${f(x + pw)}`;
      glints += `<path d="M${f(x + pw * .15)} ${f(y + ph)}L${f(x + pw * .55)} ${f(y)}H${f(x + pw * .72)}L${f(x + pw * .32)} ${f(y + ph)}Z"/>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="dr-paint" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9e4d7"/><stop offset=".3" stop-color="#f7f4ec"/><stop offset="1" stop-color="#ece7da"/></linearGradient>
        <linearGradient id="dr-pane" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="rgba(255,255,255,.22)"/><stop offset=".5" stop-color="rgba(220,236,228,.06)"/><stop offset="1" stop-color="rgba(255,255,255,.16)"/></linearGradient>
      </defs>
      <path d="M0 0H${W}V${H}H0Z${holes}" fill="url(#dr-paint)" fill-rule="evenodd"/>
      <rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" fill="none" stroke="#cfc8b6" stroke-width="2"/>
      <g fill="url(#dr-pane)">${panes}</g>
      <path d="${bevel}" fill="none" stroke="rgba(120,108,84,.35)" stroke-width="2"/>
      <g fill="#fff" opacity=".22">${glints}</g>
      <rect x="16" y="268" width="${W - 32}" height="56" fill="#efebe0" stroke="#d3ccba" stroke-width="2"/>
      <path d="M28 312V280H${W - 28}" fill="none" stroke="rgba(120,108,84,.3)" stroke-width="1.6"/>
      <path d="M28 312H${W - 28}V280" fill="none" stroke="#fff" stroke-width="1.6"/>
      <rect x="${W - 14}" y="186" width="7" height="38" rx="3.5" fill="#c9a24a" stroke="#8e6d31" stroke-width=".8"/>
      <rect x="${W - 12.5}" y="190" width="2" height="26" rx="1" fill="#f3dc9a" opacity=".8"/>
    </svg>`;
  }

  function glassFront() {
    let s = `<defs>
      <pattern id="dr-ivy" x="-100" y="-360" width="780" height="520" patternUnits="userSpaceOnUse">
        <image href="${IMG}ivy-wall.webp" width="780" height="520"/></pattern>
      <pattern id="dr-gravel" x="0" y="600" width="170" height="100" patternUnits="userSpaceOnUse">
        <image href="${IMG}gravel.webp" width="170" height="100"/></pattern>
      <radialGradient id="dr-wallShade" gradientUnits="userSpaceOnUse" cx="300" cy="360" r="900">
        <stop offset=".22" stop-color="#0d1a0a" stop-opacity="0"/><stop offset="1" stop-color="#0d1a0a" stop-opacity=".62"/></radialGradient>
      <linearGradient id="dr-groundShade" gradientUnits="userSpaceOnUse" x1="0" y1="600" x2="0" y2="900">
        <stop offset="0" stop-color="#1d2616" stop-opacity=".6"/><stop offset=".18" stop-color="#1d2616" stop-opacity=".12"/><stop offset="1" stop-color="#1d2616" stop-opacity=".35"/></linearGradient>
      <linearGradient id="dr-frameG" gradientUnits="userSpaceOnUse" x1="126" y1="0" x2="474" y2="0">
        <stop offset="0" stop-color="#e7e1d2"/><stop offset=".06" stop-color="#fbf8f0"/><stop offset=".94" stop-color="#f4f0e5"/><stop offset="1" stop-color="#d9d2c0"/></linearGradient>
      <linearGradient id="dr-fadeV" gradientUnits="userSpaceOnUse" x1="0" y1="-20" x2="0" y2="310"><stop offset="0" stop-color="#000"/><stop offset=".2" stop-color="#fff"/><stop offset=".8" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
      <linearGradient id="dr-fadeH" gradientUnits="userSpaceOnUse" x1="50" y1="0" x2="550" y2="0"><stop offset="0" stop-color="#000"/><stop offset=".14" stop-color="#fff"/><stop offset=".86" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
      <mask id="dr-ivyV" maskUnits="userSpaceOnUse" x="50" y="-20" width="500" height="330"><rect x="50" y="-20" width="500" height="330" fill="url(#dr-fadeV)"/></mask>
      <mask id="dr-ivyH" maskUnits="userSpaceOnUse" x="50" y="-20" width="500" height="330"><rect x="50" y="-20" width="500" height="330" fill="url(#dr-fadeH)"/></mask>
      <filter id="dr-cast" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="5" dy="8" stdDeviation="7" flood-color="#0b1408" flood-opacity=".55"/></filter>
      <filter id="dr-leafShadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="2" dy="5" stdDeviation="4" flood-color="#0b1408" flood-opacity=".45"/></filter>
    </defs>`;
    /* 一整面常春藤牆，門的位置挖空（半圓氣窗 ＋ 門）；四周暗一點，視線集中到門上 */
    const wall = `M-3000 -3000H3600V600H-3000ZM150 600V250A150 150 0 0 1 450 250V600Z`;
    s += `<path d="${wall}" fill="#24361d" fill-rule="evenodd"/>`;
    s += `<path d="${wall}" fill="url(#dr-ivy)" fill-rule="evenodd"/>`;
    s += `<path d="${wall}" fill="url(#dr-wallShade)" fill-rule="evenodd"/>`;
    /* 地面：碎石（從門後那張花園照片的小徑取樣）＋ 牆腳的陰影 ＋ 一級台階 */
    s += `<rect x="-3000" y="600" width="6600" height="2000" fill="#b9a68a"/>`;
    s += `<rect x="-3000" y="600" width="6600" height="2000" fill="url(#dr-gravel)"/>`;
    s += `<rect x="-3000" y="600" width="6600" height="2000" fill="url(#dr-groundShade)"/>`;
    s += `<rect x="120" y="600" width="360" height="16" fill="#e7e0d0" stroke="#c9bfa8"/>`;
    /* 牆腳兩叢花（真的花，去背） */
    s += `<g filter="url(#dr-leafShadow)">` +
      `<image href="${IMG}flowers-row.webp" x="-300" y="470" width="440" height="140" preserveAspectRatio="xMaxYMax meet"/>` +
      `<image href="${IMG}flowers-row.webp" x="-300" y="470" width="440" height="140" preserveAspectRatio="xMaxYMax meet" transform="translate(600 0) scale(-1 1)"/></g>`;
    /* 白色的門框、半圓氣窗（放射狀的窗格）、門楣；門框的影子落在常春藤上 */
    s += `<path d="M150 250A150 150 0 0 1 450 250Z" fill="rgba(214,234,222,.14)"/>`;
    let rays = '';
    for (let k = 1; k < 6; k++) { const a = Math.PI + k * Math.PI / 6; rays += `M300 250L${f(300 + Math.cos(a) * 150)} ${f(250 + Math.sin(a) * 150)}`; }
    s += `<path d="${rays}M220 250A80 80 0 0 1 380 250" stroke="#f4f1e8" stroke-width="6" fill="none"/>`;
    s += `<g filter="url(#dr-cast)"><path d="M138 604V250A162 162 0 0 1 462 250V604" fill="none" stroke="url(#dr-frameG)" stroke-width="24"/>`;
    s += `<rect x="146" y="248" width="308" height="14" fill="#f4f1e8" stroke="#d9d3c3"/></g>`;
    s += `<path d="M126 604V250A174 174 0 0 1 474 250V604" fill="none" stroke="#cdc5b1" stroke-width="2"/>`;
    s += `<path d="M150 604V250A150 150 0 0 1 450 250V604" fill="none" stroke="rgba(120,108,84,.35)" stroke-width="2"/>`;
    /* 門楣上垂下來的常春藤（真的藤，去背）：上緣與兩側淡進牆裡，藤往下垂到氣窗前面 */
    s += `<g mask="url(#dr-ivyH)"><g mask="url(#dr-ivyV)" filter="url(#dr-leafShadow)">` +
      `<image href="${IMG}ivy-hang.webp" x="50" y="-20" width="921" height="518"/></g></g>`;
    return `<svg viewBox="0 0 600 640" aria-hidden="true">${s}</svg>`;
  }

  function door(host, ctx) {
    const kind = KIND[ctx.variant] || 'manor';
    host.classList.add('dr-host', `dr-${kind}`);
    const garden = kind === 'garden', manor = kind === 'manor';
    let world;
    if (manor) {
      /* 莊園：整個畫面是一張真的照片 —— 磚牆圓拱裡的一扇鍛鐵花園門。
         門從照片裡分離成自己的一層（gate-leaf，門後補成小徑：gate-scene），
         點一下門繞著右邊的鉸鍊往花園裡轉開；兩旁用同一張照片模糊後補滿 */
      world = `
        <div class="dr-blur"></div>
        <div class="dr-photo">
          <div class="dr-scene"></div>
          <div class="dr-opening" style="left:7.82%;top:13.48%;width:86.55%;height:81.54%"><div class="dr-iron"></div></div>
        </div>`;
    } else {
      const box = garden ? GLASS : GATE;
      const leaf = garden ? glassLeaf() : gateLeaf(kind);
      /* 門洞在 600×640 裡的位置（百分比），兩扇門就照這個放 */
      const pos = `left:${f(box.x0 / 6)}%;width:${f((box.x1 - box.x0) / 6)}%;top:${f(box.y0 / 6.4)}%;height:${f((box.y1 - box.y0) / 6.4)}%`;
      world = `
        <div class="dr-portal">
          <div class="dr-front">${garden ? glassFront() : gateFront(kind)}</div>
          <div class="dr-opening" style="${pos}">
            <div class="dr-leaf dr-l">${leaf}</div>
            <div class="dr-leaf dr-r">${leaf}</div>
          </div>
        </div>`;
    }
    host.innerHTML = `
      <div class="dr-land" aria-hidden="true">${garden || manor ? '' : land(kind)}</div>
      <div class="dr-world" aria-hidden="true">${world}</div>
      <div class="dr-flood" aria-hidden="true"></div>
      <div class="dr-text" aria-hidden="true">
        <div class="dr-kicker">You are invited in</div>
        <div class="dr-names">${LM.namesHtml(ctx)}</div>
        <div class="dr-date">${LM.esc(ctx.date)}</div>
      </div>
      <div class="dr-hint"><span class="en">${garden ? 'Open the garden door' : 'Push the gate'}</span><span class="cn">輕觸畫面・${garden ? '推開這扇玻璃門' : '推開這扇鐵門'}</span></div>`;

    LM.hitButton(host, garden ? '推開玻璃門，進入邀請函' : '推開鐵門，進入邀請函', () => {
      if (host.classList.contains('is-open')) { ctx.finish(); return; }
      ctx.gesture();
      if (ctx.reduce) { ctx.finish(); return; }
      /* 往前走的時候，鏡頭對準門洞的正中間 */
      const o = host.querySelector('.dr-opening').getBoundingClientRect();
      const h = host.getBoundingClientRect();
      host.querySelector('.dr-world').style.transformOrigin =
        `${f(o.left - h.left + o.width / 2)}px ${f(o.top - h.top + o.height * .45)}px`;
      host.classList.add('is-open');
      ctx.later(() => host.classList.add('is-walking'), T.open);
      ctx.later(ctx.reveal, T.open + T.walk * .45);
      ctx.later(ctx.done, T.open + T.walk + 500);
    });
  }

  LM.register('door', door);
})();
