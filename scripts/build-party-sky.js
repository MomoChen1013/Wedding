/* ============================================================
   build-party-sky.js — 把開場的那一片天空烤進派對大廳的 hero
   ------------------------------------------------------------
     node scripts/build-party-sky.js

   美式戶外派對（outdoor-party）的開場是滿滿的氣球升空，露出底下的天空；
   大廳的 hero 就是同一片天空。那張圖由 public/js/openers/balloons.js 的
   window.PartySky.svg() 畫（白雲、太陽、遠山、帳篷、三角旗、串燈），
   這支在 Node 裡跑同一支函式，把結果寫進 public/lobby-party.html 的
   <!-- party-sky --> … <!-- /party-sky --> 之間（⚙️ 那一段不要手改）。

   為什麼不在瀏覽器裡畫：大廳的骨架不能帶 <script>（site-context.js 用
   innerHTML 換骨架），而且 hero 要第一次繪製就看得到，不能等 JS。
   改了 balloons.js 的天空，記得重跑這一支，再跑 npm run build-previews。
============================================================ */
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const src = readFileSync(new URL('public/js/openers/balloons.js', root), 'utf8');
const sandbox = { window: {}, Math };
vm.runInNewContext(src, sandbox);
const svg = sandbox.window.PartySky.svg();

const file = new URL('public/lobby-party.html', root);
const html = readFileSync(file, 'utf8');
const re = /<!-- party-sky -->[\s\S]*?<!-- \/party-sky -->/;
if (!re.test(html)) throw new Error('lobby-party.html 裡找不到 <!-- party-sky --> 標記');
writeFileSync(file, html.replace(re, `<!-- party-sky -->${svg}<!-- /party-sky -->`));
console.log(`✅ public/lobby-party.html：天空 ${(svg.length / 1024).toFixed(1)}KB`);
