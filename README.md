# 婚禮網站模板

みなと製作所 Minato Studio 的婚禮網站模板。
多組新人共用**同一套程式碼與同一個 Firebase 專案**，
靠 `siteId` 做資料分層，靠 Security Rules 做權限隔離。

每組新人有自己的網址、內容、照片，還能**各自決定要開哪些頁面**。

| 網址 | 內容 |
|---|---|
| `/w/{slug}/` | 首頁（入場 gate + 婚禮資訊 + 卡片連結）**一定有** |
| `/w/{slug}/wall` | 祝福牆 |
| `/w/{slug}/cake` | 集氣送祝褔（甜點桌） |
| `/w/{slug}/draw` | 抽卡 |
| `/w/{slug}/exhibition` | 我們的故事 |
| `/w/{slug}/quiz` | 看你多了解我們（題目由新人在後台出） |
| `/w/{slug}/seating` | 我的桌次（當天輸入名字查桌次 + 桌次圖） |
| `/w/{slug}/letter` | 給你的信（新人寫的電子祝福信） |
| `/w/{slug}/invitation` | 出席回覆（婚禮資訊＋表單收在同一頁） |
| `/w/{slug}/admin` | 新人後台（Google 登入）**一定有・不對外連結** |
| `/s/{code}` | 短連結 |

除了首頁以外，每一頁都可以個別開關。關掉的頁面：首頁與導覽列不會出現入口，
直接輸入網址也會被導回首頁。

> 婚禮資訊原本是獨立的 `/w/{slug}/info`，現在已經併進首頁。
> 舊網址由 Hosting 的 301 轉址導回首頁，先前發出去的連結不會壞掉。
>
> 悄悄話信箱原本是獨立的 `/w/{slug}/inbox`，門檻與後台一樣是 Google 登入，
> 等於同一個帳號要登入兩次，所以已經併成新人後台的「悄悄話」分頁。
> 舊網址一進來就會被帶到 `/w/{slug}/admin`。
>
> 出席回覆原本有兩頁：`/w/{slug}/rsvp` 與 `/w/{slug}/invitation`。
> 兩頁問的是同一件事、寫進同一個 `rsvps` 子集合，所以已經合併成一頁。
> 網址留下 **`/invitation`**（對外分享的是這個連結），
> 舊的 `/rsvp` 由 Hosting 301 導過去；`sites.pages` 的開關代號仍然是
> **`rsvp`**（規則、後台分頁、`set-pages` CLI 都靠它，改 key 會讓既有設定失效）。

---

## 版面與風格

- **導覽列**：每一頁最上方都有，依序是「新人名稱（首頁）、出席回覆、桌次、祝福、
  給你的信、故事、測驗、抽卡、集氣、User」。
  由 `js/common.js` 統一注入，站台沒開的頁面不會出現在列上；
  還沒在大廳報到過的訪客不會出現最後那塊 User。
- **入場登入**：第一次進大廳的賓客要填名字、抽一個記號才進得去（`#gate`）。
  這道門可以整個關掉（站台文件的 `entryLoginEnabled`），見〈入場登入〉。
- **開場**：進場後播兩句字幕（`我們要結婚了` → `邀請你，／見證這一刻`，
  一句一秒）再拉開簾幕，右下角一直有「跳過」。
  文案與秒數寫在 `js/index.js` 的 `INTRO_LINES`／`INTRO_BEAT_MS`；
  文案裡的 `\n` 就是換行（`.intro-line` 是 `white-space:pre-line`）。
- **首頁**：固定背景（一張圖或一段影片，滾動時不動）→ 置中開場（`h1` + `.cn`）→
  婚禮資訊卡 → 當日流程 → Dress Code → 交通資訊 → 兩人的故事 → 日期倒數 →
  RSVP → 卡片連結（兩欄，內建七張＋新人在後台自訂的卡片）。
  **Dress Code、交通資訊、兩人的故事沒填的話那一塊就不出現**，
  不會留下一個空標題（見〈新人後台〉的「大廳內容」）。
- **每頁的 `.scene-hero`** 固定 50vh。
- **出席回覆**（`/w/{slug}/invitation`）走的是同一套版型 ——
  同樣的導覽列、`.scene-hero`、`.section-title`、`.cardbox` 與主題色票，
  只多一份放專屬元件（封面照、資訊列、照片牆、放大檢視）的 `css/invitation.css`。
  它原本自帶一整套 CSS／JS，和其他頁長得完全不一樣，現在已經收斂進來。
  > 代價是 `themeColor`（每站一個主色）不再套用在這一頁 ——
  > 其他頁面本來就只吃 `data-theme` 的四組色票，要一致就得放掉它。
  >
  > 這一頁**不需要先在大廳報到**（沒有 `requireUser()`）：它是對外分享的連結，
  > 賓客點進來就該看得到表單，不必先看入場動畫、填名字。
  > 沒報到過的訪客，導覽列上也不會出現「朋友 ▾／登出」那一塊。
- **風格**：極簡線條。全站單一字族 **Noto Serif TC**（Google Fonts CDN），
  無陰影、無 emoji，靠 1px 線條與留白分層。
- **BGM**：預設播內建的 `public/audio/bgm.mp3`，新人放了自己的音檔就換成他們的。
  想換全站的預設曲目，直接換掉這個檔案（路徑寫在 `js/common.js` 的 `DEFAULT_BGM`）。
  音檔真的載不起來時，最後才退回 Web Audio 合成的〈愛的禮讚 Salut d'Amour〉。

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
│   ├─ wall.html  cake.html
│   ├─ draw.html  exhibition.html  quiz.html
│   ├─ seating.html           # 我的桌次（婚禮當天查桌次 + 桌次圖）
│   ├─ letter.html            # 給你的信（新人寫的電子祝福信）
│   ├─ admin.html             # 新人後台（回覆／悄悄話／婚禮資訊／桌次／排桌管理／感謝信／卡片／婚禮小卡／故事牆／測驗）
│   ├─ invitation.html        # 單頁式邀請函（獨立版型，自成一格）
│   ├─ shortlink.html         # 短連結轉址頁
│   ├─ 404.html
│   ├─ assets/{slug}/         # 每組新人的照片
│   ├─ audio/bgm.mp3          # 全站共用的預設背景音樂（新人沒放自己的就播這首）
│   ├─ css/
│   └─ js/
│       ├─ site-context.js    # ★ 每頁唯一進入點：解析 slug、載設定、注入其他 JS
│       ├─ common.js          # 資料層 DataStore、導覽、特效、樣板文字
│       ├─ cropper.js         # 後台專用的照片裁切器（只有 admin.html 載入）
│       ├─ seating-plan.js    # 後台專用的排桌工作台（只有 admin.html 載入）
│       ├─ xlsx-lite.js       # 極小的 Excel 讀寫器（排桌的匯入匯出用，無外部函式庫）
│       ├─ quiz-defaults.js   # 測驗的預設題目與上限（quiz.html 與 admin.html 共用）
│       ├─ exhibit-defaults.js # 故事牆的預設故事與章節（exhibition.html 與 admin.html 共用）
│       ├─ rsvp-form.js       # 出席回覆表單（題目依後台設定增減）
│       └─ index.js invitation.js …     # 各頁邏輯
├─ scripts/
│   ├─ create-site.js         # 建立客戶站台（slug transaction）
│   ├─ site-pages.js          # 頁面／後台功能開關的共用定義
│   ├─ set-pages.js           # 改已建站台的開關
│   ├─ export-rsvps.js        # 匯出某站台的 RSVP 成 CSV
│   └─ create-short-link.js
└─ tests/
    ├─ rules.test.mjs         # Security Rules 測試
    ├─ e2e.mjs                # 出席回覆那一頁的瀏覽器測試
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

