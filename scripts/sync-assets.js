#!/usr/bin/env node
/* ============================================================
   sync-assets.js — 掃描各站台的素材資料夾，產生 manifest.json
   ------------------------------------------------------------
   用法：
     node scripts/sync-assets.js                          # 掃描全部站台
     node scripts/sync-assets.js --slug ginny-one-20260919
     node scripts/sync-assets.js --init --slug 新的slug    # 建立空的資料夾骨架

   資料夾長這樣（資料夾名稱＝站台的 slug）：

     public/assets/{slug}/
       cover.jpg              封面大圖（單頁邀請函）
       lobby.jpg              首頁固定背景（圖片）
       lobby.mp4              首頁固定背景（影片；放了就優先用影片）
       lobby-blur.jpg         大廳背景的模糊版（選填）
       bgm.mp3                背景音樂（沒放就用內建的音樂盒版愛的禮讚）
       gallery/               照片牆
         01.jpg  02.jpg …
       exhibition/            戀愛時光的展品
         01.jpg …
         meta.json            選填，每張的年份／標題／說明
       cards/                 囍卡
         01.png …
         meta.json            選填，卡片名稱／稀有度／描述
       cakes/                 甜點桌
         01.png …
         meta.json            選填，甜點名稱／emoji

   跑完會在 public/assets/{slug}/manifest.json 產生清單，
   網頁載入時會自動抓，不必手動一張一張填網址。

   ▸ 檔名排序即顯示順序，建議用 01、02、03 這種前綴。
   ▸ meta.json 是「選填」的說明檔，格式見 README。
   ▸ 換圖或加圖之後記得重新 deploy hosting 才會生效。
============================================================ */

import { parseArgs } from 'node:util';
import { readdirSync, existsSync, statSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS_ROOT = fileURLToPath(new URL('../public/assets/', import.meta.url));

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.svg']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov']);
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.wav']);

/* 單張圖片的「特別檔名」→ manifest 的欄位 */
const SINGLE_FILES = {
  cover: 'cover',
  lobby: 'lobby',
  'lobby-blur': 'lobbyBlur',
};

/* 單支影片的「特別檔名」→ manifest 的欄位（首頁固定背景用） */
const SINGLE_VIDEOS = {
  lobby: 'lobbyVideo',
};

/* 單支音檔的「特別檔名」→ manifest 的欄位（背景音樂） */
const SINGLE_AUDIO = {
  bgm: 'bgm',
};

/* 子資料夾 → manifest 的欄位 */
const FOLDERS = {
  gallery: 'gallery',
  exhibition: 'exhibition',
  cards: 'cards',
  cakes: 'cakes',
};

function isImage(name) {
  return IMAGE_EXT.has(extname(name).toLowerCase());
}

function isVideo(name) {
  return VIDEO_EXT.has(extname(name).toLowerCase());
}

function isAudio(name) {
  return AUDIO_EXT.has(extname(name).toLowerCase());
}

/* 依檔名自然排序：01 < 02 < 10（而不是字串排序的 1 < 10 < 2） */
function naturalSort(a, b) {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}

function listImages(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir).filter(isImage).sort(naturalSort);
}

/* 讀取選填的 meta.json；壞掉就當作沒有，不要讓整個流程停下來 */
function readMeta(dir) {
  const file = join(dir, 'meta.json');
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.warn(`   ⚠️ ${file} 不是有效的 JSON，已略過：${err.message}`);
    return {};
  }
}

/* 把一個子資料夾整理成 [{ src, ...meta }]
   meta.json 可以用檔名（含或不含副檔名）當 key 描述每張圖 */
function buildList(slug, folder, key) {
  const dir = join(ASSETS_ROOT, slug, folder);
  const files = listImages(dir);
  if (!files.length) return [];

  const meta = readMeta(dir);
  return files.map((file, i) => {
    const stem = basename(file, extname(file));
    const info = meta[file] || meta[stem] || {};
    return {
      src: `/assets/${slug}/${folder}/${file}`,
      order: i + 1,
      ...info,
    };
  });
}

/* 檔名比對不分大小寫：BGM.mp3、Cover.JPG 都認得 */
function findByStem(files, stem) {
  return files.find((f) => basename(f, extname(f)).toLowerCase() === stem.toLowerCase());
}

