# 婚禮邀請函網站模板 — 規格書

## 0. 專案背景

みなと製作所 Minato Studio（台日跨境設計工作室）的**婚禮邀請函網站模板**，
賣給多組新人使用。每組客人有：

- 自己的網址（slug）
- 自己的內容設定（新人姓名、日期、地點、版型、照片）
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

> **後台的 UI 規範另開一份：[`docs/UI-SPEC.md`](docs/UI-SPEC.md)。**
> 新人後台（`/w/{slug}/admin`）與收禮小幫手（`/butler`）載入同一份
> `common.css` ＋ `admin.css`，用同一組 `.ad-*` 元件 —— token、元件目錄、
> 搜尋框與抽屜的規格、無障礙基準線都寫在那裡，
> 由 `npm run test:ui` 把最容易漂掉的幾項擋下來。

### 寫入的離線行為（每一頁都適用）

Firestore 在離線時的行為很反直覺，而且踩到的人一定會以為是我們的 bug：

> `setDoc()` / `updateDoc()` / `addDoc()` 回傳的 Promise
> **永遠不會 resolve，也不會 reject** —— 它只是靜靜地排進本機佇列，
> 等連線回來才送出去。

對資料是好事（不會掉），對使用者是災難：`try/catch` 抓不到，
成功的 toast 不會出現、失敗的也不會，按鈕停在「儲存中…」，
於是同一筆被記了三遍。所以本專案的規則是：

| 做法 | 位置 |
|---|---|
| 每一筆寫入套 8 秒逾時 | `common.js` 的 `withWriteTimeout()`（butler 另有一份，它不載入 common.js） |
| 逾時的文案是「**還沒送出去**」，不是「存檔失敗」 | 佇列還在，連線回來會自己補送 —— 講成失敗會害使用者再記一次 |
| 逾時／失敗的 toast 附一顆「重試」 | `writeFailed(err, retry)` |
| 開 `persistentLocalCache`（multi-tab） | `site-context.js` 與 `butler.js`；預設的記憶體快取一關掉分頁，排在佇列裡的寫入就沒了 |
| 監聽 `online`/`offline`，斷線時壓一條橫幅 | 後台 `.ad-offline`、收禮台 `#btOffline`。只告知，不擋操作 |

`navigator.onLine` 只看得到「有沒有連上網路介面」，不保證連得到 Firestore；
逾時負責補上剩下的那一半。兩層加起來就夠了。

排桌工作區另外還有一層本機草稿（見 13.8）：
`beforeunload` 在行動裝置上不可靠 —— iOS Safari 回收背景分頁時根本不會發，
所以真正會走到的那條路是 `visibilitychange`。

---

## 2. 資料模型（Firestore）

