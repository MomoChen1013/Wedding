#!/usr/bin/env node
/* ============================================================
   build-og.js — 產生社群分享縮圖，並把 og 標籤寫進每個站台的 HTML
   ------------------------------------------------------------
   用法：
     npm run build-og                              # 全部站台
     npm run build-og -- --slug ginny-one-20260919 # 單一站台
     npm run build-og -- --check                   # 只檢查有沒有過期，不寫檔
     npm run build-og -- --text latin              # 圖上壓 WEDDING ＋ 日期，不用中文字型

   ▸ 為什麼需要這一支：
     分享到 LINE／FB 時，對方的爬蟲**不會執行 JS**，
     所以 site-context.js 在瀏覽器端填的新人資料，縮圖完全讀不到。
     而 firebase.json 把 /w/{slug}/... 全部 rewrite 到同一份 HTML，
     等於所有站台共用同一組 og 標籤 —— 沒有 og:image 時，
     LINE 只好退而用 favicon.png，也就是工作室的 logo。

     解法是「在建置時就把 HTML 產出來」：
     針對每個站台實際寫出 public/w/{slug}/index.html 與 invitation.html，
     各自帶正確的 og:image／og:title。Firebase Hosting 的靜態檔優先權
     高於 rewrite，有實體檔就命中它；沒產過的站台自動走回原本的
     /w/** → index.html，維持現狀不會壞掉。

   ▸ 縮圖怎麼來：
     public/assets/{slug}/share.jpg  ← 新人指定的分享圖（最優先）
     public/assets/{slug}/cover.jpg  ← 沒放 share 就沿用封面
       有照片 → 合成 1200×630 的 public/assets/{slug}/og.jpg
                （照片鋪底裁切 → 漸層遮罩壓暗 → 右下角圓形 logo
                  → 左下角壓上文字，內容看 --text，見下方「字型與壓字模式」）
       沒照片 → 不產圖，og:image 指向共用的 /og-default.jpg
                （品牌底色 + 置中 logo，全站共用一張）

   ▸ 新人姓名／日期讀的是 Firestore（連線方式同 create-site.js）。
     讀不到也不會停下來：只是圖上不壓字、og:title 沿用通用文案。

   ▸ 這支會產生的檔案（都可以安心刪掉重跑）：
     public/og-default.jpg
     public/assets/{slug}/og.jpg
     public/w/{slug}/index.html
     public/w/{slug}/invitation.html
     public/s/{code}.html          ← 短連結也要有 og，否則前面都白做

   ▸ 改完 index.html／invitation.html／換素材之後要重跑，再 deploy：
       npm run build-og
       npx firebase deploy --only hosting
============================================================ */

import { parseArgs } from 'node:util';
import {
  readFileSync, writeFileSync, existsSync, readdirSync,
  statSync, mkdirSync, rmSync,
} from 'node:fs';
import { join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveBaseUrl } from './site-url.js';

const ROOT         = fileURLToPath(new URL('../', import.meta.url));
const PUBLIC_ROOT  = join(ROOT, 'public');
const ASSETS_ROOT  = join(PUBLIC_ROOT, 'assets');
const LOGO_FILE    = join(PUBLIC_ROOT, 'favicon.png');
const DEFAULT_OG   = join(PUBLIC_ROOT, 'og-default.jpg');
/* 下載回來的字型放這裡，體積大所以不進 git（見 .gitignore） */
const FONT_CACHE   = join(ROOT, 'scripts', '.fontcache');

/* 社群縮圖的標準尺寸。1.91:1 是 FB／LINE／X 共通的大圖卡比例 */
const OG_WIDTH  = 1200;
const OG_HEIGHT = 630;

/* 右下角圓形 logo 的直徑與離邊距離 */
const LOGO_SIZE   = 168;
const LOGO_MARGIN = 52;

/* 左下角文字的位置 */
const TEXT_LEFT   = 64;
const TEXT_BOTTOM = 68;

/* logo 自己的底色（favicon.png 的四角就是這個顏色）。
   共用縮圖用同一個色當底，logo 放上去才會像一體成形，而不是貼上去的方塊 */
const BRAND_PAPER = '#fcf9f4';
const BRAND_LINE  = '#d8cbb0';   /* champagne 主題的淺金，用來畫細框 */

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

/* 這兩個資料夾在 firebase.json 的 ignore 名單裡，不會被部署，
   幫它們產縮圖只會得到 404 的 og:image，所以直接跳過 */
