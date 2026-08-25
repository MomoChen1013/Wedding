# 後台 UI 設計規範

> 適用範圍：**新人後台 `/w/{slug}/admin`** 與 **收禮小幫手 `/butler`**。
> 兩頁載入同一份 `css/common.css` ＋ `css/admin.css`，用同一組 `.ad-*` 元件。
> 賓客頁（大廳、邀請函、抽卡、故事牆…）另有自己的視覺，不受這份文件約束。
>
> 這份文件寫的是**現在程式碼裡真的長這樣**的規格，不是願景。
> 改了元件就回來改這裡；這裡寫的和 CSS 不一樣時，以 CSS 為準並回報。
>
> 色票、圓角、字級與 §3.1／3.2／3.3／3.8／3.9／3.10／3.14／3.20 的數值
> 來自 `UI_Spec_Custom.md`（2026-08-25 匯出）。該檔沒有提到的部分
> （彈窗、抽屜、搜尋框、清單、表格、數字面板…）維持原本的規格。

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
| 圓角克制 | 後台 `--radius: 4px`（賓客頁 `2px`）。只有膠囊（chip／tag／pill 按鈕）是 `999px` |
| 不用 emoji 當 UI 圖示 | 現有的 `✕ ＋ － ⋮ ↗` 是字元，不是圖示字型 |
| 動效克制 | 只有 ease-out，時長 150–260ms，不用 bounce／overshoot |
| 密度比賓客頁高 | 但字級不低於 11px，可輸入元件在觸控裝置一律 16px |

---

## 2. Design Token

### 2.1 色票

**元件一律只引用變數名，不要寫死色碼。**

賓客頁與後台吃的是兩套：

- **賓客頁**：`common.css` 的主題色票，由 `<body data-theme="…">` 決定
  （`champagne`／`blush`／`sage`／`dusk`），新人可以自己換。
- **後台與收禮台**：`admin.css` 在 `body:is([data-page="admin"],[data-page="butler"])`
  這一層給定值。兩頁的 `data-theme` 都寫死 `champagne`、**不提供主題切換**，
  所以工作介面不需要跟著跑，直接定色比較穩。

| Token | 值 | 用途 |
|---|---|---|
| `--ink` | `#2f2b26` | 主要文字、實心按鈕底、可點浮層的框 |
| `--ink-soft` | `#6a5e53` | 次要文字、metadata、時間戳、欄位名 |
| `--primary` | `#e2bd79` | 淺色強調 |
| `--primary-deep` | `#ca9a21` | **所有數字**、通行碼、pill 文字 |
| `--primary-soft` | `#f0e6d0` | 焦點內光、選中的淡底 |
| `--bg1` | `#faf8f4` | 頁面底 |
| `--bg2` | `#f2ede4` | 次級底（表頭、唯讀欄位、hover、骨架） |
| `--line` | `#c8bfb0` | 主線條、卡片外框 |
| `--line-soft` | `#d9d1c4` | 分隔線 |

線條是**定值不是半透明**：舊的 `rgba(47,43,38,.18/.09)` 會跟著底色變，
同一條線在白卡和 `--bg2` 面板上是兩個深淺；定值就是同一條線。

#### 量過的對比（WCAG AA 需 4.5:1，大字 3:1）

| 組合 | 比值 | |
|---|---|---|
| `--ink` 於 `--bg1` | 13.25:1 | ✅ |
| `--ink-soft` 於 `--bg1` | 5.93:1 | ✅ |
| `--ink-soft` 於 `--bg2` | 5.39:1 | ✅ |
| `--ink-soft` 於 `#fff` | 6.29:1 | ✅ |
| **`--primary-deep` 於 `#fff`** | **2.57:1** | ❌ 見「已知落差」 |

**唯一寫死的色是「危險／錯誤」**，因為它不該跟著任何色票跑：

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

### 2.3 圓角與字級

| Token | 值 | 備註 |
|---|---|---|
| `--radius` / `--radius-sm` | `4px` | 後台層。賓客頁仍是 `2px` |
| 基礎字級 | `14px` | 後台的 `body` |
| 小字級 | `12px` | metadata、pill、chip |
| 最小字級 | `11px` | 分頁器。**不要再往下** |
| 輸入框字級 | `16px` | 固定，見 3.6 |

膠囊（chip／tag／pill）維持 `999px`，不吃 `--radius`。

### 2.4 Motion

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

### 2.5 遮罩與陰影

