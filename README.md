# 婚禮邀請函網站模板

みなと製作所 Minato Studio 的婚禮邀請函模板。
多組新人共用**同一個 Firebase 專案**，靠 `siteId` 做資料分層，靠 Security Rules 做權限隔離。

- 邀請函網址：`https://minato.3udesign.website/w/{slug}`
- 短連結：`https://minato.3udesign.website/s/{code}`

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
│   ├─ invitation.html        # 邀請函主頁（含 RSVP 表單）
│   ├─ shortlink.html         # 短連結轉址頁
│   ├─ 404.html
│   ├─ assets/
│   ├─ index.html, cake.html, …   # ← 既有的 Ethan & Momo 單場婚禮站（見下方說明）
│   ├─ css/  js/                  # ← 同上
├─ scripts/
│   ├─ create-site.js         # 建立客戶站台（slug transaction）
│   ├─ export-rsvps.js        # 匯出某站台的 RSVP 成 CSV
│   └─ create-short-link.js
└─ tests/
    ├─ rules.test.mjs         # Security Rules 測試
    └─ e2e.mjs                # 瀏覽器端整合測試
```

> **關於 `public/` 底下的既有頁面**
> `index.html`、`cake.html`、`draw.html`、`exhibition.html`、`inbox.html`、
> `quiz.html`、`rsvp.html`、`wall.html` 與 `css/`、`js/` 是先前替
> Ethan & Momo 做的**單場客製婚禮站**，與本模板各自獨立、互不影響。
> 目前一併部署在網站根目錄（`/`）。之後若要把這些互動玩法抽成模板的選配模組，
> 再另行規劃。

---

## 資料模型

```
sites/{siteId}
  slug, ownerEmail, status(draft|published|archived)
  groomName, brideName
  eventDate(timestamp), timezone(IANA，預設 Asia/Taipei)
  venueName, venueAddress, venueMapUrl
  themeColor(hex), coverImageUrl, story
  rsvpDeadline(timestamp), rsvpEnabled(bool)
  createdAt, updatedAt

  rsvps/{autoId}
    name, attending(bool), guestCount(1–10)
    dietaryNote, message, createdAt

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
| `--owner-email` | | 新人聯絡信箱 |
| `--status` | | `draft`／`published`／`archived`，**預設 `draft`** |
| `--rsvp-deadline` | | RSVP 截止日 `YYYY-MM-DD`，預設同婚禮日期 |
| `--rsvp-enabled` | | `true`／`false`，預設 `true` |

> **注意**：預設是 `draft`，賓客會看到 404。
> 內容確認好之後，到 Firebase Console 把 `status` 改成 `published` 才會對外公開。

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

### 瀏覽器端整合測試

```bash
npm run test:e2e
```

會自動寫入測試資料並用 Chromium 跑完整流程，預期全部 ✅：

```
[1] /w/chen-lin-0315        # 內容、主題色、日期時區、故事換行、表單
[2] /w/wu-yang-1220         # 另一組 slug，主題色與內容互不干擾
[3] /w/does-not-exist       # 中文 404 畫面，非白畫面且無 console 錯誤
[4] draft 站台               # 未發布顯示 404
[4b] RSVP 截止與關閉
[5] RSVP 送出流程            # 不跳頁、成功狀態、寫入欄位正確
[6] honeypot 擋機器人        # 畫面顯示成功但確認未寫入 Firestore
[8] 短連結 /s/{code}         # 正常轉址、不存在代號、javascript: 協定被擋
[7] 手機版 RWD（375px）      # 無水平捲動
```

### 本機預覽

```bash
npm run emulators
```

開 <http://127.0.0.1:5000/w/{slug}>。
頁面偵測到 `localhost`／`127.0.0.1` 會自動連 Firestore emulator，
不會碰到正式資料。要先用 emulator 建站台：

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  node scripts/create-site.js --slug test-site --groom 測 --bride 試 \
  --date 2027-01-01 --status published
```

---

## 安全性設計

權限邊界完全靠 `firestore.rules`，不靠專案隔離：

| 路徑 | read | create | update | delete |
|---|---|---|---|---|
| `sites/{siteId}` | ✅ | ❌ | ❌ | ❌ |
| `sites/{siteId}/rsvps/{id}` | ❌ | ✅（需通過驗證） | ❌ | ❌ |
| `slugs/{slug}` | ✅ | ❌ | ❌ | ❌ |
| `short/{code}` | ✅ | ❌ | ❌ | ❌ |

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