```
sites/{siteId}
  slug            : string   # 網址代稱，全域唯一，如 "chen-lin-0315"
  ownerEmail      : string   # 新人聯絡信箱
  status          : string   # "draft" | "published" | "archived"
  groomName       : string
  brideName       : string
  coupleTitle     : string   # 選填，大廳資訊卡上的稱呼（≤20 字）；留白就用兩人的名字
  eventDate       : timestamp
  eventEndDate    : timestamp | null   # 婚宴結束時間，加入行事曆用；null 則抓開始後 3 小時
  timezone        : string   # IANA 時區，如 "Asia/Taipei"（見下方說明）
  venueName       : string
  venueAddress    : string
  venueMapUrl     : string
  template        : string   # 版型，決定整站的視覺（見下方「版型」一節）
                             # 沒有這個欄位＝ classic
  themeColor      : string   # 舊欄位，前端已不再讀（留著不影響既有站台）
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
  entryLoginEnabled    : boolean  # 大廳入場登入的總開關，沒有這個欄位視為 true；
                                  # false 時大廳不出現入場畫面（#gate），賓客不必
                                  # 報上名來就看得到內容；需要名字的動作（寫祝福、
                                  # 悄悄話、送甜點）改成送出的那一刻才問。
                                  # 和 pages 一樣不在規則白名單內，新人改不動
  seatingSearchEnabled : boolean  # 桌次頁的搜尋開關，沒有這個欄位視為 true；
                                  # false 時賓客只看得到已上傳的桌次圖
  seatingFeatureEnabled: boolean  # 桌次功能的總開關，沒有這個欄位視為 true；
                                  # false 時大廳不出現「尋找我的座位」、導覽列
                                  # 也沒有桌次，直接打網址會被導回大廳。
                                  # 後台不受影響（看的是 pages），名單照樣先整理
  # ↓ 出席回覆那一頁的題目與區塊開關，由新人在後台設定。
  #   沒有這些欄位一律視為 true（舊站台不會突然少東西）
  rsvpAskCard     : boolean  # 要不要問「喜帖發送方式」
  rsvpAskGift     : boolean  # 要不要問「喜餅領取方式」
  rsvpAskMessage  : boolean  # 要不要問「想對新人說的話」
  rsvpContactMethods : string[]  # 要問哪幾種聯絡方式，'phone'|'line'|'email'
                                  # 沒有這個欄位＝三種都問；空陣列＝整題不問
  rsvpShowStory   : boolean  # 那一頁要不要放「兩人的故事」
  rsvpShowGallery : boolean  # 那一頁要不要放「照片集」
  # ↓ 賓客標籤（配合排桌次用）。總開關新人改不動，和 pages 一樣由我們設定
  guestTagsEnabled: boolean  # 這個站台要不要用標籤；沒有這個欄位＝關
  guestTags       : map[]    # 標籤庫，陣列順序即顯示順序（見下方說明）
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

  # 收禮小幫手的連結簿（只有新人讀得到；收禮簿本身在最上層的 butlers）
  butlerLinks/{autoId}
    bookId   : string   # 收禮簿在 butlers 底下的文件 id（token ＋ 通行碼推導出來的）
    token    : string   # 網址 /butler#{token} 上的那一段
    passcode : string   # 六位數通行碼
    label    : string   # 這組連結的名稱，如「收禮台」
    revoked  : bool
    createdAt: number

  # 排桌管理的草稿（只有新人讀得到，賓客看不到）
  seatingPlan/draft
    tables   : map[]     # 桌位，≤60；{ id, no(1–99), name(≤20), cap(1–30),
                         #             type, typeName(≤10), order }
    guests   : map[]     # 賓客的排桌欄位，≤600；{ id, src('rsvp'|'manual'),
                         #   code(≤12), cat(≤20), name(≤40), count(0–30),
                         #   tags(list), rsvp, note(≤200), gift(0–99), got(bool) }
                         # src='rsvp' 時只存「被改過」的欄位，其餘看 rsvps
    assign   : map       # 賓客 id → 桌位 id，≤600（＝ Seating Assignment）
    savedAt  : number    # 上次按「儲存排桌」的時間
    syncedAt : number    # 上次同步到 seating 的時間；和 savedAt 比就是同步狀態

butlers/{bookId}            # 收禮小幫手的收禮簿（見第 13.9 節）
  # 文件 id ＝ PBKDF2(通行碼, salt='butler:'+token)，所以「算得出位置」＝「通行碼對了」
  siteId, slug, couple, label
  guests          : map[]   # 從後台匯過去的賓客名單快照，≤600
                            # { id, code, name, table, count, cat, note }
  revoked         : bool    # 新人按「停用」
  importedAt      : number
  importedFrom    : string  # 'plan'（排桌名單）| 'rsvp'（出席回覆）
  createdAt, updatedAt : number

  entries/{autoId}          # 現場記下的每一筆收禮
    guestId  : string  # 對得回 guests 的 id；'' 代表名單外的賓客
    name, code, table
    amount   : int     # 禮金，0–9,999,999
    gift     : bool    # 禮餅發了沒
    boxes    : int     # 幾盒，0–99
    people   : int     # 共幾人，0–99
    note     : string  # ≤200
    by       : string  # 記錄者（小幫手自己填的名字，不是身分驗證）
    createdAt, updatedAt : number

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
| `sites/{siteId}/rsvpTags/{rsvpId}` | 新人 | 新人 | 新人 | 新人 |
| `sites/{siteId}/seating/{id}` | 允許 | 新人 | 新人 | 新人 |
| `sites/{siteId}/seatingImages/{id}` | 允許 | 新人 | 新人 | 新人 |
| `sites/{siteId}/blessings/{id}` | 允許 | 新人 | 新人 | 新人 |
| `sites/{siteId}/explore/{id}` | 允許 | 新人 | 新人 | 新人 |
| `sites/{siteId}/cards/{id}` | 允許 | 新人 | 新人 | 新人 |
| `sites/{siteId}/exhibits/{id}` | 允許 | 新人 | 新人 | 新人 |
| `sites/{siteId}/quiz/{id}` | 允許 | 新人 | 新人 | 新人 |
| `sites/{siteId}/quizVotes/{id}` | 允許 | 允許（需通過驗證） | 拒絕 | 新人（重置票數） |
| `sites/{siteId}/seatingPlan/{id}` | 新人 | 新人 | 新人 | 新人 |
| `sites/{siteId}/butlerLinks/{id}` | 新人 | 新人 | 新人 | 新人 |
| `butlers/{bookId}` | 允許（get；**list 拒絕**） | 新人 | 新人 | 新人 |
| `butlers/{bookId}/entries/{id}` | 允許 | 小幫手 | 小幫手 | 小幫手／新人 |
| `slugs/{slug}` | 允許 | 拒絕 | 拒絕 | 拒絕 |
| `short/{code}` | 允許 | 拒絕 | 拒絕 | 拒絕 |

「新人」＝ `isSiteOwner(siteId)`：已驗證的 Google 信箱在 `sites.ownerEmails` 名單內。

讀寫權限分成兩種型態，界線就是「這份資料賓客需不需要看到」：

| 型態 | 集合 | read | write |
|---|---|---|---|
| 賓客要用的內容 | `seating` `seatingImages` `blessings` `explore` `cards` `exhibits` `quiz` | 公開 | 新人 |
| 賓客交上來的資料 | `rsvps` `letters` | 新人 | 賓客（create only） |
| 新人自己的整理 | `rsvpTags` `seatingPlan` `butlerLinks` | 新人 | 新人 |
| 收禮台的工作紀錄 | `butlers/{bookId}` | 靠不可猜的路徑（見 13.9） | 小幫手 |
| 賓客的公開投票 | `wishes` `cakes` `quizVotes` | 公開 | 賓客（create only） |

上面那組 **read 必須公開**，因為比對（桌次查名字、祝福信對暗號）在瀏覽器端做——
Firestore 的讀取請求不帶條件，規則沒有辦法「只讓對得上的人讀到那一筆」。
不能被別人看到的內容請放下面那組，它們的 read 綁在 Auth 簽發的身分上。

### 站台文件的 update：只放行文案欄位

`sites/{siteId}` 的 `update` 從全面禁止改成「新人可以改文案」，
但只認白名單裡的欄位：

```
coupleTitle venueName venueAddress venueMapUrl transportPublic transportParking
dressCode giftNote story schedule hashtags updatedAt
seatingSearchEnabled seatingFeatureEnabled
rsvpAskCard rsvpAskGift rsvpAskMessage rsvpContactMethods
rsvpShowStory rsvpShowGallery guestTags
```

`guestTags` 是新人自己維護的標籤庫，所以在名單內；
但**總開關 `guestTagsEnabled` 不在名單內** —— 和 `pages` 一樣，
由我們決定哪一組新人要用這個功能（`npm run set-pages -- --guest-tags on`）。

**`entryLoginEnabled` 也不在名單內**，理由同上：它改變的是整站的入場方式
（要不要請賓客先報上名來），由我們決定（`npm run set-pages -- --entry-login off`）。

最後那六個 `rsvp*` 與 `seatingSearchEnabled` 一樣，是「非文案但可以放行」的欄位：
它們只改變賓客看到的表單長什麼樣，規則本身不拿它們做任何判斷 ——
能不能寫回覆仍然只看 `rsvpEnabled` 與 `rsvpDeadline`，那兩個依舊改不動。

兩個 `seating*` 開關放行的理由一樣：它們只改變賓客看到的畫面
（`seatingSearchEnabled`＝那一頁要不要出現搜尋欄，`seatingFeatureEnabled`＝
整個桌次功能要不要對賓客開放），規則本身不拿它們做任何判斷 ——
桌次名單的讀寫權限和有沒有這兩個開關無關，`pageOn()` 也只看 `pages`。

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

**仍然不開放 `update`**：回覆是賓客送出的紀錄，
新人可以看、可以匯出，但不該在後台改掉別人寫的內容。

**`delete` 只開給新人本人**，而且只為了一件事：同一個人重複送出好幾份。
「改不動」和「刪得掉」不衝突 —— 留下來的每一筆都還是賓客當初寫的原文，
後台能做的只有整筆拿掉，不能動裡面任何一個字。
後台會連過兩關（看清楚是哪一筆 → 打字輸入「刪除」）才真的送出，
而且刪之前會先把排桌的自動編號釘住（見 13.8）。

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

`/butler` **不需要任何 rewrite**：`cleanUrls: true` 會把它對到 `public/butler.html`，
而且靜態檔案本來就優先於 rewrite。這也正好說明它的定位 ——
它不是站台的一頁，是一個和 slug 無關的獨立工具（見第 13.9 節），
`site-context.js` 完全不參與。

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
│   ├─ butler.html          # 收禮小幫手（獨立網址 /butler，不吃 site-context）
│   ├─ shortlink.html
│   ├─ 404.html
│   └─ assets/
├─ scripts/
│   ├─ create-site.js
│   ├─ export-rsvps.js
│   └─ create-short-link.js
└─ tests/
    ├─ rules.test.mjs
    ├─ e2e.mjs
    └─ butler.mjs
```

`public/` 底下另有既有的 Ethan & Momo 單場客製婚禮站，與本模板獨立並存。

`public/js/cropper.js` 是後台專用的照片裁切器，只有 `admin.html` 會載入它。

`public/js/butler-key.js` 是收禮簿位置的推導，`butler.html` 與 `admin.html`
都會載入它 —— 兩邊要算出同一個位置，那份推導只能有一份（見第 13.9 節）。

---

## 8. 邀請函頁面的視覺要求

**與其他頁面共用同一套設計**，不再自成一格：

- `css/common.css` ＋ `css/rsvp.css` ＋ 只放這頁獨有元件的 `css/invitation.css`
- 版型骨架沿用子場景頁：`.scene-hero`（50vh 標題區）→ `.scene-body`
  → `.section-title` ＋ `.cardbox`
- 字體 `Noto Serif TC` 單一字族、1px 線條、**無陰影**、大量留白
- 視覺走站台設定的版型（`sites.template`），和其他頁同一套；
  頂部導覽列與 BGM 控制也和其他頁一樣
- 全站 RWD，手機優先
- RSVP 表單送出後不跳頁，以 async 寫入 Firestore 並顯示成功狀態
- 表單有 honeypot 隱藏欄位擋機器人（觸發時畫面照樣顯示成功，但不寫入）

> **`themeColor` 不再套用在這一頁**：多頁面站台的其他頁面本來就只吃
> 版型色票，邀請函要「跟其他頁一樣」就得放掉每站一個主色的做法。
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
| ★ 更具體是哪一種？ | 單選、選填；選項＝新人開放的賓客標籤 | 開了標籤功能、而且至少有一個標籤設成「當表單選項」時 |
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