function buildManifest(slug) {
  const dir = join(ASSETS_ROOT, slug);
  /* 不放時間戳記：內容沒變時重跑不會產生 git 差異，
     才不會在 pull 的時候擋路 */
  const manifest = { slug };
  const used = new Set();

  const take = (files, map) => {
    for (const [stem, field] of Object.entries(map)) {
      const hit = findByStem(files, stem);
      if (hit) {
        manifest[field] = `/assets/${slug}/${hit}`;
        used.add(hit);
      }
    }
  };

  const rootFiles  = readdirSync(dir).filter(isImage);
  const rootVideos = readdirSync(dir).filter(isVideo);
  const rootAudio  = readdirSync(dir).filter(isAudio);

  take(rootFiles,  SINGLE_FILES);    /* 封面、大廳背景 */
  take(rootVideos, SINGLE_VIDEOS);   /* 首頁背景影片 */
  take(rootAudio,  SINGLE_AUDIO);    /* 背景音樂 */

  /* 檔名沒對上的素材會被忽略，這是最容易踩的坑，明確講出來 */
  manifest._ignored = [...rootFiles, ...rootVideos, ...rootAudio]
    .filter((f) => !used.has(f));

  /* 子資料夾 */
  for (const [folder, field] of Object.entries(FOLDERS)) {
    const list = buildList(slug, folder, field);
    if (list.length) manifest[field] = list;
  }

  return manifest;
}

function describe(manifest) {
  const bits = [];
  for (const [key, label] of [
    ['cover', '封面'], ['lobby', '首頁背景圖'], ['lobbyVideo', '首頁背景影片'],
    ['lobbyBlur', '大廳模糊背景'], ['bgm', '背景音樂'],
  ]) {
    if (manifest[key]) bits.push(label);
  }
  for (const [key, label] of [
    ['gallery', '照片牆'], ['exhibition', '戀愛時光'],
    ['cards', '囍卡'], ['cakes', '甜點桌'],
  ]) {
    if (manifest[key]) bits.push(`${label} ${manifest[key].length} 張`);
  }
  return bits.length ? bits.join('、') : '（資料夾是空的）';
}

