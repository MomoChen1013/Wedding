/* ============================================================
   build-previews.js — 從正式的大廳骨架產出示範頁
   ------------------------------------------------------------
     node scripts/build-previews.js

   產出兩套（⚙️ 不要手改，改來源再重跑）：

   ① preview/{name}.html —— 內部看的，不部署，直接用瀏覽器打開
       preview/tapestry.html          ← public/lobby-tapestry.html
       preview/white-church.html      ← public/lobby-chapel.html
       preview/forest-botanical.html  ← public/lobby-forest.html
       ……（classic 與 korean 的示範頁是手寫的，不產）
       資料是 preview/demo-data.js

   ② public/samples/{name}.html ＋ public/samples/index.html —— 給客人挑版型的（/samples）
       每一副大廳骨架一頁（classic 四種配色共用一頁，面板上可以換配色），
       加上一頁總覽。卡片文案在 scripts/sample-catalog.js，
       縮圖由 scripts/build-sample-thumbs.js 截圖產生（public/samples/thumbs/）。
       資料是 public/samples/sample-data.js（虛構的新人、Unsplash 的照片）

   清單從 TEMPLATES 的 lobbyFile 算出來：幾個版型共用一副骨架時只產一頁，
   名字是那副骨架的 lobbyKey；沒有 lobbyFile 的（classic 系列）用 index.html。

   為什麼用產的而不是手寫一份：示範頁要跟賓客看到的一模一樣，
   手抄一份骨架，改了正式版就會忘記改示範頁。這裡只做「讓它不起
   Firebase 也能打開」必要的那幾件事：
     ・拿掉 Firebase 的預載與 site-context.js（preview 另外把 /css/… 換成 ../public/css/…）
     ・掛上所有開場的 css／js（示範頁可以切換開場）
     ・掛上這一份骨架用得到的每一個版型的字體（示範頁可以切換版型）
     ・把版型清單（名字、預設開場）從 wed-model.js 烤進去 ——
       file:// 打開的頁面不能 import module，所以在這裡先讀好
     ・資料由 demo-data.js／sample-data.js ＋ public/samples/demo.js 填
============================================================ */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { TEMPLATES, OPENINGS } from '../public/js/wed-model.js';
import { SAMPLE_CATALOG } from './sample-catalog.js';
import { resolveBaseUrl } from './site-url.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* 每一副大廳骨架（共用骨架的只算一次） */
const SKELETONS = [...new Map(Object.entries(TEMPLATES).map(([key, t]) => {
  const lobby = t.lobbyFile ? (t.lobbyKey || key) : 'classic';
  return [lobby, { lobby, src: `public/${t.lobbyFile || 'index.html'}` }];
})).values()].map((s) => ({
  ...s,
  /* 這一副骨架給哪幾個版型用 */
  templates: Object.entries(TEMPLATES)
    .filter(([key, t]) => (t.lobbyFile ? (t.lobbyKey || key) : 'classic') === s.lobby),
}));

