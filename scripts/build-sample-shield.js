/* ============================================================
   build-sample-shield.js — 示範網站（/samples/{版型}/…）專用的「保護過的副本」
   ------------------------------------------------------------
     node scripts/build-sample-shield.js
     npm run build-sample-shield        （firebase.json 的 predeploy 也會跑）

   先講清楚：前端程式碼只要瀏覽器執行得了，就一定看得到。這一支做的是提高抄的成本，
   不是讓人看不到。

   為什麼是副本：示範網站和正式婚禮網站用的是同一套 HTML／JS／CSS／圖檔。
   直接壓縮、混淆那一套會連正式網站一起改到，所以這裡把示範網站用得到的檔案
   另外複製一份到 public/samples/_r/，正式網站的檔案一個位元組都不動：

     JS     terser 壓縮＋變數名混淆；開場（js/openers/*）與 lobby-motion.js 另外用
            javascript-obfuscator 輕度混淆（只做字串陣列與識別字改名，不做控制流程攤平、
            不插假程式碼 —— 那些會讓動畫掉幀）
     CSS    csso 壓縮（不重排規則），註解拿掉
     HTML   html-minifier-terser：註解拿掉、空白收掉
     圖檔   public/img/ 底下全部複製成雜湊檔名，看不出是什麼
     檔名   一律是內容雜湊，看不出原本是哪一支；不輸出 source map

   產出（都不進版控，見 .gitignore）：
     public/samples/_r/{雜湊}.{js,css,html,webp…}
     public/samples/{版型}/index.html、{頁面}.html
       ← Firebase Hosting 的實體檔案優先於 rewrite，示範網站就改讀這一份；
         沒跑過這支的時候，/samples/{版型}/ 照舊走 rewrite 讀原始檔，網站一樣能用

   執行期的路徑對照：
     site-context.js 用字串組出要載的檔案（/js/openers/${…}.js、/css/…），沒辦法在建置時直接改寫，
     所以副本裡多一個 __p(路徑)：用路徑的 FNV 雜湊查表換成 /samples/_r/ 的檔名。
     表裡只有「雜湊 → 雜湊」，看不出原本的檔名。開場在執行期組出來的圖檔網址也走同一張表（window.__h）。

   開場的 JS 有幾個地方是在執行期組圖檔網址的（IMG + 檔名），這裡逐一改寫成 __h(…)；
   改寫完會檢查沒有漏網的，漏了就直接報錯 —— 之後改了開場的寫法，建置會先擋下來，不會默默壞掉。
============================================================ */
import { readFile, writeFile, mkdir, rm, readdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, extname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify as terser } from 'terser';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { minify as csso } from 'csso';
import { minify as htmlMinify } from 'html-minifier-terser';
import { SAMPLE_CATALOG } from './sample-catalog.js';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const OUT_DIR = join(PUBLIC, 'samples/_r');
const OUT_URL = '/samples/_r/';

/* 示範網站會用到的頁面（firebase.json 的 /samples rewrite 指到的那幾份） */
const SUBPAGES = ['invitation', 'wall', 'cake', 'draw', 'exhibition', 'quiz', 'seating', 'letter'];
/* 後台、收禮小幫手這些示範網站不會載的檔案，不必複製 */
const SKIP = new Set([
  '/js/admin.js', '/js/butler.js', '/js/butler-key.js', '/js/seating-plan.js', '/js/xlsx-lite.js',
  '/js/cropper.js', '/js/ad-tabmarker.js', '/css/admin.css', '/css/butler.css',
]);
/* 額外再混淆一層的核心動畫 */
const OBFUSCATE = (p) => p.startsWith('/js/openers/') || p === '/js/lobby-motion.js';
/* ES module（用 import／export 的）；其他都是一般 <script> */
const MODULES = new Set(['/js/site-context.js', '/js/wed-model.js', '/js/demo-firebase.js',
  '/samples/sample-site.js', '/samples/demo-extras.js', '/samples/analytics.js', '/samples/config.js']);

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
/* 和執行期的 __f() 一模一樣的 FNV-1a */
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}
const webPath = (abs) => '/' + relative(PUBLIC, abs).split('\\').join('/');

/* ---------- 1. 要複製哪些檔案，各自的新檔名 ---------- */
const files = [];   /* { src, path, kind } */
for (const abs of await walk(join(PUBLIC, 'js'))) if (abs.endsWith('.js')) files.push({ src: abs, kind: 'js' });
for (const abs of await walk(join(PUBLIC, 'css'))) if (abs.endsWith('.css')) files.push({ src: abs, kind: 'css' });
for (const abs of await walk(join(PUBLIC, 'img'))) if (/\.(webp|png|jpe?g|svg|gif|avif)$/i.test(abs)) files.push({ src: abs, kind: 'img' });
for (const name of await readdir(PUBLIC)) if (/^lobby-.+\.html$/.test(name)) files.push({ src: join(PUBLIC, name), kind: 'lobby' });
for (const p of MODULES) if (p.startsWith('/samples/')) files.push({ src: join(PUBLIC, p.slice(1)), kind: 'js' });

