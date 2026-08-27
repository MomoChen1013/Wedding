# Multi-event RSVP — 研究報告與改版提案

> 狀態：**提案，尚未實作**。這份文件是進入 coding 之前的架構研究，
> 需要新人（產品負責人）確認後才動程式碼。
>
> 研究對象：`minato-studio-wedding` 目前 production 的 RSVP／Guest／Wedding
> 資料模型與前後台實作（commit 時間點：2026-08）。
> 寫的是**現在程式碼裡真的長這樣**，不是願景 —— 與程式碼不符時以程式碼為準。

---

## 0. 一句話結論

現有架構**可以擴充成 Multi-event RSVP，而且不需要新建平行系統**，但有兩件事
必須先講清楚：

1. **「活動」這個概念，用站台文件裡的 `events[]` 陣列擴充最省**
   —— 和既有的 `schedule[]`、`guestTags[]` 完全同一套做法（規則只擋型別與筆數、
   內容在後台送出前切好），不必開新的子集合、不必多一次讀取、不必動任何規則路徑。

2. **「賓客只被邀請部分活動」目前做不到，因為系統裡根本沒有 Guest 這個實體。**
   現在的「賓客名單」是**從 RSVP 回覆反推出來的**（見 `seating-plan.js` 的
   `allGuests()`），邀請函也只有一個公開網址、沒有任何 per-guest 身分。
   `invitedEvents[]` 沒有東西可以掛。這是本次改版**最大的新增面**，
   應該獨立成後段 Phase、而且預設關閉。

因此提案把改版拆成兩條線，可以分開上線：

| 線 | 內容 | 影響範圍 | 建議 |
|---|---|---|---|
| **A. Event-based RSVP** | 一場婚禮多個活動、各自地點、各自 RSVP、各自 headcount | 中，全部可加法式擴充 | Phase 1–4 先做 |
| **B. Per-guest invitation access** | 每位賓客只看到自己被邀請的活動 | 大，需要新的 Guest／Invite 實體與 per-guest 連結 | Phase 5，flag 控制，預設關 |

**80% 只辦一場婚宴的新人，改版後看到的畫面與操作應該一個字都不變。**
這是整份提案的第一原則，下面每個決定都以它為準。

---

## 1. Current Architecture

### 1.1 技術骨架

無 build step 的原生 JS ＋ Firebase Hosting ＋ Firestore。
每一頁的唯一進入點是 `public/js/site-context.js`（ES module）：

```
/w/{slug}/invitation
  → site-context.js  解析 slug → slugs/{slug} → sites/{siteId}
                     檢查 status / pages 開關 → 套版型
                     攤平成 window.SITE（原始資料）與 window.WED（給頁面用的扁平物件）
  → 注入 js/common.js   （DataStore、RSVP_OPTIONS、rsvpConfig、LS、樣板替換…）
  → 注入 js/invitation.js（這一頁自己的渲染）
  → invitation.html 事先載入的 js/rsvp-form.js 提供 RSVPForm.mount()
```

真正的權限在 **Security Rules**，不是前端。規則對每一種寫入都做
`keys().hasOnly([...])` 白名單 —— **多一個欄位整筆被拒**。
這是理解本提案所有「為什麼要這樣改」的關鍵限制。

### 1.2 RSVP 相關檔案

| 檔案 | 行數位置 | 職責 |
|---|---|---|
| `public/invitation.html` | 全檔 125 行 | 單頁邀請函骨架。RSVP 區塊只有 `<div id="rsvpFormHost">` |
| `public/js/invitation.js` | 全檔 211 行 | 封面／倒數／地點／故事／照片牆／hashtag／`.ics`，最後 `RSVPForm.mount()` |
| `public/js/rsvp-form.js` | 全檔 689 行 | **表單的全部**：DOM 產生（`formHtml`）、狀態、條件顯示、驗證（`validate`）、payload（`buildPayload`）、送出、感謝畫面、回訪還原 |
| `public/js/common.js` | L88–124 | `RSVP_OPTIONS` — 表單與後台圖表共用的選項字典 |
| " | L142–160 | `rsvpConfig()` — 新人在後台開關了哪些題目 |
| " | L415–418 | `DataStore.addRSVP()` |
| " | L585–587 | `DataStore.subscribeRsvps()`（只有後台登入後才訂閱） |
| " | L589–621 | `getRSVPs / getRSVPCount / rsvpStatus / getAttendingCount / getRsvpTally` |
| " | L623–704 | `getRsvpCharts()` — 後台五個環狀圖的統計 |
| `public/css/rsvp.css` | 全檔 143 行 | 表單樣式（`.rf-*`、`.choice`、`.stepper`、`.thanks-card`） |
| `public/css/invitation.css` | 全檔 91 行 | 這一頁獨有（`.inv-*`：封面、資訊列、照片牆、lightbox） |
| `public/js/admin.js` | L1688–2535 | 後台「出席回覆」分頁：統計、名單表格／卡片、抽屜、篩選、標籤、CSV |
| " | L2537–2700 | 「表單設定」子分頁（寫回 `sites` 的 `rsvpAsk*`／`rsvpContactMethods`／`rsvpShow*`） |
| `public/admin.html` | L170–430 | 出席回覆分頁的 HTML |
| `firestore.rules` | L138–143 | `rsvps` 的四條規則 |
| " | L496–540 | `isValidRsvp()` — 欄位白名單與值域 |
| `scripts/export-rsvps.js` | 全檔 207 行 | Admin SDK 匯出 CSV（欄位與後台對齊） |
| `tests/rules.test.mjs` | L115–290、L399+ | RSVP 寫入／讀取／刪除的規則測試 |
| `tests/multipage.mjs` | L486–600、L1074–1180、L1885–1925 | 前台送出、後台名單、刪除、表單設定的 e2e |

### 1.3 RSVP 資料結構（`sites/{siteId}/rsvps/{autoId}`）

一筆 = **一組賓客（a party）送出的一次回覆**，不是一個人。

```
name          string  ≤40   必填
attending     bool          只有「熱情出席」是 true
tentative     bool          true 代表「視情況而定」（此時 attending=false）
guestCount    int    1–10   含填表人的總人數
relation      string        groom | bride | both | other | ''
tag           string ≤40    賓客自選的那一個標籤 id（單選、選填）
contactPhone / contactLine / contactEmail
mealMeat / mealVeg  int     葷素分配，兩者相加恆等於 guestCount
childSeat     int           兒童座椅張數
dietaryNote   string ≤300
cardType / cardDelivery / cardZip / cardAddress / cardEmail   喜帖
giftDelivery / giftZip / giftAddress                          喜餅
message       string ≤300   給新人的話
note          string ≤300   其他備註
icon          string ≤8
meal          string ≤20    舊版單一餐點欄位（保留相容）
createdAt     timestamp     必須 == request.time
```

規則的三個關鍵行為（`firestore.rules` L138–143）：

| 動作 | 誰可以 | 說明 |
|---|---|---|
| `create` | 任何人（含未登入） | 但要通過 `isValidRsvp()` 白名單 ＋ `rsvpEnabled` ＋ `rsvpDeadline` |
| `read` | 只有 `ownerEmails` | 賓客彼此看不到誰要來 |
| `update` | **永遠 false** | 回覆是賓客送出的原始紀錄，一個字都不能改 |
| `delete` | 只有 `ownerEmails` | 只為了處理重複送出（後台雙重確認） |

