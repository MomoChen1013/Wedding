/* ============================================================
   openers/envelope.js — 開場：一封蓋了封蠟的信
   ------------------------------------------------------------
   一封從背面看的歐式信封：內襯 → 信紙 → 左、右、下三片 → 封口 ＋ 封蠟。
   封蠟是一枚真的香檳金封蠟（Diana Light／Unsplash，去背），中間的印面整平後壓上工作室 logo 的雙戒指。
   沿著鋸齒切成上下兩半，分別黏在封口與下片；拆開前上面另蓋一枚完整的，看不出裂縫。點一下：

     1. 封蠟從中間裂開，上半顆跟著封口走
     2. 封口從尖端開始往上掀（以上緣為軸，往賓客這一側翻起來）
     3. 信紙從袋口往上抽出一小段
     4. 左右下三片往畫面外退開，信紙放大溶進邀請函本身

   時間軸寫在這裡，每一段的樣子寫在 css/openers/envelope.css
   （.is-opening／.is-leaving）。

   ▸ 六款信封（STYLES）：骨架與時間軸都一樣，各自登記成一種開場
     （sites.opening = 'envelope'、'envelope-emboss'……，見 wed-model.js 的 OPENINGS），
     賓客看到的差別寫在 css 的 .env[data-env="…"]。封蠟的顏色是從原本那一枚
     染出來的（scripts/build-envelope-seals.js）。幾款多了自己的一兩樣東西：
       feather  整封信是一張圖（art，見下面 ART）；點下去羽毛從封蠟那裡飛散（plumes）
       silk     一條緞帶橫過封蠟底下；點下去先抽走緞帶（pull 毫秒），才開始拆
       regal    每一片紙上的燙金框（frame）

   ▸ 圖片版（art）：信封不是用 CSS 畫的，而是一張 AI 生成的整封信封照片
     （手機用直式、桌機用橫式各一張，img/envelope/{款}/）。照片照 object-fit:cover 鋪滿畫面，
     再沿著照片裡的摺線切成封口、左、右、下四片 —— 每一張照片的摺線位置不一樣，
     所以多邊形寫在 ART 裡（照片的 %）。掀封口、四散的動畫和 CSS 版一模一樣。
     封蠟是 AI 生成的空白蠟，壓上芯玖 logo 的雙戒指（scripts/build-envelope-seals-rings.js）。
============================================================ */
(function () {
  const LM = window.LobbyMotion;
  const T_LIFT = 1750;   /* 點下去（緞帶抽完）→ 開始退場：封蠟裂開 ＋ 掀封口 ＋ 抽信紙 */
  const T_LEAVE = 1250;  /* 退場本身 */

  /* 開場代號 → 這一款的設定 */
  const STYLES = {
    'envelope':         { env: 'vintage' },                 /* 復古舊紙・古銅封蠟 */
    'envelope-emboss':  { env: 'emboss', art: 'emboss', light: true }, /* 壓紋白信封・金封蠟，拆開時透光、壓紋浮出金邊 */
    'envelope-feather': { env: 'feather', art: 'feather', plumes: 34 }, /* 鵝毛絨白信封・粉紅封蠟 */
    'envelope-silk':    { env: 'silk', art: 'silk', ribbon: true, pull: 760 }, /* 緞帶絲綢白信封・紅封蠟 */
    'envelope-regal':   { env: 'regal', frame: true },      /* 華麗白信封・紅封蠟 */
    'envelope-pure':    { env: 'pure' },                    /* 端莊白信封・金封蠟 */
  };

  const SCRIPT = document.currentScript && document.currentScript.src;
  const ROOT = SCRIPT ? SCRIPT.replace(/js\/openers\/envelope\.js.*$/, 'img/envelope/') : '/img/envelope/';

  /* 圖片版的信封。portrait／landscape 各一張整封照片：
       w, h    照片的像素（算 cover 用）
       tip     封口尖端＝封蠟中心（照片的 %）
       flap    封口：照片上緣 → 沿著羽毛滾邊的外緣 → 尖端（滾邊整條都算封口的，掀起來會一起走）
       left／right  封口外側、一路到底的兩片（被下片蓋住的部分也算它們的，退場時才不會露洞）
       bottom  下片：沿著照片裡那兩條摺痕
       glow    （選填）同一張照片、壓紋泛金的版本：拆開時從封蠟往外一圈一圈亮開
     seal：壓了雙戒指的封蠟（img/envelope/seal-*.webp，幾款共用）；liner：（選填）封口掀開後看到的內襯；
     plumes：飛散用的羽毛（黑底去背）；ribbon：橫過封蠟底下、會被抽走的緞帶（黑底去背）
     （緞帶絲綢的直式：最上層那片封口的尖端在 37%，比其他摺痕會合的那一點高 —— 封蠟和緞帶跟著封口尖端走） */
  const ART = {
    silk: {
      portrait: {
        img: 'portrait.webp', w: 768, h: 1376, tip: [49.4, 37.4],
        flap: [[0, 0], [100, 0], [100, 4.6], [97.6, 5.2], [49.4, 37.6], [2, 5], [0, 4]],
        left: [[0, 4], [2, 5], [49.4, 37.6], [49.4, 100], [0, 100]],
        right: [[100, 4.6], [97.6, 5.2], [49.4, 37.6], [49.4, 100], [100, 100]],
        bottom: [[0, 80], [50, 50], [100, 78.5], [100, 100], [0, 100]],
      },
      landscape: {
        img: 'landscape.webp', w: 1376, h: 768, tip: [50, 49.8],
        flap: [[19.6, 0], [80, 0], [50, 50.2]],
        left: [[0, 0], [19.6, 0], [50, 50.2], [50, 100], [0, 100]],
        right: [[80, 0], [100, 0], [100, 100], [50, 100], [50, 50.2]],
        bottom: [[0, 100], [3, 98.5], [50, 50.6], [97, 98.5], [100, 100]],
      },
      seal: 'seal-red.webp', liner: 'liner.webp', ribbon: 'ribbon.webp',
    },
    emboss: {
      portrait: {
        img: 'portrait.webp', glow: 'glow-portrait.webp', w: 768, h: 1376, tip: [50.3, 48],
        flap: [[0, 0], [100, 0], [100, 5.5], [50.3, 48], [0, 3]],
        left: [[0, 3], [50.3, 48], [50.3, 100], [0, 100]],
        right: [[100, 5.5], [50.3, 48], [50.3, 100], [100, 100]],
        bottom: [[0, 97], [50.3, 49.5], [97.5, 95.5], [100, 96], [100, 100], [0, 100]],
      },
      landscape: {
        img: 'landscape.webp', glow: 'glow-landscape.webp', w: 1408, h: 768, tip: [50, 55],
        flap: [[0, 0], [100, 0], [100, 3], [98.3, 6], [50, 57.4], [1.7, 6], [0, 3]],
        left: [[0, 3], [1.7, 6], [50, 57.4], [50, 100], [0, 100]],
        right: [[100, 3], [98.3, 6], [50, 57.4], [50, 100], [100, 100]],
        bottom: [[0, 92], [50, 46], [100, 92], [100, 100], [0, 100]],
      },
      seal: 'seal-gold.webp',
    },
    feather: {
      portrait: {
        img: 'portrait.webp', w: 941, h: 1672, tip: [49, 43.6],
        flap: [[0, 0], [100, 0], [100, 7], [90, 15.5], [80, 24.5], [70, 33.5], [60, 41.5], [54, 45], [49, 46.6], [44, 45], [40, 42.5], [30, 34.5], [20, 26.5], [10, 18.5], [0, 12]],
        left: [[0, 12], [10, 18.5], [20, 26.5], [30, 34.5], [40, 42.5], [44, 45], [49, 46.6], [49, 100], [0, 100]],
        right: [[100, 7], [90, 15.5], [80, 24.5], [70, 33.5], [60, 41.5], [54, 45], [49, 46.6], [49, 100], [100, 100]],
        bottom: [[0, 74.6], [49, 45], [100, 75.2], [100, 100], [0, 100]],
      },
      landscape: {
        img: 'landscape.webp', w: 1672, h: 941, tip: [49.5, 54],
        flap: [[0, 0], [100, 0], [100, 3], [90, 15], [80, 27], [70, 40], [60, 52], [54, 57.5], [49.5, 59.5], [45, 57.5], [40, 52], [30, 40.5], [20, 28], [10, 16], [0, 4]],
        left: [[0, 4], [10, 16], [20, 28], [30, 40.5], [40, 52], [45, 57.5], [49.5, 59.5], [49.5, 100], [0, 100]],
        right: [[100, 3], [90, 15], [80, 27], [70, 40], [60, 52], [54, 57.5], [49.5, 59.5], [49.5, 100], [100, 100]],
        bottom: [[0, 98.2], [40, 50], [49.5, 38.6], [60, 51], [100, 98.4], [100, 100], [0, 100]],
      },
      seal: 'seal-pink.webp', liner: 'liner.webp',
      plumes: ['plume-1.webp', 'plume-2.webp', 'plume-3.webp'],
    },
  };
  const rand = (a, b) => a + Math.random() * (b - a);
  const poly = (pts) => `polygon(${pts.map(([x, y]) => `${x}% ${y}%`).join(',')})`;

  /* 圖片版：照畫面比例挑直式／橫式那張，cover 鋪滿，尖端盡量對在畫面正中間。
     算好的位置全部寫成 host 上的 CSS 變數（--sx、--sy、--sw、--sh、--tip、--tip-x、--seal…） */
  function layoutArt(host, art) {
    const vw = window.innerWidth || 390, vh = window.innerHeight || 844;
    const orient = vw / vh >= 0.9 ? 'landscape' : 'portrait';
    const a = art[orient];
    const k = Math.max(vw / a.w, vh / a.h);
    const sw = a.w * k, sh = a.h * k;
    const sx = Math.min(0, Math.max(vw - sw, vw / 2 - (a.tip[0] / 100) * sw));
    const sy = (vh - sh) / 2;
    const seal = Math.max(92, Math.min(170, 0.25 * sw, 0.18 * sh));
    host.dataset.orient = orient;
    const v = {
      '--sx': `${sx}px`, '--sy': `${sy}px`, '--sw': `${sw}px`, '--sh': `${sh}px`,
      '--tip-x': `${a.tip[0]}%`, '--tip': `${a.tip[1]}%`, '--seal': `${seal}px`,
      '--tip-vx': `${sx + (a.tip[0] / 100) * sw}px`, '--tip-vy': `${sy + (a.tip[1] / 100) * sh}px`,
      '--art-img': `url("${art.dir}${a.img}")`,
      '--art-glow': a.glow ? `url("${art.dir}${a.glow}")` : 'none',
      '--clip-flap': poly(a.flap), '--clip-left': poly(a.left), '--clip-right': poly(a.right), '--clip-bottom': poly(a.bottom),
    };
    for (const [n, val] of Object.entries(v)) host.style.setProperty(n, val);
  }

  /* 點下去的那一刻：羽毛從封蠟那裡往四面八方散開，飄一陣子再落下（羽毛是真的照片，黑底去背） */
  function scatterPlumes(host, count, art) {
    const layer = document.createElement('div');
    layer.className = 'env-plumes';
    layer.setAttribute('aria-hidden', 'true');
    const vmin = Math.min(window.innerWidth || 390, window.innerHeight || 844) / 100;
    let out = '';
    for (let i = 0; i < count; i++) {
      /* 往上、往兩側多一點（封口正往上掀），往下少一點 */
      const ang = rand(-Math.PI, Math.PI) * 0.9 - Math.PI / 2 * 0.25;
      const dist = rand(20, 56) * vmin;
      const src = art.dir + art.plumes[i % art.plumes.length];
      const s = rand(28, 60) * (i % art.plumes.length === 2 ? 0.75 : 1);   /* 第三種是一團絨毛，小一點 */
      const r0 = rand(-90, 90);
      out += `<span class="env-plume" style="--s:${s.toFixed(1)}px;` +
        `--x:${(Math.cos(ang) * dist).toFixed(1)}px;--y:${(Math.sin(ang) * dist * 0.85).toFixed(1)}px;` +
        `--fall:${rand(14, 30).toFixed(1)}vh;--r0:${r0.toFixed(0)}deg;--r1:${(r0 + rand(-140, 140)).toFixed(0)}deg;` +
        `--r2:${(r0 + rand(-260, 260)).toFixed(0)}deg;--t:${rand(2.1, 2.8).toFixed(2)}s;--d:${rand(0, 0.22).toFixed(2)}s">` +
        `<img src="${src}" alt="" draggable="false"></span>`;
    }
    layer.innerHTML = out;
    host.appendChild(layer);
  }

  function envelope(host, ctx, st) {
    host.classList.add('env');
    host.dataset.env = st.env;
    const names = LM.namesHtml(ctx);
    const date = LM.esc(ctx.date);
    const frame = st.frame ? '<i class="env-frame"><b></b><b></b><b></b><b></b></i>' : '';
    const art = st.art ? { ...ART[st.art], dir: `${ROOT}${st.art}/` } : null;
    const sealHtml = (cls) => `<div class="env-seal ${cls}"><i class="env-seal-art"></i></div>`;
    host.innerHTML = `
  <svg class="env-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs><pattern id="env-g" width="2.6" height="2.6" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><rect width="2.6" height="2.6" fill="#9c7630"/><rect y=".35" width="2.6" height="1.45" fill="#dcbd6e"/></pattern><filter id="env-emb" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="1" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.3" xChannelSelector="R" yChannelSelector="G" result="d"/><feDropShadow in="d" dx=".5" dy=".9" stdDeviation=".45" flood-color="#2e1f10" flood-opacity=".45"/></filter></defs></svg>
  <div class="env-inside" aria-hidden="true"></div>
  <div class="env-letter" aria-hidden="true">
    <div class="env-letter-card">
      <span class="env-letter-fleur"><svg class="tp-art tp-fleur" viewBox="0 0 40 48" aria-hidden="true" focusable="false"><g filter="url(#env-emb)"><g fill="url(#env-g)"><path d="M20 1C27 9 27 21 20 31C13 21 13 9 20 1Z"/><path d="M18 31C9 31 1 25 3 14C5 7 12 7 13 13C9 13 8 19 12 22C14 24 17 26 18 31Z"/><path d="M22 31C31 31 39 25 37 14C35 7 28 7 27 13C31 13 32 19 28 22C26 24 23 26 22 31Z"/><rect x="10" y="29.5" width="20" height="4.2" rx="1.2"/><path d="M17 33.5C16 39 12 43 8 45C14 45.5 18 42 20 38C22 42 26 45.5 32 45C28 43 24 39 23 33.5Z"/></g></g></svg></span>
      <span class="env-letter-kicker">You are cordially invited</span>
      <span class="env-letter-names">${names}</span>
    </div>
  </div>
  <div class="env-piece env-left" aria-hidden="true"><div class="env-paper">${frame}</div></div>
  <div class="env-piece env-right" aria-hidden="true"><div class="env-paper">${frame}</div></div>
  <div class="env-piece env-bottom" aria-hidden="true">
    <div class="env-paper">${frame}</div>
    ${sealHtml('env-seal-b')}
  </div>
  ${st.light ? '<div class="env-light" aria-hidden="true"><i></i></div>' : ''}
  <div class="env-flap" aria-hidden="true">
    <div class="env-piece env-top">
      <div class="env-paper">
        ${frame}
        <svg class="env-edge" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="2.6,2.2 49.2,47.6 50,48.2 50.8,47.6 97.4,2.2"/><polyline class="env-edge-in" points="4.25,2.2 49.2,46 50,46.6 50.8,46 95.75,2.2"/></svg>
        <div class="env-to">
          <span class="en">To our dearest guest</span>
          <span class="cn">致　親愛的你</span>
          <span class="env-to-date">${date}</span>
          <i class="env-to-orn"></i>
        </div>
      </div>
    </div>
    ${st.ribbon ? '<div class="env-ribbon"><i class="env-ribbon-band"></i></div>' : ''}
    ${sealHtml('env-seal-t')}
    ${sealHtml('env-seal-whole')}
  </div>
`;

    if (art) {
      host.dataset.art = st.art;
      host.style.setProperty('--art-seal', `url("${ROOT}${art.seal}")`);
      if (art.liner) host.style.setProperty('--art-liner', `url("${art.dir}${art.liner}")`);
      if (art.ribbon) host.style.setProperty('--art-ribbon', `url("${art.dir}${art.ribbon}")`);
      layoutArt(host, art);
      /* 轉手機、拉視窗：重新挑直式／橫式、重新對位；開場收掉以後就不必再算 */
      const onResize = () => {
        if (!host.isConnected) { window.removeEventListener('resize', onResize); return; }
        layoutArt(host, art);
      };
      window.addEventListener('resize', onResize);
    }

    const open = () => {
      host.classList.add('is-opening');
      if (st.plumes && art) scatterPlumes(host, st.plumes, art);
      ctx.later(() => { ctx.reveal(); host.classList.add('is-leaving'); }, T_LIFT);
      ctx.later(ctx.done, T_LIFT + T_LEAVE);
    };
    LM.hitButton(host, '拆開信封，打開邀請函', () => {
      ctx.gesture();
      if (ctx.reduce) { ctx.finish(); return; }
      if (!st.pull) { open(); return; }
      /* 緞帶：先抽走，封蠟才裂得開 */
      host.classList.add('is-pulling');
      ctx.later(open, st.pull);
    });
  }

  for (const [key, st] of Object.entries(STYLES)) {
    LM.register(key, (host, ctx) => envelope(host, ctx, st));
  }
})();