`{{hashtag}}` 取新人填的第一個 hashtag；一個都沒填時用預設的 `#我們結婚了`
（大廳開場那一排則是 `#我們結婚了`、`#Married` 兩個）。

---

## 資料模型

```
sites/{siteId}
  slug, ownerEmail, status(draft|published|archived)
  groomName, brideName
  coupleTitle           # 選填，大廳資訊卡上的稱呼（≤20 字），留白就用兩人的名字
  eventDate(timestamp), eventEndDate(timestamp|null)
  timezone(IANA，預設 Asia/Taipei)
  venueName, venueAddress, venueMapUrl
  transportPublic, transportParking   # 交通資訊，留白則大廳不出現這一塊
  themeColor(hex), coverImageUrl, story
  photos(string[]), hashtags(string[])
  entryLoginEnabled(bool) # 大廳入場登入的總開關，新人改不動；沒這個欄位視為 true
                          # false 時大廳不出現入場畫面，賓客不必填名字就看得到內容
  guestTagsEnabled(bool)  # 賓客標籤的總開關，新人改不動；沒有這個欄位＝關
  guestTags(map[])        # 標籤庫 { id, name, onForm }，新人自己維護
  dressCode, giftNote
  schedule(map[])       # 當日流程，每筆 { time, title, desc? }
  rsvpDeadline(timestamp), rsvpEnabled(bool)
  seatingSearchEnabled(bool)   # 桌次頁的搜尋開關，沒這個欄位視為 true
  seatingFeatureEnabled(bool)  # 桌次功能的總開關，沒這個欄位視為 true；
                               # false 時大廳不出現「尋找我的座位」、導覽列也沒有桌次
  rsvpAskCard / rsvpAskGift / rsvpAskMessage(bool)   # 出席回覆要問哪些題目
  rsvpContactMethods(string[])  # 要問哪幾種聯絡方式（phone/line/email）
  rsvpShowStory / rsvpShowGallery(bool)              # 那一頁要不要放這兩塊
                               # 以上六個沒設定過一律視為「開著」，舊站台不受影響
  pages(map)            # 每個頁面開關，如 { wall:true, cake:false, … }
                        # 另外含一個沒有網址的後台功能開關 seatingPlan（排桌管理）
  ownerEmails(string[]) # 新人的 Google 信箱；決定誰進得了後台（RSVP 與悄悄話都靠它）
  createdAt, updatedAt

  # ↓ 各功能的資料都掛在這組新人底下，站台之間完全看不到彼此
  rsvps/{autoId}       name, attending(bool), tentative(bool), guestCount(1–10),
                       relation('groom'|'bride'|'both'|'other'),
                       contactPhone, contactLine, contactEmail,   # 至少填一種
                       mealMeat(0–10), mealVeg(0–10),   # 相加＝guestCount
                       childSeat(0–10), dietaryNote,
                       cardType('paper'|'digital'|'none'),
                       cardDelivery('pickup'|'mail'), cardZip, cardAddress,
                       cardEmail,                                  # 電子喜帖寄到哪
                       giftDelivery('pickup'|'mail'), giftZip, giftAddress,
                       message, note, icon, createdAt,
                       tag                    # 賓客自己選的標籤（單選、選填）
                       # 只有新人讀得到；後台可看可匯出，但不能改不能刪
                       # 核心欄位以外全是選填，舊版表單送出的回覆仍然收得下
  wishes/{autoId}      name, icon, text, time          # 祝福牆
  letters/{autoId}     name, icon, text, time          # 悄悄話（後台的悄悄話分頁）
  cakes/{autoId}       name, icon, cake, emoji, img, time
  quizVotes/{autoId}   picks(map 題目id→選項索引[]), score, total, time
                       # 小測驗的作答；key 用題目 id，新人調順序也不會對錯題
  collected/{autoId}   uid, userName, art, name, rarity, desc, cardId, time
                       # cardId：後台上傳的卡圖太長塞不進 art，改記 id
  meta/hearts          count                           # 愛心計數器
  meta/letterCount     count                           # 公開的信件數量

  # ↓ 這九個集合由新人在 /w/{slug}/admin 自己維護（規則只認 ownerEmails 名單）
  rsvpTags/{回覆 id}     tags(string[]), updatedAt   # 新人幫賓客掛的標籤
                                                     # 只有新人讀得到；文件 id ＝ 那筆回覆的 id
  seatingPlan/draft      tables(map[] ≤60)     # 桌位 { id, no, name, cap, type, order }
                         guests(map[] ≤600)    # 排桌時補的欄位（編號、類別、人數…）
                         assign(map ≤600)      # 賓客 id → 桌位 id ＝ 排桌關係
                         savedAt, syncedAt     # 兩個時間相比＝同步狀態
                         # 排桌管理的草稿，只有新人讀得到（上面有姓名與備註）。
                         # 按「同步」才會整份寫進下面的 seating
  seating/{autoId}       name, table, note, time       # 桌次名單（賓客查得到的那一份）
  seatingImages/{autoId} img(data URL), title, order, time   # 桌次圖
  blessings/{autoId}     terms[], title, body, sign, isDefault, time  # 新人寫的感謝信
  explore/{autoId}       title, sub, kind(link|popup), url, body, order, time
  cards/{autoId}         img(data URL), name, rarity(SSR|SR|R|N), desc, order, time
                                                       # 婚禮小卡卡池（抽卡頁）
  exhibits/{autoId}      kind(photo|act), img(data URL), title, sub,
                         desc, year, act, order, time  # 故事牆的故事與章節
  quiz/{autoId}          type(single|multi), q, opts[4], answer[],
                         order, time                   # 小測驗的題目（最多 50 題）

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

**關於 `schedule`**：大廳的當日流程時間軸，長這樣：

```json
[
  { "time": "11:30", "title": "入場迎賓", "desc": "簽到、拍照" },
  { "time": "12:00", "title": "婚宴開始" },
  { "time": "14:30", "title": "送客" }
]
```

`desc` 選填，沒有就不顯示那一行；陣列順序即顯示順序，不會依 `time` 重排；
整個欄位沒填就顯示「流程稍後公布，敬請期待」。

這個欄位**沒有對應的 CLI 參數**（`create-site.js` 不會寫入），
但新人可以在後台「大廳內容」分頁自己編（見下面的〈新人後台〉）。
`coupleTitle`、`dressCode`、`giftNote`、`venueName`、`venueAddress`、
`transportPublic`、`transportParking`、`story`、`hashtags` 也一樣 ——
`create-site.js` 的參數只在建站當下有效，之後要改文案就進後台。
改完重新整理網頁就生效，不需要重新 deploy，也不用進 Firebase Console。

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
| `--owner-email` | | 新人的 Google 信箱，**新人後台要靠它登入**；可重複給多次 |
| `--status` | | `draft`／`published`／`archived`，**預設 `draft`** |
| `--rsvp-deadline` | | RSVP 截止日 `YYYY-MM-DD`，預設同婚禮日期 |
| `--rsvp-enabled` | | `true`／`false`，預設 `true` |
| `--pages` | | 逗號分隔，直接指定要開哪些頁。不給則預設 `rsvp,wall` |
| `--enable` | | 在預設之外加開某頁；**可重複給多次** |
| `--disable` | | 關掉某頁；**可重複給多次** |

### 頁面開關

可開關的頁面：`rsvp` `wall` `cake` `draw` `exhibition` `quiz`
`seating` `letter`
（大廳 `lobby` 與新人後台 `admin` 一定存在，不能關）。

同一組開關裡還有一個**沒有網址的後台功能**：

| 代號 | 是什麼 | 預設 |
|---|---|---|
| `seatingPlan` | 新人後台的「排桌管理」分頁（見下面的說明） | ⛔ 關 |

它不是一頁，不會出現在導覽列，只決定後台要不要長出那個分頁。

```bash
# 全套都要
--pages rsvp,wall,cake,draw,exhibition,quiz,seating,letter