### 1.4 Guest — **目前不存在這個實體**

這是最重要的發現。系統裡沒有 `guests` 集合，也沒有任何 per-guest 的識別。
所謂「賓客名單」有三份，來源都不是 Guest：

| 名稱 | 位置 | 內容 | 誰產生 |
|---|---|---|---|
| 出席回覆 | `rsvps/{autoId}` | 賓客自己填的一筆回覆 | 賓客 |
| 排桌賓客 | `seatingPlan/draft.guests[]` | 只存「排桌時被改過的欄位」＋ 手動補的名單 | 新人 |
| 桌次查詢 | `seating/{autoId}` | `name / table / note`，公開可讀 | 新人（從排桌同步過去） |

`seating-plan.js` 的 `allGuests()`（L256–300）把 RSVP 攤成賓客：

```js
DataStore.getRSVPs().map(r => ({
  id: r.id, src: 'rsvp',
  name: r.name,
  count: m.count ?? (status === 'no' ? 0 : r.guestCount || 1),
  veg: r.mealVeg, seats: r.childSeat,
  tagIds: [...自選標籤, ...新人掛的 rsvpTags, ...從 mealVeg/childSeat 推出來的],
  ...
}))
```

也就是說：**沒回覆過的人，在系統裡不存在。**

### 1.5 Guest tags

| 資料 | 位置 | 誰寫 |
|---|---|---|
| 標籤庫 | `sites/{id}.guestTags[]` ＝ `{ id, name, onForm }`，≤30 | 新人（後台） |
| 賓客自選的一個 | `rsvps/{id}.tag`（單選、選填） | 賓客，送出後改不動 |
| 新人掛的那些 | `rsvpTags/{rsvp 的 id}.tags[]`，≤20 | 新人（後台隨時可改） |
| 總開關 | `sites/{id}.guestTagsEnabled` | **只有我們**（`npm run set-pages -- --guest-tags on`） |

`guestTagsEnabled` 是本專案既有的 **progressive disclosure 樣板**：
進階功能有一個新人自己改不動的站台旗標，由我們決定哪一組新人要用。
本提案的多活動功能會沿用同一套。

### 1.6 Wedding / Event — 已經存在什麼

| 概念 | 現況 | 可否直接擴充 |
|---|---|---|
| Wedding | `sites/{siteId}` 一份文件 | ✅ |
| **Event** | ❌ 不存在 | 需要新增，但可以是站台文件內的陣列 |
| Ceremony / Reception | ❌ 沒有型別概念，整站只有「一場婚禮」 | — |
| **Timeline / Schedule** | ✅ `schedule[]` ＝ `{ time, title, desc }`，≤40 筆 | ⚠️ **純顯示用**：沒有 id、沒有地點、沒有 RSVP 旗標 |
| **Venue / Address** | ✅ 但**只有一組**：`venueName` / `venueAddress` / `venueMapUrl` | 需要下放到 Event |
| 時間 | `eventDate`（timestamp）＋ `eventEndDate` ＋ `timezone` | 需要下放到 Event |
| 交通 | `transportPublic` / `transportParking`（＋各一張圖） | 目前綁在唯一場地上 |

`schedule[]` 是最接近「活動」的既有結構，但**不能直接當成 Event**：

- 沒有 id → 已送出的 RSVP 無法安全指向某一筆（新人調順序、改字，指向就跑掉）
- 沒有地點 → 「一個活動一個地點」做不到
- 語意不同 → 現在裡面放的多半是**婚宴內部的流程**（「入場迎賓」「送客」），
  不是獨立活動。自動轉換會產生一堆垃圾 Event。

### 1.7 單一場地目前被誰使用

改動 venue 之前必須知道會踩到誰：

| 使用者 | 位置 | 用途 |
|---|---|---|
| 大廳資訊卡 | `js/index.js` L263–264 | `infoVenue` / `infoAddr` |
| 大廳地圖鈕 | `js/index.js` L272–275 | `mapUrl` 或用地址組 Google Maps |
| 大廳 Google Calendar | `js/index.js` L277–299 | `location` 參數 |
| 邀請函資訊列 | `js/invitation.js` `renderVenue()` | 地點列 ＋ 開啟地圖 |
| 邀請函 `.ics` | `js/invitation.js` `setupCalendar()` | `LOCATION` |
| OG 分享文字 | `scripts/build-og.js` L138 | 日期 ＋ 場地名 |
| 後台婚禮資訊 | `js/admin.js` L3976–3978、L4231–4233 | 三個輸入框 |
| 後台表單設定的「表單資訊」列 | `js/admin.js` L2612–2614 | 唯讀顯示 |
| Rules 白名單 | `firestore.rules` L56、L78–81 | 三個欄位的長度與 URL 格式 |
| 建站 CLI | `scripts/create-site.js` | `--venue / --address / --map-url` |

### 1.8 後台資訊架構（現況）

```
出席回覆 (rsvp)          ├ 出席回覆總覽（大數字 ＋ 五個環狀圖）
                        ├ 回覆（表格／卡片、篩選、標籤、CSV、詳細抽屜）
                        ├ 表單設定（題目開關 ＋ 表單資訊）
                        └ 設定賓客標籤（guestTagsEnabled 才出現）
桌次 (seating)           ├ 桌次圖 └ 桌次搜尋及名單
排桌管理 (seatingPlan)    ├ 排桌工作區 ├ 桌位管理 └ 匯入匯出
收禮小幫手 (butler)       ├ 收禮統計 ├ 收禮明細 …
婚禮資訊 (lobby)          ├ 婚禮資訊（場地／時間／交通／DressCode／禮金／故事／hashtag）
                        ├ 當日流程（schedule[]）
                        └ 自訂內容（explore）
感謝信 / 婚禮小卡 / 新人故事牆 / 悄悄話 / 熟悉測驗
```

### 1.9 統計現況

`DataStore.getRsvpCharts()`（`common.js` L623–704）產生五組
`{ total, slices:[{key,label,value}] }`：出席、飲食、兒童座椅、喜帖、喜餅。
分母**刻意不一致**（出席／喜帖／喜餅以「回覆筆數」計，飲食以「人數」計）。
`getAttendingCount()` 把 `attending===true` 的 `guestCount` 加總＝總出席人數。

**全部只有一個分母，因為只有一場活動。**

---

## 2. Current Problems

### P1　「婚禮」被寫死成「一場活動」

一個日期、一個場地、一個結束時間、一個 `rsvpDeadline`、一個
`attending: boolean`。台灣常見的「文訂＋迎娶＋婚宴」「證婚＋婚宴＋After Party」
沒有任何地方放得下。

### P2　`schedule[]` 是字串時間軸，撐不起結構

沒有 id、沒有地點、沒有 requiresRsvp。要它兼職 Event 會讓兩件事互相汙染：
新人一旦把「入場迎賓」寫進去，它就變成一個賓客要回覆的活動。

### P3　沒有 Guest 實體 → `invitedEvents[]` 無處可掛

而且邀請函只有一個公開網址，前台無從得知「現在看的人是誰」。
在解掉這一點之前，「賓客 B 看不到 After Party」在技術上不可能成立。

### P4　RSVP 不可修改 ＋ 重複送出是常態

`allow update: if false` 是刻意的設計（SPEC 第 3 節），後台只能整筆刪除。
單一活動時還行；多活動之後「我先回婚宴，After Party 之後再說」會是**常見需求**，
重複送出的壓力會明顯升高。

