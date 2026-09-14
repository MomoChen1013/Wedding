# 後台 UI 設計規範

> 適用範圍：**新人後台 `/w/{slug}/admin`** 與 **收禮小幫手 `/butler`**。
> 兩頁載入同一份 `css/common.css` ＋ `css/admin.css`，用同一組 `.ad-*` 元件。
> 賓客頁（大廳、邀請函、抽卡、故事牆…）另有自己的視覺，不受這份文件約束。
>
> 這份文件寫的是**現在程式碼裡真的長這樣**的規格，不是願景。
> 改了元件就回來改這裡；這裡寫的和 CSS 不一樣時，以 CSS 為準並回報。
>
> **色票、字體與字級這一版是 Ivory**（見 §2.1／2.2／2.3）：
> 金色不再當文字、數字回到墨色、UI 軌固定 Noto Sans TC、
> 字級從 320 處硬寫收成 14 支變數、輸入框從盒子改成一條線。
> §3.1／3.2／3.3／3.8／3.9／3.10／3.14／3.20 的結構數值仍來自
> `UI_Spec_Custom.md`（2026-08-25 匯出）；該檔沒有提到的部分
> （彈窗、抽屜、搜尋框、清單、表格、數字面板…）維持原本的規格。
>
> 這份規範由 `tests/ui-consistency.mjs` 守著（72 條斷言）。
> **改了規範沒改測試，三個月後它就會變成考古資料。**

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
| 靠線條與留白撐層次 | 1px `--line`／`--line-soft`，不用色塊分區。輸入框也是一條線，不是一個盒子（3.6） |
| 陰影只給「浮起來」的東西 | 抽屜、彈窗、行內選單、toast、拖曳中的列。其餘一律無陰影 |
| 圓角克制 | 後台 `--radius: 4px`（賓客頁 `2px`）。只有膠囊（chip／badge／pill 按鈕）是 `999px`；`.ad-tag` 是方的 |
| 不用 emoji 當 UI 圖示 | 現有的 `✕ ＋ － ⋮ ↗` 是字元，不是圖示字型 |
| 動效克制 | 只有 ease-out，時長 150–260ms，不用 bounce／overshoot |
| 顏色只標示狀態 | `--primary` 不准當文字（2.1）。數字是 `--ink`，不是品牌色 |
| 密度比賓客頁高 | 但內容字級不低於 `--fs-pill`(11px)、欄位名不低於 `--fs-label`(10px)，可輸入元件一律 `--fs-input`(16px) |

### 1.1 文案語彙（和視覺同一份規格）

新人打開這一頁時，不該覺得「我要填一份婚禮後台表單」，
而是「有人一步一步帶我把婚禮資訊準備好」。所以文案也有規格：

| 原則 | 具體做法 |
|---|---|
| 少說明，多直接問 | 「婚宴在哪裡？」不是「請於下方輸入婚禮相關資訊，以便系統顯示於邀請函」 |
| 不用產品內部的詞 | 沒有場次、模組、資料、設定項目、欄位、前台／後台、系統、站台、大廳。講賓客看得到的那件事（「當天的活動」「賓客首頁」） |
| 第一人稱是「我們」 | 要我們幫忙的事寫「跟我們說一聲」，不寫「請聯繫管理員」 |
| Helper text 最多一行 | 講不完的收進 `.ad-fine`（3.15a），不要讓它長回三行 |
| 能刪就刪，不要問兩次 | 標題已經說完的就不要再問一句（「婚禮小卡」上面不用再加「想讓賓客抽到哪些照片？」）。標題撐不住時才用 `.ad-ask`（3.15a） |
| 選填不製造壓力 | 留白的選填段落寫「選填」，不寫「未完成」「尚未填寫」；進度講「已經完成 N 件」，不講「還剩 N 步」 |
| 存檔狀態講結果 | 乾淨時「都存好了」，不寫「目前沒有未儲存的變更」 |

---

## 2. Design Token

### 2.1 色票

**元件一律只引用變數名，不要寫死色碼。**

賓客頁與後台吃的是兩套：

- **賓客頁**：`common.css` 的版型色票，由 `<body data-template="…">` 決定
  （`champagne`／`blush`／`sage`／`dusk`），新人可以自己換。
- **後台與收禮台**：`admin.css` 在 `body:is([data-page="admin"],[data-page="butler"])`
  這一層給定值。兩頁的 `data-template` 都寫死 `classic`、**不跟著版型走**，
  所以工作介面不需要跟著跑，直接定色比較穩。

這一版是 **Ivory**。它的一句話是：**層級靠留白與字建立，顏色只用來標示狀態。**
改版前品牌金放在「所有數字」上 —— 一個螢幕三十個金色數字，
等於沒有任何一個數字被強調，而且那支金在白底只有 2.57:1。
現在金色不當文字，降級成**記號**；數字回到墨色。

| Token | 值 | 用途 |
|---|---|---|
| `--ink` | `#232020` | 主要文字、**所有數字**、實心按鈕底、可點浮層的框 |
| `--ink-rgb` | `35,32,32` | 半透明的墨（按下去的底、hover）從這裡推導 |
| `--ink-soft` | `#5C564C` | 次要文字、metadata、時間戳、欄位名 |
| `--ink-3` | `#7A7167` | 第三階墨：placeholder、唯讀欄位、統計方格的欄位名 |
| `--primary` | `#F09B7D` | **記號色**。只做面、線與圖示 —— 見下面的使用規則 |
| `--primary-deep` | `#82412B` | 要拿 accent **寫字**時用這一支（7.22:1 ✅） |
| `--primary-soft` | `#FDEEE7` | 「這一格正被選中／命中」的暫時底色 ⚠ 待設計覆核 |
| `--alert` | `#B34A38` | 錯誤／刪除的線、框、實底與文字（**只有這一支**） |
| `--alert-wash` | `#FBEDEA` | 錯誤 toast 的底 ⚠ 待設計覆核 |
| `--alert-rgb` | `179,74,56` | 半透明的錯誤色（`rgba(var(--alert-rgb),.4)`） |
| `--bg1` | `#FAF8F3` | 頁面底 |
| `--bg1-rgb` | `250,248,243` | 頂列／浮動列的半透明底（backdrop-filter 那幾條） |
| `--bg2` | `#F1ECE3` | 次級底（表頭、唯讀欄位、hover、骨架） |
| `--surface` | `#FDFCF9` | 卡片、選中的分頁、浮層的面。**米白，不是純白** |
| `--surface-rgb` | `253,252,249` | 半透明的面（統計方格、環狀圖、鎖住的遮罩） |
| `--on-ink` | `#FAF8F3` | 壓在 `--ink` 實心上的字 |
| `--line` | `#CFC7B9` | 主線條、卡片外框 |
| `--line-soft` | `#DFD8CC` | 分隔線 |
| `--bg-row-hover` | `#F4F3F0` | 表格列 hover 的**不透明**版（sticky 欄專用，見下） |

線條是**定值不是半透明**：舊的 `rgba(47,43,38,.18/.09)` 會跟著底色變，
同一條線在白卡和 `--bg2` 面板上是兩個深淺；定值就是同一條線。

#### 三條使用規則（會被測試守著）

1. **`--primary` 不准出現在任何 `color` 屬性上。** 它出現的地方只有五種 ——
   焦點框、**側欄**選中的定位線（`.ad-navmark`，見 3.8）、側欄圖示、
   未儲存的那一點、`.ad-badge.is-on` 的底。
   子分頁那條定位線是 `--ink` 不是 accent，理由見 3.8。
   想拿它寫字時改用 `--primary-deep`。
   唯一的例外是 SVG 圖示（`.ad-ic`）：那裡的 `color` 餵給 `stroke:currentColor`，
   是**線的顏色**不是文字顏色。`tests/ui-consistency.mjs` 第 13 段就在守這一條。