### 賓客標籤（配合排桌次）

給新人自己把賓客分群用的：VIP、長輩、小孩、行動不便、大學同學、公司同事…
新人可以自己新增自訂標籤，**一位賓客可以有好幾個標籤**。

分成兩層開關，理由不同：

| 開關 | 存在哪 | 誰能改 | 為什麼 |
|---|---|---|---|
| `guestTagsEnabled` | 站台文件 | 只有我們（Admin SDK／Console） | 這是配合排桌次的進階功能，操作有複雜度，和 `pages` 一樣由我們決定哪一組新人要用 |
| `guestTags[].onForm` | 站台文件的標籤庫 | 新人 | 不是每個標籤都適合讓賓客自己選（VIP、行動不便通常是新人自己判斷的） |

打開／關掉：`npm run set-pages -- --slug {slug} --guest-tags on`（或 `off`）。

標籤資料分成兩份，因為**回覆本身仍然不可修改**：

| 資料 | 存在哪 | 誰寫的 |
|---|---|---|
| 賓客自己選的那一個 | `rsvps/{id}.tag`（單選、選填） | 賓客，送出後就改不動 |
| 新人掛上去的那些 | `rsvpTags/{回覆 id}.tags`（陣列） | 新人，後台隨時可改 |

畫面上兩者合起來看（後台名單的標籤、篩選、匯出的 CSV 都是聯集）。
標籤存的是 **id 不是名字**，新人改名時已經掛好的分類不會跟著跑掉；
刪掉標籤時後台會順手把掛在賓客身上的那一份也清掉。

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
| 8 | 兩個不同 slug 的頁面，內容與版型正確互不干擾 | `tests/e2e.mjs` |
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

## 9.5 版型（`sites.template`）

一份婚禮資料，多套視覺。同一組新人的內容、連結、頁面開關、後台設定
完全不動，換的只有整站長什麼樣子。

| 值 | 名稱 | 說明 |
|---|---|---|
| `classic`（預設） | Classic 香檳金 | 婚紗照鋪滿視窗當背景、上面壓白紗，內容是白卡浮在照片前 |
| `classic-blush` | Classic 霧玫瑰 | 同上，換配色 |
| `classic-sage` | Classic 鼠尾草綠 | 同上，換配色 |
| `classic-dusk` | Classic 霧霾藍 | 同上，換配色 |
| `korean` | Korean Modern | 暖米白底、近黑的墨、霧藍作重音；英文標題走 Cormorant Garamond |
| `forest` | Forest Botanical | 米色紙底、深林綠的墨、鼠尾草與樹皮作重音；同一組字體 |

**怎麼切換**

```
Firebase Console → Firestore → sites/{siteId} → template 欄位 → 填上面的值
```

子頁（桌次、祝福牆、測驗…）重新整理就生效 —— 它們共用同一套結構，
換的只有色票與字體。**大廳比較特別**：`korean`／`forest` 有自己的
版面結構（`lobby-korean.html`／`lobby-forest.html`，照片被設計進版面／
照片就是整個畫面），要再跑一次

```
npm run build-og -- --slug {slug}
npx firebase deploy --only hosting
```

build-og 會依 `template` 挑大廳的來源檔，產出 `public/w/{slug}/index.html`
（靜態檔優先於 rewrite，所以會命中它）。沒跑 build-og 的站台落回
`index.html` —— Classic 的版面配上該版型的色票，不會壞，只是沒有專屬結構。

- **開站一律是 `classic`**：`scripts/create-site.js` 預設寫 `classic`，
  沒有這個欄位、值不認得、或是拼錯了，`site-context.js` 都會落回 `classic`，
  不會出現沒有樣式的白畫面。
- **新人改不動**：`template` 不在 `firestore.rules` 的可更新白名單裡，
  和 `pages`、`entryLoginEnabled` 同一個層級 —— 由我們設定。
- **賓客也沒有切換的入口**：右下角原本那顆「換主題色」已經移除。
  版型是我們幫這組新人挑好的樣子，不是賓客的偏好。

**實作**

| 東西 | 位置 |
|---|---|
| 版型清單、字檔與大廳版面（lobbyFile） | `js/site-context.js` 的 `TEMPLATES` |
| korean／forest 的大廳版面 | `lobby-korean.html`＋`css/lobby-korean.css`／`lobby-forest.html`＋`css/lobby-forest.css` |
| 大廳來源檔的分流 | `scripts/build-og.js` 的 `LOBBY_SRC` |
| 套用（寫 `<body data-template>`、注入字檔） | `js/site-context.js` 的 `applyTemplate()` |
| 色票 | `css/common.css` 的 `body[data-template="…"]` |
| 字體 | 同上，`korean`／`forest` 覆寫 `--font-*` |
| 對照台（六頁 × 三版型，載入真 CSS） | `preview/pages.html` |

HTML 上寫死 `<body data-template="classic">`，所以在 Firestore 讀回來之前
畫面是 Classic 而不是沒有樣式；換到別的版型時會有一次短暫的換色。
要連那一下都省掉的話，得讓 `build-og.js` 產出每個站台的 HTML 時就把
`data-template` 印進去 —— 那是另一件事，還沒做。

**字體**

`korean` 與 `forest` 的英文標題是 Cormorant Garamond，中文自動落回
Noto Serif TC —— 不必為了中英混排改任何一行 HTML，瀏覽器的字族 fallback
本來就是逐字處理的：「Find Your Seat」是 Cormorant，「輸入名字」是明朝體。
內文與 UI 改用 Noto Sans TC。字檔由 `applyTemplate()` 依版型注入，
Classic 的站台不會多載這一份。

**字級下限（只掛在這兩個版型）**

手機上也要讀得動：資訊性的字最小 12px，主要內文至少 14px；
純裝飾（SCROLL 提示、英文 ribbon、卡片編號、To／From）不在此列。
規則收在 `common.css` 的 `body:is([data-template="korean"],…)` 區塊，
Classic 一個像素都不動。

**版型的素材（怎麼換背景與元素）**

素材照舊放 `public/assets/{slug}/`，跑 `npm run sync-assets` 再 deploy。
兩個版型各多認得幾個檔名：

| 檔名 | 用在哪 | 沒放的話 |
|---|---|---|
| `lobby.jpg`／`lobby.mp4` | 首頁固定背景（既有機制） | 純色底 |
| `cover.jpg` | 各頁背景與邀請函封面（既有機制） | 純色底 |
| `paper.jpg` | `korean` 整頁的紙質紋理（可平鋪、淡色） | 沒有紋理 |
| `deco.png`／`deco.svg` | 兩版的植物線稿（透明底） | 用程式畫的預設線稿 |

- `forest` 的首頁背景照會疊一層**很淡的森林綠**（`.site-bg::after`），
  換照片不用管 overlay，紗是版型自己蓋的。
- 預設的植物線稿（korean 一小枝、forest 一支蕨葉）有**生長動畫**：
  莖先畫、葉子一片一片跟上，捲到看得見才開始；
  `prefers-reduced-motion` 時直接顯示完成的線稿。
  換成自己的 `deco.png` 時不播動畫（點陣圖畫不了筆劃）。

---

## 10. 多頁面與頁面開關

每組新人共用同一套 HTML／CSS／JS，差異全部來自 `sites/{siteId}` 的資料。

