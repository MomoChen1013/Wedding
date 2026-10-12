/* ============================================================
   build-samples.js — 版型展示頁的總覽（public/samples/index.html）
   ------------------------------------------------------------
     node scripts/build-samples.js

   每個版型一張卡片，點進去是 /samples/{版型}/ —— 那是正式網站同一套頁面
   跑在示範模式（js/site-context.js 的 DEMO），這支只負責產出總覽。

     卡片文案   scripts/sample-catalog.js
     頁面模板   scripts/sample-index.html
     縮圖       public/samples/thumbs/{版型}.jpg（scripts/build-sample-thumbs.js 截的）

   Classic 四種配色共用一張卡片（示範頁左下角可以換配色），
   其他版型在 sample-catalog.js 沒寫到的，這裡直接報錯。
============================================================ */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { TEMPLATES } from '../public/js/wed-model.js';
import { SAMPLE_CATALOG } from './sample-catalog.js';
import { resolveBaseUrl } from './site-url.js';

const root = new URL('../', import.meta.url);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* 每個版型都要有卡片；classic-* 是 classic 的配色，跟著 classic 那一張 */
const expected = Object.keys(TEMPLATES).filter((k) => !/^classic-/.test(k));
const missing = expected.filter((k) => !SAMPLE_CATALOG[k]);
const stale = Object.keys(SAMPLE_CATALOG).filter((k) => !expected.includes(k));
if (missing.length) throw new Error(`scripts/sample-catalog.js 少了：${missing.join('、')}`);
if (stale.length) throw new Error(`scripts/sample-catalog.js 多了不存在的版型：${stale.join('、')}`);

const cards = Object.entries(SAMPLE_CATALOG).map(([key, c]) => {
  const img = existsSync(new URL(`public/samples/thumbs/${key}.jpg`, root))
    ? `<img src="/samples/thumbs/${key}.jpg" alt="${esc(c.name[1])}版型的首頁" loading="lazy" width="390" height="760">`
    : '';
  return `
    <a class="card" href="/samples/${key}/">
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

const html = readFileSync(new URL('scripts/sample-index.html', root), 'utf8')
  .replace('<!--CARDS-->', cards)
  .replace(/\{\{COUNT\}\}/g, String(Object.keys(SAMPLE_CATALOG).length))
  .replace('{{OG_IMAGE}}', esc(`${resolveBaseUrl()}/samples/thumbs/${Object.keys(SAMPLE_CATALOG)[0]}.jpg`));
writeFileSync(new URL('public/samples/index.html', root), html);
console.log(`✅ public/samples/index.html（${Object.keys(SAMPLE_CATALOG).length} 個版型）`);
