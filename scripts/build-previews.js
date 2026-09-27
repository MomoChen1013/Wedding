/* ============================================================
   build-previews.js — 從正式的大廳骨架產出 preview/ 底下的示範頁
   ------------------------------------------------------------
     node scripts/build-previews.js

   產出（⚙️ 不要手改，改來源再重跑）：
     preview/tapestry.html   ← public/lobby-tapestry.html
     preview/scene.html      ← public/lobby-scene.html（七個場景版型共用）

   為什麼用產的而不是手寫一份：示範頁要跟賓客看到的一模一樣，
   手抄一份骨架，改了正式版就會忘記改示範頁。這裡只做「讓它不起
   Firebase 也能打開」必要的那幾件事：
     ・/css/… 換成 ../public/css/…，拿掉 Firebase 的預載與 site-context.js
     ・掛上所有開場的 css／js（示範頁可以切換開場）
     ・掛上這一份骨架用得到的每一個版型的字體（示範頁可以切換版型）
     ・把版型清單（名字、預設開場）從 wed-model.js 烤進去 ——
       file:// 打開的頁面不能 import module，所以在這裡先讀好
     ・資料由 demo-data.js ＋ lobby-demo.js 填
============================================================ */
import { readFileSync, writeFileSync } from 'node:fs';
import { TEMPLATES, OPENINGS } from '../public/js/wed-model.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const PAGES = [
  { src: 'public/lobby-tapestry.html', out: 'preview/tapestry.html', lobby: 'tapestry', title: 'Tapestry' },
  { src: 'public/lobby-scene.html', out: 'preview/scene.html', lobby: 'scene', title: '場景版型' },
];

const esc = (s) => String(s).replace(/&/g, '&amp;');

for (const page of PAGES) {
  /* 這一副骨架給哪幾個版型用 */
  const templates = Object.entries(TEMPLATES)
    .filter(([key, t]) => (t.lobbyKey || key) === page.lobby);
  const fonts = [...new Set(templates.flatMap(([, t]) => t.fonts || []))];
  const cfg = {
    templates: Object.fromEntries(templates.map(([k, t]) => [k, { label: t.label, opening: t.opening || null }])),
    openings: Object.fromEntries(Object.entries(OPENINGS).map(([k, o]) => [k, o.label])),
  };
  const openerCss = Object.keys(OPENINGS).map((k) => `<link rel="stylesheet" href="../public/css/openers/${k}.css">`).join('\n');
  const openerJs = Object.keys(OPENINGS).map((k) => `<script src="../public/js/openers/${k}.js"></script>`).join('\n');

  let html = read(page.src)
    .replace('<html lang="zh-Hant">', '<html lang="zh-Hant" data-prerendered="1">')
    .replace(/<title>[^<]*<\/title>/, `<title>${page.title}｜大廳模板示範</title>`)
    .replace(/<!-- 社群預覽文案[\s\S]*?-->\n/,
      `<!-- ⚙️ 由 scripts/build-previews.js 從 ${page.src} 產出，不要手改。\n` +
      `     骨架一模一樣，差別只在資料由 demo-data.js ＋ lobby-demo.js 填（正式版是 js/index.js）。 -->\n`)
    .replace(/<meta (name="description"|property="og:[^"]*")[^>]*>\n/g, '')
    .replace(/<link rel="(icon|apple-touch-icon|modulepreload|preload)"[^>]*>\n/g, '')
    .replace(/<link rel="preconnect" href="https:\/\/(www\.gstatic|firestore)[^>]*>\n/g, '')
    .replace(/<!-- 載入順序的說明[\s\S]*?-->\n/, '')
    .replace(/href="\/css\//g, 'href="../public/css/')
    .replace(/<body data-template="[^"]*"/, `<body data-template="${templates[0][0]}" data-hero-name="en" class="nav-off"`)
    .replace('</head>', `${fonts.map((f) => `<link href="${esc(f)}" rel="stylesheet">`).join('\n')}\n` +
      `${openerCss}\n<link rel="stylesheet" href="demo-panel.css">\n</head>`)
    .replace(/<!-- 站台載入器[\s\S]*?<\/script>/,
      `<script src="demo-data.js"></script>\n` +
      `<script>window.DEMO_CFG = ${JSON.stringify(cfg)};</script>\n` +
      `<script src="../public/js/lobby-motion.js"></script>\n${openerJs}\n` +
      `<script src="lobby-demo.js"></script>`);

  if (html.includes('src="/js/site-context.js"')) throw new Error(`${page.src}：沒有換掉 site-context.js`);
  writeFileSync(new URL(page.out, root), html);
  console.log(`✅ ${page.out}（${templates.map(([k]) => k).join('、')}）`);
}
