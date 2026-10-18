/* ============================================================
   build-samples.js — 版型展示頁的總覽（public/samples/index.html）
   ------------------------------------------------------------
     node scripts/build-samples.js

   每個版型一張卡片，點進去是 /samples/{版型}/ —— 那是正式網站同一套頁面
   跑在示範模式（js/site-context.js 的 DEMO），這支只負責產出總覽。

     卡片文案   scripts/sample-catalog.js
     頁面模板   scripts/sample-index.html
     縮圖       public/samples/thumbs/{版型}.jpg（scripts/build-sample-thumbs.js 截的）
     循環影片   public/samples/videos/{版型}.webm／.mp4（scripts/build-sample-videos.js 錄的；沒有就只放縮圖）
     LINE 連結  public/samples/config.js（「♡ 我喜歡這款」的預填訊息用版型的中文名）

   Classic 四種配色共用一張卡片（示範頁只放香檳金），
   其他版型在 sample-catalog.js 沒寫到的，這裡直接報錯。
============================================================ */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { TEMPLATES } from '../public/js/wed-model.js';
import { SAMPLE_CATALOG } from './sample-catalog.js';
import { resolveBaseUrl } from './site-url.js';
import { LINE_URL, lineMessageUrl, likeMessage } from '../public/samples/config.js';

const root = new URL('../', import.meta.url);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* 每個版型都要有卡片；classic-* 是 classic 的配色，跟著 classic 那一張 */
const expected = Object.keys(TEMPLATES).filter((k) => !/^classic-/.test(k));
const missing = expected.filter((k) => !SAMPLE_CATALOG[k]);
const stale = Object.keys(SAMPLE_CATALOG).filter((k) => !expected.includes(k));
if (missing.length) throw new Error(`scripts/sample-catalog.js 少了：${missing.join('、')}`);
if (stale.length) throw new Error(`scripts/sample-catalog.js 多了不存在的版型：${stale.join('、')}`);
const badPlan = Object.entries(SAMPLE_CATALOG).filter(([, c]) => !['classic', 'premium'].includes(c.plan)).map(([k]) => k);
if (badPlan.length) throw new Error(`scripts/sample-catalog.js 的 plan 要是 'classic' 或 'premium'：${badPlan.join('、')}`);

/* 卡片頂端：縮圖（lazy）＋循環影片（src 與 poster 先不給，samples.js 等卡片進到畫面才掛上去）。
   沒有影片就只放縮圖 */
const shot = (key, c) => {
  const thumb = existsSync(new URL(`public/samples/thumbs/${key}.jpg`, root)) ? `/samples/thumbs/${key}.jpg` : '';
  const hasVideo = ['webm', 'mp4'].every((ext) => existsSync(new URL(`public/samples/videos/${key}.${ext}`, root)));
  const img = thumb ? `<img src="${thumb}" alt="${esc(c.name[1])}版型的首頁" loading="lazy" width="390" height="760">` : '';
  if (hasVideo) {
    /* poster 也等卡片接近畫面才掛（13 張一起抓會拖慢首屏）；底下那張 lazy 的縮圖是沒 JS、減少動態時看到的 */
    return `${img}<video class="loop" muted loop playsinline autoplay preload="none"${thumb ? ` data-poster="${thumb}"` : ''}
          data-webm="/samples/videos/${key}.webm" data-mp4="/samples/videos/${key}.mp4" aria-hidden="true"></video>`;
  }
  return thumb ? `<img src="${thumb}" alt="${esc(c.name[1])}版型的首頁" loading="lazy" width="390" height="760">` : '';
};

/* 另開分頁／外連的按鈕：文字右上角一個小箭頭 */
const EXT = '<svg class="ext" aria-hidden="true"><use href="#i-ext"/></svg>';

