/* ============================================================
   build-sample-thumbs.js — 版型展示頁（/samples）卡片上的縮圖
   ------------------------------------------------------------
     node scripts/build-sample-thumbs.js            # 全部重拍
     node scripts/build-sample-thumbs.js night-sky  # 只拍這幾個

   打開示範頁 /samples/{key}/（正式網站同一套大廳，跳過開場），用手機的尺寸截首屏，
   存成 public/samples/thumbs/{key}.jpg。卡片與 LINE 分享的預覽圖都用它。
   key 是 scripts/sample-catalog.js 的每一個版型。
   npm run build-sample-thumbs 拍完會再跑一次 build-samples，總覽頁才會掛上新縮圖。

   頁面會 import Firebase SDK（gstatic.com）—— 示範模式不連資料庫，但 import 還在。
   這裡改用 node_modules/firebase 裡同一份 CDN 版本回應，不必連外網（tests/ 也是這樣做）。

   用的是 devDependencies 裡的 playwright；本機沒有它的瀏覽器時，
   用 PLAYWRIGHT_CHROMIUM 指定一個 Chromium 執行檔。
============================================================ */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { SAMPLE_CATALOG } from './sample-catalog.js';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const OUT = join(PUBLIC, 'samples/thumbs');
const SDK = fileURLToPath(new URL('../node_modules/firebase/', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
};

/* firebase.json 的 /samples 改寫規則：/samples/{版型}/{頁面} → {頁面}.html，其餘 → index.html */
const SUBPAGES = ['wall', 'cake', 'draw', 'exhibition', 'quiz', 'seating', 'letter', 'invitation'];
function rewrite(path) {
  const m = path.match(/^\/samples\/([^/]+)(?:\/([^/]*))?$/);
  if (!m || /\.\w+$/.test(path)) return path;            /* 真的檔案（照片、縮圖、總覽） */
  return SUBPAGES.includes(m[2]) ? `/${m[2]}.html` : '/index.html';
}

/* 只供這支腳本自己用的靜態伺服器（不需要 Firebase 模擬器） */
const server = createServer(async (req, res) => {
  const path = rewrite(normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, ''));
  try {
    const body = await readFile(join(PUBLIC, path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end();
  }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const all = Object.keys(SAMPLE_CATALOG);
const only = process.argv.slice(2);
const keys = only.length ? all.filter((k) => only.includes(k)) : all;

const exe = process.env.PLAYWRIGHT_CHROMIUM
  || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
await mkdir(OUT, { recursive: true });

try {
  for (const key of keys) {
    const page = await browser.newPage({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2 });
    await page.route(/https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/(firebase-[a-z]+\.js)/, (route) => {
      const file = join(SDK, route.request().url().match(/(firebase-[a-z]+\.js)/)[1]);
      return existsSync(file) ? route.fulfill({ path: file, contentType: 'text/javascript' }) : route.continue();
    });
    /* 開場當作已經看過（js/index.js 的 introSeen），直接拍首頁 */
    await page.addInitScript((k) => sessionStorage.setItem(`wed.demo-${k}.introSeen`, '1'), key);
    await page.goto(`${origin}/samples/${key}/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.siteReady === '1', null, { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    /* 示範列與網站的浮動按鈕不入鏡；進場的淡入、捲動編排的第一格跑完再拍 */
    await page.addStyleTag({ content: '.demo-bar,.floating{display:none!important}' });
    await page.waitForTimeout(2500);
    const png = await page.screenshot();
    const file = join(OUT, `${key}.jpg`);
    await sharp(png).resize({ width: 600 }).jpeg({ quality: 78, mozjpeg: true }).toFile(file);
    console.log(`✅ public/samples/thumbs/${key}.jpg`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
