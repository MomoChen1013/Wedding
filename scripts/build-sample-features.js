/* ============================================================
   build-sample-features.js — 版型展示頁「兩個方案怎麼選」點開功能說明時的示意圖
   ------------------------------------------------------------
     node scripts/build-sample-features.js
     npm run build-sample-features        （拍完會再跑一次 build-samples）

   打開白色教堂的示範網站（/samples/white-church/…，資料全是虛構的），
   用手機的尺寸截賓客實際會看到的畫面，存成 public/samples/features/{名稱}.jpg：

     stories.jpg   故事牆・祝福牆・抽卡（三張並排）
     seating.jpg   賓客現場查詢（輸入「王小安」之後）
     quiz.jpg      自訂互動測驗
     letter.jpg    專屬信件（輸入「小安」拆開之後）

   排桌管理、收禮小幫手、多場活動連動在後台或另一個網址，示範網站沒有，
   那三張是 scripts/sample-index.html 裡用假資料畫的示意，不在這裡。
============================================================ */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { startSampleServer, routeFirebaseSdk, chromiumLaunchOptions } from './sample-server.js';

const OUT = fileURLToPath(new URL('../public/samples/features/', import.meta.url));
const TEMPLATE = 'white-church';
const VIEW = { width: 390, height: 720 };

const server = await startSampleServer();
const browser = await chromium.launch(chromiumLaunchOptions());
await mkdir(OUT, { recursive: true });

/* 開一頁示範網站，等它真的可用、字型載好，再做 act() 要做的事，最後截一張 PNG */
async function shot(sub, act) {
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
  await routeFirebaseSdk(page);
  await page.goto(`${server.origin}/samples/${TEMPLATE}/${sub}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.dataset.siteReady === '1', null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: '.demo-bar,.floating{display:none!important}' });
  if (act) await act(page);
  await page.waitForTimeout(1200);
  const png = await page.screenshot();
  await page.close();
  return png;
}

const save = (buf, name) => sharp(buf).resize({ width: 600 }).jpeg({ quality: 76, mozjpeg: true }).toFile(join(OUT, name));

try {
  /* 故事牆・祝福牆・抽卡：三張手機畫面並排成一張 */
  const parts = [];
  for (const [sub, act] of [
    ['exhibition', (p) => p.mouse.wheel(0, 260)],
    ['wall', (p) => p.mouse.wheel(0, 420)],
    ['draw', async (p) => { await p.click('#drawBtn').catch(() => {}); await p.waitForTimeout(2200); }],
  ]) {
    parts.push(await sharp(await shot(sub, act)).resize({ width: 360 }).png().toBuffer());
  }
  const meta = await sharp(parts[0]).metadata();
  const gap = 24;
  await sharp({ create: { width: meta.width * 3 + gap * 2, height: meta.height, channels: 3, background: '#f6f2ea' } })
    .composite(parts.map((input, i) => ({ input, left: i * (meta.width + gap), top: 0 })))
    .jpeg({ quality: 78, mozjpeg: true }).toFile(join(OUT, 'stories.jpg'));
  console.log('✅ public/samples/features/stories.jpg');

  await save(await shot('seating', async (p) => {
    await p.fill('#stInput', '王小安');
    await p.click('#stBtn');
    await p.waitForTimeout(800);
    await p.evaluate(() => document.getElementById('stSearch').scrollIntoView({ block: 'start' }));
  }), 'seating.jpg');
  console.log('✅ public/samples/features/seating.jpg');

  await save(await shot('quiz', (p) => p.mouse.wheel(0, 120)), 'quiz.jpg');
  console.log('✅ public/samples/features/quiz.jpg');

  await save(await shot('letter', async (p) => {
    await p.fill('#wlInput', '小安');
    await p.click('#wlBtn');
    await p.waitForTimeout(2600);
  }), 'letter.jpg');
  console.log('✅ public/samples/features/letter.jpg');
} finally {
  await browser.close();
  server.close();
}