### P5　統計只有一個分母

`getAttendingCount()`／`getRsvpTally()`／`getRsvpCharts()` 全部假設一場活動。
「婚宴 126 人 ≠ 證婚 126 人」目前算不出來。

### P6　排桌以「一位賓客一個人數」為前提

`allGuests()` 的 `count` 直接取 `guestCount`。多活動之後
「這桌是婚宴的 10 位，還是 After Party 的 6 位？」會變成歧義。

### P7　規則的白名單讓任何欄位新增都是 breaking

`isValidRsvp()` 的 `hasOnly([...])`：多一個欄位 → 整筆被拒。
所以**規則必須先上線，前端才能開始寫新欄位**（部署順序有硬性相依）。

---

## 3. Recommended Product Architecture

### 3.1 核心概念

```
Wedding (sites/{siteId})
  └─ events[]                     ← 新增。站台文件內的陣列，不是子集合
        ├─ id / type / name / nameEn
        ├─ date / startTime / endTime
        ├─ venueName / address / mapUrl
        ├─ desc
        ├─ requiresRsvp
        └─ questions[]            ← 選配，Event 自己的追加題目

  └─ rsvps/{autoId}               ← 沿用既有子集合，欄位加法式擴充
        ├─ （既有欄位全部保留，語意不變）
        ├─ primaryEventId         ← 新增：上面那些欄位在講哪一個活動
        └─ events { eventId: { going, count, veg, note, answers } }   ← 新增

  └─ invites/{inviteId}           ← Phase 5 才做，預設關閉
        └─ name / code / phone / tags[] / invitedEvents[]
```

### 3.2 為什麼 `events[]` 是陣列，不是子集合

| 面向 | 陣列（在站台文件裡） | 子集合 `sites/{id}/events` |
|---|---|---|
| 讀取成本 | **0**：站台文件每一頁本來就會讀 | 每一頁多一次 collection 讀取 ＋ 訂閱 |
| Security Rules | 只要在既有白名單加一個 key | 要新增 match 路徑、新的 read/write 判斷 |
| 規則能不能驗內容 | 不能（只能擋型別與筆數） | 能逐欄位驗 |
| RSVP 規則要引用 events | `site(siteId).events` 直接拿得到 | 需要額外 `get()`（規則的 get 有次數上限） |
| 排序 | 陣列順序即順序 | 需要 `order` 欄位 ＋ orderBy |
| 既有慣例 | ✅ `schedule[]`、`guestTags[]`、`seatingPlan.tables[]` 都是這樣 | ❌ 沒有前例 |
| 筆數 | 婚禮活動 ≤ 10，遠低於文件 1MB 上限 | 無上限（但用不到） |

**結論：陣列。** 這不是妥協，是這個 codebase 已經反覆選過的答案 ——
`schedule`、`guestTags`、`seatingPlan.tables/guests` 全部是「list of map，
規則只擋型別與筆數，內容在後台送出前切好」。多開一套子集合會是**平行系統**，
違反第二十節「不要建立重複的 Event system」。

### 3.3 為什麼 `eventResponses` 是 map，不是 list

需求文件給的參考是 `eventResponses[]`。建議改成 **map，key ＝ eventId**：

- Firestore 規則對 list 完全沒辦法檢查內容，對 map 至少可以 `size()`
- 「同一個活動只會有一筆回應」是天然的唯一性，用 map 天然成立，用 list 要自己去重
- 前端讀取是 `r.events[eventId]`，不必每次 `find()`
- 後台統計要跑 N 個活動 × M 筆回覆，map 查表是 O(1)

### 3.4 最重要的相容性決定：**鏡像，不是搬家**

改版後，**既有的頂層欄位語意完全不變**：

> `attending` / `guestCount` / `mealMeat` / `mealVeg` / `childSeat`
> 永遠代表「**主要活動**（`primaryEventId`，預設就是婚宴）」的回覆。

新的 per-event 資料是**額外**寫進 `events{}` 的，其中 `primaryEventId` 那一筆
與頂層欄位內容相同（鏡像）。

因此下列全部**一行都不用改就繼續正確**：

- `seating-plan.js` 的 `allGuests()`（排桌人數、葷素、兒童椅、推導標籤）
- `butler` 匯入的賓客名單快照
- `getAttendingCount()` / `getRsvpTally()` / 既有五張環狀圖
- `scripts/export-rsvps.js` 的既有欄位
- 後台名單表格的既有欄位
- 全部既有的 rules 測試與 e2e 測試

這條規則是整份提案的地基。任何讓它不成立的設計都應該被否決。

---

## 4. Data Model

### 4.1 Event（`sites/{siteId}.events[]`）

```
events: [
  {
    id          : string  ≤24   穩定短 id，後台產生（如 'ev_ceremony'、'ev_a1b2c3'）
                                ★ 一旦產生就不再變，RSVP 靠它對回來
    type        : string  ≤20   'engagement'(文訂) | 'fetching'(迎娶)
                                | 'ceremony'(證婚)  | 'reception'(婚宴)
                                | 'afterparty'      | 'custom'
    name        : string  ≤30   中文名稱：「基督教證婚」
    nameEn      : string  ≤30   卡片上的 kicker：「CEREMONY」（留白就用 type 的預設）
    date        : string  10    'YYYY-MM-DD'（婚禮所在時區的牆上日期）
    startTime   : string  5     'HH:mm'，可留白
    endTime     : string  5     'HH:mm'，可留白
    venueName   : string  ≤80
    address     : string  ≤200
    mapUrl      : string  ≤500  留白時前端用 address 組 Google Maps（沿用既有邏輯）
    desc        : string  ≤300  活動說明
    requiresRsvp: bool          false = 出現在流程／邀請函，但不出現在 RSVP 表單
    questions   : map[]  ≤3     選配，見 4.3
  },
  ...
]                               ≤10 筆
```

**為什麼 date/time 存字串而不是 Timestamp**

1. 既有的 `schedule[].time` 就是字串，後台輸入框也是字串
2. Timestamp 放進陣列裡，後台編輯／clamp／diff 都要多一層轉換
3. 婚禮的時間是**牆上時間**（「10/18 14:00 在台北真理堂」），
   站台已經有 `timezone` 欄位，牆上時間 ＋ 時區才是無歧義的表達；
   存成絕對時間反而要在每個顯示點換算回來
4. `.ics` / Google Calendar 需要絕對時間 → 用既有的 `zonedTimeToDate()`
   （`admin.js` L4000 已經有這個函式）在產生時換算，不必存

站台的 `eventDate`（Timestamp）**保留不動**：它是倒數計時、`rsvpDeadline` 比較、
build-og、slug 排序的依據，而且新人自己改不動（規則只放行改「幾點」）。
它繼續代表「這場婚禮的代表時間」＝ 主要活動。

### 4.2 RSVP（`sites/{siteId}/rsvps/{autoId}`）

```
（既有欄位全部保留，語意不變 —— 代表 primaryEventId 那一個活動）

primaryEventId : string ≤24    新增。頂層欄位在講哪一個活動
                               舊資料沒有這個欄位 → 視為 'main'（見 4.5）
events         : map    ≤10    新增。eventId → {
                                 going  : bool          會不會參加
                                 count  : int   0–10    這個活動的出席人數
                                 veg    : int   0–10    素食人數（只有需要的活動才問）
                                 note   : string ≤200   這個活動的備註
                                 answers: map   ≤3      Event 自訂題目的作答（見 4.3）
                               }
```

