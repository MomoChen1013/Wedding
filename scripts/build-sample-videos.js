/* ============================================================
   build-sample-videos.js — 版型展示頁（/samples）卡片上的開場循環影片
   ------------------------------------------------------------
     node scripts/build-sample-videos.js            # 全部重錄
     node scripts/build-sample-videos.js night-sky  # 只錄這幾個
     npm run build-sample-videos                    # 全部重錄，再重產總覽頁

   新增版型之後跑一次就好：key 來自 scripts/sample-catalog.js。

   怎麼錄：
     1. 開 /samples/（總覽頁），在裡面放一個 390×760 的 iframe 開 /samples/{key}/?preview=1
        —— 就是「預覽」popup 用的預覽模式（samples/demo-extras.js）：開場自動播、停在第一屏、
        演完用 postMessage 通知
     2. 用 Chrome DevTools Protocol 的 screencast 收每一張畫面（2 倍解析度），記下時間
     3. 開場比 5 秒長的，取最後一段、最多加速到 1.6 倍，壓成 3–5 秒
     4. ffmpeg 裁成卡片的 4:5（上緣對齊，和縮圖一樣）、縮到 480 寬，
        輸出 WebM（VP9，主要）＋ MP4（H.264，Safari 舊版的後備），沒有聲音
     5. 每支目標 300KB 以內：超過就降畫質重壓，最後印出每支的大小

   需要 ffmpeg（PATH 上要找得到，或用 FFMPEG 指定路徑）。
   產出：public/samples/videos/{key}.webm、{key}.mp4
============================================================ */
import { mkdir, mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { SAMPLE_CATALOG } from './sample-catalog.js';
import { startSampleServer, routeFirebaseSdk, chromiumLaunchOptions } from './sample-server.js';

const OUT = fileURLToPath(new URL('../public/samples/videos/', import.meta.url));
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const VIEW = { width: 390, height: 760 };
const SCALE = 2;                 /* 截圖用 2 倍，縮到 480 寬才不糊 */
const OUT_W = 480, OUT_H = 600;  /* 卡片是 4:5 */
const FPS = 24;
const MAX_SEC = 5;               /* 影片最長 5 秒 */
const MAX_SPEED = 1.6;           /* 太長的開場最多加速到 1.6 倍 */
const BUDGET = 300 * 1024;       /* 每支 300KB */

const all = Object.keys(SAMPLE_CATALOG);
const only = process.argv.slice(2);
const keys = only.length ? all.filter((k) => only.includes(k)) : all;
if (!keys.length) throw new Error(`沒有這個版型：${only.join('、')}`);

try { execFileSync(FFMPEG, ['-version'], { stdio: 'ignore' }); }
catch { throw new Error('找不到 ffmpeg：請先安裝，或用 FFMPEG=/path/to/ffmpeg 指定'); }

const server = await startSampleServer();
const browser = await chromium.launch(chromiumLaunchOptions());
await mkdir(OUT, { recursive: true });

/* 錄一個版型的預覽：回傳 [{ file, t }]（t 是秒，從 iframe 開始載入算起）與開場演完的時間 */
async function record(key, dir) {
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: SCALE });
  await routeFirebaseSdk(page);
  await page.goto(`${server.origin}/samples/`, { waitUntil: 'domcontentloaded' });
  /* 總覽頁本身不入鏡：整頁只剩一個滿版的 iframe */
  await page.evaluate(({ w, h }) => {
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;padding:0;background:#fff;overflow:hidden';
    const f = document.createElement('iframe');
    f.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;border:0`;
    document.body.appendChild(f);
    /* 時間一律用 Date.now()（epoch 毫秒），和 screencast 每一張畫面的時間戳同一把尺 */
    window.__preview = {};
    window.__previewDone = new Promise((ok) => {
      addEventListener('message', (e) => {
        if (!e.data || e.data.source !== 'shin9-preview') return;
        window.__preview[e.data.type] = Date.now();
        if (e.data.type === 'done') ok();
      });
    });
  }, { w: VIEW.width, h: VIEW.height });

  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  const writes = [];
  let t0 = null;
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    if (t0 === null) t0 = metadata.timestamp;
    const file = join(dir, `f${String(frames.length).padStart(5, '0')}.jpg`);
    frames.push({ file, t: metadata.timestamp - t0 });
    writes.push(writeFile(file, Buffer.from(data, 'base64')));
    try { await cdp.send('Page.screencastFrameAck', { sessionId }); } catch {}
  });
  await cdp.send('Page.startScreencast', {
    format: 'jpeg', quality: 90, maxWidth: VIEW.width * SCALE, maxHeight: VIEW.height * SCALE, everyNthFrame: 1,
  });
  await page.evaluate((k) => { document.querySelector('iframe').src = `/samples/${k}/?preview=1`; }, key);
  await page.evaluate(() => window.__previewDone);
  const marks = await page.evaluate(() => window.__preview);
  await page.waitForTimeout(400);            /* 最後一個畫面多留一下 */
  await cdp.send('Page.stopScreencast');
  await page.waitForTimeout(200);
  await page.close();
  await Promise.all(writes);
  /* ready：示範網站載好、開場出現（之前是載入中的白畫面，不入鏡）；done：開場演完 */
  return { frames, readyAt: marks.ready / 1000 - t0, doneAt: marks.done / 1000 - t0 };
}

/* 把不等間隔的畫面排成 ffmpeg 的 concat 清單，只取 [from, to] 這一段 */
function concatList(frames, from, to) {
  const lines = [];
  const inRange = frames.filter((f, i) => {
    const next = frames[i + 1];
    return (next ? next.t : f.t + 1) > from && f.t < to;
  });
  inRange.forEach((f, i) => {
    const next = inRange[i + 1];
    const start = Math.max(f.t, from);
    const end = next ? Math.min(next.t, to) : to;
    lines.push(`file '${f.file}'`, `duration ${Math.max(end - start, 0.001).toFixed(4)}`);
  });
  /* concat 的最後一張要再列一次，duration 才會算進去 */
  if (inRange.length) lines.push(`file '${inRange[inRange.length - 1].file}'`);
  return lines.join('\n');
}

const sizeOf = async (f) => (await stat(f)).size;

function encode(list, speed, out, kind, q) {
  const vf = `setpts=PTS/${speed.toFixed(3)},fps=${FPS},crop=iw:iw*5/4:0:0,scale=${OUT_W}:${OUT_H}:flags=lanczos,setsar=1,format=yuv420p`;
  const common = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', vf, '-an'];
  if (kind === 'webm') {
    execFileSync(FFMPEG, [...common, '-c:v', 'libvpx-vp9', '-crf', String(q), '-b:v', '0', '-row-mt', '1',
      '-deadline', 'good', '-cpu-used', '2', out]);
  } else {
    execFileSync(FFMPEG, [...common, '-c:v', 'libx264', '-crf', String(q), '-preset', 'slow', '-profile:v', 'main',
      '-movflags', '+faststart', out]);
  }
}

/* 從畫質好的開始壓，超過預算就降一階 */
async function encodeWithin(list, speed, out, kind) {
  const steps = kind === 'webm' ? [34, 38, 42, 46, 50, 54] : [26, 29, 32, 35, 38, 41];
  for (const q of steps) {
    encode(list, speed, out, kind, q);
    const size = await sizeOf(out);
    if (size <= BUDGET) return { size, q };
  }
  return { size: await sizeOf(out), q: steps[steps.length - 1], over: true };
}

const report = [];
try {
  for (const key of keys) {
    const dir = await mkdtemp(join(tmpdir(), `sample-video-${key}-`));
    try {
      const { frames, readyAt, doneAt } = await record(key, dir);
      /* 錄到的必須是整個手機畫面：iframe 要是沒撐滿（例如尺寸沒設到，退回瀏覽器預設的 300×150），
         影片裡的開場就只剩左上角一小塊 —— 先檢查最後一張畫面的中下方不是空白 */
      const last = await sharp(frames[frames.length - 1].file).extract({ left: 0, top: 500, width: 390, height: 200 }).stats();
      if (last.channels.every((c) => c.stdev < 2)) throw new Error(`${key}：畫面下半部一片空白，iframe 可能沒有撐滿手機畫面`);
      if (frames.length < 2) throw new Error(`${key}：沒有錄到畫面`);
      const end = Math.min(doneAt + 0.3, frames[frames.length - 1].t + 0.2);
      /* 開場太長：取最後一段（開門、拆信那一下到首屏出現），最多加速 1.6 倍 */
      const speed = Math.min(MAX_SPEED, Math.max(1, end / MAX_SEC));
      const from = Math.max(readyAt, end - MAX_SEC * speed);
      const list = join(dir, 'frames.txt');
      await writeFile(list, concatList(frames, from, end));
      const webm = await encodeWithin(list, speed, join(OUT, `${key}.webm`), 'webm');
      const mp4 = await encodeWithin(list, speed, join(OUT, `${key}.mp4`), 'mp4');
      const sec = (end - from) / speed;
      report.push({ key, sec, speed, webm, mp4 });
      console.log(`✅ ${key}：${sec.toFixed(1)} 秒（${speed.toFixed(2)}×）webm ${(webm.size / 1024).toFixed(0)}KB・mp4 ${(mp4.size / 1024).toFixed(0)}KB`
        + (webm.over || mp4.over ? '  ⚠️ 超過 300KB' : ''));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
} finally {
  await browser.close();
  server.close();
}

console.log('\n版型               秒數   WebM     MP4');
for (const r of report) {
  console.log(`${r.key.padEnd(18)} ${r.sec.toFixed(1).padStart(4)}  ${(r.webm.size / 1024).toFixed(0).padStart(4)}KB  ${(r.mp4.size / 1024).toFixed(0).padStart(4)}KB`);
}