# 只要基本款（不給 --pages 時的預設）
# → rsvp, wall

# 預設之外再加抽卡與測驗
--enable draw --enable quiz

# 預設裡不要祝福牆
--disable wall
```

#### 站台建好之後要改開關

用 `set-pages`，不用重新部署，存檔後重新整理網頁就生效：

```bash
# 先看目前開了哪些（不加開關參數＝純查詢）
npm run set-pages -- --slug ginny-one-20260919

# 只留抽卡，其他全關（--pages 是整組覆蓋，沒列到的一律關掉）
npm run set-pages -- --slug ginny-one-20260919 --pages draw

# 在現有設定上加減
npm run set-pages -- --slug ginny-one-20260919 --disable quiz --enable rsvp

# 先看看會變成什麼樣，不寫入
npm run set-pages -- --slug ginny-one-20260919 --pages draw --dry-run

# 順便設定新人後台的可用帳號（整組覆蓋）
npm run set-pages -- --slug ginny-one-20260919 \
  --owner-email groom@gmail.com --owner-email bride@gmail.com

# 打開／關掉「賓客標籤」（配合排桌次的進階功能，預設是關的）
npm run set-pages -- --slug ginny-one-20260919 --guest-tags on

# 打開「排桌管理」後台（排桌會用到標籤分組，通常兩個一起開）
npm run set-pages -- --slug ginny-one-20260919 \
  --enable seatingPlan --guest-tags on

# 關掉／打開「入場登入」（賓客要不要先報上名來，預設是開的）
npm run set-pages -- --slug ginny-one-20260919 --entry-login off
```

也可以直接去 Firebase Console → Firestore → 該筆 `sites` 文件 → `pages` 欄位
把對應的 boolean 改掉；`pages` 是一個 **map**，如果文件裡還沒有這個欄位，
要先「新增欄位 → 名稱 `pages` → 類型 map」再一格一格加 boolean 子欄位。
手動點很容易打錯字，建議用上面的指令。

> **舊站台沒有 `pages` 欄位＝全部頁面都開啟**（前端與安全規則都這樣處理，
> 這樣早期建立的站台才不會突然壞掉）。跑一次 `set-pages` 就會寫入明確的開關。

> **注意**：預設是 `draft`，賓客會看到 404。
> 內容確認好之後，到 Firebase Console 把 `status` 改成 `published` 才會對外公開。

---

### 入場登入

大廳第一次被打開時，賓客要填名字、抽一個專屬記號才進得去（`#gate`）。
名字用在祝福牆的小卡、悄悄話、甜點桌上的送禮者，也會顯示在導覽列右邊。

**只用大廳＋桌次查詢的站台，其實沒有一件事需要名字**，
這時可以把整道門關掉：

```bash
# 關掉（賓客一進來就是大廳，沒有入場畫面、不倒數）
npm run set-pages -- --slug ginny-one-20260919 --entry-login off

# 再打開
npm run set-pages -- --slug ginny-one-20260919 --entry-login on
```

也可以直接去 Firebase Console → Firestore → 該筆 `sites` 文件，
把 `entryLoginEnabled`（boolean）設成 `false`。
**沒有這個欄位＝視為開著**，既有站台不受影響。

關掉之後：

| | 行為 |
|---|---|
| 大廳 | 沒有入場畫面，改成**一進來就播開場**（兩句字幕 → 開幕簾 → 大廳）；同一個分頁只播一次，逛子頁再回大廳不會又等一次 |
| 開場的「跳過」 | 照常有，不想看的賓客隨時點掉 |
| BGM | 不自動播 —— 沒有「按下進場」這個動作，瀏覽器一律擋掉自動播放；賓客按右下角那顆音樂鈕就有 |
| 導覽列 | 右邊那塊 User（名字 ▾／登出）在留下名字之前不出現 |
| 桌次、邀請函、抽卡、測驗、故事 | 照常，本來就不需要名字 |
| 祝福牆、悄悄話、甜點桌 | **要送出的那一刻才問名字**（一個小視窗，填過一次就記住），不會再把賓客彈回大廳 |

> 這個開關和 `pages`、`guestTagsEnabled` 一樣**新人在後台改不動**
> （Security Rules 的白名單裡沒有它），要開要關都由我們下指令。

> **不要靠這道門當權限**：它只是入場儀式，資料的讀寫權限一律由
> Security Rules 決定（見〈安全性設計〉）。

---

## 新人後台：婚禮資訊、桌次、排桌管理、感謝信、卡片、婚禮小卡、故事牆、測驗

這些內容**不走 CLI、也不用進 Firebase Console**，
新人自己在後台就能維護，改完重新整理網頁就生效（不必重新 deploy）。

```
https://{網域}/w/{slug}/admin
```

**進得去的條件**：用 **Google 帳號登入**，而且信箱要在 `sites.ownerEmails` 名單內。
還沒設定的話先跑：

```bash
npm run set-pages -- --slug ginny-one-20260919 \
  --owner-email groom@gmail.com --owner-email bride@gmail.com
```

> 後台目前有八個分頁：**出席回覆**、**悄悄話**、**婚禮資訊**、**桌次**、
> **感謝信**、**婚禮小卡**、**新人故事牆**、**新人熟悉測驗**。手機上分頁列可以左右滑。
> 出席回覆、婚禮資訊、桌次、新人熟悉測驗底下還有橫向子分頁（例如出席回覆分成
> 「出席回覆總覽」「回覆資訊」「表單設定」）；首頁卡片放在婚禮資訊的「自訂內容」子分頁。
>
> **分頁會跟著這組新人開了哪些頁面**：沒開的頁面就不會出現對應的編輯分頁，
> 免得辛苦上傳完才發現賓客那邊根本看不到。
> 出席回覆↔`rsvp`、桌次↔`seating`、感謝信↔`letter`、婚禮小卡↔`draw`、
> 新人故事牆↔`exhibition`、新人熟悉測驗↔`quiz`；
> 「婚禮資訊」與「首頁卡片」屬於大廳，永遠都在。
> 要打開某個頁面請跑 `npm run set-pages`（見上面〈頁面開關〉）。

> 這個網址不會出現在導覽列，也沒有任何頁面連過去（`noindex`），
> 但真正的保護是 **Security Rules**：不在名單內的帳號就算打開這一頁、
> 甚至改了畫面上的 HTML，也一個字都寫不進去。

---

### 0. 出席回覆（後台「出席回覆」分頁）

分成三個子分頁：**出席回覆總覽**、**回覆資訊**、**表單設定**。

「出席回覆總覽」最上面是一個大數字：**總回覆人數**（收到幾份回覆），
底下那行小字補上「確定出席 N 位」與三種回覆各幾筆。
再往下是五張環狀圖，一張對應表單上的一個題目：

