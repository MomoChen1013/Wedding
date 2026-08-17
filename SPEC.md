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
`shortlink.html` 自帶 CSS／JS（它只是一個轉址頁，不屬於任何站台）；
其餘頁面（含單頁邀請函）共用 `css/` 與 `js/`，由 `js/site-context.js` 統一載入。

---

## 2. 資料模型（Firestore）

```
sites/{siteId}
  slug            : string   # 網址代稱，全域唯一，如 "chen-lin-0315"
  ownerEmail      : string   # 新人聯絡信箱
  status          : string   # "draft" | "published" | "archived"
  groomName       : string
  brideName       : string
  coupleTitle     : string   # 選填，大廳資訊卡上的稱呼（≤8 字）；留白就用兩人的名字
  eventDate       : timestamp
  eventEndDate    : timestamp | null   # 婚宴結束時間，加入行事曆用；null 則抓開始後 3 小時
  timezone        : string   # IANA 時區，如 "Asia/Taipei"（見下方說明）
  venueName       : string
  venueAddress    : string
  venueMapUrl     : string
  themeColor      : string   # hex，如 "#3D9AD1"
  coverImageUrl   : string
  story           : string   # 兩人的故事，支援換行；留白則大廳不出現這一塊
  photos          : string[] # 照片牆，陣列順序即顯示順序
  hashtags        : string[] # 婚禮 hashtag，前面沒有 # 會自動補上
                             # 留白則用預設的 #我們結婚了 / #Married
  dressCode       : string   # 服裝建議，支援換行；留白則大廳不出現
  giftNote        : string   # 禮金說明，支援換行；留白則大廳不出現
  transportPublic : string   # 大眾運輸說明，支援換行；留白則大廳不出現
  transportParking: string   # 停車說明，支援換行；兩格都留白時整塊不出現
  schedule        : map[]    # 當日流程，陣列順序即顯示順序（見下方說明）
  rsvpDeadline    : timestamp
  rsvpEnabled     : boolean
  seatingSearchEnabled : boolean  # 桌次頁的搜尋開關，沒有這個欄位視為 true；
                                  # false 時賓客只看得到已上傳的桌次圖
  # ↓ 出席回覆那一頁的題目與區塊開關，由新人在後台設定。
  #   沒有這些欄位一律視為 true（舊站台不會突然少東西）
  rsvpAskCard     : boolean  # 要不要問「喜帖發送方式」
  rsvpAskGift     : boolean  # 要不要問「喜餅領取方式」
  rsvpAskMessage  : boolean  # 要不要問「想對新人說的話」
  rsvpContactMethods : string[]  # 要問哪幾種聯絡方式，'phone'|'line'|'email'
                                  # 沒有這個欄位＝三種都問；空陣列＝整題不問
  rsvpShowStory   : boolean  # 那一頁要不要放「兩人的故事」
  rsvpShowGallery : boolean  # 那一頁要不要放「照片集」
  pages           : map      # 頁面開關，見第 10 節
  ownerEmails     : string[] # 新人的 Google 信箱；規則據此決定誰進得了後台
  createdAt       : timestamp
  updatedAt       : timestamp

  # 各功能的子集合，站台之間完全隔離
  rsvps/{autoId}
    name          : string
    attending     : boolean  # 只有「熱情出席」是 true
    tentative     : boolean  # 選填，true 代表「視情況而定」
    guestCount    : number   # 1–10
    relation      : string   # 選填，與新人的關係
                             #   'groom'|'bride'|'both'|'other'
    contactPhone  : string   # 選填，電話（≤30）
    contactLine   : string   # 選填，LINE ID（≤60）
    contactEmail  : string   # 選填，Email（≤120）
                             #   新人選了要問哪幾種；賓客至少要填一種
    mealMeat      : number   # 選填，葷食人數（0–10）
    mealVeg       : number   # 選填，素食人數（0–10）；兩者相加＝guestCount
    childSeat     : number   # 選填，兒童座椅張數（0–10），0 代表不需要
    dietaryNote   : string   # 飲食習慣補充，選填
    cardType      : string   # 選填，喜帖形式
                             #   'paper'|'digital'|'none'
    cardDelivery  : string   # 選填，紙本喜帖的給法 'pickup'|'mail'（其餘為 ''）
    cardZip       : string   # 選填，喜帖郵寄的郵遞區號（≤10）
    cardAddress   : string   # 選填，喜帖郵寄地址（≤200）
    cardEmail     : string   # 選填，電子喜帖要寄到的 Email（≤120）
    giftDelivery  : string   # 選填，喜餅 'pickup'|'mail'
    giftZip       : string   # 選填，喜餅郵寄的郵遞區號（≤10）
    giftAddress   : string   # 選填，喜餅郵寄地址（≤200）
    message       : string   # 給新人的話，選填
    note          : string   # 其他備註，選填
    icon          : string   # 選填，賓客 emoji
    meal          : string   # 選填，舊版表單的單一餐點欄位（保留相容）
    createdAt     : timestamp

  wishes/{autoId}     name, icon, text(≤300), time      # 祝福牆
  letters/{autoId}    name, icon, text(≤1000), time     # 悄悄話（後台的悄悄話分頁）
  cakes/{autoId}      name, icon, cake, emoji, img, time
  quizVotes/{autoId}  picks(map ≤50), score(int), total(int), time
                      # 小測驗的作答；picks 是 題目id → 選項索引 list
  collected/{autoId}  uid, userName, art, name, rarity, desc, cardId, time
  meta/hearts         count(int)                        # 愛心計數器
  meta/letterCount    count(int)                        # 公開的信件數量

  # 以下七個由新人在 /w/{slug}/admin 維護，寫入需通過 ownerEmails 白名單
  seating/{autoId}       name, table, note(≤100), time            # 桌次名單
  seatingImages/{autoId} img(data URL ≤950000), title, order, time # 桌次圖
  blessings/{autoId}     terms(list ≤20), title, body(≤2000),
                         sign, isDefault(bool), time              # 電子祝福信
  explore/{autoId}       title, sub, kind('link'|'popup'),
                         url, body(≤2000), order, time            # 首頁自訂卡片
  cards/{autoId}         img(data URL ≤950000), name(≤60),        # 囍卡卡池
                         rarity('SSR'|'SR'|'R'|'N'), desc(≤200), order, time
  exhibits/{autoId}      kind('photo'|'act'), img(data URL ≤950000 或 ''),
                         title(≤60), sub(≤60), desc(≤500),        # 戀愛時光的展品
                         year(≤20), act(≤40), order, time         # kind='act' 是章節分隔卡
  quiz/{autoId}          type('single'|'multi'), q(≤60),          # 小測驗的題目
                         opts(list，固定 4 個，每個 ≤40),           # 最多 50 題
                         answer(list，正確答案的索引；single 只有 1 個),
                         order, time

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

**`schedule`（當日流程）**：大廳的時間軸，陣列裡每一筆是一個 map：

```json
[
  { "time": "11:30", "title": "入場迎賓", "desc": "簽到、拍照" },
  { "time": "12:00", "title": "婚宴開始" },
  { "time": "14:30", "title": "送客" }
]
```

| 欄位 | 說明 |
|---|---|
| `time` | 時間文字，不做格式驗證，寫 `11:30` 或 `11:30 起` 都可以 |
| `title` | 項目名稱 |
| `desc` | 選填，補充說明；沒有就不顯示那一行 |

陣列順序即顯示順序，不會依 `time` 重新排序。
整個欄位沒填或是空陣列時，畫面顯示「流程稍後公布，敬請期待」。

`schedule` 沒有對應的 CLI（`create-site.js` 不會寫入這個欄位），
改由新人在後台「大廳內容」分頁自己編（見第 13.4 節）。

---

## 3. Security Rules

安全邊界靠規則，不靠專案隔離。

| 路徑 | read | create | update | delete |
|---|---|---|---|---|
| `sites/{siteId}` | 允許 | 拒絕 | 新人（限文案欄位） | 拒絕 |
| `sites/{siteId}/rsvps/{id}` | 新人 | 允許（需通過驗證） | 拒絕 | 拒絕 |
| `sites/{siteId}/seating/{id}` | 允許 | 新人 | 新人 | 新人 |
| `sites/{siteId}/seatingImages/{id}` | 允許 | 新人 | 新人 | 新人 |
| `sites/{siteId}/blessings/{id}` | 允許 | 新人 | 新人 | 新人 |
| `sites/{siteId}/explore/{id}` | 允許 | 新人 | 新人 | 新人 |
| `sites/{siteId}/cards/{id}` | 允許 | 新人 | 新人 | 新人 |
| `sites/{siteId}/exhibits/{id}` | 允許 | 新人 | 新人 | 新人 |
| `sites/{siteId}/quiz/{id}` | 允許 | 新人 | 新人 | 新人 |
| `sites/{siteId}/quizVotes/{id}` | 允許 | 允許（需通過驗證） | 拒絕 | 新人（重置票數） |
| `slugs/{slug}` | 允許 | 拒絕 | 拒絕 | 拒絕 |
| `short/{code}` | 允許 | 拒絕 | 拒絕 | 拒絕 |

「新人」＝ `isSiteOwner(siteId)`：已驗證的 Google 信箱在 `sites.ownerEmails` 名單內。

讀寫權限分成兩種型態，界線就是「這份資料賓客需不需要看到」：

| 型態 | 集合 | read | write |
|---|---|---|---|
| 賓客要用的內容 | `seating` `seatingImages` `blessings` `explore` `cards` `exhibits` `quiz` | 公開 | 新人 |
| 賓客交上來的資料 | `rsvps` `letters` | 新人 | 賓客（create only） |
| 賓客的公開投票 | `wishes` `cakes` `quizVotes` | 公開 | 賓客（create only） |

上面那組 **read 必須公開**，因為比對（桌次查名字、祝福信對暗號）在瀏覽器端做——
Firestore 的讀取請求不帶條件，規則沒有辦法「只讓對得上的人讀到那一筆」。
不能被別人看到的內容請放下面那組，它們的 read 綁在 Auth 簽發的身分上。

### 站台文件的 update：只放行文案欄位

`sites/{siteId}` 的 `update` 從全面禁止改成「新人可以改文案」，
但只認白名單裡的欄位：

```
coupleTitle venueName venueAddress venueMapUrl transportPublic transportParking
dressCode giftNote story schedule hashtags seatingSearchEnabled updatedAt
rsvpAskCard rsvpAskGift rsvpAskMessage rsvpContactMethods
rsvpShowStory rsvpShowGallery
```

最後那六個 `rsvp*` 與 `seatingSearchEnabled` 一樣，是「非文案但可以放行」的欄位：
它們只改變賓客看到的表單長什麼樣，規則本身不拿它們做任何判斷 ——
能不能寫回覆仍然只看 `rsvpEnabled` 與 `rsvpDeadline`，那兩個依舊改不動。

`seatingSearchEnabled` 是唯一一個非文案的欄位，放行的理由是它只改變賓客那一頁的
畫面（要不要出現搜尋欄），規則本身不拿它做任何判斷 —— 桌次名單的讀寫權限
和有沒有這個開關無關。

實作用 `request.resource.data.diff(resource.data).affectedKeys().hasOnly([...])`，
所以夾帶任何一個名單外的欄位（哪怕其他欄位都合法）整筆就被拒。

**為什麼 `status`、`ownerEmails`、`pages`、`rsvpEnabled`、`rsvpDeadline` 不能改**：
這些欄位是規則自己拿來做判斷的依據。
放行等於讓新人可以把自己以外的帳號加進白名單、把已截止的 RSVP 重新打開 ——
規則就不再是邊界了。要改這些欄位一律走 Admin SDK（`set-pages.js`）。

`schedule` 的每一筆是 map，規則語言沒辦法逐筆檢查內容，
只擋筆數（≤40）與型別；長度上限在後台送出前先切好。

### RSVP 建立時的驗證條件

寫成 rules 內的 helper function `isValidRsvp()`，涵蓋：

- 欄位集合必須落在允許清單內，不可夾帶額外欄位
- 核心欄位（`name` `attending` `guestCount` `dietaryNote` `message` `createdAt`）必填，
  其餘一律選填 —— 舊版表單送出的回覆仍然收得下
- `name` 為 string，長度 1–40
- `attending` 為 boolean
- `guestCount` 為 int，介於 1–10
- `message`、`dietaryNote`、`note` 為 string，長度 ≤ 300
- `relation`／`cardType`／`cardDelivery`／`giftDelivery` 只收列舉值（見第 2 節）
- `mealMeat`／`mealVeg`／`childSeat` 為 int，介於 0–10
- `cardZip`／`giftZip` ≤ 10 字，`cardAddress`／`giftAddress` ≤ 200 字
- `contactPhone` ≤ 30 字、`contactLine` ≤ 60 字、`contactEmail`／`cardEmail` ≤ 120 字
- `createdAt` 必須等於 `request.time`（防止偽造時間）
- 對應的 `sites/{siteId}` 必須存在、`status == "published"`、`rsvpEnabled == true`
- 若已過 `rsvpDeadline` 則拒絕寫入

**規則不驗跨欄位的商業邏輯**（例如「選了郵寄就一定要有地址」、
「葷素相加要等於出席人數」）。那些條件寫得出來，但寫進規則等於把整份表單邏輯
複製一份，日後改了表單忘了改規則就會走鐘 —— 改在 `js/rsvp-form.js`
送出前擋好。規則負責的是型別、長度、值域這些結構性條件。

RSVP 的讀取綁在**新人本人的 Google 身分**上（`isSiteOwner()`），
與悄悄話同一套判斷：賓客寫得進去、彼此讀不到，
新人在 `/w/{slug}/admin` 登入後看得到完整名單。

**仍然不開放 `update` 與 `delete`**：回覆是賓客送出的紀錄，
新人可以看、可以匯出，但不該在後台改掉別人寫的內容。
真的要刪（測試資料、重複回覆）走 Admin SDK。

`npm run export-rsvps` 仍然保留：Admin SDK 以服務帳戶連線會略過 Security Rules，
不需要任何登入，適合排程或批次作業。

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

網址採**路徑式**：`https://{專案網域}/w/{slug}/{page}`
目前部署在 Hosting 站台 `minato-studio-wedding`
（`firebase.json` 的 `hosting.site`）；
腳本印出的網址前綴由 `scripts/site-url.js` 決定，
可用 `WEDDING_BASE_URL` 覆寫，不必改程式。

