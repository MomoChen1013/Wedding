/* ============================================================
   openers/book.js — 開場：翻頁・古書
   ------------------------------------------------------------
   把網站當成一本書：封面 → 翻開 → 扉頁「___ & ___」→ 翻過扉頁 → 正文。

     1. 桌上一本皮面精裝書，封面燙金寫著兩個人的名字
     2. 點一下，封面以書脊為軸往左翻開，書同時往右挪半本 ——
        攤開之後整個跨頁才會在畫面正中間
     3. 右頁是扉頁（名字與日期），停一拍
     4. 扉頁翻過去，底下是「正文」的第一頁
     5. 鏡頭推進那一頁，溶進網站 —— 網站就是這本書的正文

   版型可以換書皮（[data-variant]，見 css/openers/book.css），
   翻書的動作每一版都一樣。
============================================================ */
(function () {
  const LM = window.LobbyMotion;
  const T = {
    cover: 1450,   /* 封面翻開（含整本書往右挪）*/
    hold: 1300,    /* 停在扉頁 */
    leaf: 1150,    /* 扉頁翻過去 */
    zoom: 1100,    /* 推進正文、溶進網站 */
  };

  function book(host, ctx) {
    host.classList.add('bk-host');
    const names = LM.namesHtml(ctx);
    const date = LM.esc(ctx.date);
    host.innerHTML = `
      <div class="bk-table" aria-hidden="true"></div>
      <div class="bk-stage" aria-hidden="true">
        <div class="bk">
          <div class="bk-block">
            <div class="bk-page bk-text">
              <div class="bk-chapter">Chapter the First</div>
              <div class="bk-rule"></div>
              <p class="bk-lines"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></p>
            </div>
          </div>
          <div class="bk-leaf">
            <div class="bk-face bk-front bk-page bk-title">
              <div class="bk-kicker">The Wedding of</div>
              <div class="bk-names">${names}</div>
              <div class="bk-orn"></div>
              <div class="bk-date">${date}</div>
            </div>
            <div class="bk-face bk-back bk-page bk-verso">
              <p>Two souls,<br>and one story<br>begins here.</p>
              <span>兩個人，一個故事</span>
            </div>
          </div>
          <div class="bk-cover">
            <div class="bk-face bk-front bk-skin">
              <div class="bk-frame">
                <div class="bk-cover-orn"></div>
                <div class="bk-cover-names">${names}</div>
                <div class="bk-cover-date">${date}</div>
              </div>
            </div>
            <div class="bk-face bk-back bk-endpaper"></div>
          </div>
        </div>
      </div>
      <div class="bk-hint"><span class="en">Open the book</span><span class="cn">輕觸封面・翻開這本書</span></div>`;

    const hit = LM.hitButton(host, '翻開這本書，進入邀請函', () => {
      /* 已經在翻了：再點一下就直接進站 */
      if (host.classList.contains('is-open')) { ctx.finish(); return; }
      ctx.gesture();
      if (ctx.reduce) { ctx.finish(); return; }
      host.classList.add('is-open');
      hit.setAttribute('aria-label', '跳過，直接進入邀請函');
      ctx.later(() => host.classList.add('is-turned'), T.cover + T.hold);
      ctx.later(() => { host.classList.add('is-leaving'); ctx.reveal(); }, T.cover + T.hold + T.leaf);
      ctx.later(ctx.done, T.cover + T.hold + T.leaf + T.zoom);
    });
  }

  LM.register('book', book);
})();
