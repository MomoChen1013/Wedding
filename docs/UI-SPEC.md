# 後台 UI 設計規範

> 適用範圍：**新人後台 `/w/{slug}/admin`** 與 **收禮小幫手 `/butler`**。
> 兩頁載入同一份 `css/common.css` ＋ `css/admin.css`，用同一組 `.ad-*` 元件。
> 賓客頁（大廳、邀請函、抽卡、故事牆…）另有自己的視覺，不受這份文件約束。
>
> 這份文件寫的是**現在程式碼裡真的長這樣**的規格，不是願景。
> 改了元件就回來改這裡；這裡寫的和 CSS 不一樣時，以 CSS 為準並回報。

---

## 0. 為什麼需要這份文件

這套後台是一路長出來的：出席回覆先做、排桌管理後補、收禮小幫手最後才加。
每加一塊就多一份「差不多但不一樣」的東西 —— 八個搜尋框裡有三個是
`type="text"`（沒有清除鈕、手機鍵盤跳出「換行」、螢幕閱讀器唸不出來），
兩個抽屜的關閉鈕熱區各自寫了一次一模一樣的規則，
同一顆 `.ad-chip` 在後台是黑體、在收禮台是明朝體。

單看每一處都很小，合起來就是「這兩頁不像同一個產品」。
所以規則只有一條：

> **同一個功能 = 同一個 class = 同一份規格。**
> 需要新的樣子之前，先問「是不是既有元件的一個狀態或尺寸變體」。

---

## 1. 設計語彙（不要動的那幾條）

| 原則 | 具體做法 |
|---|---|
| 靠線條與留白撐層次 | 1px `--line`／`--line-soft`，不用色塊分區 |
| 陰影只給「浮起來」的東西 | 抽屜、彈窗、行內選單、toast、拖曳中的列。其餘一律無陰影 |
| 圓角極小 | `--radius: 2px`。只有膠囊（chip／tag／pill 按鈕）是 `999px` |
| 不用 emoji 當 UI 圖示 | 現有的 `✕ ＋ － ⋮ ↗` 是字元，不是圖示字型 |
| 動效克制 | 只有 ease-out，時長 150–260ms，不用 bounce／overshoot |
| 密度比賓客頁高 | 但字級不低於 11px，可輸入元件在觸控裝置一律 16px |

---

## 2. Design Token

### 2.1 色票（`common.css`，隨主題切換）

主題由 `<body data-theme="…">` 決定：`champagne`（預設）／`blush`／`sage`／`dusk`。
**元件一律只引用變數名，不要寫死色碼。**

| Token | 用途 |
|---|---|
| `--ink` `#2f2b26` | 主要文字、實心按鈕底、toast 邊框 |
| `--ink-soft` | 次要文字、metadata、時間戳、欄位名 |
| `--line` / `--line-soft` | 主線條 / 分隔線 |
| `--primary` / `--primary-deep` / `--primary-soft` | 主題色。**數字一律 `--primary-deep`** |
| `--bg1` / `--bg2` | 頁面底 / 次級底（表頭、唯讀欄位） |
| `--radius` `2px` / `--radius-sm` | 圓角 |

後台額外覆寫（`admin.css`，同時掛 admin 與 butler）：

```css
--ink-soft: #6f6459;   /* 4.51:1 → 5.53:1，後台有大量 11px metadata 吃它 */
```

**唯一寫死的色是「危險／錯誤」**，因為它不該跟著婚禮主題色跑：

| 情境 | 值 |
|---|---|
| 刪除、錯誤文字、`.ad-tag-no` | `#a4677a` |
| 錯誤 toast 底／字 | `#fdf6f7` / `#8a5765` |
| 離線橫幅 | `#8a5765` |

### 2.2 字體：雙軌

```
--font-display  Noto Serif TC   Editorial 軌 —— 「婚禮」的部分
--font-ui       system-ui …     UI 軌      —— 「工作」的部分（僅後台覆寫）
```