範例（賓客 C：不參加證婚、參加婚宴 2 位、參加 After Party 2 位）：

```json
{
  "name": "王小明",
  "attending": true, "guestCount": 2, "mealMeat": 1, "mealVeg": 1, "childSeat": 0,
  "primaryEventId": "ev_reception",
  "events": {
    "ev_ceremony":   { "going": false, "count": 0, "veg": 0, "note": "", "answers": {} },
    "ev_reception":  { "going": true,  "count": 2, "veg": 1, "note": "", "answers": {} },
    "ev_afterparty": { "going": true,  "count": 2, "veg": 0, "note": "",
                       "answers": { "q_shuttle": "yes" } }
  }
}
```

注意 `events['ev_reception']` 與頂層欄位是**鏡像**的。

### 4.3 Event-specific questions（選配）

不要做通用的 form builder —— 那是另一個產品。建議限制成**兩種型態、每個活動最多 3 題**：

```
questions: [
  { id: 'q_shuttle', kind: 'choice', label: '需要接駁嗎？',
    opts: [['yes','需要'],['no','不需要']] },     // opts ≤4，每個 ≤20 字
  { id: 'q_note',    kind: 'text',   label: '有什麼要提醒我們的嗎？' }
]
```

作答存在 `events[eventId].answers = { q_shuttle: 'yes' }`。

**理由**：既有的 `quiz` 子集合已經證明「固定四個選項、規則只擋型別」這條路走得通
（`firestore.rules` L203–219）。但 quiz 是子集合、有自己的 match；
Event 題目放在陣列裡規則管不到內容，所以**必須把型態限死**，
後台送出前用同一套 clamp。這一項建議排在最後（Phase 4b），
先確認多活動本體站得住再說。

### 4.4 Invite / Guest（Phase 5，預設關閉）

要做到「賓客 B 看不到 After Party」，必須讓邀請函知道現在看的是誰。
建議**完整沿用 `butlers/{bookId}` 已經驗證過的「知道 id 就等於通過驗證」模式**
（`firestore.rules` L541–570 的長篇說明）：

```
sites/{siteId}/invites/{inviteId}
  name          : string ≤40    「王小明 一家」
  code          : string ≤12    對得回排桌編號（選填）
  phone         : string ≤30
  tags          : string[] ≤20
  invitedEvents : string[] ≤10  eventId 陣列
  rsvpId        : string ≤40    已回覆的話指回那一筆（選填）
  createdAt / updatedAt : number

規則：
  allow get   : if true      ← 知道 inviteId 才走得到這份文件
  allow list  : if false     ← ★ 一定要擋，否則等於把整份名單公開
  allow write : if isSiteOwner(siteId)
```

邀請函連結變成 `/w/{slug}/invitation?i={inviteId}`：

- 有 `?i=` → 讀那份 invite，只顯示 `invitedEvents` 裡、且 `requiresRsvp` 的活動，
  姓名預先填好
- 沒有 `?i=` → **完全照現在的行為**：顯示所有 `requiresRsvp` 的活動（公開連結不會壞）

**中繼方案（如果 Phase 5 太重）**：給 Event 加 `audienceTags[]`，
賓客在表單上選了關係／標籤之後才顯示對應的活動卡。
成本低很多，但**會洩漏活動的存在**（賓客切換選項就看得到），
只適合「不介意被看到、只是不想讓不相干的人誤填」的情境。
建議當成過渡，不當成終局。

### 4.5 Migration Strategy — **不寫入任何 production 資料**

核心手法：**read-time 合成，不做 backfill。**

在 `common.js` 新增一個所有頁面共用的函式：

```js
/* 這場婚禮有哪些活動。
   ・events[] 有東西 → 用它
   ・沒有（＝所有既有站台）→ 用站台既有欄位合成一個虛擬活動
   合成的那一個 id 固定是 'main'，不寫回資料庫。 */
function weddingEvents(){
  const d = (window.SITE && window.SITE.data) || {};
  const list = Array.isArray(d.events) ? d.events.filter(validEvent) : [];
  if(list.length) return list;

  const W = window.WED || {};
  return [{
    id: 'main', type: 'reception',
    name: '婚宴', nameEn: 'WEDDING RECEPTION',
    date: W.date ? W.date.replace(/\./g, '-') : '',
    startTime: (W.time || '').replace(' 開始', ''), endTime: '',
    venueName: W.venue, address: W.address, mapUrl: W.mapUrl,
    desc: '', requiresRsvp: true, questions: [],
  }];
}
```

於是：

| 狀況 | 結果 |
|---|---|
| 既有站台（沒有 `events`） | 系統認為「這場婚禮有 1 個活動」→ 前台走**單一活動路徑**＝現在的畫面 |
| 新人第一次打開後台「婚禮流程」 | 看到那一個由既有欄位帶出來的活動卡，已經填好 |
| 新人按「儲存」 | 這一刻才真的寫進 `events[]`（**使用者主動觸發的 migration**） |
| 新人按「＋ 新增活動」 | 才進入多活動模式 |

`schedule[]` **保持原樣不動**（大廳的時間軸繼續是它）。
另外在後台婚禮流程頁提供一顆「從當日流程匯入」的按鈕，
把選中的幾列轉成 Event 草稿讓新人自己補地點 —— **不自動轉**（見 P2）。

舊 RSVP（沒有 `events{}`）的讀法：

```js
/* 一筆回覆對某個活動的回應。
   舊資料只有頂層欄位 → 主要活動照舊解讀，其餘活動算「未回覆」 */
function eventResponse(r, eventId){
  const map = r.events && typeof r.events === 'object' ? r.events : null;
  if(map && map[eventId]) return map[eventId];
  const primary = r.primaryEventId || 'main';
  if(eventId === primary || eventId === 'main'){
    return { going: r.attending === true,
             count: r.attending ? (Number(r.guestCount)||1) : 0,
             veg: Number(r.mealVeg)||0, note: '', answers: {},
             legacy: true };
  }
  return null;   /* null ＝ 這個活動沒有回應（未回覆），不是「不參加」 */
}
```

`null`（未回覆）與 `going:false`（明確說不來）必須分開 ——
統計表的「待回覆」欄位靠的就是這個區別。

### 4.6 Security Rules 變更（全部加法式）

**1. 站台文件白名單**（`firestore.rules` L52–118）

```
'guestTags', 'events',        ← 加一個 key
...
&& (!('events' in d) || (d.events is list && d.events.size() <= 10))
```

與 `schedule`（≤40）、`guestTags`（≤30）完全同一套寫法。

**2. RSVP 白名單**（`firestore.rules` L496–540）

```
data.keys().hasOnly([ ...既有全部..., 'events', 'primaryEventId' ])
&& (!('primaryEventId' in data) || isStr(data.primaryEventId, 24))
&& (!('events' in data) || (data.events is map && data.events.size() <= 10))
```

**3. `rsvpDeadline` 維持全站唯一**。不要做 per-event deadline 進規則 ——
規則讀不到陣列裡的內容，做不到。真的需要「After Party 提前截止」時，
在前端軟性擋（表單上該卡片顯示「已截止」不可點），
硬性的最後防線仍然是全站的 `rsvpDeadline`。

**4. invites（Phase 5）**

