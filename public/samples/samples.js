/* ============================================================
   samples/samples.js — 版型展示頁（/samples/）總覽頁的互動
   ------------------------------------------------------------
     ・預覽 popup：手機外框裡用 iframe 開真的示範網站（/samples/{版型}/?preview=1），
       旁邊（手機上是下面）是這一款的說明、「看完整範例」「開始製作」與網站包含什麼；
       開場演完由 samples/demo-extras.js 用 postMessage 通知
     ・方案比較：功能名稱點了，彈窗說明這是什麼（內容在 sample-index.html 的 <template id="fx-…">）
     ・「X 人喜歡這個版型」：卡片右上的愛心、「我想用這款」、預覽裡的「開始製作」都算一次，
       同一個瀏覽器同一款只算一次（localStorage）；數字存在 Firestore 的 sampleLikes/{版型}，用 REST 讀寫
     ・卡片的循環影片：進到畫面才掛上 src 開始播，離開就暫停；系統要求減少動態時只顯示縮圖
     ・手機版底部固定的 LINE 按鈕：捲過首屏才出現，捲到開站流程、預覽打開時收起來
     ・PostHog 事件（見 samples/analytics.js；沒填 key 時 track() 什麼都不做）

   事件（PostHog 漏斗：$pageview → template_preview_open → template_demo_open → line_click）：
     template_preview_open      { template }                  按下卡片的「預覽」
     template_preview_complete  { template }                  預覽裡的開場演完
     template_demo_open         { template, position }        「看完整範例」card／popup
     line_click                 { position, template? }       hero／template_card／preview（預覽裡的開始製作）／flow／sticky
     feature_info_open          { feature }                   方案比較點開功能說明
     template_like              { template, source }          第一次喜歡這一款：heart／want（我想用這款）／start（開始製作）
============================================================ */
import { initAnalytics } from './analytics.js';
import { FIREBASE_PROJECT_ID, FIREBASE_API_KEY } from './config.js';

const track = initAnalytics({ props: { page: 'samples' } });
const reduceMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

/* ---------- 點擊事件：LINE、看完整範例 ---------- */
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a[data-line], a[data-demo]');
  if (!a) return;
  const card = a.closest('[data-template]');
  const template = card ? card.dataset.template : undefined;
  if (a.dataset.line) track('line_click', template ? { position: a.dataset.line, template } : { position: a.dataset.line });
  else track('template_demo_open', { template, position: a.dataset.demo });
  if (template && a.classList.contains('btn-like')) like(template, 'want');
});

/* ---------- X 人喜歡這個版型 ----------
   Firestore 的 sampleLikes/{版型} = { count }，規則只准每次 +1（firestore.rules）。
   用 REST 而不是 Firebase SDK：這一頁只要讀一份清單、偶爾加 1，不值得多載一百多 KB。
   本機（npm run samples）連 Firestore 模擬器；模擬器沒開就讀不到，數字那一行不顯示，愛心照樣按得下去。 */
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const DB = `${LOCAL ? 'http://127.0.0.1:8080' : 'https://firestore.googleapis.com'}/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const LIKED_KEY = 'shin9.samples.liked';
const counts = {};
let countsLoaded = false;

function likedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(LIKED_KEY) || '[]')); } catch { return new Set(); }
}
function saveLiked(set) {
  try { localStorage.setItem(LIKED_KEY, JSON.stringify([...set])); } catch { /* 無痕視窗：這次照樣算，只是記不住 */ }
}
const liked = likedSet();

function renderLikes(template) {
  for (const card of document.querySelectorAll(`[data-template="${template}"]`)) {
    const btn = card.querySelector('[data-like]');
    if (btn) btn.setAttribute('aria-pressed', liked.has(template) ? 'true' : 'false');
    const line = card.querySelector('[data-likes]');
    if (!line) continue;
    if (!countsLoaded) { line.hidden = true; continue; }
    const n = counts[template] || 0;
    line.textContent = n ? `${n} 人喜歡這個版型` : '成為第一個喜歡這個版型的人';
    line.hidden = false;
  }
}
function renderAllLikes() {
  document.querySelectorAll('.card[data-template]').forEach((c) => renderLikes(c.dataset.template));
}

async function loadLikes() {
  try {
    let pageToken = '';
    do {
      const res = await fetch(`${DB}/sampleLikes?pageSize=300&key=${FIREBASE_API_KEY}${pageToken ? `&pageToken=${pageToken}` : ''}`);
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      for (const d of data.documents || []) {
        counts[d.name.split('/').pop()] = Number(d.fields && d.fields.count && d.fields.count.integerValue) || 0;
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    countsLoaded = true;
  } catch { /* 讀不到就不顯示數字 */ }
  renderAllLikes();
}

/* 同一個瀏覽器、同一款只算一次；畫面先 +1，送出失敗也不退回（下次重新整理會拿到真正的數字） */
function like(template, source) {
  if (liked.has(template)) return;
  liked.add(template);
  saveLiked(liked);
  counts[template] = (counts[template] || 0) + 1;
  renderLikes(template);
  track('template_like', { template, source });
  fetch(`${DB}:commit?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: [{ transform: {
      document: `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/sampleLikes/${template}`,
      fieldTransforms: [{ fieldPath: 'count', increment: { integerValue: '1' } }],
    } }] }),
    keepalive: true,      /* 「我想用這款」會立刻開 LINE，頁面被切走也要送得出去 */
  }).catch(() => {});
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('[data-like]');
  if (!btn) return;
  const template = btn.closest('[data-template]').dataset.template;
  btn.classList.remove('is-pop'); void btn.offsetWidth; btn.classList.add('is-pop');
  like(template, 'heart');
});
renderAllLikes();
loadLikes();