| 軌 | 用在哪 |
|---|---|
| **Editorial（明朝）** | 頁標題、區塊標題、彈窗／抽屜標題、大數字（`.ad-hero-num` `.ad-stat-num`）、空狀態標題、編號（`.ad-btcard-code` `.bt-code` `.sp-card-code`）、通行碼（`.ad-bt-pass` `.bt-pass`）、悄悄話內文 |
| **UI（sans）** | 表格、表單、按鈕、chip、tag、頁籤、清單列、分頁、toast、hint、metadata、時間戳 |

規則寫在 `admin.css` 尾段，選擇器一律是：

```css
body:is([data-page="admin"],[data-page="butler"]) .ad-xxx { … }
```

> **不要只掛 `[data-page="admin"]`。** 收禮台吃的是同一組元件，
> 只掛 admin 的結果就是同一顆按鈕在兩頁長出兩種字。
> `:is()` 取最高特異性的那一項，兩項都是 `[attr]`，所以特異性和
> 原本的 `body[data-page="admin"]` 完全相同（0,1,1），覆寫順序不會變。

### 2.3 Motion

| Token | 值 | 用在哪 |
|---|---|---|
| `--dur-hover` | 150ms | hover／顏色變化／小 pop |
| `--dur-btn` | 180ms | 按鈕、遮罩淡入 |
| `--dur-pop` | 200ms | 小卡進場、backdrop |
| `--dur-drawer` | 260ms | 抽屜、bottom sheet、toast 進場 |
| `--dur-page` | 200ms | 分頁切換 |
| `--ease` | `cubic-bezier(.22,1,.36,1)` | 全部（起手快、收尾慢） |

`prefers-reduced-motion: reduce` 時全部收成 **1ms**（不是 `0s` —— `0s` 在某些
瀏覽器連 `transitionend` 都不發，靠它收尾的程式會卡住），
`.ad-skel-line` 的 shimmer 改成靜態底色而不是停住。

### 2.4 遮罩與陰影

```css
--scrim-drawer : rgba(43,47,54,.2)   /* 抽屜：前提是背景要看得見 */
--scrim-nav    : rgba(43,47,54,.32)  /* 側邊選單 */
--scrim-modal  : rgba(43,47,54,.72)  /* 彈窗／裁切器：背景該退場 */
--shadow-pop        : 0 4px 14px rgba(43,47,54,.10)  /* 選單、tooltip、peek、toast、filtersum */
--shadow-drag       : 0 4px 12px rgba(43,47,54,.09)  /* 拖曳中的列（已 opacity:.55） */
--shadow-panel-blur / --shadow-panel-ink            /* 抽屜與側欄，方向各自給 */
```

色相**一律** `43,47,54`，只有濃度不同。新增浮層時引用 token，不要再調一組新的。

### 2.5 z-index 層級表

| 層 | z-index | 元件 |
|---|---|---|
| 頁內 sticky | 1–8 | 表頭、`.ad-list-head.is-sticky`、`.ad-filtersum`、`.ad-subtabs`、`.ad-savebar` |
| 固定底列 | 900 | `.sp-mobilebar` |
| 離線橫幅 | 940 | `.ad-offline` |
| 頂列 | 950 | `.ad-bar` |
| 帳號選單 | 960 | `.ad-acct-pop` |
| 側欄遮罩／側欄 | 990 / 1000 | `.ad-side-backdrop` / `.ad-side` |
| 懸浮小卡 | 1200 | `.sp-peek`、`.ad-nav-tip` |
| **抽屜遮罩／抽屜** | **1300 / 1310** | `.sp-drawer-mask` `.ad-drawer-mask` / `.sp-drawer` `.ad-drawer` |
| 行內選單 | 1400 | `.ad-rowmenu` |
| **彈窗** | **1450** | `.ad-modal-mask` |
| Toast | 1500 | `.ad-toast-stack` |
| 站內確認框 | 1550 | `#adModalMask`（可疊在其他表單彈窗上） |
| 裁切器 | 1600 | `.cr-mask` |