/* 建立一份空的資料夾骨架，讓客戶的圖直接丟進來就好 */
function initFolder(slug) {
  const dir = join(ASSETS_ROOT, slug);
  if (existsSync(dir)) {
    console.log(`ℹ️  public/assets/${slug}/ 已經存在，只補上缺少的子資料夾。`);
  }
  mkdirSync(dir, { recursive: true });

  for (const folder of Object.keys(FOLDERS)) {
    const sub = join(dir, folder);
    mkdirSync(sub, { recursive: true });
    /* git 不會追蹤空資料夾，放個佔位檔；部署時會被 ignore 掉 */
    const keep = join(sub, '.gitkeep');
    if (!existsSync(keep)) writeFileSync(keep, '', 'utf8');
  }

  const readme = join(dir, 'README.md');
  if (!existsSync(readme)) {
    writeFileSync(readme, `# ${slug} 的素材

把檔案放進來之後，在專案根目錄執行：

    npm run sync-assets -- --slug ${slug}
    npx firebase deploy --only hosting

## 放這一層（檔名要一模一樣，副檔名不拘）

| 檔名 | 用途 |
|---|---|
| \`cover.jpg\` | 單頁邀請函的封面大圖 |
| \`lobby.jpg\` | 首頁固定背景（圖片） |
| \`lobby.mp4\` | 首頁固定背景（影片，放了就優先用影片） |
| \`bgm.mp3\` | 背景音樂，沒放就用內建的音樂盒版 |

## 放進子資料夾（檔名排序＝顯示順序，建議 01、02、03）

| 資料夾 | 用途 |
|---|---|
| \`gallery/\` | 照片牆 |
| \`exhibition/\` | 戀愛時光的展品 |
| \`cards/\` | 囍卡 |
| \`cakes/\` | 甜點桌 |

子資料夾可以放選填的 \`meta.json\` 補上文字，用檔名當 key：

\`\`\`json
{ "01": { "year": "2019", "title": "第一次見面", "desc": "朋友的聚會上" } }
\`\`\`

沒放的部分會用內建預設，不會壞掉。

## 抽卡小卡（\`cards/\`）

### 1. 卡圖放哪裡

放進 \`cards/\`，檔名建議 \`01\`、\`02\`、\`03\`…（檔名排序＝卡片順序）：

    public/assets/${slug}/cards/
      01.jpg
      02.jpg
      03.png
      meta.json

・副檔名可用 \`.jpg\` \`.jpeg\` \`.png\` \`.webp\` \`.gif\` \`.avif\` \`.svg\`
・建議直式 2:3、800×1200 以上
・\`meta.json\` 不是圖片，不會被當成一張卡
・**只要 \`cards/\` 裡有任何一張圖，內建的範例卡就整批被換掉**（全有或全無，不會混在一起）；資料夾空的就沿用內建範例卡

### 2. 改文字說明與星級

在 \`cards/meta.json\` 裡用檔名當 key（含不含副檔名都可以）：

\`\`\`json
{
  "01": { "name": "小時候的Mo", "rarity": "SSR", "desc": "不怕高又不怕鏡頭" },
  "02": { "name": "攝影師Momo", "rarity": "R" },
  "03": { "name": "馬祖的Momo", "rarity": "N" }
}
\`\`\`

| 欄位 | 說明 | 沒填的話 |
|---|---|---|
| \`name\` | 卡名，顯示在卡片下方 | 變成「囍卡 1」「囍卡 2」… |
| \`rarity\` | 星級：\`SSR\` / \`SR\` / \`R\` / \`N\` | 當作 \`N\` |
| \`desc\` | 一句話說明，顯示在大卡下方的小紙條 | 不顯示小紙條 |

### 3. 星級會影響什麼

・\`SSR\`、\`SR\`：卡面有彩虹光膜，抽到時放煙火
・\`R\`、\`N\`：一般卡，沒有光膜也沒有煙火
・**每張卡被抽中的機率都一樣**。想做「越稀有越難抽」，就讓高星級的卡少放幾張、\`N\` 卡多放幾張

### 4. 改完記得重跑

\`\`\`
npm run sync-assets -- --slug ${slug}
npx firebase deploy --only hosting
\`\`\`

\`meta.json\` 改字、改星級也一樣要重跑一次 \`sync-assets\`，因為網頁讀的是產生出來的 \`manifest.json\`。
`, 'utf8');
  }

  console.log(`✅ 已建立 public/assets/${slug}/`);
  console.log('   gallery/  exhibition/  cards/  cakes/');
  console.log('   放好檔案後再跑一次（不加 --init）產生清單。');
}

function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      slug: { type: 'string' },
      init: { type: 'boolean', default: false },
    },
  });

  if (values.init) {
    if (!values.slug) {
      console.error('❌ --init 需要搭配 --slug 指定站台代稱');
      process.exit(1);
    }
    initFolder(values.slug);
    return;
  }

  if (!existsSync(ASSETS_ROOT)) {
    console.error(`❌ 找不到素材資料夾：${ASSETS_ROOT}`);
    process.exit(1);
  }

  let slugs = readdirSync(ASSETS_ROOT)
    .filter((name) => statSync(join(ASSETS_ROOT, name)).isDirectory())
    .filter((name) => !name.startsWith('.') && name !== 'e2e')
    .sort();

  if (values.slug) {
    if (!slugs.includes(values.slug)) {
      console.error(`❌ 找不到資料夾：public/assets/${values.slug}/`);
      console.error(`   目前有：${slugs.join('、') || '（沒有任何站台資料夾）'}`);
      process.exit(1);
    }
    slugs = [values.slug];
  }

  if (!slugs.length) {
    console.log('沒有找到任何站台素材資料夾。');
    console.log('建立 public/assets/{slug}/ 並放進圖片後再跑一次。');
    return;
  }

  for (const slug of slugs) {
    const manifest = buildManifest(slug);
    const ignored = manifest._ignored || [];
    delete manifest._ignored;

    writeFileSync(
      join(ASSETS_ROOT, slug, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
    console.log(`✅ ${slug}`);
    console.log(`   ${describe(manifest)}`);

    if (ignored.length) {
      console.log(`   ⚠️ 這些檔案的檔名沒對上，不會被使用：${ignored.join('、')}`);
      console.log('      放在這一層的檔案必須命名為 cover / lobby / lobby-blur / bgm，');
      console.log('      其他圖片請放進 gallery／exhibition／cards／cakes 子資料夾。');
    }
  }

  console.log('');
  console.log('素材清單已更新。記得重新部署才會生效：');
  console.log('  npx firebase deploy --only hosting');
}

main();