/* ---------- 卡片的循環影片 ---------- */
(function loopVideos() {
  const videos = Array.from(document.querySelectorAll('video.loop'));
  if (!videos.length || reduceMotion() || !('IntersectionObserver' in window)) return;
  const attach = (v) => {
    if (v.dataset.on) return;
    v.dataset.on = '1';
    if (v.dataset.poster) v.poster = v.dataset.poster;
    for (const [type, src] of [['video/webm', v.dataset.webm], ['video/mp4', v.dataset.mp4]]) {
      const s = document.createElement('source');
      s.type = type; s.src = src;
      v.appendChild(s);
    }
    v.load();
  };
  const io = new IntersectionObserver((entries) => {
    for (const { target: v, isIntersecting } of entries) {
      if (isIntersecting) {
        attach(v);
        const p = v.play();
        if (p && p.catch) p.catch(() => { /* 省電模式擋自動播放：留在 poster */ });
      } else if (v.dataset.on) {
        v.pause();
      }
    }
  }, { rootMargin: '120px 0px', threshold: 0.15 });
  videos.forEach((v) => io.observe(v));
})();

/* ---------- 手機版底部固定的 LINE 按鈕 ---------- */
const sticky = document.getElementById('sticky');
const stickyState = { pastHero: false, atFlow: false, preview: false };
function syncSticky() {
  const on = stickyState.pastHero && !stickyState.atFlow && !stickyState.preview;
  sticky.classList.toggle('is-on', on);
  const a = sticky.querySelector('a');
  a.tabIndex = on ? 0 : -1;
  sticky.setAttribute('aria-hidden', on ? 'false' : 'true');
}
if ('IntersectionObserver' in window) {
  /* 首屏的 LINE 按鈕還在畫面上時不需要第二顆；往下捲過它才出現 */
  new IntersectionObserver(([e]) => {
    stickyState.pastHero = !e.isIntersecting && e.boundingClientRect.top < 0;
    syncSticky();
  }).observe(document.getElementById('heroCta'));
  /* 開站流程那一區有自己的「用 LINE 問問看」：捲到那裡就收起來，捲過頭（到常見問題）再出來 */
  new IntersectionObserver(([e]) => {
    stickyState.atFlow = e.isIntersecting;
    syncSticky();
  }, { rootMargin: '0px 0px -10% 0px' }).observe(document.getElementById('flow'));
}