新增浮層時挑既有層級之間的數字，不要一路往上加。

### 2.6 由 JS 量出來的變數

sticky 的位置不能寫死（婚禮名稱換一行、離線橫幅出現，高度就變了）。
`admin.js` 與 `butler.js` 都會維護這三個：

| 變數 | 意義 |
|---|---|
| `--ad-bar-h` | 頂列高度 |
| `--ad-stick-top` | 頂列 ＋ 離線橫幅（sticky 的基準線） |
| `--ad-subtabs-h` | 窄螢幕子分頁列的高度（≥900px 時為 0） |

### 2.7 斷點

| 斷點 | 意義 |
|---|---|
| `≤899px` | 側欄變抽屜、子分頁列 sticky、頂列動作搬進抽屜（**butler 例外，見下**） |
| `≤600px` | 環狀圖單欄 |
| `≤560px` | 彈窗變 bottom sheet、統計格兩欄、按鈕全寬 |
| `≤960px` | 排桌工作區改單欄 |
| `(pointer:coarse)` | 觸控熱區 44px、可輸入元件 16px |
| `(hover:hover) and (pointer:fine)` | hover 效果、`:active` 位移 |

> **能力用 `hover`／`pointer` 判斷，不要用寬度猜** —— iPad 橫向有 1194px 的寬度，
> 但它是觸控裝置。

---

## 3. 元件目錄

### 3.1 按鈕 `.btn`

```html
<button class="btn" type="button">主要動作</button>
<button class="btn small" type="button">次要（區塊內）</button>
<button class="btn small ghost" type="button">第三順位</button>
```

| 變體 | 樣子 | 用在哪 |
|---|---|---|
| `.btn` | 實心 `--ink`、全寬、15px | 登入門、表單唯一的送出 |
| `.btn.small` | 自動寬、13.5px | 區塊標題列、彈窗、抽屜底部 |
| `.btn.ghost` | 透明底、`--line` 框 | 取消、匯出、次要動作 |
| `.btn.btn-google` | 白底 | 只有登入門 |
| `.btn.is-dirty` | 右上角一點 | 有未儲存的變更 |

- hover 是「亮度往上挪一階」（`#413c35`），**不是換一顆按鈕**。
- `≤560px` 彈窗裡的按鈕全寬堆疊；危險動作永遠在最右／最下。

### 3.2 文字按鈕 `.ad-edit` / `.ad-del`

一列尾端的「編輯／刪除」。視覺是無框文字，`(pointer:coarse)` 時靠 padding 把
熱區撐到 **44×44**，看起來一樣、按起來完全不同。

> 同一列有三個以上動作時，改用 `.ad-rowmenu-btn`（⋮），
> 不要並排三顆文字按鈕。

### 3.3 Chip `.ad-chip`（膠囊選擇器）

```html
<div class="ad-chips" id="…">
  <button class="ad-chip is-on" type="button" data-filter="all">全部</button>
  <button class="ad-chip"       type="button" data-filter="todo">未收</button>
</div>
```

- 未選：透明底 ＋ `--line` 框 ＋ `--ink-soft`
- 已選：`.is-on` → 實心 `--ink` ＋ 白字
- 容器變體：`.ad-chips-oneline`（固定顆數，放不下就左右滑）、
  `.ad-chips-clamp` ＋ `.ad-chips-more`（數量無上限，先露兩排）、
  `.ad-chips-sub`（次級一排，字小一號）
- `.ad-chip-link` 是虛線框 —— 它是**出口**（「設定標籤 ↗」），不是篩選條件
- `(pointer:coarse)` 最小高度 36px

