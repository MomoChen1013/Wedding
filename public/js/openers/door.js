/* ============================================================
   openers/door.js — 開場：門／拱門
   ------------------------------------------------------------
   畫面中央是一扇關著的門，門縫透出一線光：

     點一下 → 兩扇門往內推開 → 光從門後湧出來
     → 鏡頭穿過門口往前走 → 溶進網站

   每個版型有自己的門（[data-variant]，見 css/openers/door.css）：
     french-manor     石牆、圓拱、木門與鐵環（預設）
     secret-garden    綠籬、爬滿藤蔓的拱、鍛鐵花園門（門是鏤空的，看得到後面的花園）
     midnight-chapel  石砌尖拱、深色橡木門與鐵條（tapestry 也用這一扇）
   門的結構每一版都一樣，只有材質不同。
============================================================ */
(function () {
  const LM = window.LobbyMotion;
  const T = { open: 1500, walk: 1300 };

  const KIND = {
    'secret-garden': 'garden',
    'midnight-chapel': 'gothic',
    'tapestry': 'gothic',
  };

  function door(host, ctx) {
    const kind = KIND[ctx.variant] || 'manor';
    host.classList.add('dr-host', `dr-${kind}`);
    const vines = kind === 'garden' ? `<div class="dr-vines">${vineSvg()}</div>` : '';
    host.innerHTML = `
      <div class="dr-world" aria-hidden="true">
        <div class="dr-wall"></div>
        <div class="dr-portal">
          <div class="dr-frame"></div>
          <div class="dr-opening">
            <div class="dr-beyond"><div class="dr-sun"></div></div>
            <div class="dr-gap"></div>
            <div class="dr-leaf dr-l"><i class="dr-ring"></i></div>
            <div class="dr-leaf dr-r"><i class="dr-ring"></i></div>
          </div>
          ${vines}
        </div>
        <div class="dr-step"></div>
      </div>
      <div class="dr-flood" aria-hidden="true"></div>
      <div class="dr-text" aria-hidden="true">
        <div class="dr-kicker">You are invited in</div>
        <div class="dr-names">${LM.namesHtml(ctx)}</div>
        <div class="dr-date">${LM.esc(ctx.date)}</div>
      </div>
      <div class="dr-hint"><span class="en">Push the door</span><span class="cn">輕觸畫面・推開這扇門</span></div>`;

    LM.hitButton(host, '推開門，進入邀請函', () => {
      if (host.classList.contains('is-open')) { ctx.finish(); return; }
      ctx.gesture();
      if (ctx.reduce) { ctx.finish(); return; }
      host.classList.add('is-open');
      ctx.later(() => host.classList.add('is-walking'), T.open);
      ctx.later(ctx.reveal, T.open + T.walk * .45);
      ctx.later(ctx.done, T.open + T.walk + 500);
    });
  }

  /* 秘密花園的拱：沿著拱爬的一條藤，葉子與小花用程式排 */
  function vineSvg() {
    const f = (n) => +n.toFixed(1);
    let s = '<svg viewBox="0 0 200 310" preserveAspectRatio="none">';
    const path = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, a = Math.PI * (1 - t);
      const x = 100 + Math.cos(a) * 96, y = 100 - Math.sin(a) * 96 + (t < .5 ? 0 : 0);
      path.push([x, y]);
    }
    const full = [[4, 300], [4, 100], ...path, [196, 100], [196, 300]];
    s += `<path d="M${full.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}" fill="none" stroke="#4e6b3c" stroke-width="2.4"/>`;
    full.forEach(([x, y], i) => {
      if (i % 2) return;
      const side = i % 4 ? 1 : -1;
      const a = (i * 37) % 360;
      s += `<ellipse cx="${f(x + side * 5)}" cy="${f(y)}" rx="7" ry="3.4" fill="${i % 3 ? '#6f8f55' : '#8fae6e'}" transform="rotate(${a} ${f(x + side * 5)} ${f(y)})"/>`;
      if (i % 6 === 0) {
        const c = i % 12 ? '#e9c7d6' : '#f6e9b8';
        for (let k = 0; k < 5; k++) {
          const b = k * 72 * Math.PI / 180;
          s += `<circle cx="${f(x - side * 4 + Math.cos(b) * 3)}" cy="${f(y + 4 + Math.sin(b) * 3)}" r="2.4" fill="${c}"/>`;
        }
        s += `<circle cx="${f(x - side * 4)}" cy="${f(y + 4)}" r="1.4" fill="#d7a24a"/>`;
      }
    });
    return s + '</svg>';
  }

  LM.register('door', door);
})();