const map = new Map();          /* 原本的網址 → 新網址 */
for (const f of files) {
  f.path = webPath(f.src);
  if (SKIP.has(f.path)) { f.skip = true; continue; }
  const raw = await readFile(f.src);
  const ext = f.kind === 'lobby' ? '.html' : extname(f.src).toLowerCase();
  f.out = `${OUT_URL}${sha(f.path + ':' + sha(raw)).slice(0, 12)}${ext}`;
  map.set(f.path, f.out);
}

/* 執行期查表：FNV(原本的路徑) → 新檔名；撞號就報錯 */
const table = {};
for (const [p, out] of map) {
  const k = fnv(p);
  if (table[k]) throw new Error(`路徑雜湊撞號：${p}`);
  table[k] = out.slice(OUT_URL.length);
}
const RESOLVER = `const __M=${JSON.stringify(table)};` +
  `function __f(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h.toString(36);}` +
  `function __p(u){try{const x=new URL(u,location.href);if(x.origin!==location.origin)return u;const k=__M[__f(x.pathname)];return k?${JSON.stringify(OUT_URL)}+k:u;}catch(e){return u;}}` +
  `window.__h=__p;\n`;

/* ---------- 2. 改寫各種檔案裡的路徑 ---------- */
const resolveFrom = (fromPath, ref) => {
  if (/^(data:|https?:|\/\/|#|blob:)/i.test(ref)) return null;
  const clean = ref.split(/[?#]/)[0];
  return clean.startsWith('/') ? posix.normalize(clean) : posix.normalize(posix.join(posix.dirname(fromPath), clean));
};
const mapped = (fromPath, ref) => {
  const p = resolveFrom(fromPath, ref);
  return p && map.get(p);
};

function rewriteCss(path, css) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, ref) => {
    const to = mapped(path, ref.trim());
    return to ? `url(${q}${to}${q})` : m;
  });
}
function rewriteHtml(path, html) {
  html = html.replace(/(\s(?:src|href|poster|data-src)=)(["'])([^"']+)\2/g, (m, a, q, ref) => {
    const to = mapped(path, ref);
    return to ? `${a}${q}${to}${q}` : m;
  });
  /* style="…url(…)…"、內嵌的 <style> */
  return html.replace(/url\(\s*(&quot;|['"]?)([^'")&]+)\1\s*\)/g, (m, q, ref) => {
    const to = mapped(path, ref.trim());
    return to ? `url(${q}${to}${q})` : m;
  });
}
/* import … from '…'、import('…')：寫死的路徑直接換成新檔名 */
function rewriteImports(path, js) {
  return js
    .replace(/(\bfrom\s*)(['"])([^'"]+)\2/g, (m, a, q, ref) => { const to = mapped(path, ref); return to ? `${a}${q}${to}${q}` : m; })
    .replace(/(\bimport\(\s*)(['"])([^'"]+)\2(\s*\))/g, (m, a, q, ref, b) => { const to = mapped(path, ref); return to ? `${a}${q}${to}${q}${b}` : m; });
}

/* 一處一處改，每一處都要真的改到（次數對不上就報錯） */
function patch(path, src, edits) {
  for (const [from, to, times = 1] of edits) {
    const n = typeof from === 'string' ? src.split(from).length - 1 : (src.match(from) || []).length;
    if (n !== times) throw new Error(`${path}：預期改到 ${times} 處「${from}」，實際 ${n} 處 —— 原始檔改過了，請更新 scripts/build-sample-shield.js`);
    src = src.replace(typeof from === 'string' ? new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') : from, to);
  }
  return src;
}

/* site-context.js：所有在執行期組出來的路徑都經過 __p() */
function patchSiteContext(js) {
  js = patch('/js/site-context.js', js, [
    /* 版型的字體與版面 CSS、敘事模組的 CSS、開場的 CSS：三個地方各自插 <link> */
    ['link.href = href;', 'link.href = __p(href);', 3],
    ['link[href="${href}"]', 'link[href="${__p(href)}"]', 3],
    ['s.src = src;', 's.src = __p(src);'],
    ['fetch(`/${file}`)', 'fetch(__p(`/${file}`))'],
  ]);
  return RESOLVER + js;
}

/* 開場：圖檔的根目錄寫死成原本的網址（副本的 script 網址已經不是 js/openers/xxx.js，推不回去），
   用到圖檔的地方一律包一層 __h()，換成雜湊檔名 */
function patchOpener(path, js) {
  js = js
    .replace(/new URL\('\.\.\/\.\.\/(img\/[^']+)', document\.currentScript\.src\)\.href/g, "'/$1'")
    .replace(/SCRIPT \? SCRIPT\.replace\([^\n]*?, '(img\/[^']*)'\) : '\/img\/[^']*'/g, "'/$1'")
    .replace(/const SCRIPT = document\.currentScript && document\.currentScript\.src;/g, '')
    /* `${IMG}xxx.webp`、`${IMG}balloon-${b.color}.webp` */
    .replace(/\$\{(IMG|ROOT)\}((?:\$\{[^}]*\}|[^`"'()\s$\\])*?\.(?:webp|png|jpe?g|svg))/g, '${__h(`${$1}$2`)}')
    /* `${art.dir}${a.img}`、`${ROOT}${art.seal}` */
    .replace(/\$\{(art\.dir|ROOT)\}\$\{([\w.]+)\}/g, '${__h($1+$2)}')
    /* IMG + scene.src、art.dir + art.plumes[…] */
    .replace(/\b(IMG|art\.dir) \+ ([\w.]+(?:\[[^\]]+\])?)(?=;|\))/g, '__h($1 + $2)');
  const left = js.match(/(?<!__h\(`?)\$\{(?:IMG|ROOT|art\.dir)\}|(?<!__h\()\b(?:IMG|art\.dir) \+|document\.currentScript/g);
  if (left) throw new Error(`${path}：還有沒換到的圖檔路徑（${left.join('、')}）—— 請更新 scripts/build-sample-shield.js 的 patchOpener()`);
  return js;
}

/* 每次都給一份新的設定：terser 會改寫傳進去的 compress／mangle 物件（module:true 時順手打開 toplevel），
   共用同一份的話，後面的一般 <script> 會被當成 module，沒被引用的全域常數整個被刪掉 */
const terserOptions = (module) => ({
  module, compress: { passes: 2 }, mangle: true, format: { comments: false }, sourceMap: false,
});
const OBF = {
  compact: true, sourceMap: false, target: 'browser',
  identifierNamesGenerator: 'hexadecimal', renameGlobals: false,
  stringArray: true, stringArrayEncoding: ['base64'], stringArrayThreshold: 0.75,
  stringArrayRotate: true, stringArrayShuffle: true,
  controlFlowFlattening: false, deadCodeInjection: false,
  selfDefending: false, debugProtection: false, disableConsoleOutput: false,
  transformObjectKeys: false, unicodeEscapeSequence: false, numbersToExpressions: false, splitStrings: false,
};
const HTML_MIN = {
  removeComments: true, collapseWhitespace: true, conservativeCollapse: true,
  minifyCSS: true, minifyJS: true, keepClosingSlash: true, decodeEntities: false,
};

/* ---------- 3. 寫出副本 ---------- */
await rm(OUT_DIR, { recursive: true, force: true });
for (const key of Object.keys(SAMPLE_CATALOG)) await rm(join(PUBLIC, 'samples', key), { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

const report = { js: [0, 0], css: [0, 0], html: [0, 0], img: 0 };
for (const f of files) {
  if (f.skip) continue;
  const dest = join(PUBLIC, f.out.slice(1));
  if (f.kind === 'img') { await copyFile(f.src, dest); report.img++; continue; }
  let text = await readFile(f.src, 'utf8');
  const before = Buffer.byteLength(text);
  if (f.kind === 'css') {
    text = csso(rewriteCss(f.path, text), { restructure: false, comments: false }).css;
    report.css[0] += before; report.css[1] += Buffer.byteLength(text);
  } else if (f.kind === 'lobby') {
    text = await htmlMinify(rewriteHtml(f.path, text), HTML_MIN);
    report.html[0] += before; report.html[1] += Buffer.byteLength(text);
  } else {
    if (f.path === '/js/site-context.js') text = patchSiteContext(text);
    if (f.path.startsWith('/js/openers/')) text = patchOpener(f.path, text);
    text = rewriteImports(f.path, text);
    const out = await terser(text, terserOptions(MODULES.has(f.path)));
    text = out.code;
    if (OBFUSCATE(f.path)) text = JavaScriptObfuscator.obfuscate(text, OBF).getObfuscatedCode();
    report.js[0] += before; report.js[1] += Buffer.byteLength(text);
  }
  await writeFile(dest, text);
}

/* 每個版型的頁面：/samples/{版型}/ 與 /samples/{版型}/{頁面} */
for (const page of ['index', ...SUBPAGES]) {
  const path = `/${page}.html`;
  const src = await readFile(join(PUBLIC, path.slice(1)), 'utf8');
  const html = await htmlMinify(rewriteHtml(path, src), HTML_MIN);
  report.html[0] += Buffer.byteLength(src); report.html[1] += Buffer.byteLength(html);
  for (const key of Object.keys(SAMPLE_CATALOG)) {
    const dir = join(PUBLIC, 'samples', key);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${page}.html`), html);
  }
}

const kb = (n) => `${(n / 1024).toFixed(0)}KB`;
console.log(`✅ public/samples/_r/：JS ${kb(report.js[0])} → ${kb(report.js[1])}、CSS ${kb(report.css[0])} → ${kb(report.css[1])}、` +
  `HTML ${kb(report.html[0])} → ${kb(report.html[1])}、圖檔 ${report.img} 個改成雜湊檔名`);
console.log(`✅ public/samples/{版型}/：${Object.keys(SAMPLE_CATALOG).length} 個版型 × ${1 + SUBPAGES.length} 頁`);
if (!existsSync(join(PUBLIC, 'samples/_r'))) process.exitCode = 1;