`firebase.json` rewrite：

| 來源 | 目的 |
|---|---|
| `/w/*/wall` `/w/*/cake` | 對應的 HTML |
| `/w/*/draw` `/w/*/exhibition` `/w/*/quiz` | 對應的 HTML |
| `/w/*/seating` `/w/*/letter` `/w/*/admin` | 對應的 HTML |
| `/w/*/invitation` | `/invitation.html` |
| `/w/:slug/rsvp` | 301 → `/w/:slug/invitation`（已合併） |
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

`public/js/cropper.js` 是後台專用的照片裁切器，只有 `admin.html` 會載入它。

---

## 8. 邀請函頁面的視覺要求

**與其他頁面共用同一套設計**，不再自成一格：

- `css/common.css` ＋ `css/rsvp.css` ＋ 只放這頁獨有元件的 `css/invitation.css`
- 版型骨架沿用子場景頁：`.scene-hero`（50vh 標題區）→ `.scene-body`
  → `.section-title` ＋ `.cardbox`
- 字體 `Noto Serif TC` 單一字族、1px 線條、**無陰影**、大量留白
- 主題色走全站的四組色票（香檳金／霧玫瑰／鼠尾草綠／霧霾藍），
  右下角浮動控制可即時切換；頂部導覽列與 BGM 控制也和其他頁一樣