```css
--scrim-drawer : rgba(43,47,54,.2)   /* 抽屜：前提是背景要看得見 */
--scrim-nav    : rgba(43,47,54,.32)  /* 側邊選單 */
--scrim-modal  : rgba(43,47,54,.72)  /* 彈窗／裁切器：背景該退場 */
--shadow-pop        : 0 4px 14px rgba(43,47,54,.10)  /* 選單、tooltip、peek、toast、filtersum */
--shadow-drag       : 0 4px 12px rgba(43,47,54,.09)  /* 拖曳中的列（已 opacity:.55） */
--shadow-panel-blur / --shadow-panel-ink            /* 抽屜與側欄，方向各自給 */
```

色相**一律** `43,47,54`，只有濃度不同。新增浮層時引用 token，不要再調一組新的。

### 2.6 z-index 層級表

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

### 2.7 由 JS 量出來的變數

sticky 的位置不能寫死（婚禮名稱換一行、離線橫幅出現，高度就變了）。
`admin.js` 與 `butler.js` 都會維護這三個：

| 變數 | 意義 |
|---|---|
| `--ad-bar-h` | 頂列高度 |
| `--ad-stick-top` | 頂列 ＋ 離線橫幅（sticky 的基準線） |
| `--ad-subtabs-h` | 窄螢幕子分頁列的高度（≥900px 時為 0） |

### 2.8 斷點

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

先看這張表：**要做的事** → **該用的元件**。找不到對應的再往下讀規格。

| 要做的事 | 元件 |
|---|---|
| 送出、取消、匯出 | `.btn`（3.1） |
| 只有一個圖示的動作（✕ ☰ ⋮ ↑↓） | 圖示按鈕（3.2） |
| 一列尾端的編輯／刪除 | `.ad-edit` `.ad-del`（3.3） |
| 「展開全部」「清除」「顯示金額」 | pill／底線文字按鈕（3.3） |
| 篩選、切換一組互斥選項 | `.ad-chip`（3.4） |
| 顯示唯讀狀態 | `.ad-tag`（3.5） |
| 收集輸入 | 表單（3.6） |
| 在清單裡找東西 | `.ad-filter`（3.7） |
| 切換畫面 | Tab（3.8） |
| 點一顆按鈕掉出一疊動作 | 選單（3.9） |
| 把一筆資料包成一塊 | 卡片（3.10） |
| 一行一件事 | `.ad-item`（3.11） |
| 多欄要對齊比較 | `.ad-table`（3.12） |
| 給數字一張面 | 數字面板（3.13） |
| 看一筆的完整內容／就地修改 | 抽屜（3.16） |
| 需要當下回答的問題 | 彈窗（3.18） |
| 告知結果 | Toast（3.19） |

---

### 3.1 按鈕 `.btn`

```html
<button class="btn" type="button">主要動作</button>
<button class="btn small" type="button">次要（區塊內）</button>
<button class="btn small ghost" type="button">第三順位</button>
```

| 變體 | 樣子 | 用在哪 |
|---|---|---|
| `.btn` | 實心 `--ink`、全寬、**16px**、padding **10/22** | 登入門、表單唯一的送出 |
| `.btn.small` | 自動寬、**14px**、padding **8/20** | 區塊標題列、彈窗、抽屜底部 |
| `.btn.ghost` | 透明底、`--line` 框 | 取消、匯出、次要動作 |
| `.btn.btn-google` | 白底 | 只有登入門 |
| `.btn.is-dirty` | 右上角一點 | 有未儲存的變更 |
| `.btn.is-saving` | `opacity:.55` ＋ `cursor:progress` | 寫入中 |

- hover 是「亮度往上挪一階」（`#413c35`），**不是換一顆按鈕**。
- `:active` 往下沉 `.5px`。位移刻意極小，要的是「這一下有被接到」。
- 尺寸只在後台層覆寫：`common.css` 的 `.btn` 賓客頁也在用，不要動那一份。
- `≤560px` 彈窗裡的按鈕全寬堆疊；危險動作永遠在最右／最下。

---

### 3.2 圖示按鈕

只有一個字元、沒有文字標籤的按鈕。**每一顆都必須有 `aria-label`。**