2. **`--ink-3` 只能站在 `--bg1` 或 `--surface` 上。** 它站在 `--bg2` 上是
   4.07:1，不過 AA —— 表頭、唯讀欄位、hover 底都是 `--bg2`，
   那些地方的次要文字要用 `--ink-soft`。
3. **`--surface` 和 `--bg1` 的對比只有 1.03:1，這是故意的**：
   卡片靠那條 1px 線被看見，不靠底色。所以不要為了「讓卡片跳出來」把面加深。

#### 狀態不靠顏色分，靠記號分

`--primary-deep` 換成深磚紅之後，原本掛在它上面的幾個「狀態正常」的字
（頁面設定的「已經看得到」、婚禮資訊的「已填好」）讀起來像在報錯。
那幾處一律改回 `--ink-soft`，改用一顆小記號區分：

| 狀態 | 記號 | 在哪 |
|---|---|---|
| 這一頁賓客現在看得到 | 眼睛 `#shin9-eye` | `.ad-page-row.is-live .ad-page-state` |
| 這一段已經填好 | 打勾 `#shin9-check` | `.ad-wz-card-state.is-done` |
| 排程開啟中 | 無（「9/19 12:00 自己開」本身已經說得夠清楚） | `.ad-page-state.is-sched` |

記號走 `.ad-state-ic`（13px、`stroke:currentColor`），**和側欄的 `.ad-ic`
分開** —— 那是 24px 的功能圖示，這是跟著 11–12px 文字走的標記，線寬要自己給。
沿用 48×48 原稿的那幾顆（例如 `#shin9-check`）縮到 13px 時線會被抹掉，
所以另有 `.ad-state-ic.is-vb48` 把線寬換算回去（48/13 ≈ 3.7 倍）。

> **同一組裡只有一種狀態該有記號。** 婚禮資訊的六張卡有「已填好／還沒填／選填」
> 三種，只有「已填好」掛打勾 —— 三種都掛記號等於三種都沒有記號。

#### 為什麼 sticky 欄要一支不透明的 hover 色

表格列 hover 是 `rgba(0,0,0,.035)` 疊色，但釘在左右兩側的
`.is-name`／`.is-act` 是 `position:sticky` —— 半透明的 sticky 欄會讓底下
捲過去的內容透出來。所以那兩欄吃 `--bg-row-hover`，它就是那個疊色算好的實色。
**`--surface` 一改，這一支要跟著重算。**

**排桌工作區是「所有數字都用記號色」的例外。** 那一頁一個螢幕上
同時有幾十張桌卡，每一張都有桌號、人數、剩餘位子、標籤；數字全部上色的話，
整片畫面會變成一堆彼此搶戲的顏色，反而看不出哪一桌要處理。所以：

| 排桌的東西 | 顏色 |
|---|---|
| `.sp-table-no`（桌號） | `--ink`（就是字，不是強調） |
| `--seat-full`（坐滿：桌卡外框與「已滿」） | `--ink` —— 坐滿是好事，不需要跳出來喊 |
| `--seat-over`（超量：桌卡**外框**） | `#E86C93` —— **整頁唯一要被看到的狀態** |
| `--seat-over-ink`（超量：那一行**文字**） | `#A8425F` —— `#E86C93` 當文字只有 2.83:1 |

#### 量過的對比（WCAG AA 需 4.5:1，大字 3:1）

| 組合 | 比值 | |
|---|---|---|
| `--ink` 於 `--bg1` | 15.23:1 | ✅ |
| `--ink` 於 `--surface` | 15.76:1 | ✅ |
| `--ink-soft` 於 `--bg1` | 6.85:1 | ✅ |
| `--ink-soft` 於 `--bg2` | 6.17:1 | ✅ |
| `--ink-soft` 於 `--surface` | 7.08:1 | ✅ |
| `--ink-3` 於 `--bg1` | 4.51:1 | ✅ |
| `--ink-3` 於 `--surface` | 4.67:1 | ✅ |
| **`--ink-3` 於 `--bg2`** | **4.07:1** | ❌ 所以有上面第 2 條規則 |
| `--primary-deep` 於 `--bg1` | 7.22:1 | ✅（改版前的 `#ca9a21` 是 2.57） |
| `--primary-deep` 於 `--surface` | 7.47:1 | ✅ |
| `--primary-deep` 於 `--primary-soft` | 6.77:1 | ✅ |
| `--alert` 於 `--bg1` | 5.00:1 | ✅（改版前硬寫的 `#a4677a` 是 4.12） |
| `--alert` 於 `--surface` | 5.18:1 | ✅ |
| `--alert` 於 `--alert-wash` | 4.66:1 | ✅ |
| `--seat-over-ink` 於 `--bg1` | 5.48:1 | ✅ |
| `--primary` 於 `--bg1` | 2.04:1 | 不當文字用，所以不適用 |

**錯誤色改版前是硬寫的，現在不是。** 舊的三支（`#a4677a` 線與面、
`#8a5765` 文字、`rgba(164,103,122,…)` 半透明）散在 59 處；
`#B34A38` 對紙底已經 5.00 ✅，不需要再深一階，所以收成
`--alert` ＋ `--alert-wash` ＋ `--alert-rgb` 三個變數。

### 2.2 字體：雙軌

```
--font-display  'Optima','Marcellus','Noto Serif TC',serif   Editorial 軌 ——「婚禮」的部分
--font-ui       'Noto Sans TC',system-ui,…              UI 軌       ——「工作」的部分
```

兩支都只在後台這一層覆寫（`body:is([data-page="admin"],[data-page="butler"])`），
賓客頁完全不受影響。

| 軌 | 用在哪 |
|---|---|
| **Editorial（明朝）** | 頁標題、區塊標題、彈窗／抽屜標題、開場白 `.ad-ask`、大數字（`.ad-hero-num` `.ad-stat-num`）、空狀態標題、編號（`.ad-btcard-code` `.bt-code` `.sp-card-code`）、通行碼（`.ad-bt-pass` `.bt-pass`）、悄悄話內文 |
| **UI（sans）** | 表格、表單、按鈕、chip、tag、頁籤、清單列、分頁、toast、hint、metadata、時間戳 |

#### 為什麼 UI 軌是 Noto Sans TC 而不是 `system-ui`

`system-ui` 在 Mac 是蘋方、Windows 是微軟正黑、Android 是思源 ——
三台裝置三種字重與字距。新人是在通勤、睡前、婚宴當天換著裝置開後台的人，
不能每換一台就換一張臉。

成本是可以接受的：Google Fonts 走 `unicode-range` 分片，只送這一頁真的用到的
字段；`admin.html`／`butler.html` 本來就在載 Noto Serif TC 四個字重，
這裡只多要 **400／500** 兩個字重，在同一個 `<link>` 裡一起要。
fallback 仍然留著 `system-ui` 那一串 —— 字沒到之前畫面不會是空的（`display=swap`）。

#### Editorial 軌的拉丁字：Optima → Marcellus → Noto Serif TC

| 裝置 | 拉丁字與數字 | 中文 |
|---|---|---|
| macOS／iOS | **Optima**（系統內建） | Noto Serif TC |
| 其他 | **Marcellus**（Google Fonts） | Noto Serif TC |

Optima 是 Monotype 的商業字型，**不能**用 web font 載 —— 自行 host 要另外
買授權（按月瀏覽量計價）。所以它只能吃 Apple 裝置的系統字。

非 Apple 裝置落到 **Marcellus**：Google Fonts 上最接近 Optima 的一支 ——
同樣是碑刻感的羅馬體、筆畫末端帶喇叭口、沒有真正的襯線。不是複製品
（Optima 那種「有襯線的筆畫對比但沒有襯線」沒有免費字型做得到），
但比直接掉回明朝體接近得多。它只涵蓋拉丁字，檔案很小。