Chip 也當 segmented control 用（收禮台的「禮餅：沒有發／已發送」、金額捷徑）。

### 3.4 標籤 `.ad-tag`（唯讀狀態 pill）

`.ad-tag-yes` `.ad-tag-maybe` `.ad-tag-no` `.ad-tag-guest`。
**永遠 `white-space:nowrap`** —— 膠囊一折行就完全不成形，
欄位擠不下時該讓欄位變寬。

### 3.5 表單

```html
<label class="ad-label" for="xxx">欄位名</label>
<input class="ad-input" id="xxx" type="text" maxlength="40" placeholder="例：王小明">
<div class="ad-hint">解釋這個欄位會影響什麼</div>
<div class="ad-field-err"></div>
```

| Class | 規格 |
|---|---|
| `.ad-label` | 11.5px／`.2em`／uppercase／`--ink-soft` |
| `.ad-input` `.ad-textarea` | 全寬、12px 14px、16px 字、focus 時邊框轉 `--ink` |
| `.ad-input-sm` | `max-width:130px`（數字欄位） |
| `.ad-input-time` | `<input type="time">` 專用寬度（瀏覽器會多畫 AM/PM 與時鐘） |
| `.ad-hint` | 11.5px `--ink-soft`，說明**後果**不是重複欄位名 |
| `.ad-field-err` | `#a4677a`，`:empty` 時不佔高度 |
| `.ad-check` | checkbox ＋ 文字，`accent-color: --primary-deep` |
| `.ad-sub-sec` | 表單裡的小節：左邊一道細線，**不是一張卡** |

> 輸入框的字級固定 16px：iOS Safari 只要聚焦 <16px 的欄位就會把整頁放大，
> 之後版面往右偏，使用者得自己雙指縮回來。

---

### 3.6 搜尋框 `.ad-filter`

**後台只有這一種搜尋框。** 八個地方在用它：

| 位置 | id | 尺寸 | 黏頂 |
|---|---|---|---|
| 出席回覆 | `adRsvpFilter` | 預設（`.ad-filterbar-search`） | — |
| 悄悄話信箱 | `adInboxFilter` | 預設 | — |
| 桌次名單 | `adSeatFilter` | 預設 | — |
| 感謝信 | `adLetterFilter` | 預設 | — |
| 收禮明細（後台） | `adBtFilter` | 預設 | ✔ |
| 排桌・未安排名單 | `spSearch` | `.ad-filter-sm`＋`.sp-search` | — |
| 收禮台・賓客名單 | `btSearch` | 預設 | ✔ |
| 收禮台・收禮紀錄 | `btLogSearch` | 預設 | ✔ |

#### HTML 樣板（八個一字不差）

```html
<input class="ad-filter" id="xxxFilter" type="search"
       inputmode="search" enterkeyhint="search" autocomplete="off"
       placeholder="搜尋名字、備註、記錄者…" aria-label="搜尋收禮紀錄">
```

| 屬性 | 少了會怎樣 |
|---|---|
| `type="search"` | 沒有原生清除鈕（✕），語意也不對 |
| `inputmode="search"` | 手機鍵盤右下角是「換行」不是「搜尋」 |
| `enterkeyhint="search"` | 同上 |
| `autocomplete="off"` | 瀏覽器存的姓名地址會蓋住下面的清單 |
| `aria-label` | 螢幕閱讀器只唸得到 placeholder —— 而 placeholder 一打字就消失 |

#### JS 樣板

```js
['input', 'search'].forEach(evt => {
  el.addEventListener(evt, () => { pager.page = 1; render(); });
});
```

> **兩個事件都要接。** `type="search"` 右邊那顆原生清除鈕（✕）在 Safari
> 只發 `search`、不發 `input`。少接一個就會出現「按了 ✕、字消失了、
> 清單卻還篩著」—— 使用者會以為資料不見了。

#### 其他規則