| 代號 | 網址 | 頁面 | 可關閉 |
|---|---|---|---|
| `lobby` | `/w/{slug}/` | 大廳（入場 gate + 場景導覽；gate 可另外關掉） | ❌ |
| `rsvp` | `/w/{slug}/invitation` | 出席回覆（婚禮資訊＋表單同一頁） | ✅ |
| `wall` | `/w/{slug}/wall` | 祝福牆 | ✅ |
| `cake` | `/w/{slug}/cake` | 甜點桌 | ✅ |
| `draw` | `/w/{slug}/draw` | 囍卡抽卡 | ✅ |
| `exhibition` | `/w/{slug}/exhibition` | 戀愛時光 | ✅ |
| `quiz` | `/w/{slug}/quiz` | 新人小測驗 | ✅ |
| `seating` | `/w/{slug}/seating` | 我的桌次 | ✅ |
| `letter` | `/w/{slug}/letter` | 給你的信（電子祝福信） | ✅ |
| `admin` | `/w/{slug}/admin` | 新人後台 | ❌ |

`pages` 裡還有一個**沒有網址**的開關，只決定新人後台要不要長出那個分頁：

| 代號 | 位置 | 功能 | 預設 |
|---|---|---|---|
| `seatingPlan` | 後台「排桌管理」分頁 | 把賓客排進桌位（見第 13.8 節） | ⛔ 關 |
| `butler` | 後台「收禮小幫手」分頁 ＋ 獨立網址 `/butler` | 婚宴當天收禮金、發禮餅（見第 13.9 節） | ⛔ 關 |

`butler` 是這一組裡唯一有自己網址的：工具本身在 `/butler#{token}`，
但那個網址不在 `/w/{slug}/` 底下、也不吃 `site-context.js` ——
對 `pages` 來說它一樣只是「後台要不要長出那個分頁」＋
「規則放不放行收禮紀錄的寫入」兩件事。

它和頁面共用同一個 map，所以 `set-pages.js` 的 `--enable seatingPlan`
就打得開；但它不是一頁，不會出現在導覽列，`isEnabled('seatingPlan')`
永遠是 false（見 `site-context.js` 的 `ADMIN_FEATURES`）。

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

### 入場登入的開關（`entryLoginEnabled`）

只用大廳與桌次查詢的站台，賓客沒有一件事需要名字，
先擋一道「輸入名字」只是把人擋在門外，所以整道門可以關掉
（站台文件的 `entryLoginEnabled: false`，沒有這個欄位＝開著）。

| | 開著（預設） | 關掉 |
|---|---|---|
| 大廳 | gate → 開場 → 首頁 | gate 從 DOM 移除，一進來就播開場 |
| 開場重播 | 報到過就不再播（localStorage 有名字） | 同一個分頁只播一次（sessionStorage 的 `introSeen`） |
| BGM | 按下「進場觀禮」時啟動 | 不自動播（沒有使用者手勢，瀏覽器本來就會擋），由浮動按鈕開 |
| 導覽列的 User | 報到後出現 | 留下名字之前不出現 |
| `requireUser()` | 沒報到就導回大廳 | 直接放行 —— 沒有 gate 可以報到，彈回去等於死路 |
| 寫祝福／悄悄話／送甜點 | 用報到時的名字 | `ensureUser()` 在送出那一刻用小視窗補問，填過一次就記住 |

實作分三處：`site-context.js` 攤成 `WED.entryLogin`、`common.js` 的
`entryLoginOn()／requireUser()／ensureUser()／askName()`、`index.js` 的
`setupGate()／skipGate()`。

`#gate` 在 `index.css` 裡預設 `display:none`，由 `index.js` 決定要不要顯示 ——
站台設定是非同步讀來的，先畫再藏會閃一下登入畫面（關掉入場登入、
或已經報到過的賓客最明顯）。

### 開場（字幕 + 開幕簾 + 跳過）

進場之後播的那段動畫，`index.js`：

| | |
|---|---|
| 字幕 | `INTRO_LINES` 兩句，`INTRO_BEAT_MS` 一句一秒 —— 本來是 5、4、3、2、1 的數字倒數，賓客在意的不是還剩幾秒，所以把那兩秒拿來說要說的事 |
| 開幕簾 | `CURTAIN_MS` 1.5 秒，拉開後灑金箔（`goldFall()`） |
| 跳過 | `#introSkip`，字幕與簾幕期間都點得到（簾幕本身 `pointer-events:none`），點了直接進大廳、不灑金箔 |
| 收尾 | 所有 `setTimeout` 收在 `introTimers`，`endIntro()` 一次清掉 —— 跳過之後不會有殘留的計時器把收起來的畫面又叫出來 |

> 這道門從來不是權限 —— 誰讀得到、寫得進什麼，一律由 Security Rules 決定。

---

## 11. 站台素材

每組新人的圖片放在 `public/assets/{slug}/`，資料夾名稱就是 slug。
`scripts/sync-assets.js` 掃描後產生 `manifest.json`，網頁載入時自動套用。

| 位置 | 用途 |
|---|---|
| `cover.*` | 封面大圖（單頁邀請函） |
| `share.*` | 社群分享縮圖的來源（選填；沒放就用 `cover`） |
| `og.jpg` | ⚙️ 由 `build-og.js` 合成的社群縮圖，不是新人放的素材 |
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

### 11.1 社群分享縮圖

分享到 LINE／FB 時，對方的爬蟲**不執行 JS**，
所以 `site-context.js` 在瀏覽器端填的新人資料，`og:` 標籤一個都讀不到；
而 `/w/{slug}/...` 又全部 rewrite 到同一份 HTML，
等於所有站台共用同一組標籤 —— 沒有 `og:image` 時就退回 `favicon.png`。

`scripts/build-og.js` 在建置時把 HTML 實際產出來，繞開這個限制：

| 產物 | 對應網址 |
|---|---|
| `public/assets/{slug}/og.jpg` | 合成的縮圖：照片 → 漸層遮罩 → 圓形 logo → 姓名／日期 |
| `public/og-default.jpg` | 沒放照片的站台共用（品牌底色 ＋ 置中 logo） |
| `public/w/{slug}/index.html` | `/w/{slug}/` |
| `public/w/{slug}/invitation.html` | `/w/{slug}/invitation` |
| `public/s/{code}.html` | `/s/{code}` |

**能成立的關鍵是 Hosting 的靜態檔優先權高於 rewrite。**
有實體檔就命中它，沒產過的站台自動落回 `/w/**` 的共用 HTML，
所以這是漸進的，不會動到既有站台。

- 站台清單＝素材資料夾 ∪ Firestore 的 `slugs`；只掃資料夾會漏掉沒放照片的站台
- 縮圖來源：`share.*` → `cover.*` → 都沒有就用 `og-default.jpg`
- 大廳永遠產（`pages` 開關不管它）；邀請函跟著 `pages.rsvp` 走
- 姓名與日期讀 Firestore；讀不到只是不壓字，不會失敗
- `og:image` 帶內容雜湊當版本號，換照片時繞開 LINE／FB 的縮圖快取
- 只產大廳與邀請函兩頁：其他頁沒有分享情境
- 與 `sync-assets` 相同的取捨 —— 建置期算好，執行期不需要 Cloud Functions

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
| 桌次 | `seating`（只看 `pages`：新人自己把「開放桌次功能」關起來時，後台照樣進得去） |
| 感謝信 | `letter` |
| 首頁卡片 | 永遠都在（Explore 區屬於大廳） |
| 婚禮小卡 | `draw` |
| 新人故事牆 | `exhibition` |
| 新人熟悉測驗 | `quiz` |
| 收禮小幫手 | `butler`（工具本身在 `/butler`，這個分頁只管連結、名單與統計） |

預設開著的那一頁（出席回覆）剛好被關掉時，會自動改開第一個還在的分頁。

**一個分頁裝好幾件事的，用橫向子分頁分開**（`admin.js` 的 `SUBTABS`），
網址是 `#分頁/子分頁`，重新整理或分享連結都回得到原本那一頁：