| 環狀圖 | 分成幾段 | 單位 |
|---|---|---|
| 出席 | 熱情出席／視情況而定／誠摯祝福但無法出席 | 回覆筆數 |
| 飲食 | 葷食／素食 | **人**（把每筆回覆的葷素分配加總） |
| 兒童座椅 | 需要／不需要（標題附上共需幾張） | 回覆筆數 |
| 喜帖 | 紙本・自行領取／紙本・郵寄／電子喜帖／不需要 | 回覆筆數 |
| 喜餅 | 現場領取／郵寄 | 回覆筆數 |

只有「飲食」以人為單位，因為葷素是分配到每個人身上的；
其餘四題都是一筆回覆一個決定。舊資料沒填到的欄位會歸進「未填」那一段，
加起來仍然等於總回覆數，不會有人憑空消失。

圖是純 SVG 畫的（沒有引入任何圖表函式庫），手機上一行一張、
圓環與圖例左右並排，色階跟著目前的主題色走。

「回覆資訊」是收到的回覆名單，可以依狀態篩選、用名字／留言／備註搜尋，
也可以**匯出 CSV**（欄位與 `npm run export-rsvps` 一致，含 BOM，
Excel 開中文不會亂碼；匯出的是「目前篩選出來的那些」，不是全部）。

「表單設定」決定 `/w/{slug}/invitation` 那一頁要問什麼、放什麼，
右上角的**「查看表單」**直接開賓客看到的那一頁（就是分享出去的網址）：

| 設定 | 內容 |
|---|---|
| 題目 | 依表單順序列出目前所有題目。喜帖發送方式／喜餅領取方式／想對新人說的話可以個別關掉；**固定題目用打勾但關不掉（disabled）的勾選框列出來**，讓新人一眼看到表單上實際會有哪些題目 |
| 聯絡方式 | 電話號碼／LINE ID／Email，**可複選**；勾了幾種，賓客就要至少填其中一種 |
| 表單資訊 | 題目以外那一頁還會出現的內容：先列出**婚禮資訊**目前填了什麼（日期與開始時間、地點、地址、地圖連結、服裝、禮金、hashtag、封面照），再放**兩人的故事**與**照片集**兩個開關 |
（「賓客標籤」不在這一頁，是自己一個橫向子分頁「**設定賓客標籤**」，
見下面〈賓客標籤〉；只有開了標籤功能的站台才看得到那個子分頁。）

表單資訊只是把現在的內容列出來，不在這裡編輯：婚禮資訊與兩人的故事按
「去填寫…」會直接跳到「婚禮資訊」分頁並把游標對到那一欄；
照片集的照片放在素材資料夾（見〈素材資料夾〉），後台不能自己上傳，
只給一個「看看目前的照片集」的連結。

稱呼、出席與否、與新人的關係、出席人數、餐點分配、兒童座椅與其他備註是固定題目。

**沒設定過一律視為開著**，舊站台不會因為少了這幾個欄位就整塊消失。
關掉的題目在名單與 CSV 裡留白，已經送出的回覆不受影響；
儀表板上那一題的環狀圖也會跟著收起來（一張全是「未填」的圖沒有任何資訊）。

#### 賓客標籤（配合之後的排桌次）

給新人自己把賓客分群用的：**VIP、長輩、小孩、行動不便、大學同學、公司同事、
教會朋友、親戚**（按「加入常用標籤」一次帶進來），也可以自己新增。
**一位賓客可以有好幾個標籤。**

| 在哪裡 | 可以做什麼 |
|---|---|
| 出席回覆 →「設定賓客標籤」 | 新增／改名／刪除標籤，勾選哪些要「當表單選項」，看每個標籤用在幾位賓客身上。這是出席回覆底下自己一個橫向子分頁，沒開標籤功能的站台連這個子分頁都不會出現 |
| 賓客那一頁 | 「與新人的關係」下面多一題**單選、選填**的「更具體是哪一種？」，選項就是勾了「當表單選項」的那些標籤 |
| 回覆資訊 | 名單多一排**標籤篩選**（含「沒有標籤」），搜尋框也吃得到標籤名字；每一筆右邊的「標籤」可以幫那位賓客加掛（可複選） |
| 匯出 CSV | 多一欄「標籤」，後台與 `npm run export-rsvps` 都有 |

賓客自己選的那一個存在回覆裡（**送出後誰都改不動**，包括新人），
新人掛上去的存在另一份 `rsvpTags`，畫面上合起來顯示。
標籤存的是代號不是名字，改名不會讓已經分好的類跑掉。

> **這個功能預設是關的**，和頁面開關 `pages` 一樣由我們決定哪一組新人要用
> （排桌次是進階功能，操作有一定複雜度）。要打開：
>
> ```bash
> npm run set-pages -- --slug ginny-one-20260919 --guest-tags on
> ```
>
> 也可以直接去 Firebase Console 把站台文件的 `guestTagsEnabled` 設成 `true`。
> 關掉的話後台不會出現標籤設定、名單不會有標籤篩選，賓客表單也不會多那一題
> （已經存下來的標籤不會被刪掉，之後再打開就都還在）。

**兩個「同上」的捷徑**：勾了 Email 當聯絡方式時，賓客選「需要電子喜帖」可以直接
勾「同上」帶入同一個信箱；喜帖選了郵寄之後，喜餅那一題也會出現「同上」帶入同一個地址。
帶進來的欄位會轉成唯讀（看得到、改不動），要改就把勾勾取消。

> **後台只能看與匯出，不能修改。**
> 規則對 `rsvps` 開放的只有 `read`，`update` 與 `delete` 仍然是 `false` ——
> 回覆是賓客送出的紀錄，不該在後台被改掉。
> 真的要刪（測試資料、重複回覆）走 Admin SDK 或 Firebase Console。

> **誰讀得到**：只有 `ownerEmails` 名單內、信箱已驗證的 Google 帳號。
> 賓客彼此看不到誰要來、留了什麼話、有什麼飲食禁忌。

---

### 0b. 悄悄話（後台「悄悄話」分頁）

賓客在**祝福牆**點「寫一封信」投進來的悄悄話，全部列在這裡：
一封一段，看得到記號、名字、時間與內容，新的排在最前面。
清單上方會標目前有幾封，名字或內容都可以搜尋，
也可以**匯出 CSV**（匯出的是目前搜尋出來的那些）。

> 這一份原本是獨立的 `/w/{slug}/inbox` 頁面，
> 門檻同樣是新人的 Google 登入 —— 等於同一個帳號要在兩個地方各登入一次，
> 所以整個併進後台。舊網址（含書籤）會自動導到 `/w/{slug}/admin`。

> **後台只能看與匯出，不能修改。**
> 規則對 `letters` 只開 `read`（限 `ownerEmails`）與 `create`（賓客投信），
> `update`／`delete` 都是 `false`。

---

### 1. 我的桌次（`/w/{slug}/seating`）

婚禮當天賓客輸入名字就知道自己坐哪一桌，下面再附上桌次圖。

**搜尋要不要開**（後台「桌次」分頁 →「桌次搜尋及名單」子分頁最上面）
預設是開著的。關掉之後，賓客那一頁**只會出現你上傳的桌次圖**，沒有輸入名字的欄位 ——
名單還沒整理好、或本來就打算讓大家自己看圖找位子時很適合。
關掉時名單還留著（也還能繼續匯入），之後再打開就會生效。
搜尋關著、圖也還沒上傳的話，賓客會看到一句「座位表還沒公布」而不是一片空白。