> ⚠ **Marcellus 只有 400 一個字重。** Editorial 的標題是 500 ——
> CSS 的字體匹配在「要 500、只有 400」時會直接選 400 而不是合成假粗
> （合成從 600 才開始），所以非 Apple 裝置上拉丁字會比旁邊的中文
> （Noto Serif TC 500）略細一點點。這是知道且接受的：
> 假粗在這種細筆畫的羅馬體上更難看。

Optima 與 Marcellus 都不涵蓋中文，中文一律落到 Noto Serif TC ——
不必為中英混排改任何一行 HTML，瀏覽器的字族 fallback 本來就是逐字處理的。

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

膠囊（chip／badge／pill 按鈕）維持 `999px`，不吃 `--radius`。
**`.ad-tag` 不再是膠囊**（見 3.5）—— 形狀是它和 Badge 唯一的區別。

#### 字級：十四支變數，零處硬寫

改版前全檔有 **320 處硬寫的 `font-size`**，用掉 **23 種值**（9px 到 26px），
中間全是「差一點點」的階。差一點點的階讀者分不出來，只覺得亂。
現在**一處都不准硬寫** —— `tests/ui-consistency.mjs` 第 13 段會擋下來。

**文字層級（Ivory 的五階）**

| Token | 值 | 用在哪 |
|---|---|---|
| `--fs-title` ＋ `--fw-title` | `20px` / `500` | 頁標題 `.ad-page-title`、頂列標題、彈窗大標 |
| `--fs-sec` ＋ `--fw-sec` | `18px` / `500` | 區塊標題 `.ad-sec-title`、彈窗／抽屜標題、空狀態標題 |
| `--fs-body` | `15px` | 內文段落、說明、callout、開場白 `.ad-ask` |
| `--fs-meta` | `12px` | 次要資訊、時間戳、hint、分頁器、pill 按鈕 |
| `--fs-label` | `10px` | 欄位名（`text-transform:uppercase` ＋ `--track-lab: .16em`） |

**元件階（密度區）**

Ivory 的五階講的是**文字層級**。它自己的元件 CSS 也沒有全部遵守 ——
`.tbl` 是 12.5px、`.inp` 是 14px、`.tag` 是 11px。那是
「**密度在資料裡，留白在框上**」的直接結果：表格列高不動，甚至更緊。
所以五階之外另立三支，資料密集區不跟著內文一起變鬆。

| Token | 值 | 用在哪 |
|---|---|---|
| `--fs-ctl` | `15px` | 清單主文、側欄分頁、選單項、就地編輯。**也是 `body` 的基準字級** |
| `--fs-ctl-sm` | `13px` | 表格、chip |
| `--fs-btn` | `13px` | 按鈕。**和 `--fs-ctl-sm` 同值但刻意分開** —— 按鈕的字級是最常被要求「再大一點／再小一點」的東西，跟表格綁在一起的話，調按鈕就會順手把整張表格一起改掉 |
| `--fs-pill` | `11px` | tag／badge／seat／旗標。**不要再往下** |

**輸入框自己一階**

| Token | 值 | 備註 |
|---|---|---|
| `--fs-input` | `16px` | **iOS 的硬下限，不是設計選擇** |

iOS Safari 只要聚焦 <16px 的欄位就會把整頁放大，之後版面往右偏，
使用者得自己雙指縮回來。後台有一半的時間是在手機上開的，
所以這一階**不跟著 `--fs-ctl` 下修**。連沒有字的 `<input type="color">`
（`.ad-swatch-pick`）都要給 —— 它一樣會觸發放大。

**Editorial 數字階**

Ivory 把 Editorial 軌收到只剩標題、數字、信件內文。數字自己三階：

| Token | 值 | 用在哪 |
|---|---|---|
| `--fs-num-sm` | `17px` | 桌號、排桌的統計小數字、收禮金額 |
| `--fs-num` | `22px` | 環狀圖中央 |
| `--fs-num-lg` | `26px` | 通行碼 |

`.ad-hero-num`／`.ad-stat-num` 用的是 `clamp()`（會自己跟著視窗縮放），
不在這三階裡。

**字元圖示**

| Token | 值 | 用在哪 |
|---|---|---|
| `--fs-glyph` | `17px` | `✕ ＋ － ⋮ →` 一般尺寸 |
| `--fs-glyph-lg` | `22px` | 同上，`(pointer:coarse)` 下要撐滿 44px 熱區 |

它們是**圖示不是字**，所以不吃文字層級 ——
跟著 `--fs-body` 走的話，關閉鈕會在不同斷點長成不同大小。

**收禮台另外三支**（定義在 `butler.css`，只有 `/butler` 吃）

| Token | 值 | 用在哪 |
|---|---|---|
| `--fs-bt-pass` | `26px` | 通行碼 |
| `--fs-bt-amount` | `30px` | 禮金金額：整個工具最重要的一個輸入 |
| `--fs-bt-step` / `--fs-bt-step-lg` | `17px` / `19px` | 盒數與人數（觸控再大一階） |

它們大得出格是有理由的：現場是站著、單手拿手機、旁邊有人在等，
通行碼與金額要「看一眼就知道打對沒」。三個都遠大於 16px，不會觸發自動放大。

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
--scrim-drawer : rgba(35,32,32,.2)   /* 抽屜：前提是背景要看得見 */
--scrim-nav    : rgba(35,32,32,.32)  /* 側邊選單 */
--scrim-modal  : rgba(35,32,32,.72)  /* 彈窗／裁切器：背景該退場 */
--shadow-pop        : 0 4px 14px rgba(35,32,32,.10)  /* 選單、tooltip、peek、toast、filtersum */
--shadow-drag       : 0 4px 12px rgba(35,32,32,.09)  /* 拖曳中的列（已 opacity:.55） */
--shadow-panel-blur / --shadow-panel-ink            /* 抽屜與側欄，方向各自給 */
```

色相**一律** `35,32,32` —— 跟 `--ink` 同一支暖墨，只有濃度不同。
改版前是 `43,47,54` 那支冷灰：蓋在米白紙底上會透出一層藍。
新增浮層時引用 token，不要再調一組新的。

> 這一組定義在 `:root`（不是後台那一層），所以**不能**寫成
> `rgba(var(--ink-rgb),…)` —— 在 `:root` 那個位置 `--ink-rgb` 還是
> `common.css` 的 `47,43,38`。元件層裡的半透明墨才用變數。

### 2.6 z-index 層級表

| 層 | z-index | 元件 |
|---|---|---|
| 頁內 sticky | 1–8 | 表頭、`.ad-list-head.is-sticky`、`.ad-filtersum`、`.ad-subtabs`、`.ad-savebar` |
| 固定底列 | 900 | `.sp-mobilebar` |
| 離線橫幅 | 940 | `.ad-offline` |
| 頂列 | 950 | `.ad-bar` |
| 帳號選單 | 960 | `.ad-acct-pop` |
| 側欄遮罩／側欄 | 990 / 1000 | `.ad-side-backdrop` / `.ad-side` |
| 懸浮小卡 | 1200 | `.sp-peek`、`.ad-nav-tip`、`.ad-page-tip` |
| **抽屜遮罩／抽屜** | **1300 / 1310** | `.ad-drawer-mask` / `.ad-drawer` |
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
| 標記一個設定現在的狀態 | `.ad-badge`（3.5b） |
| 要不要收集這項資料 | Checkbox `.ad-check`（3.6） |
| 要不要開啟一個服務 | Switch `.ad-switch`（3.6b） |
| 幾個模式只能選一個 | Radio group `.ad-radios`（3.6c） |
| 有前置條件才要設定的一段 | Conditional reveal `.ad-reveal`（3.6d） |
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
| 一行說「這一頁在做什麼」 | `.ad-sec-note`（3.15a） |
| 標題說不出來的開場白（兩處例外） | `.ad-ask`（3.15a） |
| 講得完但第一眼不必讀的細節 | `.ad-fine`（3.15a） |

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
| `.btn.btn-google` | `--surface` 面 | 只有登入門 |
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
| `.ad-drawer-close` | ✕ | padding 2/4・**16px** | 44×44／**24px** | 無框 |
| `.sp-touch-tip-close` | ✕ | —（只在觸控出現） | 44×44／**24px** | 無框 |
| `.ad-rowmenu-btn` | ⋮ | **36×36**／16px | 44×44／18px | 透明框，hover 才顯 `--line` |
| `.sp-move-btn` | ↑ ↓ ⇤ ⇥ | **36×36**／13px | **44×44** | 1px `--line` ＋ radius |
| `.sp-card-move` | ↔ | **36×36**／16px | 同左（只在觸控出現） | 透明框，`:active` 才顯 |
| `.sp-table-fold` | ▾（收起來轉 −90°） | **36×36**／12px | 36×36 ＋ `::after` 補到 **44×44** | 透明框，`:active` 才顯 |
| `.ad-page-why` | ？（`#shin9-help`） | **36×36**／19px | **44×44**／21px | 透明框，hover 才顯 `--line`；`cursor:help`；帶出浮在上面的 `.ad-page-tip`（不展開那一列） |
| `.ad-drag-handle` | ⠿ | 16px | — | 無框，`cursor:grab`／`grabbing` |

