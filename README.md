# 婚禮網站模板

みなと製作所 Minato Studio 的婚禮網站模板。
多組新人共用**同一套程式碼與同一個 Firebase 專案**，
靠 `siteId` 做資料分層，靠 Security Rules 做權限隔離。

每組新人有自己的網址、內容、照片，還能**各自決定要開哪些頁面**。

| 網址 | 內容 |
|---|---|
| `/w/{slug}/` | 首頁（入場 gate + 婚禮資訊 + 卡片連結）**一定有** |
| `/w/{slug}/rsvp` | 出席回覆 |
| `/w/{slug}/wall` | 祝福牆 |
| `/w/{slug}/cake` | 集氣送祝褔（甜點桌） |
| `/w/{slug}/draw` | 抽卡 |
| `/w/{slug}/exhibition` | 我們的故事 |
| `/w/{slug}/quiz` | 看你多了解我們 |
| `/w/{slug}/inbox` | 悄悄話信箱 |
| `/w/{slug}/invitation` | 單頁式邀請函（獨立版型） |
| `/s/{code}` | 短連結 |

除了首頁以外，每一頁都可以個別開關。關掉的頁面：首頁與導覽列不會出現入口，
直接輸入網址也會被導回首頁。

> 婚禮資訊原本是獨立的 `/w/{slug}/info`，現在已經併進首頁。
> 舊網址由 Hosting 的 301 轉址導回首頁，先前發出去的連結不會壞掉。

---

## 版面與風格

- **導覽列**：每一頁最上方都有，依序是「新人名稱（首頁）、祝福、故事、測驗、抽卡、集氣、User」。
  由 `js/common.js` 統一注入，站台沒開的頁面不會出現在列上。
- **首頁**：固定背景（一張圖或一段影片，滾動時不動）→ 置中開場（`h1` + `.cn`）→
  婚禮資訊卡 → 當日流程 → Dress Code → 日期倒數 → RSVP → 五張卡片連結（兩欄）。
- **每頁的 `.scene-hero`** 固定 50vh。
- **風格**：極簡線條。全站單一字族 **Noto Serif TC**（Google Fonts CDN），
  無陰影、無 emoji，靠 1px 線條與留白分層。
- **BGM**：艾爾加〈愛的禮讚 Salut d'Amour〉，用 Web Audio 合成，不需額外音檔。
  想換曲子改 `js/common.js` 的 `_MELODY` 即可。

---

## 目錄結構

```
/
├─ SPEC.md                    # 規格書
├─ README.md                  # 本文件
├─ firebase.json              # Hosting rewrite 與 emulator 設定
├─ .firebaserc                # 預設 Firebase 專案
├─ firestore.rules            # 安全規則（權限邊界都在這裡）
├─ firestore.indexes.json
├─ public/
│   ├─ index.html             # 大廳
│   ├─ rsvp.html  wall.html  cake.html
│   ├─ draw.html  exhibition.html  quiz.html  inbox.html
│   ├─ invitation.html        # 單頁式邀請函（獨立版型，自成一格）
│   ├─ shortlink.html         # 短連結轉址頁
│   ├─ 404.html
│   ├─ assets/{slug}/         # 每組新人的照片
│   ├─ css/
│   └─ js/
│       ├─ site-context.js    # ★ 每頁唯一進入點：解析 slug、載設定、注入其他 JS
│       ├─ common.js          # 資料層 DataStore、導覽、特效、樣板文字
│       └─ index.js rsvp.js …           # 各頁邏輯
├─ scripts/
│   ├─ create-site.js         # 建立客戶站台（slug transaction）
│   ├─ export-rsvps.js        # 匯出某站台的 RSVP 成 CSV
│   └─ create-short-link.js
└─ tests/
    ├─ rules.test.mjs         # Security Rules 測試
    ├─ e2e.mjs                # 單頁邀請函的瀏覽器測試
    └─ multipage.mjs          # 多頁面站台的瀏覽器測試
```

### 一頁是怎麼跑起來的

