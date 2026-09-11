/* ============================================================
   no-flicker.mjs — 守住兩種載入閃爍
   ------------------------------------------------------------
   這一支守的是一句話：**賓客不該看到半成品。**

   歷史上有兩種閃爍，都是「先顯示半成品，再靠 JS 修成成品」造成的：

     ① 樣板 token
        HTML 裡直接寫 {{couple}}，JS 跑完之前賓客真的看得到那四個
        大括號。現在改成空載體 <span data-tpl="couple">，
        最壞是空白，而預產過的頁面連空白都沒有。

     ② 版型換色
        色票綁在 <body data-template>，而來源 HTML 一律寫死 classic。
        korean／forest 的站台會先看到 Classic 香檳金的信封，
        等 Firestore 回來才換成該版型的顏色 —— 就是「先淺色信封
        再變色信封」。現在由 build-og 把版型烤進 HTML。

   ▸ 為什麼要從「第一次繪製」就開始量
     只檢查最終狀態是驗不到閃爍的 —— 閃爍的定義就是「中間有一格不對」。
     所以這裡用 addInitScript 在**任何頁面程式碼跑之前**就裝好採樣器，
     用 requestAnimationFrame 每一格記下當時的版型與畫面文字，
     最後檢查整段錄影裡有沒有出現過不該出現的狀態。

   ▸ 這一支需要先跑過 build-og
     預產頁是 build-og 的產出物，不進版控（見 .gitignore）。
     npm run test:no-flicker 會先種資料、再產頁、才開測。
============================================================ */
import { chromium } from 'playwright';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5000';

/* 由 tests/seed-no-flicker.mjs 種進 emulator 的兩組站台 */
const KOREAN  = process.env.FLICKER_KOREAN_SLUG  || 'flicker-korean';
const CLASSIC = process.env.FLICKER_CLASSIC_SLUG || 'flicker-classic';

/* 預產過的頁面：每一頁第一次繪製就該是成品 */
const PRERENDERED = ['', 'invitation', 'letter', 'wall', 'quiz', 'seating'];

