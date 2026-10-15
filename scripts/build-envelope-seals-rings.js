/* ============================================================
   build-envelope-seals-rings.js — 把芯玖 logo 的雙戒指壓進空白封蠟
   ------------------------------------------------------------
     node scripts/build-envelope-seals-rings.js <紅> <粉紅> <金>

   來源：三枚 AI 生成、中間空白的封蠟（1024×1024，純黑底），原圖不放進 repo。
   產出（⚙️ 不要手改）：public/img/envelope/seal-{red,pink,gold}.webp

   做法：
     1. 從 public/favicon.png 取出雙戒指＋鑽石（跟米白底色差得夠多的像素），當成高度圖
     2. 照高度圖算出每一點的斜面，光從左上來 —— 向光的一側提亮、背光的一側壓暗，
        戒指就像是從蠟面上凸起來的印（和原本那枚古銅封蠟同一個做法）
     3. 黑底挖成透明、裁掉空白、縮成 480px
============================================================ */
import sharp from 'sharp';

const [red, pink, gold] = process.argv.slice(2);
if (!gold) { console.error('用法：node scripts/build-envelope-seals-rings.js <紅> <粉紅> <金>'); process.exit(1); }
const OUT = (n) => new URL(`../public/img/envelope/seal-${n}.webp`, import.meta.url).pathname;
const LOGO = new URL('../public/favicon.png', import.meta.url).pathname;

/* logo 裡戒指與鑽石的範圍（512×512 的 favicon） */
const CROP = { left: 108, top: 40, width: 300, height: 262 };
const DESIGN_W = 330;               /* 壓在 1024 的封蠟上的寬度（空白印面直徑約 510） */
const CENTER = [512, 522];          /* 印面中心，略往下：鑽石在上面，整組看起來才置中 */

async function heightMap() {
  const { data, info } = await sharp(LOGO).extract(CROP).resize({ width: DESIGN_W })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, m = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const d = Math.abs(data[i * 3] - 250) + Math.abs(data[i * 3 + 1] - 246) + Math.abs(data[i * 3 + 2] - 240);
    m[i] = Math.min(1, Math.max(0, (d - 24) / 70));
  }
  /* 稍微糊一點（橫、直各一次的盒狀模糊，跑兩輪），斜面才是圓的、不是鋸齒 */
  let h = m;
  for (let pass = 0; pass < 2; pass++) h = boxBlur(boxBlur(h, W, H, 2, true), W, H, 2, false);
  return { W, H, h, m };
}

function boxBlur(src, W, H, r, horiz) {
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sum = 0, n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = horiz ? x + k : x, yy = horiz ? y : y + k;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        sum += src[yy * W + xx]; n++;
      }
      out[y * W + x] = sum / n;
    }
  }
  return out;
}

async function press(src, name, hm) {
  const { data, info } = await sharp(src).resize(1024, 1024).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { W, H, h, m } = hm;
  const x0 = Math.round(CENTER[0] - W / 2), y0 = Math.round(CENTER[1] - H / 2);
  const at = (x, y) => h[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  const L = [-0.62, -0.78];          /* 光從左上 */
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = -(at(x + 1, y) - at(x - 1, y)), ny = -(at(x, y + 1) - at(x, y - 1));
      const shade = (nx * L[0] + ny * L[1]) * 2.4;        /* 斜面朝光為正 */
      const top = m[y * W + x] * 0.06;                     /* 凸起的頂面比蠟面亮一點點 */
      const k = 1 + Math.max(-0.42, Math.min(0.5, shade)) + top;
      const i = ((y0 + y) * info.width + (x0 + x)) * 4;
      for (let c = 0; c < 3; c++) data[i + c] = Math.min(255, data[i + c] * k + (shade > 0 ? shade * 40 : 0));
    }
  }
  /* 黑底 → 透明 */
  for (let i = 0; i < data.length; i += 4) {
    const mx = Math.max(data[i], data[i + 1], data[i + 2]);
    const a = Math.min(1, Math.max(0, (mx - 16) / 30));
    if (a > 0 && a < 1) for (let c = 0; c < 3; c++) data[i + c] = Math.min(255, data[i + c] / a);
    data[i + 3] = Math.round(a * 255);
  }
  const buf = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 1 }).png().toBuffer();
  await sharp(buf).resize({ width: 480, height: 480, fit: 'inside' }).webp({ quality: 90, alphaQuality: 90 }).toFile(OUT(name));
  console.log(`✅ ${OUT(name)}`);
}

const hm = await heightMap();
await press(red, 'red', hm);
await press(pink, 'pink', hm);
await press(gold, 'gold', hm);