**上傳桌次圖**（後台「桌次」分頁 →「桌次圖」子分頁）
可以一次選多張，或直接把圖拖進虛線框。圖片會在**瀏覽器端先縮圖**
（最長邊 1800px、轉 JPEG），再存進這場婚禮自己的 Firestore。

> **為什麼不用 Firebase Storage**：Storage 的安全規則讀不到 Firestore，
> 沒辦法用 `ownerEmails` 白名單判斷「是不是新人本人」。
> 存成 data URL 就能沿用同一套身分判斷，也不必多設一份規則與 CORS。
> 代價是單張上限約 900KB（Firestore 文件上限 1MB），縮圖流程會自動處理。

桌次圖也可以走素材資料夾，適合圖比較多、想版控的情況：

```
public/assets/{slug}/seating/
  01.jpg  02.jpg …
  meta.json      # 選填：{ "01": { "title": "一樓宴會廳" } }
```

放好之後跑 `npm run sync-assets -- --slug {slug}` 再 deploy。
兩邊的圖會一起顯示，後台上傳的排前面。

**匯入桌次名單**（「桌次搜尋及名單」子分頁 → 按「匯入名單」開視窗）
一行一位賓客，逗號分開 —— 直接從 Excel 複製貼上就可以
（逗號、全形逗號、Tab 分隔都認得）：

```
王小明, 第 3 桌
林美美, 第 3 桌, 素食
陳大同, 主桌
```

| 欄位 | 必填 | 說明 |
|---|---|---|
| 姓名 | ✅ | 賓客要輸入的名字 |
| 桌次 | ✅ | 顯示在結果卡上的大字，寫「第 3 桌」或「玫瑰廳 A5」都可以 |
| 備註 | | 選填，例如素食、行動不便 |

匯入是**加上去**，不會蓋掉原本的名單；要重來就先按視窗左下角的「清空」。
貼到一半想放棄就按「取消匯入」（會再問一次，確定了才把貼上的內容丟掉）。

**比對規則**（由寬到嚴，先找到就用）：
完全相同 → 名單的名字包含輸入的字（打「小明」找得到「王小明」）→
輸入的字包含名單的名字（打「王小明先生」也找得到「王小明」）。
空白、大小寫、全形半形都會先正規化，賓客怎麼打都找得到。

查到之後除了桌號，還會列出**同桌還有誰**，一群朋友一起找位子比較方便。

**和感謝信串在一起**：如果這場婚禮也開了「給你的信」，
查到桌次的同時會出現一條入口 —— 有專屬信寫「新人寫了一封信給你」，
只有通用信則寫「新人寫了一封信給大家」。
點下去會帶著名字跳到信件頁並**直接開信**，賓客不用再打一次名字。
關掉 `letter` 頁的站台不會出現這個入口，也不會多做一次讀取。

---

### 1b. 排桌管理（後台「排桌管理」分頁）

> 這是**要另外打開**的功能：`npm run set-pages -- --slug {slug} --enable seatingPlan`
> （建議連 `--guest-tags on` 一起開，排桌的分組是用賓客標籤做的）。

原本用 Excel 排桌的那件事，整套搬進後台。重點不是把表格搬上網，
而是讓新人排得更快、而且**不會漏掉人**。

#### 畫面長怎樣

三個子分頁：

| 子分頁 | 做什麼 |
|---|---|
| 排桌工作區 | 左邊「未安排」、右邊桌位，拖曳就能排 |
| 桌位管理 | 新增／刪除／改桌名、桌號、容量、類型、順序 |
| 匯入匯出 | 從出席表單匯入、Excel／CSV 雙向進出 |

工作區最上面永遠看得到：同步狀態、復原／重做、儲存排桌，
接著是即時統計（總人數／已安排／未安排／總桌數／平均每桌／超過容量／特殊需求），
再接著是提醒，最後才是左右兩欄的工作區。
**「未安排」那一欄是黏著的**，捲到第 24 桌也還看得到還有誰沒排。

#### 賓客從哪裡來

- **出席回覆**（`rsvps`）：填過表單的人自動出現，人數用他填的「共幾位」
- **匯入／手動**：沒填表單的長輩、臨時加的親友，從「匯入」進來

標籤沿用既有的**賓客標籤**（後台「出席回覆 → 設定賓客標籤」），
不是另外一套分類。**賓客送出的回覆一個字都不會被改動** ——
排桌時補的資料（編號、類別、人數覆寫、喜餅數量、確認收到）另外存一份。

#### 容量算的是「人」不是「筆」

一筆「王小明｜2 位」排進某桌，那一桌就 +2。

| 桌況 | 顯示 |
|---|---|
| 8 / 10 | 剩餘 2 位 |
| 10 / 10 | 已滿 |
| 12 / 10 | **超過容量 2 位**（紅字） |

**超過容量不會被擋下來**。婚宴當天本來就會臨時擠人進去，
系統的立場是「可以做，但一定講清楚」。

#### 桌號與桌名

桌號從 `01` 開始，畫面上一律是兩位數（`01`、`02`…`10`、`11`）。
桌名選填，沒填就只顯示 `01`，不會出現「01｜（桌名）」這種空殼。
**調整順序不會影響已經排好的賓客** —— 賓客記的是桌位本身，不是桌號。

桌位類型有主桌／家人桌／親友桌／同學桌／同事桌／VIP／自訂。
它講的是「這張桌子的用途」，和賓客標籤（「這位賓客的特徵」）是兩件事。

#### 怎麼排

**桌機**：直接把賓客卡拖到桌上。拖到哪就寫「放入第 05 桌」，
會爆容量就寫「⚠️ 此桌將超過容量」。支援：

- 未安排 → 桌位
- 桌位 A → 桌位 B
- 賓客拖到另一位賓客身上 → **兩人交換位子**
- 桌位 → 未安排
- 拖桌子的標題列 → 調整桌位順序

**手機／平板**不複製這一套：每張卡片都有「移動到桌位」，
按下去是一張列出所有桌位（現在幾人、會不會超過）的清單。

**每一步都可以復原**（上限 60 步）：移動、交換、移除、
新增／刪除／修改桌位、批次匯入，全部都救得回來。

#### 找人與分群

- **搜尋**：姓名、編號、類別、桌號、標籤都吃得到。打「B05」找得到那個人，打「王小明」直接看到他在第 06 桌
- **篩選**：排桌狀態（全部／未安排／已安排）、RSVP（已確認／待確認／無法出席）、標籤（**可多選**，VIP＋素食）、桌號
- **排序**：編號／姓名／人數多→少／人數少→多／**優先按照 Tags 分組**

選「優先按照 Tags 分組」時，未安排區會依標籤分成一群一群。
一位賓客可能同時有「女方好友＋VIP＋素食」，所以有一個**分組順序**
（工具列右邊那顆按鈕）：由上往下第一個對到的標籤就是他的組，
**不會有人重複出現在兩組裡**，原本的標籤也全部保留。

#### 特殊需求會自己浮出來

標籤名字裡有「素」「行動不便」「小孩」「VIP」的，
會被認成特殊需求，桌上直接寫：

```
🥬 2 位素食    ♿ 1 位行動不便    👶 1 位兒童
```

