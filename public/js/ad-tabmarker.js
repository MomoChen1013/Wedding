/* ============================================================
   ad-tabmarker.js — 分頁的定位線（Ivory §07）
   ------------------------------------------------------------
   選中的分頁只有兩個訊號：字轉墨色 ＋ 一條 1px 定位線。
   **線是滑的不是跳的** —— 那一下位移就是「我從哪一頁到哪一頁」，
   是這個元件唯一要講的事。位移做不到的話，換成靜態的框線也一樣，
   那就等於沒有這個元件。

   為什麼是獨立一支、而且用 MutationObserver
   ・.is-on 在四個地方被掛上／拿掉（側欄點擊、hash 變更、鎖定重繪、
     收禮台自己的切換），要在每一處補一行「順便移動定位線」，
     就是四個會各自漂掉的地方。改成「看到 .is-on 換人就重量一次」，
     新增第五個切換路徑時什麼都不用做。
   ・後台與收禮台吃同一組 .ad-* 元件，但 butler 不載入 admin.js。
     所以這一支跟 cropper.js／butler-key.js 一樣，兩頁各自 <script defer>。

   量的是 offsetLeft／offsetTop 而不是 getBoundingClientRect()：
   兩條線都是 absolute 掛在會捲動的容器裡（子分頁列左右捲、側欄上下捲），
   要的是「在內容裡的位置」，不是「在螢幕上的位置」。
============================================================ */
(function () {
  'use strict';

  /* 容器 → 它那一條線。WeakMap 而不是 dataset：
     容器被整段換掉時（例如面板重繪）舊的那條會跟著被回收。 */
  const marks = new WeakMap();

  function markFor(host, cls) {
    let el = marks.get(host);
    if (el && el.isConnected && el.parentElement === host) return el;
    el = host.querySelector(':scope > .' + cls);
    if (!el) {
      el = document.createElement('span');
      el.className = cls;
      el.setAttribute('aria-hidden', 'true');
      host.appendChild(el);
    }
    marks.set(host, el);
    return el;
  }

  /* 橫的那一條（子分頁）：吃 x 與寬 */
  function layoutX(host) {
    const on = host.querySelector('.ad-subtab.is-on');
    const el = markFor(host, 'ad-tabmark');
    if (!on || on.hidden || !on.offsetParent) { el.classList.remove('is-ready'); return; }
    el.style.width = on.offsetWidth + 'px';
    el.style.transform = 'translateX(' + on.offsetLeft + 'px)';
    el.classList.add('is-ready');
  }

  /* 直的那一條（側欄）：吃 y 與高 */
  function layoutY(host) {
    const on = host.querySelector('.ad-tab.is-on');
    const el = markFor(host, 'ad-navmark');
    /* 分頁收在摺起來的群組裡時 offsetParent 是 null —— 那時候線沒有位置可站，
       先淡掉，等群組展開再量一次（展開也會觸發 observer）。 */
    if (!on || on.hidden || !on.offsetParent) { el.classList.remove('is-ready'); return; }
    el.style.height = on.offsetHeight + 'px';
    /* x 也要跟著量：側欄有左右內距，線要貼在**那一顆分頁**的左邊，
       不是貼在側欄的最外緣 —— 貼外緣會看起來和它在標示的那一列沒有關係。 */
    el.style.transform = 'translate(' + on.offsetLeft + 'px,' + on.offsetTop + 'px)';
    el.classList.add('is-ready');
  }

  function layoutAll() {
    document.querySelectorAll('.ad-subtabs').forEach(layoutX);
    document.querySelectorAll('.ad-side').forEach(layoutY);
  }

  /* 連續好幾次變動（切分頁時 .is-on 先拿掉再掛上）只量最後一次 */
  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; layoutAll(); });
  }

  /* class 變了（.is-on 換人、群組收合）、或分頁被加上／拿掉時重量。
     只看 class 與 hidden，不看整棵子樹的文字 —— 子分頁的字會隨著筆數變
     （「回覆（12）」），那確實要重量，但它本來就會改 class 以外的屬性，
     所以 characterData 也一起收。 */
  const mo = new MutationObserver(schedule);

  function observe() {
    document.querySelectorAll('.ad-subtabs, .ad-side').forEach((host) => {
      mo.observe(host, {
        subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: ['class', 'hidden', 'style'],
      });
    });
    schedule();
  }

  /* 字還沒到之前量到的寬度是備用字算出來的，字一到就會變 —— 重量一次 */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);

  /* 視窗寬度變了、子分頁列被左右捲了，位置都要重算
     （捲動時線跟著內容走，但 offsetLeft 不變，所以捲動本身不必重量；
       這裡收的是「捲動改變了 flex 的換行」那種情形） */
  addEventListener('resize', schedule);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observe);
  } else {
    observe();
  }

  /* 面板是登入後才由 JS 畫出來的，那時候容器可能還不存在 —— 再掛一次。
     observe() 自己是冪等的（MutationObserver 對同一個節點重複 observe
     會沿用同一份設定）。 */
  addEventListener('load', observe);
  window.adLayoutTabMarkers = layoutAll;
})();
