# 新人後台 × Craft 改版｜執行指令（精簡版）

這一份是原始改版提案扣掉兩類項目之後的結果：

- **已達成的** —— 現況程式碼已經做到，不要重做
- **有衝突的** —— 會撞到 Security Rules、既有的行動版決定，或現有技術做不到

剩下的每一項都是**可以直接動工**的。條目後面的檔案位置是現況的實作點。

---

## 前提：不要改變的東西

現況的品牌視覺已經到位，改版**只加互動，不動視覺語言**：

暖米白背景（`--bg1:#fbfaf7`）・1px 細線・無陰影・明朝體・大量留白・`--radius:2px`

Craft 只是 interaction reference。品牌仍然必須是「婚禮」，不是 Linear／Notion／Stripe。

要追求的不是「看起來很有設計」，而是「使用者用起來覺得很順」——
高級感來自 Spacing、Hierarchy、Motion、Feedback、Consistency、Progressive disclosure，
不是圓角、陰影、顏色、插畫。

---

## 一、漸進揭露：UI 不要一直存在

預設狀態保持乾淨，只有 hover / focus / select / click / drag / edit 時才出現操作。

**要做：**

1. RSVP 表格每一列右邊常駐的「刪除」改成 `⋯` row menu
   → 現況：`admin.js:1483`（`<td class="is-act">`）
   → **基礎建設已經有了**：`registerRowMenu()` / `openRowMenu()`（`admin.js:380-460`），婚禮小卡、故事牆、桌次名單已在用。這是把 `.ad-del` 換成 `rowMenuBtn()`，不是從零做。

2. `.is-act` 欄改成 **sticky right**
   → `.ad-table` 是橫捲容器，`⋯` 在最右邊時使用者根本看不到它存在。和現有的 `.is-name` sticky left 對稱。

**三個必要條件（沒做到就會壞掉）：**

- **觸控裝置必須有常駐版本** —— `@media (hover:none)` 時 `⋯` 要一直在。現況 `admin.css:1416` 已經有這個模式（`.ad-del-inline` 在觸控時隱藏），照抄即可
- **鍵盤要能觸發** —— 一起綁 `:focus-within`，否則 Tab 過去按鈕是隱形的
- 表格 hover 底色從 `rgba(0,0,0,.018)` 提到 **3–4%** —— 現在的 1.8% 幾乎看不見（`admin.css:449`）

---

## 二、Sidebar 資訊架構

現況是 10 顆平鋪的 `.ad-tab`（`admin.html:82-91`），重新分成三組：

```
婚禮管理        婚禮內容        賓客互動
  出席回覆        婚禮資訊        悄悄話
  桌次            感謝信          新人熟悉測驗
  排桌管理        婚禮小卡
  收禮小幫手      新人故事牆
```

Group label 要非常低調。不要厚重的 sidebar 背景，維持微妙暖灰 + 細線。

**分組本身安全** —— 點擊是委派的（`admin.js:1068`，`closest('.ad-tab')`），`tabButtons()` 用後代選擇器（`admin.js:1005`），包一層 `<div>` 不會壞。

**但三件事一定要處理：**

| # | 問題 | 位置 |
|---|---|---|
| 1 | `applyTabVisibility()` 是逐顆 `btn.hidden = ...`。某些站台沒開排桌管理／收禮小幫手，該組可能只剩 2 顆甚至 0 顆 → 會留下**空的 group label**。要加「整組都 hidden 就連 label 一起藏」 | `admin.js:848-851` |
| 2 | 收合狀態**必須永遠讓 active item 所在的群組展開**，否則 `activateTab()` 的 fallback 會把人丟到一個看不見的群組裡 | `admin.js:1029-1031` |
| 3 | 「桌次」與「排桌管理」是兩個獨立的 feature flag（`TAB_PAGE`），而「桌次名單」裡的 `#adSeatSyncPlan` 依賴排桌管理是否開啟。分組不會壞這個邏輯，但視覺上要看得出從屬關係 | `admin.js:820-834` |

**Active state 已經很接近了**（`admin.css:74` 是白底 + 2px 左側金線，不是藍底），只要收成 1px 並加上字重變化。