| 分頁 | 子分頁 |
|---|---|
| 出席回覆 | 出席回覆總覽／回覆資訊／表單設定／設定賓客標籤 |
| 婚禮資訊 | 婚禮資訊／當日流程／自訂內容 |
| 桌次 | 桌次圖／桌次搜尋及名單 |
| 排桌管理 | 排桌工作區／桌位管理／匯入匯出 |
| 收禮小幫手 | 收禮統計／收禮明細／連結與名單 |

子分頁也可以被開關收起來（目前只有「設定賓客標籤」）：沒開 `guestTagsEnabled`
的站台連那顆子分頁鈕都不會出現，`#rsvp/tags` 這個網址會退回第一個看得到的子分頁。
| 新人熟悉測驗 | 測驗題目／作答記錄 |

**筆數多、欄位也多的清單畫成表格**（目前只有回覆名單）：一列一筆、一欄一件事，
同一欄從上到下對得起來才比得出差異。欄位一定會超過螢幕寬度，
所以捲動的是表格自己的框（`.ad-tablewrap`）而不是整頁，表頭 `position:sticky`
留在上面。關掉的題目**整欄不出現** —— 一整欄的「—」沒有任何資訊。
其餘清單維持一筆一張卡（`.ad-item`）：欄位少，卡片讀起來比表格快。

**新增與編輯一律開彈窗**（桌次名單、感謝信、故事牆、測驗題目、自訂內容）：
清單是這些分頁的主畫面，表單只在要動它的時候才出現。
彈窗裡叫得出裁切器（故事牆的照片），所以裁切器的 z-index 壓在所有彈窗之上。

#### 13.0 後台在手機與平板上

後台不是「桌機工具的縮小版」：新人真正在用它的時間，多半是通勤、
睡前躺著、婚宴當天站在會場裡。所以下面這幾條是硬規則，不是加分項。

**能力用 `hover` / `pointer` 判斷，不要用寬度猜。**
iPad 橫向有 1194px 的寬度，但它是觸控裝置。所有 `cursor:grab`、
`:hover` 樣式、拖曳提示、tooltip 一律包在
`@media (hover:hover) and (pointer:fine)` 裡；觸控的替代路徑包在
`@media (hover:none)`。寬度斷點只拿來決定**版面**（幾欄、抽屜還是常駐側欄）。

**所有可輸入元件在 `pointer:coarse` 一律 16px。**
iOS Safari 只要聚焦字級 <16px 的欄位就會把整頁放大，放大之後版面往右偏、
使用者得自己雙指縮回來 —— 排桌工作區的搜尋框每打一個字就發生一次。
viewport 刻意**不鎖** `maximum-scale`（要放大是使用者的權利），
但補了 `interactive-widget=resizes-content`，鍵盤升起時 Android Chrome
才會把 layout viewport 縮起來，彈窗底部的「儲存」不會被鍵盤蓋住。
彈窗的高度一律用 `dvh` 不用 `vh`／`svh` —— 只有 `dvh` 會跟著鍵盤縮。

**觸控目標 44px，而且危險的動作不要和常用的並排。**
`.ad-edit` / `.ad-del` 視覺上仍然是無框的文字按鈕，靠 padding 把熱區撐到 44px。
「刪除」在觸控裝置改走每一列的 `⋮`（`.ad-rowmenu`），排在最後、用危險色；
桌機保留看得見的那一顆（`.ad-del-inline`），兩顆指到的是同一段程式。

**每一個可排序的清單都要有 `⋮ → 上移／下移／移到最前／移到最後`。**
HTML5 Drag & Drop 在觸控裝置完全不會觸發，Pointer Events 版的拖曳
在 50 題的清單上也不可能把第 40 題拖到第 1 位。拖曳留給桌機，
觸控主打選單；排序完成的 toast 附一顆「復原」。

**筆數多、欄位也多的清單，手機換成卡片。**
回覆名單（16 欄）與收禮明細（10 欄）在 390px 的手機上實寬超過 1300px，
要左右滑三四個螢幕才看得到最常看的那幾欄。所以由 JS 依
`matchMedia('(max-width: 899px)')` 決定畫表格還是卡片，轉向時重畫。
桌機的表格把**姓名放第一欄並且 `position:sticky; left:0`**，橫滑之後
還知道現在讀的是誰。

**「看數字的地方」只有一種樣子。**
後台會列數字的區塊有四種：大數字（`.ad-hero-stat`）、環狀圖（`.ad-donuts`）、
統計方格（`.ad-stats`）、表格（`.ad-tablewrap`）。四種一律是
**白底 ＋ 1px 外框 ＋ 圓角**的同一種面；格與格之間用 `gap:1px` 讓容器的底色
透出來當分隔線（比在每一格畫 `border` 可靠：格數是奇數、換行、`auto-fit`
掉欄的時候都不會少畫或多畫一條）。環狀圖數量是奇數時，最後一張
`grid-column:1 / -1` 佔滿整列，右下角才不會空半格把圓角框咬出一個缺口。
編輯用的清單（`.ad-list`、`.ad-item`）維持只有分隔線的樣子 ——
它們不是要比對的數字，多一層框只是噪音。

**最常按的那一顆永遠在畫面上。**
排桌工作區在手機是固定底列（`.sp-mobilebar`：未安排 N 位 ＋ 儲存排桌 ＋ ⋮），
長表單（婚禮資訊、當日流程、表單設定）是 `.ad-savebar` 的 sticky 底列，
表單彈窗的按鈕列 `position:sticky` 貼在卡片底部。
有 sticky 底列時 `body[data-stickybar="1"]` 會把 toast 與整頁的底部留白讓開。

> `.ad-savebar` 的底色**不能用漸層淡出**。頁面的底是
> `linear-gradient(170deg,--bg1,--bg2)`，捲到哪裡背後就是哪一段顏色 ——
> 拿固定的 `rgba(251,250,248)` 去淡出，捲到下半頁就會看到一塊比背景亮、
> 上緣還糊掉的長方形。改成一條實心的工具列：上緣 1px 的線交代「這是浮起來的
> 一層」，底色用 `backdrop-filter: blur()` 把背後的內容糊掉，就不會和頁面底色打架。

**彈窗要鎖背景、要吃返回鍵。**
開彈窗時記下 `scrollY` 並把 `body` 設成 `position:fixed`
（iOS 上 `overflow:hidden` 鎖不住），同時 `history.pushState` 推一層；
使用者按返回鍵就關掉最上面那一層，而不是直接離開後台把填到一半的表單丟掉。
實作用 MutationObserver 監看每一個遮罩的 `[hidden]`（`watchLayer`），
不是去改十幾處 `mask.hidden = false` —— 開關彈窗的地方太多，漏掉一處
就會留下一個鎖住的畫面。手機的彈窗是貼底的 bottom sheet，上緣有 drag handle，
從那一條往下滑可以推走。

**捲得動的東西要看得出來捲得動。**
子分頁列與寬表格都把捲軸藏起來了，所以捲得動的那一側用漸層把邊緣淡掉
（`.ad-scrollx.can-left` / `.can-right`，由 JS 掛 class）。
子分頁只有兩三顆時，手機直接排成等寬的 segmented control，就不用捲了。

**載入中不可以長得像「沒有資料」。**
大數字在第一筆 snapshot 回來之前顯示 `—`、副標顯示「讀取中…」、
圖表區塊改用 skeleton。行動網路第一次載入要 1–3 秒，
這段時間顯示一個大大的「0」加「還沒有人回覆」，和真的沒人回覆一模一樣。

### 13.1 我的桌次（`seating`）

婚禮當天的查詢頁，分成兩塊：

| 區塊 | 資料來源 |
|---|---|
| 名字 → 桌次的查詢 | `sites/{siteId}/seating` |
| 桌次圖（多張、可放大拖曳） | `sites/{siteId}/seatingImages` ＋ `assets/{slug}/seating/` |