| 元件 | 圖示 | 桌機 | 觸控 | 框 |
|---|---|---|---|---|
| `.ad-menu-btn` | ☰（三條 16×1px 線） | **36×36** | **44×44** | 1px `--line` ＋ radius |
| `.ad-side-close` | ✕ | 44×44／**16px** | 44×44／**24px** | 1px `--line` ＋ radius |
| `.ad-drawer-close` `.sp-drawer-close` | ✕ | padding 2/4・**16px** | 44×44／**24px** | 無框 |
| `.sp-touch-tip-close` | ✕ | —（只在觸控出現） | 44×44／**24px** | 無框 |
| `.ad-rowmenu-btn` | ⋮ | **36×36**／16px | 44×44／18px | 透明框，hover 才顯 `--line` |
| `.sp-move-btn` `.ad-sch-move [data-sch-move]` | ↑ ↓ ⇤ ⇥ | **36×36**／13px | **44×44** | 1px `--line` ＋ radius |
| `.sp-card-move` | ↔ | **36×36**／16px | 同左（只在觸控出現） | 透明框，`:active` 才顯 |
| `.ad-drag-handle` | ⠿ | 16px | — | 無框，`cursor:grab`／`grabbing` |

三條規則：

1. **桌機一律 36×36、觸控一律 44×44。** 熱區不能省 ——
   一顆按不到的關閉鈕等於這一層關不掉。
2. **✕ 的字級只有兩個值**：桌機 16px、觸控 24px。四顆 ✕ 都吃這一組。
3. **框的有無看它站在哪**：站在一張面上（抽屜的 head、選單列）不用框，
   站在內容上（頂列的 ☰、抽屜左上的 ✕、排序的 ↑↓）要框，不然看不出是按鈕。

> `.sp-move-btn` 與 `.ad-sch-move` 已經共用同一條宣告 —— 桌位管理和當日流程
> 的排序鈕做的是同一件事，就該長得一樣。新加的排序鈕請併進那一條，
> 不要再抄一份 36×36。

---

### 3.3 文字按鈕

沒有實心底的按鈕，分三種。**選錯一種，使用者就分不出「這是動作」還是「這是狀態」。**

#### (a) 底線文字按鈕 `.ad-edit` / `.ad-del`

一列尾端的「編輯／刪除」。12px、`--ink-soft`、`border-bottom:1px solid transparent`；
hover 時線與字一起變深（刪除變 `#a4677a`），觸控沒有 hover 所以改成 `:active` 給回饋。
`(pointer:coarse)` 靠 padding 把熱區撐到 **44×44**，視覺不變。

> 同一列有三個以上動作時，改用 `.ad-rowmenu-btn`（⋮），不要並排三顆。
> `.ad-item-actions` 在觸控時 `gap:16px`；已經收進 ⋮ 的那幾份反而收緊到 `gap:4px`。

#### (b) 底線「展開」按鈕 `.ad-chips-more` / `.sp-warn-more`

無框、`border-bottom:1px solid var(--line)`、11.5px。
用在「還有更多、點開來看」——它不是動作，是**視野的開關**。
`.sp-warn-more.has-warn` 右上角補一顆紅點：收起來的那幾項裡有要處理的。

#### (c) Pill 文字按鈕

膠囊外框（`999px` ＋ 1px `--line`），用在**一個獨立的小開關**。尺寸只有兩階：

| 階 | 字級 | min-height | 誰在用 |
|---|---|---|---|
| 獨立 | 12px | **32px** | `.ad-filtersum-clear`（清除篩選）、`.ad-rcard-more`（展開更多）、`.ad-chip`（觸控時 32） |
| 嵌在一行文字裡 | 12px | **28px** | `.ad-eye`（顯示金額，永遠 28）、`.ad-th-link`（表頭的「標籤」，觸控時 28） |

> 不要再發明第三階。要一顆新的 pill，先問它是獨立的還是嵌在一行字裡。

---

### 3.4 Chip `.ad-chip`（膠囊選擇器）

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

Chip 也當 segmented control 用（收禮台的「禮餅：沒有發／已發送」、金額捷徑）。
和 Tab 的分工：**Chip 篩的是同一份清單的內容，Tab 換的是整個畫面。**

---

### 3.5 標籤 `.ad-tag`（唯讀狀態 pill）

`.ad-tag-yes` `.ad-tag-maybe` `.ad-tag-no` `.ad-tag-guest`。
**永遠 `white-space:nowrap`** —— 膠囊一折行就完全不成形，欄位擠不下時該讓欄位變寬。

> 和 pill 按鈕長得像，但**不可點**。可點的東西一定要有 hover／active 反應，
> `.ad-tag` 一個都沒有 —— 那就是兩者唯一的區別，不要弄反。

---

### 3.6 表單

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

### 3.7 搜尋框 `.ad-filter`

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
- 尺寸只有兩種：預設（8px 12px／13px）與 `.ad-filter-sm`（7px 10px／12.5px）。
- 原生外觀已在 CSS 歸零，清除鈕維持原生但縮到與字級相稱，觸控放大到 19px。
- 文案格式：**`搜尋 A、B、C…`**。不要寫「在名單裡找…」這種另一套動詞。
- `.ad-list-head.is-sticky` 只給「婚宴當天要邊捲邊找人」的三處（見上表）。

