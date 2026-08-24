/* ============================================================
   build-guide-shots.js — 產生「匯入匯出」那一頁的示範截圖
   ------------------------------------------------------------
   後台的匯入是一個五步驟的精靈。以前那一頁只用文字寫
   「選檔案 → 預覽 → 欄位對應 → 檢查資料 → 確認匯入」，
   但沒看過的人根本不知道「欄位對應」長什麼樣、要做什麼決定。

   這支腳本把精靈每一步的真實 markup（抄自 js/seating-plan.js 的
   renderImport()）配上示範資料，用同一份 css/admin.css 畫出來再截圖，
   輸出到 public/assets/guide/。所以那些圖不是畫出來的示意圖，
   是真的用同一套樣式跑出來的畫面。

   什麼時候要重跑：
     ・改了 renderImport() 產生的 markup
     ・改了 .sp-steps／.sp-preview／.sp-map-row／.ad-upload 的樣式
   跑法：node scripts/build-guide-shots.js
   （需要 devDependencies：playwright、sharp）
============================================================ */
import { chromium } from 'playwright';
import sharp from 'sharp';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', 'public');
const OUT = join(ROOT, 'assets', 'guide');
mkdirSync(OUT, { recursive: true });

/* 卡片寬度固定 —— 截圖之間的縮放要一致，一排看下來才像同一個東西的五個瞬間 */
const CARD_W = 620;
const DPR = 2;

/* ---------- 示範資料 ----------
   刻意留一筆有問題的（第 4 列沒有姓名），
   因為「有問題的那幾筆不會被匯進來」是這個精靈最需要被看見的行為。 */
const HEAD = ['編號', '姓名', '人數', '關係', '桌號', '標籤', '備註'];
const ROWS = [
  ['A01', '王大明', '4', '男方同事', '02', '素食', ''],
  ['A02', '陳美玲', '2', '女方親戚', '', '', '會晚到'],
  ['A03', '林建宏', '6', '男方親戚', '01', '兒童', '需要兒童椅 ×2'],
  ['A04', '黃淑芬', '1', '女方好友', '', 'VIP', ''],
  ['A05', '張志豪', '3', '男方同事', '02', '', ''],
];

const esc = (s) => String(s ?? '').replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const FIELDS = [
  ['姓名', true, '姓名'], ['編號', false, '編號'], ['類別', false, '關係'],
  ['人數', false, '人數'], ['桌位', false, '桌號'], ['Tags', false, '標籤'],
  ['RSVP', false, ''], ['備註', false, '備註'],
];

function steps(current) {
  return ['選擇檔案', '預覽資料', '欄位對應', '檢查資料', '確認匯入']
    .map((t, i) => {
      const n = i + 1;
      const cls = n === current ? ' class="is-on"' : (n < current ? ' class="is-done"' : '');
      return `<li data-step="${n}"${cls}>${t}</li>`;
    }).join('');
}