const SKIP_SLUGS = new Set(['e2e', 'demo-wedding-2027']);

/* ============================================================
   要產出實體 HTML 的頁面
   ------------------------------------------------------------
   只做「新人真的會拿去分享」的兩頁：大廳與邀請函。
   其他頁（祝福牆、抽卡…）是進站之後才點的，沒有分享情境，
   多產只是讓 git 裡多一堆重複的 HTML。

   pageKey  : sites.pages 的開關代號，關掉的頁就不產
   src      : 來源 HTML
   out      : 產到 public/w/{slug}/ 底下的檔名（配合 cleanUrls）
   path     : 對外網址的片段，用來組 og:url
============================================================ */
const SHARE_PAGES = [
  {
    pageKey: 'lobby',
    /* 大廳永遠存在（site-pages.js 的 OPTIONAL_PAGES 裡沒有它，
       resolvePages 也不會寫進 pages map），所以不看開關。
       萬一某個舊站台的 pages 裡殘留 lobby:false，
       也不該因此讓最常被分享的那一頁沒有縮圖 */
    always: true,
    src: 'index.html',
    out: 'index.html',
    path: '',
    title: (couple) => `${couple}｜我們結婚了`,
    fallbackTitle: '我們結婚了｜婚禮邀請函',
    desc: (info) => info.dateText
      ? `${info.dateText}・誠摯邀請您一起見證我們的大喜之日`
      : '誠摯邀請您一起見證我們的大喜之日・婚禮資訊、當日流程與互動小遊戲都在這裡',
  },
  {
    pageKey: 'rsvp',
    src: 'invitation.html',
    out: 'invitation.html',
    path: 'invitation',
    title: (couple) => `${couple}｜婚禮邀請函`,
    fallbackTitle: '婚禮邀請函｜我們結婚了',
    desc: (info) => {
      const bits = [info.dateText, info.venueName].filter(Boolean);
      return bits.length
        ? `${bits.join('・')}・出席回覆請由此進`
        : '誠摯邀請您一起見證我們的大喜之日・時間、地點與出席回覆都在這裡';
    },
  },
];

/* ============================================================
   小工具
============================================================ */

function shortHash(buf) {
  return createHash('sha1').update(buf).digest('hex').slice(0, 8);
}

/* Pango markup 與 HTML 屬性都要跳脫，新人姓名裡出現 & 才不會炸掉 */
function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* 找出這一層裡叫做 {stem}.{圖片副檔名} 的檔案，不分大小寫 */
function findImageByStem(dir, stem) {
  if (!existsSync(dir)) return null;
  const hit = readdirSync(dir).find((f) => (
    IMAGE_EXT.has(extname(f).toLowerCase())
    && basename(f, extname(f)).toLowerCase() === stem
  ));
  return hit ? join(dir, hit) : null;
}

/* ============================================================
   字型與壓字模式
   ------------------------------------------------------------
   --text 有三種：

     couple  新人姓名 ＋ 日期（預設）
             要中文字型。多數機器（含 CI 容器）沒預裝，
             所以會去 Google Fonts 抓一份 Noto Serif TC（約 10MB）
             快取在 scripts/.fontcache/，只下載一次、不進 git。

     latin   WEDDING ＋ 日期
             全是西文與數字，系統內建的襯線字型就夠，**完全不必下載**。
             新人姓名不會消失 —— LINE／FB 的預覽卡本來就會把
             og:title（含姓名）顯示在縮圖旁邊。

     none    不壓字，只有照片與 logo。

   ▸ 三種模式產出的 og.jpg 差不到 3KB（實測 93K／91K／87K），
     所以選哪一種是版面問題，不是容量問題。
     真正的差別在建置端要不要那 10MB 字型。
============================================================ */

const TEXT_MODES = ['couple', 'latin', 'none'];

const FONT_FAMILY   = 'Noto Serif TC';
const FONT_CSS_URL  = 'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600&display=swap';
const FONT_CACHED   = join(FONT_CACHE, 'NotoSerifTC-SemiBold.ttf');