- 比對一律經過 `normKey()`（去空白、全形轉半形、英文轉小寫）。
  butler 不載入 `common.js`，自己有一份**完全相同**的實作。
- 有分頁的清單，搜尋後 `pager.page = 1`。
- 尺寸只有兩種：預設（8px 12px／13px）與 `.ad-filter-sm`（7px 10px／12.5px，
  塞在窄欄裡時用）。**不要再長第三種。**
- 原生外觀已在 CSS 歸零（iOS 會強制畫成膠囊、桌面 Safari 會多一顆放大鏡），
  清除鈕維持原生但縮到與字級相稱，`(pointer:coarse)` 時放大到 19px。
- 文案格式：**`搜尋 A、B、C…`**。不要寫「在名單裡找…」這種另一套動詞。
- `.ad-list-head.is-sticky` 只給「婚宴當天要邊捲邊找人」的三處（見上表）。
  其餘不要黏 —— 黏太多就等於沒有重點。

#### 三種搜尋容器

| 容器 | 什麼時候用 |
|---|---|
| `.ad-list-head` | 只有搜尋（＋筆數或一排 chip）。最常見 |
| `.ad-filterbar` | 搜尋 ＋ 兩排以上的篩選條件。透明底 ＋ 一圈淡框（它是一組控制項，不是一張卡）；搜尋放**第一排** |
| `.ad-filtersum` | 搭配 `.ad-filterbar` 的「現在篩掉了什麼」，sticky ＋ 一顆「清除」 |

> `.ad-filterbar` 的篩選條件超過一排時**一定要**配 `.ad-filtersum`：
> 手機上三排 chip 會整個捲出畫面，沒有這一條使用者會以為資料不見了。

---

### 3.7 清單 `.ad-list` / `.ad-item`

```html
<div class="ad-list">
  <div class="ad-item">
    <div class="ad-item-main">
      <span class="ad-item-title">王小明</span>
      <span class="ad-item-sub">B01・第 3 桌</span>
    </div>
    <div class="ad-item-actions">…</div>
  </div>
</div>
```

- 一列一件事，`--line-soft` 分隔，**沒有框**。
- 整列可點時把 `.ad-item` 換成 `<button class="ad-item">`（收禮台就是這樣），
  記得歸零 border 並保持 `font-family: var(--font-ui)`。
- `.ad-list-panel` 是唯讀數字清單的變體（白底 ＋ 框），
  和統計方格站在一起時才用 —— 不然同一頁上兩塊有框、第三塊突然沒有。

### 3.8 表格 `.ad-table` / `.ad-tablewrap`

- 表頭 sticky、`--bg2` 底、11.5px `--ink-soft`。
- `.ad-tablewrap` 是一張白底的面（會列數字的地方才有面）。
- 窄螢幕改成卡片（`.ad-rcard` 出席回覆／`.ad-btcard` 收禮明細），
  切換由 JS 的 `onNarrowChange()` 驅動。

### 3.9 數字面板

**規則只有一條：要拿來比對的數字，站在一張白底圓角的面上；其餘只留線。**

| Class | 用途 |
|---|---|
| `.ad-hero-stat` ＋ `.ad-hero-num` | 唯一的主數字（禮金總額、總回覆）。`clamp(34px,11vw,84px)`、`tabular-nums` |
| `.ad-stats` ＋ `.ad-stat` | 統計方格。預設四欄，`.ad-stats-2` `.ad-stats-3` 變體；格線是 `gap:1px` 透出底色 |
| `.ad-donuts` ＋ `.ad-donut` | 環狀圖群組 |

數字一律 `--primary-deep` ＋ `font-variant-numeric: tabular-nums`。

### 3.10 分頁 `.ad-pager`

RSVP／桌次名單／悄悄話／感謝信／收禮明細共用。
**任何可能長到 100 筆以上的清單都要有** —— 婚宴當天 300 筆一次畫出來，
手機捲起來會卡。