三條規則：

1. **桌機一律 36×36、觸控一律 44×44。** 熱區不能省 ——
   一顆按不到的關閉鈕等於這一層關不掉。
2. **✕ 的字級只有兩個值**：桌機 16px、觸控 24px。四顆 ✕ 都吃這一組。
3. **框的有無看它站在哪**：站在一張面上（抽屜的 head、選單列）不用框，
   站在內容上（頂列的 ☰、抽屜左上的 ✕、排序的 ↑↓）要框，不然看不出是按鈕。

> 只剩桌位管理還用 ↑↓（一次挪一格，30 桌要按很多下，所以「⋮」裡另外有
> 「移到最前／最後」）。**清單的排序一律用拖曳**（`setupDragSort()`）：
> 故事牆、測驗題目、表單的自訂題目、婚禮流程的時間軸、婚禮活動的活動卡都是同一套 ——
> 一顆 `.ad-drag-handle` 在最左邊，放開就是新的順序。
> 新加的排序鈕請併進 `.sp-move-btn` 那一條，不要再抄一份 36×36。

---

### 3.3 文字按鈕

沒有實心底的按鈕，分三種。**選錯一種，使用者就分不出「這是動作」還是「這是狀態」。**

#### (a) 底線文字按鈕 `.ad-edit` / `.ad-del`

一列尾端的「編輯／刪除」。`--fs-meta`、`--ink-soft`、`border-bottom:1px solid transparent`；
hover 時線與字一起變深（刪除變 `--alert`），觸控沒有 hover 所以改成 `:active` 給回饋。
`(pointer:coarse)` 靠 padding 把熱區撐到 **44×44**，視覺不變。

`.ad-linkbtn` 是同一種樣子的第三個成員：接在一句說明**後面**的出口
（表單設定裡的「前往設定 ↗」）。它跟著那句話走，所以不做成 pill ——
一句話裡冒出一顆膠囊，會變成兩個重點。

> 同一列有三個以上動作時，改用 `.ad-rowmenu-btn`（⋮），不要並排三顆。
> `.ad-item-actions` 在觸控時 `gap:16px`；已經收進 ⋮ 的那幾份反而收緊到 `gap:4px`。

#### (b) 底線「展開」按鈕 `.ad-chips-more` / `.sp-warn-more`

無框、`border-bottom:1px solid var(--line)`、`--fs-pill`。
用在「還有更多、點開來看」——它不是動作，是**視野的開關**。
`.sp-warn-more.has-warn` 右上角補一顆紅點：收起來的那幾項裡有要處理的。

#### (c) Pill 文字按鈕

膠囊外框（`999px` ＋ 1px `--line`），用在**一個獨立的小開關**。尺寸只有兩階：

| 階 | 字級 | min-height | 誰在用 |
|---|---|---|---|
| 獨立 | 12px | **32px** | `.ad-filtersum-clear`（清除篩選）、`.ad-rcard-more`（展開更多）、`.sp-pill`（排桌兩欄欄頭的入口）、`.ad-chip`（觸控時 32） |
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
  `.ad-chips-sub`（次級一排，字小一號）、
  `.ad-chips-preview`（裡面放不可點的 `.ad-tag`，見 3.5）
  ＋ `.ad-chips-soft`（字色收到 `--ink-soft`：純粹在說「賓客會看到這幾個選項」，
  不跟旁邊的設定搶重點）
- `.ad-chip-link` 是虛線框 —— 它是**出口**（「設定標籤 ↗」、每一組末尾的「＋ 新增」），不是篩選條件
- `.ad-tagchip` 是**尺寸變體**（設定賓客標籤那一頁）：40px 高，一顆裝
  「名稱 ＋ 共 N 位 ＋ 一支鉛筆」。它**沒有 `.is-on`** —— 它不是篩選器，
  點下去是打開編輯彈窗。和篩選 chip 不會同時出現在同一個畫面

Chip 也當 segmented control 用（收禮台的「禮餅：沒有發／已發送」、金額捷徑）。
和 Tab 的分工：**Chip 篩的是同一份清單的內容，Tab 換的是整個畫面。**

> **可點的 chip 一定要有一種以上的狀態嗎？** 不用。`.ad-tagchip` 點下去是
> 「打開一張表單」而不是「選起來」，所以它只有 hover，沒有選中態。
> 反過來說：**有 `.is-on` 的 chip 一定是篩選器或 segmented control。**

---

### 3.5 標籤 `.ad-tag`（唯讀狀態標記）

`.ad-tag-yes` `.ad-tag-maybe` `.ad-tag-no` `.ad-tag-guest`。
**`border-radius: var(--radius)` —— 方的，不是膠囊。**
**永遠 `white-space:nowrap`** —— 折行的標記完全不成形，欄位擠不下時該讓欄位變寬。

> **形狀就是「這個不能點」。** 改版前 tag 和 chip、Badge、pill 按鈕全都是
> 999px 膠囊，唯一的區別是「可點的有 hover 反應」—— 那是一個要伸手去試
> 才知道的區別。現在 `.ad-tag` 收成 4px 方角：
>
> | 形狀 | 是什麼 | 例子 |
> |---|---|---|
> | 方角 `--radius` | 唯讀的**資料狀態** | `.ad-tag`（會出席、素食、VIP） |
> | 膠囊 `999px` | 可點的**篩選器**或**設定狀態** | `.ad-chip`、`.ad-badge`、pill 按鈕 |
>
> `.ad-badge` 刻意**維持膠囊**：它講的是「這個設定開了沒」，
> 和 tag 的「這一筆資料是什麼」不同用途，形狀撞在一起反而混淆。

---

### 3.5b Badge `.ad-badge`（設定的狀態標記）

```html
<div class="ad-actcard-id">
  <span class="ad-actcard-name">婚宴</span>
  <span class="ad-badge">宴客</span>
  <span class="ad-badge is-on">主要活動</span>
</div>
```

| 變體 | 樣子 | 用在哪 |
|---|---|---|
| `.ad-badge` | `--bg2` 底 ＋ `--line` 框 ＋ `--ink-soft` | 活動種類 |
| `.ad-badge.is-on` | `--primary-soft` 底 ＋ `--primary` 框 ＋ `--ink` | 正在生效（主要活動） |