async function downloadFont() {
  /* css2 會依 User-Agent 決定回傳格式；舊版 UA 才拿得到 ttf，
     woff2 是 pango 讀不了的格式，所以這裡刻意裝成舊瀏覽器 */
  const cssRes = await fetch(FONT_CSS_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!cssRes.ok) throw new Error(`Google Fonts 回應 ${cssRes.status}`);
  const css = await cssRes.text();
  const m = css.match(/url\((https:\/\/[^)]+\.ttf)\)/);
  if (!m) throw new Error('在 Google Fonts 的回應裡找不到 ttf 網址');

  const fontRes = await fetch(m[1]);
  if (!fontRes.ok) throw new Error(`下載字型失敗 ${fontRes.status}`);
  mkdirSync(FONT_CACHE, { recursive: true });
  writeFileSync(FONT_CACHED, Buffer.from(await fontRes.arrayBuffer()));
  return FONT_CACHED;
}

/* 問 fontconfig 要一套字型。
   帶 lang=zh-tw 時要用 fc-list 而不是 fc-match：
   fc-match 就算系統沒有中文字型也會回一套西文字型，畫出來滿滿都是豆腐格 */
function systemFont({ cjk = false } = {}) {
  try {
    if (cjk) {
      /* 兩步驟：
         fc-list :lang=zh-tw 給出「真的有繁中字符」的白名單
         （fc-match 單獨用會在沒中文字型時硬回一套西文字型，畫出來全是豆腐格），
         再用 fc-match 挑出 fontconfig 偏好的那一套，
         才不會抓到 unifont 這種墊底用的點陣字型。 */
      const listed = new Set(
        execFileSync('fc-list', [':lang=zh-tw', 'file'], { encoding: 'utf8' })
          .split('\n').map((l) => l.replace(/:\s*$/, '').trim()).filter(Boolean),
      );
      if (!listed.size) return null;

      const preferred = execFileSync('fc-match', ['-f', '%{file}', 'serif:lang=zh-tw'], { encoding: 'utf8' }).trim();
      if (preferred && listed.has(preferred) && existsSync(preferred)) return preferred;

      const first = [...listed].find((f) => existsSync(f));
      return first || null;
    }
    const out = execFileSync('fc-match', ['-f', '%{file}', 'serif'], { encoding: 'utf8' }).trim();
    return out && existsSync(out) ? out : null;
  } catch {
    return null;
  }
}

/* 回傳 { fontfile, mode }：mode 可能跟使用者要的不一樣，
   例如要 couple 但機器上找不到中文字型，就自動降級成 latin —— 
   有字總比整張圖空著好，而且姓名在 og:title 裡還在 */
async function resolveTypeface({ font, noDownload, textMode }) {
  if (textMode === 'none') return { fontfile: null, mode: 'none' };

  /* 手動指定的字型永遠最優先，兩種模式共用 */
  for (const candidate of [font, process.env.WEDDING_OG_FONT, FONT_CACHED]) {
    if (candidate && existsSync(candidate)) return { fontfile: candidate, mode: textMode };
  }
  if (font) console.warn(`   ⚠️ 找不到 --font 指定的字型：${font}`);

  if (textMode === 'latin') {
    /* 西文與數字，系統字型就夠 —— 這條路完全不連網 */
    const latin = systemFont();
    if (latin) return { fontfile: latin, mode: 'latin' };
    console.warn('   ⚠️ 系統上找不到任何字型，縮圖不會壓字。');
    return { fontfile: null, mode: 'none' };
  }

  if (!noDownload) {
    try {
      console.log('   ⬇️  第一次執行，下載 Noto Serif TC（約 10MB，只會下載一次）…');
      return { fontfile: await downloadFont(), mode: 'couple' };
    } catch (err) {
      console.warn(`   ⚠️ 下載字型失敗：${err.message}`);
    }
  }

  const cjk = systemFont({ cjk: true });
  if (cjk) return { fontfile: cjk, mode: 'couple' };

  const latin = systemFont();
  if (latin) {
    console.warn('   ⚠️ 找不到中文字型，改用 --text latin（WEDDING ＋ 日期）。');
    console.warn('      想壓中文姓名的話，準備一個 .ttf／.otf 再跑：');
    console.warn('        npm run build-og -- --font /path/to/NotoSerifTC.ttf');
    return { fontfile: latin, mode: 'latin' };
  }

  console.warn('   ⚠️ 系統上找不到任何字型，縮圖不會壓字（圖與 logo 照常產生）。');
  return { fontfile: null, mode: 'none' };
}

/* ============================================================
   圖片合成
============================================================ */

