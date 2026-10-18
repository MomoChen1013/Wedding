/* ============================================================
   samples/demo-extras.js — 示範網站（/samples/{版型}/…）才有的附加功能
   ------------------------------------------------------------
   js/site-context.js 只在示範模式（DEMO）import 這一支，正式婚禮網站一個位元組都不會抓。

     ・左下角的示範列（回版型總覽、重播開場）
     ・PostHog（示範模式才載入，見 samples/analytics.js）
     ・預覽模式：/samples/ 總覽頁的「預覽」popup 用 iframe 開 /samples/{版型}/?preview=1

   預覽模式只在這三個條件都成立時才生效，直接開網址加 ?preview=1 不會有任何作用：
     1. 網址帶 ?preview=1，而且是大廳（/samples/{版型}/）
     2. 被 iframe 嵌著
     3. 外層是同一個網域的 /samples/ 總覽頁

   預覽模式做的事：
     ・跳過「在進場前，先報上名來」（入場登入一律關掉）、開場一律重演
     ・要賓客動手的開場（拆信、推門…）自動按下去；自己會演的開場（花開、星圖、氣球）照演（減少動態時也幫忙點一下）
     ・畫面停在第一屏，不能往下捲，也不會被連結帶走
     ・開場演完用 postMessage 通知外層（只送給同網域）
     ・示範列、背景音樂按鈕、跳過鈕都不顯示；不載入 PostHog（外層會記一筆預覽事件）
============================================================ */
import { initAnalytics } from './analytics.js';

const m = location.pathname.match(/^\/samples\/([^/]+)(?:\/([^/]*))?/);
const template = m ? decodeURIComponent(m[1]).toLowerCase() : '';
const isLobby = !!m && !m[2];

function parentIsSamples() {
  if (window.parent === window) return false;
  try {
    const p = window.parent.location;     /* 不同網域會直接丟例外 */
    return p.origin === location.origin && /^\/samples(?:\/(?:index\.html)?)?$/.test(p.pathname);
  } catch {
    return false;
  }
}

export const PREVIEW = isLobby
  && new URLSearchParams(location.search).get('preview') === '1'
  && parentIsSamples();

const PREVIEW_HIT_MS = 1100;      /* 要動手的開場：先讓人看一眼還沒打開的樣子，再自動按下去 */
const PREVIEW_SETTLE_MS = 700;    /* 開場收掉之後，等首屏的進場淡入跑完再通知外層 */
const PREVIEW_GIVE_UP_MS = 25000; /* 認不得的開場：最久等這麼久就當作演完了 */

/* ---------- 站台資料進來之前（頁面 JS 都還沒載入） ---------- */
export function prepareSite(site) {
  if (!PREVIEW) return site;
  /* 同一個分頁看過的開場不會再演（js/index.js 的 introSeen），預覽每次都要從頭演 */
  try { sessionStorage.removeItem(`wed.demo-${template}.introSeen`); } catch {}
  document.documentElement.classList.add('demo-preview');
  const style = document.createElement('style');
  style.textContent =
    'html.demo-preview,html.demo-preview body{overflow:hidden!important;overscroll-behavior:none;}' +
    'html.demo-preview .demo-bar,html.demo-preview .floating,html.demo-preview #introSkip{display:none!important;}';
  document.head.appendChild(style);
  lockScroll();
  return { ...site, entryLoginEnabled: false };
}

function lockScroll() {
  const stop = (e) => e.preventDefault();
  window.addEventListener('wheel', stop, { passive: false });
  window.addEventListener('touchmove', stop, { passive: false });
  window.addEventListener('keydown', (e) => {
    if ([' ', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'End', 'Home'].includes(e.key)) e.preventDefault();
  });
  window.addEventListener('scroll', () => { if (window.scrollY) window.scrollTo(0, 0); });
  /* 預覽只看第一屏：連結一律不跟（外層有「查看完整示範網站」） */
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('a[href]')) e.preventDefault();
  }, true);
}

/* ---------- 頁面 JS 都載好之後 ---------- */
export function mountDemo({ pageKey }) {
  if (PREVIEW) { runPreview(); return; }
  mountDemoBar(pageKey);
  initAnalytics({ props: { template, demo_page: pageKey } });
}

function runPreview() {
  const post = (type) => {
    try { window.parent.postMessage({ source: 'shin9-preview', type, template }, location.origin); } catch {}
  };
  post('ready');

  /* 要動手的開場按那一顆；自己會演的開場（花開、氣球）在「減少動態」時只給一張靜態畫面、
     等人點一下才進（js/lobby-motion.js 的 ctx.reduce），那就點開場本身 */
  const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const hit = document.querySelector('#opener .op-hit') || (reduce && document.getElementById('opener'));
  if (hit) setTimeout(() => { if (hit.isConnected) hit.click(); }, PREVIEW_HIT_MS);

  const shown = (el) => !!el && getComputedStyle(el).display !== 'none';
  const finished = () => !document.getElementById('opener')
    && !shown(document.getElementById('intro'))
    && !shown(document.getElementById('curtain'));

  const t0 = Date.now();
  const timer = setInterval(() => {
    if (!finished() && Date.now() - t0 < PREVIEW_GIVE_UP_MS) return;
    clearInterval(timer);
    setTimeout(() => { window.scrollTo(0, 0); post('done'); }, PREVIEW_SETTLE_MS);
  }, 150);
}

/* 示範頁左下角的那一條：回到版型總覽；大廳另外有「重播開場動畫」。
   開場不給賓客挑：每個版型照它自己的預設開場演。
   開場在同一個分頁只演一次（js/index.js 的 introSeen，正式網站也一樣），
   重播就是把那個記號清掉再重新載入。 */
function mountDemoBar(pageKey) {
  if (!document.querySelector('link[href="/samples/demo-bar.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/samples/demo-bar.css';
    document.head.appendChild(link);
  }
  const bar = document.createElement('div');
  bar.className = 'demo-bar';
  bar.innerHTML = '<a href="/samples/">← 版型總覽</a>' +
    (pageKey === 'lobby' ? '<button type="button" data-k="replay">重播開場動畫</button>' : '');
  document.body.appendChild(bar);

  const replay = bar.querySelector('[data-k="replay"]');
  if (replay) replay.addEventListener('click', () => {
    try { sessionStorage.removeItem(`wed.demo-${template}.introSeen`); } catch {}
    window.scrollTo(0, 0);
    location.reload();
  });
}