---

## 三、Sidebar Interaction

### Hover
背景緩慢淡入、文字微幅變深、150–200ms。

### Section collapse
group 可收合，用 `height + opacity` transition，不要瞬間消失。

**現況沒有任何收合動畫的基礎建設** —— `[hidden]` 都是硬切。`height:auto` 不能 transition，要用 `grid-template-rows:0fr → 1fr` 或量測 `scrollHeight`。收合狀態存 `localStorage`。

### Tooltip
hover navigation item 時淡出說明這個功能有什麼用。例如：

> **婚禮資訊** —— 賓客會在首頁看見的婚禮重要資訊，可以編輯時間、交通資訊、禮金、Dress Code 等，也能新增自訂連結或內容。

Tooltip 要非常簡潔，不要大型卡片。

**兩個定位陷阱：**

1. `.ad-side` 是 `overflow-y:auto`（`admin.css:60-64`），tooltip 放在側欄 DOM 裡**會被裁掉**。必須 render 到 body 並 `position:fixed`
   → 現成參考：`.sp-peek`（`admin.css:945`）和 `.ad-rowmenu`（`admin.css:1276`）都是這樣做的，定位邏輯可以直接抄
2. `<900px` 時 `.ad-side` 是 fixed 抽屜而且是觸控裝置 —— tooltip 要**完全關掉**，只綁 `@media (hover:hover) and (pointer:fine)`。否則會變成「點一下跳出說明，然後才切分頁」

---

## 四、Top Navigation

現況（`admin.html:56-70`）：

```
新人後台
{couple}・{email}                    [查看網站] [登出]
```

改成：

```
新人後台
謝明翰 ＆ 姚纓庭                      查看網站 ↗   [使用者帳號 ▾]
```

email 降低視覺層級。「登出」不要一直是最明顯的按鈕，收進 account popover：

```
帳號
────────
email
查看網站
帳號設定
登出
```

**四件事要處理：**

1. `#adWho` 現在是**一個字串塞兩件事**（`admin.js:876`：`` `${couple}・${email}` ``），要拆成兩個節點
2. 「查看網站」「登出」各有**兩份** —— 桌機在 `.ad-bar-actions`（`#adViewBtn`/`#adLock`），`<900px` 搬進抽屜底部（`#adViewBtnMobile`/`#adLockMobile`）。改成 popover 之後要重新決定手機版的擺法
3. **可以沿用現成樣式**：`common.css:126-141` 已有一套 `.nav-user-btn` / `.nav-user-pop`（賓客頁在用）。但後台不載入賓客導覽列（`common.js:1175`），要複製一份到 `admin.css`，**不要直接共用 class 名稱**以免互相污染
4. ⚠️ `syncStickyMetrics()`（`admin.js:154-167`）會量 `.ad-bar` 高度寫進 `--ad-bar-h`，底下所有 sticky（子分頁列、篩選彙總、離線橫幅）都吃這個變數。**改頂列高度／行數，這些全部會跟著動**，改完要確認 `--ad-stick-top` 還對

---

## 五、Page Header System

每個頁面建立一致的 page header，不要讓 button 與 heading 看起來像兩個系統。

**先做一個結構決定 ——** 現況的標題階層是：

| 層級 | class | 字級 |
|---|---|---|
| 產品名 | `.ad-bar-title` | 19px serif |
| （沒有 page title） | — | — |
| 子分頁 | `.ad-subtab` | 13px |
| 區塊 | `.ad-sec-title` | **15px** serif |

原提案的 24–28px 會**壓過頂列的 19px 產品名**，而且「一頁一個 header」對不上現況結構 ——
例如「收禮小幫手 → 收禮統計」一個 subpanel 裡有**三個** `.ad-sec`（收禮統計／收禮明細／誰記了多少，`admin.html:780-840`），
提案舉的「收禮明細 + 2 筆 + 匯出 CSV」其實是第二個 section，不是頁面標題。

**所以改成兩層，不要把 `.ad-sec-title` 直接放大：**

