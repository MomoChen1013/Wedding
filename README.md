# 婚禮網站模板

みなと製作所 Minato Studio 的婚禮網站模板。
多組新人共用**同一套程式碼與同一個 Firebase 專案**，
靠 `siteId` 做資料分層，靠 Security Rules 做權限隔離。

每組新人有自己的網址、內容、照片，還能**各自決定要開哪些頁面**。

| 網址 | 內容 |
|---|---|
| `/w/{slug}/` | 大廳（入場 gate + 場景導覽）**一定有** |
| `/w/{slug}/info` | 婚禮資訊 |
| `/w/{slug}/rsvp` | 出席回覆 |
| `/w/{slug}/wall` | 祝福牆 |
| `/w/{slug}/cake` | 甜點桌 |
| `/w/{slug}/draw` | 囍卡抽卡 |
| `/w/{slug}/exhibition` | 戀愛時光 |
| `/w/{slug}/quiz` | 新人小測驗 |
| `/w/{slug}/inbox` | 悄悄話信箱 |
| `/w/{slug}/invitation` | 單頁式邀請函（獨立版型） |
| `/s/{code}` | 短連結 |

除了大廳以外，每一頁都可以個別開關。關掉的頁面：大廳不會出現入口，
直接輸入網址也會被導回大廳。

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
│   ├─ info.html  rsvp.html  wall.html  cake.html
│   ├─ draw.html  exhibition.html  quiz.html  inbox.html
│   ├─ invitation.html        # 單頁式邀請函（獨立版型，自成一格）
│   ├─ shortlink.html         # 短連結轉址頁
│   ├─ 404.html
│   ├─ assets/{slug}/         # 每組新人的照片
│   ├─ css/
│   └─ js/
│       ├─ site-context.js    # ★ 每頁唯一進入點：解析 slug、載設定、注入其他 JS
│       ├─ common.js          # 資料層 DataStore、導覽、特效、樣板文字
│       └─ index.js info.js rsvp.js …   # 各頁邏輯
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
  pages(map)            # 每個頁面開關，如 { info:true, cake:false, … }
  inboxPassword(string) # 悄悄話信箱的密碼
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
   網址   : https://minato.3udesign.website/w/chen-lin-0315
   已開頁面 : 大廳（固定）、info、rsvp、wall
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
| `--owner-email` | | 新人聯絡信箱 |
| `--status` | | `draft`／`published`／`archived`，**預設 `draft`** |
| `--rsvp-deadline` | | RSVP 截止日 `YYYY-MM-DD`，預設同婚禮日期 |
| `--rsvp-enabled` | | `true`／`false`，預設 `true` |
| `--pages` | | 逗號分隔，直接指定要開哪些頁。不給則預設 `info,rsvp,wall` |
| `--enable` | | 在預設之外加開某頁；**可重複給多次** |
| `--disable` | | 關掉某頁；**可重複給多次** |
| `--inbox-password` | | 悄悄話信箱密碼，預設 `1010` |

### 頁面開關

可開關的頁面：`info` `rsvp` `wall` `cake` `draw` `exhibition` `quiz` `inbox` `invitation`
（大廳 `lobby` 一定存在，不能關）。

```bash
# 全套都要
--pages info,rsvp,wall,cake,draw,exhibition,quiz,inbox,invitation

# 只要基本款（不給 --pages 時的預設）
# → info, rsvp, wall

# 預設之外再加抽卡與測驗
--enable draw --enable quiz

# 預設裡不要祝福牆
--disable wall
```

之後要改，到 Firebase Console → Firestore → 該筆 `sites` 文件 → `pages` 欄位
把對應的 boolean 改掉即可，**不用重新部署**。

> **注意**：預設是 `draft`，賓客會看到 404。
> 內容確認好之後，到 Firebase Console 把 `status` 改成 `published` 才會對外公開。

### 照片怎麼放

把圖片放進 `public/assets/{slug}/`，例如：

```
public/assets/chen-lin-0315/cover.jpg
public/assets/chen-lin-0315/01.jpg
public/assets/chen-lin-0315/02.jpg
```

然後用**根目錄開頭的路徑**指定（不要用完整網址）：

```bash
node scripts/create-site.js \
  --slug chen-lin-0315 --groom 陳彥廷 --bride 林佳蓉 --date 2027-03-15 \
  --cover /assets/chen-lin-0315/cover.jpg \
  --photo /assets/chen-lin-0315/01.jpg \
  --photo /assets/chen-lin-0315/02.jpg \
  --hashtag 陳林2027 --hashtag 我們結婚了 \
  --dress-code "溫柔大地色系・香檳金／裸粉／霧綠" \
  --gift-note "您願意撥空前來，就是給我們最好的禮物 ♡" \
  --status published
```

換圖或加圖之後要重新部署才會生效：

```bash
npx firebase deploy --only hosting
```

建議事先壓到寬度 1600px 以內、單張 300KB 左右；照片牆是 4:5 直式裁切。

### 保留字

以下 slug 不能使用：`admin`、`api`、`www`、`app`、`w`、`s`、`assets`、`static`

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

會種兩組測試站台（一組全開、一組只開 info），用 Chromium 跑完整流程：

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
| `sites/{siteId}/letters` | ⚠️ ✅ | ✅（需通過驗證） | ❌ | ❌ |
| `sites/{siteId}/cakes` | ✅ | ✅（需通過驗證） | ❌ | ❌ |
| `sites/{siteId}/compat` | ✅ | ✅（需通過驗證） | ❌ | ✅（新人重置票數） |
| `sites/{siteId}/collected` | 只能讀自己的 | ✅（需登入且 uid 相符） | ❌ | ❌ |
| `sites/{siteId}/meta/hearts` | ✅ | 只能一次 +1 | | |
| `slugs/{slug}` | ✅ | ❌ | ❌ | ❌ |
| `short/{code}` | ✅ | ❌ | ❌ | ❌ |

所有寫入都會再檢查：**站台必須是 `published`**，且**該頁面必須是開啟的**。
關掉的頁面連 API 都寫不進去，不只是畫面藏起來而已。

> ### ⚠️ 悄悄話信箱不是真的私密
> `letters` 開放 read 是為了讓 `inbox` 頁面能運作。
> 這代表**任何人只要知道 siteId，就能繞過網頁把全部悄悄話抓下來**。
> 這是沿用既有設計的既有風險。若要真正保密，把 `firestore.rules` 裡
> `letters` 的 `allow read` 改成 `false`，改用管理端匯出查看
> （`inbox` 頁面屆時會失去功能）。

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
