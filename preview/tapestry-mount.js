/* ============================================================
   tapestry-mount.js — Tapestry 示範頁專用的填空
   ------------------------------------------------------------
   preview/tapestry.html 的骨架是由 public/lobby-tapestry.html 產出的
   （同一份 markup），正式版由 js/index.js 填資料；這裡用 demo-data.js
   做同一件事的最小版本，讓示範頁不起 Firebase 也能直接用瀏覽器打開。

   開場與捲動編排用的是**正式版同一支** public/js/lobby-motion.js ——
   示範頁看到的信封，就是賓客會看到的信封。

   ?open=1  直接跳過信封（看內容用）
============================================================ */
(function () {
  const D = window.DEMO || {};
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const title = (s) => String(s || '').charAt(0) + String(s || '').slice(1).toLowerCase();

  const W = {
    couple: D.couple, groomEn: title(D.nameA), brideEn: title(D.nameB),
    date: D.date, weekday: D.weekday,
  };
  document.querySelectorAll('[data-tpl]').forEach((el) => {
    const v = W[el.dataset.tpl];
    if (v != null) el.textContent = v;
  });

  /* hashtag */
  $('lobbyTags').innerHTML = (D.hashtags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');

  /* 資訊卡 */
  $('infoDate').textContent = `${D.date}・${D.weekday}`;
  $('infoTime').textContent = D.time;
  $('infoVenue').textContent = D.venue;
  $('infoAddr').textContent = D.address;
  $('infoTimeJump').hidden = false;
  $('infoVenueJump').hidden = false;
  $('mapBtn').href = D.mapUrl;

  /* 流程（markup 對齊 js/index.js） */
  $('schedule').innerHTML = (D.schedule || []).map((s) => `
    <div class="tl-item">
      <div class="tl-time">${esc(s.time)}</div>
      <div class="tl-dot"></div>
      <div class="tl-content">
        <div class="tl-t">${esc(s.title)}</div>
        ${s.desc ? `<div class="tl-d">${esc(s.desc)}</div>` : ''}
      </div>
    </div>`).join('');

  /* 小提醒 ＋ 交通 */
  const notes = D.notes || [];
  if (notes[0]) { $('dressCode').textContent = notes[0].text; $('dressCodeItem').hidden = false; }
  if (notes[1]) { $('giftNote').textContent = notes[1].text; $('giftNoteItem').hidden = false; }
  $('noteBlock').hidden = !notes.length;
  const tr = D.transport || [];
  if (tr[0]) { $('transportPublic').textContent = tr[0].text; $('transportPublicItem').hidden = false; }
  if (tr[1]) { $('transportParking').textContent = tr[1].text; $('transportParkingItem').hidden = false; }
  $('transportBlock').hidden = !tr.length;

  /* 故事（照片借用 ginny-one 的封面） */
  if (D.story) { $('storyText').textContent = D.story; $('storyBlock').hidden = false; }
  document.querySelectorAll('[data-photo]').forEach((el) => {
    el.style.backgroundImage = 'url("../public/assets/ginny-one-20260919/cover.jpg")';
    el.classList.add('has-photo');
  });

  /* 倒數（markup 對齊 js/common.js 的 startCountdown）。
     示範資料的日期可能已經過了 —— 那就改成從今天往後數 100 天，才有數字可看 */
  let target = new Date(D.dateISO).getTime();
  if (!(target > Date.now())) target = Date.now() + 100 * 86400e3 + 5 * 3600e3;
  const pad = (n) => String(n).padStart(2, '0');
  (function tick() {
    let s = Math.max(0, Math.floor((target - Date.now()) / 1000));
    const d = Math.floor(s / 86400); s %= 86400;
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60); s %= 60;
    $('cdGrid').innerHTML =
      `<div class="cd-unit"><span class="cd-num">${d}</span><span class="cd-lab">天</span></div>` +
      `<div class="cd-unit"><span class="cd-num">${pad(h)}</span><span class="cd-lab">時</span></div>` +
      `<div class="cd-unit"><span class="cd-num">${pad(m)}</span><span class="cd-lab">分</span></div>` +
      `<div class="cd-unit"><span class="cd-num">${pad(s)}</span><span class="cd-lab">秒</span></div>`;
    setTimeout(tick, 1000);
  })();
  $('cdTarget').textContent = `${D.date} ${D.weekday} ${D.time}`;

  /* 「進站」＝ js/index.js 的 enterSite() */
  const app = $('app');
  function enterSite() {
    app.style.display = 'block';
    app.classList.add('app-show');
  }

  const LM = window.LobbyMotion;
  LM.init(app);
  const env = $('envelope');
  if (/[?&]open=1/.test(location.search)) {
    env.remove();
    enterSite();
  } else {
    LM.envelope(env, { onReveal: enterSite });
  }
  /* 資料填完了：收掉骨架閃爍（common.css 的 [data-sk] 看的是這個旗標） */
  document.documentElement.dataset.siteReady = '1';
  document.documentElement.dataset.demoReady = '1';
})();
