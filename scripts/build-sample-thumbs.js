/* ============================================================
   build-sample-thumbs.js — 版型展示頁（/samples）卡片上的縮圖
   ------------------------------------------------------------
     node scripts/build-sample-thumbs.js            # 全部重拍
     node scripts/build-sample-thumbs.js night-sky  # 只拍這幾個

   打開 public/samples/{key}.html（跳過開場），用手機的尺寸截首屏，
   存成 public/samples/thumbs/{key}.jpg。卡片與 LINE 分享的預覽圖都用它。
   拍完要再跑一次 npm run build-previews，總覽頁才會把新縮圖掛上去。

   用的是 devDependencies 裡的 playwright；本機沒有它的瀏覽器時，
   用 PLAYWRIGHT_CHROMIUM 指定一個 Chromium 執行檔。
============================================================ */
import { createServer } from 'node:http';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const OUT = join(PUBLIC, 'samples/thumbs');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
};

/* 只供這支腳本自己用的靜態伺服器（不需要 Firebase 模擬器） */
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
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

const all = (await readdir(join(PUBLIC, 'samples')))
  .filter((f) => f.endsWith('.html') && f !== 'index.html')
  .map((f) => f.replace(/\.html$/, ''));
const only = process.argv.slice(2);
const keys = only.length ? all.filter((k) => only.includes(k)) : all;

const exe = process.env.PLAYWRIGHT_CHROMIUM
  || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
await mkdir(OUT, { recursive: true });

try {
  for (const key of keys) {
    const page = await browser.newPage({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2 });
    await page.goto(`${origin}/samples/${key}.html?open=1`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    /* 面板不入鏡；進場的淡入、捲動編排的第一格跑完再拍 */
    await page.addStyleTag({ content: '.demo-panel,.demo-note{display:none!important}' });
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