#### 三種搜尋容器

| 容器 | 什麼時候用 |
|---|---|
| `.ad-list-head` | 只有搜尋（＋筆數或一排 chip）。最常見 |
| `.ad-filterbar` | 搜尋 ＋ 兩排以上的篩選條件。透明底 ＋ 一圈淡框；搜尋放**第一排** |
| `.ad-filtersum` | 搭配 `.ad-filterbar` 的「現在篩掉了什麼」，sticky ＋ 一顆「清除」 |

> `.ad-filterbar` 的篩選條件超過一排時**一定要**配 `.ad-filtersum`：
> 手機上三排 chip 會整個捲出畫面，沒有這一條使用者會以為資料不見了。

---

### 3.8 Tab

兩種，**共用同一套「選中」的語彙**：白底 ＋ 字重 500 ＋ 一道 `--primary-deep` 的定位線。

| | `.ad-tab`（側欄・直式） | `.ad-subtab`（分頁內・橫式） |
|---|---|---|
| 位置 | `.ad-side`，≥900px 常駐 | `.ad-subtabs`，緊貼內容上方 |
| 字級 | **14px**／`.14em` | **14px**／`.14em` |
| 內距 | 11px 14px（`padding-left:14px` 補回線寬） | 11px 20px |
| 未選 | 透明底、`--ink-soft`、`border-left:2px transparent` | `rgba(255,255,255,.45)`、1px `--line` 框、`--ink-soft` |
| hover | `--ink` ＋ 半透明白底 | `--ink` ＋ 白底 |
| **選中** | 白底 ＋ `font-weight:500` ＋ **左邊 2px** `--primary-deep` | 白底 ＋ `font-weight:500` ＋ **下面 3px** `--primary-deep` |
| 面板 | `.ad-panel.is-on` | `.ad-subpanel.is-on` |

線寬不同是刻意的：

- 側欄 **2px**。未選時是同寬的透明邊、`padding-left` 少 1px 補回來，
  切分頁時字不會左右跳。
- 橫式子分頁 **3px** —— 它要接上 `.ad-subtabs` 那條底線，所以
  **三個數字要一起改**：`.ad-subtabs` 的 `border-bottom`、`.ad-subtab` 的
  `border-bottom` 與 `margin-bottom`（負值）。只改一個就會對不齊。

> `.ad-tab` 的 `transition` 含 `font-weight`，不要當成沒用到的屬性刪掉。
> `.ad-tab.is-on` 在檔案裡出現兩次：前面那條是基礎，**真正生效的是
> 「側欄導覽」那一段的覆寫**。改 active 的樣子要改後面那一條。
>
> 窄螢幕（≤899px）另有一條把 `.ad-subtab` 收到 12.5px 的密度覆寫 ——
> 上表是桌機規格。

- 兩者的 hover 都包在 `@media (hover:hover) and (pointer:fine)` 裡 ——
  觸控裝置上 hover 會「黏住」，看起來像選錯了分頁。
- `.ad-subtabs` 可橫捲，用 `.ad-scrollx` 的遮罩漸層暗示「右邊還有」
  （捲軸藏起來之後，那是唯一的線索）。
- `data-count="2"` 或 `"3"` 時，窄螢幕排成**等寬 segmented control**，
  就不用捲了（收禮台的三顆就是這樣）。
- 窄螢幕 `.ad-subtabs` sticky 在頂列下面，高度餵給 `--ad-subtabs-h`，
  下面的 `.ad-list-head.is-sticky` 才黏得準。
- `.ad-tab.is-sub` 是側欄的第二階（「排桌管理」從屬於「桌次」）：
  縮排到 27px，並用一道 6×1px 的 `::before` 短線接住。
  分組用 `.ad-navgroup`（可摺疊，`grid-template-rows: 1fr → 0fr` 做動畫，
  因為 `height:auto` 沒辦法 transition）。

---

### 3.9 選單

**「點一顆按鈕、掉出一疊可以選的動作」只有一種做法。** 面與項的規格共用：

```css
.ad-rowmenu,.ad-acct-pop{ /* 面 */
  background:#fff;border:1px solid var(--ink);border-radius:var(--radius);
  padding:5px;display:flex;flex-direction:column;
  box-shadow:var(--shadow-pop);animation:pop var(--dur-hover) var(--ease);
}
.ad-rowmenu-item,.ad-acct-item{ /* 項 */
  background:none;border:none;border-radius:var(--radius);cursor:pointer;
  text-align:left;font-family:var(--font-ui);font-size:14px;letter-spacing:.06em;
  color:var(--ink);padding:12px 13px;min-height:44px;
  display:flex;align-items:center;gap:10px;
}
```