- 全站 RWD，手機優先
- RSVP 表單送出後不跳頁，以 async 寫入 Firestore 並顯示成功狀態
- 表單有 honeypot 隱藏欄位擋機器人（觸發時畫面照樣顯示成功，但不寫入）

> **`themeColor` 不再套用在這一頁**：多頁面站台的其他頁面本來就只吃
> `data-theme` 的四組色票，邀請函要「跟其他頁一樣」就得放掉每站一個主色的做法。
> 欄位保留在資料模型裡，只是前端不再讀它。

頁面區塊順序：
封面（含倒數計時）→ 封面照 → 兩人的故事 → 婚禮資訊（日期／地點／服裝／禮金
＋加入行事曆）→ 照片牆 → RSVP → hashtag → footer。
**每個區塊在對應欄位是空的時候會整段隱藏**，不會留下空標題。

- 倒數計時：顯示距離婚禮剩餘天數，婚禮當天過後改顯示「我們結婚囉」
- 照片牆：響應式格狀排列（手機 2 欄／桌機 3 欄），點圖可放大，
  支援 Esc 關閉；載不到的圖會整格移除不留破圖
- 加入行事曆：前端產生 `.ics` 檔下載，iOS／Android／桌機通用，
  不依賴任何第三方服務

### 出席回覆只有一頁