和 `.ad-tag`（3.5）的分工：**`.ad-tag` 講「這一筆資料是什麼」（題型、
現在有幾個選項），Badge 講「這一筆不一樣」。**
所以 Badge 更小、更輕，而且永遠跟在它在說的那個東西旁邊，不會單獨佔一列。

> **關不掉的題目不掛 Badge**，活動卡上關不掉的那一張也不掛。
> 它的寫法是「打勾但點不動」（`.ad-check.is-fixed` ＋ `disabled`），
> 必填與否寫在標籤本文裡（`與新人的關係？(必填)`）——
> 一列裡同時有灰掉的勾選框和一顆 Badge，讀起來像兩個互相解釋的狀態。

> `.is-on` 用**面**（`--primary-soft`）強調、字仍然是 `--ink` ——
> 這是 `--primary` 出現的五個地方之一（2.1）。
> 改版前這樣寫是因為舊金當小字只有 2.57:1；現在 `--primary-deep` 是 7.22:1，
> 已經可以當文字，但 Badge 仍然維持「面強調」：
> 一整排 Badge 如果每顆都是彩色的字，那一列就變成彩虹。

---

### 3.6 表單

```html
<label class="ad-label" for="xxx">欄位名</label>
<input class="ad-input" id="xxx" type="text" maxlength="40" placeholder="例：王小明">
<div class="ad-hint">解釋這個欄位會影響什麼</div>
<div class="ad-field-err"></div>
```

#### 輸入框是一條線，不是一個盒子

改版前每個欄位都是一個有框、有圓角、有白底的盒子。一頁十二個欄位就是
十二個矩形，盒子自己比裡面的內容還搶眼 —— 而使用者要讀的是
「我填了什麼」，不是「這裡有一個欄位」。

```css
.ad-input,.ad-textarea{
  padding:10px 2px;
  border:0;border-bottom:1px solid var(--line);border-radius:0;
  background:transparent;
}
.ad-input:focus{ border-bottom-color:var(--ink); }
```

- **左右內距收成 2px**：沒有框要躲，文字直接對齊欄位名 ——
  標籤與值在同一條垂直線上。
- **焦點只換那條線的顏色**，不長出任何新的東西。改版前是
  「邊框變深 ＋ 一圈 `--primary-soft` 的光暈」，兩個訊號講同一件事就是噪音。
  線本身從 1.58:1 跳到 15.23:1，比光暈明顯得多。
- **唯讀／鎖住改用虛線底線**（`border-bottom-style:dashed`），
  不再用 `--bg2` 灰底 —— 沒有框的時候，底色會糊成一塊。
- **`<select>` 自己畫的箭頭吃 `background-position: … center`**，
  不再寫死垂直偏移量：底線化之後各處 padding 不同，寫死的值在每一種欄位上
  都會差幾 px。改版前為此在觸控斷點有三條修正，現在一條都不需要。

| Class | 規格 |
|---|---|
| `.ad-label` | `--fs-label`(10px)／`--track-lab`(.16em)／uppercase／`--ink-soft` |
| `.ad-input` `.ad-textarea` | 全寬、`10px 2px`、`--fs-input`(16px)、底線 1px，focus 時底線轉 `--ink` |
| `.ad-input.is-locked` `:disabled` | 虛線底線 ＋ `--ink-3`，**不是灰底** |
| `.ad-textarea` | 多一層 `--bg2` 的面 ＋ `padding:10px 12px`，底線留著 |

> **多行欄位有面，單行欄位沒有。** 底線化之後單行 input 和 96px 高的
> textarea 長得一模一樣 —— 唯一的線索是右下角那顆極小的 resize 把手，
> 空的時候更看不出來。加一層 `--bg2` 之後「**一條線 ＝ 一行、一塊面 ＝ 一段**」
> 自己就說得通，而且沒有把四邊框加回來：線仍然是唯一的邊界，面只是襯底。
> 左右內距跟著補回來 —— 字貼著面的邊緣會像沒對齊。
| `.ad-input-sm` | `max-width:130px`（數字欄位） |
| `.ad-input-time` | `<input type="time">` 專用寬度（瀏覽器會多畫 AM/PM 與時鐘） |
| `.ad-hint` | `--fs-pill` `--ink-soft`，說明**後果**不是重複欄位名 |
| `.ad-field-err` | `--alert`，`:empty` 時不佔高度 |
| `.ad-check` | checkbox ＋ 文字，`accent-color: --primary-deep` |
| `.ad-toggle` | 開關：一顆真的 checkbox（鍵盤、讀螢幕都照舊）藏在上面，畫面上是 44×24 的軌道 ＋ 16px 的把手（`.ad-toggle-track`，**Switch 用的也是這一條**，見 3.6b）。**打開＝ `--ink` 實心**，和 `.ad-chip.is-on` 同一套「選中」語彙 —— accent 的職責是「記號」不是「開啟」，一排 accent 的開關讀起來像一排警示。**只用在「按下去就生效」的地方**（「頁面設定」分頁），要按儲存才算數的維持 `.ad-check`。沒開通那幾列的 toggle 是 `disabled` 的：CSS 給它 `pointer-events:none`，點擊才落到外層的 `<label>` 上，按下去才有話回他 |
| `.ad-input-when` | `<input type="datetime-local">` 專用寬度（`max-width:240px`） |
| `.ad-sub-sec` | 表單裡的小節：左邊一道細線，**不是一張卡** |
| `.ad-sub-sec-bare` | 同上但不畫那道線。給「一顆 Switch ＋ 一句說明」這種小節（郵寄服務）：前面已經有一排膠囊在分段，再加一道線只是多一層框 |

> 輸入框的字級固定 `--fs-input`(16px)：iOS Safari 只要聚焦 <16px 的欄位就會
> 把整頁放大，之後版面往右偏，使用者得自己雙指縮回來。
> **這是平台的硬下限，不是設計選擇**，所以它沒有跟著 `--fs-ctl` 收到 15px。

---

### 3.6b Switch `.ad-switch`（開啟一個服務）

```html
<label class="ad-switch">
  <input type="checkbox" id="adAskMail" role="switch">
  <span class="ad-toggle-track" aria-hidden="true"></span>
  <span class="ad-switch-lab">提供喜帖／喜餅郵寄</span>
</label>
```

- **軌道就是 `.ad-toggle-track` 本人**（見 3.6 的 `.ad-toggle`）：
  44×24 ＋ 16px 的把手，開啟時轉 `--primary-deep`。
  後台只有一種開關長相 —— `.ad-switch` 在它外面多做的只有「右邊接一行字」，
  不另外畫一條自己的軌道。
- 原生 checkbox `opacity:0` **疊在軌道上**（**不是 `display:none`**，也不是
  縮成 1px 藏到角落）—— 它仍然在無障礙樹裡、`role="switch"` 掛在它身上，
  而且點擊、螢幕閱讀器與自動化測試點到的都是它本人。焦點框畫在軌道上。
- `(pointer:coarse)` 時整顆的 `min-height` 撐到 44。

**和 Checkbox 的分工（這一條最容易弄反）：**

| 使用者在想什麼 | 元件 |
|---|---|
| 「我要不要收集這項資料？」（表單上多一題／少一題） | Checkbox |
| 「我要不要開啟這個服務？」（開了會長出一整段設定） | Switch |

所以「喜帖領取方式」是 Checkbox，而「提供郵寄」是 Switch ——
後者一開，賓客那邊會多出郵寄選項與**收件地址那一整段**。

---

### 3.6c Radio group `.ad-radios`