各自只保留定位：

| 選單 | 觸發 | 定位 | z-index |
|---|---|---|---|
| `.ad-rowmenu` | `.ad-rowmenu-btn`（⋮） | `position:fixed`，由 `admin.js` 算座標 | 1400 |
| `.ad-acct-pop` | `.ad-acct-btn` | `position:absolute`，掛在按鈕下方 8px | 960 |

#### 項的狀態

| Class | 樣子 |
|---|---|
| （預設） | `--ink`，hover `background:var(--bg2)` |
| `.is-danger` | `#a4677a`。**永遠排最後**，前面用 `.ad-rowmenu-sep` 隔開 |
| `[disabled]` | `opacity:.32` ＋ `cursor:not-allowed` |

#### 必備

- 面 `role="menu"`，項 `role="menuitem"`（兩個選單都已經有）。
- 觸發鈕 `aria-expanded` 跟著開關同步。
- 每一項 `min-height:44px` —— 選單就是為了「拇指按不準」而存在的，
  它自己不能又做成 34px。
- `Esc` 與點外面關得掉。
- 框用 `--ink` 而不是 `--line`：**可以點的浮層要比背景重一階**。
  純讀的浮層（`.ad-nav-tip` 說明泡泡）維持 `--line`。

> `.ad-rowmenu` 存在的理由：「編輯」和「刪除」原本只隔 10px，拇指一按很容易點錯。
> 可排序的清單在觸控裝置上也完全沒有排序工具（拖曳用不了），
> 所以順序也收進這一顆：上移／下移／移到最前／移到最後。

#### 不是選單的兩個東西

| | 是什麼 | 差別 |
|---|---|---|
| `.ad-navgroup` | 側欄裡可摺疊的分組 | 它是導覽結構，不是一疊動作 |
| `.ad-nav-tip` | 側欄項目的說明泡泡 | `pointer-events:none`，只給有滑鼠的機器（`<900px` 側欄是觸控抽屜，「點一下先跳說明、再點一次才切分頁」是壞掉的互動） |

---

### 3.10 卡片

#### 先決定：這一筆該是「卡片」還是「清單列」？

判準只有一條 —— **一筆裡有幾行、行高是否參差**：

| 一筆的樣子 | 用什麼 |
|---|---|
| 一到兩行、右邊一個數字，上下對得起來 | **清單列**（`--line-soft` 一條線就夠） |
| 三行以上、每行高低不一 | **卡片**（白底＋框，眼睛才分得出「這幾行是同一筆」） |

所以名字裡有 card 的東西不一定是卡片，這是這份程式碼裡最容易踩的一個坑：

| Class | 名字 | 實際上是 |
|---|---|---|
| `.ad-rcard` | 回覆卡 | **卡片**（一筆三行、高低不一） |
| `.ad-btcard` | 收禮卡 | **清單列**（姓名＋一行說明＋右邊金額） |
| `.ad-msg` | 悄悄話 | **清單列** |

#### 真的是卡片的那幾個

一律：白底 ＋ 1px `--line` ＋ `--radius`（4px）。差別只在內距，而內距分四階：

| 階 | padding | 誰在用 |
|---|---|---|
| 緊 | `8px` | `.sp-card`（排桌的賓客卡，一欄裡要塞幾十張） |
| 標準 | `12px` | `.ad-card figcaption`（小卡）、`.ad-rcard`（回覆卡） |
| 寬 | `18px` | `.ad-callout`、`.ad-letter-card`、`.ad-bt-link` |
| 對話 | `26px 24px 22px`／`30px 22px 26px`／`44px 34px` | `.ad-modal-card`、`.ad-hero-stat`、`.gate-card` |

> 挑一階，不要再發明第五個數字。
> 前三階是自訂規範定的；「對話」那一階自訂規範沒有提到，維持原值。

#### 左邊那道 3px 色帶

卡片要標記「這一張不一樣」時，用 `border-left:4px solid …`，**不要換底色**：