### 3.11 導覽

| Class | 說明 |
|---|---|
| `.ad-bar` | 頂列，sticky ＋ 毛玻璃。butler 沒有側欄，所以 `.ad-bar-actions` 在窄螢幕**不隱藏**（`butler.css` 覆寫） |
| `.ad-side` / `.ad-tab` | 側欄選單。≥900px 常駐、<900px 變抽屜（見 3.13） |
| `.ad-subtabs` / `.ad-subtab` | 分頁內部的橫向子分頁。可橫捲，邊緣用遮罩漸層暗示「右邊還有」；`data-count="2\|3"` 時窄螢幕排成等寬 segmented control |
| `.ad-navgroup` | 側欄裡的可摺疊群組 |

---

### 3.12 詳細抽屜 `.ad-drawer` / `.sp-drawer`

**同一個元件，兩個消費者，一份 CSS。**

| 選擇器 | 誰在用 | 產生方式 |
|---|---|---|
| `.sp-drawer` | 排桌的賓客詳細資料 | `admin.html` 靜態標記，`seating-plan.js` 填值 |
| `.ad-drawer` | 出席回覆詳情、收禮明細詳情 | `admin.js` 的 `Drawer` 模組動態建立 |

#### 規格（兩邊完全共用選擇器）

| 項目 | 值 |
|---|---|
| 寬度 | `min(92vw, 400px)`，從右邊滑出 |
| 底色 / 邊 | `--bg1` ＋ 左側 1px `--line` |
| 陰影 | `-4px 0 var(--shadow-panel-blur) var(--shadow-panel-ink)` |
| 遮罩 | `--scrim-drawer`（.2）—— **背景頁面必須保持可見**，那是這個元件的前提 |
| 進場 | `translateX(18px)` ＋ 透明度，`--dur-drawer` |
| 結構 | `-head`（標題／副標／✕）→ `-body`（可捲）→ `-foot`（CTA 貼底） |
| 關閉鈕 | `✕`，`aria-label="關閉"`，`(pointer:coarse)` 時 44×44 |
| 底部 | `-foot` 永遠貼底 ＋ `env(safe-area-inset-bottom)`，不用捲到最後才按得到儲存 |

#### 必備行為（缺一個就是 bug）

1. `role="dialog"` ＋ `aria-modal="true"` ＋ `aria-label`。
2. **三條關閉路徑**：✕、點遮罩、`Esc`。
3. **註冊進 layer stack**（`admin.js` 的 `pushLayer()`／`popLayer()`；
   收禮台沒有抽屜，但它的 bottom sheet 走同一套，用自己那份
   `pushSheetLayer()`／`popSheetLayer()`）。它負責三件手機上一定會踩到的事：
   - Android 實體返回鍵／iOS 邊緣手勢 = 關掉這一層，**不是離開後台**
   - 背景鎖捲（iOS 上 `overflow:hidden` 鎖不住，要 `position:fixed`）
   - `Esc` 走同一條路徑，桌機與手機的關法才是同一件事

   `.ad-drawer` 在 `open()` 裡自己推一層；`.sp-drawer` 是靜態標記，
   由 `watchLayer()` 觀察 `[hidden]` 自動推退。
4. 開啟時把焦點交進這一層：
   - 唯讀抽屜 → 焦點給關閉鈕（鍵盤使用者一按 Enter 就回得去）
   - 編輯表單抽屜 → 焦點給第一個欄位
5. 資料變動時**就地更新內容**（`Drawer.setBody()`），不要整個重開 ——
   重開會把捲動位置與焦點都丟掉。

#### 內容排版

```html
<div class="ad-drawer-rows">
  <div class="ad-drawer-row"><span>出席回應</span><b>熱情出席</b></div>
</div>
<div class="ad-drawer-sec">
  <div class="ad-drawer-sec-title">標籤</div>
  …
</div>
```