```html
<div class="ad-radios" role="radiogroup" aria-labelledby="adEvqKindLab">
  <label class="ad-radio"><input type="radio" name="k" value="choice" checked><span>單選</span></label>
  <label class="ad-radio"><input type="radio" name="k" value="multi"><span>多選</span></label>
</div>
```

幾個模式只能選一個（題型、模式切換）。長得像 chip，但**圓角是 `--radius` 不是膠囊**
—— 它是輸入元件，chip 是篩選器，兩者不要看起來一樣。選中的那一顆轉 `--surface` ＋ `--ink` 框。

---

### 3.6d Conditional reveal `.ad-reveal`

```html
<label class="ad-check"><input type="checkbox" id="adAskCard"><span>喜帖領取方式</span></label>
<div class="ad-reveal" id="adCardReveal">
  <div class="ad-chips ad-chips-preview ad-chips-soft" id="adPreviewCard"></div>
</div>
```

有前置條件的設定：**條件不成立時整塊不存在（`hidden`），不是灰掉。**
不另外加標題或左邊的分隔線 —— 勾了才出現、取消就整塊消失，
「這一段隸屬於上面那個勾選框」已經由出現／消失本身講完了。

> 灰掉的欄位仍然佔著版面、仍然會被讀出來，而且看不出「要怎樣才會變成可以改」。
> 收起來比較誠實：**沒有前提就沒有這一段。**

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
| 排桌・待安排名單 | `spSearch` | `.ad-filter-sm`＋`.sp-search` | — |
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

提示字一律 `--ink-3`（`.ad-filter::placeholder`，和 `.ad-input` 同一條）。
本來 `.ad-filter` 沒被寫進那條規則，吃的是瀏覽器預設的冷灰 —— 同一頁上兩種灰。

排桌那一顆多一個放大鏡（`#shin9-search`，Feather 的 search）：
**16×16、`--ink-3`**，畫在框裡不是框旁邊。它跟提示字同色是刻意的 ——
它不是一顆可以按的東西，是那句提示字的一部分；染成主題色的話，
空的輸入框裡最顯眼的會是它。

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
- 尺寸只有兩種：預設（`8px 2px`／`--fs-ctl-sm`）與 `.ad-filter-sm`（`7px 2px`／`--fs-meta`）。左右內距是 2px，不是 12px —— 它和 `.ad-input` 一樣是一條底線（3.6）。
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

**選中的分頁只有兩個訊號：字轉 `--ink` ＋ 一條定位線滑過去。**

改版前是「白底 ＋ 字重 500 ＋ 同色定位線」三個疊在一起，而且子分頁每一顆
都畫成實體頁籤（有框、有底、上面兩個圓角）—— 一排五顆就是五個矩形，
比它們要分的內容還搶眼。

**線是滑的不是跳的。** 那一下位移就是「我從哪一頁到哪一頁」，
是這個元件唯一要講的事；換成靜態的框線就等於沒有這個元件。
位置由 `js/ad-tabmarker.js` 量（見下），CSS 只管它長什麼樣與怎麼滑。

| | `.ad-tab`（側欄・直式） | `.ad-subtab`（分頁內・橫式） |
|---|---|---|
| 位置 | `.ad-side`，≥900px 常駐 | `.ad-subtabs`，緊貼內容上方 |
| 字級 | `--fs-ctl`／`.14em` | `--fs-ctl`／`.14em` |
| 內距 | `11px 14px`（`padding-left` 補回線寬） | `11px 0`，靠 `gap:26px` 分開 |
| 未選 | 無底、`--ink-soft` | 無底、無框、`--ink-3` |
| hover | `--ink` ＋ 半透明 `--surface` | `--ink-soft`（只有字變） |
| **選中** | `--ink` ＋ `font-weight:500` | `--ink` ＋ `font-weight:500` |
| **定位線** | `.ad-navmark`：左邊 **2px** `--primary` | `.ad-tabmark`：下面 **1px** `--ink` |
| 面板 | `.ad-panel.is-on` | `.ad-subpanel.is-on` |

**兩條線刻意不同色，這是規則不是漏改：**

- 側欄是 `--primary`。它旁邊就是同一支色的圖示，兩者讀成同一件事；
  而且「選中的定位線」本來就是 accent 的五個位置之一（§2.1）。
- 子分頁是 `--ink`。那一排字旁邊沒有別的顏色可以呼應，accent 擺上去
  會變成整片米色裡唯一一點彩色，搶過它要分的內容。

線寬也不同：側欄 **2px**（一條長的直線，1px 會糊掉；未選時是同寬的透明邊，
切分頁時字不會左右跳），子分頁 **1px**（貼著 `.ad-subtabs` 那條 1px 底線）。

#### 定位線怎麼被放上去的

`js/ad-tabmarker.js`（後台與收禮台**各自** `<script defer>` 載一次 ——
butler 不載入 `admin.js`，同 `cropper.js` 的處理）。

- 用 **MutationObserver** 看 `.is-on` 換人，不是在每個切分頁的地方補一行。
  `.is-on` 在四個地方被掛上／拿掉（側欄點擊、hash 變更、鎖定重繪、
  收禮台自己的切換）—— 補四行就是四個會各自漂掉的地方。
- 量 `offsetLeft`／`offsetTop` 而不是 `getBoundingClientRect()`：
  兩條線都是 `absolute` 掛在會捲動的容器裡，要的是「在內容裡的位置」。
- 連續變動用 `requestAnimationFrame` 收斂成一次（切分頁時 `.is-on`
  會先拿掉再掛上）。
- `document.fonts.ready` 之後重量一次 —— 字還沒到之前量到的寬度是備用字算的。
- 分頁收在摺起來的群組裡時 `offsetParent` 是 `null`，那時候拿掉 `.is-ready`
  讓線淡掉，等群組展開再量。

> **不要把 `transition` 從 `.ad-tabmark` / `.ad-navmark` 上拿掉。**
> `tests/ui-consistency.mjs` 第 10 段會驗 `transition-property` 含 `transform`：
> 那一條就是為了守住「線是滑的」。

其餘：

- 兩者的 hover 都包在 `@media (hover:hover) and (pointer:fine)` 裡 ——
  觸控裝置上 hover 會「黏住」，看起來像選錯了分頁。
- `.ad-subtabs` 可橫捲，用 `.ad-scrollx` 的遮罩漸層暗示「右邊還有」
  （捲軸藏起來之後，那是唯一的線索）。
- `data-count="2"` 或 `"3"` 時窄螢幕排成等寬三段（`gap:0` ＋ `flex:1`），
  就不用捲了（收禮台的三顆就是這樣）。沒有框之後它不再是 segmented control，
  只是三段等寬的字，定位線一樣滑得過去。
- 窄螢幕 `.ad-subtabs` sticky 在頂列下面，高度餵給 `--ad-subtabs-h`，
  下面的 `.ad-list-head.is-sticky` 才黏得準。
- `.ad-tab.is-sub` 是側欄的第二階（「排桌管理」從屬於「桌次圖」）：
  縮排到 27px，並用一道 6×1px 的 `::before` 短線接住。
  分組用 `.ad-navgroup`（可摺疊，`grid-template-rows: 1fr → 0fr` 做動畫，
  因為 `height:auto` 沒辦法 transition）。
- `.ad-tab.is-on` 在檔案裡出現兩次：前面那條是基礎，**真正生效的是
  「側欄導覽」那一段的覆寫**。改 active 的樣子要改後面那一條。

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
| `.is-danger` | `--alert`。**永遠排最後**，前面用 `.ad-rowmenu-sep` 隔開 |
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
| `.ad-page-tip` | 頁面設定裡那顆問號帶出來的說明 | 同樣 render 到 `body` ＋ `position:fixed`，但**收得到滑鼠**（裡面有一顆「用官方帳號聯繫」要點得到）。說明不長在那一列裡：撐開一列會把下面整排推下去再收回來，只是想看一句話，整頁跳兩次 |