上方的提醒區也會列出來，還有「尚有 12 位賓客未安排」
「第 05 桌超過容量 2 位」「B18 尚未確認 RSVP」這一類。
**這些都只是提醒，不會擋住你**。

#### 儲存與同步是兩件事

```
排桌（在瀏覽器裡改，可以無限復原）
  → 按「儲存排桌」→ 存成草稿
  → 系統問一句「是否要同步至桌次查詢系統？」
  → 你說「同步」→ 賓客的「我的桌次」才會更新
```

> **不會自動同步**，這是刻意的。新人排桌一定會反覆調整，
> 前台不該因為後台還在整理座位就一直跟著跳。
> 想先存起來明天再說，就按「稍後再說」。

同步狀態一直寫在畫面最上面：

| 狀態 | 意思 |
|---|---|
| 尚未同步 | 目前排桌資料尚未同步至桌次查詢系統 |
| 已同步 | 最後同步：2026/08/18 20:30 |
| 有修改尚未同步 | 排桌已修改，尚未同步（按鈕變成「再次同步」） |

同步是**整份換掉**「我的桌次」那份名單，所以後台排桌與賓客查到的
永遠是同一份資料，不會有兩套真相。

> 同步之後，「桌次」分頁的桌次名單就是排桌的結果。
> 如果你原本已經在那裡手動匯入過名單，同步會把它整份換掉（會先問一次）。

反過來也走得通：「桌次 → 桌次搜尋及名單」的「**同步現在的排桌**」是同一個動作，
在整理名單的當下就按得到。這顆按鈕只有開了 `seatingPlan` 的站台才會出現；
還沒把任何人排進桌位的話會提示「**尚無排桌資料**」，不會把名單清空。

#### 從出席表單匯入

排桌名單的第一個來源就是**出席回覆**：賓客一送出，左邊的「未安排」就會多一位，
姓名、人數、葷素、兒童座椅、賓客自己選的標籤都跟著回覆走。
這是**接進來**、不是複製一份 —— 不會有兩份各自過期的名單。

「匯入匯出 →**從出席表單匯入**」把這件事攤開來看：現在接進來幾筆、幾人、
已確認／待確認／無法出席各幾筆、還有幾筆沒排到桌位，並列出前 12 筆。
如果有**和回覆同名的手動賓客**（先匯了 Excel、那個人後來又自己填了表單，
同一個人佔兩張卡），這裡會點出來，一鍵清掉（清完仍然可以「復原」）。

#### 匯入 Excel / CSV

給手上那份名單用的（沒填回覆的長輩、公司桌…）。
五個步驟：**選擇檔案 → 預覽資料 → 欄位對應 → 檢查資料 → 確認匯入**。

欄位對應會先自動猜一次（「賓客姓名」→「姓名」、「數量」→「人數」、
「桌號」→「桌位」），對不上再自己挑。

檢查不過的那幾筆**不會被匯進來**，而且會逐筆講清楚：

```
第 12 筆資料：人數不是有效數字（讀到「兩位」）
第 15 筆資料：編號「B01」已經有人用了
第 21 筆資料：找不到桌號「09」，請先在「桌位管理」建立
第 24 筆資料：標籤「伴娘」不存在，請先在「設定賓客標籤」建立
```

#### 匯出

| 格式 | 內容 |
|---|---|
| Excel | 一個檔案兩張工作表：**賓客明細** ＋ **桌位排桌表** |
| CSV（賓客明細） | 一列一位賓客 |
| CSV（桌位排桌表） | 依桌位分組，每桌結尾附總人數 |

欄位：類別、編號、桌號、桌名、賓客姓名、人數、RSVP、Tags、備註。

> Excel 的讀寫是自己寫的（`public/js/xlsx-lite.js`），沒有引入任何函式庫 ——
> `.xlsx` 就是一包 ZIP 裡的 XML，用瀏覽器內建的解壓縮與 XML 解析就夠了。

---

### 2. 給你的信（`/w/{slug}/letter`）

新人寫好一封封信，賓客輸入名字或專屬暗號就能拆開來看。
畫面是一個信封，輸入正確後封蠟消失、封口掀開、信紙滑出來。
信紙下面有「**儲存下載**」，把這封信存成一張 **JPG** 收進手機相簿或電腦
（用 canvas 重畫一次同一張信紙，沒有引入 html2canvas 之類的函式庫）。

在後台「感謝信」分頁按「寫一封信」，在跳出來的視窗裡填：

| 欄位 | 說明 |
|---|---|
| 專屬詞彙 | 賓客要輸入的通關密語，用逗號分開可以寫好幾個（名字、綽號、只有你們懂的暗號） |
| 信的標題 | 顯示在信紙最上面 |
| 信的內容 | 最多 2000 字，換行會保留 |
| 署名 | 留白就用新人的名字 |
| 通用信 | 勾起來的話，沒對到任何詞彙的賓客就領到這一封。**可以寫好幾封**（給同事一封、給遠道而來的親友一封…），系統依輸入的名字挑一封 —— 同一個名字每次拿到的都是同一封 |

清單上方用 chip 分成「**全部／通用信／指定信**」，每一顆帶著自己的封數；
每一列也標出自己是哪一種。指定信要填專屬詞彙，通用信不用。

> **詞彙不要寫太短**：比對允許「互相包含」，所以單字詞很容易被別人誤中。
> 建議至少兩個字，最保險是直接用全名。

> **信件內容是公開可讀的**。比對在瀏覽器端做，Firestore 的讀取請求
> 不帶條件，規則沒辦法「只讓對得上的人讀到那一封」。
> 這裡適合寫給某人的祝福，**不適合放不能被別人看到的祕密**
> —— 那種內容請用悄悄話信箱（祝福牆上的信箱，只有新人在後台讀得到）。

---

### 3. 首頁 Explore 自訂卡片

首頁 Explore 區原本都是模板功能（祝福牆、抽卡…）。
新人可以在後台「首頁卡片」分頁補上自己的內容，接在內建卡片後面。

兩種類型：

| 類型 | 點下去會 | 適合 |
|---|---|---|
| 文字＋連結（`link`） | 另開分頁到你給的網址 | 直播連結、Google 相簿、共乘表單 |
| 文字＋popup（`popup`） | 原地跳出一段文字 | 接駁車時間、停車資訊、注意事項 |

| 欄位 | 說明 |
|---|---|
| 卡片標題 | 卡片上的大字 |
| 一句話說明 | 標題下方的小字，選填 |
| 連結網址 | 只收 `http://` 或 `https://` 開頭（規則層也會擋，`javascript:` 之類寫不進去） |
| 彈窗內文 | 最多 2000 字，換行會保留 |
| 排序 | 數字小的排前面 |

卡片左上角的編號會**含自訂卡一起重編**，不會跳號。

---

### 4. 婚禮資訊（後台「婚禮資訊」分頁）

大廳（首頁）上的文字，新人自己改：

| 欄位 | 說明 |
|---|---|
| 標題 | 資訊卡最上面那行字，**最多 20 個字**；留白就用兩位的名字 |
| 地點名稱 | 資訊卡上的大字 |
| 地址 | 地點下方的小字，也是「開啟地圖」的預設搜尋字串 |
| 地圖連結 | 只收 `http(s)://` 開頭；留白就用地址自動開 Google 地圖 |
| 交通・大眾運輸 | 捷運、公車、接駁怎麼搭；**留白則大廳不出現** |
| 交通・停車資訊 | 停車場在哪、能不能折抵；**留白則大廳不出現** |
| Dress Code | **留白則大廳不出現**（不會再塞一句預設文案） |
| 關於禮金 | 同上 |
| 兩人的故事 | 大廳的 Our Story 區塊，也用在單頁式邀請函；**留白則大廳不出現** |
| 婚禮 hashtag | 逗號分開，最多 10 個；沒寫 `#` 會自動補上。**沒填就用 `#我們結婚了`、`#Married`** |