```
收禮明細                              ← .ad-page-head，20–22px serif，一個 subpanel 一個
2 筆收禮紀錄                          ← sans、smaller、muted
                            匯出 CSV  ← minimal button、細框

誰記了多少                            ← .ad-sec-title 降到 13–14px，變成小節分隔
```

**唯一要改的按鈕樣式：** `.btn` 主要按鈕現在是深色實心，hover 時整顆**翻成透明**（`common.css:161`）—— 這是很大的視覺跳動，和「hover 微幅變化」相反。改成亮度／邊框的小幅位移。

（`.ad-sec-head` + `.ad-sec-head-actions` 的排版與 `.btn.small.ghost` 的細框樣式維持不動。）

---

## 六、Table：Row click 開 Detail Drawer

整列可 click，點擊後從右側滑出 detail drawer，**不要跳頁**，背景頁面保持可見。

**四個必要條件：**

1. **列裡有互動元素** —— RSVP 的標籤欄有 `<button data-tag-edit>`（`admin.js:1435`），動作欄有 `⋯`。這些要 `stopPropagation`
2. **使用者會選取儲存格文字** —— 備註、地址、給新人的話都是長文字。要判斷 `getSelection().isCollapsed`，否則會和文字選取打架
3. **收禮明細的 `<tr>` 目前沒有 id**（`admin.js:4560-4571`），要先補 `data-entry`
4. **手機不是表格** —— `isNarrow()` 時 RSVP 走 `rsvpCardsHtml()`、收禮走 `btCardsHtml()`（`admin.js:4546`），而且卡片上已有「展開更多」（`.ad-rcard-more`）。Drawer 只做桌機，手機維持就地展開或改 bottom sheet

---

## 七、Detail Drawer：抽成共用元件

**不要重新設計規格。** `.sp-drawer`（`admin.css:1035-1060`）現有的規格已經完全對：
`min(92vw,400px)`、暖白底（`--bg1`）、左側 1px border、220ms 進場、CTA 貼底（`.sp-drawer-foot`）。

**要做的是兩件事：**

1. **從 `seating-plan.js` 抽出來變成共用元件**，讓 RSVP 與收禮明細也能用
2. **註冊進 `pushLayer()` / `popLayer()` 圖層堆疊**（`admin.js:246-300`），這樣返回鍵與 Esc 才會正確關掉它、背景才會正確鎖捲

**一個微調：** 遮罩現在是 `rgba(43,47,54,.42)`，偏重。降到 `.2` 或改成不加遮罩、只留左側 border + 極淡陰影 —— 「背景保持可見」才成立。

---

## 八、Inline Editing

hover 顯示可編輯 → 點擊變輸入框 → Enter 儲存、Escape 取消 → 出現 1–2 秒的 `✓ 已更新` 就消失。
不要走「點編輯 → 開 modal → 修改 → 儲存」。

**可以做的對象（只有這三個）：**

| 對象 | 狀態 |
|---|---|
| **收禮明細的金額／盒數／備註** | ✅ 規則允許（`firestore.rules:645`），註解也明講「現場記錯金額是常態，能當場改掉比留一筆錯的有用」 |
| **RSVP 的標籤** | ✅ 存在 `rsvpTags/{rsvpId}`，`allow create, update: if isSiteOwner` |
| **婚禮小卡的卡名／等級／說明、桌次圖標題** | ✅ **已經是就地編輯 + change 自動存**，缺的只是 `✓ 已更新` 的微回饋（現在走 toast） |

**收禮明細的兩個條件：**

1. ⚠️ 規則是 `allow update: if butlerOpen(bookId) && ...` —— **只在收禮簿「開著」時**。新人把簿子停用後（婚禮結束的常見狀態）會拿到 `permission-denied`。UI 必須知道 `butlerOpen` 狀態，停用時把欄位變唯讀，**不要讓人打完字才報錯**
2. ⚠️ `isValidButlerEntry()` 有型別與範圍檢查（`amount`/`boxes`/`people` 是 int、上限 99）。送出前要做同樣的驗證，否則使用者只會看到一句 permission-denied

**最重要的技術陷阱 ——**