```
match /invites/{inviteId} {
  allow get   : if true;
  allow list  : if false;
  allow create, update, delete: if isSiteOwner(siteId)
    && request.resource.data.keys().hasOnly([
         'name','code','phone','tags','invitedEvents','rsvpId','createdAt','updatedAt'])
    && isStr(request.resource.data.name, 40)
    && request.resource.data.invitedEvents is list
    && request.resource.data.invitedEvents.size() <= 10;
}
```

**部署順序是硬性的**：規則先上 → 前端才能寫新欄位。
反過來會讓所有帶新欄位的送出被整筆拒絕（P7）。

### 4.7 站台旗標（progressive disclosure 的實作）

沿用 `guestTagsEnabled` 的做法，新增一個新人自己改不動的旗標：

```
sites/{siteId}.multiEventEnabled : bool     沒有這個欄位 ＝ 關
```

- **關**（＝所有既有站台）：後台不長出「婚禮流程」子分頁，
  前台永遠走單一活動路徑。**完全等於現在。**
- **開**：後台出現活動編輯器，新人可以新增第 2 個活動。

開關方式沿用既有 CLI：`npm run set-pages -- --slug {slug} --multi-event on`
（在 `scripts/set-pages.js` 加一個參數，和 `--guest-tags` 同一段程式）。

> 注意：即使旗標打開，只要新人只建一個活動，前台仍然走單一活動路徑。
> **旗標控制的是「後台看不看得到這個功能」，不是「前台長什麼樣」。**

---

## 5. Frontend UX

### 5.1 三段式渲染 —— 複雜度跟著活動數走

| 需要 RSVP 的活動數 | 前台 RSVP 區塊 |
|---|---|
| **1** | **完全等於現在的表單**。沒有活動卡、沒有標題、沒有任何新東西 |
| **2** | 兩張精簡活動卡 ＋ 共用的賓客資料區 |
| **3–4** | 活動卡（第一張展開，其餘收合成一行）＋ 賓客資料區 |
| **5+** | 同上 ＋ 頂部「3 / 5 已回覆」進度行 ＋「全部參加」快捷 |

這條規則就是第十八節「簡單婚禮不能被複雜化」的具體實作。
`rsvp-form.js` 的 `mount()` 開頭判斷一次，走哪一條路：

```js
const events = weddingEvents().filter(e => e.requiresRsvp);
if(events.length <= 1) return mountSingle(...);   /* 現有的 formHtml()，一字不改 */
return mountMulti(events, ...);
```

**單一活動的程式碼路徑不動**，是把改版風險壓到最低的最有效手段。

### 5.2 版面（多活動）

```
R.S.V.P.  出席回覆
告訴我們你的出席安排

請依照你的安排，告訴我們哪些活動可以與我們一起參與。

┌─────────────────────────────────┐
│ CEREMONY                        │  ← .inv-kicker（11px / .34em / uppercase / --ink-soft）
│ 基督教證婚                       │  ← --font-display 19px / .16em
│                                 │
│ 10 / 18　SAT　14:00             │  ← tabular-nums / --ink
│ 台北真理堂                       │  ← .ir-val
│ 台北市大安區新生南路三段86號        │  ← .ir-sub
│ 查看地圖 →                       │  ← .ir-jump（既有元件）
│ ─────────────────────────────── │  ← 1px --line-soft
│ 你會參加嗎？                      │  ← .rf-label
│ [  會參加  ] [ 無法參加 ]         │  ← .choice-row / .choice（既有元件）
└─────────────────────────────────┘

（選了「會參加」才往下展開）
  包含你，共幾位出席？   [－] 2 [＋] 位     ← 既有 .stepper
  餐點分配              葷 1 ／ 素 1        ← 既有 .rf-split
  （這個活動的自訂題目）

┌─ WEDDING RECEPTION ─ 婚宴 ────────┐  …
┌─ AFTER PARTY ─ 婚後派對 ──────────┐  …

────────────────────────────────────
你的資料
  怎麼稱呼你？        [            ]
  與新人的關係        [男方][女方][雙方][其他]
  聯絡方式            電話 [        ]
  喜帖／喜餅／想說的話／備註
  
  [        送出回覆        ]
```

**沒有一個新的顏色、新的圓角、新的陰影。** 全部用既有 token：

| 元素 | 沿用 |
|---|---|
| 卡片 | `.cardbox`（1px `--line`、無陰影、`--radius: 2px`） |
| 英文 kicker | `.inv-kicker` |
| 地點／地址／地圖 | `.ir-val` / `.ir-sub` / `.ir-jump` |
| 參加／不參加 | `.choice-row` ＋ `.choice.on`（選中＝`--ink` 實心 ＋ `--on-ink` 文字） |
| 人數 | `.stepper` |
| 葷素 | `.rf-split` |
| 錯誤 | `.rf-err`（既有 `#a4677a`） |
| 感謝 | `.thanks-card` |

新增的 class 只有結構性的三個：`.rsvp-events`（容器）、`.ev-card`、`.ev-head`。
放進 `css/rsvp.css`，不新開檔案。

### 5.3 為什麼**不**分成 Step 1 / Step 2

需求文件問「活動出席」與「Guest Information」要不要拆 step。建議**不拆**：

1. 現有表單已經在用**漸進揭露**（`detailBox` 選了「出席」才展開），
   同一個機制、零導覽成本。多疊一層 wizard 只是把捲動換成點擊
2. Step 會打壞瀏覽器「上一頁」的預期，手機上尤其容易誤觸退出
3. 這一頁的視覺前提是「一封可以從頭讀到尾的邀請函」，
   切成兩頁會讓它變成一個表單工具
4. 真正的長度問題出在活動數 ≥5，而那個問題用**答完就收合**解決得更好

改成：**一頁、兩個用留白與一條 `--line-soft` 分開的區段、沒有步驟數字。**
只有活動 ≥5 時，頂部加一行安靜的「3 / 5 已回覆」。

### 5.4 Mobile

- 永遠單欄。卡片 padding 20px（手機）／26px（桌機）
- 參加／不參加兩顆並排，`flex:1`，**最小高度 48px**（拇指熱區）
- 已回答的卡片**收合成一行**：`基督教證婚　會參加 2 位　修改`
  → 5 個活動也不會讓頁面長到滑不完
- 活動 ≥3 時，送出鈕做成 sticky bottom bar（`env(safe-area-inset-bottom)` 要留）
- 地圖連結一律 `target="_blank" rel="noopener"`，手機會直接開 Google Maps App

### 5.5 各種狀態

| 狀態 | 畫面 |
|---|---|
| **Empty**（沒有活動需要 RSVP） | 整個 RSVP 區塊隱藏。婚禮資訊與流程照常顯示 |
| **賓客沒被邀請任何需 RSVP 的活動** | 「這幾場活動不需要事先回覆，我們現場見」＋ 婚禮流程 |
| **回覆已關閉／已截止** | 沿用既有 `closedReason()` 與 `.rf-closed` |
| **Validation** | **不要**一次列出所有錯誤。捲到第一張未回答的卡片，卡片左緣加一條 `--ink` 髮絲線，卡片內顯示 `.rf-err` 訊息 |
| **Submit** | 沿用：按鈕 disabled ＋「送出中…」 |
| **Success** | 感謝卡**逐條列出每個活動的答案**（多活動時這一點很重要，賓客要看得到自己答了什麼）：<br>`基督教證婚　會參加`／`婚宴　會參加・2 位`／`After Party　無法參加` |
| **回訪** | 沿用 `LS 'rsvp.mine'`，擴充成帶 per-event 答案 |
| **單一活動** | 以上全部不出現，就是現在的畫面 |

