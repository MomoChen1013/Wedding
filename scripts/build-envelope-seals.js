/* ============================================================
   build-envelope-seals.js — 從原本那一枚封蠟，染出其他信封用的顏色
   ------------------------------------------------------------
     node scripts/build-envelope-seals.js

   來源：public/img/envelope/wax-seal.webp（復古信封的香檳古銅色封蠟）
   產出（⚙️ 不要手改，改這支再重跑）：
     public/img/envelope/wax-seal-gold.webp   金色（壓紋、端莊）
     public/img/envelope/wax-seal-red.webp    紅色（緞帶絲綢、華麗）

   做法是「漸層對應」：每一個像素先算亮度，把原圖的亮度範圍拉滿 0 → 1，
   再照這個亮度在一條色帶上取色。蠟的起伏、印面的雙戒指、邊緣的光
   全都還在（那些本來就只是明暗），只有顏色換掉；透明度原樣保留。
============================================================ */
import sharp from 'sharp';

const SRC = new URL('../public/img/envelope/wax-seal.webp', import.meta.url);
const out = (name) => new URL(`../public/img/envelope/wax-seal-${name}.webp`, import.meta.url).pathname;

/* 每一條色帶：[亮度, '#rrggbb']，亮度由暗到亮 */
const RAMPS = {
  gold: [[0, '#3a2608'], [0.32, '#86601f'], [0.6, '#c49b45'], [0.82, '#e8cd85'], [1, '#fff6d8']],
  red:  [[0, '#2a0306'], [0.32, '#6e0d16'], [0.6, '#a81b25'], [0.84, '#d24a4c'], [1, '#ffb3a8']],
};

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function sample(ramp, t) {
  for (let i = 1; i < ramp.length; i++) {
    const [t1, c1] = ramp[i];
    if (t <= t1) {
      const [t0, c0] = ramp[i - 1];
      const k = (t - t0) / (t1 - t0 || 1);
      const a = hex(c0), b = hex(c1);
      return a.map((v, j) => Math.round(v + (b[j] - v) * k));
    }
  }
  return hex(ramp[ramp.length - 1][1]);
}

const { data, info } = await sharp(SRC.pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const px = info.width * info.height;
const lum = new Float32Array(px);
const seen = [];
for (let i = 0; i < px; i++) {
  const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
  lum[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (data[i * 4 + 3] > 200) seen.push(lum[i]);
}
/* 只看不透明的像素，去掉頭尾各 1% 再拉滿 —— 邊緣半透明的那一圈不算數 */
seen.sort((a, b) => a - b);
const lo = seen[Math.floor(seen.length * 0.01)], hi = seen[Math.floor(seen.length * 0.99)];

for (const [name, ramp] of Object.entries(RAMPS)) {
  const buf = Buffer.alloc(data.length);
  for (let i = 0; i < px; i++) {
    const t = Math.min(1, Math.max(0, (lum[i] - lo) / (hi - lo)));
    const [r, g, b] = sample(ramp, t);
    buf[i * 4] = r; buf[i * 4 + 1] = g; buf[i * 4 + 2] = b; buf[i * 4 + 3] = data[i * 4 + 3];
  }
  await sharp(buf, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ quality: 88, alphaQuality: 100 }).toFile(out(name));
  console.log(`✅ ${out(name)}`);
}