/* ---------- 一頁示範 ---------- */
function render(sk, mode) {
  const sample = mode === 'sample';
  const P = sample ? '' : '../public';               /* 正式站的根目錄在哪 */
  const info = sample ? SAMPLE_CATALOG[sk.lobby] : null;
  const fonts = [...new Set(sk.templates.flatMap(([, t]) => t.fonts || []))];
  const cfg = {
    templates: Object.fromEntries(sk.templates.map(([k, t]) => [k, { label: t.label, opening: t.opening || null }])),
    openings: Object.fromEntries(Object.entries(OPENINGS).map(([k, o]) => [k, o.label])),
  };
  if (sample) {
    cfg.sample = {
      back: '/samples/',
      pageNote: '示範只放了首頁。出席回覆、祝福牆等其他頁面，會套用同樣的顏色與字體。',
      /* classic 的面板寫「配色」，選項只要顏色的名字 */
      colorLabels: Object.fromEntries(sk.templates.map(([k, t]) => [k, t.label.replace(/^Classic\s*/, '')])),
    };
  }
  const openerCss = Object.keys(OPENINGS).map((k) => `<link rel="stylesheet" href="${P}/css/openers/${k}.css">`).join('\n');
  const openerJs = Object.keys(OPENINGS).map((k) => `<script src="${P}/js/openers/${k}.js"></script>`).join('\n');
  const title = sample
    ? `${info.name[0]} ${info.name[1]}｜婚禮網站版型`
    : `${sk.lobby === 'scene' ? '場景版型' : sk.templates[0][1].label.split(' ')[0]}｜大廳模板示範`;
  const og = sample ? [
    `<meta name="description" content="${esc(info.mood)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(info.mood)}">`,
    `<meta property="og:image" content="${esc(`${resolveBaseUrl()}/samples/thumbs/${sk.lobby}.jpg`)}">`,
  ].join('\n') + '\n' : '';

  let html = read(sk.src)
    .replace('<html lang="zh-Hant">', '<html lang="zh-Hant" data-prerendered="1">')
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<!-- 社群預覽文案[\s\S]*?-->\n/,
      `<!-- ⚙️ 由 scripts/build-previews.js 從 ${sk.src} 產出，不要手改。\n` +
      `     骨架一模一樣，差別只在資料由 ${sample ? 'samples/sample-data.js' : 'demo-data.js'} ＋ samples/demo.js 填（正式版是 js/index.js）。 -->\n`)
    .replace(/<meta (name="description"|property="og:[^"]*"|name="twitter:[^"]*")[^>]*>\n/g, '')
    .replace(sample ? /<link rel="(modulepreload|preload)"[^>]*>\n/g : /<link rel="(icon|apple-touch-icon|modulepreload|preload)"[^>]*>\n/g, '')
    .replace(/<link rel="preconnect" href="https:\/\/(www\.gstatic|firestore)[^>]*>\n/g, '')
    .replace(/<!-- 載入順序的說明[\s\S]*?-->\n/, '')
    .replace(/href="\/css\//g, `href="${P}/css/`)
    .replace(/<body data-template="[^"]*"/, `<body data-template="${sk.templates[0][0]}" data-hero-name="en" class="nav-off"`)
    .replace('</head>', `${og}${fonts.map((f) => `<link href="${esc(f)}" rel="stylesheet">`).join('\n')}\n` +
      `${openerCss}\n<link rel="stylesheet" href="${P}/samples/demo-panel.css">\n</head>`)
    .replace(/<!-- 站台載入器[\s\S]*?<\/script>/,
      `<script src="${sample ? '/samples/sample-data.js' : 'demo-data.js'}"></script>\n` +
      `<script>window.DEMO_CFG = ${JSON.stringify(cfg)};</script>\n` +
      `<script src="${P}/js/lobby-motion.js"></script>\n${openerJs}\n` +
      `<script src="${P}/samples/demo.js"></script>`);

  if (html.includes('src="/js/site-context.js"')) throw new Error(`${sk.src}：沒有換掉 site-context.js`);
  return html;
}

/* ---------- ① preview/ ---------- */
for (const sk of SKELETONS) {
  /* classic 與 korean 的示範頁是手寫的（preview/classic.html、preview/korean-modern.html），不動它 */
  if (sk.lobby === 'classic' || sk.lobby === 'korean') continue;
  /* forest 的示範頁沿用原本的檔名 */
  const out = `preview/${sk.lobby === 'forest' ? 'forest-botanical' : sk.lobby}.html`;
  writeFileSync(new URL(out, root), render(sk, 'preview'));
  console.log(`✅ ${out}（${sk.templates.map(([k]) => k).join('、')}）`);
}

/* ---------- ② public/samples/ ---------- */
const keys = SKELETONS.map((s) => s.lobby);
const missing = keys.filter((k) => !SAMPLE_CATALOG[k]);
const stale = Object.keys(SAMPLE_CATALOG).filter((k) => !keys.includes(k));
if (missing.length) throw new Error(`scripts/sample-catalog.js 少了：${missing.join('、')}`);
if (stale.length) throw new Error(`scripts/sample-catalog.js 多了已經不存在的骨架：${stale.join('、')}`);

for (const sk of SKELETONS) {
  const out = `public/samples/${sk.lobby}.html`;
  writeFileSync(new URL(out, root), render(sk, 'sample'));
  console.log(`✅ ${out}`);
}

/* 總覽：照 SAMPLE_CATALOG 的順序 */
const cards = Object.entries(SAMPLE_CATALOG).map(([key, c]) => {
  const thumb = `public/samples/thumbs/${key}.jpg`;
  const img = existsSync(new URL(thumb, root))
    ? `<img src="/samples/thumbs/${key}.jpg" alt="${esc(c.name[1])}版型的首頁" loading="lazy" width="390" height="760">`
    : '';
  return `
    <a class="card" href="/samples/${key}">
      <div class="shot" style="background:${esc(c.colors[0])}">${img}</div>
      <div class="body">
        <h2><span class="en">${esc(c.name[0])}</span><span class="cn">${esc(c.name[1])}</span></h2>
        <p class="mood">${esc(c.mood)}</p>
        <div class="dress"><span class="lab">適合的婚紗</span>${c.dress.map((d) => `<span class="chip">${esc(d)}</span>`).join('')}</div>
        <div class="foot">
          <span class="swatches" aria-hidden="true">${c.colors.map((col) => `<i style="background:${esc(col)}"></i>`).join('')}</span>
          <span class="go">看示範 →</span>
        </div>
      </div>
    </a>`;
}).join('');

const firstThumb = `${resolveBaseUrl()}/samples/thumbs/${Object.keys(SAMPLE_CATALOG)[0]}.jpg`;
const index = read('scripts/sample-index.html')
  .replace('<!--CARDS-->', cards)
  .replace(/\{\{COUNT\}\}/g, String(keys.length))
  .replace('{{OG_IMAGE}}', esc(firstThumb));
writeFileSync(new URL('public/samples/index.html', root), index);
console.log('✅ public/samples/index.html');
