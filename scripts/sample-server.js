/* ============================================================
   sample-server.js — 版型展示頁的小型靜態伺服器（給截圖、錄影的腳本用）
   ------------------------------------------------------------
   scripts/build-sample-thumbs.js 與 build-sample-videos.js 共用，不需要 Firebase 模擬器。
   照 firebase.json 的 /samples 改寫規則回應：
     /samples/                 → samples/index.html（總覽頁）
     /samples/{版型}/{頁面}    → {頁面}.html
     /samples/{版型}/…         → index.html
   和 Firebase Hosting 一樣，實體檔案優先：跑過 scripts/build-sample-shield.js 之後，
   /samples/{版型}/ 會讀 public/samples/{版型}/index.html（保護過的副本）。
   startSampleServer({ shield: false }) 可以略過副本，讀原始檔（比對用）。

   頁面會 import Firebase SDK（gstatic.com）—— 示範模式不連資料庫，但 import 還在。
   routeFirebaseSdk() 改用 node_modules/firebase 裡同一份 CDN 版本回應，不必連外網（tests/ 也是這樣做）。
============================================================ */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const SDK = fileURLToPath(new URL('../node_modules/firebase/', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.woff2': 'font/woff2',
};

const SUBPAGES = ['wall', 'cake', 'draw', 'exhibition', 'quiz', 'seating', 'letter', 'invitation'];
function rewrite(path, shield) {
  if (/^\/samples\/?$/.test(path)) return '/samples/index.html';
  const m = path.match(/^\/samples\/([^/]+)(?:\/([^/]*))?\/?$/);
  if (!m || /\.\w+$/.test(path)) return path;            /* 真的檔案（照片、縮圖、總覽） */
  const page = SUBPAGES.includes(m[2]) ? m[2] : 'index';
  const copy = `/samples/${m[1]}/${page}.html`;
  if (shield && existsSync(join(PUBLIC, copy))) return copy;
  return `/${page}.html`;
}

/* 開一個隨機埠，回傳 { origin, close() } */
export async function startSampleServer({ shield = true } = {}) {
  const server = createServer(async (req, res) => {
    const path = rewrite(normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, ''), shield);
    try {
      const body = await readFile(join(PUBLIC, path));
      res.writeHead(200, { 'Content-Type': TYPES[extname(path).toLowerCase()] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end();
    }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

export function routeFirebaseSdk(pageOrContext) {
  return pageOrContext.route(/https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/(firebase-[a-z]+\.js)/, (route) => {
    const file = join(SDK, route.request().url().match(/(firebase-[a-z]+\.js)/)[1]);
    return existsSync(file) ? route.fulfill({ path: file, contentType: 'text/javascript' }) : route.continue();
  });
}

/* 本機沒有 playwright 自己的瀏覽器時，用 PLAYWRIGHT_CHROMIUM 指定一個 Chromium 執行檔 */
export function chromiumLaunchOptions() {
  const exe = process.env.PLAYWRIGHT_CHROMIUM
    || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  return exe ? { executablePath: exe } : {};
}