每個 HTML 只掛一支 `<script type="module" src="/js/site-context.js">`，
`<body data-page="cake">` 標明自己是哪一頁。site-context 依序做：

1. 從 `/w/{slug}/xxx` 解析 slug
2. 查 `slugs/{slug}` → 讀 `sites/{siteId}`
3. 站台不存在／未發布 → 顯示中文找不到畫面
4. 這頁沒開啟 → 導回大廳
5. 把設定攤成 `window.SITE`（siteId、slug、pathFor…）與 `window.WED`（新人名字、日期…）
6. **這時才**依序注入 `common.js` 與該頁自己的 JS

第 6 步是關鍵：各頁 JS 一載入就會讀 `window.WED`、操作畫面，
所以必須等設定到齊。全部就緒後會在 `<html>` 標上 `data-site-ready="1"`。

### 頁面上的文字怎麼換成客戶的

HTML 裡直接寫 `{{couple}}`、`{{date}}`、`{{hashtag}}` 這類 token，
`common.js` 的 `fillTemplates()` 會在載入時換成這組新人的資料
（文字節點與 `placeholder`／`alt`／`title`／`content` 屬性都會處理）。

可用 token：`couple`、`coupleCn`、`groom`、`bride`、`date`、`weekday`、`time`、
`venue`、`address`、`dressCode`、`giftNote`、`story`、`hashtag`。

---

## 資料模型

```
sites/{siteId}
  slug, ownerEmail, status(draft|published|archived)
  groomName, brideName
  eventDate(timestamp), eventEndDate(timestamp|null)
  timezone(IANA，預設 Asia/Taipei)
  venueName, venueAddress, venueMapUrl
  themeColor(hex), coverImageUrl, story
  photos(string[]), hashtags(string[])
  dressCode, giftNote
  rsvpDeadline(timestamp), rsvpEnabled(bool)
  pages(map)            # 每個頁面開關，如 { wall:true, cake:false, … }
  ownerEmails(string[]) # 新人的 Google 信箱；決定誰讀得到悄悄話信箱
  createdAt, updatedAt

  # ↓ 各功能的資料都掛在這組新人底下，站台之間完全看不到彼此
  rsvps/{autoId}       name, attending(bool), tentative(bool), guestCount(1–10),
                       meal, dietaryNote, message, icon, createdAt
  wishes/{autoId}      name, icon, text, time          # 祝福牆
  letters/{autoId}     name, icon, text, time          # 悄悄話信箱
  cakes/{autoId}       name, icon, cake, emoji, img, time
  compat/{autoId}      answers[], time                 # 新人小測驗
  collected/{autoId}   uid, userName, art, name, rarity, desc, time
  meta/hearts          count                           # 愛心計數器
  meta/letterCount     count                           # 公開的信件數量

slugs/{slug}                # 文件 ID 就是 slug 本身
  siteId, createdAt

short/{code}                # 6 碼短連結
  target, createdAt, hits
```

**為什麼要有 `slugs` 集合**：Firestore 沒有「欄位唯一性」約束，
用 slug 當文件 ID 的獨立集合，才能靠 transaction 保證不撞名。

**關於 `timezone`**：婚禮時間一律以**婚禮當地時區**顯示。
若不存這個欄位，海外賓客打開邀請函會看到自己時區換算後的時間（例如台灣的
12:00 婚宴，日本賓客會看到 13:00）。

---

## 前置作業（只需做一次）

