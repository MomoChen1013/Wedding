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
  <svg class="env-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs><pattern id="env-g" width="2.6" height="2.6" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><rect width="2.6" height="2.6" fill="#9c7630"/><rect y=".35" width="2.6" height="1.45" fill="#dcbd6e"/></pattern><filter id="env-emb" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="1" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.3" xChannelSelector="R" yChannelSelector="G" result="d"/><feDropShadow in="d" dx=".5" dy=".9" stdDeviation=".45" flood-color="#2e1f10" flood-opacity=".45"/></filter></defs></svg>
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
    <div class="env-seal env-seal-b"><i class="env-seal-art"></i></div>
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
    <div class="env-seal env-seal-t"><i class="env-seal-art"></i></div>
    <div class="env-seal env-seal-whole"><i class="env-seal-art"></i></div>
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