---

### 3.10 卡片

#### 先決定：這一筆該是「卡片」還是「清單列」？

判準只有一條 —— **一筆裡有幾行、行高是否參差**：

| 一筆的樣子 | 用什麼 |
|---|---|
| 一到兩行、右邊一個數字，上下對得起來 | **清單列**（`--line-soft` 一條線就夠） |
| 三行以上、每行高低不一 | **卡片**（`--surface` ＋框，眼睛才分得出「這幾行是同一筆」） |

所以名字裡有 card 的東西不一定是卡片，這是這份程式碼裡最容易踩的一個坑：

| Class | 名字 | 實際上是 |
|---|---|---|
| `.ad-rcard` | 回覆卡 | **卡片**（一筆三行、高低不一） |
| `.ad-btcard` | 收禮卡 | **清單列**（姓名＋一行說明＋右邊金額） |
| `.ad-msg` | 悄悄話 | **清單列** |

#### 真的是卡片的那幾個

一律：`--surface` ＋ 1px `--line` ＋ `--radius`（4px）。差別只在內距，而內距分四階：

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
| `.sp-card.is-rsvp-maybe` | `--sun`（待確認） |
| `.sp-card.is-rsvp-no` | `rgba(164,103,122,.55)` ＋ `opacity:.66`（無法出席） |
| `.ad-demo-row` | `--line`（示範表裡「壞掉的那一列」） |

換底色只留給「整張要淡出視野」的情況：`.ad-rcard:has(.ad-tag-no){background:var(--bg2)}`
—— 名單掃過去時，要找的是會來的那些人。

> 色帶是給「一堆同類裡的那一張」用的。`.sp-bar`（排桌的狀態列）與
> `.sp-pool`（未安排）都是**整頁只有一個**的面，沒有同類可比，
> 色帶在那裡只是替一頁已經很滿的畫面再多加一個顏色，所以拿掉了 ——
> 它們現在跟其他卡片一樣是 1px `--line`。

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
- `.ad-list-panel` 是唯讀數字清單的變體（`--surface` ＋ 框），
  和統計方格站在一起時才用 —— 不然同一頁上兩塊有框、第三塊突然沒有。

### 3.12 表格 `.ad-table` / `.ad-tablewrap`

- 表頭 sticky、`--bg2` 底、`--fs-pill` `--ink-soft`；`.ad-th-link` 是表頭裡的 pill（3.3c）。
- `.ad-tablewrap` 是一張 `--surface` 的面（會列數字的地方才有面）。
- hover 整列 `rgba(0,0,0,.035)`，只給 `(hover:hover) and (pointer:fine)`。
  釘住的 `.is-name`／`.is-act` 兩欄改吃 `--bg-row-hover`（同一個疊色的實色版）——
  `position:sticky` 的欄位不能是半透明的，見 2.1。
- **窄螢幕一定要有替代版**（見 3.10 末段），不要只加 `overflow-x:auto`。

### 3.13 數字面板

**規則只有一條：要拿來比對的數字，站在一張 `--surface` 圓角的面上；其餘只留線。**
數字本身是 `--ink`，不是品牌色（2.1）。

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
| `.ad-savebar` | sticky 儲存列（毛玻璃 ＋ `env(safe-area-inset-bottom)`）。表單設定用它，婚禮資訊的每一個階段也是（多一個 `.ad-wz-bar`：主要動作在窄螢幕撐滿，「上一步」不跟著撐） |
| `.ad-offline` | 離線橫幅，sticky 在頂列下面，`role="status"` |

### 3.15a 頁首的一行 `.ad-ask` ＋ 細節 `.ad-fine`

**一頁的開頭是：標題 ＋ 一行 `.ad-sec-note`。就這樣。**

原本每一頁的開頭是名詞標題加一段三四行的說明，新人得先讀完才知道要做什麼。
改法**不是**在上面再加一句問句 —— 標題已經是「桌次圖」「收禮明細」時，
再補一句「賓客怎麼找到自己的位子？」只是把同一件事說兩次。
把那一段說明**壓成一行**，剩下的收進 `.ad-fine`：

```html
<h2 class="ad-sec-title ad-page-title">…婚禮小卡</h2>
<p class="ad-sec-note">賓客抽到的就是這裡的照片，選完會一張一張跳出裁切框讓你調。</p>
<details class="ad-fine">
  <summary>SSR／SR 是什麼</summary>
  <div class="ad-fine-body">…</div>
</details>
```

四階各自只回答一個問題，同一頁不要有兩階在講同一件事：

| Class | 字級 | 回答的問題 |
|---|---|---|
| `.ad-page-title` | 21px 明朝體 | 這一頁叫什麼（和側欄那顆分頁同名） |
| `.ad-ask` | 17px 明朝體 | **標題說不出來的那一句**（例外，見下） |
| `.ad-page-sub` | 12px sans | 現在的狀態（幾筆、幾位，由 JS 填） |
| `.ad-sec-note` | `--fs-meta` sans | 一行講完「現在在做什麼」 |

`.ad-ask` 只給**標題撐不住的地方**，全站目前就兩處：

| 哪裡 | 為什麼 |
|---|---|
| 後台首頁 | 標題是「首頁」，等於沒說；那一行才是開場白 |
| 排桌工作區 | 這個 subpanel 根本沒有標題，一打開就是一整片工具（用 `.ad-ask-tight`，高度留給版面） |

要加第三處之前，先問「一行 `.ad-sec-note` 夠不夠」。答案幾乎都是夠。

其餘規則：

- `.ad-sec-note` 最多**一行**。講不完的收進 `.ad-fine`，不要讓它長回三行。
- `.ad-fine` 是純 `<details>`（和首頁的 `.ad-note`、常見問題同一套），**不寫 JS**。
  `summary` 是一句名詞短語（「收起來之後會發生什麼事」），不是「更多」。
- 說明消失不等於資訊消失 —— 改版時把原本那幾段搬進 `.ad-fine-body`，不要刪掉。

#### 婚禮資訊的六個階段 `.ad-wz-*`

「婚禮資訊」那一頁不是一張長表單，是一個總覽 ＋ 六個階段（`#lobby` / `#lobby/01…06`）。
視覺語彙一個字都沒有換（1px 線、無陰影、明朝體標題、`--radius`、同一組 ink／line／primary），
換的是**層級**：改版前只有「段落標題」一階，十幾組欄位平鋪在同一個平面上。

| Class | 說明 |
|---|---|
| `.ad-wz-prog` / `.ad-wz-dots` / `.ad-wz-dot` | 進度：六顆點。不做進度條 —— 那要標題、要百分比，而新人只想知道還剩幾段 |
| `.ad-wz-cards` / `.ad-wz-card` | 總覽的六張卡。和首頁的 `.ad-more-item` 是同一張卡（同樣的框線、hover、箭頭），所以「點下去會換頁」不用學 |
| `.ad-wz-card-state` | 卡右邊的狀態。`.is-done` 用 `--primary-deep`，`.is-soft`（選填）用最淡的灰 —— 選填的段落不該看起來像待辦 |
| `.ad-wz-head` / `.ad-wz-no` / `.ad-wz-title` / `.ad-wz-sub` | 階段頁首。`.ad-wz-title` 是 21px 明朝體，**整個畫面上最大的字**：它就是「現在要完成什麼」 |
| `.ad-wz-back` | 回總覽。不是麵包屑，是一顆按得下去的返回鍵，站在編號**上面**（「我在哪裡」之前要先能「回去」） |
| `.ad-wz-subhd` | 階段裡的小標。比 `.ad-wz-title` 小一階、比 `.ad-label` 大一階 |
| `.ad-wz-picks` / `.ad-wz-pick` | 勾選清單（02 的活動、05 的提醒項目）。整行都是點擊區（≥44px），勾起來換 `--primary-deep` 的框 |
| `.ad-wz-reveal` | 勾了才出現的那一段。收起來是整塊不見，**不加高度動畫** —— 內容高度差很多，慢一點的手機上只會看到一段抖動 |
| `.ad-wz-place` / `.ad-wz-place-loc` | 03 的一組地點欄位（多活動時一個活動一組） |
| `.ad-wz-inline` | 04 的 inline 表單。新增與編輯**共用同一組**，所以同一時間畫面上最多一組輸入框 |
| `.ad-wz-done` | 完成畫面（`.ad-modal-card` 的一種）。列出「你已經準備好」的項目，還沒填的用「還有 N 個項目可以補充」，不用「尚未填寫」 |