1. 到 [Firebase Console](https://console.firebase.google.com) 建立專案
   （目前使用 `wedding-22b94`，已寫在 `.firebaserc`）。
2. 左側啟用 **Firestore Database**（正式模式）與 **Hosting**。
3. 產生管理端金鑰：專案設定 → 服務帳戶 → 產生新的私密金鑰，下載 JSON。
4. 安裝相依套件：

   ```bash
   npm install
   ```

5. 設定金鑰路徑（每次開新終端機都要，或寫進 `~/.zshrc`）：

   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json
   ```

   > ⚠️ 這個 JSON 有完整資料庫權限，**絕對不要 commit 進 git**。

---

## 部署

> ### ⚠️ 合併到 main 不會更新網站
> Git 的 merge 只是把程式碼合進分支，**網站不會自己更新**。
> 每次改完都要重新部署，順序是：
>
> ```
> merge → git pull → npx firebase deploy
> ```
>
> 只改 Firestore 裡的資料（例如 `status`、`pages`）則**不需要**部署，
> 重整網頁就生效。

```bash
# 部署安全規則（改完 firestore.rules 一定要跑）
npx firebase deploy --only firestore:rules

# 部署網站
npx firebase deploy --only hosting

# 兩個一起
npx firebase deploy
```

---

## 新增一組客戶

```bash
node scripts/create-site.js \
  --slug chen-lin-0315 \
  --groom 陳彥廷 \
  --bride 林佳蓉 \
  --date 2026-03-15
```

成功會印出：

```
✅ 站台建立成功！
   siteId : gSUcido0TA8v4tlNhYbN
   slug   : chen-lin-0315
   網址   : https://minato-studio-wedding.web.app/w/chen-lin-0315/
   已開頁面 : 首頁（固定）、rsvp、wall
```

### 完整參數

| 參數 | 必填 | 說明 |
|---|---|---|
| `--slug` | ✅ | 網址代稱，小寫英數與連字號，3–40 字，全域唯一 |
| `--groom` | ✅ | 新郎姓名 |
| `--bride` | ✅ | 新娘姓名 |
| `--date` | ✅ | 婚禮日期 `YYYY-MM-DD` |
| `--time` | | 婚禮時間 `HH:mm`，預設 `12:00` |
| `--timezone` | | 婚禮所在時區（IANA），預設 `Asia/Taipei` |
| `--venue` | | 場地名稱 |
| `--address` | | 場地地址 |
| `--map-url` | | 自訂 Google Maps 連結；留空會自動用地址搜尋 |
| `--theme-color` | | 主題色 hex，預設 `#3D9AD1` |
| `--cover` | | 封面圖片網址 |
| `--story` | | 兩人的故事，支援換行 |
| `--photo` | | 照片牆圖片；**可重複給多次**，順序即顯示順序 |
| `--hashtag` | | 婚禮 hashtag；**可重複給多次**，沒寫 `#` 會自動補 |
| `--dress-code` | | 服裝建議 |
| `--gift-note` | | 禮金說明 |
| `--end-time` | | 婚宴結束時間 `HH:mm`（加入行事曆用），預設開始後 3 小時 |
| `--owner-email` | | 新人的 Google 信箱，**信箱頁面要靠它登入**；可重複給多次 |
| `--status` | | `draft`／`published`／`archived`，**預設 `draft`** |
| `--rsvp-deadline` | | RSVP 截止日 `YYYY-MM-DD`，預設同婚禮日期 |
| `--rsvp-enabled` | | `true`／`false`，預設 `true` |
| `--pages` | | 逗號分隔，直接指定要開哪些頁。不給則預設 `rsvp,wall` |
| `--enable` | | 在預設之外加開某頁；**可重複給多次** |
| `--disable` | | 關掉某頁；**可重複給多次** |

### 頁面開關

可開關的頁面：`rsvp` `wall` `cake` `draw` `exhibition` `quiz` `inbox` `invitation`
（大廳 `lobby` 一定存在，不能關）。

```bash
# 全套都要
--pages rsvp,wall,cake,draw,exhibition,quiz,inbox,invitation

# 只要基本款（不給 --pages 時的預設）
# → rsvp, wall

# 預設之外再加抽卡與測驗
--enable draw --enable quiz

# 預設裡不要祝福牆
--disable wall
```

之後要改，到 Firebase Console → Firestore → 該筆 `sites` 文件 → `pages` 欄位
把對應的 boolean 改掉即可，**不用重新部署**。

> **注意**：預設是 `draft`，賓客會看到 404。
> 內容確認好之後，到 Firebase Console 把 `status` 改成 `published` 才會對外公開。

---

## 素材（照片）怎麼放

**用站台的 slug 當資料夾名稱，把圖丟進去，跑一個指令就好**，
不必一張一張填網址。

### 1. 建立資料夾骨架

```bash
npm run sync-assets -- --init --slug ginny-one-20260919
```

會建好 `gallery/` `exhibition/` `cards/` `cakes/` 四個子資料夾，
外加一份說明用的 `README.md`（不會被部署上線）。

### 2. 放圖

```
public/assets/{slug}/
├─ cover.jpg          封面大圖（單頁邀請函）
├─ lobby.jpg          首頁固定背景（圖片）
├─ lobby.mp4          首頁固定背景（影片，選填；放了就優先用影片）
├─ lobby-blur.jpg     大廳背景的模糊版（選填）
├─ gallery/           照片牆
│   ├─ 01.jpg
│   ├─ 02.jpg
│   └─ 03.jpg
├─ exhibition/        戀愛時光的展品
│   ├─ 01.jpg
│   └─ meta.json      （選填）每張的年份／標題／說明
├─ cards/             囍卡
│   ├─ 01.png
│   └─ meta.json      （選填）卡片名稱／稀有度／描述
└─ cakes/             甜點桌
    ├─ 01.png
    └─ meta.json      （選填）甜點名稱／emoji
```

**檔名排序就是顯示順序**，建議用 `01`、`02`、`03` 這種前綴。

| 類型 | 支援格式 |
|---|---|
| 圖片 | `.jpg` `.jpeg` `.png` `.webp` `.gif` `.avif` `.svg` |
| 影片（首頁背景） | `.mp4` `.webm` `.mov` |
| 音樂 | `.mp3` `.m4a` `.aac` `.ogg` `.wav` |

### 背景音樂

把音檔命名成 **`bgm.mp3`**（或上表其他音訊格式）放進站台資料夾，
**跑一次 `npm run sync-assets`**，再 deploy，右下角的音符按鈕就會播它並自動循環。

> ⚠️ **只把檔案丟進資料夾是不夠的。**
> 網頁讀的是 `manifest.json`，沒跑 `sync-assets` 就不會更新，
> 畫面上會繼續播內建的音樂。順序是：
> **放檔案 → `npm run sync-assets` → `npx firebase deploy --only hosting`**

檔名不分大小寫（`BGM.MP3` 也認得）。如果檔名沒對上，
`sync-assets` 會直接把「這些檔案不會被使用」列出來，不會安靜地忽略。

- **沒放音檔的站台**會用內建的合成音樂——艾爾加〈愛的禮讚〉音樂盒版，
  這是程式即時合成的，repo 裡沒有音檔，也不會有授權問題。
- 音檔載入失敗時會自動退回內建音樂，不會變成沒聲音。
- 音樂**不會自動播放**，一定要賓客按下按鈕才會響（瀏覽器的規定，擋不掉）。

> ⚠️ **版權**：放自己的音檔前請確認你有權使用。
> 商業用途的婚禮網站播放流行歌是需要授權的，
> 建議用免版稅音樂或公共領域曲目。

### 3. 跑掃描指令

```bash
npm run sync-assets                        # 掃描全部站台
npm run sync-assets -- --slug chen-lin-0315   # 只掃一組
```

會在每個資料夾產生 `manifest.json`，並印出掃到什麼：

```
✅ chen-lin-0315
   封面、大廳背景、照片牆 12 張、戀愛時光 8 張、囍卡 20 張、甜點桌 6 張
```

### 4. 部署

```bash
npx firebase deploy --only hosting
```

網頁載入時會自動抓 `manifest.json`，把封面、大廳背景、照片牆、
展品、囍卡、甜點全部換成這組新人的素材。
**沒放素材的站台會沿用內建的預設圖，不會壞掉。**

### meta.json：幫圖片加文字說明

放在子資料夾裡，用**檔名（可含或不含副檔名）當 key**：

`public/assets/{slug}/exhibition/meta.json`
```json
{
  "01": { "year": "2019", "title": "第一次見面", "desc": "朋友的聚會上", "act": "第一幕" },
  "02": { "year": "2023", "title": "求婚那天", "desc": "在海邊", "act": "第二幕" }
}
```

`public/assets/{slug}/cards/meta.json`
```json
{
  "01": { "name": "戀愛中的新娘", "rarity": "SSR", "desc": "笑起來有酒窩" },
  "02": { "name": "認真工作的新郎", "rarity": "N" }
}
```

`public/assets/{slug}/cakes/meta.json`
```json
{
  "01": { "name": "草莓千層", "emoji": "🍓" },
  "02": { "name": "抹茶生乳捲", "emoji": "🍵" }
}
```

沒寫 `meta.json` 也能用，只是名稱會變成「囍卡 1」「甜點 2」這種預設值。

### 範例資料夾

`public/assets/demo-wedding-2027/` 是一份可以直接照抄的範例
（含三種 `meta.json`）。它被列在 `firebase.json` 的 `ignore` 裡，
**不會被部署上線**，只是留在 repo 當參考。

### 也可以手動指定

`--cover` 與 `--photo` 仍然有效，而且**優先於資料夾掃描的結果**——
Firestore 裡有填就用填的，沒填才用素材資料夾。

建議事先壓到寬度 1600px 以內、單張 300KB 左右；照片牆是 4:5 直式裁切。

### 保留字

以下 slug 不能使用：`admin`、`api`、`www`、`app`、`w`、`s`、`assets`、`static`

---

## 站台打不開？先跑診斷

```bash
node scripts/check-site.js --slug ginny-one-20260919
node scripts/check-site.js                    # 不加參數 = 列出全部站台
```

會一路檢查 `slugs` → `sites` → `status` → `pages` → RSVP → `ownerEmails`，
把問題直接指出來，並印出所有可用的網址。

### 兩種「找不到」長得不一樣，先分清楚

| 畫面 | 意思 | 怎麼修 |
|---|---|---|
| **「404 找不到這個頁面」** | Hosting 層級：請求連 `index.html` 都沒進到 | 網域或部署的問題，見下 |
| **「找不到這張邀請函」** | 網頁有載入，但 Firestore 查不到這個站台 | 資料問題，跑上面的診斷指令 |

### Hosting 層級的 404

先用 Firebase 的**預設網域**測，把自訂網域的變因排除掉：

```
https://wedding-22b94.web.app/w/{slug}/
```

- **預設網域打得開、自訂網域不行** → `minato.3udesign.website` 還沒指到這個專案。
  到 Firebase Console → Hosting → 新增自訂網域，照指示在網域商加 A／TXT 記錄。
  新專案是空的，網域不會自己跟過來。
- **兩個都打不開** → hosting 沒部署成功，重跑 `npx firebase deploy --only hosting`。

---

## 匯出 RSVP

賓客的回覆**前端讀不到**（Security Rules 擋掉），只能用管理端金鑰匯出：

```bash
# 印到畫面
node scripts/export-rsvps.js --slug chen-lin-0315

# 存成檔案
node scripts/export-rsvps.js --slug chen-lin-0315 --out chen-lin.csv
```

輸出範例：

```
✅ 匯出完成！
   站台   : 陳彥廷 & 林佳蓉
   回覆數 : 3 筆
   出席   : 2 組・共 5 位
   檔案   : chen-lin.csv
```

CSV 帶 UTF-8 BOM，Excel 直接打開不會亂碼；時間以婚禮當地時區顯示。

---

## 短連結

```bash
# 用 slug 自動組網址
node scripts/create-short-link.js --slug chen-lin-0315

# 直接指定目標
node scripts/create-short-link.js --target https://example.com/some/page

# 指定代號
node scripts/create-short-link.js --slug chen-lin-0315 --code abc123
```

代號為 6 碼隨機英數（已排除 `0/o/l/1` 等易混淆字元），建立時用 transaction 確認未撞號。

> **已知限制**：`hits` 欄位目前**不會自動累加**。
> 規則禁止前端寫入 `short/`（否則任何人都能竄改轉址目標），
> 而累加需要伺服器端寫入。若之後真的需要點擊統計，
> 得加一支 Cloud Function 才能做，目前先保留欄位不啟用。

---

## 自訂網域

客人若想用自己的網域（例如 `chen-lin-wedding.com`），
需要到 **Firebase Hosting → 新增自訂網域**逐一手動設定，並請客人在網域商
那邊加上 Firebase 指定的 A／TXT 記錄。10 組以內的規模這樣做是可以接受的。

**不要嘗試 wildcard 子網域方案**（`*.minato.3udesign.website`）：
Firebase Hosting 不支援 wildcard 子網域，做不到。

另外，**Firebase Dynamic Links 已於 2025-08 停止服務**，
本專案的短連結是自建的，沒有用到該服務。

---

## 測試

### Security Rules 測試

```bash
npm run test:rules
```

預期輸出：

```
 Test Files  1 passed (1)
      Tests  19 passed (19)
```

涵蓋：合法 RSVP 可建立、RSVP 不可讀取／修改／刪除、
`sites` 與 `slugs` 不可被前端寫入、夾帶額外欄位會被拒、
`guestCount: 99` 會被拒、過了 `rsvpDeadline` 會被拒、
`rsvpEnabled: false` 與非 `published` 站台會被拒。

### 多頁面站台測試

```bash
npm run test:multipage
```

會種兩組測試站台（一組全開、一組只開 rsvp），用 Chromium 跑完整流程：

```
[1]  每個頁面都能正常載入      # 9 頁 × 載入/siteId/無 console 錯誤
[2]  站內連結已 slug 化        # 沒有殘留 xxx.html
[2b] 新人名字有套進畫面        # 兩組站台各自顯示自己的名字與日期
[3]  頁面開關                  # 未啟用不出現在大廳、直接開網址導回大廳
[4]  祝福牆寫入隔離            # 寫進本站台，另一組看不到
[5]  RSVP 寫入                 # attending 為 boolean、guestCount、meal
[6]  未定回覆                  # maybe → attending:false + tentative:true
[7]  不存在的 slug             # 中文找不到畫面
[8]  手機版無水平捲動
[9]  素材資料夾自動載入      # manifest、大廳背景、甜點、囍卡、展品
[10] 信箱權限                # 賓客寫得進、讀不到；數量看得到
```

### 單頁邀請函測試

```bash
npm run test:e2e
```

會自動寫入測試資料並用 Chromium 跑完整流程，預期全部 ✅：

```
[1]  /w/{slug}/invitation   # 內容、主題色、時區、倒數、照片牆、hashtag、行事曆
[1b] 照片放大               # 點圖開啟、Esc 關閉
[2]  /w/wu-yang-1220        # 另一組 slug，主題色與內容互不干擾、空欄位區塊隱藏
[3]  /w/does-not-exist      # 中文 404 畫面，非白畫面且無 console 錯誤
[4]  draft 站台             # 未發布顯示 404
[4b] RSVP 截止與關閉
[5]  RSVP 送出流程          # 不跳頁、成功狀態、寫入欄位正確
[6]  honeypot 擋機器人      # 畫面顯示成功但確認未寫入 Firestore
[8]  短連結 /s/{code}       # 正常轉址、不存在代號、javascript: 協定被擋
[7]  手機版 RWD（375px）    # 無水平捲動
```

### 全部一起跑

```bash
npm run test:all
```

### 本機預覽

```bash
npm run emulators
```

頁面偵測到 `localhost`／`127.0.0.1` 時，**預設會連本機的 Firestore emulator**，
不會碰到正式資料。有兩種用法：

**A. 用 emulator 的假資料試版型**

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  node scripts/create-site.js --slug test-site --groom 測 --bride 試 \
  --date 2027-01-01 --status published
```

開 <http://127.0.0.1:5000/w/test-site/>

**B. 預覽正式資料庫裡真實的站台** —— 網址加上 `?live=1`

```
http://127.0.0.1:5000/w/你的slug/?live=1
http://127.0.0.1:5000/w/你的slug/cake?live=1
```

沒加 `?live=1` 的話會去讀空的 emulator，你會看到 404 而不是站台內容。
改完模板要上線就跑 `npx firebase deploy --only hosting`。

---

## 安全性設計

權限邊界完全靠 `firestore.rules`，不靠專案隔離：

| 路徑 | read | create | update | delete |
|---|---|---|---|---|
| `sites/{siteId}` | ✅ | ❌ | ❌ | ❌ |
| `sites/{siteId}/rsvps` | ❌ | ✅（需通過驗證） | ❌ | ❌ |
| `sites/{siteId}/wishes` | ✅ | ✅（需通過驗證） | ❌ | ❌ |
| `sites/{siteId}/letters` | 只有 `ownerEmails` 名單內的已驗證 Google 帳號 | ✅（需通過驗證） | ❌ | ❌ |
| `sites/{siteId}/cakes` | ✅ | ✅（需通過驗證） | ❌ | ❌ |
| `sites/{siteId}/compat` | ✅ | ✅（需通過驗證） | ❌ | ✅（新人重置票數） |
| `sites/{siteId}/collected` | 只能讀自己的 | ✅（需登入且 uid 相符） | ❌ | ❌ |
| `sites/{siteId}/meta/hearts` | ✅ | 只能一次 +1 | | |
| `sites/{siteId}/meta/letterCount` | ✅ | 只能一次 +1 | | |
| `slugs/{slug}` | ✅ | ❌ | ❌ | ❌ |
| `short/{code}` | ✅ | ❌ | ❌ | ❌ |

所有寫入都會再檢查：**站台必須是 `published`**，且**該頁面必須是開啟的**。
關掉的頁面連 API 都寫不進去，不只是畫面藏起來而已。

### 悄悄話信箱：用 Google 帳號保護

`letters` 的讀取由規則檢查 **Google 帳號的已驗證信箱**是否在
`sites.ownerEmails` 名單內。這是伺服器端驗證，前端偽造不了。

```bash
node scripts/create-site.js --slug chen-lin-0315 … \
  --owner-email groom@gmail.com \
  --owner-email bride@gmail.com
```

新人到 `/w/{slug}/inbox` 按「用 Google 帳號登入」，
名單內的帳號才進得去；其他人（含賓客）連 API 都讀不到。

- 賓客**寫得進去、讀不出來**
- 祝福牆上的「已有 N 封信」用另一個公開計數器 `meta/letterCount`，
  只看得到數量、看不到內容
- 沒設定 `--owner-email` 的站台，信箱頁面會直接說「還沒設定新人的 Google 信箱」

> **為什麼不用密碼？**
> Firestore 的讀取請求不帶 payload，規則無法驗證「使用者輸入的密碼」。
> 密碼門只能擋住畫面，資料仍可透過 API 取得，等於沒有保護。
> 要真的保密就必須用 Auth 身分，所以這裡改成 Google 登入。

RSVP 建立時必須全數通過：

- 欄位集合**完全等於**允許清單，不可夾帶額外欄位
- `name` 為 string，長度 1–40
- `attending` 為 boolean
- `guestCount` 為 int，1–10
- `dietaryNote`、`message` 為 string，長度 ≤ 300
- `createdAt` 必須等於 `request.time`（防止偽造時間）
- 對應的 `sites/{siteId}` 存在、`status == "published"`、`rsvpEnabled == true`
- 尚未超過 `rsvpDeadline`

所有寫入 `sites`／`slugs`／`short` 的操作都走 **Admin SDK**（`scripts/` 底下的腳本），
Admin SDK 以服務帳戶連線，會略過 Security Rules，因此不需要為管理端在規則裡開後門。

前端另有 honeypot 隱藏欄位擋機器人：機器人填了該欄位時，
畫面照樣顯示成功，但實際不寫入資料庫。
