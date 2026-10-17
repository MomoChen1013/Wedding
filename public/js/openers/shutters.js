/* ============================================================
   openers/shutters.js — 開場：推開百葉窗（南法莊園）
   ------------------------------------------------------------
   南法莊園裡的一扇窗（新人提供的圖）：厚厚的石灰岩窗台上一罐薰衣草、一枝橄欖、
   一封綁著藍緞帶的信；灰藍的百葉窗關著，金色的光從葉片縫裡一條一條透進來。

     點一下 → 窗栓「喀」一聲，兩扇百葉窗往外推開，紗簾被風吹起來，滿室金光
            → 窗外就是莊園的露台（＝大廳的第一個畫面那張圖）
            → 低頭看窗台上那封信：兩個人的名字一筆一筆寫上去
            → 一片暖光，進到大廳

   層次（.sh-window，一張照片的座標，cover 滿版、對準窗戶中間）：
     .sh-view    窗外的露台，只在窗洞裡
     .sh-leaf    兩扇百葉窗（從照片切出來的兩層，繞外側的鉸鍊往外推開）
     .sh-room    房間：照片本身，窗洞挖空；擋在窗前的薰衣草、陶罐、橄欖枝留在這一層
   接著是 .sh-letter：信的特寫（新人提供的圖），名字用 Pinyon Script 寫在信封上。
   素材與出處見 README〈南法莊園的照片素材〉。
============================================================ */
(function () {
  const LM = window.LobbyMotion;
  /* 推開 → 看信 → 進大廳 */
  const T = { look: 2300, go: 6200, reveal: 500, done: 1200 };

  /* 一粒一粒浮在光裡的灰塵（位置固定，每一次都一樣） */
  function dust() {
    let s = '', seed = 7;
    const r = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    for (let i = 0; i < 18; i++) {
      s += `<i style="left:${(28 + r() * 46).toFixed(1)}%;top:${(12 + r() * 62).toFixed(1)}%;` +
        `--d:${(7 + r() * 7).toFixed(1)}s;--dl:${(-r() * 8).toFixed(1)}s;--s:${(2 + r() * 3).toFixed(1)}px"></i>`;
    }
    return s;
  }

  function shutters(host, ctx) {
    host.classList.add('sh-host');
    host.innerHTML = `
      <div class="sh-window" aria-hidden="true">
        <div class="sh-photo">
          <div class="sh-view"></div>
          <div class="sh-opening"><div class="sh-leaf sh-l"></div><div class="sh-leaf sh-r"></div></div>
          <div class="sh-room"></div>
          <div class="sh-shimmer"></div>
          <div class="sh-dust">${dust()}</div>
          <div class="sh-curtain"></div>
        </div>
      </div>
      <div class="sh-flood" aria-hidden="true"></div>
      <div class="sh-letter" aria-hidden="true">
        <div class="sh-letter-photo">
          <div class="sh-ink">
            <div class="sh-names">${LM.namesHtml(ctx)}</div>
            <div class="sh-date">${LM.esc(ctx.date)}</div>
          </div>
        </div>
      </div>
      <div class="sh-glow" aria-hidden="true"></div>
      <div class="sh-hint"><span class="en">Ouvrez les volets</span><span class="cn">輕觸畫面・推開百葉窗</span></div>`;

    LM.hitButton(host, '推開百葉窗，進入邀請函', () => {
      if (host.classList.contains('is-open')) { ctx.finish(); return; }
      ctx.gesture();
      if (ctx.reduce) { ctx.finish(); return; }
      host.classList.add('is-open');
      ctx.later(() => host.classList.add('is-letter'), T.look);
      ctx.later(() => host.classList.add('is-going'), T.go);
      ctx.later(ctx.reveal, T.go + T.reveal);
      ctx.later(ctx.done, T.go + T.done);
    });
  }

  LM.register('shutters', shutters);
})();