原本有兩頁：`/w/{slug}/rsvp`（表單）與 `/w/{slug}/invitation`（單頁邀請函，
也帶一份表單）。兩頁問的是同一件事、寫進同一個 `rsvps` 子集合、
後台也只有一份儀表板 —— 題目各寫一份，一邊改了另一邊就對不上。

所以合併成一頁：

| 項目 | 值 | 為什麼 |
|---|---|---|
| 網址 | `/w/{slug}/invitation` | 對外分享的是這個連結 |
| 舊網址 | `/w/{slug}/rsvp` → 301 | 先前發出去的連結不會壞掉 |
| `pages` 開關代號 | 仍然是 `rsvp` | 規則的 `pageOn()`、後台分頁、`set-pages` CLI 都靠它，改 key 會讓既有站台的設定失效 |

因此 `js/site-context.js` 的 `PAGES` 把「網址片段」（`path`）與
「開關代號」（key）分開記，兩者不一定相同。

**這一頁不要求先在大廳報到**（沒有 `requireUser()`）：
它是對外分享的連結，賓客點進去就該看得到表單，
不必先看入場動畫、填名字。沒報到過的訪客，
導覽列上也不會出現「朋友 ▾／登出」那一塊（`buildSiteNav()` 判斷）。

表單的 DOM 與送出邏輯在 **`public/js/rsvp-form.js`**，
HTML 只放一個 `<div id="rsvpFormHost">` —— 題目會依新人在後台的設定增減，
寫死在 HTML 裡就做不到。
它是一般 script（不是 module），載入當下只定義函式，
等頁面 JS 呼叫 `RSVPForm.mount()` 才動到畫面 ——
`window.SITE` 與 `DataStore` 要等 `site-context.js` 準備好才有。

選項的文字集中在 `js/common.js` 的 `RSVP_OPTIONS`、
哪些題目要問集中在 `rsvpConfig()`，
表單、頁面與後台儀表板讀的都是這兩份，三邊才不會各自解讀。

題目與條件顯示（★ 是新人可以在後台關掉的）：