Firestore 的即時快照會把使用者正在打的字洗掉。`guardedRender()`（`admin.js:633-656`）就是為此寫的，
註解裡有完整說明：「接著的 change 就落在一個已經被丟掉的節點上，那一筆修改直接消失」。

→ **任何新的 inline editing 都必須走 `guardedRender()`**，不能自己接 `onSnapshot` 直接重畫。

---

## 九、CSV Export 欄位選擇

「匯出 CSV」點擊後先問要匯出什麼：

```
匯出資料
選擇要匯出的內容：
☑ 姓名   ☑ 桌次   ☑ 禮金
☑ 禮餅   ☑ 人數   ☑ 備註
                    [取消] [匯出 CSV]
```

Modal 要非常簡潔，不要大型 SaaS modal。

**兩件事：**

1. ⚠️ **RSVP 的欄位是動態的** —— `rsvpColumns()`（`admin.js:1387-1396`）依表單設定決定要不要有 標籤／聯絡資訊／喜帖／喜餅／留言 五欄。欄位選擇器**必須從 `rsvpColumns()` 生成**，不能照上面的例子硬寫六個 checkbox（那組其實是收禮明細的欄位）
2. ✅ **可以直接沿用 `.ad-modal-card-form`**（`admin.css:695-700`）—— 它已經有 sticky 底部按鈕列，`<560px` 也已經是 bottom sheet

現況：`downloadCsv(name, header, rows)`（`admin.js:494-511`），兩個呼叫點（`#adRsvpExport`、`#adBtExport`）。

---

## 十、Motion：token 化 ＋ reduced-motion

**時長不用改** —— 現況是 `.12s`–`.28s`，本來就落在對的區間。

**要做三件事：**

1. **抽成 token** —— 現在是 20 幾處硬寫的字面值，分散在 `admin.css` 各段：
   ```
   --dur-hover:150ms;  --dur-btn:180ms;  --dur-pop:200ms;
   --dur-drawer:260ms; --dur-page:200ms;
   --ease:cubic-bezier(0.22, 1, 0.36, 1);
   ```
2. **easing 全部從 `ease` 換成 `ease-out` / 上面那條 cubic-bezier**（現況 20 處都是 `ease`）
3. ⚠️ **補上 `prefers-reduced-motion`** —— `common.css` 與 `admin.css` **完全沒有**（只有 `wall.css:42`、`exhibition.css:39`、`shortlink.html:50` 有）。要一併處理：
   - `common.css:57` 的 `html{scroll-behavior:smooth}`
   - `.ad-skel-line` 的無限 shimmer 動畫（`admin.css:590`）
   - `admin.js:333` `bindSheetSwipe()` 裡 JS 寫死的 `transform .18s ease`

**順便：** `.ad-panel.is-on{animation:scInF .35s}` 的頁面轉場是 350ms，收到 200ms。

避免 bounce、overshoot、excessive spring、大幅位移。Motion 的目的不是炫，是讓介面有生命。

---

## 十一、Interaction States：補完 focus 與 success

每個互動元素都要有明確的 Rest → Hover → Active → Focus → Disabled → Loading → Success → Error。

**現況覆蓋：**

| State | 狀態 |
|---|---|
| Rest / Hover | ✅ 完整，而且已正確用 `@media (hover:hover) and (pointer:fine)` 包住 |
| Disabled | ✅ `.btn:disabled`、`.ad-pager-btn:disabled`、`.ad-rowmenu-item:disabled` |
| Loading | ✅ `.is-saving` + `runSave()`（`admin.js:105-140`）是全站統一機制 |
| Error | ✅ `.is-invalid` + `.ad-field-err` + `liveValidate()`（`admin.js:531`） |
| **Focus** | ⚠️ **`admin.css` 整份 1818 行只有一個 `:focus-visible`**（`.sp-card`，`admin.css:900`） |
| **Active（按下）** | 🔧 只有 `.btn:active{opacity:.8}` 和幾個觸控 `:active`，不成系統 |
| **Success** | 🔧 只有 toast，沒有就地回饋 |

→ **這一節的重點不是加動效，是補 focus ring 並把 active / success 系統化。**