/* 圓形 logo：底下先畫一個品牌底色的圓盤，再把 logo 縮小置中放上去。
   不能直接把整張 logo 拿去切圓 —— logo 的圖文幾乎滿版，
   圓形遮罩會把下緣的 WEDDING EXPERIENCE 切掉。
   圓盤的顏色跟 logo 自己的底色一樣，所以看起來是同一塊。
   外圈再補一道半透明白邊，壓在深色照片上才不會糊成一片 */
async function circleLogo(size) {
  const inner = Math.round(size * 0.76);
  const offset = Math.round((size - inner) / 2);

  const disc = Buffer.from(
    `<svg width="${size}" height="${size}">`
    + `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${BRAND_PAPER}"/></svg>`,
  );
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}">`
    + `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );
  const ring = Buffer.from(
    `<svg width="${size}" height="${size}">`
    + `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="none" `
    + `stroke="rgba(255,255,255,.62)" stroke-width="3"/></svg>`,
  );

  const logo = await sharp(LOGO_FILE)
    .resize(inner, inner, { fit: 'contain', background: BRAND_PAPER })
    .png()
    .toBuffer();

  return sharp(disc)
    .composite([
      { input: logo, left: offset, top: offset },
      { input: mask, blend: 'dest-in' },
      { input: ring, blend: 'over' },
    ])
    .png()
    .toBuffer();
}

/* 由上往下漸暗的遮罩：上半部幾乎不動照片，下半部壓到夠黑，
   左下角的白字與右下角的 logo 才有對比 */
function gradientOverlay() {
  return Buffer.from(`<svg width="${OG_WIDTH}" height="${OG_HEIGHT}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#1c1714" stop-opacity="0.08"/>
      <stop offset="40%"  stop-color="#1c1714" stop-opacity="0.22"/>
      <stop offset="72%"  stop-color="#1c1714" stop-opacity="0.58"/>
      <stop offset="100%" stop-color="#1c1714" stop-opacity="0.88"/>
    </linearGradient>
    <!-- 左側再壓一層：淺色背景的婚紗照很常見，
         只靠上下漸層的話左下角的白字會糊在亮處 -->
    <linearGradient id="l" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"  stop-color="#1c1714" stop-opacity="0.34"/>
      <stop offset="55%" stop-color="#1c1714" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#g)"/>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#l)"/>
</svg>`);
}

/* 用 sharp 的文字算繪把一行字畫成透明底 PNG。
   font 傳的是 Pango 的字型描述字串（家族名 + 字級） */
async function renderLine(text, { fontfile, size, color, spacing = 0, maxWidth }) {
  const span = `<span foreground="${color}"`
    + (spacing ? ` letter_spacing="${spacing}"` : '')
    + `>${escapeXml(text)}</span>`;
  return sharp({
    text: {
      text: span,
      /* 家族名要跟 fontfile 對得上；系統字型（latin 降級）就交給
         fontconfig 的泛型名稱 serif，寫死 Noto Serif TC 反而會找不到 */
      font: `${fontfile === FONT_CACHED || /NotoSerifTC/i.test(fontfile) ? FONT_FAMILY : 'serif'} ${size}`,
      fontfile,
      rgba: true,
      width: maxWidth,
      wrap: 'word-char',
    },
  }).png().toBuffer();
}

/* 合成單一站台的 og.jpg，回傳圖片位元組。
   刻意不直接寫檔：--check 要能在不動硬碟的前提下比對內容 */
async function composeOgImage(photoPath, info, fontfile, mode) {
  const base = sharp(photoPath)
    .resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover', position: 'attention' })
    .flatten({ background: BRAND_PAPER });   /* 去掉 PNG 透明底，不然轉 jpg 會變黑 */

  const layers = [{ input: gradientOverlay(), top: 0, left: 0 }];

  /* 文字寬度要先扣掉右下角 logo 佔的位置，長姓名才不會壓到 logo 上 */
  const textMaxWidth = OG_WIDTH - TEXT_LEFT - LOGO_SIZE - LOGO_MARGIN - 40;

  const blocks = [];
  if (fontfile && mode === 'couple') {
    /* 大字是新人姓名，小字是日期 */
    if (info.couple) {
      blocks.push(await renderLine(info.couple, {
        fontfile, size: 58, color: '#ffffff', maxWidth: textMaxWidth,
      }));
    }
    if (info.dateText) {
      blocks.push(await renderLine(info.dateText, {
        fontfile, size: 27, color: '#f0e6d8', spacing: 3200, maxWidth: textMaxWidth,
      }));
    }
  } else if (fontfile && mode === 'latin' && info.dateNumeric) {
    /* 上面一行小字當引言，下面是日期。姓名交給 og:title 顯示 */
    blocks.push(await renderLine('WEDDING', {
      fontfile, size: 26, color: '#f0e6d8', spacing: 9000, maxWidth: textMaxWidth,
    }));
    blocks.push(await renderLine(info.dateNumeric, {
      fontfile, size: 56, color: '#ffffff', spacing: 1500, maxWidth: textMaxWidth,
    }));
  }

  if (blocks.length) {
    const metas = await Promise.all(blocks.map((b) => sharp(b).metadata()));
    const gap = 16;
    const totalHeight = metas.reduce((sum, m) => sum + m.height, 0) + gap * (blocks.length - 1);

    let top = OG_HEIGHT - TEXT_BOTTOM - totalHeight;
    blocks.forEach((buf, i) => {
      layers.push({ input: buf, left: TEXT_LEFT, top });
      top += metas[i].height + gap;
    });
  }

  layers.push({
    input: await circleLogo(LOGO_SIZE),
    left: OG_WIDTH - LOGO_SIZE - LOGO_MARGIN,
    top: OG_HEIGHT - LOGO_SIZE - LOGO_MARGIN,
  });

  /* quality 82 + mozjpeg 大約落在 100～250KB，
     在 LINE 的縮圖大小限制內，畫質也還看得 */
  return base.composite(layers).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}

/* 共用的預設縮圖：品牌底色 + 置中 logo。
   底色跟 logo 自己的底色一樣，所以不需要去背也不會有邊 */
async function buildDefaultOg() {
  const size = 340;
  const logo = await sharp(LOGO_FILE).resize(size, size, { fit: 'cover' }).png().toBuffer();
  const frame = Buffer.from(`<svg width="${OG_WIDTH}" height="${OG_HEIGHT}">
  <rect x="28" y="28" width="${OG_WIDTH - 56}" height="${OG_HEIGHT - 56}"
        fill="none" stroke="${BRAND_LINE}" stroke-width="1.5"/>