| 用法 | 顏色 |
|---|---|
| `.ad-callout` | `--primary-deep`（要注意的說明） |
| `.ad-letter-card.is-default` | `--primary-deep`（沒對到詞彙時的那一封） |
| `.ad-exh-item.is-act` | `--primary-deep`（章節列，`padding-left` 少 1px 補回線寬） |
| `.sp-bar` `.sp-pool` | `--primary-deep`（排桌的狀態列與未安排面板） |
| `.sp-card.is-rsvp-maybe` | `--sun`（待確認） |
| `.sp-card.is-rsvp-no` | `rgba(164,103,122,.55)` ＋ `opacity:.66`（無法出席） |
| `.ad-demo-row` | `--line`（示範表裡「壞掉的那一列」） |

換底色只留給「整張要淡出視野」的情況：`.ad-rcard:has(.ad-tag-no){background:var(--bg2)}`
—— 名單掃過去時，要找的是會來的那些人。

#### 卡片與表格的關係

`.ad-rcard` 與 `.ad-btcard` 都是**窄螢幕的表格替代品**，由 `onNarrowChange()` 切換：

- 桌機維持 `.ad-table`（同一欄上下對得起來，才比得出誰吃素）
- 窄螢幕換成卡片／列（16 欄的表格在 390px 手機上實寬約 1400px，
  要左右滑三四個螢幕才看得到「人數／葷／素」，而那正是最常看的三欄）

新做一份表格時，**同時想好窄螢幕長什麼樣**，不要只加 `overflow-x:auto` 了事。

---

### 3.11 清單 `.ad-list` / `.ad-item`

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

- 一列一件事，`--line-soft` 分隔，**沒有框**（要不要給框見 3.10 的判準）。
- 整列可點時把 `.ad-item` 換成 `<button class="ad-item">`（收禮台就是這樣），
  記得歸零 border 並保持 `font-family: var(--font-ui)`。
- `.ad-list-panel` 是唯讀數字清單的變體（白底 ＋ 框），
  和統計方格站在一起時才用 —— 不然同一頁上兩塊有框、第三塊突然沒有。

### 3.12 表格 `.ad-table` / `.ad-tablewrap`

- 表頭 sticky、`--bg2` 底、11.5px `--ink-soft`；`.ad-th-link` 是表頭裡的 pill（3.3c）。
- `.ad-tablewrap` 是一張白底的面（會列數字的地方才有面）。
- hover 整列 `rgba(0,0,0,.035)`，只給 `(hover:hover) and (pointer:fine)`。
- **窄螢幕一定要有替代版**（見 3.10 末段），不要只加 `overflow-x:auto`。

### 3.13 數字面板

**規則只有一條：要拿來比對的數字，站在一張白底圓角的面上；其餘只留線。**

| Class | 用途 |
|---|---|
| `.ad-hero-stat` ＋ `.ad-hero-num` | 唯一的主數字。`clamp(34px,11vw,84px)`、`tabular-nums`、`overflow-wrap:anywhere`（台灣禮金破百萬很常見） |
| `.ad-stats` ＋ `.ad-stat` | 統計方格。預設四欄，`.ad-stats-2` `.ad-stats-3` 變體；格線是 `gap:1px` 透出底色 |
| `.ad-donuts` ＋ `.ad-donut` | 環狀圖群組 |

數字一律 `--primary-deep` ＋ `font-variant-numeric: tabular-nums` ＋ Editorial 軌。

### 3.14 分頁器 `.ad-pager`

RSVP／桌次名單／悄悄話／感謝信／收禮明細共用。
**任何可能長到 100 筆以上的清單都要有** —— 婚宴當天 300 筆一次畫出來，手機捲起來會卡。
搜尋或換篩選條件後一律 `pager.page = 1`。

| 屬性 | 值 |
|---|---|
| 字級 | `11px`（本專案的最小字級，不要再往下） |
| `.ad-pager-btn` | `min-height:36px`、左右內距 `12px` |

### 3.15 版面骨架

| Class | 說明 |
|---|---|
| `.ad-bar` | 頂列，sticky ＋ 毛玻璃。butler 沒有側欄，所以 `.ad-bar-actions` 在窄螢幕**不隱藏**（`butler.css` 覆寫） |
| `.ad-layout` / `.ad-main` | 左右兩欄；`.ad-main` 最寬 820px 置中 |
| `.ad-side` | 側欄，≥900px 常駐、<900px 變抽屜（3.17） |
| `.ad-sec` / `.ad-sec-head` / `.ad-sec-title` | 區塊。標題列右邊掛動作按鈕 |
| `.ad-page-title` → `.ad-sec-title` | 兩層標題：一個 subpanel 一個 `.ad-page-title`（21px 明朝體），底下才是小節 |
| `.ad-savebar` | 長表單的 sticky 儲存列（毛玻璃 ＋ `env(safe-area-inset-bottom)`） |
| `.ad-offline` | 離線橫幅，sticky 在頂列下面，`role="status"` |

