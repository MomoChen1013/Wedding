# 婚禮邀請函網站模板 — 規格書

## 0. 專案背景

みなと製作所 Minato Studio（台日跨境設計工作室）的**婚禮邀請函網站模板**，
賣給多組新人使用。每組客人有：

- 自己的網址（slug）
- 自己的內容設定（新人姓名、日期、地點、主題色、照片）
- 自己的出席回覆（RSVP）資料，彼此不可互看

**核心架構決定：所有客人共用「一個」Firebase 專案，用 `siteId` 做資料分層與權限隔離。**
不為每組客人開一個 Firebase 專案。

---

## 1. 技術限制與偏好

| 項目 | 規範 |
|---|---|
| 前端 | 原生 HTML + CSS + JS，**不使用框架**（無 React / Vue / Next.js） |
| 檔案結構 | 盡量單檔或少量檔案，方便直接部署到 Hosting |
| 後端 | Firebase Firestore + Hosting；必要時才用 Cloud Functions |
| **不做的事** | 金流串接、複雜權限管理系統、使用者註冊登入牆 |
| 最大範圍 | 表單、自動化、儀表板、聯絡／回覆流程 |
| 註解語言 | 繁體中文 |
| 已知地雷 | Firebase Dynamic Links **已於 2025-08 停止服務**，禁止使用 |
| 已知地雷 | Firebase Hosting **不支援 wildcard 子網域**（`*.example.com` 做不到） |

無建置步驟，直接部署到 Hosting。
`invitation.html` 與 `shortlink.html` 自帶 CSS／JS；
多頁面站台共用 `css/` 與 `js/`，由 `js/site-context.js` 統一載入。

---

## 2. 資料模型（Firestore）

```
sites/{siteId}
  slug            : string   # 網址代稱，全域唯一，如 "chen-lin-0315"
  ownerEmail      : string   # 新人聯絡信箱
  status          : string   # "draft" | "published" | "archived"
  groomName       : string
  brideName       : string
  eventDate       : timestamp
  eventEndDate    : timestamp | null   # 婚宴結束時間，加入行事曆用；null 則抓開始後 3 小時
  timezone        : string   # IANA 時區，如 "Asia/Taipei"（見下方說明）
  venueName       : string
  venueAddress    : string
  venueMapUrl     : string
  themeColor      : string   # hex，如 "#3D9AD1"
  coverImageUrl   : string
  story           : string   # 兩人的故事，支援換行
  photos          : string[] # 照片牆，陣列順序即顯示順序
  hashtags        : string[] # 婚禮 hashtag，前面沒有 # 會自動補上
  dressCode       : string   # 服裝建議，支援換行
  giftNote        : string   # 禮金說明，支援換行
  rsvpDeadline    : timestamp
  rsvpEnabled     : boolean
  pages           : map      # 頁面開關，見第 10 節
  inboxPassword   : string   # 悄悄話信箱密碼
  createdAt       : timestamp
  updatedAt       : timestamp

  # 各功能的子集合，站台之間完全隔離
  rsvps/{autoId}
    name          : string
    attending     : boolean  # 只有「會出席」是 true
    tentative     : boolean  # 選填，true 代表「未定」
    guestCount    : number   # 1–10
    meal          : string   # 選填，餐點需求
    icon          : string   # 選填，賓客 emoji
    dietaryNote   : string   # 飲食禁忌，選填
    message       : string   # 給新人的話，選填
    createdAt     : timestamp

  wishes/{autoId}     name, icon, text(≤300), time      # 祝福牆
  letters/{autoId}    name, icon, text(≤1000), time     # 悄悄話信箱
  cakes/{autoId}      name, icon, cake, emoji, img, time
  compat/{autoId}     answers(list ≤50), time           # 新人小測驗
  collected/{autoId}  uid, userName, art, name, rarity, desc, time
  meta/hearts         count(int)                        # 愛心計數器

slugs/{slug}                # 網址佔位對照表，文件 ID 就是 slug 本身
  siteId          : string
  createdAt       : timestamp

short/{code}                # 短連結
  target          : string   # 完整目標網址
  createdAt       : timestamp
  hits            : number
```

**為什麼要有 `slugs` 集合**：Firestore 沒有「欄位唯一性」約束。
用「slug 當文件 ID」的獨立集合，才能靠 transaction 保證不撞名。

**為什麼加了 `timezone`（原規格未列）**：
`eventDate` 是一個絕對時間點，瀏覽器預設會用「觀看者的時區」渲染。
台灣 12:00 的婚宴，日本賓客會看到 13:00、美西賓客會看到前一天晚上——
對台日跨境的使用情境是實質錯誤。因此存下婚禮所在時區，
邀請函一律以**婚禮當地時區**顯示時間。預設 `Asia/Taipei`。

---

## 3. Security Rules

安全邊界靠規則，不靠專案隔離。