**整個桌次功能可以先關著**（後台「婚禮資訊」分頁最上面的
「開放桌次功能」checkbox → `seatingFeatureEnabled`）：
關掉時大廳的婚禮資訊卡最下面不出現「尋找我的座位」、導覽列也沒有桌次，
直接打 `/w/{slug}/seating` 會被導回大廳（`site-context.js` 的 `isEnabled()`）。
用途是「還沒到婚禮當天就先別讓賓客找位子」，所以後台不受影響 ——
後台的分頁看的是 `pages`（`isPageOn()`），功能關著時名單與桌次圖照樣先整理好。
沒有這個欄位的舊站台視為開著。

**搜尋可以單獨關掉**（後台的 `seatingSearchEnabled` 開關）：
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

**通用信可以有好幾封**。`findBlessing()` 在沒對到詞彙時，把 `isDefault` 的信
依 id 排序，再用輸入字串的雜湊挑一封：同一個名字每次拿到同一封（重新整理、
從桌次頁點過來都一樣），不同的名字則平均分散。後台清單用 chip 分成
「全部／通用信／指定信」，兩種信不會混在一起看。

**儲存下載**：信紙下面的「儲存下載」把這封信畫成一張 JPG（`drawLetterCanvas()`）。
用 canvas 重畫而不是截 DOM —— 全站不引第三方函式庫，而且信紙版面單純，
自己畫拿得到更好的解析度。斷行規則跟著網頁走：中文可以斷在任何一個字之間，
英數整個單字一起搬。

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

**大廳上的稱呼**（`coupleTitle`）是資訊卡最上面那行字（後台叫「標題」），
留白就用兩人的名字。限 20 個字：那行字級很大，再長就會在手機上折成好幾行、
把整張卡的比例壓掉。
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

**收藏可以放大看、可以存下來**：「你的收藏」裡的小卡只有 62×92，
看不清楚照片 —— 點一下（鍵盤 Enter 也可以）蓋上一張 2:3 的大卡。

卡面上**只有照片**（SSR／SR 多一層會動的彩虹光膜）：等級、卡名、說明
都不畫上去。放大看的重點是照片本身，字疊在上面只會擋到人；
那些資訊在小卡的 `title` 上停留就看得到。

存的是 `drawCardCanvas()` 用 canvas 重畫的 1080px JPG：
照片 cover 進 2:3 的框，底下一行**新人名字・日期**，其餘什麼都不加。
和感謝信的存圖同一套做法（不引第三方函式庫，自己畫解析度反而更好）。

> 卡圖若是**跨網域**的外部網址（新人把 `art` 指到別人的站），
> canvas 會被染色、`toBlob` 丟 `SecurityError`。載入時會先試 CORS、
> 失敗退回一般載入，真的存不了就改叫使用者長按另存 ——
> 不要因為存不了圖就整個功能不出現。
> 後台上傳的卡是 data URL、素材資料夾的卡是同源路徑，兩者都不受影響。

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

### 13.8 排桌管理（後台開關 `pages.seatingPlan`）

新人本來是拿 Excel 排桌的。這一頁的目標**不是把 Excel 搬上網**，
而是讓同一件事做得比 Excel 快、而且不會漏人。所以它不是一張 CRUD 表格。

**三個實體，賓客不寫死在桌子裡**

```
Guest（賓客）── SeatingAssignment（排桌關係）── Table（桌位）
```

換桌只是改一筆 assignment，桌位、賓客都不動；
未來要重排、要同步 RSVP、要讓賓客自己查桌次，靠的都是同一份關係。

**賓客從哪裡來**：既有的出席回覆（`rsvps`）＋ 匯入／手動加的名單。
標籤沿用既有的賓客標籤（`guestTags` ／ `rsvpTags`），**不另外做一套分類**。
回覆本身一個字都不會被改動 —— 排桌時補的欄位（編號、類別、人數覆寫、
喜餅數量、確認收到）存在草稿的 `guests` 裡，`rsvps` 仍然只有賓客送出的內容。

**容量算的是「人」不是「筆數」**：一筆「王小明｜2 位」進到某桌，那一桌就 +2。
`rsvps.guestCount` 是預設值，抽屜裡可以覆寫（例如「視情況而定」的人先算 0）。

| 桌況 | 顯示 |
|---|---|
| 8 / 10 | 剩餘 2 位 |
| 10 / 10 | 已滿 |
| 12 / 10 | **超過容量 2 位**（紅字，但**不擋**） |

婚宴當天本來就會臨時擠人進去，所以系統的立場是
「**允許操作，但明確提醒**」，不是「禁止」。

**編號（A01、B02…）不重複使用**：字首看得出是哪一邊的親友
（A 男方／B 女方／C 雙方／D 其他），號碼照回覆時間發。
編號是拿來對人的 —— 桌卡上寫 B06、跟長輩講「你是 B06」、匯出的 CSV 裡也是 B06，
所以一個號碼一輩子只屬於一個人：

- 刪掉 B05 之後，B06～B08 **不會往前挪**
- 下一筆新回覆拿到 **B09**，不會把 B05 補回去

實作上靠草稿裡的 `guests[].code`：那是「已經定下來」的號碼。
後台要刪一筆回覆之前會先呼叫 `SeatingPlan.freezeCodes()`，
把當下算出來的號碼全部釘進草稿（連要刪的那一筆也釘，它的號碼就此退休），
`autoCodes()` 之後只負責「跳過用掉的號碼、從最大的往後發」。
排桌有未儲存的修改時 freezeCodes 不會偷偷幫忙存整份草稿
（儲存在這一頁是刻意的動作），號碼先釘在記憶體裡，等新人自己按「儲存排桌」。

**桌號**：資料庫存的是數字 `no`（1–99，可排序、不重複），
畫面一律補成兩位數（`01`、`02`…`10`）。桌名選填，沒填就只顯示 `01`，
不會出現「01｜（桌名）」這種空殼。重新排序改的是 `order`，
**不會動到 `id`**，所以已經排好的賓客不會因為調順序就跑掉。

**桌位類型**（主桌／家人桌／親友桌／同學桌／同事桌／VIP／自訂）
講的是「這張桌子的用途」，和賓客標籤（「這位賓客的特徵」）是兩件事，
所以兩者分開存、分開顯示。

**Drag & Drop** 是主要操作：未安排 → 桌位、桌位 A → 桌位 B、
賓客 ↔ 賓客（交換）、桌位 → 未安排、桌位之間重新排序。
拖曳時目標區塊直接寫出「放入第 05 桌」，會爆容量就寫
「⚠️ 此桌將超過容量（12 / 10）」。
**觸控裝置不複製這一套**：每張卡片都有「移動到桌位」，
按下去是一張列出所有桌位（含現在幾人、會不會超過）的清單。

**Undo / Redo**：所有會改到排桌的動作都走同一個 `mutate()`，
它在改之前拍一張整份草稿的快照。所以移動、交換、移除、新增／刪除／修改桌位、
批次排桌全部都復原得回來（上限 60 步）。

**Tag 分組**：排序選「優先按照 Tags 分組」時，未安排區依標籤分群。
一位賓客可能同時有「女方好友＋VIP＋素食」，所以有一個**主要排序 Tag** 的概念：
照「分組順序」由上往下，第一個對到的標籤就是他的組，
**不會重複出現在兩組裡**；原始標籤全部保留，卡片上也照樣顯示。
分組順序存在 `localStorage`（是個人的看法，不是這場婚禮的設定）。

**特殊需求**用標籤名字判斷（包含比對，新人取名叫「全素」「素食者」都認得）：
🥬 素食、♿ 行動不便、👶 兒童、✦ VIP。桌上直接寫「🥬 2 位素食」。

**儲存與同步是兩件事，而且不會自動同步**