/* ---------- 彈窗共用：鎖背景捲動、焦點進出、Esc／背景／× 關閉 ---------- */
let openDlg = null;      /* { el, back, onClose } */
function showDialog(el, back, onClose) {
  if (openDlg) closeDialog();
  openDlg = { el, back, onClose };
  el.hidden = false;
  document.body.classList.add('dlg-open');
  stickyState.preview = true; syncSticky();
  const box = el.querySelector('.dlg-box');
  box.scrollTop = 0;
  box.focus();
}
function closeDialog() {
  if (!openDlg) return;
  const { el, back, onClose } = openDlg;
  openDlg = null;
  el.hidden = true;
  document.body.classList.remove('dlg-open');
  stickyState.preview = false; syncSticky();
  if (onClose) onClose();
  if (back) back.focus();
}
document.addEventListener('click', (e) => {
  if (openDlg && e.target.closest && e.target.closest('[data-close]')) closeDialog();
});
document.addEventListener('keydown', (e) => {
  if (!openDlg) return;
  if (e.key === 'Escape') { e.preventDefault(); closeDialog(); return; }
  if (e.key !== 'Tab') return;
  /* Tab 只在彈窗裡面轉（預覽 iframe 裡的東西不在 Tab 順序內，預覽只看不點） */
  const box = openDlg.el.querySelector('.dlg-box');
  const items = Array.from(box.querySelectorAll('button, a[href], input')).filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === box)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

/* ---------- 預覽 popup ---------- */
const pv = document.getElementById('pv');
const frame = document.getElementById('pvFrame');
const screen = document.getElementById('pvScreen');
const wait = document.getElementById('pvWait');
const demoLink = document.getElementById('pvDemo');
const startLink = document.getElementById('pvStart');
let current = null;      /* { key } */

/* 外框裡的網站一律用 390 寬去排（一般手機的寬度），再整個等比縮進外框 */
function fitFrame() {
  const w = screen.clientWidth, h = screen.clientHeight;
  if (!w) return;
  const k = w / 390;
  frame.style.transform = `scale(${k})`;
  frame.style.height = `${Math.ceil(h / k)}px`;
}

function loadPreview() {
  wait.textContent = '開場播放中…';
  frame.src = 'about:blank';
  /* 每次都重新載入：示範網站在預覽模式會把「看過開場」的記號清掉，從頭演 */
  requestAnimationFrame(() => { frame.src = `/samples/${current.key}/?preview=1`; });
}

function openPreview(btn) {
  const card = btn.closest('[data-template]');
  current = { key: btn.dataset.preview };
  document.getElementById('pvTitle').innerHTML =
    `${card.querySelector('.cn').textContent}<small>${card.querySelector('.en').textContent}</small>`;
  document.getElementById('pvMood').textContent = card.querySelector('.mood').textContent;
  demoLink.href = `/samples/${current.key}/`;
  /* 開始製作：和卡片上「我想用這款」同一個 LINE 連結（預填這一款的名字） */
  startLink.href = card.querySelector('.btn-like').href;
  showDialog(pv, btn, () => {
    frame.src = 'about:blank';          /* 停掉 iframe 裡的動畫與音樂 */
    frame.removeAttribute('src');
    current = null;
  });
  fitFrame();
  loadPreview();
  track('template_preview_open', { template: current.key });
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('[data-preview]');
  if (btn) openPreview(btn);
});
document.getElementById('pvReplay').addEventListener('click', () => { if (current) loadPreview(); });
demoLink.addEventListener('click', () => {
  if (current) track('template_demo_open', { template: current.key, position: 'popup' });
});
startLink.addEventListener('click', () => {
  if (!current) return;
  track('line_click', { position: 'preview', template: current.key });
  like(current.key, 'start');
});
window.addEventListener('resize', () => { if (current) fitFrame(); });

/* 示範網站（預覽模式）送來的通知：只收同網域、而且是這個 iframe 送的 */
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
  const d = e.data;
  if (!d || d.source !== 'shin9-preview' || !current || d.template !== current.key) return;
  if (d.type === 'done') {
    wait.textContent = '開場播完了，可以按左上角重播';
    track('template_preview_complete', { template: current.key });
  }
});

/* ---------- 方案比較：功能說明 ---------- */
const fx = document.getElementById('fx');
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('[data-feature]');
  if (!btn) return;
  const tpl = document.getElementById(`fx-${btn.dataset.feature}`);
  if (!tpl) return;
  document.getElementById('fxTitle').textContent = btn.querySelector('.lab').textContent;
  const body = document.getElementById('fxBody');
  body.replaceChildren(tpl.content.cloneNode(true));
  showDialog(fx, btn);
  track('feature_info_open', { feature: btn.dataset.feature });
});
