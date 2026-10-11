/* ============================================================
   samples/demo.js — 大廳示範頁的填空 ＋ 切換面板
   ------------------------------------------------------------
   兩種示範頁共用這一支，都是 scripts/build-previews.js 從 public/lobby-*.html
   產出來的（骨架一模一樣）：

     preview/*.html      內部看的（不部署），資料是 preview/demo-data.js
     public/samples/*.html  給客人挑版型的（/samples），資料是 samples/sample-data.js，
                         新人是虛構的、照片是 Unsplash 的免費婚紗照

   正式版由 js/index.js 填資料，這裡做同一件事的最小版本 —— 不起 Firebase、
   直接用瀏覽器打開就能看。照片的路徑寫在資料檔的 photos 裡。

   開場與捲動編排用的是**正式版同一支** public/js/lobby-motion.js
   與 public/js/openers/*.js：示範頁看到的，就是賓客會看到的。

   右下角的面板可以換版型（幾個版型共用一副骨架時才有）、換開場、重播開場。
   DEMO_CFG.sample 有值的是給客人看的那一版：面板多一顆「所有版型」、
   文字改成客人看得懂的說法；點到其他頁面的連結會說明示範只有大廳。
   網址參數：?t=night-sky 版型　?o=book 開場　?open=1 跳過開場
============================================================ */
(function () {
  const D = window.DEMO || {};
  const CFG = window.DEMO_CFG || { templates: {}, openings: {} };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const title = (s) => String(s || '').charAt(0) + String(s || '').slice(1).toLowerCase();
  const q = new URLSearchParams(location.search);

  /* ---------- 版型與開場 ---------- */
  const keys = Object.keys(CFG.templates);
  let template = keys.includes(q.get('t')) ? q.get('t') : keys[0];
  let opening = CFG.openings[q.get('o')] ? q.get('o') : null;   /* null＝跟著版型的預設 */
  const openingFor = () => opening || CFG.templates[template].opening;

  /* ---------- 填資料（markup 對齊 js/index.js） ---------- */
  const W = {
    couple: D.couple, groomEn: title(D.nameA), brideEn: title(D.nameB),
    groom: title(D.nameA), bride: title(D.nameB),     /* forest 的名字欄位 */
    date: D.date, weekday: D.weekday,
  };
  document.querySelectorAll('[data-tpl]').forEach((el) => {
    const v = W[el.dataset.tpl];
    if (v != null) el.textContent = v;
  });
  $('lobbyTags').innerHTML = (D.hashtags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  $('infoDate').textContent = `${D.date}・${D.weekday}`;
  $('infoTime').textContent = D.time;
  $('infoVenue').textContent = D.venue;
  $('infoAddr').textContent = D.address;
  $('infoTimeJump').hidden = false;
  $('infoVenueJump').hidden = false;
  $('mapBtn').href = D.mapUrl;
  $('schedule').innerHTML = (D.schedule || []).map((s) => `
    <div class="tl-item">
      <div class="tl-time">${esc(s.time)}</div>
      <div class="tl-dot"></div>
      <div class="tl-content">
        <div class="tl-t">${esc(s.title)}</div>
        ${s.desc ? `<div class="tl-d">${esc(s.desc)}</div>` : ''}
      </div>
    </div>`).join('');
  const notes = D.notes || [];
  if (notes[0]) { $('dressCode').textContent = notes[0].text; $('dressCodeItem').hidden = false; }
  if (notes[1]) { $('giftNote').textContent = notes[1].text; $('giftNoteItem').hidden = false; }
  $('noteBlock').hidden = !notes.length;
  const tr = D.transport || [];
  if (tr[0]) { $('transportPublic').textContent = tr[0].text; $('transportPublicItem').hidden = false; }
  if (tr[1]) { $('transportParking').textContent = tr[1].text; $('transportParkingItem').hidden = false; }
  $('transportBlock').hidden = !tr.length;
  if (D.story) { $('storyText').textContent = D.story; $('storyBlock').hidden = false; }
  /* 照片：對應規則跟正式版 js/common.js 的 applyLobbyPhotos() 一樣 ——
     hero／portrait 是封面，story、countdown 是照片牆第 1、2 張，photo1–6 是前六張 */
  const P = D.photos || {};
  const wall = P.gallery || [];
  const slot = (key) => {
    const n = /^photo(\d)$/.exec(key);
    if (n) return wall[n[1] - 1] || P.cover;
    if (key === 'story') return wall[0] || P.cover;
    if (key === 'countdown') return wall[1] || P.cover;
    return P.cover;
  };
  document.querySelectorAll('[data-photo]').forEach((el) => {
    const src = slot(el.dataset.photo);
    if (!src) return;
    el.style.backgroundImage = `url("${src}")`;
    el.classList.add('has-photo');
  });
  /* Classic 的大廳是整片背景照片（正式版是 js/index.js 的 applyLobbyBackground） */
  const bgImg = $('siteBgImg');
  if (bgImg && P.cover) {
    bgImg.hidden = false;
    bgImg.src = P.cover;
    bgImg.addEventListener('load', () => $('siteBg') && $('siteBg').classList.remove('is-empty'), { once: true });
  }

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

  /* ---------- 進站（＝ js/index.js 的 enterSite） ---------- */
  const app = $('app');
  function enterSite() {
    app.style.display = 'block';
    app.classList.remove('app-show');
    void app.offsetWidth;
    app.classList.add('app-show');
  }
  function play() {
    document.body.dataset.template = template;
    const old = $('opener');
    if (old) old.remove();
    const key = openingFor();
    if (!key || q.get('open') === '1') { enterSite(); return; }
    app.style.display = 'none';
    window.scrollTo(0, 0);
    const host = document.createElement('div');
    host.id = 'opener';
    host.className = 'overlay';
    document.body.appendChild(host);
    window.LobbyMotion.opening(host, key, {
      names: { a: W.groomEn, b: W.brideEn }, date: W.date, variant: template,
      onReveal: enterSite,
    });
  }

  /* ---------- 切換面板 ---------- */
  const S = CFG.sample || null;
  const panel = document.createElement('div');
  panel.className = 'demo-panel' + (S ? ' is-sample' : '');
  const tOpts = keys.map((k) => `<option value="${k}">${esc(S && S.colorLabels ? S.colorLabels[k] || CFG.templates[k].label : CFG.templates[k].label)}</option>`).join('');
  const oOpts = `<option value="">${S ? '原本的' : '跟著版型'}</option>` +
    Object.entries(CFG.openings).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  panel.innerHTML =
    (S ? `<a class="demo-back" href="${esc(S.back)}">← 所有版型</a>` : '') +
    (keys.length > 1 ? `<label>${S ? '配色' : '版型'}<select data-k="t">${tOpts}</select></label>` : '') +
    `<label>開場<select data-k="o">${oOpts}</select></label>` +
    `<button type="button" data-k="play">重播開場</button>`;
  document.body.appendChild(panel);
  const selT = panel.querySelector('[data-k="t"]');
  const selO = panel.querySelector('[data-k="o"]');
  if (selT) selT.value = template;
  selO.value = opening || '';
  const sync = () => {
    const u = new URL(location.href);
    u.searchParams.set('t', template);
    if (opening) u.searchParams.set('o', opening); else u.searchParams.delete('o');
    u.searchParams.delete('open');
    q.delete('open');
    history.replaceState(null, '', u);
  };
  if (selT) selT.addEventListener('change', () => { template = selT.value; sync(); play(); });
  selO.addEventListener('change', () => { opening = selO.value || null; sync(); play(); });
  panel.querySelector('[data-k="play"]').addEventListener('click', () => { q.delete('open'); play(); });

  /* 給客人看的示範只有大廳：點到其他頁面（祝福牆、出席回覆……）就說明一下，不要掉進 404 */
  if (S) {
    const note = document.createElement('div');
    note.className = 'demo-note';
    note.setAttribute('role', 'status');
    document.body.appendChild(note);
    let timer = 0;
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a || a.closest('.demo-panel')) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || /^(https?:|mailto:|tel:)/.test(href)) return;
      e.preventDefault();
      note.textContent = S.pageNote;
      note.classList.add('is-on');
      clearTimeout(timer);
      timer = setTimeout(() => note.classList.remove('is-on'), 3200);
    });
  }

  window.LobbyMotion.init(app);
  play();
  /* 資料填完了：收掉骨架閃爍（common.css 的 [data-sk] 看的是這個旗標） */
  document.documentElement.dataset.siteReady = '1';
  document.documentElement.dataset.demoReady = '1';
})();