function findChromium(){
  if(process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if(root && existsSync(root)){
    const dir = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
    const bin = dir && `${root}/${dir}/chrome-linux/chrome`;
    if(bin && existsSync(bin)) return bin;
  }
  return undefined;
}

let failures = 0;
function ok(msg, pass, detail){
  const line = detail ? `${msg} — ${detail}` : msg;
  if(pass){ console.log(`  ✅ ${line}`); }
  else{ console.log(`  ❌ ${line}`); failures++; }
}

const browser = await chromium.launch({ executablePath: findChromium() });

/* ------------------------------------------------------------
   沙箱連不出去：Firebase SDK 與字體改用本機的、或直接擋掉
   ------------------------------------------------------------
   跟 tests/multipage.mjs 同一套做法。沒有這一段的話 SDK 載不進來、
   boot() 根本不會跑 —— 那樣量到的只是靜態 HTML，
   驗不到「從半成品變成成品」這個交界，而閃爍就發生在那裡。
------------------------------------------------------------ */
const SDK_DIR = new URL('../node_modules/firebase/', import.meta.url);
const sdk = {
  app:       readFileSync(new URL('firebase-app.js', SDK_DIR), 'utf8'),
  firestore: readFileSync(new URL('firebase-firestore.js', SDK_DIR), 'utf8'),
  auth:      readFileSync(new URL('firebase-auth.js', SDK_DIR), 'utf8'),
};
/* SDK 內部彼此 import 時帶的是它自己的版號，要對齊成請求端的版號 */
const pinVersion = (body, url) => {
  const v = url.match(/firebasejs\/([^/]+)\//)?.[1];
  return body.replace(
    /https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/firebase-app\.js/g,
    `https://www.gstatic.com/firebasejs/${v}/firebase-app.js`);
};

async function newPage(){
  const page = await browser.newPage();
  await page.route('**/firebasejs/**/firebase-app.js', (r) =>
    r.fulfill({ contentType:'text/javascript', body: sdk.app }));
  await page.route('**/firebasejs/**/firebase-firestore.js', (r) =>
    r.fulfill({ contentType:'text/javascript', body: pinVersion(sdk.firestore, r.request().url()) }));
  await page.route('**/firebasejs/**/firebase-auth.js', (r) =>
    r.fulfill({ contentType:'text/javascript', body: pinVersion(sdk.auth, r.request().url()) }));
  /* 字體直接餵空的：這一支量的是版型色票與文字，不是字檔 */
  await page.route('**://fonts.googleapis.com/**', (r) =>
    r.fulfill({ contentType:'text/css', body:'' }));
  await page.route('**://fonts.gstatic.com/**', (r) => r.abort());
  /* 子頁面要求先在大廳報到過，沒有的話會被導回大廳 */
  await page.addInitScript((slugs) => {
    for(const s of slugs){
      localStorage.setItem(`wed.site-${s}.user`,
        JSON.stringify({ name:'測試賓客', icon:'\u2726' }));
    }
  }, [KOREAN, CLASSIC]);
  return page;
}

/* ------------------------------------------------------------
   採樣器：在頁面自己的程式碼之前裝好，逐格記錄畫面狀態
------------------------------------------------------------ */
const RECORDER = () => {
  window.__frames = [];
  const snap = () => {
    const b = document.body;
    if(b){
      window.__frames.push({
        t: performance.now(),
        template: b.dataset.template || '',
        ready: document.documentElement.dataset.siteReady === '1',
        prerendered: document.documentElement.dataset.prerendered === '1',
        /* innerText 只拿到「真的畫出來給人看」的字：
           display:none 的節點不算，HTML 註解也不算 —— 正好是我們要問的問題 */
        text: b.innerText || '',
        /* 遮罩當下有沒有真的蓋著。沒預產到的頁面會在這層底下換色，
           所以「換色的那幾格，遮罩必須是蓋著的」才算數 */
        veiled: (() => {
          const el = document.querySelector('.boot-veil');
          if(!el) return false;
          const cs = getComputedStyle(el);
          return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
        })(),
        /* 信封的實際顏色，用來抓「先淺色再變色」 */
        envelope: (() => {
          const el = document.querySelector('.env-front');
          return el ? getComputedStyle(el).backgroundColor : null;
        })(),
      });
    }
    requestAnimationFrame(snap);
  };
  requestAnimationFrame(snap);
};

async function record(path, { waitReady = true } = {}){
  const page = await newPage();
  await page.addInitScript(RECORDER);
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  if(waitReady){
    await page.waitForFunction(
      () => document.documentElement.dataset.siteReady === '1',
      null, { timeout: 15000 },
    ).catch(() => {});
  }
  /* 再多錄幾格，確保「變成成品之後」也沒有再跳回去 */
  await page.waitForTimeout(400);
  const frames = await page.evaluate(() => window.__frames);
  await page.close();
  return frames;
}

/* ============================================================
   1. 樣板 token 永遠不該被畫出來
   ------------------------------------------------------------
   預產頁與沒預產的頁面都適用 —— 前者是因為 build-og 先填好了，
   後者是因為空載體最壞只會是空白。
============================================================ */
console.log('\n【① 樣板 token：任何一格都不該出現在畫面上】');
for(const seg of PRERENDERED){
  const frames = await record(`/w/${KOREAN}/${seg}`);
  const bad = frames.find((f) => f.text.includes('{{'));
  ok(`/${seg || '（大廳）'} 全程沒有露出 {{…}}`,
     !bad && frames.length > 0,
     bad ? `第 ${frames.indexOf(bad)} 格：${bad.text.match(/\{\{\w+\}\}/)?.[0]}`
         : `${frames.length} 格`);
}

/* 沒預產的頁面（直接開共用 HTML，不走 /w/{slug}）也一樣不能露 */
{
  const page = await newPage();
  await page.goto(`${BASE}/letter.html`, { waitUntil: 'domcontentloaded' });
  const text = await page.evaluate(() => document.body.innerText || '');
  await page.close();
  ok('共用 HTML 直接開啟也沒有 {{…}}', !text.includes('{{'),
     text.match(/\{\{\w+\}\}/)?.[0] || '乾淨');
}

/* ============================================================
   2. 版型：預產頁從第一格就是對的，中途不換色
============================================================ */
console.log('\n【② 版型：預產頁第一次繪製就是正確色票】');
for(const seg of PRERENDERED){
  const frames = await record(`/w/${KOREAN}/${seg}`);
  const first = frames[0];
  ok(`/${seg || '（大廳）'} 第一格就是 korean`,
     !!first && first.template === 'korean',
     first ? `data-template="${first.template}"` : '沒有錄到任何一格');

  const templates = [...new Set(frames.map((f) => f.template))];
  ok(`/${seg || '（大廳）'} 全程沒有換過版型`,
     templates.length === 1, templates.join(' → '));

  ok(`/${seg || '（大廳）'} 有蓋 data-prerendered（所以不會被遮罩擋住）`,
     !!first && first.prerendered);
}

/* ============================================================
   3. 信封：從第一格到成品，顏色一次都沒變過
   ------------------------------------------------------------
   這是使用者最初回報的那個症狀，直接對著 .env-front 的
   computed background-color 驗。
============================================================ */
console.log('\n【③ 信封：顏色從頭到尾是同一個】');
{
  const frames = (await record(`/w/${KOREAN}/letter`))
    .filter((f) => f.envelope);
  const colors = [...new Set(frames.map((f) => f.envelope))];
  ok('korean 站台的信封全程同一個顏色',
     frames.length > 0 && colors.length === 1,
     colors.join(' → ') || '沒有錄到信封');

  /* 同時確認它真的是 korean 的色票，而不是「一路都錯」 */
  const page = await newPage();
  await page.goto(`${BASE}/w/${KOREAN}/letter`, { waitUntil:'domcontentloaded' });
  const soft = await page.evaluate(() =>
    getComputedStyle(document.body).getPropertyValue('--primary-soft').trim());
  await page.close();
  ok('而且是 korean 的 --primary-soft（不是 Classic 的香檳金）',
     soft.toLowerCase() === '#eaeff3', soft);
}

/* ============================================================
   4. 保底層：沒預產到的頁面，換色必須發生在遮罩底下
   ------------------------------------------------------------
   建置漏掉、新頁面還沒進 SHARE_PAGES、build-og 讀不到 Firestore ——
   這些情況下 /w/{slug}/xxx 會落回共用的 HTML，
   而共用 HTML 的 <body> 寫死 classic，換色必然會發生。
   遮罩的工作就是讓賓客看不到那一下。

   測法：直接把某一頁的預產檔刪掉，製造出「沒預產到」的狀態。
   這比找一個剛好沒被產到的頁面可靠 —— 那種頁面多半是被關掉的，
   會被導回大廳，根本走不到我們要驗的那條路。
============================================================ */
console.log('\n【④ 保底層：沒預產到的頁面由遮罩擋住換色】');
{
  /* 先確認預產頁本身不會被遮罩擋住 */
  const page = await newPage();
  await page.goto(`${BASE}/w/${KOREAN}/letter`, { waitUntil:'domcontentloaded' });
  const display = await page.evaluate(() => {
    const el = document.querySelector('.boot-veil');
    return el ? getComputedStyle(el).display : '(沒有遮罩元素)';
  });
  await page.close();
  ok('預產頁的遮罩是 display:none（不擋住已經正確的內容）',
     display === 'none', display);
}
{
  /* 刪掉一頁的預產檔 → 這個網址會落回 /w/*\/draw 的 rewrite，
     命中共用的 public/draw.html（<body> 寫死 classic）。

     挑 draw 是因為它沒有被其他檢查用到 —— 這一段會把檔案刪掉，
     後面 ⑦ 若剛好要讀同一個檔就會讀到 null，變成假的失敗。 */
  const victim = new URL(`../public/w/${KOREAN}/draw.html`, import.meta.url);
  const hadFile = existsSync(victim);
  if(hadFile) rmSync(victim);

  const frames = await record(`/w/${KOREAN}/draw`);
  const templates = [...new Set(frames.map((f) => f.template))];

  ok('沒預產到的頁面確實會換色（證明這條路徑真的需要保底）',
     templates.length > 1 && templates[0] === 'classic',
     templates.join(' → '));

  /* 核心斷言：每一格 classic（＝還沒換好）都必須被遮罩蓋著 */
  const exposed = frames.filter((f) => f.template !== 'korean' && !f.veiled);
  ok('換色的每一格都在遮罩底下，賓客看不到',
     exposed.length === 0,
     exposed.length ? `有 ${exposed.length} 格露出來了` : `${frames.length} 格全程遮住`);

  /* 遮罩一定要收得掉 —— 收不掉比閃爍更糟 */
  const last = frames[frames.length - 1];
  ok('資料到齊之後遮罩收掉了', !!last && !last.veiled && last.template === 'korean',
     last ? `veiled=${last.veiled} template=${last.template}` : '沒有錄到');

  if(hadFile) console.log(`     （已刪除 ${KOREAN}/draw.html 製造測試情境，下次 build-og 會重新產出）`);
}

/* ============================================================
   5. 骨架：ready 之前示意還在跑，ready 之後乾乾淨淨
============================================================ */
console.log('\n【⑤ 骨架：ready 之後不能留下任何一塊】');
{
  const page = await newPage();
  await page.goto(`${BASE}/w/${KOREAN}/`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(
    () => document.documentElement.dataset.siteReady === '1',
    null, { timeout: 15000 },
  ).catch(() => {});
  const leftover = await page.evaluate(() =>
    [...document.querySelectorAll('[data-sk]')]
      .filter((el) => getComputedStyle(el).color === 'rgba(0, 0, 0, 0)')
      .map((el) => el.id || el.className));
  ok('ready 之後沒有殘留的骨架', leftover.length === 0, leftover.join('、') || '乾淨');

  /* 骨架掛的位置必須是「頁面 JS 會同步填好」的區塊，
     不然骨架會比資料早收，反而先變成空的 */
  const filled = await page.evaluate(() =>
    [...document.querySelectorAll('[data-sk]')]
      .map((el) => ({ id: el.id, empty: !el.textContent.trim() && !el.children.length })));
  const stillEmpty = filled.filter((f) => f.empty).map((f) => f.id);
  ok('掛骨架的區塊在 ready 當下都已經有內容',
     stillEmpty.length === 0, stillEmpty.join('、') || '全部填好了');
  await page.close();
}

/* ============================================================
   6. 載入順序的宣告，要跟實際會發生的請求一致
   ------------------------------------------------------------
   <link rel="modulepreload"> 的網址必須跟 site-context.js 真正 import
   的那個字串**完全相同**，差一個版號就不是預載而是多下載一份：
   瀏覽器會抓兩次，關鍵路徑反而變長，而且不會有任何錯誤訊息。
   這一條就是為了在版號漂掉的當下就叫出來。

   同理，preload 的頁面 JS 檔名要對得上 site-context.js 的 pageScript
   對照表 —— 對不上的話預載的是一支根本不會被執行的檔案。
============================================================ */
console.log('\n【⑥ 載入順序：預載的網址要跟實際 import 的一致】');
{
  const ctx = readFileSync(new URL('../public/js/site-context.js', import.meta.url), 'utf8');
  const imported = [...ctx.matchAll(/from\s+"(https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+)"/g)]
    .map((m) => m[1]);
  ok('site-context.js 確實 import 了三支 Firebase SDK',
     imported.length === 3, `${imported.length} 支`);

  /* pageScript 對照表：開關代號 → 檔名 */
  const PAGE_JS = { lobby:'index', rsvp:'invitation' };

  const pages = ['index','invitation','letter','wall','cake','draw',
                 'exhibition','quiz','seating','lobby-korean','lobby-forest'];
  const missing = [];
  const wrongJs = [];
  for(const name of pages){
    const html = readFileSync(new URL(`../public/${name}.html`, import.meta.url), 'utf8');
    for(const url of imported){
      if(!html.includes(`<link rel="modulepreload" href="${url}" crossorigin>`)){
        missing.push(`${name}.html ← ${url.split('/').pop()}`);
      }
    }
    const pageKey = html.match(/<body[^>]*data-page="(\w+)"/)?.[1];
    const js = PAGE_JS[pageKey] || pageKey;
    if(!html.includes(`<link rel="preload" as="script" href="/js/${js}.js">`)){
      wrongJs.push(`${name}.html（data-page="${pageKey}" → 應預載 /js/${js}.js）`);
    }
  }
  ok('每一頁的 modulepreload 網址都跟 import 的版號一致',
     missing.length === 0, missing.slice(0, 4).join('、') || `${pages.length} 頁都對得上`);
  ok('每一頁預載的頁面 JS 檔名都對得上 pageScript',
     wrongJs.length === 0, wrongJs.join('、') || `${pages.length} 頁都對得上`);
}

/* ============================================================
   7. 首屏只載真的用得到的東西
   ------------------------------------------------------------
   ▸ lobby-*.css 只有大廳要
     那 10KB 全部收在 .k-* ／ .f-* 大廳容器底下，對子頁一條規則都不生效。
     但它是被印進 <head> 的 <link rel="stylesheet">，會擋住首次繪製 ——
     等於「給你的信」為了一份用不到的樣式多等一個來回。
   ▸ 大廳的首屏大圖要先宣告
     不然它排在「載 SDK → 讀 Firestore → 載 index.js」之後才開始下載。
============================================================ */
console.log('\n【⑦ 首屏只載真的用得到的東西】');
{
  const read = (slug, file) => {
    const u = new URL(`../public/w/${slug}/${file}`, import.meta.url);
    return existsSync(u) ? readFileSync(u, 'utf8') : null;
  };

  const lobby = read(KOREAN, 'index.html');
  ok('korean 的大廳有載 lobby-korean.css',
     !!lobby && lobby.includes('/css/lobby-korean.css'));

  const leaked = ['letter','wall','quiz','seating']
    .filter((f) => (read(KOREAN, `${f}.html`) || '').includes('/css/lobby-korean.css'));
  ok('korean 的子頁都沒有載 lobby-korean.css',
     leaked.length === 0, leaked.join('、') || '4 頁都乾淨');

  /* 字體是整個版型的，子頁仍然要有 —— 別把版面 CSS 和字體一起收掉了 */
  const noFont = ['letter','wall','quiz','seating']
    .filter((f) => {
      const html = read(KOREAN, `${f}.html`);
      return html === null ? `${f}（檔案不存在）` : !html.includes('Cormorant+Garamond');
    });
  ok('但版型字體仍然每一頁都載（字體是整個版型的，不是大廳的）',
     noFont.length === 0, noFont.join('、') || '4 頁都有');

  /* 有素材的站台，大廳要先宣告首屏大圖 */
  const assetLobby = read('ginny-one-20260919', 'index.html');
  const m = assetLobby && assetLobby.match(
    /<link rel="preload" as="image" href="(\/assets\/[^"]+)" fetchpriority="high">/);
  ok('有素材的站台，大廳先宣告了首屏大圖', !!m, m ? m[1] : '沒有找到 preload as="image"');

  /* 挑的那一張要跟 index.js 的 applyLobbyBackground() 一致（lobby 優先於 cover） */
  ok('預載的是 manifest 的 lobby（不是 cover）',
     !!m && m[1].includes('/lobby.'), m ? m[1] : '—');

  /* 沒有素材的站台不該憑空印一行 preload */
  ok('沒有素材的站台不會印出空的 preload',
     !!lobby && !lobby.includes('as="image"'));
}

await browser.close();

console.log(`\n${failures ? `❌ ${failures} 項未通過` : '✅ 全部通過'}`);
process.exit(failures ? 1 : 0);