const card = ([key, c]) => `
    <article class="card glass" data-template="${esc(key)}">
      <button type="button" class="like" data-like aria-pressed="false" aria-label="喜歡${esc(c.name[1])}"><svg aria-hidden="true"><use href="#i-heart"/></svg></button>
      <div class="shot" style="background:${esc(c.colors[0])}">${shot(key, c)}</div>
      <div class="body">
        <h3><span class="en">${esc(c.name[0])}</span><span class="cn">${esc(c.name[1])}</span></h3>
        <p class="mood">${esc(c.mood)}</p>
        <p class="likes" data-likes hidden></p>
        <span class="swatches" aria-hidden="true">${c.colors.map((col) => `<i style="background:${esc(col)}"></i>`).join('')}</span>
        <div class="acts">
          <button type="button" class="btn btn-pv" data-preview="${esc(key)}" data-name="${esc(c.name[1])}" aria-label="預覽${esc(c.name[1])}的開場">預覽</button>
          <a class="btn ghost" href="/samples/${esc(key)}/" target="_blank" rel="noopener" data-demo="card">看完整範例${EXT}</a>
          <a class="btn ghost btn-like" href="${esc(lineMessageUrl(likeMessage(c.name[1])))}" target="_blank" rel="noopener" data-line="template_card"><svg class="ic-heart" aria-hidden="true"><use href="#i-heart"/></svg>我想用這款${EXT}</a>
        </div>
      </div>
    </article>`;
/* 總覽頁分兩區：經典方案的版型、典藏方案的版型 */
const cardsOf = (plan) => Object.entries(SAMPLE_CATALOG).filter(([, c]) => c.plan === plan).map(card).join('');

const html = readFileSync(new URL('scripts/sample-index.html', root), 'utf8')
  .replace('<!--CARDS_CLASSIC-->', cardsOf('classic'))
  .replace('<!--CARDS_PREMIUM-->', cardsOf('premium'))
  .replaceAll('{{N_ALL}}', String(Object.keys(SAMPLE_CATALOG).length))
  .replaceAll('{{N_CLASSIC}}', String(Object.values(SAMPLE_CATALOG).filter((c) => c.plan === 'classic').length))
  .replaceAll('{{N_PREMIUM}}', String(Object.values(SAMPLE_CATALOG).filter((c) => c.plan === 'premium').length))
  .replace(/\{\{COUNT\}\}/g, String(Object.keys(SAMPLE_CATALOG).length))
  .replaceAll('{{LINE_URL}}', esc(LINE_URL))
  /* 總覽頁是全站唯一讓搜尋引擎收錄的頁面（見 firebase.json 的 X-Robots-Tag）；/samples 與 /samples/ 算同一頁 */
  .replace('{{CANONICAL}}', esc(`${resolveBaseUrl()}/samples/`))
  /* 「賓客會看到什麼」第一張卡：LINE 裡的連結預覽，用白色教堂的縮圖（整頁的樣式也是它） */
  .replace('{{OG_THUMB}}', '/samples/thumbs/white-church.jpg')
  .replace('{{OG_IMAGE}}', esc(`${resolveBaseUrl()}/samples/thumbs/${Object.keys(SAMPLE_CATALOG)[0]}.jpg`));
if (/\{\{[A-Z_]+\}\}/.test(html)) throw new Error(`scripts/sample-index.html 還有沒填到的 {{…}}：${html.match(/\{\{[A-Z_]+\}\}/)[0]}`);
/* 產出的頁面不帶註解（HTML 與 <style> 裡的都拿掉）：說明留在 scripts/sample-index.html 就好，不必公開 */
const published = html
  .replace(/<!--[\s\S]*?-->\n?/g, '')
  .replace(/<style>[\s\S]*?<\/style>/, (css) => css.replace(/\/\*[\s\S]*?\*\/\n?/g, ''));
writeFileSync(new URL('public/samples/index.html', root), published);
console.log(`✅ public/samples/index.html（${Object.keys(SAMPLE_CATALOG).length} 個版型）`);

/* 「♡ 我喜歡這款」實際產生的連結，方便用手機逐一點測 */
if (process.argv.includes('--links')) {
  for (const [key, c] of Object.entries(SAMPLE_CATALOG)) console.log(`${c.name[1]}（${key}）\n  ${lineMessageUrl(likeMessage(c.name[1]))}`);
}
