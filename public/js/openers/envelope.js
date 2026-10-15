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
       feather  封口邊上一圈羽毛（trim）；點下去羽毛從封蠟那裡飛散（plumes）
       silk     一條緞帶橫過封蠟底下；點下去先抽走緞帶（pull 毫秒），才開始拆
       regal    每一片紙上的燙金框（frame）
============================================================ */
(function () {
  const LM = window.LobbyMotion;
  const T_LIFT = 1750;   /* 點下去（緞帶抽完）→ 開始退場：封蠟裂開 ＋ 掀封口 ＋ 抽信紙 */
  const T_LEAVE = 1250;  /* 退場本身 */

  /* 開場代號 → 這一款的設定 */
  const STYLES = {
    'envelope':         { env: 'vintage' },                 /* 復古舊紙・古銅封蠟 */
    'envelope-emboss':  { env: 'emboss' },                  /* 壓紋白信封・金封蠟，拆開時壓紋浮出金邊 */
    'envelope-feather': { env: 'feather', trim: true, plumes: 30 },  /* 鵝毛絨白信封・粉紅封蠟 */
    'envelope-silk':    { env: 'silk', ribbon: true, pull: 760 },    /* 緞帶絲綢白信封・紅封蠟 */
    'envelope-regal':   { env: 'regal', frame: true },      /* 華麗白信封・紅封蠟 */
    'envelope-pure':    { env: 'pure' },                    /* 端莊白信封・金封蠟 */
  };

  /* 一根羽毛：彎彎的羽軸 ＋ 兩側的羽片（白色、帶一點點灰的羽枝） */
  const FEATHER = '<symbol id="env-feather" viewBox="0 0 24 64"><defs><linearGradient id="env-fv" x1="0" x2="1"><stop offset="0" stop-color="#f3eeee"/><stop offset=".45" stop-color="#fff"/><stop offset="1" stop-color="#ece5e6"/></linearGradient></defs><path fill="url(#env-fv)" d="M12 2C18 8 21 20 19 34C18 42 15 49 12.6 56C11 49 6.5 43 5 34C3 21 6 8 12 2Z"/><g fill="none" stroke="#d9cfd1" stroke-width=".5" stroke-linecap="round" opacity=".9"><path d="M12.4 14L17 10M12.6 20L19 15M12.8 27L19.6 22M12.8 34L19 30M12.6 41L17.5 38M12 14L7.5 10.5M11.8 21L5.6 16.5M11.6 28L4.8 24M11.6 35L5.4 32M11.8 42L7 40"/></g><path fill="none" stroke="#cfc3c5" stroke-width=".8" stroke-linecap="round" d="M12 4C13 18 13.4 34 12.6 50C12.4 55 12.6 59 13.4 63"/><path fill="#fff" opacity=".9" d="M12.4 50C14 52 15.5 55 14 58C13 56 12.5 53 12.4 50ZM12.4 50C10.5 52 9.5 55 11 58C11.8 56 12.2 53 12.4 50Z"/></symbol>';

  const rand = (a, b) => a + Math.random() * (b - a);

  /* 一團絨毛：從中心往外捲出去的幾十根細絲（每次開場隨機長一次，大家共用這一團）。
     底下先描一層淡淡的灰粉色，白紙上才看得出一根一根的毛 */
  function downSymbol() {
    let under = '', over = '';
    const n = 64;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.12, 0.12);
      const len = rand(6, 19);
      const curl = rand(-0.9, 0.9);
      const cx = Math.cos(a + curl) * len * 0.6, cy = Math.sin(a + curl) * len * 0.6;
      const ex = Math.cos(a + curl * 0.3) * len, ey = Math.sin(a + curl * 0.3) * len;
      const d = `M0 0Q${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
      under += d; over += d;
    }
    /* 中間一團霧霧的白（絨毛的根部擠在一起），外面才是一根一根的細絲 */
    return '<symbol id="env-down" viewBox="-20 -20 40 40">' +
      '<radialGradient id="env-dc"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
      `<path d="${under}" fill="none" stroke="#c7a9b2" stroke-opacity=".28" stroke-width="1.2" stroke-linecap="round"/>` +
      '<circle r="11" fill="url(#env-dc)"/>' +
      `<path d="${over}" fill="none" stroke="#fff" stroke-width=".6" stroke-linecap="round"/></symbol>`;
  }
  const DOWN = (a) => `<svg class="env-down" style="--a:${a}deg" viewBox="-20 -20 40 40" focusable="false"><use href="#env-down"/></svg>`;

  /* 封口邊上的羽毛：沿著兩條斜邊（左上角 → 封蠟、右上角 → 封蠟）排一團一團的軟毛。
     位置用 %，畫面怎麼縮放都黏在邊上；數量照這一刻的畫面大小算，排得夠密 */
  function trimHtml() {
    const w = window.innerWidth || 390, h = window.innerHeight || 844;
    const tipY = 0.52, topY = 0.012;
    const arm = Math.hypot(w / 2, (tipY - topY) * h);
    const n = Math.max(24, Math.round(arm / 9));
    let out = '';
    for (const side of [0, 1]) {
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        /* 不排成一直線：每一團往邊的兩側隨機偏幾 px，大小也不一樣，才不會像一串珍珠 */
        const x = side ? 100 - k * 50 : k * 50;
        const y = (topY + (tipY - topY) * k) * 100;
        const s = rand(32, 52) * (0.85 + 0.15 * Math.min(1, w / 700));
        out += `<span class="env-tuft" style="left:calc(${x.toFixed(2)}% + ${rand(-4, 4).toFixed(1)}px);` +
          `top:calc(${y.toFixed(2)}% + ${rand(-4, 4).toFixed(1)}px);--s:${s.toFixed(1)}px">${DOWN(rand(0, 360).toFixed(0))}</span>`;
      }
    }
    return `<div class="env-trim">${out}</div>`;
  }

  /* 點下去的那一刻：羽毛從封蠟那裡往四面八方散開，飄一陣子再落下 */
  function scatterPlumes(host, count) {
    const layer = document.createElement('div');
    layer.className = 'env-plumes';
    layer.setAttribute('aria-hidden', 'true');
    const vmin = Math.min(window.innerWidth || 390, window.innerHeight || 844) / 100;
    let out = '';
    for (let i = 0; i < count; i++) {
      /* 往上、往兩側多一點（封口正往上掀），往下少一點 */
      const ang = rand(-Math.PI, Math.PI) * 0.9 - Math.PI / 2 * 0.25;
      const dist = rand(22, 58) * vmin;
      const quill = i % 3 !== 2;                       /* 三根裡有一根是一團絨毛 */
      const s = quill ? rand(16, 30) : rand(18, 30);
      const r0 = rand(-90, 90);
      out += `<span class="env-plume" style="--s:${s.toFixed(1)}px;` +
        `--x:${(Math.cos(ang) * dist).toFixed(1)}px;--y:${(Math.sin(ang) * dist * 0.85).toFixed(1)}px;` +
        `--fall:${rand(14, 30).toFixed(1)}vh;--r0:${r0.toFixed(0)}deg;--r1:${(r0 + rand(-140, 140)).toFixed(0)}deg;` +
        `--r2:${(r0 + rand(-260, 260)).toFixed(0)}deg;--t:${rand(2.1, 2.8).toFixed(2)}s;--d:${rand(0, 0.22).toFixed(2)}s">` +
        (quill
          ? '<svg viewBox="0 0 24 64" focusable="false"><use href="#env-feather"/></svg>'
          : DOWN(rand(0, 360).toFixed(0))) +
        '</span>';
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
    host.innerHTML = `
  <svg class="env-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs><pattern id="env-g" width="2.6" height="2.6" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><rect width="2.6" height="2.6" fill="#9c7630"/><rect y=".35" width="2.6" height="1.45" fill="#dcbd6e"/></pattern><filter id="env-emb" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="1" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.3" xChannelSelector="R" yChannelSelector="G" result="d"/><feDropShadow in="d" dx=".5" dy=".9" stdDeviation=".45" flood-color="#2e1f10" flood-opacity=".45"/></filter>${st.plumes ? FEATHER : ''}${st.trim || st.plumes ? downSymbol() : ''}</defs></svg>
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
    <div class="env-hint"><span class="en">Break the seal</span><span class="cn">輕觸封蠟・拆開這封信</span></div>
    <div class="env-seal env-seal-b"><i class="env-seal-art"></i></div>
  </div>
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
    ${st.trim ? trimHtml() : ''}
    ${st.ribbon ? '<div class="env-ribbon"><i class="env-ribbon-band"></i></div>' : ''}
    <div class="env-seal env-seal-t"><i class="env-seal-art"></i></div>
    <div class="env-seal env-seal-whole"><i class="env-seal-art"></i></div>
  </div>
`;

    const open = () => {
      host.classList.add('is-opening');
      if (st.plumes) scatterPlumes(host, st.plumes);
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