---

### 3.16 詳細抽屜 `.ad-drawer` / `.sp-drawer`

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
| 關閉鈕 | `✕`，`aria-label="關閉"`，桌機 16px／觸控 44×44・24px（見 3.2） |
| 底部 | `-foot` 永遠貼底 ＋ `env(safe-area-inset-bottom)` |

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

### 3.17 側邊選單抽屜 `.ad-side`（<900px）

和詳細抽屜**不是同一個元件**，不要互相抄規格：

| | 詳細抽屜 | 側邊選單 |
|---|---|---|
| 從哪來 | 右 | 左 |
| 開關方式 | `[hidden]` ＋ animation | `.is-open` ＋ transform transition（桌機常駐，不能用 hidden） |
| 遮罩 | `--scrim-drawer` .2 | `--scrim-nav` .32 |
| 關閉 | ✕／遮罩／Esc | `.ad-side-close`（左上）／backdrop／Esc |

`.ad-side-close` 存在的理由：抽屜的不透明底色會蓋住漢堡鈕，而手機沒有 Esc 可以按。

### 3.18 彈窗 `.ad-modal-*` / bottom sheet

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

**抽屜還是彈窗？** 背景還需要看得到（在名單上點某一筆看細節）→ 抽屜；
必須先回答才能繼續（刪除確認、新增一筆）→ 彈窗。

### 3.19 Toast `.ad-toast`

`.ad-toast-stack` 固定在底部置中、可疊。白底 ＋ `--ink` 框 ＋ `--shadow-pop`；
`.is-error` 轉粉底 ＋ 危險色。可帶一顆 `.ad-toast-action`（例如「重試」）。

> 寫入逾時的文案是「**還沒送出去**」不是「存檔失敗」——
> Firestore 的佇列還在，連線回來會自己補送；講成失敗會害使用者再記一次。

### 3.20 空狀態 `.ad-empty` / 骨架 `.ad-skel`

兩者**必須分得開**：

- `.ad-skel`：第一筆 snapshot 回來**之前**。同時筆數要顯示 `目前 — 筆` 而不是 `0 筆`
  （`0 筆` 和「真的還沒有資料」長得一模一樣）。
  一列 **3 條**（`skeletonHtml()` 的預設寬度 `70% / 45% / 30%`），底色 `--bg2`
  ＋ `--line-soft` 的 shimmer；`prefers-reduced-motion` 時收成靜態 `--bg2`。
- `.ad-empty`：真的沒有資料。`.ad-empty-title` **16px**。
  `.is-rich` 變體帶虛線框 ＋ 標題 ＋ 一顆 CTA。

### 3.21 其他

| Class | 用途 |
|---|---|
| `.ad-callout` | 左邊一道 `--primary-deep` 粗線的說明／開關區塊 |
| `.ad-eye` | 「顯示／隱藏金額」的 pill 開關（3.3c） |
| `.ad-progress` | 上傳進度 |
| `.ad-info` | 唯讀的「名稱：值」清單 |
| `.ad-drag-handle` ＋ `.ad-drag-placeholder` | 拖曳排序（拖曳中的列吃 `--shadow-drag`） |
| `.sp-peek` | 賓客卡的懸浮預覽（可點，所以是 `--ink` 框） |
| `.cr-*` | 圖片裁切器（`cropper.js` 動態插入，`≤560px` 一樣貼底） |

## 4. 無障礙基準線

| 項目 | 規則 |
|---|---|
| 焦點 | `:focus-visible` → 2px `--primary-deep` ＋ 2px offset。輸入框改成邊框轉深 ＋ 2px `--primary-soft` 內光。**兩頁都有**（規則掛 `body:is(admin, butler)`） |
| 觸控熱區 | 圖示按鈕（✕ ☰ ⋮ ↑↓）與選單項 `(pointer:coarse)` 一律 **44×44**；pill 與 chip 是 32（獨立）／28（嵌在一行字裡）—— 28 偏小，見「已知落差」 |
| 對比 | 小字的次要色用 `--ink-soft`（`#6a5e53`，於 `--bg1` 5.93:1）；最小字級 11px。**`--primary-deep` 是已知的例外**（2.57:1，見「已知落差」） |
| 圖示按鈕 | 一定要 `aria-label`（`✕` → `關閉`，`☰` → `開啟選單`，`⋮` → `更多`） |
| 選單 | 面 `role="menu"`、項 `role="menuitem"`、觸發鈕 `aria-expanded` 同步 |
| 摺疊 | `aria-expanded` ＋ `aria-controls`（`.ad-chips-more`、`.ad-navgroup`、排桌的「篩選」） |
| 搜尋框 | 一定要 `aria-label`（placeholder 不是標籤） |
| 浮層 | `role="dialog"` ＋ `aria-modal="true"`，Esc 關得掉，返回鍵關得掉 |
| 動效 | 尊重 `prefers-reduced-motion` |
| 狀態列 | 離線橫幅 `role="status"` |