| 題目 | 型態 | 何時出現 |
|---|---|---|
| 怎麼稱呼你 | 文字，必填 | always |
| 能來參加嗎 | 單選：熱情出席／視情況而定／誠摯祝福但無法出席 | always |
| 與新人的關係 | 單選：男方親友／女方親友／雙方親友／其他 | always |
| ★ 聯絡方式 | 電話／LINE／Email，新人複選要問哪幾種；賓客至少填一種 | 至少勾一種時才出現 |
| 出席人數 | 1–10 | 選「熱情出席」才出現 |
| 餐點分配（葷／素） | 兩個計數器，相加恆等於出席人數 | 同上 |
| 兒童座椅 | 勾選後才問張數 | 同上 |
| 飲食習慣補充 | 文字，選填 | 同上 |
| ★ 喜帖發送方式 | 單選：紙本／電子／不需要 | always |
| 紙本要怎麼給 | 單選：自行領取／郵寄 | 選「紙本」才出現 |
| 喜帖郵寄地址 | 郵遞區號 ＋ 地址 | 選「郵寄」才出現 |
| 電子喜帖的 Email | 文字，可勾「同上」帶入聯絡方式的 Email | 選「電子」才出現 |
| ★ 喜餅領取方式 | 單選：現場領取／郵寄 | always |
| 喜餅郵寄地址 | 郵遞區號 ＋ 地址，可勾「同上」帶入喜帖的地址 | 選「郵寄」才出現 |
| ★ 想對新人說的話 | 文字，選填 | always |
| 其他備註 | 文字，選填 | always |

**葷素為什麼要互相連動**：兩格加起來永遠等於出席人數 ——
改一邊另一邊跟著動，賓客分配不出一個和人數對不上的組合，
新人也就不必事後回頭問「你們家到底幾個吃素」。

**兩個「同上」的捷徑**：婚禮表單最惹人厭的就是同一個地址打兩次。

| 在哪一題 | 帶入什麼 | 什麼時候出現 |
|---|---|---|
| 電子喜帖的 Email | 聯絡方式填的 Email | 有問 Email 而且賓客填了 |
| 喜餅的郵寄地址 | 喜帖的郵寄地址 | 有問喜帖而且賓客填了地址 |

勾起來時目標欄位轉成**唯讀**而不是隱藏 —— 賓客要看得到自己帶了什麼下來；
要改就把勾勾取消。來源清空時選項自己收起來，不會留下一個帶不到東西的勾勾。

**規則不驗這些跨欄位條件**（見第 3 節）：
「選了郵寄就要有地址」「至少留一種聯絡方式」都在送出前擋，
規則只認型別、長度、值域。

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
| `rsvp` | `/w/{slug}/invitation` | 出席回覆（婚禮資訊＋表單同一頁） | ✅ |
| `wall` | `/w/{slug}/wall` | 祝福牆 | ✅ |
| `cake` | `/w/{slug}/cake` | 甜點桌 | ✅ |
| `draw` | `/w/{slug}/draw` | 囍卡抽卡 | ✅ |
| `exhibition` | `/w/{slug}/exhibition` | 戀愛時光 | ✅ |
| `quiz` | `/w/{slug}/quiz` | 新人小測驗 | ✅ |
| `seating` | `/w/{slug}/seating` | 我的桌次 | ✅ |
| `letter` | `/w/{slug}/letter` | 給你的信（電子祝福信） | ✅ |
| `admin` | `/w/{slug}/admin` | 新人後台 | ❌ |

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

---

## 11. 站台素材

每組新人的圖片放在 `public/assets/{slug}/`，資料夾名稱就是 slug。
`scripts/sync-assets.js` 掃描後產生 `manifest.json`，網頁載入時自動套用。

| 位置 | 用途 |
|---|---|
| `cover.*` | 封面大圖（單頁邀請函） |
| `bgm.*` | 背景音樂；沒放則用內建預設 `/audio/bgm.mp3`，載不起來才退到合成的〈愛的禮讚〉 |
| `lobby.*` / `lobby-blur.*` | 大廳背景與其模糊版 |
| `gallery/` | 照片牆 |
| `exhibition/` | 戀愛時光的展品 |
| `cards/` | 囍卡 |
| `cakes/` | 甜點桌 |
| `seating/` | 桌次圖（也可以改由新人在後台直接上傳） |

- 檔名排序即顯示順序（建議 `01`、`02`…）
- 各子資料夾可放選填的 `meta.json`，用檔名當 key 補上標題／年份／稀有度等文字
- 沒放素材的站台沿用內建預設，不會壞掉
- Firestore 的 `coverImageUrl`／`photos` 有填時優先於資料夾掃描結果
- 囍卡與戀愛時光另外多一層：新人在後台上傳的 `cards`／`exhibits`
  有東西時，整批蓋過素材資料夾（見第 13.5、13.6 節）

**為什麼需要掃描步驟**：瀏覽器無法列出伺服器上的目錄，
所以由建置端掃一次寫成 manifest，前端再讀 manifest。
不引入建置工具，也不需要 Cloud Functions。

---