> **04 的時間軸**（`.ad-sch-row`）：時間欄固定寬 ＋ 一顆點 ＋ 一條線（`.ad-sch-dot::after`，
> 最後一列不畫）。改版前這裡是「一列三個輸入框」整疊攤開 —— 十筆流程 ＝ 三十個框。
> 現在畫面上是讀得懂的 `10:00　賓客入場`，要改才長出輸入框。

---

### 3.16 詳細抽屜 `.ad-drawer`

| 選擇器 | 誰在用 | 產生方式 |
|---|---|---|
| `.ad-drawer` | 出席回覆詳情、收禮明細詳情 | `admin.js` 的 `Drawer` 模組動態建立 |

> 排桌的賓客詳細資料本來也是一個抽屜（`.sp-drawer`），後來改成彈窗：
> 後台只有它一個是抽屜，同一件事有兩種開法，使用者就得學兩次。
> 規格本身沒有動 —— 下一個「看一筆的完整內容」仍然用這一份。

#### 規格

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

   `.ad-drawer` 在 `open()` 裡自己推一層；靜態標記的彈窗（含排桌那幾個）
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

- `min(92vw, 420px)`、`--surface` 面、1px 框、`--scrim-modal`（.72）。
- `.ad-modal-card-form` 是可捲的 → `.ad-modal-actions` **sticky 在卡片底部**。
- 標題那一列要站第二顆東西（標籤編輯的「刪除標籤」）時包一層 `.ad-modal-head`：
  次要的破壞性動作放**標題右邊**，不要和底部的「儲存」並排 —— 並排就是一樣重要。
- `≤560px` 自動變 bottom sheet：貼底、上緣一條 drag handle、可往下滑關掉
  （手勢只從最上緣 44px 起手，不然會和內容捲動打架）。
- `.is-danger` 讓標題轉危險色。
- 每一個 `.ad-modal-mask` 都由 `bindAllLayers()` 自動註冊 layer。

**抽屜還是彈窗？** 背景還需要看得到（在名單上點某一筆看細節）→ 抽屜；
必須先回答才能繼續（刪除確認、新增一筆）→ 彈窗。

### 3.19 Toast `.ad-toast`

`.ad-toast-stack` 固定在底部置中、可疊。`--surface` 面 ＋ `--ink` 框 ＋ `--shadow-pop`；
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
| 焦點 | `:focus-visible` → 2px `--primary-deep` ＋ 2px offset。輸入框是**底線轉 `--ink`**（1.58:1 → 15.23:1），不再加一圈光暈 —— 兩個訊號講同一件事就是噪音。**兩頁都有**（規則掛 `body:is(admin, butler)`） |
| 觸控熱區 | 圖示按鈕（✕ ☰ ⋮ ↑↓）與選單項 `(pointer:coarse)` 一律 **44×44**；pill 與 chip 是 32（獨立）／28（嵌在一行字裡）—— 28 偏小，見「已知落差」 |
| 對比 | 小字的次要色用 `--ink-soft`（`#5C564C`，於 `--bg1` 6.85:1）；內容最小字級 `--fs-pill`(11px)、欄位名 `--fs-label`(10px)。第三階墨 `--ink-3` **不准站在 `--bg2` 上**（4.07:1），見 2.1。改版前 `--primary-deep` 的 2.57:1 缺口已經補掉（現在 7.22:1） |
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
| 抽屜 | `.ad-drawer` 的尺寸、層級、dialog 語意、遮罩、CTA 貼底 |
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
| **`--primary-soft`／`--alert-wash` 的正式色值** | Ivory 這一版沒有拿到這兩支的正式色票，現在用的是試算值（`#FDEEE7`／`#FBEDEA`）。**待設計覆核。** 風險很低：`--primary-soft` 的 11 處全部是「這一格正被選中／命中」的暫時底色，`--alert-wash` 只有 2 處（錯誤 toast 的底、示範列的壞例子），沒有一處是永久的面 —— 改色值只要動 `admin.css` 那一行，不會動到任何選擇器 |
| **Optima 有裝置差異** | `--font-display` 第一順位是 Optima，但它只有 macOS／iOS 內建。Windows／Android／Linux 會逐字 fallback 到 Noto Serif TC —— 標題與數字在非 Apple 裝置上看起來和改版前一樣。要讓所有平台一致，得採購 web font 授權並自行 host（`@font-face`），不在這一版的範圍 |
| **底線輸入框的 `<textarea>`** | 四邊框改成底線之後，96px 高的 `.ad-textarea` 只剩最底下那一條線，多行欄位的邊界比單行欄位難認。這是底線式表單的已知取捨（Material 的 standard variant 也一樣），先照 Ivory 的規格上線；如果實際使用回饋說「不知道可以打字」，最小的改法是只給 textarea 一個 `--bg2` 的極淡填色，其餘欄位不動 |
| **間距還沒收成九的級數** | Ivory §03 要把間距收成 9 的倍數（9/18/27/36/54/72/108/144）。目前全檔有 820 處 `padding`／`margin`／`gap`，光 `gap` 就用掉 1–34px 十幾種值。這是 Ivory §14 自己排在最後一批的事（「範圍最大、感受差最小」），這一版沒做 |
| **Pill 的觸控熱區** | 自訂規範把 pill 從 36／32 收成 32／28。28px 低於一般建議的觸控下限，`.ad-eye`（顯示金額）與 `.ad-th-link`（表頭標籤）在手機上會比較難按。圖示按鈕與選單項仍是 44 |
| `.ad-modal-mask` 的 dialog 語意 | 16 個彈窗（後台 14 ＋ 收禮台 2）都沒有 `role="dialog"`／`aria-modal`；抽屜兩個都有了。要補就一次補齊，不要補一半 |
| 焦點歸還 | 抽屜／彈窗關閉後沒有把焦點還給觸發它的那顆按鈕 |
| `.ad-side` 的 `inert` | <900px 收起來時只是 transform 移出畫面，內容仍可被 Tab 到 |
| layer stack 兩份實作 | `admin.js` 的 `pushLayer()` 與 `butler.js` 的 `pushSheetLayer()` 邏輯相同（butler 不載入 `admin.js`）。改一邊要記得改另一邊 |
| `normKey()` 兩份實作 | 同上（butler 不載入 `common.js`），內容必須保持一字不差 |
| ~~排桌還有幾處 10.5px~~ | **已修掉。** 字級收成變數的那一輪把 9／10／10.5px 一律歸到 `--fs-label`(10px)、11／11.5px 歸到 `--fs-pill`(11px)，全檔沒有第三種小字了 |
| `.sp-card-move` 熱區 | 32×32，而它只在 `(hover:none)` 出現 —— 也就是永遠在觸控上。放大到 44 需要賓客卡本身跟著長高，那是整個排桌板的版面變動 |
| `.ad-btcard`／`.ad-msg` 的命名 | 名字有 card，實際是清單列（見 3.10）。改名要動 CSS、JS 與測試，值得做但不該夾在別的改動裡 |
