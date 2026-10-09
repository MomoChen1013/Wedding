/* ============================================================
   openers/painting.js — 開場：走進油畫（莫內花園）
   ------------------------------------------------------------
   一開始是美術館的一面牆（鼠尾草綠的錦緞壁紙），牆上掛著一幅金框的油畫：
   莫內的《日本橋》（1899，美國國家藝廊館藏的掃描，public/img/monet/）——
   綠色的拱橋、開滿睡蓮的池塘。金框也是真的照片做的（frame.webp，九宮格）。

     這幅畫是「活的」：池水輕輕起伏、柳葉微微晃、水面的光點一閃一閃
     → 點一下 → 牆往外退、畫框往前衝，畫裡的筆觸被捲成一個漩渦
       （像是被吸進去）→ 整個畫面就是那幅畫 → 溶進網站
       （莫內花園的首頁 hero 就是同一幅畫，所以是「掉進畫裡」）

   ▸ 這支同時是一具「油畫繪製器」（window.MonetPaint）
     有 src 的場景是莫內真跡的掃描（日本橋、塞納河、罌粟花田、柳樹、維特伊的花園、
     國會大廈日落、阿讓特伊的花園），直接載圖；圖載不到才退回程式畫的那一幅：
       1. 先用柔和的色塊打一層底稿（base：天空、樹叢、橋、池塘、睡蓮）
       2. 在底稿上取色，疊上幾萬筆短短的筆觸 —— 大筆鋪色、中筆塑形、
          小筆點出花與光；顏色每一筆都偏一點（莫內的「破色」：
          暗處摻一點藍紫、亮處摻一點黃），筆觸的方向跟著場景走
          （水面橫、柳條直、橋順著弧線）
       3. 每一筆旁邊再補一道細細的亮邊，看起來是有厚度的顏料
     亂數有固定的種子：每一次打開都是同一幅畫。

     MonetPaint.get(scene, shape)   取一幅畫（同一幅只畫一次，大家共用）
     MonetPaint.view(canvas, scene) 把畫掛到一個 <canvas> 上，讓它「流動」
     MonetPaint.mount(root)         找 root 裡所有 canvas[data-monet] 掛上去
                                    （莫內花園的大廳由版型的 lobbyJs 載入這一支）

     場景：bridge 日本橋（hero、開場）、lilies 睡蓮、poppies 罌粟花田、
           wisteria 紫藤、path 花園小徑、sunrise 印象・日出

   ▸ 動的方式：畫好的畫是一張靜態的圖；每一格把它切成很多條橫帶，
     依照高度左右錯開一點點（水面錯得多、樹叢錯得少），就是水在流動。
     看不到的畫不動（IntersectionObserver），系統要求減少動態就完全不動。
============================================================ */
(function () {
  const TAU = Math.PI * 2;
  const reduce = () =>
    !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  const pick = (r, a) => a[Math.floor(r() * a.length)];

  /* 同一個顏色、完全透明（漸層往透明黑化開的話，邊緣會多一圈灰） */
  const clear = (c) => {
    if (c[0] === '#') {
      const n = parseInt(c.slice(1), 16);
      return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},0)`;
    }
    return c.replace(/rgba?\(([^,]+),([^,]+),([^,)]+)(,[^)]*)?\)/, 'rgba($1,$2,$3,0)');
  };
  /* 一團柔軟的色塊（底稿用）：中間實、邊緣化開 */
  function blob(g, x, y, rx, ry, col, a) {
    if (rx < 1 || ry < 1) return;
    g.save();
    g.translate(x, y);
    g.scale(1, ry / rx);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    gr.addColorStop(0, col);
    gr.addColorStop(.55, col);
    gr.addColorStop(1, clear(col));
    g.globalAlpha = a == null ? 1 : a;
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill();
    g.restore();
  }
  function vgrad(g, w, h, y0, y1, stops) {
    const gr = g.createLinearGradient(0, y0 * h, 0, y1 * h);
    stops.forEach(([o, c]) => gr.addColorStop(o, c));
    g.fillStyle = gr;
    g.fillRect(0, y0 * h, w, (y1 - y0) * h);
  }

  /* ==========================================================
     場景（座標都用 0..1，寬圖、直圖都畫得出來）
       base(g, w, h, r)  底稿
       dir(x, y, r, asp) 這一點的筆觸方向（弧度；x、y 是 0..1，asp＝高／寬）
       detail(x, y)      這裡要不要補小筆（花、橋、光）
       water             水面從哪裡開始（0..1；沒有水就是 1）
       sway              水面以上的晃動幅度（樹葉、花串）
     ========================================================== */
  const FOLIAGE = ['#2f5a3a', '#3f6b3e', '#4f7d45', '#5f8c4a', '#7da55a', '#93b562', '#a9c46a', '#3f7a62', '#5a8f78'];
  const LIGHT = ['#c9d38a', '#dfe0a0', '#e9e4b4', '#b8cf7a'];

  /* 日本橋的橋面：一條往上拱的弧（x 0..1 → y 0..1） */
  const deckY = (x) => .43 - .13 * (1 - Math.pow(2 * x - 1, 2));
  const deckSlope = (x) => -.13 * (-2 * (2 * x - 1) * 2);

  const SCENES = {
    bridge: {
      seed: 1899, water: .53, sway: 1,
      base(g, w, h, r) {
        vgrad(g, w, h, 0, 1, [[0, '#355f40'], [.3, '#4f7f4b'], [.53, '#557f5a'], [.54, '#4a7b6c'], [1, '#2f5d5c']]);
        /* 樹叢：一大片深深淺淺的綠，上緣透一點天光 */
        for (let i = 0; i < 150; i++) {
          const y = -.05 + r() * .6;
          blob(g, r() * w, y * h, (.04 + r() * .1) * w, (.03 + r() * .08) * w, pick(r, FOLIAGE), .55 + r() * .35);
        }
        for (let i = 0; i < 40; i++) blob(g, r() * w, r() * .32 * h, (.02 + r() * .06) * w, (.015 + r() * .04) * w, pick(r, LIGHT), .45 + r() * .4);
        for (let i = 0; i < 10; i++) blob(g, r() * w, r() * .2 * h, (.02 + r() * .04) * w, (.015 + r() * .03) * w, '#e7ecdc', .5);
        /* 垂柳：左右兩邊一簇一簇垂下來，長短不一、有的被風吹斜 */
        for (let i = 0; i < 70; i++) {
          const side = r() < .5 ? r() * .28 : .72 + r() * .28;
          const top = (r() - .3) * .2, len = .12 + r() * .3;
          const col = pick(r, ['#a9c46a', '#c4d47f', '#8fb35c', '#6f9a4e', '#5f8a48', '#7fa860', '#4f7d45']);
          for (let k = 0; k < 6; k++) {
            const t = k / 6;
            blob(g, (side + t * t * (r() - .4) * .04) * w, (top + t * len) * h, (.012 + r() * .016) * w * (1 - t * .5), len * .16 * h, col, .3 + r() * .3);
          }
        }
        for (let i = 0; i < 26; i++) blob(g, r() * w, (.1 + r() * .4) * h, (.03 + r() * .06) * w, (.02 + r() * .05) * w, pick(r, ['#2f5a3a', '#3f6b3e', '#355f40']), .45);
        /* 池塘：倒映著樹叢的綠與一點天空的淡紫 */
        for (let i = 0; i < 70; i++) {
          const y = .54 + r() * .46;
          blob(g, r() * w, y * h, (.015 + r() * .04) * w, (.04 + r() * .08) * h, pick(r, ['#3f6b52', '#4f7d5a', '#2f5a52', '#5f8c6a', '#6f9a7a']), .5 + r() * .3);
        }
        for (let i = 0; i < 34; i++) {
          const y = .55 + r() * .45;
          blob(g, r() * w, y * h, (.03 + r() * .07) * w, (.008 + r() * .016) * h, pick(r, ['#b9b7d6', '#cdd4dc', '#a99cc4', '#d9e2e6', '#9fb8c4']), .35 + r() * .35);
        }
        /* 橋在水裡的倒影：暗一點、淡一點、往下拉長 */
        g.save();
        g.globalAlpha = .38;
        g.strokeStyle = '#2f5f55';
        g.lineWidth = .03 * h;
        g.beginPath();
        for (let k = 0; k <= 60; k++) { const x = k / 60; const y = 2 * .53 - deckY(x) + .04; k ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h); }
        g.stroke();
        g.restore();
        /* 橋：橋面、兩道欄杆、一根一根的欄柱（左上受光） */
        const arc = (dy, lw, col) => {
          g.strokeStyle = col; g.lineWidth = lw * h; g.lineCap = 'round';
          g.beginPath();
          for (let k = 0; k <= 80; k++) { const x = -.02 + k / 80 * 1.04; const y = deckY(x) + dy; k ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h); }
          g.stroke();
        };
        arc(.022, .03, 'rgba(36,70,58,.85)');
        arc(0, .032, '#5d8f7b');
        arc(-.008, .012, '#9cc7a8');
        arc(-.085, .012, '#5f9a86');
        arc(-.087, .005, '#b5d8b9');
        arc(-.05, .008, '#5f9a86');
        g.strokeStyle = '#5a907c';
        g.lineWidth = .008 * w;
        for (let x = 0; x <= 1.001; x += .055) {
          g.beginPath(); g.moveTo(x * w, (deckY(x) - .087) * h); g.lineTo(x * w, (deckY(x) + .01) * h); g.stroke();
        }
        /* 睡蓮葉：一叢一叢，越近越大（透視），有些開著花 */
        for (let c = 0; c < 16; c++) {
          const cx = r(), cy = .58 + r() * .44;
          const n = 3 + Math.floor(r() * 6);
          for (let k = 0; k < n; k++) {
            const y = cy + (r() - .5) * .06;
            const s = (.018 + (y - .55) * .1) * (.7 + r() * .6);
            const x = cx + (r() - .5) * s * 5;
            blob(g, x * w, y * h, s * w, s * w * .32, pick(r, ['#6e9a4e', '#8bb05a', '#5a8040', '#7fa456']), .95);
            blob(g, (x - s * .2) * w, (y - s * .06) * h, s * .5 * w, s * .12 * w, '#a8c672', .7);
            if (r() < .32) {
              const fc = pick(r, ['#f0a7b6', '#f4efe6', '#e77d8e', '#f7d6dc', '#d9576a']);
              blob(g, (x + (r() - .5) * s) * w, (y - s * .1) * h, s * .28 * w, s * .16 * w, fc, 1);
              blob(g, (x + (r() - .5) * s * .3) * w, (y - s * .14) * h, s * .08 * w, s * .05 * w, '#f3d36b', .9);
            }
          }
        }
      },
      dir(x, y, r, asp) {
        if (y > .53) return (r() - .5) * .35;
        const d = y - deckY(x);
        if (d > -.11 && d < .04) return Math.atan(deckSlope(x) * asp) + (r() - .5) * .25;
        if (x < .26 || x > .74) return Math.PI / 2 + (r() - .5) * .5;
        return .7 + (r() - .5) * 1.6;
      },
      detail(x, y) { const d = y - deckY(x); return y > .57 || (d > -.11 && d < .04); },
    },

    lilies: {
      seed: 1916, water: 0, sway: 0,
      base(g, w, h, r) {
        vgrad(g, w, h, 0, 1, [[0, '#7f9fb8'], [.35, '#6f8fa8'], [.7, '#4f7a7a'], [1, '#3f6a62']]);
        /* 水裡倒映的柳條（直的深綠）與天光（橫的淡紫） */
        for (let i = 0; i < 40; i++) blob(g, r() * w, r() * h, (.012 + r() * .03) * w, (.08 + r() * .16) * h, pick(r, ['#3f6b52', '#2f5a52', '#4f7d6a', '#5a8a6e']), .45 + r() * .3);
        for (let i = 0; i < 40; i++) blob(g, r() * w, r() * h, (.04 + r() * .09) * w, (.01 + r() * .02) * h, pick(r, ['#b9b7d6', '#d9dbe8', '#a99cc4', '#c6cfe0', '#e8d8e4']), .35 + r() * .4);
        for (let c = 0; c < 14; c++) {
          const cx = r(), cy = .1 + r() * .92;
          const n = 3 + Math.floor(r() * 5);
          for (let k = 0; k < n; k++) {
            const y = cy + (r() - .5) * .07;
            const s = (.03 + y * .07) * (.7 + r() * .6);
            const x = cx + (r() - .5) * s * 4;
            blob(g, x * w, y * h, s * w, s * w * .34, pick(r, ['#6e9a4e', '#8bb05a', '#5a8040', '#4f7a44']), .95);
            blob(g, (x - s * .2) * w, (y - s * .05) * h, s * .5 * w, s * .12 * w, '#b4cf7c', .65);
            if (r() < .35) {
              const fc = pick(r, ['#f0a7b6', '#f6efe7', '#e77d8e', '#f7d6dc']);
              blob(g, (x + (r() - .5) * s) * w, (y - s * .1) * h, s * .3 * w, s * .18 * w, fc, 1);
              blob(g, (x + (r() - .5) * s * .3) * w, (y - s * .15) * h, s * .08 * w, s * .05 * w, '#f3d36b', .9);
            }
          }
        }
      },
      dir(x, y, r) { return r() < .25 ? Math.PI / 2 + (r() - .5) * .3 : (r() - .5) * .3; },
      detail(x, y) { return true; },
    },

    poppies: {
      seed: 1873, water: 1, sway: .7,
      base(g, w, h, r) {
        vgrad(g, w, h, 0, .5, [[0, '#8fb2d6'], [.6, '#b7cde0'], [1, '#e2e6df']]);
        for (let i = 0; i < 26; i++) blob(g, r() * w, r() * .36 * h, (.06 + r() * .12) * w, (.03 + r() * .05) * w, pick(r, ['#ffffff', '#f4f2ec', '#e8ecef', '#dfe3ea']), .6 + r() * .3);
        /* 遠方的樹：藍藍綠綠的一排 */
        for (let i = 0; i < 60; i++) blob(g, r() * w, (.42 + r() * .1) * h, (.02 + r() * .05) * w, (.02 + r() * .04) * w, pick(r, ['#4f6f55', '#5f7f5a', '#3f5f4f', '#6f8a66', '#7f9a7a']), .8);
        vgrad(g, w, h, .5, 1, [[0, '#a4ad6a'], [.4, '#8f9f55'], [1, '#6f8a45']]);
        for (let i = 0; i < 60; i++) blob(g, r() * w, (.52 + r() * .5) * h, (.03 + r() * .08) * w, (.01 + r() * .03) * h, pick(r, ['#b9b878', '#7f9a4f', '#c9c08a', '#6f8a45', '#a6b56f']), .6);
        /* 罌粟：從左下斜斜地鋪上來的一大片紅 */
        for (let i = 0; i < 520; i++) {
          const t = r();
          const x = t * .85 + (r() - .5) * .35;
          const y = 1.02 - t * .42 + (r() - .5) * .14;
          if (y < .53) continue;
          const s = (.004 + (y - .5) * .018) * (.7 + r() * .7);
          blob(g, x * w, y * h, s * w, s * w * .8, pick(r, ['#d9442f', '#c8382a', '#e2583b', '#b52e25', '#ef7a55']), .95);
        }
        /* 撐陽傘的女人與孩子：很小的兩個身影 */
        const fx = .62, fy = .7;
        blob(g, fx * w, fy * h, .012 * w, .05 * h, '#2b3550', 1);
        blob(g, fx * w, (fy - .06) * h, .03 * w, .012 * w, '#3f5a86', .95);
        blob(g, (fx + .03) * w, (fy + .02) * h, .008 * w, .03 * h, '#efe9dc', 1);
        blob(g, (fx + .03) * w, (fy - .02) * h, .007 * w, .006 * w, '#2b3550', 1);
      },
      dir(x, y, r) { return y < .5 ? (r() - .5) * .5 + .15 : .4 + (r() - .5) * 1.8; },
      detail(x, y) { return y > .52; },
    },

    wisteria: {
      seed: 1919, water: 1, sway: 1.4,
      base(g, w, h, r) {
        vgrad(g, w, h, 0, 1, [[0, '#a9c4b4'], [.5, '#c9d8cc'], [1, '#d9e0d0']]);
        for (let i = 0; i < 30; i++) blob(g, r() * w, r() * .5 * h, (.05 + r() * .1) * w, (.03 + r() * .06) * w, pick(r, ['#7fa57a', '#93b585', '#6f9a6e', '#a6c49a']), .55);
        /* 一串一串垂下來的紫藤：上寬下尖 */
        for (let i = 0; i < 40; i++) blob(g, r() * w, (.6 + r() * .45) * h, (.05 + r() * .1) * w, (.03 + r() * .05) * w, pick(r, ['#8fb07f', '#a6c49a', '#7f9f78', '#c9d6c0', '#b9b0d6']), .6);
        for (let c = 0; c < 26; c++) {
          const cx = r() * w, top = (-.05 + r() * .25) * h, len = (.45 + r() * .55) * h;
          const col = pick(r, [['#8e7cc3', '#b9a8de', '#6f5aa8'], ['#a593d0', '#cfc3ea', '#7f6ab8'], ['#7f6fb8', '#a99cd8', '#5f4f98']]);
          for (let k = 0; k < 40; k++) {
            const t = k / 40;
            const ww = (1 - t) * .028 * w + 2;
            blob(g, cx + (r() - .5) * ww * 2, top + t * len, ww * (.5 + r() * .5), ww * .7, pick(r, col), .7 + r() * .3);
          }
          for (let k = 0; k < 5; k++) blob(g, cx + (r() - .5) * .06 * w, top + r() * .05 * h, .02 * w, .008 * w, '#6f9a5e', .8);
        }
      },
      dir(x, y, r) { return Math.PI / 2 + (r() - .5) * .9; },
      detail(x, y) { return true; },
    },

    path: {
      seed: 1902, water: 1, sway: .8,
      base(g, w, h, r) {
        vgrad(g, w, h, 0, .3, [[0, '#a9c4dc'], [1, '#dfe6e4']]);
        vgrad(g, w, h, .3, 1, [[0, '#5f8a55'], [1, '#3f6a42']]);
        /* 盡頭的房子：粉紅色的牆、綠色的百葉窗 */
        g.fillStyle = '#e4b2a6'; g.fillRect(.36 * w, .17 * h, .28 * w, .16 * h);
        g.fillStyle = '#c98f86'; g.fillRect(.33 * w, .14 * h, .34 * w, .04 * h);
        g.fillStyle = '#4f8a5c';
        for (let k = 0; k < 4; k++) g.fillRect((.39 + k * .065) * w, .22 * h, .03 * w, .06 * h);
        for (let i = 0; i < 60; i++) blob(g, r() * w, (.05 + r() * .3) * h, (.04 + r() * .08) * w, (.03 + r() * .05) * w, pick(r, FOLIAGE), .7);
        /* 小徑：往房子收過去的梯形，地上有光斑 */
        const pg = g.createLinearGradient(0, .33 * h, 0, h);
        pg.addColorStop(0, '#e6d7c0'); pg.addColorStop(1, '#cdb497');
        g.fillStyle = pg;
        g.beginPath(); g.moveTo(.46 * w, .33 * h); g.lineTo(.54 * w, .33 * h); g.lineTo(.86 * w, 1.02 * h); g.lineTo(.14 * w, 1.02 * h); g.closePath(); g.fill();
        /* 路上的樹影（淡紫）與光斑 */
        for (let i = 0; i < 70; i++) {
          const y = .35 + r() * .67, half = .04 + (y - .33) * .52;
          blob(g, (.5 + (r() - .5) * half * 1.8) * w, y * h, (.01 + y * .05) * w, (.004 + y * .014) * h, pick(r, ['#b9a8c8', '#efe2c4', '#a88f9a', '#f6ecd4', '#9c8fb4']), .65);
        }
        /* 兩邊的花圃：紫的鳶尾、紅的、粉的、橘色的金蓮花爬到路上 */
        for (let i = 0; i < 1100; i++) {
          const y = .3 + r() * .72;
          const half = .04 + (y - .33) * .52;
          const side = r() < .5 ? -1 : 1;
          const x = .5 + side * (half * (.75 + r() * .3) + Math.pow(r(), 1.6) * .62);
          const s = (.004 + y * .016) * (.6 + r() * .8);
          const c = r() < .55 ? pick(r, ['#7f5fb8', '#9a7cd0', '#6a4f9e', '#b39ade']) : r() < .5 ? pick(r, ['#d9442f', '#e8714a', '#f09a4a']) : pick(r, ['#f0a7b6', '#e77d8e', '#f6d7de', '#ffffff']);
          blob(g, x * w, y * h, s * w, s * w * 1.4, r() < .3 ? pick(r, FOLIAGE) : c, .9);
        }
      },
      dir(x, y, r) {
        const dx = x - .5, dy = y - .33;
        if (Math.abs(dx) < .04 + Math.max(0, dy) * .52 && y > .33) return Math.atan2(dy, dx) + (r() - .5) * .4;
        return Math.PI / 2 + (r() - .5) * 1.2;
      },
      detail(x, y) { return y > .3; },
    },

    sunrise: {
      seed: 1872, water: .5, sway: .3,
      base(g, w, h, r) {
        vgrad(g, w, h, 0, .5, [[0, '#7f97a8'], [.45, '#a8b2b4'], [.75, '#d8a98e'], [1, '#9fb0b4']]);
        for (let i = 0; i < 30; i++) blob(g, r() * w, r() * .45 * h, (.06 + r() * .14) * w, (.01 + r() * .025) * h, pick(r, ['#e7b393', '#c99a8a', '#9fb2bc', '#b8c1c4', '#f0c3a0']), .45);
        /* 霧裡的港口：起重機、桅杆、煙囪，淡淡的灰藍 */
        g.strokeStyle = 'rgba(80,100,115,.45)';
        for (let i = 0; i < 26; i++) {
          const x = r() * w, top = (.15 + r() * .25) * h;
          g.lineWidth = (.002 + r() * .004) * w;
          g.beginPath(); g.moveTo(x, top); g.lineTo(x + (r() - .5) * .01 * w, .5 * h); g.stroke();
        }
        for (let i = 0; i < 16; i++) blob(g, r() * w, (.38 + r() * .1) * h, (.03 + r() * .06) * w, (.015 + r() * .02) * h, '#7d8e98', .5);
        vgrad(g, w, h, .5, 1, [[0, '#8fa8b0'], [.4, '#6f8f9c'], [1, '#3f6a7f']]);
        for (let i = 0; i < 60; i++) blob(g, r() * w, (.5 + r() * .5) * h, (.04 + r() * .1) * w, (.004 + r() * .01) * h, pick(r, ['#9fb8c0', '#5f8090', '#b8c8c8', '#3f6070', '#d8b098']), .5);
        /* 小船：兩三艘深藍的，船上站一個人 */
        for (const [bx, by, s] of [[.32, .74, 1.5], [.56, .64, .9], [.74, .59, .6]]) {
          blob(g, bx * w, by * h, .07 * s * w, .016 * s * w, '#1c2a40', 1);
          blob(g, (bx + .012 * s) * w, (by - .04 * s) * h, .008 * s * w, .045 * s * h, '#1c2a40', 1);
          blob(g, (bx + .012 * s) * w, (by - .085 * s) * h, .006 * s * w, .006 * s * w, '#1c2a40', 1);
          blob(g, bx * w, (by + .05 * s) * h, .08 * s * w, .01 * s * w, '#2a3a52', .55);
        }
      },
      dir(x, y, r) { return (r() - .5) * (y < .5 ? .6 : .25); },
      detail(x, y) { return y > .55; },
    },

    /* ---- 真的莫內（美國國家藝廊、芝加哥藝術博物館上傳到 Unsplash 的館藏掃描，見 README）----
       有 src 的場景直接用那一張畫，一樣切成橫帶讓水面流動；
       圖載不到就退回 fallback 那一幅程式畫的。water／sway 是照著每一幅畫量的 */
    footbridge:  { src:'footbridge.webp',  water:.38, sway:.9, fallback:'bridge',  seed:1899 },
    seine:       { src:'seine.webp',       water:.5,  sway:.6, fallback:'lilies',  seed:1897 },
    poppies2:    { src:'poppies.webp',     water:1,   sway:.5, fallback:'poppies', seed:1890 },
    willows:     { src:'willows.webp',     water:1,   sway:1.1, fallback:'wisteria', seed:1880 },
    vetheuil:    { src:'garden-path.webp', water:1,   sway:.7, fallback:'path',    seed:1881 },
    parliament:  { src:'parliament.webp',  water:.56, sway:.3, fallback:'sunrise', seed:1903 },
    argenteuil:  { src:'argenteuil.webp',  water:1,   sway:.5, fallback:'lilies',  seed:1873 },
  };

  /* ==========================================================
     繪製：底稿 → 取色 → 一層一層的筆觸
     ========================================================== */
  /* 畫的圖檔放在 public/img/monet/：從這一支自己的網址往回推，
     正式站（/js/openers/）與 preview（../public/js/openers/）都對得上 */
  const IMG = (() => {
    try { return new URL('../../img/monet/', document.currentScript.src).href; } catch (e) { return '/img/monet/'; }
  })();

  const SHAPES = { wide: [1200, 800], tall: [780, 1170], square: [960, 960], small: [560, 420], smallTall: [420, 560] };
  const cache = new Map();

  function shapeFor(w, h) {
    const a = w / Math.max(1, h);
    return a >= 1.15 ? 'wide' : a <= .87 ? 'tall' : 'square';
  }

  /* 回傳 { canvas, done, progress, ready:Promise }。畫是分很多格畫完的
     （每一格最多 9ms），不會卡住捲動；progress 0 → 1 */
  function get(sceneKey, shape) {
    const scene = SCENES[sceneKey] || SCENES.bridge;
    if (scene.src) return getPhoto(sceneKey, scene);
    const sh = SHAPES[shape] ? shape : 'wide';
    const key = `${sceneKey}:${sh}`;
    if (cache.has(key)) return cache.get(key);
    const [w, h] = SHAPES[sh];
    const job = { canvas: document.createElement('canvas'), w, h, scene, done: false, progress: 0 };
    job.canvas.width = w; job.canvas.height = h;
    job.ready = new Promise((res) => { job._res = res; });
    cache.set(key, job);
    paint(job);
    return job;
  }

  /* 真的畫：載入圖檔畫進 canvas（同一幅只載一次）；載不到就改畫 fallback 那一幅 */
  function getPhoto(sceneKey, scene) {
    if (cache.has(sceneKey)) return cache.get(sceneKey);
    const job = { canvas: document.createElement('canvas'), w: 0, h: 0, scene, done: false, progress: 0, photo: true };
    job.ready = new Promise((res) => { job._res = res; });
    cache.set(sceneKey, job);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      job.w = job.canvas.width = Math.round(img.naturalWidth * k);
      job.h = job.canvas.height = Math.round(img.naturalHeight * k);
      job.canvas.getContext('2d').drawImage(img, 0, 0, job.w, job.h);
      job.done = true; job.progress = 1;
      job._res(job);
    };
    img.onerror = () => {
      const fb = SCENES[scene.fallback] || SCENES.bridge;
      [job.w, job.h] = SHAPES.wide;
      job.canvas.width = job.w; job.canvas.height = job.h;
      job.scene = fb;
      paint(job);
    };
    img.src = IMG + scene.src;
    return job;
  }

  function paint(job) {
    const { w, h, scene } = job;
    const r = rng(scene.seed);
    /* 底稿：畫在另一張畫布上，只拿來取色 */
    const base = document.createElement('canvas');
    base.width = w; base.height = h;
    const bg = base.getContext('2d');
    scene.base(bg, w, h, r);
    const asp = h / w;
    const px = bg.getImageData(0, 0, w, h).data;

    const g = job.canvas.getContext('2d');
    /* 打底：一層米色的畫布，上面是糊開的底稿（「淡彩」） */
    g.fillStyle = '#efe6d2';
    g.fillRect(0, 0, w, h);
    g.save();
    g.globalAlpha = .82;
    g.filter = 'blur(6px)';
    g.drawImage(base, 0, 0);
    g.restore();
    g.filter = 'none';

    const k = w / 1000;
    const A = w * h;
    const passes = [
      { n: A / (28 * 11 * k * k) * 1.25, len: [20, 36], wid: [8, 13], jit: 26, hi: .45, all: true },
      { n: A / (15 * 6 * k * k) * 1.1, len: [10, 19], wid: [4, 7], jit: 22, hi: .4, all: true },
      { n: A / (8 * 3.2 * k * k) * .55, len: [5, 10], wid: [2, 3.6], jit: 18, hi: .25, all: false },
    ];
    const total = passes.reduce((s, p) => s + Math.round(p.n), 0);
    let pi = 0, done = 0, inPass = 0;

    function stroke(p) {
      const x = r() * w, y = r() * h;
      const nx = x / w, ny = y / h;
      if (!p.all && !scene.detail(nx, ny) && r() > .2) return;
      const i = ((y | 0) * w + (x | 0)) * 4;
      let R = px[i], G = px[i + 1], B = px[i + 2];
      const l = (r() - .5) * p.jit;
      R += l + (r() - .5) * p.jit * .5; G += l + (r() - .5) * p.jit * .5; B += l + (r() - .5) * p.jit * .5;
      const lum = R * .3 + G * .59 + B * .11;
      /* 破色：暗處摻藍紫、亮處摻暖黃 */
      if (r() < .14) { if (lum < 110) { B += 22; R += 10; } else if (lum > 165) { R += 16; G += 12; B -= 14; } }
      const len = (p.len[0] + r() * (p.len[1] - p.len[0])) * k;
      const wid = (p.wid[0] + r() * (p.wid[1] - p.wid[0])) * k;
      const a = scene.dir(nx, ny, r, asp);
      g.fillStyle = `rgb(${R | 0},${G | 0},${B | 0})`;
      g.globalAlpha = .82 + r() * .18;
      g.beginPath(); g.ellipse(x, y, len / 2, wid / 2, a, 0, TAU); g.fill();
      /* 顏料的厚度：上緣一道細細的亮邊 */
      if (r() < p.hi) {
        const ox = Math.sin(a) * wid * .22, oy = -Math.cos(a) * wid * .22;
        g.fillStyle = `rgb(${Math.min(255, R + 34) | 0},${Math.min(255, G + 32) | 0},${Math.min(255, B + 26) | 0})`;
        g.globalAlpha = .35;
        g.beginPath(); g.ellipse(x + ox, y + oy, len * .38, wid * .18, a, 0, TAU); g.fill();
      }
    }

    function step() {
      const t0 = performance.now();
      while (pi < passes.length && performance.now() - t0 < 9) {
        const p = passes[pi];
        for (let m = 0; m < 160 && inPass < p.n; m++, inPass++, done++) stroke(p);
        if (inPass >= p.n) { pi++; inPass = 0; }
      }
      g.globalAlpha = 1;
      job.progress = Math.min(1, done / total);
      if (pi < passes.length) { requestAnimationFrame(step); return; }
      job.done = true; job.progress = 1;
      job._res(job);
    }
    step();
  }

  /* 水面的光點：位置固定（種子），只在水面上 */
  function glints(scene, n) {
    const r = rng(scene.seed + 7);
    const out = [];
    const top = scene.water >= 1 ? 2 : scene.water;
    for (let i = 0; i < n && top < 1; i++) out.push({ x: r(), y: top + .02 + r() * (1 - top - .02), s: .5 + r(), ph: r() * TAU, sp: .6 + r() * 1.4 });
    return out;
  }

  /* ==========================================================
     流動：把畫掛到一個 <canvas> 上
       opts.reveal  ms：捲到時才一筆一筆畫出來（畫完之前看得到過程）
       opts.still   不要流動（只畫一次）
     回傳 { pull(p) } —— 開場用：p 0 → 1 把畫捲成漩渦、放大
     ========================================================== */
  function view(el, sceneKey, opts) {
    const o = opts || {};
    const still = o.still || reduce();
    const ctx = el.getContext('2d');
    let job = null, W = 0, H = 0, raf = 0, visible = true, t = 0, last = 0, pull = 0;
    /* reveal：一張遮罩，每一格在上面蓋幾筆，畫就從那幾筆的地方露出來 */
    let revealAt = o.reveal ? -1 : 0, mask = null, mg = null, stamped = 0;
    const scene = SCENES[sceneKey] || SCENES.bridge;
    const gl = glints(scene, 34);
    const mr = rng(scene.seed + 3);

    function size() {
      const cw = el.clientWidth, ch = el.clientHeight;
      if (!cw || !ch) return false;
      const sc = Math.min(1.25, window.devicePixelRatio || 1, 1500 / Math.max(cw, ch));
      const nw = Math.round(cw * sc), nh = Math.round(ch * sc);
      if (nw !== W || nh !== H) { W = el.width = nw; H = el.height = nh; }
      const shape = o.shape ? (W >= H ? o.shape : o.shape + 'Tall') : shapeFor(W, H);
      const nj = get(sceneKey, SHAPES[shape] ? shape : shapeFor(W, H));
      if (nj !== job) { job = nj; el.classList.toggle('is-painted', job.done); job.ready.then(() => { el.classList.add('is-painted'); kick(); }); }
      return true;
    }

    function draw(now) {
      raf = 0;
      if (!job || !W || !job.w) return;
      /* 平常的流動只要每秒 30 格就夠了（省電）；被吸進去、一筆一筆畫上去的時候才全速 */
      if (last && pull === 0 && revealAt <= 0 && job.done && now - last < 30) { raf = requestAnimationFrame(draw); return; }
      const dt = last ? Math.min(.05, (now - last) / 1000) : 0;
      last = now;
      if (!still) t += dt;
      const img = job.canvas, pw = job.w, ph = job.h;
      /* cover：畫裁成這個框的比例 */
      const s = Math.max(W / pw, H / ph);
      const sw = W / s, sh = H / s, sx = (pw - sw) / 2, sy = (ph - sh) / 2;
      ctx.globalAlpha = 1;

      /* reveal：還沒捲到 → 整張空白的畫布；捲到了 → 一筆一筆蓋上去 */
      let masking = false;
      if (o.reveal && revealAt !== 0) {
        if (!mask || mask.width !== W || mask.height !== H) {
          mask = document.createElement('canvas'); mask.width = W; mask.height = H;
          mg = mask.getContext('2d'); mg.fillStyle = '#000'; stamped = 0;
        }
        if (revealAt > 0 && job.done) {
          const k = Math.min(1, (now - revealAt) / o.reveal);
          const unit = Math.max(W, H) / 16;
          const want = Math.round(k * k * (W * H) / (unit * unit * .3) * 1.9);
          for (; stamped < want; stamped++) {
            const x = mr() * W, y = mr() * H, l = unit * (.6 + mr() * .9);
            mg.beginPath(); mg.ellipse(x, y, l, l * (.28 + mr() * .2), (mr() - .5) * 1.2, 0, TAU); mg.fill();
          }
          if (k >= 1) { revealAt = 0; mask = null; }
        }
        masking = !!mask;
      }

      const p = pull;
      ctx.save();
      if (p > 0) {
        ctx.fillStyle = '#2a3a33'; ctx.fillRect(0, 0, W, H);
        ctx.translate(W / 2, H / 2);
        ctx.rotate(p * p * .55);
        const z = 1 + p * p * 1.6;
        ctx.scale(z, z);
        ctx.translate(-W / 2, -H / 2);
      }
      if (still && p === 0) {
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
      } else {
        /* 一條一條橫帶，依高度左右錯開：水面錯得多，樹叢錯得少 */
        const band = 3;
        const wy = scene.water;
        const amp = (1 + p * 14) * (W / 900);
        for (let y = 0; y < H; y += band) {
          const srcY = sy + (y / H) * sh, ny = srcY / ph;
          let dx;
          if (ny >= wy) {
            const dep = wy >= 1 ? 0 : (ny - wy) / Math.max(.05, 1 - wy);
            dx = amp * (.9 + dep * 2.4) * (Math.sin(t * 1.25 + srcY * .11) + .5 * Math.sin(t * .63 - srcY * .043));
          } else {
            dx = amp * scene.sway * .7 * (1 - ny / Math.max(.05, wy) * .6) * Math.sin(t * .8 + srcY * .032);
          }
          if (p > 0) dx += Math.sin(y / H * 9 + t * 6) * p * p * 40 * (W / 900);
          ctx.drawImage(img, sx + dx / s, srcY, sw, band / s, 0, y, W, band + .6);
        }
        /* 光點：水面上一閃一閃 */
        if (!still && gl.length) {
          ctx.fillStyle = '#fbf6e4';
          for (const q of gl) {
            const a = Math.pow(Math.max(0, Math.sin(t * q.sp + q.ph)), 4) * .55;
            if (a < .02) continue;
            const gx = (q.x * pw - sx) * s, gy = (q.y * ph - sy) * s;
            if (gx < -10 || gx > W + 10 || gy < -10 || gy > H + 10) continue;
            ctx.globalAlpha = a;
            ctx.beginPath(); ctx.ellipse(gx + Math.sin(t + q.ph) * 3, gy, 7 * q.s * (W / 900), 1.6 * q.s * (W / 900), 0, 0, TAU); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
      if (masking) {
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(mask, 0, 0);
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#efe6d2';
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }
      if ((!still && visible) || p > 0 || (masking && revealAt > 0) || !job.done) raf = requestAnimationFrame(draw);
    }
    function kick() { if (!raf && W) { last = 0; raf = requestAnimationFrame(draw); } }

    if ('ResizeObserver' in window) {
      let tm = 0;
      new ResizeObserver(() => { clearTimeout(tm); tm = setTimeout(() => { if (size()) kick(); }, W ? 160 : 0); }).observe(el);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => {
        es.forEach((e) => {
          visible = e.isIntersecting;
          if (visible && revealAt === -1) revealAt = performance.now();
          if (visible) { size(); kick(); }
        });
      }, { threshold: .12 }).observe(el);
    } else if (revealAt === -1) revealAt = performance.now();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
    if (size()) kick();

    return {
      pull(v) { pull = v; kick(); },
      resize() { if (size()) kick(); },
    };
  }

  function mount(root) {
    (root || document).querySelectorAll('canvas[data-monet]').forEach((el) => {
      if (el._monet) return;
      el._monet = view(el, el.dataset.monet, {
        reveal: el.hasAttribute('data-monet-reveal') ? 1800 : 0,
        still: el.hasAttribute('data-monet-still'),
        shape: el.dataset.monetShape,
      });
    });
  }

  window.MonetPaint = { get, view, mount, scenes: Object.keys(SCENES) };

  /* 莫內花園的大廳：骨架已經在畫面上了（site-context.js 換完骨架才載這一支） */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(document));
  else mount(document);

  /* ==========================================================
     開場本體
     ========================================================== */
  const LM = window.LobbyMotion;
  if (!LM) return;
  const T = { pull: 2100, leave: 700 };

  function painting(host, ctx) {
    host.classList.add('pt-host');
    const dabs = Array.from({ length: 26 }, (_, i) => {
      const a = (i / 26) * TAU + (i % 3) * .3;
      const c = ['#7da55a', '#a99cc4', '#f0a7b6', '#5f9a86', '#e9e4b4', '#3f6b52', '#9fb8c4'][i % 7];
      return `<i style="--x:${(Math.cos(a) * 70).toFixed(1)}vmax;--y:${(Math.sin(a) * 70).toFixed(1)}vmax;--r:${(a * 57.3 + 90).toFixed(0)}deg;--c:${c};--d:${(i % 5) * .06}s"></i>`;
    }).join('');
    host.innerHTML = `
      <div class="pt-room" aria-hidden="true">
        <div class="pt-wall"></div>
        <div class="pt-light"></div>
        <div class="pt-floor"></div>
      </div>
      <div class="pt-stage" aria-hidden="true">
        <div class="pt-frame">
          <div class="pt-liner">
            <div class="pt-canvas">
              <canvas class="pt-paint"></canvas>
              <i class="pt-weave"></i>
            </div>
          </div>
        </div>
        <div class="pt-plaque">
          <div class="pt-plaque-t">Claude Monet ・ Le Pont japonais, 1899</div>
          <div class="pt-plaque-n">${LM.namesHtml(ctx)}</div>
          <div class="pt-plaque-s">une exposition d’amour ・ ${LM.esc(ctx.date)}</div>
        </div>
      </div>
      <div class="pt-dabs" aria-hidden="true">${dabs}</div>
      <div class="pt-hint"><span class="en">Step into the painting</span><span class="cn">輕觸畫作・走進畫裡</span></div>`;

    const cv = host.querySelector('.pt-paint');
    const v = view(cv, 'footbridge', { still: ctx.reduce });
    const frame = host.querySelector('.pt-frame');

    /* 滑鼠移動時畫框跟著輕輕轉一點（手機上不必） */
    const tilt = (e) => {
      if (host.classList.contains('is-open')) return;
      const rx = (e.clientY / innerHeight - .5) * -3, ry = (e.clientX / innerWidth - .5) * 4;
      frame.style.setProperty('--tx', rx.toFixed(2) + 'deg');
      frame.style.setProperty('--ty', ry.toFixed(2) + 'deg');
    };
    if (!ctx.reduce && window.matchMedia && matchMedia('(hover:hover)').matches) host.addEventListener('pointermove', tilt);

    LM.hitButton(host, '走進畫裡，進入邀請函', () => {
      if (host.classList.contains('is-open')) { ctx.finish(); return; }
      ctx.gesture();
      if (ctx.reduce) { ctx.finish(); return; }
      /* 要放大幾倍，畫布那一格才蓋得滿整個視窗 */
      const b = host.querySelector('.pt-canvas').getBoundingClientRect();
      const z = Math.max(innerWidth / b.width, innerHeight / b.height) * 1.12;
      const cx = innerWidth / 2 - (b.left + b.width / 2), cy = innerHeight / 2 - (b.top + b.height / 2);
      host.style.setProperty('--pt-z', z.toFixed(3));
      host.style.setProperty('--pt-cx', cx.toFixed(1) + 'px');
      host.style.setProperty('--pt-cy', cy.toFixed(1) + 'px');
      host.classList.add('is-open', 'is-busy');
      /* 畫裡的筆觸被捲成漩渦：先慢後快（ease-in），最後一刻放開 */
      const t0 = performance.now();
      (function spin(now) {
        const k = Math.min(1, (now - t0) / T.pull);
        const e = k < .82 ? Math.pow(k / .82, 2.2) : 1 - (k - .82) / .18;
        v.pull(Math.max(0, e));
        if (k < 1) requestAnimationFrame(spin);
      })(t0);
      ctx.later(() => { host.classList.add('is-leaving'); ctx.reveal(); }, T.pull - 250);
      ctx.later(ctx.done, T.pull + T.leave);
    });
  }

  LM.register('painting', painting);
})();