### 5.6 快捷操作

| 功能 | 建議 | 理由 |
|---|---|---|
| 「全部參加」 | ✅ 活動 ≥3 時才出現 | 最常見的情境（親近的親友全參加）一鍵完成，之後還能個別改 |
| 「都不參加」 | ❌ 不做主要入口 | 語意太重，而且每張卡都有「無法參加」，重複；真的不能來的人本來就會一張一張點，那個過程也讓他有機會留言 |
| 只顯示需 RSVP 的活動 | ✅ **一定要** | 文訂／迎娶出現在婚禮流程（`requiresRsvp:false`），但不進表單。這是 `requiresRsvp` 存在的唯一理由 |
| 進度提示 | 只有 ≥4 個活動 | 更少時是噪音 |
| 卡片收合 | 答完就收 | 見 5.4 |

---

## 6. Backend / Admin UX

### 6.1 資訊架構（在既有 tab／subtab 骨架上）

```
婚禮資訊 (lobby)
  ├ 婚禮資訊       既有。multiEvent 開啟時，場地三欄改成唯讀，
  │                並顯示「場地已改由『婚禮流程』管理」＋ 跳轉鈕
  ├ 婚禮流程       ★ 新增：events[] 編輯器
  ├ 當日流程       既有 schedule[]，不動
  └ 自訂內容       既有

出席回覆 (rsvp)
  ├ 出席回覆總覽   既有大數字 ＋ 環狀圖，★ 上方加一張「各活動出席統計」表
  ├ 回覆           既有表格，★ 加活動篩選 chips ＋ 各活動欄位
  ├ 表單設定       既有，★ 多活動時加「各活動的追加題目」（收合、進階）
  ├ 賓客名單       ★ Phase 5：invites ＋ per-event 勾選 ＋ 複製專屬連結
  └ 設定賓客標籤   既有
```

### 6.2 婚禮流程編輯器

一張卡片一個活動，**沿用既有元件，不新造**：

| 需求 | 沿用 |
|---|---|
| 上下排序 | `ad-sch-move` 的 ↑↓ 32px 方形鈕（`admin.js` L4287–4291） |
| 未儲存提示 | `schSnapshot()` / `syncSchDirty()` / `.btn.is-dirty` |
| 刪除復原 | `scheduleUndoDelete()` 的 undo toast |
| 儲存列 | `.ad-savebar` |
| 欄位 | `.ad-input` / `.ad-textarea` / `.ad-check` |

型別預設（點一下就帶好名稱與英文 kicker，新人不用自己想）：

| type | name | nameEn | requiresRsvp 預設 |
|---|---|---|---|
| `engagement` | 文訂 | ENGAGEMENT | **false** |
| `fetching` | 迎娶 | FETCHING | **false** |
| `ceremony` | 證婚 | CEREMONY | true |
| `reception` | 婚宴 | WEDDING RECEPTION | true |
| `afterparty` | After Party | AFTER PARTY | true |
| `custom` | （新人自己填） | — | true |

**Progressive disclosure**：這一頁預設只有**一張**由既有欄位帶出來的活動卡
（名稱「婚宴」、地點已填好），下面一顆「＋ 新增活動」。
只辦一場婚宴的新人看到的東西和現在的「婚禮資訊」幾乎一樣，沒有新東西要學。

### 6.3 RSVP Dashboard — 各活動獨立 headcount

放在既有環狀圖**上方**（多活動時才出現）：

```
各活動出席統計

活動              已確認    待回覆    無法出席      人數
基督教證婚          82        14        8           —
婚宴               126        12        4        210 位
After Party         58        21       63           —
```

| 欄位 | 定義 |
|---|---|
| 已確認 | `events[eventId].going === true` 的**回覆筆數** |
| 待回覆 | 該活動沒有回應的筆數（`eventResponse()` 回 `null`）。**舊資料會落在這裡** |
| 無法出席 | `going === false` 的筆數 |
| 人數 | `going` 的 `count` 加總。只有需要人數的活動才顯示（婚宴要排桌，證婚多半不用） |

**分母刻意不一樣**，和既有環狀圖的處理一致（`common.js` L623 的註解已經說明過
「分母刻意不一致，因為問的問題不一樣」）—— 表頭必須寫清楚。

既有的大數字（總回覆筆數）與五張環狀圖**保留不動**，它們回答的是
「有多少人回覆了」與「主要活動的分布」，仍然成立。

### 6.4 回覆名單

- 頂部加一排活動篩選 chips（沿用 `.ad-chips`）：`全部｜證婚｜婚宴｜After Party`
- 表格：多活動時，「出席回應」那一欄換成 N 個小欄（每個活動一欄，
  值是 `✓ 2` / `✗` / `—`）。既有的人數／葷／素欄位繼續顯示**主要活動**的數字
- 詳細抽屜（`rsvpDrawerHtml`）加一段「各活動出席」，逐條列出
- CSV：`rsvpCsvColumns()` 動態多出 N 欄（`{活動名}出席`、`{活動名}人數`），
  `scripts/export-rsvps.js` 同步（欄位定義兩邊本來就要對齊）

### 6.5 排桌 / 收禮怎麼辦

`seating-plan.js` 的 `allGuests()` 目前用 `guestCount`。多活動之後：

- **維持現狀就是對的**：頂層 `guestCount` ＝ 主要活動（婚宴）的人數，
  排桌本來就只排婚宴。**一行都不用改。**
- 進階（可延後）：排桌工作區加一個「依哪個活動排」的下拉，
  切換時 `allGuests()` 的 `count` 改讀 `events[選中的活動].count`。
  只有在新人真的要排兩場的座位時才需要，不列入 Phase 1–4。

---

## 7. Edge Cases