---

## 5. 這份規範由測試守著

```bash
npm run test:ui        # tests/ui-consistency.mjs（只需要 hosting emulator）
```

擋下最容易默默漂掉的那幾項：

| 檢查 | 為什麼是它 |
|---|---|
| 雙軌字體 | `.btn`／`.ad-filter` 在兩頁要同一種字；`#btPass` 要留在 Editorial 軌（那是規格，不是漏網之魚） |
| `--ink-soft` | 兩頁都要是後台那一階（`#6a5e53`，5.93:1） |
| 焦點框 | 收禮台的 `.ad-input` 聚焦要有訊號 |
| 搜尋框 | 八個都在，每一個六項屬性齊全、placeholder 以「搜尋」開頭 |
| 抽屜 | `.sp-drawer` 的尺寸、層級、dialog 語意、遮罩、CTA 貼底 |
| 遮罩 | 側欄／彈窗／抽屜三個濃度、同一支冷灰 |
| 選單 | 兩個下拉選單的面與項規格一致、項 ≥44px、`role="menu"`／`"menuitem"` |
| 圖示按鈕 | 每一顆都有 `aria-label`；✕ 桌機一律 16px |
| Pill | 只有 32／28 兩階，字級一律 12px |
| Tab | 兩種 tab 的選中語彙（白底 ＋ 字重 500 ＋ 同色定位線） |
| 卡片 | 白底 ＋ 1px `--line` ＋ 4px 圓角 |

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
| **`--primary-deep` 的對比** | `#ca9a21` 於白底只有 **2.57:1**，AA（4.5）與 AA Large（3.0）都不過。它被用在**所有數字**（`.ad-hero-num` 禮金總額、`.ad-stat-num` 統計方格）、通行碼 `.ad-bt-pass`，以及 `.ad-th-link`／`.ad-filtersum-clear`／`.ad-chip-link` 的文字。這是自訂規範指定的品牌色，所以照用；要補到 AA，最小的改法是另外給一支「當文字用」的深一階金（例如 `--primary-ink`），面與框仍用 `#ca9a21`，不動品牌調性 |
| **Pill 的觸控熱區** | 自訂規範把 pill 從 36／32 收成 32／28。28px 低於一般建議的觸控下限，`.ad-eye`（顯示金額）與 `.ad-th-link`（表頭標籤）在手機上會比較難按。圖示按鈕與選單項仍是 44 |
| `.ad-modal-mask` 的 dialog 語意 | 16 個彈窗（後台 14 ＋ 收禮台 2）都沒有 `role="dialog"`／`aria-modal`；抽屜兩個都有了。要補就一次補齊，不要補一半 |
| 焦點歸還 | 抽屜／彈窗關閉後沒有把焦點還給觸發它的那顆按鈕 |
| `.ad-side` 的 `inert` | <900px 收起來時只是 transform 移出畫面，內容仍可被 Tab 到 |
| layer stack 兩份實作 | `admin.js` 的 `pushLayer()` 與 `butler.js` 的 `pushSheetLayer()` 邏輯相同（butler 不載入 `admin.js`）。改一邊要記得改另一邊 |
| `normKey()` 兩份實作 | 同上（butler 不載入 `common.js`），內容必須保持一字不差 |
| 排桌還有幾處 10.5px | `.sp-stats .ad-stat-lab`、`.sp-filter-declined small`、`.sp-group-head small`、`.sp-table-hidden`、`.ad-exh-kind` 等仍低於 11px 的最小字級。已經有一條 `10.5 → 11` 的清單，但只涵蓋 8 個選擇器；補齊會動到整個排桌工作區的行高，該獨立一次做 |
| `.sp-card-move` 熱區 | 32×32，而它只在 `(hover:none)` 出現 —— 也就是永遠在觸控上。放大到 44 需要賓客卡本身跟著長高，那是整個排桌板的版面變動 |
| `.ad-btcard`／`.ad-msg` 的命名 | 名字有 card，實際是清單列（見 3.10）。改名要動 CSS、JS 與測試，值得做但不該夾在別的改動裡 |