> 交通與 Dress Code 這兩塊都是左右兩格，只填一格時那一格會佔滿整列，
> 不會留半邊空白。

**當日流程**在同一頁下半部，一列一個項目（時間／項目／說明）。
由上到下就是時間軸的顯示順序 —— **不會依時間重新排**，
所以「11:30 起」這種寫法也沒問題。一列都沒有時，大廳顯示「流程稍後公布」。
有填流程時，大廳資訊卡的「時間」那一列底下會多一個文字連結，
點了直接捲到當日流程。

> **改不動的欄位**：新人姓名、婚禮日期、頁面開關、入場登入的開關、
> 出席回覆的開關與截止時間。
> 這些是 Security Rules 自己拿來判斷的依據（或會影響網址與倒數計時），
> 規則層只放行文案欄位的 `update`，其他欄位連夾帶都會被整筆拒絕。
> 要改這些請跑 `npm run set-pages` 或找我們。

---

### 5. 婚禮小卡（後台「婚禮小卡」分頁）

抽卡頁（`/w/{slug}/draw`）的卡池。

選好照片會**先跳出裁切框**：拖曳移動、滾輪／滑桿／兩指縮放，
框裡看到的就是最後存下來的樣子（卡片是直式 2:3）。
一次可以選很多張，會一張一張輪流裁切；按「取消」就跳過那一張。

裁好之後每張卡可以改：

| 欄位 | 說明 |
|---|---|
| 卡名 | 顯示在卡片下方，預設用檔名 |
| 等級 | `SSR`／`SR` 抽到時有彩虹光膜與煙火；`R`／`N` 是一般卡 |
| 說明 | 選填，顯示在大卡下方的小紙條 |

改完離開欄位就自動存檔，不用另外按儲存。想重切構圖就按「重新裁切」。

> **每張卡被抽到的機率相同**。想讓稀有卡難抽，就少放幾張 SSR、多放幾張 N。

> **只要這裡有任何一張卡，抽卡頁就整批用它**，不再讀素材資料夾
> （全有或全無，不會混在一起）。都沒有時才依序退回
> `assets/{slug}/cards/` → 內建範例卡。

---

### 6. 新人故事牆（後台「新人故事牆」分頁）

戀愛時光（`/w/{slug}/exhibition`）那條橫向時間軸，兩種東西：

| 型態 | 是什麼 | 要填 |
|---|---|---|
| 故事 | 時間軸上的一張拍立得 | 照片（可留空）、標題、年份、時間補充、章節、描述 |
| 章節 | 分隔段落，例如「第一幕・我們的相遇」 | 章節名稱、副標 |

兩種都用**排序**決定先後，數字小的排前面 ——
章節的排序要放在它底下那些故事的前面。

照片一樣會跳出裁切框，比例可以選直式 3:4／方形 1:1／橫式 4:3。
沒有照片的故事也存得起來，可以先把文字寫完之後再補圖。

第一次打開這個分頁時，會把 `js/exhibit-defaults.js` 那份預設故事牆
（4 個章節、17 則故事）寫進來當起點，直接改文字、換照片或刪掉都可以。

> 和婚禮小卡一樣：**只要這裡有任何一筆，戀愛時光就整批用它**，
> 都沒有時才退回 `assets/{slug}/exhibition/` → 內建範例。

> **照片為什麼要存成 data URL**：和桌次圖同一個理由 ——
> Firebase Storage 的規則讀不到 Firestore，沒辦法用 `ownerEmails`
> 判斷「是不是新人本人」。存進文件就能沿用同一套身分判斷。
> 代價是有大小上限，裁切器會自動把畫質與尺寸壓到符合。

> **卡圖與展品壓得比桌次圖更小**（約 150KB／190KB，桌次圖是 900KB）：
> 抽卡是隨機抽、時間軸是整條滑，兩者都沒辦法「只載一張」——
> 賓客一進頁面就會把整批圖載下來。所以婚禮小卡建議控制在 30 張以內。

---

### 7. 新人熟悉測驗（後台「新人熟悉測驗」分頁）

「看你多了解我們」（`/w/{slug}/quiz`）的題目。整份測驗是**一頁式**：
賓客一次看到所有題目，單選題選完會自動捲到下一題，
全部作答完才送得出去，送出後看到自己的**分數**與每題的長條圖。

按右上角「新增題目」會跳出視窗，每一題要填的東西：

| 欄位 | 說明 |
|---|---|
| 題型 | **單選**（選完自動跳下一題）／**複選**（全對才得分） |
| 題目 | 最多 60 字 |
| 四個選項 | 固定四個，每個最多 40 字 |
| 正確答案 | 在選項左邊勾起來；單選一個、複選可以勾好幾個 |

順序用清單左邊的 **⠿** 拖曳調整，數字會自動重編成 1…n。**最多 50 題**，
刪掉一題就能再加一題。

> **新人不用自己作答**。正確答案在這裡就設好了，
> 所以長條圖上只會有賓客自己的「**你**」，不會出現第二種標籤。
> 選項太長時，長條裡的文字會以「…」收尾，不會溢出長條也不會壓到「你」。

> **一開始就有 3 題預設題目**：第一次打開這個分頁時，
> 系統會把 `js/quiz-defaults.js` 裡的 3 題寫進這場婚禮自己的 `quiz` 集合，
> 直接改就好。整份刪光之後不會再自動補回來（同一個瀏覽器內），
> 想要的話按清單上的「載入預設題目來改」。
> 新人還沒進後台時，賓客那一頁也是先看到同一份預設題目。

切到「作答記錄」子分頁看得到作答人數與平均分數，
按「清空所有作答紀錄」只會刪票（`quizVotes`），題目不會被動到 ——
測試完歸零、或婚禮當天重新統計都用它。

> **票為什麼用「題目 id」當 key**：作答存成
> `picks = { 題目id: [選項索引] }`。用題號的話，新人之後調順序或刪題目，
> 舊票就會對到別題去；綁 id 則是「對不到的題目就不顯示」，不會算錯。
> （Firestore 的陣列不能再放陣列，複選題也因此必須包在 map 裡。）

---

## 素材（照片）怎麼放

**用站台的 slug 當資料夾名稱，把圖丟進去，跑一個指令就好**，
不必一張一張填網址。

### 1. 建立資料夾骨架

```bash
npm run sync-assets -- --init --slug ginny-one-20260919
```

會建好 `gallery/` `exhibition/` `cards/` `cakes/` `seating/` 五個子資料夾，
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
├─ cakes/             甜點桌
│   ├─ 01.png
│   └─ meta.json      （選填）甜點名稱／emoji
└─ seating/           桌次圖（我的桌次那頁下半部）
    ├─ 01.jpg
    └─ meta.json      （選填）每張圖的 title
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
> 畫面上會繼續播內建的預設音樂。順序是：
> **放檔案 → `npm run sync-assets` → `npx firebase deploy --only hosting`**

檔名不分大小寫（`BGM.MP3` 也認得）。如果檔名沒對上，
`sync-assets` 會直接把「這些檔案不會被使用」列出來，不會安靜地忽略。