| # | 情境 | 處理方式 |
|---|---|---|
| 1 | **只有婚宴** | `events` 空或只有 1 筆 → `weddingEvents()` 合成／回傳 1 筆 → 前台走**單一活動路徑**＝現在的表單。後台不出現任何新東西（旗標關）。**零變化** |
| 2 | **證婚 ＋ 婚宴** | 2 張精簡卡 ＋ 共用賓客資料區。統計表 2 列 |
| 3 | **文訂 ＋ 迎娶 ＋ 婚宴** | 文訂／迎娶 `requiresRsvp:false` → 只出現在婚禮流程區塊，**不進 RSVP 表單** → 賓客實際上只回覆 1 件事 → 前台仍走單一活動路徑。這是 `requiresRsvp` 最有價值的一個 case |
| 4 | **證婚 ＋ 婚宴 ＋ After Party** | 3 張卡，第一張展開其餘收合；統計表 3 列各自獨立分母 |
| 5 | **5 個以上活動** | 上限 10。頂部進度行「3 / 5 已回覆」＋「全部參加」快捷 ＋ 答完即收合。後台編輯器一律卡片列表，捲得動 |
| 6 | **Event 不需要 RSVP** | `requiresRsvp:false`：出現在婚禮流程／邀請函資訊，**不出現在表單**、**不進統計表**、**不佔 `events{}` 的 key** |
| 7 | **賓客只被邀請其中一個 Event** | Phase 5：`?i={inviteId}` → 只渲染 `invitedEvents ∩ requiresRsvp`。若只剩 1 個 → 自動退回單一活動路徑（最好的結果：他看到的就是一份簡單表單）。沒有 `?i=` 的公開連結 → 顯示全部需 RSVP 的活動（現行行為，不會壞） |
| 8 | **被邀 3 個、只參加 2 個** | 正常路徑。`events{}` 三個 key，其中一個 `going:false`。統計表三列各自加對的地方 |
| 9 | **新增 Event 後，既有 Guest 要不要自動加入？** | **前台**：新活動立刻出現在表單上，已回覆過的賓客回訪時看得到它是「尚未回覆」，可以補答。**Phase 5 的 invites**：預設**不**自動加入（新增活動不等於每個人都被邀請）；後台在活動新增後顯示一行提示「已新增『After Party』，目前 0 位賓客被邀請」＋「全選」按鈕，由新人**明確決定**。統計表的「待回覆」會顯示全部人數 —— 那個數字本身就是提醒 |
| 10 | **刪除 Event 後，既有 RSVP 怎麼辦？** | **絕不刪 RSVP 裡的資料**（回覆本來就不可修改）。`events{}` 裡那個孤兒 key 就留著，讀取時因為 `weddingEvents()` 找不到對應 id 而**自動被忽略**（和 `guestTags` 刪掉標籤時的既有處理完全同一套：`rsvp-form.js` 的 `cfg.tagOptions.some(...)`、`common.js` 的 `guestTagName()` 找不到就回空字串）。後台刪除前用既有的 `confirmModal` 說清楚：「已有 58 筆回覆包含這個活動，刪掉之後那些回覆仍然保留，但不會再顯示」，並提供 `scheduleUndoDelete` 的復原 |
| 11 | **改 Event 日期／地點後，已提交的 RSVP 受影響嗎？** | **不受影響**。RSVP 存的是 `eventId`，不是日期或地點的快照。這正是「id 不是名字」原則（`guestTags` 已經這樣做）。但**新人需要知道要通知賓客** → 後台在活動已有回覆時修改日期／地點，儲存後 toast 提醒：「這個活動已有 82 筆回覆，日期改了記得通知他們」。**不自動作廢任何回覆** |
| 12 | **賓客已提交後，新人改了 invitedEvents** | 已提交的回覆不動。賓客用同一個 `?i=` 連結回訪時，看到的是**新的**活動清單：多出來的顯示「尚未回覆」，被移除的那一個不再顯示（但資料還在，後台看得到）。後台在名單上把這種情況標成「邀請異動後未重新回覆」 |
| 13 | **同一個 Guest 重複提交** | **維持現狀**：規則不允許 update，重複送出就是新增一筆，後台用既有的雙重確認刪除處理（`admin.js` 的 `deleteRsvp`）。多活動會提高重複率，所以：<br>① 前台 `LS 'rsvp.mine'` 回訪時直接帶出上次答案並顯示感謝卡（既有行為）<br>② 後台名單自動標出「同名／同電話」的可能重複，並排顯示方便比對<br>③ **Phase 5 的正解**：invite 連結送出的回覆，文件 id 就用 `inviteId`（`rsvps/{inviteId}`）—— 沿用 butler 的「知道 id ＝ 通過驗證」，此時可以安全地開放**只針對 `events` 欄位的 update**，賓客就能自己改而不產生第二筆 |
| 14 | **賓客沒被邀請任何需 RSVP 的 Event** | 表單整塊隱藏，顯示「這幾場活動不需要事先回覆，我們現場見」＋ 婚禮流程。**不要顯示一個空表單** |
| 15 | **沒有任何 Event 需要 RSVP** | 同上，整個 RSVP 區塊消失。邀請函其餘部分（封面、故事、資訊、照片、hashtag）照常 |
| 16 | **Event 有自己的 custom questions** | `questions[]` ≤3、型態限死（choice ≤4 選項／text）。作答存 `events[id].answers`。後台統計只對 `choice` 型做分布，`text` 型只在名單與 CSV 呈現 |
| 17 | **同一位 Guest 的不同 Event 有不同題目** | 天然成立：題目掛在 Event 上、作答掛在 `events[eventId].answers`。前台在該活動卡展開時才渲染它自己的題目 |

---

## 8. Backward Compatibility

### 8.1 五道防線

| # | 機制 | 保證 |
|---|---|---|
| 1 | **不做 backfill** | production 資料一個 byte 都不動。`weddingEvents()` 在讀取時合成 |
| 2 | **鏡像原則**（3.4） | 頂層 `attending`／`guestCount`／`mealMeat`／`mealVeg`／`childSeat` 語意不變 → 排桌、收禮、CSV、既有統計、既有測試全部不用改 |
| 3 | **`multiEventEnabled` 旗標** | 沒開的站台（＝全部既有站台）後台完全不變 |
| 4 | **單一活動走既有程式碼路徑** | `events.length <= 1` → `mountSingle()` ＝ 現在的 `formHtml()`，一字不改 |
| 5 | **規則全部加法式** | 新欄位一律 `!('x' in d) \|\| ...`，舊的送出照樣通過 |

### 8.2 舊 → 新的對照

```
改版前                          改版後（同一份資料，不需要寫入）
────────────────────────────────────────────────────────────
sites/{id}                      sites/{id}
  eventDate    2026-10-18 18:00   （不動，仍是代表時間）
  venueName    ○○大飯店            （不動）
  venueAddress …                   （不動）
  venueMapUrl  …                   （不動）
                                  events: 沒有這個欄位
                                    → weddingEvents() 合成
                                      [{ id:'main', type:'reception',
                                         name:'婚宴', requiresRsvp:true,
                                         date/time/venue 全部來自左邊 }]

rsvps/{autoId}                  rsvps/{autoId}
  attending    true                （不動）
  guestCount   2                   （不動）
  mealVeg      1                   （不動）
                                  primaryEventId: 沒有 → 視為 'main'
                                  events: 沒有 → eventResponse() 從頂層合成
                                    'main' → { going:true, count:2, veg:1 }
                                    其他活動 → null（未回覆）
```

新人第一次在後台按「儲存婚禮流程」，才把合成出來的那一筆真的寫進 `events[]`。
**那是使用者主動觸發的 migration，不是我們偷偷改他的資料。**

### 8.3 部署順序（有硬性相依）

```
1. firestore.rules   加 events / primaryEventId / multiEventEnabled 白名單
                     ↓ 一定要先上，否則帶新欄位的送出會被整筆拒絕
2. common.js         weddingEvents() / eventResponse()（純讀取，對舊站台是 no-op）
3. 後台編輯器        （旗標關 → 看不到，等於沒上）
4. 前台多活動表單    （只有 events.length > 1 才走到）
5. 挑 1 組新站台開旗標試用
6. 確認後才開給既有站台
```

### 8.4 要補的測試

| 檔案 | 補什麼 |
|---|---|
| `tests/rules.test.mjs` | `events` map 可寫入／超過 10 筆被拒／夾帶未知欄位被拒／`primaryEventId` 長度；`events` list 在站台 update 的筆數上限 |
| `tests/multipage.mjs` | ① 沒有 `events` 的站台前台表單**與改版前完全一致**（回歸測試，最重要）② 3 個活動時送出 → Firestore 的 `events{}` 內容正確 ③ 舊 RSVP 在新後台統計表落進「待回覆」④ 刪掉活動後既有回覆不消失 |
| `tests/ui-consistency.mjs` | 活動卡沒有引入新的顏色／圓角／陰影 |

---