## 12. 悄悄話的權限

`letters` 的讀取由規則檢查 Google 帳號的**已驗證信箱**是否在
`sites.ownerEmails` 名單內：

```
allow read: if request.auth != null
  && request.auth.token.email_verified == true
  && request.auth.token.email in site(siteId).ownerEmails;
```

- 賓客寫得進去、讀不出來（連 API 都拿不到）
- 新人在 `/w/{slug}/admin` 用 Google 登入，在「悄悄話」分頁查看
  （原本是獨立的 `/w/{slug}/inbox`，門檻與後台相同，已經併進後台；
   舊網址由 `site-context.js` 導到 `/w/{slug}/admin`）
- 祝福牆的「已有 N 封信」改用公開計數器 `meta/letterCount`，
  只暴露數量、不暴露內容

**為什麼不用密碼**：Firestore 的讀取請求不帶 payload，
規則沒有辦法驗證使用者輸入的密碼。密碼門只能遮住畫面，
資料仍可透過 API 直接取得，等於沒有保護。
真正的保護必須綁在 Auth 簽發的身分上。

**後台的「悄悄話」分頁**：新的排前面，一封一段（記號、名字、時間、內容），
清單上方標著目前有幾封，名字或內容可搜尋，
也能匯出 CSV（匯出的是目前搜尋出來的那些）。
訂閱寫在 `openAdmin()` 裡的 `DataStore.subscribeLetters()` ——
登入成功之後才訂閱，未登入時連 `onSnapshot` 都不會發出去。
規則只開 `read`（限 `ownerEmails`）與 `create`（賓客投信），
`update`／`delete` 都是 `false`，所以後台只能看與匯出。

---

## 13. 新人自己維護的內容（後台 `/w/{slug}/admin`）

前面幾個模組的內容都是建站時由 CLI 寫進去、之後改要走 Console。
以下的模組**由新人自己在瀏覽器裡維護**，改完重新整理就生效，
不需要 deploy、也不需要我們介入。

進入條件：Google 登入 + 信箱在 `sites.ownerEmails` 名單內（`isSiteOwner()`）。
後台不列在導覽列、不被任何頁面連結、標了 `noindex`，
但真正的保護是 Security Rules —— 不在名單內的帳號改了 DOM 也寫不進去。

**分頁跟著 `pages` 走**：這組新人沒開的頁面，後台就不出現那一區的編輯內容
（`admin.js` 的 `TAB_PAGE`）—— 關掉抽卡卻還讓新人傳婚禮小卡，傳完賓客也看不到。
對照表如下，沒開的分頁連資料訂閱都省下來：

| 後台分頁 | 需要開的頁面 |
|---|---|
| 出席回覆 | `rsvp` |
| 婚禮資訊 | 永遠都在（大廳是必開的頁面） |
| 桌次 | `seating` |
| 感謝信 | `letter` |
| 首頁卡片 | 永遠都在（Explore 區屬於大廳） |
| 婚禮小卡 | `draw` |
| 新人故事牆 | `exhibition` |
| 新人熟悉測驗 | `quiz` |

預設開著的那一頁（出席回覆）剛好被關掉時，會自動改開第一個還在的分頁。

**一個分頁裝好幾件事的，用橫向子分頁分開**（`admin.js` 的 `SUBTABS`），
網址是 `#分頁/子分頁`，重新整理或分享連結都回得到原本那一頁：

| 分頁 | 子分頁 |
|---|---|
| 婚禮資訊 | 婚禮資訊／當日流程／自訂內容 |
| 桌次 | 桌次圖／桌次搜尋及名單 |
| 新人熟悉測驗 | 測驗題目／作答記錄 |

**新增與編輯一律開彈窗**（桌次名單、感謝信、故事牆、測驗題目、自訂內容）：
清單是這些分頁的主畫面，表單只在要動它的時候才出現。
彈窗裡叫得出裁切器（故事牆的照片），所以裁切器的 z-index 壓在所有彈窗之上。

### 13.1 我的桌次（`seating`）

婚禮當天的查詢頁，分成兩塊：

| 區塊 | 資料來源 |
|---|---|
| 名字 → 桌次的查詢 | `sites/{siteId}/seating` |
| 桌次圖（多張、可放大拖曳） | `sites/{siteId}/seatingImages` ＋ `assets/{slug}/seating/` |

**搜尋可以整個關掉**（後台的 `seatingSearchEnabled` 開關）：
關掉時前台只留桌次圖，查詢欄整塊收起來，也不再訂閱整份名單 ——
名單還沒整理好、或本來就打算讓大家自己看圖找位子時用。
沒有這個欄位的舊站台視為開著，行為不變。
搜尋關著、桌次圖也還沒上傳時，頁面會顯示一句「座位表還沒公布」而不是一片空白。

