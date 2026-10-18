/* ============================================================
   build-sample-thumbs.js — 版型展示頁（/samples）卡片上的縮圖
   ------------------------------------------------------------
     node scripts/build-sample-thumbs.js            # 全部重拍
     node scripts/build-sample-thumbs.js night-sky  # 只拍這幾個

   打開示範頁 /samples/{key}/（正式網站同一套大廳，跳過開場），用手機的尺寸截首屏，
   存成 public/samples/thumbs/{key}.jpg。卡片與 LINE 分享的預覽圖都用它。
   key 是 scripts/sample-catalog.js 的每一個版型。
   npm run build-sample-thumbs 拍完會再跑一次 build-samples，總覽頁才會掛上新縮圖。

   靜態伺服器、Firebase SDK 的離線回應、Chromium 的位置都在 scripts/sample-server.js。
============================================================ */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { SAMPLE_CATALOG } from './sample-catalog.js';
import { startSampleServer, routeFirebaseSdk, chromiumLaunchOptions } from './sample-server.js';

const OUT = fileURLToPath(new URL('../public/samples/thumbs/', import.meta.url));
const server = await startSampleServer();
const { origin } = server;

const all = Object.keys(SAMPLE_CATALOG);
const only = process.argv.slice(2);
const keys = only.length ? all.filter((k) => only.includes(k)) : all;

const browser = await chromium.launch(chromiumLaunchOptions());
await mkdir(OUT, { recursive: true });

try {
  for (const key of keys) {
    const page = await browser.newPage({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2 });
    await routeFirebaseSdk(page);
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
