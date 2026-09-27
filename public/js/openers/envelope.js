/* ============================================================
   openers/envelope.js — 開場：一封蓋了封蠟的信
   ------------------------------------------------------------
   一封從背面看的歐式信封：內襯 → 信紙 → 左、右、下三片 → 封口 ＋ 封蠟。
   封蠟上是一枚鑽戒，切成上下兩半分別黏在封口與下片。點一下：

     1. 封蠟從中間裂開，上半顆跟著封口走
     2. 封口從尖端開始往上掀（以上緣為軸，往賓客這一側翻起來）
     3. 信紙從袋口往上抽出一小段
     4. 左右下三片往畫面外退開，信紙放大溶進邀請函本身

   時間軸寫在這裡，每一段的樣子寫在 css/openers/envelope.css
   （.is-opening／.is-leaving）。
============================================================ */
(function () {
  const LM = window.LobbyMotion;
  const T_LIFT = 1750;   /* 點下去 → 開始退場：封蠟裂開 ＋ 掀封口 ＋ 抽信紙 */
  const T_LEAVE = 1250;  /* 退場本身 */

  function envelope(host, ctx) {
    host.classList.add('env');
    const names = LM.namesHtml(ctx);
    const date = LM.esc(ctx.date);
    host.innerHTML = `
  <svg class="env-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs><radialGradient id="env-wax" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#b2323c"/><stop offset=".55" stop-color="#8a1c26"/><stop offset="1" stop-color="#560b13"/></radialGradient><radialGradient id="env-wax-in" cx="60%" cy="65%" r="70%"><stop offset="0" stop-color="#7c1621"/><stop offset="1" stop-color="#9c2631"/></radialGradient><pattern id="env-g" width="2.6" height="2.6" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><rect width="2.6" height="2.6" fill="#9c7630"/><rect y=".35" width="2.6" height="1.45" fill="#dcbd6e"/></pattern><filter id="env-emb" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="1" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.3" xChannelSelector="R" yChannelSelector="G" result="d"/><feDropShadow in="d" dx=".5" dy=".9" stdDeviation=".45" flood-color="#2e1f10" flood-opacity=".45"/></filter></defs></svg>
  <div class="env-inside" aria-hidden="true"></div>
  <div class="env-letter" aria-hidden="true">
    <div class="env-letter-card">
      <span class="env-letter-fleur"><svg class="tp-art tp-fleur" viewBox="0 0 40 48" aria-hidden="true" focusable="false"><g filter="url(#env-emb)"><g fill="url(#env-g)"><path d="M20 1C27 9 27 21 20 31C13 21 13 9 20 1Z"/><path d="M18 31C9 31 1 25 3 14C5 7 12 7 13 13C9 13 8 19 12 22C14 24 17 26 18 31Z"/><path d="M22 31C31 31 39 25 37 14C35 7 28 7 27 13C31 13 32 19 28 22C26 24 23 26 22 31Z"/><rect x="10" y="29.5" width="20" height="4.2" rx="1.2"/><path d="M17 33.5C16 39 12 43 8 45C14 45.5 18 42 20 38C22 42 26 45.5 32 45C28 43 24 39 23 33.5Z"/></g></g></svg></span>
      <span class="env-letter-kicker">You are cordially invited</span>
      <span class="env-letter-names">${names}</span>
    </div>
  </div>
  <div class="env-piece env-left" aria-hidden="true"><div class="env-paper"></div></div>
  <div class="env-piece env-right" aria-hidden="true"><div class="env-paper"></div></div>
  <div class="env-piece env-bottom" aria-hidden="true">
    <div class="env-paper">
      <div class="env-hint"><span class="en">Break the seal</span><span class="cn">輕觸封蠟・拆開這封信</span></div>
    </div>
    <div class="env-seal env-seal-b"><svg class="env-seal-art" viewBox="0 0 120 120" aria-hidden="true" focusable="false"><clipPath id="tp-seal-bottom"><path d="M0 120H120V57.9L120 57.9L110 62L100 56.4L90 63.5L80 56.4L70 62L60 57.9L50 62L40 56.4L30 63.5L20 56.4L10 62L0 57.9Z"/></clipPath><g clip-path="url(#tp-seal-bottom)"><path d="M115.8 60L116.27 64.92L114.47 69.6L111.32 73.75L108.72 77.73L107.56 82.18L106.78 87.01L104.63 91.25L100.51 93.99L95.61 95.61L91.5 97.54L88.56 100.79L85.95 104.95L82.73 108.74L78.71 111.4L74.29 113.31L69.69 114.93L64.88 115.82L60 115.07L55.39 112.68L51.17 110.07L46.93 108.78L42.25 108.78L37.43 108.4L33.37 106.12L30.46 102.19L27.88 98.28L24.35 95.65L19.56 93.93L14.66 91.75L11.09 88.24L9.2 83.69L8.22 78.85L7.5 74.07L7.32 69.29L8.23 64.53L9.8 60L10.68 55.68L10.08 51.2L8.94 46.32L9.11 41.48L11.49 37.38L14.99 34.01L17.8 30.45L19.31 25.86L20.66 20.66L23.36 16.33L27.76 13.96L32.95 13.16L37.93 12.67L42.46 11.8L46.85 10.92L51.28 10.54L55.65 10.23L60 9.07L64.63 7.09L69.58 5.68L74.36 6.39L78.5 9.17L82.23 12.33L86.37 14.32L91.26 15.36L96.02 17.08L99.3 20.7L100.76 25.79L101.49 30.95L102.89 35.24L105.27 38.89L107.83 42.59L109.89 46.63L111.71 50.88L113.83 55.29Z" fill="url(#env-wax)"/><circle cx="60" cy="60" r="41" fill="url(#env-wax-in)"/><circle cx="60" cy="60" r="41" fill="none" stroke="#4a0910" stroke-width="2.4" transform="translate(.8 1)"/><circle cx="60" cy="60" r="41" fill="none" stroke="#c7505a" stroke-width="1.2" transform="translate(-.6 -.7)" opacity=".7"/><path d="M60 88A17 17 0 1 1 60.01 88Z" fill="none" stroke="#4a0910" stroke-width="4.2" transform="translate(1.1 1.3)" stroke-linecap="round" stroke-linejoin="round"/><path d="M60 88A17 17 0 1 1 60.01 88Z" fill="none" stroke="#c7505a" stroke-width="4.2" transform="translate(-.8 -.9)" opacity=".75" stroke-linecap="round" stroke-linejoin="round"/><path d="M60 88A17 17 0 1 1 60.01 88Z" fill="none" stroke="#8a1c26" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M48 49L72 49L66 41L54 41Z M48 49L60 61L72 49 M54 41L57 49L60 61L63 49L66 41" fill="none" stroke="#4a0910" stroke-width="2.2" transform="translate(1.1 1.3)" stroke-linecap="round" stroke-linejoin="round"/><path d="M48 49L72 49L66 41L54 41Z M48 49L60 61L72 49 M54 41L57 49L60 61L63 49L66 41" fill="none" stroke="#c7505a" stroke-width="2.2" transform="translate(-.8 -.9)" opacity=".75" stroke-linecap="round" stroke-linejoin="round"/><path d="M48 49L72 49L66 41L54 41Z M48 49L60 61L72 49 M54 41L57 49L60 61L63 49L66 41" fill="none" stroke="#8a1c26" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M53 34L56 38M67 34L64 38M60 30V35" stroke="#c7505a" stroke-width="1.4" stroke-linecap="round" opacity=".8"/><ellipse cx="42" cy="30" rx="16" ry="8" fill="#fff" opacity=".13" transform="rotate(-28 42 30)"/></g></svg></div>
  </div>
  <div class="env-flap" aria-hidden="true">
    <div class="env-piece env-top">
      <div class="env-paper">
        <svg class="env-edge" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="2.6,2.2 49.2,47.6 50,48.2 50.8,47.6 97.4,2.2"/></svg>
        <div class="env-to">
          <span class="en">To our dearest guest</span>
          <span class="cn">致　親愛的你</span>
          <span class="env-to-date">${date}</span>
        </div>
      </div>
    </div>
    <div class="env-seal env-seal-t"><svg class="env-seal-art" viewBox="0 0 120 120" aria-hidden="true" focusable="false"><clipPath id="tp-seal-top"><path d="M0 0H120V59.1L120 59.1L110 63.2L100 57.6L90 64.7L80 57.6L70 63.2L60 59.1L50 63.2L40 57.6L30 64.7L20 57.6L10 63.2L0 59.1Z"/></clipPath><g clip-path="url(#tp-seal-top)"><path d="M115.8 60L116.27 64.92L114.47 69.6L111.32 73.75L108.72 77.73L107.56 82.18L106.78 87.01L104.63 91.25L100.51 93.99L95.61 95.61L91.5 97.54L88.56 100.79L85.95 104.95L82.73 108.74L78.71 111.4L74.29 113.31L69.69 114.93L64.88 115.82L60 115.07L55.39 112.68L51.17 110.07L46.93 108.78L42.25 108.78L37.43 108.4L33.37 106.12L30.46 102.19L27.88 98.28L24.35 95.65L19.56 93.93L14.66 91.75L11.09 88.24L9.2 83.69L8.22 78.85L7.5 74.07L7.32 69.29L8.23 64.53L9.8 60L10.68 55.68L10.08 51.2L8.94 46.32L9.11 41.48L11.49 37.38L14.99 34.01L17.8 30.45L19.31 25.86L20.66 20.66L23.36 16.33L27.76 13.96L32.95 13.16L37.93 12.67L42.46 11.8L46.85 10.92L51.28 10.54L55.65 10.23L60 9.07L64.63 7.09L69.58 5.68L74.36 6.39L78.5 9.17L82.23 12.33L86.37 14.32L91.26 15.36L96.02 17.08L99.3 20.7L100.76 25.79L101.49 30.95L102.89 35.24L105.27 38.89L107.83 42.59L109.89 46.63L111.71 50.88L113.83 55.29Z" fill="url(#env-wax)"/><circle cx="60" cy="60" r="41" fill="url(#env-wax-in)"/><circle cx="60" cy="60" r="41" fill="none" stroke="#4a0910" stroke-width="2.4" transform="translate(.8 1)"/><circle cx="60" cy="60" r="41" fill="none" stroke="#c7505a" stroke-width="1.2" transform="translate(-.6 -.7)" opacity=".7"/><path d="M60 88A17 17 0 1 1 60.01 88Z" fill="none" stroke="#4a0910" stroke-width="4.2" transform="translate(1.1 1.3)" stroke-linecap="round" stroke-linejoin="round"/><path d="M60 88A17 17 0 1 1 60.01 88Z" fill="none" stroke="#c7505a" stroke-width="4.2" transform="translate(-.8 -.9)" opacity=".75" stroke-linecap="round" stroke-linejoin="round"/><path d="M60 88A17 17 0 1 1 60.01 88Z" fill="none" stroke="#8a1c26" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M48 49L72 49L66 41L54 41Z M48 49L60 61L72 49 M54 41L57 49L60 61L63 49L66 41" fill="none" stroke="#4a0910" stroke-width="2.2" transform="translate(1.1 1.3)" stroke-linecap="round" stroke-linejoin="round"/><path d="M48 49L72 49L66 41L54 41Z M48 49L60 61L72 49 M54 41L57 49L60 61L63 49L66 41" fill="none" stroke="#c7505a" stroke-width="2.2" transform="translate(-.8 -.9)" opacity=".75" stroke-linecap="round" stroke-linejoin="round"/><path d="M48 49L72 49L66 41L54 41Z M48 49L60 61L72 49 M54 41L57 49L60 61L63 49L66 41" fill="none" stroke="#8a1c26" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M53 34L56 38M67 34L64 38M60 30V35" stroke="#c7505a" stroke-width="1.4" stroke-linecap="round" opacity=".8"/><ellipse cx="42" cy="30" rx="16" ry="8" fill="#fff" opacity=".13" transform="rotate(-28 42 30)"/></g></svg></div>
  </div>
`;

    LM.hitButton(host, '拆開信封，打開邀請函', () => {
      ctx.gesture();
      if (ctx.reduce) { ctx.finish(); return; }
      host.classList.add('is-opening');
      ctx.later(() => { ctx.reveal(); host.classList.add('is-leaving'); }, T_LIFT);
      ctx.later(ctx.done, T_LIFT + T_LEAVE);
    });
  }

  LM.register('envelope', envelope);
})();