---

## 十二、Card Design：拆掉兩處卡片堆疊

普通資訊優先用 typography + spacing + divider，不要 card inside card inside card。

清單頁現況已經是純線條（`.ad-list` / `.ad-item`），不用動。**堆疊只集中在兩處：**

1. **RSVP 總覽** —— `.ad-hero-stat`（白框）內含 `.ad-hero-split` → 底下接 `.ad-donuts`（每個 `.ad-donut` 又是白底 + 四邊框線）→ 再接 `.ad-sec-note`。等於「框中有格、格旁有框」
2. **表單類** —— `.ad-sub-sec`（`admin.css:216-220`，白底半透明框）巢狀在 `.ad-sec` 裡，婚禮資訊那一頁有好幾層

**順便收斂陰影：** `.sp-peek`（`0 6px 22px`）、`.ad-rowmenu`（`0 8px 26px`）、`.ad-filtersum`（`0 6px 18px`）、
窄螢幕的 `.ad-side`（`2px 0 18px`）—— 這四個是浮層，陰影在表達層級沒問題，但 22–26px 的模糊半徑對這個品牌偏重，收到 **12–16px** 並降低 alpha。

---

## 十三、Typography：雙軌

建立兩套字體：

- **Editorial（serif／明朝體）** —— Page title、Wedding name、Important numbers、Empty state headline
- **UI（sans）** —— Navigation、Table、Button、Form、Metadata、Timestamp、Status

讓產品同時有「婚禮品牌的氣質」與「成熟產品的可用性」。

**三個必要條件：**

1. ⚠️ **變數是全站共用的** —— `--font-body` 定義在 `common.css:24` 的 `:root`，賓客頁全部吃這個。
   改掉它，賓客的婚禮頁會整個變樣。
   → **必須新增 `--font-ui`，而且只在 `body[data-page="admin"]` 底下覆寫。不要改 `--font-body` 的定義。**
2. **CJK 字重負擔** —— 現在載了 `Noto Serif TC` 四個字重（`admin.html:17`）。再加一個 CJK sans 家族，繁中字集很大。
   → 只載 **兩個字重（400 / 500）**，fallback stack 用 `system-ui, "PingFang TC", "Microsoft JhengHei", sans-serif`
   （這幾個在目標裝置——台灣的 iPhone / Mac / Windows——本來就有，`font-display:swap` 的閃動會很小）
3. 改字體時順便確認 `common.css:73` 那條把 box-shadow 歸零的長 selector 沒有誤傷後台元件（它沒有涵蓋 `.ad-*` 前綴）

（數字已經做對了：`tabular-nums` 在 `.ad-hero-num`、`.ad-donut-center b`、`.sp-table-no`、`.ad-btcard-amt` 都有。）

---

## 十四、Empty State

不要只是「目前沒有資料」。用 editorial typography，給一句說明和一個出口：

```
尚未收到賓客回覆

你的婚禮賓客回覆會顯示在這裡。

[查看婚禮小卡]
```

**有現成的好範例可以推廣：** `.ad-donuts-empty`（`admin.css:1330-1334`）已經是這個樣子——虛線框 + 兩行說明 + CTA；
收禮連結的空狀態（`admin.js:4625-4632`）也有「產生第一組連結」。

**要做的：** 把 `.ad-empty` 升級成接受 `{ title, body, action }` 的函式，
再把 **21 個呼叫點**（`admin.js` 19 處 + `seating-plan.js` 2 處）分批換掉。
Headline 用 `--font-display` 20–24px。

不要傳統 SaaS 插畫。

---

## 十五、Loading：表格形狀的 skeleton

`skeletonHtml()`（`admin.js:657-667`）+ `.ad-skel-line` 的 shimmer 已經在用，
而且註解明講是為了「跟真的沒資料的空狀態區分開」——**機制不用重做**。

**只差一件事：** 現在輸出的是通用的兩行灰條，不會對齊表格欄位。讓 `skeletonHtml()` 接受欄寬陣列，
在表格情境輸出 `<table>` 骨架：