### 3.13 側邊選單抽屜 `.ad-side`（<900px）

和詳細抽屜**不是同一個元件**，不要互相抄規格：

| | 詳細抽屜 | 側邊選單 |
|---|---|---|
| 從哪來 | 右 | 左 |
| 開關方式 | `[hidden]` ＋ animation | `.is-open` ＋ transform transition（桌機常駐，不能用 hidden） |
| 遮罩 | `--scrim-drawer` .2 | `--scrim-nav` .32 |
| 關閉 | ✕／遮罩／Esc | `.ad-side-close`（左上）／backdrop／Esc |

`.ad-side-close` 存在的理由：抽屜的不透明底色會蓋住漢堡鈕，而手機沒有 Esc 可以按。

### 3.14 彈窗 `.ad-modal-*` / bottom sheet

```html
<div class="ad-modal-mask" id="xxxMask" hidden>
  <div class="ad-modal-card ad-modal-card-form">
    <div class="ad-modal-title">標題</div>
    <div class="ad-modal-msg">一句話說明後果</div>
    <form class="ad-form">…
      <div class="ad-modal-actions">
        <button class="ad-del" type="button" hidden>刪除</button>
        <button class="btn small ghost" type="button" data-close="1">取消</button>
        <button class="btn small" type="submit">儲存</button>
      </div>
    </form>
  </div>
</div>
```

- `min(92vw, 420px)`、白底、1px 框、`--scrim-modal`（.72）。
- `.ad-modal-card-form` 是可捲的 → `.ad-modal-actions` **sticky 在卡片底部**。
- `≤560px` 自動變 bottom sheet：貼底、上緣一條 drag handle、可往下滑關掉
  （手勢只從最上緣 44px 起手，不然會和內容捲動打架）。
- `.is-danger` 讓標題轉危險色。
- 每一個 `.ad-modal-mask` 都由 `bindAllLayers()` 自動註冊 layer。

### 3.15 Toast `.ad-toast`

`.ad-toast-stack` 固定在底部置中、可疊。白底 ＋ `--ink` 框 ＋ `--shadow-pop`；
`.is-error` 轉粉底 ＋ 危險色。可帶一顆 `.ad-toast-action`（例如「重試」）。

> 寫入逾時的文案是「**還沒送出去**」不是「存檔失敗」——
> Firestore 的佇列還在，連線回來會自己補送；講成失敗會害使用者再記一次。

### 3.16 空狀態 `.ad-empty` / 骨架 `.ad-skel`

兩者**必須分得開**：

- `.ad-skel`：第一筆 snapshot 回來**之前**。同時筆數要顯示 `目前 — 筆` 而不是 `0 筆`
  （`0 筆` 和「真的還沒有資料」長得一模一樣）。
- `.ad-empty`：真的沒有資料。`.is-rich` 變體帶虛線框 ＋ 標題 ＋ 一顆 CTA。

### 3.17 行內選單 `.ad-rowmenu`（⋮）

「編輯」和「刪除」原本只隔 10px，拇指一按很容易點錯。
三個以上的列動作收進這一顆：危險動作排最後、用危險色，
可排序的清單在這裡提供「上移／下移／移到最前／移到最後」（觸控沒有拖曳可用）。

### 3.18 其他

| Class | 用途 |
|---|---|
| `.ad-callout` | 左邊一道 `--primary-deep` 粗線的說明／開關區塊 |
| `.ad-savebar` | 長表單的 sticky 儲存列（毛玻璃，含 `env(safe-area-inset-bottom)`） |
| `.ad-offline` | 離線橫幅，sticky 在頂列下面，`role="status"` |
| `.ad-eye` | 「顯示／隱藏金額」的開關 pill |
| `.ad-progress` | 上傳進度 |
| `.ad-info` | 唯讀的「名稱：值」清單 |
| `.cr-*` | 圖片裁切器（`cropper.js` 動態插入，`≤560px` 一樣貼底） |