function previewTable(head, rows) {
  return `<div class="sp-table-scroll"><table class="sp-preview">
    <thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${head.map((_, i) =>
      `<td>${esc(r[i] || '')}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

/* 每一步的內容都直接對應 renderImport() 裡同一步產生的東西 */
const BODIES = {
  1: `
    <label class="ad-upload">
      <span class="ad-upload-mark">＋</span>
      <span class="ad-upload-text">點這裡選擇 Excel／CSV，或把檔案拖進來</span>
      <span class="ad-upload-hint">.xlsx 讀第一張工作表・.csv 需為逗號分隔</span>
    </label>
    <div class="ad-hint"></div>`,

  2: `
    <p class="ad-modal-note">
      讀到 <b>5</b> 列資料（工作表：賓客名單）。
      下面是前 5 列，確認一下第一列是不是欄位名稱。
    </p>
    ${previewTable(HEAD, ROWS)}`,

  3: `
    <p class="ad-modal-note">
      左邊是系統的欄位，右邊挑出 Excel 裡對應的那一欄。
      <b>姓名一定要對到</b>，其餘沒有就留「不匯入」。
    </p>
    ${FIELDS.map(([label, req, picked]) => `
      <div class="sp-map-row">
        <span class="sp-map-name">${esc(label)}${req ? ' *' : ''}</span>
        <select class="ad-input">
          <option>${picked ? esc(picked) : '（不匯入）'}</option>
        </select>
      </div>`).join('')}`,

  4: `
    <p class="ad-modal-note">
      可以匯入 <b>5</b> 筆，<b>1</b> 筆有問題（不會被匯入）。
    </p>
    <div class="sp-bad"><div class="sp-bad-row">第 6 筆資料：沒有姓名</div></div>
    ${previewTable(
      ['編號', '姓名', '人數', '類別', '桌位', 'Tags'],
      ROWS.map((r) => [r[0], r[1], r[2], r[3], r[4], r[5]]))}`,

  5: `
    <p class="ad-modal-note">
      即將新增 <b>5</b> 位賓客，其中 3 位會直接排進對應的桌位。
      匯入是「加上去」，原本的名單不會被清掉；按下去之後仍然可以用「復原」還原。
    </p>
    <div class="ad-hint">
      匯進來的是<b>手動賓客</b>，和出席回覆分開存 ——
      回覆是賓客送出的紀錄，不會被匯入的資料覆蓋。
    </div>`,
};

const NEXT = { 1: '下一步', 2: '下一步', 3: '下一步', 4: '下一步', 5: '確認匯入' };

function pageFor(step) {
  const admin = readFileSync(join(ROOT, 'admin.html'), 'utf8');
  const head = admin.slice(0, admin.indexOf('</head>') + 7);
  return `${head}
<body data-theme="champagne" data-page="admin" style="background:#fff">
<div class="ad-modal-card ad-modal-card-form sp-import-card" id="shot"
     style="width:${CARD_W}px;max-width:none;margin:0">
  <div class="ad-modal-title">匯入賓客名單</div>
  <ol class="sp-steps">${steps(step)}</ol>
  <div class="sp-step-body">${BODIES[step]}</div>
  <div class="ad-modal-actions">
    <button class="btn small ghost" type="button">取消</button>
    ${step > 1 ? '<button class="btn small ghost" type="button">上一步</button>' : ''}
    ${step === 1 ? '' : `<button class="btn small" type="button">${NEXT[step]}</button>`}
  </div>
</div>
</body></html>`;
}

/* ---------- 靜態伺服器：字型與 css 都要走 http 才載得到 ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};
const pages = new Map();
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (pages.has(url)) {
    res.writeHead(200, { 'content-type': MIME['.html'] });
    res.end(pages.get(url));
    return;
  }
  const p = join(ROOT, url);
  try {
    if (!statSync(p).isFile()) throw new Error('dir');
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(readFileSync(p));
  } catch { res.writeHead(404); res.end(''); }
});
const PORT = 5311;
await new Promise((r) => server.listen(PORT, r));

for (let i = 1; i <= 5; i++) pages.set(`/__shot-${i}.html`, pageFor(i));

/* 環境裡已經有 Chromium 的話直接用，不要再下載一份 */
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root && existsSync(root)) {
    const dir = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
    const bin = dir && join(root, dir, 'chrome-linux', 'chrome');
    if (bin && existsSync(bin)) return bin;
  }
  return undefined;
}

const browser = await chromium.launch({ executablePath: findChromium() });
const ctx = await browser.newContext({
  viewport: { width: CARD_W + 80, height: 900 },
  deviceScaleFactor: DPR,
});
const page = await ctx.newPage();

for (let i = 1; i <= 5; i++) {
  await page.goto(`http://127.0.0.1:${PORT}/__shot-${i}.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
  const raw = await page.locator('#shot').screenshot();
  /* 截圖是 2× 的，縮回 1× 的 CARD_W 再壓 —— 顯示寬度最多就是這麼寬，
     多出來的像素只是讓 admin 那一頁多載幾百 KB。 */
  const file = join(OUT, `import-step-${i}.png`);
  const info = await sharp(raw).resize({ width: CARD_W })
    .png({ quality: 82, compressionLevel: 9 }).toFile(file);
  console.log(`import-step-${i}.png  ${info.width}×${info.height}  `
    + `${(statSync(file).size / 1024).toFixed(0)} KB`);
}

await browser.close();
server.close();
console.log('→', OUT);
console.log('\n提醒：admin.html 的 <img> 上有 width／height，是為了讓瀏覽器'
  + '在圖還沒載完時就先留好位子（不然捲到一半版面會跳）。\n'
  + '高度變了的話，記得把上面印出來的數字抄回去。');