```
姓名       桌次       禮金
████       ██         █████
████       ██         █████
```

（shimmer 動畫的 reduced-motion 處理見第十節。）

---

## 十六、Feedback：分成兩層

原提案要「所有成功操作都用非常安靜的 feedback」，但現況有兩個功能**必須維持可見、可點、夠久**：

- **重試** —— `writeFailed(err, retry)`（`admin.js:72-97`），弱網／逾時時 toast 上有「重試」
- **復原** —— `scheduleUndoDelete()`（`admin.js:774-800`），刪除是「先從畫面移除 + toast 給復原」

**所以分成兩個元件，不要用同一個：**

| 層 | 用途 | 樣式 |
|---|---|---|
| **就地回饋**（新增） | 單一欄位存檔成功 | 欄位旁 `✓ 已更新`，1.5s 淡出，不佔畫面 |
| **Toast**（保留機制） | 錯誤、重試、復原、離線 | 保留行為，但深色實心（`background:var(--ink)`）可以改成**暖白底 + 1px 線 + 細字**，更貼品牌 |

文案維持安靜：「已更新」，不要「🎉 成功！您的資料已成功更新！」。

---

## 十七、Accessibility

行動版的 bottom sheet、下滑關閉手勢、44px 熱區、sticky 儲存列、表格轉卡片**都已經做完了**，不用重做。

**剩下四項：**

1. ⚠️ **visible focus state** —— 見第十一節，全站只有 1 處
2. ⚠️ **keyboard navigation** —— `.ad-rowmenu` 開啟後沒有方向鍵導覽與 focus trap
3. 🔧 **aria-label** —— `admin.html` 只有 15 處 `aria-`，動態產生的清單（`admin.js` 15 處）覆蓋不足
4. 🔧 **contrast** —— `--ink-soft:#7c7267` 在 `--bg1:#fbfaf7` 上約 4.6:1，用在 11.5px 的小字會低於 AA 門檻。需要實測後決定是加深色票還是提字級

（`prefers-reduced-motion` 見第十節。）

---

## 執行順序

### 第一批：低風險（純 CSS／token，不動 DOM 與資料流）
1. Motion token + `prefers-reduced-motion`（第十節）
2. `:focus-visible` 系統（第十一節）
3. `--font-ui` 雙軌字體，只在 `body[data-page="admin"]` 覆寫（第十三節）
4. 陰影收斂、`.btn` hover 改微幅變化、表格 hover 底色提到 3–4%（第十二、五、一節）

### 第二批：中風險（動 DOM，不動資料流）
5. Sidebar 分組 + tooltip（第二、三節）
6. Page Header 兩層系統（第五節）
7. Top nav account popover（第四節）
8. Empty state 元件化（第十四節）
9. 表格動作收進 `⋯` + `.is-act` sticky right（第一節）
10. 表格形狀的 skeleton（第十五節）

### 第三批：高風險（動資料流／權限）
11. Detail Drawer 抽成共用元件、接進圖層堆疊（第七節）
12. Row click → drawer（第六節）
13. Inline editing：收禮明細 + RSVP 標籤，一律走 `guardedRender()`（第八節）
14. CSV 欄位選擇器（第九節）
15. 就地回饋 `✓ 已更新` + toast 改暖白（第十六節）

---

## 不能動的東西

⚠️ **`tests/multipage.mjs` 有 282 處引用後台的 id 與 class。**

包含 `#adPage`、`#adMenuBtn`、`#adRsvpFilter`、`#adRsvpExport`、`#adModalMask`、`#adModalConfirm`、
`#adLetterAddBtn`、`#adExhModalMask`、`#adQuizAddBtn`、`#adOffline`…

**原則：**

- **所有 `#adXxx` 的 id 一律不改名**，只改視覺與結構包裝
- 側欄分組用**新增外層節點**的方式，不動 `.ad-tab` 本身
- 若動了 modal / drawer 的開關方式（例如 `hidden` 改成 class），
  `bindAllLayers()` 的 MutationObserver（`admin.js:305-330`）與測試要同步
- 改完務必跑 `npm run test:multipage` 與 `npm run test:butler`