| 路徑 | read | create | update | delete |
|---|---|---|---|---|
| `sites/{siteId}` | 允許 | 拒絕 | 拒絕 | 拒絕 |
| `sites/{siteId}/rsvps/{id}` | 拒絕 | 允許（需通過驗證） | 拒絕 | 拒絕 |
| `slugs/{slug}` | 允許 | 拒絕 | 拒絕 | 拒絕 |
| `short/{code}` | 允許 | 拒絕 | 拒絕 | 拒絕 |

### RSVP 建立時的驗證條件

寫成 rules 內的 helper function `isValidRsvpCreate()`，涵蓋：

- 欄位集合必須**完全等於**允許清單，不可夾帶額外欄位
- `name` 為 string，長度 1–40
- `attending` 為 boolean
- `guestCount` 為 int，介於 1–10
- `message` 與 `dietaryNote` 為 string，長度 ≤ 300
- `createdAt` 必須等於 `request.time`（防止偽造時間）
- 對應的 `sites/{siteId}` 必須存在、`status == "published"`、`rsvpEnabled == true`
- 若已過 `rsvpDeadline` 則拒絕寫入

管理端讀取 RSVP 走 **Firebase Admin SDK 或 console**，不透過前端規則開後門。
Admin SDK 以服務帳戶連線會略過 Security Rules，因此 `scripts/` 底下的腳本
即使規則寫「一律拒絕寫入」也能正常運作。

---

## 4. Slug 搶佔邏輯

`scripts/create-site.js`（firebase-admin）：建立新客戶站台時，
以 **transaction** 同時寫入 `slugs/{slug}` 與 `sites/{siteId}`，任一失敗即整筆回滾。

- slug 格式驗證：`/^[a-z0-9]+(-[a-z0-9]+)*$/`，長度 3–40
- 保留字黑名單：`admin`、`api`、`www`、`app`、`w`、`s`、`assets`、`static`
  （原規格未列 `s`，因短連結路由為 `/s/{code}`，一併保留）
- 若 `slugs/{slug}` 已存在，拋出清楚的中文錯誤訊息

CLI 用法：

```bash
node scripts/create-site.js --slug chen-lin-0315 --groom 陳彥廷 --bride 林佳蓉 --date 2026-03-15
```

---

## 5. 路由與 Hosting 設定

網址採**路徑式**：`https://minato.3udesign.website/w/{slug}/{page}`

`firebase.json` rewrite：

| 來源 | 目的 |
|---|---|
| `/w/*/info` `/w/*/rsvp` `/w/*/wall` `/w/*/cake` | 對應的 HTML |
| `/w/*/draw` `/w/*/exhibition` `/w/*/quiz` `/w/*/inbox` | 對應的 HTML |
| `/w/*/invitation` | `/invitation.html` |
| `/w/**`（其餘，含 `/w/{slug}/`） | `/index.html`（大廳） |
| `/s/**` | `/shortlink.html` |

前端流程由 `js/site-context.js` 統一處理：
從 `location.pathname` 解析 slug 與頁面代號 → 查 `slugs/{slug}` 取得 siteId →
讀 `sites/{siteId}` → 檢查 `status` 與 `pages` → 建立 `window.SITE`／`window.WED` →
才注入 `common.js` 與該頁 JS。

slug 不存在、格式不合法、站台非 `published`、或連線失敗時，
一律顯示友善的中文找不到畫面，且不在 console 噴錯。
頁面未啟用時導回大廳。

自訂網域說明見 `README.md`。

---

## 6. 短連結

自建，不使用任何第三方短網址服務。

- `code` 為 6 碼隨機英數，建立時用 transaction 確認未撞號
- 路由 `/s/{code}`，前端讀取後以 `location.replace()` 轉址
- 只接受 `http(s)://` 開頭的 target，擋掉 `javascript:` 之類的協定
- rules：`read` 允許、`write` 拒絕

**`hits` 未啟用**：規則禁止前端寫入 `short/`（否則任何人都能竄改轉址目標），
而累加計數需要伺服器端寫入。若之後需要點擊統計，得加一支 Cloud Function。
目前保留欄位，值恆為 0。

---

## 7. 交付檔案

```
/
├─ SPEC.md
├─ README.md
├─ firebase.json
├─ .firebaserc
├─ firestore.rules
├─ firestore.indexes.json
├─ public/
│   ├─ invitation.html
│   ├─ shortlink.html
│   ├─ 404.html
│   └─ assets/
├─ scripts/
│   ├─ create-site.js
│   ├─ export-rsvps.js
│   └─ create-short-link.js
└─ tests/
    ├─ rules.test.mjs
    └─ e2e.mjs
```

`public/` 底下另有既有的 Ethan & Momo 單場客製婚禮站，與本模板獨立並存。

---

## 8. 邀請函頁面的視覺要求

沿用 Minato Studio 的設計語言：