**名字比對**由寬到嚴，先找到就用：正規化後完全相同 →
名單的名字包含輸入的字 → 輸入的字包含名單的名字。
正規化會去空白、全形轉半形、英文轉小寫（`common.js` 的 `normKey()`），
所以賓客怎麼打都找得到。查到之後一併列出同桌還有誰。

**桌次圖為什麼存成 data URL**：新人要能在瀏覽器裡直接上傳，
而 Firebase Storage 的規則**讀不到 Firestore**，
沒辦法用 `ownerEmails` 白名單判斷身分（除非改用 custom claims，
那等於引入一套使用者管理，違反第 1 節「不做複雜權限管理系統」）。
存進 Firestore 文件就能沿用同一個 `isSiteOwner()`，也不必設定 CORS。

代價是單一文件 1MB 的上限。因此上傳前在瀏覽器端縮圖：
最長邊 1800px → JPEG，畫質由 0.86 逐級往下試，還是超過就再縮一輪，
上限抓 900000 字元（規則裡是 950000，留一點餘裕）。

### 13.2 給你的信（`letter`）

新人寫好一封封信，每封掛 `terms`（專屬詞彙）；
賓客輸入任一個詞彙就領到那封信，都對不上時退回 `isDefault` 的通用信。
畫面是純 CSS 的信封：封蠟淡出、封口 `rotateX` 掀開、信紙推出來。

**信件內容是公開可讀的**，這是刻意的取捨：比對必須在前端做，
Firestore 的讀取請求不帶條件，規則無法「只讓對得上的人讀到那一封」。
規格上這裡是「寫給某人的祝福」，不是祕密；
真正不能被看到的內容走 `letters`（第 12 節）。

**與桌次頁的串接**：賓客查到桌次時，同一張結果卡會附上「有一封信在等你」的入口，
連結帶 `?name=`，信件頁收到就直接開信。
比對邏輯放在 `common.js` 的 `findBlessing()`，兩頁共用同一份，
判斷才不會一邊說有信、另一邊卻打不開。
`letter` 頁沒開的站台不顯示入口，也不訂閱 `blessings`。

### 13.3 首頁 Explore 自訂卡片（`explore`）

首頁 Explore 區原本只有模板功能的入口。
新人可以再補上自己的內容，接在內建卡片後面，兩種型態：

| `kind` | 行為 | DOM |
|---|---|---|
| `link` | 另開分頁到 `url` | `<a target="_blank" rel="noopener noreferrer">` |
| `popup` | 原地跳出彈窗顯示 `body` | `<button>` + `.lc-modal` |

`url` 只收 `http(s)://` 開頭，規則層與前端各擋一次，
`javascript:` 之類的協定寫不進資料庫、也不會被渲染成連結。
卡片編號在自訂卡加入後整批重編，不會跳號。

### 13.4 大廳文案（`sites` 文件本身）

大廳上的稱呼、地點、交通、Dress Code、禮金說明、兩人的故事、hashtag
與當日流程，原本要進 Firebase Console 改，現在在後台「大廳內容」分頁就能編。

寫入的是 `sites/{siteId}` 這份文件，不是子集合 ——
所以規則是「限定欄位的 update」而不是整份文件開放（見第 3 節）。
新人姓名、日期、頁面開關**刻意不放進來**：那些會影響網址、倒數計時
與 RSVP 的判斷條件，仍然由我們用 Admin SDK 改。

**留白就不出現**：交通、Dress Code、禮金、兩人的故事沒填的話，
大廳不會出現那一塊（也不會塞我們預想的罐頭文案）。
兩格的區塊（Dress Code／禮金、大眾運輸／停車）只填一格時，那一格會佔滿整列。
唯一有預設值的是 hashtag —— 沒填就用 `#我們結婚了`、`#Married`，
大廳開場才不會空一排。

**大廳上的稱呼**（`coupleTitle`）是資訊卡最上面那行字，留白就用兩人的名字。
限 8 個字：那行字級很大，再長就會在手機上折行、把整張卡的比例壓掉。
後台與規則各擋一次，計數用 `[...str].length`（拆成字元陣列）而不是
`str.length`，emoji 之類的字元才不會被算成兩格 —— 和規則的 `size()` 一致。

**當日流程的捷徑**：資訊卡「時間」那一列底下有一個文字連結，
點了平滑捲到下面的 Schedule 區塊。沒有任何流程時這個連結不出現。

當日流程是一列一個項目的表格，順序就是時間軸的順序（不依時間重排）；
整份存成 `schedule` 陣列，一次覆寫。

### 13.5 婚禮小卡（`cards`）

抽卡頁的卡池。新人上傳自己的照片，設定卡名、等級（SSR／SR／R／N）與說明。

**照片一定會經過裁切器**（`js/cropper.js`）：卡片是直式 2:3，
手上的照片幾乎不會剛好對上，不裁的話不是被塞歪就是人被切掉。
裁切框就是最後存下來的範圍（所見即所得），可以拖曳、滾輪／滑桿／兩指縮放，
確定後輸出 700×1050 的 JPEG data URL。