```
改動（瀏覽器裡，可以無限復原）
  → 按「儲存排桌」→ 寫進 seatingPlan/draft
  → 問一句「要順便送到賓客的查座位頁嗎？」
  → 新人說「送出去」才寫進 seating
```

理由很直接：新人排桌會反覆調整，
**前台不該因為後台還在整理座位就一直跟著變**。
同步狀態由 `savedAt` 與 `syncedAt` 相比得出：

| 狀態 | 條件 | 顯示 |
|---|---|---|
| 還沒送出 | 沒有 `syncedAt` | 還沒送到賓客的查座位頁 |
| 已送出 | `syncedAt >= savedAt` | 最後送出：2026/08/18 20:30 |
| 有修改還沒送出 | `syncedAt < savedAt` | 排桌改過了，還沒重新送出（按鈕變「再送一次」） |

文案刻意避開「同步」與「桌次查詢系統」——
那是系統視角的詞，新人對得上的是「賓客的查座位頁」。

同步是**整份換掉** `seating`：先清空再批次寫入，
每一筆是 `{ name, table:"01｜主桌", note }`，
所以賓客的「我的桌次」和後台的排桌永遠是同一份資料，不會有兩套真相。

**本機草稿**：`plan`、undo/redo stack 都只活在記憶體裡，
而 iOS Safari 在背景分頁被系統回收時**不會觸發 `beforeunload`** ——
整個下午的排桌就這樣無聲消失，而且完全沒有跡象。
所以每次 `dirty = true` 就 debounce 1.5 秒把 `planPayload()` 寫進
`localStorage`（`LS` 以 siteId 分隔，key 是 `seatPlan.localDraft`），
另外在 `visibilitychange`（切到背景）與 `pagehide` 各寫一次。
下次進來時，草稿的 `savedAt` 比雲端新就問一句「上次有一份還沒存的排桌，
要接續嗎？」；**選「重新開始」也不會刪掉草稿**（只記一個 `declined` 旗標）——
誤點遮罩也會走到那一條，而那份草稿可能是整個下午的工作。
存檔成功才把草稿清掉。

**手機的固定底列**（`.sp-mobilebar`）：`.sp-bar` 不是 sticky，
所以手機上的流程是「捲到最上面看未安排 → 往下捲找桌位 → 點卡片 → 移動 →
再捲回最上面按儲存」，一場 30 桌的婚禮這條路要走幾十遍。
底列只留兩件事：**還剩幾位沒排**（點下去回到未安排區並聚焦搜尋）與
**儲存排桌**；送出、復原、重做與四個統計收進「⋮」。

**觸控的替代路徑**：`bindDnd()` 用的是 HTML5 Drag & Drop，觸控完全不會觸發。
所以賓客卡右側直接放一顆 32px 的「⇄」（`@media (hover:none)` 才出現），
一下就開得了「移動到桌位」，不用先點卡片展開 peek。
空桌上的提示文案也跟著換（「把賓客拖進來」／「點賓客卡右邊的 ⇄，選這一桌」）。

**一桌可以收起來**（`.sp-table-fold`，觸控與 ≤960px 才出現）：手機一次
只看得到一兩桌，排完的桌還一直佔著整個螢幕，找還沒排完的那幾桌要捲很久。
收起來之後留下桌號、桌名、人數／容量、剩餘位子與整桌的標籤 ——
「這桌排完了沒」需要的全部資訊都還在，只是那一疊賓客卡先收著。
收合是**看法不是資料**：不進草稿、不進 `localStorage`，重整就全部打開；
搜尋有命中的桌子會自己展開（不然標了一位「王小明」卻什麼都看不到，
會像搜尋壞掉），關鍵字清掉又收回去。

同一個動作在「桌次 → 桌次搜尋及名單」也按得到（「**同步現在的排桌**」，
`SeatingPlan.syncNow()`）—— 整理名單的當下就不必先切到排桌管理。
那顆按鈕只有開了 `pages.seatingPlan` 的站台才出現；草稿是非同步讀進來的，
所以 `syncNow()` 會先等 `load()` 完成才判斷，沒有任何人被排進桌位時
提示「**尚無排桌資料**」，不會把名單清空。

**從出席表單匯入**：出席回覆是排桌名單的第一個來源，而且是**接進來**、
不是複製一份 —— `allGuests()` 直接讀 `rsvps`，新的回覆一進來名單就多一位，
所以不會有兩份各自過期的名單。「匯入匯出 → 從出席表單匯入」把這件事攤開來看：
現在接進來幾筆／幾人、各種 RSVP 狀態各幾筆、還有幾筆沒排到桌位，並列出前 12 筆。
它同時抓出**和回覆同名的手動賓客**（先匯了 Excel、那個人後來又自己填表單，
同一個人佔兩張卡），一鍵清掉；清除走 `mutate()`，所以「復原」救得回來。

**匯入 / 匯出**：`.xlsx` 與 `.csv` 雙向，給的是手上那份沒填回覆的名單。
匯入分五步（選檔案 → 預覽 → 欄位對應 → 檢查資料 → 確認匯入），
欄位對應會先自動猜一次（「賓客姓名」→「姓名」、「數量」→「人數」）。
檢查不過的那幾筆**不會被匯進來**，並且逐筆講清楚：
「第 12 筆資料：人數不是有效數字」「編號 B01 已經有人用了」
「找不到桌號 09，請先在桌位管理建立」。
匯出有兩種：**賓客明細**（一列一位）與**桌位排桌表**（依桌位分組，
每桌結尾附總人數），Excel 檔一次含這兩張工作表。

**為什麼自己寫 Excel 讀寫器**（`js/xlsx-lite.js`）：第 1 節說不引入前端函式庫。
`.xlsx` 就是一包 ZIP 裡的 XML，讀的時候用瀏覽器內建的
`DecompressionStream('deflate-raw')` ＋ `DOMParser`，
寫的時候一律用 ZIP 的 **stored（不壓縮）**，
這樣連 deflate 都不必實作，產出的檔案 Excel／Numbers／試算表都打得開。

**為什麼整份草稿存成一份文件**（`seatingPlan/draft`）而不是三個子集合：
排桌是「改一堆、看整體、覺得可以了才存」的工作。
一次寫一份文件才存得起完整的一版，也才做得到儲存與同步分成兩段。
代價是單一文件 1MB 的上限，所以桌位上限 60、賓客上限 600，
而且回覆來的賓客只有**被改過的欄位**才會被寫進去（其餘看 `rsvps`）。

**這份草稿賓客讀不到**（規則只開給 `ownerEmails`）：
上面有姓名、備註、飲食與聯絡整理，和 `rsvps`、`rsvpTags` 同一個等級。
賓客看得到的只有同步之後的 `seating`，那一份本來就等同會場門口的座位表。

---

### 13.9 收禮小幫手（後台開關 `pages.butler` ＋ 獨立網址 `/butler`）

婚宴當天在收禮台收禮金、發禮餅用的工具，**四到五位親友同時使用**。

它和前面每一個模組都不一樣：**不是站台的一頁**。
網址是 `/butler#{token}`，不在 `/w/{slug}/` 底下、不吃 `site-context.js`、
不會出現在導覽列，也不需要 slug —— 拿到連結與通行碼就能用。
和後台之間只有兩條線：

| 方向 | 內容 |
|---|---|
| 後台 → butler | 賓客名單（**一份快照**，不是接上去的即時資料） |
| butler → 後台 | 現場記下的每一筆與統計（即時） |

#### 為什麼名單是「匯過去」而不是「接過去」

兩個理由，缺一個這個設計都不成立：

1. **當天要的是「現在這一版」。** 直接讀排桌草稿的話，
   新人在休息室調一下桌次，收禮台的畫面就跟著跳。