- 主色由 `themeColor` 動態注入 CSS 變數 `--theme`，預設 `#3D9AD1`（天空藍）
- 強調色琥珀 `#E8A93C` 固定不變（用於分隔線、`&`、重點標記）
- 字體：`"Noto Sans TC", "Zen Kaku Gothic New", sans-serif`；英文用 `"Archivo"`
- 行高 1.9、字距 0.04em
- 圓角、柔和陰影、大量留白
- 全站 RWD，手機優先
- RSVP 表單送出後不跳頁，以 async 寫入 Firestore 並顯示成功狀態
- 表單有 honeypot 隱藏欄位擋機器人（觸發時畫面照樣顯示成功，但不寫入）

頁面區塊順序：
封面（含倒數計時）→ 兩人的故事 → 照片牆 → 婚禮資訊（日期／地點／服裝／禮金
＋加入行事曆）→ RSVP → hashtag → footer。
**每個區塊在對應欄位是空的時候會整段隱藏**，不會留下空標題。

- 倒數計時：顯示距離婚禮剩餘天數，婚禮當天過後改顯示「我們結婚了 ♡」
- 照片牆：響應式格狀排列（手機 2 欄／桌機 3 欄），點圖可放大，
  支援 Esc 關閉；載不到的圖會整格移除不留破圖
- 加入行事曆：前端產生 `.ics` 檔下載，iOS／Android／桌機通用，
  不依賴任何第三方服務

---

## 9. 驗收標準

| # | 項目 | 驗證方式 |
|---|---|---|
| 1 | 未登入使用者**可以**建立合法 RSVP | `tests/rules.test.mjs` |
| 2 | 未登入使用者**無法**讀取任何 RSVP | `tests/rules.test.mjs` |
| 3 | 未登入使用者**無法**修改 `sites` 或 `slugs` | `tests/rules.test.mjs` |
| 4 | 夾帶額外欄位（`isAdmin: true`）的 RSVP 會被拒 | `tests/rules.test.mjs` |
| 5 | `guestCount: 99` 會被拒 | `tests/rules.test.mjs` |
| 6 | 已過 `rsvpDeadline` 的站台，RSVP 寫入會被拒 | `tests/rules.test.mjs`／`tests/e2e.mjs` |
| 7 | 重複 slug 執行 `create-site.js` 會失敗並回滾，不留孤兒文件 | 手動驗證（見下） |
| 8 | 兩個不同 slug 的頁面，內容與主題色正確互不干擾 | `tests/e2e.mjs` |
| 9 | 存取不存在的 slug 顯示 404 頁面，不是白畫面 | `tests/e2e.mjs` |

測試指令與預期輸出見 `README.md` 的「測試」章節。

第 7 項的手動驗證：

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  node scripts/create-site.js --slug dup-test --groom A --bride B --date 2027-01-01
# ✅ 站台建立成功！

FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  node scripts/create-site.js --slug dup-test --groom C --bride D --date 2027-02-02
# ❌ 建立站台失敗：slug 「dup-test」已經被使用了，請換一個網址代稱
# exit code 1，且 sites／slugs 各仍只有 1 筆
```

---

## 10. 多頁面與頁面開關

每組新人共用同一套 HTML／CSS／JS，差異全部來自 `sites/{siteId}` 的資料。

| 代號 | 網址 | 頁面 | 可關閉 |
|---|---|---|---|
| `lobby` | `/w/{slug}/` | 大廳（入場 gate + 場景導覽） | ❌ |
| `info` | `/w/{slug}/info` | 婚禮資訊 | ✅ |
| `rsvp` | `/w/{slug}/rsvp` | 出席回覆 | ✅ |
| `wall` | `/w/{slug}/wall` | 祝福牆 | ✅ |
| `cake` | `/w/{slug}/cake` | 甜點桌 | ✅ |
| `draw` | `/w/{slug}/draw` | 囍卡抽卡 | ✅ |
| `exhibition` | `/w/{slug}/exhibition` | 戀愛時光 | ✅ |
| `quiz` | `/w/{slug}/quiz` | 新人小測驗 | ✅ |
| `inbox` | `/w/{slug}/inbox` | 悄悄話信箱 | ✅ |
| `invitation` | `/w/{slug}/invitation` | 單頁式邀請函（獨立版型） | ✅ |

關閉一個頁面會同時做到三件事，不只是把畫面藏起來：

1. 大廳與各頁的入口連結被移除
2. 直接輸入網址會被導回大廳
3. **Security Rules 也會拒絕該功能的寫入**

`pages` 欄位不存在時視為全部開啟，舊資料不會因此壞掉。

### 賓客身分與資料隔離

- 賓客在大廳填名字入場，狀態存在 `localStorage`，
  key 以 `wed.{siteId}.` 開頭 —— 同一位賓客逛兩組新人的網站不會互相污染
- 抽卡收藏用 Firebase 匿名登入的 uid 隔離，只讀得到自己的卡
- 各站台的祝福、信件、蛋糕、測驗票數都在自己的子集合底下，彼此看不到