**為什麼卡圖壓得比桌次圖更小（200000 字元，規則上限仍是 950000）**：
抽卡是隨機抽，沒辦法只載一張 —— 賓客一進抽卡頁就會把整個卡池載下來。
30 張大約 4MB，行動網路還撐得住；照桌次圖的 900KB 上限來存就會變成 27MB。
故事牆同理，上限抓 250000 字元。

卡池的來源優先序：`cards` 集合 → `assets/{slug}/cards/` → 內建範例卡，
**全有或全無**，不會混在一起。

**抽卡收藏為什麼多一個 `cardId`**：`collected.art` 的長度上限是 300 字元
（規則層擋著，避免每抽一張就寫進一份大文件）。
新人上傳的卡圖是整段 data URL，塞不進去，
所以收藏只記 `cardId`，畫面再回 `cards` 取圖。
素材資料夾與內建範例卡沿用原本的 `art`，舊資料不受影響。

### 13.6 新人故事牆（`exhibits`）

戀愛時光那條橫向時間軸的內容，兩種型態：

| `kind` | 畫面 | 欄位 |
|---|---|---|
| `photo` | 一則故事（拍立得卡） | `img`（可留空）、`title`、`year`、`sub`（時間補充）、`act`、`desc` |
| `act` | 章節（分隔段落） | `title`（章節名）、`sub`（副標） |

兩種都用 `order` 排先後，章節的 `order` 要小於它底下的故事。
照片同樣走裁切器，比例可選直式 3:4／方形 1:1／橫式 4:3。
沒有照片的故事也收得下 —— 新人可以先把文字寫完，之後再補圖。

來源優先序與婚禮小卡相同：`exhibits` → `assets/{slug}/exhibition/` → 內建範例。

**預設內容**（`js/exhibit-defaults.js`，賓客頁與後台共用同一份）與測驗題目
同一套做法：新人還沒進後台時是戀愛時光那一頁的退路；新人第一次打開後台
「新人故事牆」分頁時，整份會被寫進 `exhibits` 當起點，之後改文字、換照片、
調順序、刪掉都可以。整份刪光後不會自動補回來（以 `localStorage` 的
`exhibitSeeded` 記著），清單上有手動載入的按鈕。

### 13.7 新人熟悉測驗（`quiz` ＋ `quizVotes`）

「看你多了解我們」原本是寫死在 `quiz.js` 裡的兩份題庫
（主測驗 + 契合度長條圖），只有原作那對新人適用。
現在合併成**一份一頁式測驗**，題目搬進 `quiz` 集合由新人自己出。

| 欄位 | 內容 |
|---|---|
| `type` | `single` 單選（賓客選完自動捲到下一題）／`multi` 複選（全對才得分） |
| `q` | 題目，≤60 字 |
| `opts` | 固定四個選項，每個 ≤40 字 |
| `answer` | 正確答案的索引 list；`single` 只有一個元素 |
| `order` | 題號順序，後台清單左邊的 ⠿ 拖曳後會整批重編成 1…n |

上限 50 題（`quizVotes.picks` 也跟著擋在 50 以內）。
規則語言沒辦法逐一檢查 list 裡每個元素的型別與長度，
所以「選項幾個字、索引是不是 0–3」由後台送出前切好、擋好；
規則負責的是欄位白名單、四個選項、單選只能有一個答案這些結構性條件。

**賓客那一側**：整頁排完所有題目 → 全部作答完才送得出去 →
看到分數與每題的長條圖。長條裡寫的是**選項內容**（選項可能很長，
外面那一欄放不下），一行寫不完就以「…」收尾，不會溢出長條、
也不會壓到「你」的標籤。

**只會出現「你」一種標籤**：新人不必自己作答（正確答案在後台就設好了），
所以不再有原本那個「新人」標籤；正確答案改用長條的顏色與 `✓` 標記。

**作答為什麼用題目 id 當 key**：`picks = { 題目id: [選項索引] }`。
用題號當 key 的話，新人之後調順序或刪題目，舊票就會對到別題去；
綁 id 則是「對不到的題目就不顯示」。
另外 Firestore 的陣列不能再放陣列，複選題的答案也因此必須包在 map 裡
（`picks is map` 是規則層唯一擋得住的形狀）。

**預設題目**（`js/quiz-defaults.js`，賓客頁與後台共用同一份）有兩個身分：
新人還沒進後台時是賓客那一頁的退路；新人第一次打開後台「新人熟悉測驗」分頁時，
這 3 題會被寫進 `quiz` 當起點。整份刪光後不會自動補回來
（以 `localStorage` 的 `quizSeeded` 記著），清單上有手動載入的按鈕。

**舊資料**：原本的 `compat` 集合已經沒有程式在讀，規則也不再放行 ——
那些票對應的是寫死的舊題目，併進新題目沒有意義。
需要清掉的話走 Admin SDK。