## 9. Implementation Plan

### Phase 1 — Data model（不碰畫面）

- `firestore.rules`：`isValidSiteContentUpdate` 加 `events`；`isValidRsvp` 加 `events`／`primaryEventId`
- `SPEC.md` 第 2 節補 `events[]` 與 RSVP 新欄位
- `scripts/set-pages.js` 加 `--multi-event on|off`
- `tests/rules.test.mjs` 補測試
- **驗收**：既有全部測試綠燈；新欄位寫得進去、超量被拒

### Phase 2 — 讀取層（純函式，對舊站台是 no-op）

- `common.js`：`weddingEvents()`、`eventResponse()`、`multiEventOn()`、
  `EVENT_TYPES` 字典（型別 → 中文名／英文 kicker／requiresRsvp 預設）
- `common.js`：`getEventStats(eventId)` → `{ yes, pending, no, heads }`
- **驗收**：既有站台呼叫 `weddingEvents()` 回傳 1 筆合成活動；前後台畫面**零變化**

### Phase 3 — Admin：活動編輯器

- `admin.html`：lobby 分頁加「婚禮流程」子分頁
- `admin.js`：活動卡列表、型別預設、↑↓ 排序、dirty 追蹤、undo 刪除、
  「從當日流程匯入」、刪除前的影響提示
- 婚禮資訊分頁：多活動開啟時場地三欄轉唯讀 ＋ 跳轉提示
- **驗收**：旗標關的站台看不到任何新東西；旗標開的站台可以建 3 個活動並存檔

### Phase 4 — 前台 RSVP

- `rsvp-form.js`：`mount()` 分岔；`mountMulti()`、活動卡、per-event 狀態、
  驗證、payload（含鏡像）、感謝卡逐條列出、回訪還原
- `invitation.js`：婚禮資訊區塊改成多活動時逐個列出（單一活動維持現狀）
- `css/rsvp.css`：`.rsvp-events` / `.ev-card` / `.ev-head`（只用既有 token）
- **驗收**：單一活動站台的 DOM 與改版前逐字相同（回歸）；
  3 活動站台送出後 Firestore 內容正確

### Phase 4b — Event 自訂題目（可選，可延後）

- `questions[]`（≤3、choice/text）的後台編輯 ＋ 前台渲染 ＋ CSV
- **只在確認 Phase 4 站得住之後才做**

### Phase 5 — Admin 統計與名單

- 各活動出席統計表（總覽頁上方）
- 名單的活動篩選 chips ＋ 各活動欄位 ＋ 抽屜的「各活動出席」
- CSV 動態欄位（`admin.js` 與 `scripts/export-rsvps.js` 兩邊同步）
- **驗收**：三個活動三個獨立分母；舊資料落在「待回覆」

### Phase 6 — Per-guest invitation access（獨立旗標，預設關）

- `sites/{id}/invites/{inviteId}` ＋ rules（`get` 開、`list` 關）
- 後台「賓客名單」子分頁：新增／匯入／per-event 勾選／複製專屬連結／批次全選
- 前台 `?i={inviteId}` 解析、只顯示被邀請的活動、姓名預填
- `rsvps/{inviteId}` 的 scoped update（讓賓客改得動自己的回覆而不產生第二筆）
- **驗收**：賓客 B 的連結看不到 After Party；公開連結行為完全不變

### Phase 7 — Migration & Testing

- 回歸測試（改版前後的單一活動站台 DOM 比對）
- 多活動 e2e（前台送出 → 後台統計 → CSV）
- 用 emulator 拿一份 production 的匿名化快照跑一次完整流程
- 挑 1 組真實新站台開旗標 pilot，兩週後再評估開給既有站台

---

## 10. UX 風險與判斷

| 風險 | 判斷 |
|---|---|
| **RSVP 變太複雜？** | 只有多活動的站台才會變。單一活動走原本的程式碼路徑，**畫面逐字相同**。這是靠架構保證的，不是靠自律 |
| **新人設定活動很麻煩？** | 預設只有一張已經填好的活動卡（從既有欄位帶出來）。要多辦才按「＋」。型別預設一鍵帶好名稱與英文 kicker |
| **賓客搞不懂「活動」？** | 卡片上寫的是**具體的事**（「基督教證婚・10/18 14:00・台北真理堂」），不是抽象的「活動 1」。台灣人對「證婚」「婚宴」「文訂」的認知本來就很清楚。真正要避免的是抽象詞彙，不是這個概念本身 |
| **只有一場婚宴時多了操作？** | 沒有。多活動路徑根本不會被觸發 |
| **多活動的 cognitive load？** | ① 只顯示需要 RSVP 的活動 ② 答完就收合 ③ ≥3 才給「全部參加」 ④ ≥4 才給進度 ⑤ 賓客資料只問一次（不是每個活動問一次） |
| **手機上 5 個以上活動？** | 收合 ＋ 進度行 ＋ sticky 送出鈕。答完的卡片一行 56px，5 個活動答完後整個區塊約 400px |
| **後台會不會變成 SaaS dashboard？** | 統計表只是一張 `.ad-table`，後台本來就是這個語言（`docs/UI-SPEC.md`）。**前台一個新顏色都不加** |
| **最大的真實風險** | **重複送出**（Case 13）。多活動明顯提高「先回一部分」的誘因，而 RSVP 目前不可修改。Phase 6 的 `rsvps/{inviteId}` ＋ scoped update 是正解；在那之前必須靠回訪帶出 ＋ 後台重複偵測撐住 |
| **第二大風險** | **新人建了活動卻忘了設 `requiresRsvp:false`**，於是「迎娶」也跑進表單。後台在型別是文訂／迎娶時預設關掉，並在儲存前提示「這個活動會出現在賓客的回覆表單上」 |

---

## 11. 明確不做的事

- ❌ 不建 `sites/{id}/events` 子集合（會變成平行系統，且每頁多一次讀取）
- ❌ 不新增 `address1/2/3`（第六節明確禁止，且擴充不了）
- ❌ 不自動把 `schedule[]` 轉成 `events[]`（語意不同，會產生垃圾活動）
- ❌ 不改 `allow update: if false`（除了 Phase 6 的 `rsvps/{inviteId}` scoped 例外）
- ❌ 不改頂層 RSVP 欄位的語意（鏡像原則）
- ❌ 不做通用 form builder（自訂題目限死兩種型態、每個活動 ≤3 題）
- ❌ 不做 per-event `rsvpDeadline` 進規則（規則讀不到陣列內容）
- ❌ 不動 Guest tags / Seat allocation / Butler 的既有行為
- ❌ 前台不引入任何新的顏色、圓角、陰影

---

## 12. 需要新人確認的決策

1. **`events[]` 放在站台文件（陣列）** —— 同意嗎？（vs. 子集合）
2. **鏡像原則**：頂層欄位永遠代表「主要活動」—— 同意嗎？這是相容性的地基
3. **Per-guest invitation access 放到 Phase 6、預設關閉** —— 接受嗎？
   （這是「賓客 B 看不到 After Party」的唯一正解，但也是最大的新增面）
4. **RSVP 維持不可修改**（Phase 6 才開 scoped update）—— 接受嗎？
5. **Event 自訂題目限死兩種型態、每個活動 ≤3 題** —— 夠用嗎？
6. **上限 10 個活動** —— 夠用嗎？
7. Phase 1–5 先做、Phase 6 之後再評估 —— 這個切法可以嗎？
