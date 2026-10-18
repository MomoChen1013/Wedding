/* ============================================================
   samples/samples.js — 版型展示頁（/samples/）總覽頁的互動
   ------------------------------------------------------------
     ・預覽 popup：手機外框裡用 iframe 開真的示範網站（/samples/{版型}/?preview=1），
       開場演完由 samples/demo-extras.js 用 postMessage 通知，這裡才顯示「關閉／查看完整示範網站」
     ・卡片的循環影片：進到畫面才掛上 src 開始播，離開就暫停；系統要求減少動態時只顯示縮圖
     ・手機版底部固定的 LINE 按鈕：捲過首屏才出現，捲到開站流程、預覽打開時收起來
     ・PostHog 事件（見 samples/analytics.js；沒填 key 時 track() 什麼都不做）

   事件（PostHog 漏斗：$pageview → template_preview_open → template_demo_open → line_click）：
     template_preview_open      { template }                  按下卡片的「預覽」
     template_preview_complete  { template }                  預覽裡的開場演完
     template_demo_open         { template, position }        「看完整範例」card／「查看完整示範網站」popup
     line_click                 { position, template? }       hero／template_card／flow／sticky
============================================================ */
import { initAnalytics } from './analytics.js';

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
});

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

/* ---------- 預覽 popup ---------- */
const pv = document.getElementById('pv');
const box = pv.querySelector('.pv-box');
const frame = document.getElementById('pvFrame');
const screen = document.getElementById('pvScreen');
const acts = document.getElementById('pvActs');
const wait = document.getElementById('pvWait');
const demoLink = document.getElementById('pvDemo');
let current = null;      /* { key, name, opener } */

/* 外框裡的網站一律用 390 寬去排（一般手機的寬度），再整個等比縮進外框 */
function fitFrame() {
  const w = screen.clientWidth, h = screen.clientHeight;
  if (!w) return;
  const k = w / 390;
  frame.style.transform = `scale(${k})`;
  frame.style.height = `${Math.ceil(h / k)}px`;
}

function loadPreview() {
  acts.hidden = true;
  wait.hidden = false;
  frame.src = 'about:blank';
  /* 每次都重新載入：示範網站在預覽模式會把「看過開場」的記號清掉，從頭演 */
  requestAnimationFrame(() => { frame.src = `/samples/${current.key}/?preview=1`; });
}

function openPreview(btn) {
  current = { key: btn.dataset.preview, name: btn.dataset.name, opener: btn };
  document.getElementById('pvTitle').textContent = current.name;
  demoLink.href = `/samples/${current.key}/`;
  pv.hidden = false;
  document.body.classList.add('pv-open');
  stickyState.preview = true; syncSticky();
  fitFrame();
  loadPreview();
  box.focus();
  track('template_preview_open', { template: current.key });
}

function closePreview() {
  if (pv.hidden) return;
  pv.hidden = true;
  frame.src = 'about:blank';          /* 停掉 iframe 裡的動畫與音樂 */
  frame.removeAttribute('src');
  document.body.classList.remove('pv-open');
  stickyState.preview = false; syncSticky();
  const back = current && current.opener;
  current = null;
  if (back) back.focus();
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('[data-preview]');
  if (btn) { openPreview(btn); return; }
  if (!pv.hidden && e.target.closest && e.target.closest('[data-close]')) closePreview();
});
document.getElementById('pvReplay').addEventListener('click', () => { if (current) loadPreview(); });
demoLink.addEventListener('click', () => {
  if (current) track('template_demo_open', { template: current.key, position: 'popup' });
});
window.addEventListener('resize', () => { if (!pv.hidden) fitFrame(); });

/* Esc 關閉；Tab 只在 popup 裡面轉（iframe 裡的東西不在 Tab 順序內，預覽只看不點） */
document.addEventListener('keydown', (e) => {
  if (pv.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); closePreview(); return; }
  if (e.key !== 'Tab') return;
  const items = Array.from(box.querySelectorAll('button, a[href]'))
    .filter((el) => el.offsetParent !== null && !el.closest('[hidden]'));
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === box)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
frame.tabIndex = -1;

/* 示範網站（預覽模式）送來的通知：只收同網域、而且是這個 iframe 送的 */
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
  const d = e.data;
  if (!d || d.source !== 'shin9-preview' || !current || d.template !== current.key) return;
  if (d.type === 'done') {
    acts.hidden = false;
    wait.hidden = true;
    track('template_preview_complete', { template: current.key });
  }
});