- **沒放音檔的站台**會用內建的預設背景音樂 `public/audio/bgm.mp3`，
  全站共用同一首；要換掉整批站台的預設曲目就換這個檔案。
- 連預設音檔都載不起來時（離線、格式不支援），會再退一層到程式即時合成的
  艾爾加〈愛的禮讚〉音樂盒版，不會變成沒聲音。
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

> 婚禮小卡與戀愛時光還有更上面一層：新人在後台上傳的內容會**整批蓋過**
> 這裡的素材資料夾。素材資料夾適合圖多、想版控的情況；
> 後台適合新人自己隨時換。兩邊都有時以後台為準。

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

有兩條路，看你手邊有什麼：

| 方式 | 需要什麼 | 適合 |
|---|---|---|
| 後台「出席回覆」分頁 | 新人的 Google 帳號 | 平常查看、隨手匯出，新人自己就能做 |
| `npm run export-rsvps` | 管理端金鑰 | 排程、批次，或新人的帳號還沒設好 |

**賓客彼此永遠讀不到別人的回覆** —— 規則只放行 `ownerEmails` 名單內的帳號。

CLI 走 Admin SDK，以服務帳戶連線會略過 Security Rules，不需要任何登入：

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
欄位依序是：

```
稱呼、是否出席、與新人關係、電話、LINE、Email、
人數、葷食、素食、兒童座椅、飲食習慣、
喜帖、喜帖領取、喜帖郵遞區號、喜帖地址、喜帖 Email、
喜餅、喜餅郵遞區號、喜餅地址、給新人的話、其他備註、回覆時間
```

代號都已經換成中文（`groom` → 男方親友、`paper` → 需要紙本喜帖…），
和後台名單、儀表板上寫的是同一組字。
沒出席的那幾筆，人數與餐點欄位留空而不是填 0 —— 0 會被誤讀成「來了但不吃」。

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
[8]  手機版無水平捲動          # 含後台（分頁列可橫向滑動）
[9]  素材資料夾自動載入        # manifest、大廳背景、甜點、囍卡、展品
[10] 信箱權限                  # 賓客寫得進、讀不到；舊網址導到後台；後台讀得到
[11] 桌次查詢                  # 名字比對、同桌名單、信件入口
[12] 新人的感謝信              # 專屬詞彙、通用信
[13] Explore 自訂卡片          # 連結型／彈窗型、編號重編
[14] 新人後台                  # Google 登入、外人進不去也寫不進去
[14c] 後台開關表單題目         # 關掉的題目賓客那邊真的不見、儀表板也少一張圖
[15] 後台改大廳文案            # 地點／Dress Code／流程寫回 sites，大廳同步
[16] 後台上傳婚禮小卡與故事牆  # 裁切器、預設內容、卡池整批取代、收藏只記 cardId
```

### 單頁邀請函測試

```bash
npm run test:e2e
```

會自動寫入測試資料並用 Chromium 跑完整流程，預期全部 ✅：

```
[1]  /w/{slug}/invitation   # 內容、時區、倒數、照片牆、hashtag、行事曆
                            # 以及「與其他頁共用版型」：導覽列、浮動控制、common.css
[1a] 出席回覆的題目         # 三個出席選項、關係／聯絡方式／喜帖／喜餅、
                            # 條件欄位、葷素連動、兩個「同上」捷徑
[1b] 照片放大               # 點圖開啟、Esc 關閉
[2]  /w/wu-yang-1220        # 另一組 slug，內容互不干擾、空欄位區塊隱藏
[3]  /w/does-not-exist      # 中文找不到畫面，非白畫面且無 console 錯誤
[4]  draft 站台             # 未發布顯示找不到畫面
[4b] RSVP 截止與關閉
[5]  RSVP 送出流程          # 不跳頁、成功狀態、寫入欄位正確
[6]  honeypot 擋機器人      # 畫面顯示成功但確認未寫入 Firestore，並逐一驗證新欄位
[8]  短連結 /s/{code}       # 正常轉址、不存在代號、javascript: 協定被擋
[9]  舊的 /rsvp 網址        # 301 導到 /invitation，導過去之後表單正常
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
| `sites/{siteId}/rsvpTags` | 只有新人 | 只有新人 | 只有新人 | 只有新人 |
| `sites/{siteId}/wishes` | ✅ | ✅（需通過驗證） | ❌ | ❌ |
| `sites/{siteId}/letters` | 只有 `ownerEmails` 名單內的已驗證 Google 帳號 | ✅（需通過驗證） | ❌ | ❌ |
| `sites/{siteId}/cakes` | ✅ | ✅（需通過驗證） | ❌ | ❌ |
| `sites/{siteId}/quiz` | ✅ | 只有新人 | 只有新人 | 只有新人 |
| `sites/{siteId}/quizVotes` | ✅ | ✅（需通過驗證） | ❌ | 只有新人（重置票數） |
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

新人到 `/w/{slug}/admin` 按「用 Google 帳號登入」，
在「悄悄話」分頁讀信；名單內的帳號才進得去，其他人（含賓客）連 API 都讀不到。

- 賓客**寫得進去、讀不出來**
- 祝福牆上的「已有 N 封信」用另一個公開計數器 `meta/letterCount`，
  只看得到數量、看不到內容
- 沒設定 `--owner-email` 的站台，後台會直接說「還沒設定新人的 Google 信箱」

> **為什麼不用密碼？**
> Firestore 的讀取請求不帶 payload，規則無法驗證「使用者輸入的密碼」。
> 密碼門只能擋住畫面，資料仍可透過 API 取得，等於沒有保護。
> 要真的保密就必須用 Auth 身分，所以這裡改成 Google 登入。

RSVP 建立時必須全數通過：

- 欄位集合必須落在允許清單內，不可夾帶額外欄位
- 核心欄位（`name` `attending` `guestCount` `dietaryNote` `message` `createdAt`）必填，
  其餘一律選填，舊版表單送出的回覆仍然收得下
- `name` 為 string，長度 1–40
- `attending` 為 boolean
- `guestCount` 為 int，1–10
- `dietaryNote`、`message`、`note` 為 string，長度 ≤ 300
- `relation`／`cardType`／`cardDelivery`／`giftDelivery` 只收列舉值
- `mealMeat`／`mealVeg`／`childSeat` 為 int，0–10
- `cardZip`／`giftZip` ≤ 10 字，`cardAddress`／`giftAddress` ≤ 200 字
- `contactPhone` ≤ 30 字、`contactLine` ≤ 60 字、`contactEmail`／`cardEmail` ≤ 120 字
- `createdAt` 必須等於 `request.time`（防止偽造時間）
- 對應的 `sites/{siteId}` 存在、`status == "published"`、`rsvpEnabled == true`
- 尚未超過 `rsvpDeadline`

> 規則不驗「選了郵寄就一定要有地址」這類跨欄位條件 ——
> 那等於把整份表單邏輯複製一份到規則裡，日後兩邊會走鐘。
> 這些檢查在 `public/js/rsvp-form.js` 送出前擋好。

所有寫入 `sites`／`slugs`／`short` 的操作都走 **Admin SDK**（`scripts/` 底下的腳本），
Admin SDK 以服務帳戶連線，會略過 Security Rules，因此不需要為管理端在規則裡開後門。

前端另有 honeypot 隱藏欄位擋機器人：機器人填了該欄位時，
畫面照樣顯示成功，但實際不寫入資料庫。