</svg>`);

  return sharp({
    create: {
      width: OG_WIDTH, height: OG_HEIGHT, channels: 3, background: BRAND_PAPER,
    },
  })
    .composite([
      { input: frame, top: 0, left: 0 },
      {
        input: logo,
        left: Math.round((OG_WIDTH - size) / 2),
        /* logo 圖檔上緣留白比下緣多，純數學置中看起來會偏低，往上推 12px */
        top: Math.round((OG_HEIGHT - size) / 2) - 12,
      },
    ])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

/* ============================================================
   HTML 產生
============================================================ */

const BANNER = '<!-- 這個檔案由 scripts/build-og.js 產生，不要手改；'
  + '改來源請改 public/{index,invitation,shortlink}.html 再重跑 npm run build-og -->';

/* 把 head 裡舊的社群標籤整組拆掉，換上這個站台專屬的一組。
   用「先清乾淨再插入」而不是逐一取代，重跑幾次結果都一樣 */
function buildHtml(srcHtml, srcName, meta) {
  let html = srcHtml;

  html = html.replace(
    /<meta\s+name="description"[^>]*>\s*\n?/gi, '',
  ).replace(
    /<meta\s+property="og:[^"]*"[^>]*>\s*\n?/gi, '',
  ).replace(
    /<meta\s+name="twitter:[^"]*"[^>]*>\s*\n?/gi, '',
  );

  const tags = [
    `<title>${escapeXml(meta.title)}</title>`,
    `<meta name="description" content="${escapeXml(meta.description)}">`,
    `<meta property="og:title" content="${escapeXml(meta.title)}">`,
    `<meta property="og:description" content="${escapeXml(meta.description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${escapeXml(meta.url)}">`,
    `<meta property="og:image" content="${escapeXml(meta.image)}">`,
    `<meta property="og:image:width" content="${OG_WIDTH}">`,
    `<meta property="og:image:height" content="${OG_HEIGHT}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:image" content="${escapeXml(meta.image)}">`,
  ].join('\n');

  /* 原本的 <title> 換成整組標籤（順便把樣板註解留在原地）。
     用函式當取代值：新人姓名裡若出現 $&、$1 這類字元，
     直接傳字串會被 String.replace 當成取代樣板吃掉 */
  html = html.replace(/<title>[\s\S]*?<\/title>/i, () => tags);

  /* 產出來的檔案要能追回是哪一版來源產的，--check 才判斷得出過期 */
  const stamp = `<!-- source: ${srcName} ${shortHash(srcHtml)} -->`;
  return html.replace(/^(<!DOCTYPE html>)/i, `$1\n${BANNER}\n${stamp}`);
}

/* ============================================================
   Firestore（拿新人姓名、日期、頁面開關）
============================================================ */

let firestoreWarned = false;

function connectFirestore(projectId) {
  try {
    const initOptions = { projectId: projectId || process.env.GOOGLE_CLOUD_PROJECT };
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      initOptions.credential = applicationDefault();
    }
    initializeApp(initOptions);
    return getFirestore();
  } catch (err) {
    console.warn(`⚠️  連不上 Firestore：${err.message}`);
    return null;
  }
}

async function readSite(db, slug) {
  if (!db) return null;
  try {
    const slugSnap = await db.collection('slugs').doc(slug).get();
    if (!slugSnap.exists) return null;
    const siteSnap = await db.collection('sites').doc(slugSnap.data().siteId).get();
    return siteSnap.exists ? siteSnap.data() : null;
  } catch (err) {
    if (!firestoreWarned) {
      firestoreWarned = true;
      console.warn(`⚠️  讀不到 Firestore（${err.message}）`);
      console.warn('    縮圖與 og 標籤照樣會產生，只是不會帶新人姓名與日期。');
      console.warn('    要帶的話先設定 Admin 憑證：');
      console.warn('      export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json');
    }
    return null;
  }
}

/* 2026.09.19（六） */
function formatEventDate(ts, timezone) {
  if (!ts || typeof ts.toDate !== 'function') return '';
  try {
    const parts = new Intl.DateTimeFormat('zh-TW', {
      timeZone: timezone || 'Asia/Taipei',
      year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    }).formatToParts(ts.toDate());
    const get = (t) => (parts.find((p) => p.type === t) || {}).value || '';
    const weekday = get('weekday').replace(/^週/, '');
    return `${get('year')}.${get('month')}.${get('day')}${weekday ? `（${weekday}）` : ''}`;
  } catch {
    return '';
  }
}

function siteInfo(site) {
  if (!site) return { couple: '', dateText: '', dateNumeric: '', venueName: '', pages: null };
  const groom = (site.groomName || '').trim();
  const bride = (site.brideName || '').trim();
  const couple = (site.coupleTitle || '').trim()
    || (groom && bride ? `${groom} & ${bride}` : groom || bride);
  const dateText = formatEventDate(site.eventDate, site.timezone);
  return {
    couple,
    dateText,
    /* latin 模式用的純數字日期：把「（六）」這種中文星期拿掉 */
    dateNumeric: dateText.replace(/（.*?）/g, ''),
    venueName: (site.venueName || '').trim(),
    pages: site.pages && typeof site.pages === 'object' ? site.pages : null,
  };
}

/* ============================================================
   主流程
============================================================ */

function listAssetSlugs() {
  if (!existsSync(ASSETS_ROOT)) return [];
  return readdirSync(ASSETS_ROOT)
    .filter((name) => statSync(join(ASSETS_ROOT, name)).isDirectory())
    .filter((name) => !name.startsWith('.'))
    .sort();
}

async function listFirestoreSlugs(db) {
  if (!db) return [];
  try {
    return (await db.collection('slugs').get()).docs.map((d) => d.id).sort();
  } catch {
    return [];
  }
}

/* 站台清單＝素材資料夾 ∪ Firestore 的 slug。
   只掃資料夾是不夠的：沒放素材的站台照樣有網址、照樣會被分享出去，
   漏掉它們等於那組新人的連結永遠停在工作室 logo。
   這種站台沒有照片可合成，就掛共用的 og-default.jpg。 */
async function listSlugs(db) {
  const fromAssets = listAssetSlugs();
  const fromDb = await listFirestoreSlugs(db);
  const all = [...new Set([...fromAssets, ...fromDb])]
    .filter((name) => !SKIP_SLUGS.has(name))
    .sort();
  return { all, fromAssets: new Set(fromAssets), fromDb: new Set(fromDb) };
}

/* --check 用：要寫的內容跟現有檔案不一樣就算過期 */
function writeOrCheck(path, content, state) {
  const next = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  const same = existsSync(path) && readFileSync(path).equals(next);
  if (state.check) {
    if (!same) state.stale.push(path.replace(`${ROOT}`, ''));
    return;
  }
  if (!same) {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, next);
  }
}

async function buildSlug(slug, ctx) {
  const dir = join(ASSETS_ROOT, slug);
  const site = await readSite(ctx.db, slug);
  const info = siteInfo(site);

  /* share 優先於 cover：新人想讓分享圖跟封面不一樣時放 share.jpg 就好 */
  const photo = findImageByStem(dir, 'share') || findImageByStem(dir, 'cover');
  const ogPath = join(dir, 'og.jpg');

  let imageUrl;
  let note;

  if (photo) {
    /* 每次都重算：--check 才判斷得出「新人換了照片但沒重跑」。
       同樣的輸入 sharp 會產出同樣的位元組，所以不會製造 git 差異 */
    const bytes = await composeOgImage(photo, info, ctx.fontfile, ctx.textMode);
    writeOrCheck(ogPath, bytes, ctx.state);
    /* 帶內容雜湊當版本號：LINE／FB 會把縮圖快取很久，
       換了照片但網址沒變的話，賓客看到的還是舊圖 */
    imageUrl = `${ctx.base}/assets/${slug}/og.jpg?v=${shortHash(bytes)}`;
    note = `${basename(photo)} → og.jpg`;
  } else {
    /* 照片被拿掉的站台，之前合成的 og.jpg 已經沒有人指向它，順手清掉 */
    if (!ctx.state.check && existsSync(ogPath)) rmSync(ogPath, { force: true });
    imageUrl = `${ctx.base}/og-default.jpg?v=${ctx.defaultHash}`;
    note = '沒有 share／cover，使用共用預設圖';
  }

  /* 重產前先清掉整個資料夾：頁面被關掉或改名時，
     舊的 HTML 才不會留在那裡繼續被 Hosting 命中 */
  const outDir = join(PUBLIC_ROOT, 'w', slug);
  if (!ctx.state.check && existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });

  const made = [];
  for (const page of SHARE_PAGES) {
    /* pages 沒設定＝全開；明確設成 false 才跳過 */
    if (!page.always && info.pages && info.pages[page.pageKey] === false) continue;

    const srcHtml = readFileSync(join(PUBLIC_ROOT, page.src), 'utf8');
    const html = buildHtml(srcHtml, page.src, {
      title: info.couple ? page.title(info.couple) : page.fallbackTitle,
      description: page.desc(info),
      url: `${ctx.base}/w/${slug}/${page.path}`,
      image: imageUrl,
    });
    writeOrCheck(join(outDir, page.out), html, ctx.state);
    made.push(page.path || '（大廳）');
  }

  console.log(`✅ ${slug}`);
  console.log(`   縮圖 : ${note}`);
  console.log(`   標題 : ${info.couple || '（Firestore 沒讀到新人姓名，沿用通用文案）'}`);
  console.log(`   頁面 : ${made.join('、') || '（都關著）'}`);

  return { imageUrl, info };
}

/* 短連結：新人分享的常常是 /s/{code}，
   這一頁沒有 og 的話，前面產的縮圖一張都用不到 */
async function buildShortLinks(ctx, siteImages) {
  if (!ctx.db) return 0;

  let snap;
  try {
    snap = await ctx.db.collection('short').get();
  } catch {
    return 0;
  }

  /* 跟 /w/{slug}/ 一樣先清空再重產：短連結在 Firestore 被刪掉之後，
     這裡的 HTML 才不會留著繼續被 Hosting 命中 */
  const outDir = join(PUBLIC_ROOT, 's');
  if (!ctx.state.check && existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });

  const srcHtml = readFileSync(join(PUBLIC_ROOT, 'shortlink.html'), 'utf8');
  let count = 0;

  for (const d of snap.docs) {
    const target = d.data().target;
    if (typeof target !== 'string') continue;

    /* 從目標網址反查是哪一個站台，才知道要掛哪一張縮圖 */
    const m = target.match(/\/w\/([^/?#]+)/);
    const hit = m ? siteImages.get(m[1]) : null;
    if (!hit) continue;

    const html = buildHtml(srcHtml, 'shortlink.html', {
      title: hit.title,
      description: hit.description,
      url: `${ctx.base}/s/${d.id}`,
      image: hit.image,
    });
    writeOrCheck(join(PUBLIC_ROOT, 's', `${d.id}.html`), html, ctx.state);
    count += 1;
  }
  return count;
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      slug:     { type: 'string' },
      base:     { type: 'string' },
      project:  { type: 'string' },
      font:     { type: 'string' },
      text:     { type: 'string', default: 'couple' },
      check:    { type: 'boolean', default: false },
      'no-download': { type: 'boolean', default: false },
    },
  });

  if (!TEXT_MODES.includes(values.text)) {
    console.error(`❌ --text 只能是 ${TEXT_MODES.join('／')}`);
    process.exit(1);
  }

  const state = { check: values.check, stale: [] };
  const base = resolveBaseUrl(values.base);
  const { fontfile, mode: textMode } = await resolveTypeface({
    font: values.font,
    noDownload: values['no-download'],
    textMode: values.text,
  });
  /* Firestore 要先連，站台清單才問得到（它是清單的來源之一） */
  const db = connectFirestore(values.project);

  const { all, fromAssets, fromDb } = await listSlugs(db);
  let slugs = all;
  if (values.slug) {
    if (!slugs.includes(values.slug)) {
      console.error(`❌ 不認得這個站台：${values.slug}`);
      console.error(`   目前有：${slugs.join('、') || '（一個都沒有）'}`);
      console.error('   站台清單來自 public/assets/ 的資料夾名稱，以及 Firestore 的 slugs 集合。');
      process.exit(1);
    }
    slugs = [values.slug];
  }
  if (!slugs.length) {
    console.log('沒有找到任何站台。');
    console.log('先跑 npm run sync-assets -- --init --slug {slug} 建素材資料夾，');
    console.log('或設好 Admin 憑證讓這支讀得到 Firestore 的 slugs。');
    return;
  }

  /* 共用預設圖：沒有照片的站台都指向它，所以一定要先有 */
  const defaultBytes = await buildDefaultOg();
  writeOrCheck(DEFAULT_OG, defaultBytes, state);

  const ctx = { base, db, fontfile, textMode, state, defaultHash: shortHash(defaultBytes) };

  const TEXT_LABEL = {
    couple: '新人姓名 ＋ 日期',
    latin: 'WEDDING ＋ 日期（不用中文字型）',
    none: '不壓字',
  };
  console.log(`網址前綴：${base}`);
  console.log(`圖上文字：${TEXT_LABEL[textMode]}`);

  /* 只有素材資料夾、Firestore 裡卻沒有的 slug，多半是資料夾名字打錯 ——
     這種站台產出來的檔案掛在一個沒人走得到的網址上，要講出來 */
  const orphanFolders = [...fromAssets].filter((x) => !SKIP_SLUGS.has(x) && fromDb.size && !fromDb.has(x));
  if (orphanFolders.length) {
    console.log('');
    console.log(`⚠️  這些素材資料夾在 Firestore 裡找不到對應的 slug：${orphanFolders.join('、')}`);
    console.log('    資料夾名稱必須跟 slug 一模一樣，否則賓客走的網址不會命中產出來的檔案。');
  }
  console.log('');

  const siteImages = new Map();
  for (const slug of slugs) {
    const { imageUrl, info } = await buildSlug(slug, ctx);
    siteImages.set(slug, {
      image: imageUrl,
      title: info.couple ? `${info.couple}｜婚禮邀請函` : '婚禮邀請函｜我們結婚了',
      description: SHARE_PAGES[1].desc(info),
    });
  }

  /* 只有掃全部站台時才重建短連結：指定 --slug 卻砍掉別站的短連結頁很危險 */
  if (!values.slug) {
    const n = await buildShortLinks(ctx, siteImages);
    if (n) console.log(`\n✅ 短連結 ${n} 筆也帶上了縮圖`);
  }

  console.log('');
  if (state.check) {
    if (state.stale.length) {
      console.log(`⚠️  有 ${state.stale.length} 個檔案跟來源不一致（需要重跑 npm run build-og）：`);
      state.stale.forEach((f) => console.log(`   ${f}`));
      process.exitCode = 1;
      return;
    }
    console.log('✅ 社群縮圖與 og 標籤都是最新的。');
    return;
  }

  console.log('社群縮圖已更新。記得重新部署才會生效：');
  console.log('  npx firebase deploy --only hosting');
  console.log('');
  console.log('▸ 換過照片的話，LINE／FB 會有快取；og:image 已經自動帶版本號，');
  console.log('  但已經分享出去的舊訊息不會跟著更新，這是平台行為。');
}

main().catch((err) => {
  console.error(`❌ 產生失敗：${err.message}`);
  process.exit(1);
});