---

## 4. 無障礙基準線

| 項目 | 規則 |
|---|---|
| 焦點 | `:focus-visible` → 2px `--primary-deep` ＋ 2px offset。輸入框改成邊框轉深 ＋ 2px `--primary-soft` 內光。**兩頁都有**（規則掛 `body:is(admin, butler)`） |
| 觸控熱區 | `(pointer:coarse)` 一律 ≥44×44（chip／pager 36–40 為例外，它們本身有間距） |
| 對比 | 小字的次要色用 `#6f6459`（5.53:1）；最小字級 11px |
| 圖示按鈕 | 一定要 `aria-label`（`✕` → `關閉`，`⋮` → `更多`） |
| 搜尋框 | 一定要 `aria-label`（placeholder 不是標籤） |
| 浮層 | `role="dialog"` ＋ `aria-modal="true"`，Esc 關得掉，返回鍵關得掉 |
| 動效 | 尊重 `prefers-reduced-motion` |
| 狀態列 | 離線橫幅 `role="status"` |

---

## 5. 這份規範由測試守著

```bash
npm run test:ui        # tests/ui-consistency.mjs（只需要 hosting emulator）
```

擋下最容易默默漂掉的六項：

| 檢查 | 為什麼是它 |
|---|---|
| 雙軌字體 | `.btn`／`.ad-filter` 在兩頁要同一種字；`#btPass` 要留在 Editorial 軌（那是規格，不是漏網之魚） |
| `--ink-soft` | 兩頁都要是後台那一階（5.53:1） |
| 焦點框 | 收禮台的 `.ad-input` 聚焦要有訊號 |
| 搜尋框 | 八個都在，每一個六項屬性齊全、placeholder 以「搜尋」開頭 |
| 抽屜 | `.sp-drawer` 的尺寸、層級、dialog 語意、遮罩、CTA 貼底 |
| 遮罩 | 側欄／彈窗／抽屜三個濃度、同一支冷灰 |

> 測試不需要 Firestore，頁面停在登入門也跑得完 —— 它量的是 CSS 與 HTML 屬性。
> 加了新元件就順手加一條，不然這份文件會在三個月後變成考古資料。

---

## 6. 加新東西之前

1. **先找既有元件。** 大部分「新需求」是既有元件的一個狀態或尺寸變體。
2. 真的要新的 → 想清楚它屬於哪一軌字體、哪一個 z-index 層、
   要不要註冊 layer、觸控熱區夠不夠。
3. 顏色、時長、遮罩、陰影**一律引用 token**，不要寫字面值。
4. 只有一個頁面需要的排版，寫在該頁自己的 CSS（`butler.css`）；
   **視覺語彙不要在那裡長出新的**。
5. 兩個頁面都吃的元件規則，選擇器寫
   `body:is([data-page="admin"],[data-page="butler"])`。
6. 改完回來更新這份文件。

---

## 7. 已知落差（還沒做，不是不用做）

| 項目 | 現況 |
|---|---|
| `.ad-modal-mask` 的 dialog 語意 | 16 個彈窗（後台 14 ＋ 收禮台 2）都沒有 `role="dialog"`／`aria-modal`；抽屜兩個都有了。要補就一次補齊，不要補一半 |
| 焦點歸還 | 抽屜／彈窗關閉後沒有把焦點還給觸發它的那顆按鈕 |
| `.ad-side` 的 `inert` | <900px 收起來時只是 transform 移出畫面，內容仍可被 Tab 到 |
| layer stack 兩份實作 | `admin.js` 的 `pushLayer()` 與 `butler.js` 的 `pushSheetLayer()` 邏輯相同（butler 不載入 `admin.js`）。改一邊要記得改另一邊 |
| `normKey()` 兩份實作 | 同上（butler 不載入 `common.js`），內容必須保持一字不差 |