2. **權限。** 排桌草稿與 `rsvps` 都是 `ownerEmails` 才讀得到的資料，
   拿著連結的親友本來就不該讀得到整份出席回覆
   （聯絡方式、飲食禁忌、給新人的話都在裡面）。

所以匯入是「複製必要欄位過去」：編號、姓名、桌次、人數、類別、備註。
來源兩種，匯入時選（沒開排桌管理的站台只出現第二種）：
`seatingPlan` 的排桌名單（有編號與桌號，核對最快）／`rsvps` 的出席回覆
（沒有桌號，會盡量拿 `seating` 那份公開名單比對補上）。
說了不來的人不會被匯進去。

#### 通行碼為什麼能算是保護

第 12 節說過：Firestore 的讀取請求不帶 payload，
規則沒有辦法驗證使用者輸入的密碼，**純前端的密碼框只是遮住畫面**。

這裡沒有推翻那個結論，而是換掉問題 —— **讓通行碼算得出資料在哪裡**：

```
bookId = PBKDF2-SHA256(通行碼, salt = 'butler:' + token, 200000 次, 32 bytes)
```

| 手上有什麼 | 結果 |
|---|---|
| 只有連結（token） | 少了通行碼，算不出 bookId |
| 只有通行碼 | 少了 token，同樣算不出來 |
| 兩個都有 | 才走得到 `butlers/{bookId}` |

規則那一側只要做一件對應的事：

```
match /butlers/{bookId} {
  allow get: if true;      // 走得到這個路徑就代表通行碼算對了
  allow list: if false;    // ← 少了這一行，上面那道門整個白做
```

`list` 是這整套設計唯一的單點。能列出 `butlers` 集合的話，
不必知道任何 token 或通行碼就拿得到每一場婚禮的禮金資料。

20 萬次迭代不是為了防 token 被猜到（22 字 × 5 bits ≒ 110 bits，猜不到），
而是為了讓「拿到連結之後再逐一試六位數通行碼」不划算：
每一次嘗試都要先付一次 PBKDF2 的代價，還要打一趟 Firestore。

**保護強度就是「連結與通行碼都不外流」，這是刻意接受的取捨。**
四五位臨時幫忙的親友，要他們各辦一組 Google 帳號、還要新人一個個加進白名單，
在婚禮當天是行不通的。所以真正需要綁身分才讀得到的資料
（`rsvps`、`letters`、`seatingPlan`）一律不放進這條路徑，
這裡只有「收禮台當下需要的那幾欄」。
兩份鑰匙都存在 `sites/{siteId}/butlerLinks`，只有新人讀得到。

#### 資料模型

```
butlers/{bookId}                      # 最上層，不在 sites 底下
  siteId, slug, couple, label
  guests      : map[] ≤600            # 匯過去的名單快照
                                      # { id, code, name, table, count, cat, note }
  revoked     : bool                  # 新人按「停用」
  importedAt  : number
  importedFrom: 'plan' | 'rsvp'
  createdAt, updatedAt : number

  entries/{autoId}                    # 現場記下的每一筆
    guestId  : string   # 對得回 guests 裡的 id；'' 代表名單外的賓客
    name, code, table
    amount   : int 0–9,999,999        # 禮金
    gift     : bool                   # 禮餅發了沒
    boxes    : int 0–99               # 幾盒
    people   : int 0–99               # 共幾人
    note     : string ≤200
    by       : string ≤40             # 記錄者（小幫手自己填的名字，不是身分驗證）
    createdAt, updatedAt : number

sites/{siteId}/butlerLinks/{autoId}   # 連結簿，只有新人讀得到
  bookId, token, passcode, label, revoked, createdAt
```

**為什麼每一筆收禮是自己一份文件**，而不是像 `seatingPlan/draft` 收在一份裡：
排桌是一個人慢慢改、覺得可以了才存；收禮是四五個人**同時**寫。
收在同一份文件裡，兩個人同時儲存就會互相蓋掉。

**為什麼名單是陣列而不是子集合**：名單整份匯入、整份換掉，
一次寫一份文件才是原子的；小幫手那一側也只要一次讀取就拿得到整份。

#### 權限

| 路徑 | get | list | create | update | delete |
|---|---|---|---|---|---|
| `butlers/{bookId}` | 允許 | **拒絕** | 新人 | 新人（`siteId` 改不動） | 新人 |
| `butlers/{bookId}/entries/{id}` | 允許 | 允許 | 小幫手 | 小幫手 | 小幫手／新人 |
| `sites/{siteId}/butlerLinks/{id}` | 新人 | 新人 | 新人 | 新人 | 新人 |

「小幫手」＝ `butlerOpen(bookId)`：收禮簿存在、`revoked != true`、
而且這場婚禮的 `pages.butler` 是開的（和其他頁面同一套 `pageOn()`）。

`entries` 的 `list` 開著沒有問題：要列出它得先走到 `butlers/{bookId}`，
而那個位置本身就是通行碼算出來的。

**現場記錯金額是常態，所以 `update` 與 `delete` 都開給小幫手** ——
能當場改掉比留一筆錯的有用。誰動過哪一筆看 `by` 與 `updatedAt`，不是靠權限擋。
這和 `rsvps`「賓客送出的紀錄一個字都不能改」是相反的取捨，
因為性質不同：`rsvps` 是別人寫給新人看的，`entries` 是自己人的工作紀錄。

`siteId` 不可修改：改得動就等於把別人的收禮簿掛到自己名下。

#### 現場的介面

**和新人後台同一套樣式**：載入 `common.css` ＋ `admin.css`，
用同一組 `.ad-*` 元件（卡片、清單、chip、彈窗、toast、統計數字）。
`css/butler.css` 只補後台沒有、而收禮台真的需要的那幾樣：
頂列的動作（butler 沒有側邊抽屜，窄螢幕不能把它藏起來）、
金額欄（整個工具最重要的一個輸入，字要大到看一眼就知道打對沒）、
加減鈕，以及觸控目標的加大 —— 只加點擊區，不長出新的視覺。

> 一開始這一頁是自成一套的（深色頂列、圓角卡片、底部分頁列），
> 理由是「現場操作性」。但多一套設計語言就是多一份要維護的東西，
> 而且新人在後台看到的收禮明細、和小幫手在現場看到的，本來就該是
> 同一種畫面 —— 所以收斂回同一套。現場需要的大按鈕與大字，
> 靠 `@media(pointer:coarse)` 加點擊區就夠了，不必換一套語彙。

| 分頁 | 內容 |
|---|---|
| 收禮台 | 名單。搜尋名字／編號／桌次，全部／未收／已收三個篩選；已收的那幾列帶著「已收」標記並直接寫著收了多少 |
| 紀錄 | 所有人記過的每一筆，新的在前，可搜尋、可改、可刪 |
| 統計 | 禮金總額、禮餅總盒數、發出禮餅筆數、到場人數、名單未收，以及**誰記了多少** |

記帳表單上有一排常見金額（1200／1600／2000／2200／2600／3600／6000／12000）
點一下就填好 —— 收禮台最花時間的就是打數字。
盒數與人數是加減按鈕，不必叫鍵盤出來。
表單本身是後台那個彈窗（`.ad-modal-card-form`），只多把按鈕列黏在底部：
現場最常做的事就是按「儲存」，捲到哪裡都要按得到。

**離線**：Firestore SDK 會把寫入排進本機佇列，斷線時照樣按得下「儲存」，
恢復連線自己送出去。頂列的連線點只是告知，不擋任何操作。
會場的網路本來就不能指望。

**記錄者的名字存在自己手機**（`localStorage`，key 帶 token），
第一次要儲存時問一次。事後對帳時「誰手上該有多少現金」就是靠這一欄。

同一支手機開過一次就記住算好的 `bookId`，不必再輸入通行碼 ——
存的是推導結果，不是通行碼本身。
