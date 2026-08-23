# 新人後台 × Craft 改版｜現況對照與衝突盤點

對照對象：
`public/admin.html`／`public/css/admin.css`／`public/css/common.css`／`public/js/admin.js`／`public/js/seating-plan.js`／`firestore.rules`／`tests/multipage.mjs`

標記說明：
- ✅ **已經符合** — 現況做法已經是提案要的東西，不用動，或只要微調數值
- 🔧 **可以調整** — 方向不衝突，是工作量問題
- ⚠️ **有衝突** — 照著做會撞到既有的資料模型、權限規則、行動版決策或測試

---

## 〇、先講三件會影響整份提案的現況前提

**1. 全站只有一個字族。**
`common.css:20-25` 把 `--font-display`／`--font-body`／`--font-hand` 三個變數全部指向 `Noto Serif TC`，檔頭註解也明講「單一字族」。提案第十七節要的雙軌 typography 會直接推翻這個前提，而且這三個變數是**賓客頁與後台共用**的。

**2. 後台是「唯讀為主」的產品，不是 CRUD 後台。**
`firestore.rules:141` 對 RSVP 明寫 `allow update: if false`；`admin.html:151` 的說明文字也是「回覆是賓客送出的紀錄，**內容改不動**」。提案第九節的 inline editing 有一半的目標對象是不能編輯的。

**3. 這份後台已經做過一輪完整的手機／平板優化（最近三個 commit）。**
bottom sheet、下滑關閉手勢、44px 熱區、sticky 儲存列、`⋮` row menu、表格轉卡片 — 都已經在了。提案第二十二節有 70% 是「已完成」，但也代表**有些提案會直接撤銷這些刻意的決定**（見第十節）。

---

## 一、整體 Design Direction

✅ **已經符合，幾乎不用動。**

現況已經是米白（`--bg1:#fbfaf7`）、1px 線、`--shadow:transparent`、明朝體、`--radius:2px`。`common.css:73` 那一行甚至明確把全站元件的 `box-shadow` 歸零。

提案的「不要使用」清單裡，現況唯一踩到的是：

| 禁止項 | 現況位置 | 說明 |
|---|---|---|
| 大型陰影 | `admin.css` 的 `.sp-peek`（`0 6px 22px`）、`.ad-rowmenu`（`0 8px 26px`）、`.ad-filtersum`（`0 6px 18px`）、窄螢幕的 `.ad-side`（`2px 0 18px`） | 這四個是「浮層」，陰影是在表達層級，不是裝飾；但 22–26px 的模糊半徑對這個品牌偏重，建議收到 12–16px 並降低 alpha |
| 彩色 KPI 卡 | `.ad-stats` / `.ad-stat-num`（`admin.css:355-365`） | 數字是 `--primary-deep` 金色，不算彩色 SaaS，但四格等寬方格的形狀本身很 dashboard |

**結論：這一節不是改版重點，是「守住」的部分。**

---

## 二、UI 不要一直存在（漸進揭露）

⚠️ **方向對，但現況有一個刻意的反向決定要先處理。**

- 現況 RSVP 表格每一列右邊固定掛一顆「刪除」（`admin.js:1483`，`<td class="is-act">`）。
- `⋮` 的基礎建設**已經有了**：`registerRowMenu()`／`openRowMenu()`（`admin.js:380-460`），`.ad-rowmenu` 是 `position:fixed` 的浮層，已經在婚禮小卡、故事牆、桌次名單用。所以「hover 才出現 ⋯」不用從零做，是把 `.ad-del` 換成 `rowMenuBtn()`。

**衝突點：**

1. `admin.css:1416-1419` 有一段刻意的規則：
   ```
   @media (hover:none){ .ad-del-inline{display:none;} }
   ```
   也就是「看得見的刪除只給有滑鼠的機器」。hover-reveal 在觸控裝置上等於**動作消失**，所以任何 hover-only 的揭露都必須配一條 `@media (hover:none)` 的常駐版本。
2. 鍵盤使用者同理 — 需要 `:focus-within` 一起觸發，否則 Tab 過去按鈕是隱形的。
3. `.ad-table` 是 `overflow:auto` 的橫捲容器，`.is-act` 在最右邊。hover 才出現的 `⋯` 在需要橫捲的表格裡，使用者根本看不到它存在。**建議：`.is-act` 改成 sticky right**，跟現在 `.is-name` sticky left 對稱。

---

## 三、Sidebar 重新分組

🔧 **可以做，但有三個技術細節會咬人。**

現況：`admin.html:82-91` 是 10 顆平鋪的 `<button class="ad-tab">`，沒有任何分組。

分組本身安全，因為：
- 點擊是委派的（`admin.js:1068`，`e.target.closest('.ad-tab')`），包一層 `<div>` 不會壞
- `tabButtons()`（`admin.js:1005`）用 `#adSide .ad-tab` 後代選擇器，也不會壞

**但是：**

| # | 問題 | 位置 |
|---|---|---|
| 1 | `applyTabVisibility()` 是**逐顆** `btn.hidden = !tabEnabled(...)`（`admin.js:849-851`）。某些站台沒開排桌管理／收禮小幫手，「婚禮管理」這一組可能只剩 2 顆甚至 0 顆 — 會留下一個**空的 group label**。必須加「整組都 hidden 就連 label 一起 hidden」 | `admin.js:848` |
| 2 | `activateTab()` 的 fallback 是 `btns.find(b => !b.hidden)`（`admin.js:1031`），分組後這個「第一個看得到的」語意還在，但如果 group 是收合的，退回去的分頁會落在一個看不到的群組裡 — **收合狀態必須永遠讓 active item 展開** | `admin.js:1029` |
| 3 | 提案的分組把「桌次」和「排桌管理」放進同一組，但這兩個在程式裡是不同的 feature flag（`TAB_PAGE.seating` / `TAB_PAGE.seatingPlan`，`admin.js:820-834`），而且「桌次名單」裡有一顆 `#adSeatSyncPlan` 依賴排桌管理是否開啟 — 分組不會壞這個邏輯，但視覺上要讓人看得出兩者的從屬關係 | `admin.js:836-861` |

**Active state：現況已經很接近提案要的樣子**（`admin.css:74`）：
```
.ad-tab.is-on{ color:var(--ink); background:#fff; border-left-color:var(--primary-deep); }
```
白底 + 2px 左側金線，不是藍底。提案要 1px + 字重變化 — 是微調，不是重做。

---

### Sidebar tooltip（提案要求 hover 顯示功能說明）

⚠️ **這是新元件，而且有兩個定位陷阱。**

1. `.ad-side` 是 `overflow-y:auto`（`admin.css:60-64`）。tooltip 如果放在側欄 DOM 裡會被裁掉。**必須 render 到 body 並 `position:fixed`** — 現成的參考做法是 `.sp-peek`（`admin.css:945`）和 `.ad-rowmenu`（`admin.css:1276`），兩者都是這樣做的，可以直接抄定位邏輯。
2. `<900px` 時 `.ad-side` 是 `position:fixed` 的抽屜（`admin.css:129-141`），而且是觸控裝置 — **tooltip 在這個尺寸要完全關掉**（`@media (hover:hover) and (pointer:fine)` 才綁）。否則會變成「點一下就跳出說明，然後才切分頁」。
3. 現況全站沒有任何 tooltip 元件，`title=` 只在 `admin.html:1254-1278` 的測驗選項用過四次（原生 tooltip，延遲久、樣式不可控）。

**Section collapse 的 height transition：** 現況沒有任何收合動畫的基礎建設，`[hidden]` 都是硬切 + `animation:scInF`。`height:auto` 不能 transition，要用 `grid-template-rows:0fr → 1fr` 或量測 `scrollHeight`。收合狀態需要存 `localStorage`。

---

## 四、Top Navigation

🔧 **可以做，但要一併處理現況的「兩套按鈕」。**

現況 `admin.html:56-70`：
```
新人後台
{couple}・{email}          ← 一行，中間一個「・」（admin.js:875-877）
                        [查看網站] [登出]
```

**問題：**

1. `#adWho` 是**一個字串塞兩件事**（`admin.js:876`：`` `${couple}・${email}` ``）。提案要拆成兩層，這行要改成兩個節點。
2. 「查看網站」「登出」各有**兩份**：桌機在 `.ad-bar-actions`（`#adViewBtn`/`#adLock`），`<900px` 搬進抽屜底部（`#adViewBtnMobile`/`#adLockMobile`，`admin.css:143-148`）。改成 account popover 之後，這個雙份結構要重新想 — popover 在手機上是不是也放在抽屜裡？
3. ✅ **好消息**：`common.css:126-141` 已經有一套 `.nav-user-btn` / `.nav-user-pop` 的帳號 popover 樣式（賓客頁在用），視覺語言可以直接沿用，但**後台不載入賓客導覽列**（`common.js:1175`：`NO_NAV_PAGES = new Set(['admin','rsvp'])`），所以要複製一份到 `admin.css`，不能直接共用 class 名稱以免和賓客頁互相污染。
4. `syncStickyMetrics()`（`admin.js:154-167`）會量 `.ad-bar` 的高度寫進 `--ad-bar-h`，底下所有 sticky（子分頁列、篩選彙總、離線橫幅）都吃這個變數。**頂列改高度／改行數，這些全部會跟著動** — 改完要確認 `--ad-stick-top` 還是對的。

---

## 五、Page Header System

⚠️ **有結構性衝突，需要先做資訊架構決定。**

現況的標題階層是：

| 層級 | class | 字級 | 位置 |
|---|---|---|---|
| 產品名 | `.ad-bar-title` | 19px serif | 頂列 |
| （沒有 page title） | — | — | — |
| 子分頁 | `.ad-subtab` | 13px | 橫向頁籤 |
| 區塊 | `.ad-sec-title` | **15px** serif | 內容區 |

提案要的是 **24–28px 的 page header**。兩個問題：

1. **24–28px 會壓過頂列的 19px 產品名。** 要嘛頂列降級，要嘛 page header 收到 20–22px。這是一個要先決定的層級問題，不是套個 class 就好。
2. **「一頁一個 page header」對不上現況的結構。** 例如「收禮小幫手 → 收禮統計」這一個 subpanel 裡有**三個** `.ad-sec`（收禮統計 / 收禮明細 / 誰記了多少，`admin.html:780-840`）。提案舉的例子「收禮明細 + 2 筆收禮紀錄 + 匯出 CSV」其實是第二個 section，不是頁面標題。

   → 建議：導入**兩層** —— `.ad-page-head`（24px serif，一個 subpanel 一個，含筆數與主要動作）＋ 保留 `.ad-sec-title`（降到 13–14px，變成小節分隔）。而不是把現有的 `.ad-sec-title` 直接放大。

3. ✅ 動作按鈕的部分**現況已經符合**：`.ad-sec-head` + `.ad-sec-head-actions`（`admin.css:160-166`）已經是「標題與按鈕同一列、底部一條 1px 線」，而 `.btn.small.ghost` 本來就是細框、透明底。

   ⚠️ 唯一要改的是 **`.btn` 的 hover**（`common.css:161`）：主要按鈕是深色實心，hover 時整顆**翻成透明** —— 這是一個很大的視覺跳動，和提案要的「hover 微幅變化」相反。建議改成亮度／邊框的小幅位移。

---

## 六、Table UX ＋ 七、Detail Drawer

### Table
🔧 現況 hover 已經有（`admin.css:449-451`），但 `rgba(0,0,0,.018)` = 1.8% 幾乎看不見，可以加到 3–4%。

⚠️ **Row click 開 drawer 有四個衝突：**

1. **RSVP 表格的列裡有互動元素** — 標籤欄有 `<button data-tag-edit>`（`admin.js:1435`），動作欄有刪除。整列可點會需要在這些按鈕上 `stopPropagation`。
2. **使用者會想選取儲存格文字**（備註、地址、給新人的話都是長文字）。整列 click 會和文字選取打架，需要判斷 `getSelection().isCollapsed`。
3. **收禮明細的 `<tr>` 現在完全沒有 id**（`admin.js:4560-4571`），要先補 `data-entry`。
4. **手機根本不是表格。** `isNarrow()` 時 RSVP 走 `rsvpCardsHtml()`、收禮走 `btCardsHtml()`（`admin.js:4546`），而且卡片上已經有自己的「展開更多」（`.ad-rcard-more`，`aria-expanded`）。所以 drawer 只能是桌機行為，手機維持「就地展開」或改成 bottom sheet — 兩套要各自設計。

### Drawer
✅ **這一節現況幾乎完全命中，是最省力的一項。**

`.sp-drawer`（`admin.css:1035-1060`）：

| 提案 | 現況 |
|---|---|
| 寬度 360–420px | `width:min(92vw,400px)` ✅ |
| 暖白背景 | `background:var(--bg1)` ✅ |
| 左側 border | `border-left:1px solid var(--line)` ✅ |
| 200–300ms | `animation:spDrawerIn .22s ease` ✅ |
| 背景頁面保持可見 | mask 是 `rgba(43,47,54,.42)` — ⚠️ 提案說「微妙 shadow、背景保持可見」，.42 的遮罩偏重，建議降到 .2 或改成不加遮罩只加陰影 |
| 不是大型 modal | ✅ 有 `.sp-drawer-foot` CTA 貼底 |

**要做的是把它從 `seating-plan.js` 抽出來變成共用元件**，並且註冊進 `pushLayer()/popLayer()` 的圖層堆疊（`admin.js:246-300`），這樣返回鍵與 Esc 才會正確關掉它、背景才會正確鎖捲。

---

## 八、Inline Editing

⚠️⚠️ **這是整份提案衝突最大的一節。**

### 1. RSVP 名單：技術上不可能，且是產品的核心決定

`firestore.rules:138-143`：
```
match /rsvps/{rsvpId} {
  allow update: if false;      ← 沒有例外
}
```
規則旁邊還有一段註解說明為什麼：「回覆是賓客送出的紀錄，仍然一個字都不能改」。新人自己的分類另外存進 `rsvpTags/{rsvpId}`。

→ **RSVP 頁面唯一能 inline 編輯的是「標籤」**，其他欄位全部不行。這不是要不要做的問題。

### 2. 收禮明細（提案舉的 `$3,600` 例子）：可以做，但有條件

`firestore.rules:643-650`：
```
allow create, update: if butlerOpen(bookId) && isValidButlerEntry();
```
- 可以改 ✅，而且註解明講「現場記錯金額是常態，能當場改掉比留一筆錯的有用」— 產品意圖是支持的
- ⚠️ **但只在收禮簿「開著」時**。新人把簿子停用之後（婚禮結束後的常見狀態），inline edit 會拿到 `permission-denied`。UI 必須知道 `butlerOpen` 狀態，停用時把欄位變成唯讀，而不是讓人打完字才報錯
- ⚠️ `isValidButlerEntry()` 有欄位型別與範圍檢查（`amount`/`boxes`/`people` 是 int、上限 99 等），inline 編輯要在送出前做同樣的驗證，否則使用者只會看到一句 permission-denied

### 3. 已經有的 inline editing 缺 feedback

婚禮小卡的卡名／等級／說明、桌次圖的標題（`.ad-img-title`）**現在就是就地編輯 + change 自動存**。缺的是提案要的「✓ 已更新」微回饋 — 現在走的是 toast。

### 4. 最重要的技術陷阱：Firestore 即時快照會把你正在打的字洗掉

`guardedRender()`（`admin.js:633-656`）就是為了這件事寫的，註解裡有完整說明：使用者在清單裡打字時延後重畫，否則「接著的 change 就落在一個已經被丟掉的節點上，那一筆修改直接消失」。

→ **任何新的 inline editing 都必須走 `guardedRender()`**，不能自己接 `onSnapshot` 直接重畫。

---

## 九、Search / ⌘K

⚠️ **會撤銷一個刻意的行動版決定。**

現況有四個常駐搜尋框：`#adRsvpFilter`、`#adBtFilter`、`#adInboxFilter`、`#spSearch`。

**衝突：**

1. `admin.css` 尾段有這一條，附帶註解：
   ```
   @media(max-width:899px){ .ad-filterbar-search{flex:1 1 100%;} }
   /* 搜尋框現在自己就是第一排（見 admin.html），佔滿寬度 */
   ```
   `admin.html:157-162` 也刻意把搜尋放在篩選列的**第一排**，理由是「找特定一個人比按條件篩常見得多」。收合成一顆小 icon 是反向操作。
   → 建議：**只在 `(hover:hover) and (pointer:fine)` 收合**，觸控維持常駐。
2. `⌘K` 在手機上沒有意義，提示字要條件顯示。
3. `.ad-list-head.is-sticky`（收禮明細）現在是 sticky 的一整列（`admin.css:1394-1398`），註解說「婚宴當天最常做的事就是找某個人有沒有收到」— 這是**現場情境**，收合搜尋在這一頁尤其不該做。
4. ⚠️ **iOS**：`admin.css` 有一整段 `@media (pointer:coarse)` 把所有輸入元件強制 16px，理由是 Safari 聚焦 <16px 欄位會整頁放大。展開動畫如果改變 font-size 會觸發這個。

✅ **好消息**：提案第十節要搜尋支援「姓名／桌次／備註／記錄者」，`admin.js:4532` 已經完全支援：
```js
normKey(`${e.name}${e.code||''}${e.table||''}${e.note||''}${e.by||''}`)
```
所以 command palette 是**純呈現層**的工作，搜尋邏輯不用動。

---

## 十、CSV Export 欄位選擇

🔧 **好做，但欄位清單不能寫死。**

現況 `downloadCsv(name, header, rows)`（`admin.js:494-511`）是固定 header + rows，兩個呼叫點（`#adRsvpExport`、`#adBtExport`）。

⚠️ **RSVP 的欄位是動態的**：`rsvpColumns()`（`admin.js:1387-1396`）依表單設定決定要不要有 標籤／聯絡資訊／喜帖／喜餅／留言 五欄。欄位選擇器必須**從 `rsvpColumns()` 生成**，不能照提案例子硬寫六個 checkbox（那個例子其實是收禮明細的欄位）。

✅ 可以直接沿用 `.ad-modal-card-form`（`admin.css:695-700`），它已經有 sticky 底部按鈕列，`<560px` 也已經是 bottom sheet。

---

## 十一、Motion Design

⚠️ **有一個明確的缺口，是提案裡少數「現況完全沒做」的項目。**

| 項目 | 現況 |
|---|---|
| 時長 | `.12s`–`.28s`，和提案的 120–300ms **完全吻合** ✅ |
| easing | 全部是 `ease`（共 20 處），沒有 `ease-out`，沒有 cubic-bezier 🔧 |
| bounce/overshoot | 沒有 ✅ |
| **`prefers-reduced-motion`** | ⚠️ **`common.css` 與 `admin.css` 完全沒有。**只有 `wall.css:42`、`exhibition.css:39`、`shortlink.html:50` 有 |
| 頁面轉場 | `.ad-panel.is-on{animation:scInF .35s}` — 350ms，比提案的 150–250ms 慢 🔧 |

**要做的：**

1. 把時長與 easing 抽成 token（`--dur-hover`／`--dur-drawer`／`--ease`），現在是 20 幾處硬寫的字面值，分散在 `admin.css` 各段。
2. **補上 reduced-motion 區塊**，而且要一併關掉 `common.css:57` 的 `html{scroll-behavior:smooth}` — 這一條同樣沒有被 reduced-motion 保護。
3. `admin.js:333` 的 `bindSheetSwipe()` 裡有 JS 寫死的 `transform .18s ease`，reduced-motion 時也要處理。

---

## 十二、Micro Interaction 的完整 state 矩陣

⚠️ **`:focus-visible` 是最大的缺口。**

`admin.css` 整份 1818 行裡 **只有一個** `:focus-visible`（`.sp-card`，`admin.css:900`）。

現況各 state 的覆蓋：

| State | 覆蓋情況 |
|---|---|
| Rest / Hover | ✅ 完整，而且已經正確用 `@media (hover:hover) and (pointer:fine)` 包住 |
| Active（按下） | 🔧 只有 `.btn:active{opacity:.8}` 和幾個觸控的 `:active`，不成系統 |
| **Focus** | ⚠️ **幾乎沒有** — 提案第二十二節明確要求 visible focus state |
| Disabled | ✅ `.btn:disabled`、`.ad-pager-btn:disabled`、`.ad-rowmenu-item:disabled` 都有 |
| Loading | ✅ `.is-saving` + `runSave()`（`admin.js:105-140`）已經是全站統一機制 |
| Success | 🔧 只有 toast，沒有就地回饋 |
| Error | ✅ `.is-invalid` + `.ad-field-err` + `liveValidate()`（`admin.js:531`）已經有完整的即時驗證 |

→ 這一節的重點不是「加動效」，是**補 focus ring 並把 active/success 系統化**。

---

## 十三、Drag & Drop（排桌管理）

⚠️⚠️ **提案要的效果，現在的技術基礎做不到；而且有一個領域語意的落差。**

### 技術面

`seating-plan.js:1467-1525` 用的是 **HTML5 Drag & Drop API**。這個 API 無法做到提案要的任何一項：

| 提案要求 | HTML5 DnD 能否做到 |
|---|---|
| card 微幅放大 | ❌ 拖曳影像是瀏覽器截圖，只能用 `setDragImage` 換成另一張靜態圖 |
| elevation 提升 | ❌ 同上 |
| 原位置留下 placeholder | ⚠️ 只能靠 `.is-dragging{opacity:.45}`（現況就是這樣） |
| insertion indicator | ❌ |
| 其他元素平滑移動 | ❌ 完全不可能 |
| **觸控可用** | ❌ **HTML5 DnD 在觸控裝置上完全不觸發**（程式碼註解裡明講），所以手機走 `openMove()` 彈窗 |

→ 要達到提案的「像移動紙卡」，**必須整段改寫成 Pointer Events**。

✅ **好消息**：這份程式碼裡**已經有一個 Pointer Events 的拖曳實作可以參考** — 測驗題目排序（`admin.js:4196` 一帶，`.ad-drag-handle` + `touch-action:none` + `.ad-drag-placeholder`），而且它**觸控可用**。改寫排桌可以直接沿用同一套模式，順便讓手機也能拖。

### 領域語意的落差

提案說「destination 顯示 insertion indicator」。但排桌的拖曳有**兩種語意**：

- 賓客卡 → 桌位：這是 **drop into container**，沒有「插入位置」的概念，只有「進哪一桌」
- 賓客卡 → 賓客卡：這是**交換**
- 桌位標題 → 桌位標題：這才是 **reorder**，只有這一種適用 insertion indicator

現況的做法（`markZone()`，`seating-plan.js:1547-1570`）是在目標上顯示文字提示：「移回未安排」「與 王小明 交換」「放入第 05 桌」「⚠️ 此桌將超過容量」。

→ **這個文字提示在資訊量上優於 insertion indicator**（它會告訴你會不會爆桌）。建議**保留文字提示，加上 tactile 的視覺**，而不是換掉它。

---

## 十四、Card Design（避免卡片地獄）

🔧 **大方向已經符合，但 RSVP 總覽這一頁確實有堆疊。**

現況清單頁大量使用 `.ad-list` / `.ad-item`（純線條 + 間距，沒有卡片）— 完全符合提案。

⚠️ 卡片堆疊集中在兩處：

1. **RSVP 總覽**：`.ad-hero-stat`（白框）內含 `.ad-hero-split` → 底下接 `.ad-donuts`（每個 `.ad-donut` 又是一格白底 + 四邊框線）→ 再接 `.ad-sec-note`。等於「框中有格、格旁有框」。
2. **表單類**：`.ad-sub-sec`（`admin.css:216-220`，白底半透明框）巢狀在 `.ad-sec` 裡，婚禮資訊那一頁有好幾層。

---

## 十五、Typography

⚠️ **這是唯一會影響到賓客頁的改動，必須小心隔離。**

**現況：** 只載入 `Noto Serif TC:wght@300;400;500;600`（`admin.html:17`），全站 14 個 HTML 都一樣。

**提案：** 加入 Zen Kaku Gothic New 或 Noto Sans TC 作為 UI 字體。

**三個衝突：**

1. **變數是共用的。** `--font-body` 定義在 `common.css:24` 的 `:root`，賓客頁全部吃這個。若把它改成 sans，賓客的婚禮頁會整個變樣。
   → 必須**新增** `--font-ui`，並且**只在 `body[data-page="admin"]` 底下覆寫**，不能改 `--font-body` 的定義。
2. **CJK 字重負擔。** 現在載了 Serif TC 四個字重。再加一個 CJK sans 家族，繁中字集很大（Noto Sans TC 完整版 >5MB／字重）。Google Fonts 有做 unicode-range 切片，但首屏會多好幾個請求。
   → 建議只載 **兩個字重**（400 / 500），並確認 fallback stack 是 `system-ui, "PingFang TC", "Microsoft JhengHei", sans-serif` — 這幾個在目標裝置（台灣的 iPhone / Mac / Windows）上本來就存在，`font-display:swap` 的閃動會很小。
3. **`common.css:73` 那一行的元件清單**（把 box-shadow 歸零的那一長串 selector）沒有涵蓋 `.ad-*` 前綴，改字體時順便確認後台元件沒有被賓客頁的規則誤傷。

✅ 數字部分已經做對了：`font-variant-numeric:tabular-nums` 在 `.ad-hero-num`、`.ad-donut-center b`、`.sp-table-no`、`.ad-btcard-amt` 都有。

---

## 十六、Empty State

🔧 **有一個現成的好範例可以推廣。**

- 現況 `.ad-empty`（`admin.css:520-521`）是一行 13px 灰字，出現 **19 次**（`admin.js`）+ 2 次（`seating-plan.js`）。全部都是「目前沒有資料」那一類。
- ✅ **但 `.ad-donuts-empty`（`admin.css:1330-1334`）已經是提案要的樣子**：虛線框 + 兩行說明 + 一顆 CTA 按鈕。收禮連結的空狀態（`admin.js:4625-4632`）也有「產生第一組連結」的 CTA。

→ 把 `.ad-empty` 升級成接受 `{ title, body, action }` 的函式，把那 21 個呼叫點分批換掉。提案要的 editorial typography 用 `--font-display` 24px 即可。

---

## 十七、Loading State

✅ **已經符合，只差一點。**

`skeletonHtml(rows, widths)`（`admin.js:657-667`）+ `.ad-skel-line` 的 shimmer 動畫（`admin.css:590-598`）已經在用，而且註解明講是為了「跟真的沒資料的空狀態區分開」。

🔧 唯一可改：現在的 skeleton 是通用的兩行灰條，不會對齊表格欄位。提案的例子是**表格形狀**的 skeleton（姓名/桌次/禮金三欄）。可以讓 `skeletonHtml` 接受欄寬陣列，在表格情境輸出 `<table>` 骨架。

⚠️ 另外：`.ad-skel-line` 的 shimmer 是無限迴圈動畫，**reduced-motion 時要停掉**（同第十一節）。

---

## 十八、Toast / Feedback

⚠️ **提案的「更安靜」和現況的兩個功能有直接衝突。**

現況 `showToast()`（`admin.js:34-64`）：深色實心（`background:var(--ink)`）、白字、置底置中、2600ms（錯誤 5200ms）、**可以帶一顆動作按鈕**。

**兩個不能拿掉的功能：**

1. **重試** — `writeFailed(err, retry)`（`admin.js:72-97`）。弱網／逾時時 toast 上會有「重試」。這是行動版優化時特地加的。
2. **復原** — `scheduleUndoDelete()`（`admin.js:774-800`）。刪除是「先從畫面移除 + toast 給復原」的模式。

→ 這兩種 toast **必須維持可見、可點、夠久**。提案的「1–2 秒後消失的 ✓ 已更新」是另一種東西。

**建議分成兩層，不要用同一個元件：**

| 層 | 用途 | 樣式 |
|---|---|---|
| **就地回饋**（新增） | 單一欄位存檔成功 | 欄位旁 `✓ 已更新`，1.5s 淡出，不佔畫面 |
| **Toast**（保留） | 錯誤、重試、復原、離線 | 現況樣式，但深色實心可以改成暖白底 + 1px 線 + 細字，更貼品牌 |

---

## 十九、Mobile Interaction

✅ **這一節現況完成度最高，大約 70–80% 已經做完了。**

| 提案 | 現況 |
|---|---|
| bottom sheet | ✅ `@media(max-width:560px)` 把 `.ad-modal-card` 改成貼底 + 圓角 + drag handle（`admin.css:1176-1200`） |
| swipe | ✅ `bindSheetSwipe()`（`admin.js:333-366`）已實作下滑關閉，只從上緣 44px 起手、內容捲動時不接手 |
| floating action | ✅ `.sp-mobilebar`（排桌）、`.ad-savebar`（長表單 sticky 儲存） |
| simplified navigation | ✅ 表格→卡片（`isNarrow()`）、`⋮` row menu、抽屜式側欄 |
| minimum touch target 44px | ✅ 整段 `@media (pointer:coarse)` 專門處理（`admin.css:1210-1259`） |
| sufficient contrast | 🔧 需要實測，`--ink-soft:#7c7267` 在 `--bg1:#fbfaf7` 上約 4.6:1，11.5px 的小字會低於 AA 的大小門檻 |
| **visible focus state** | ⚠️ **缺** — 見第十二節 |
| **keyboard navigation** | ⚠️ 部分缺：`.ad-rowmenu` 開啟後沒有方向鍵導覽與 focus trap |
| **proper aria-label** | 🔧 `admin.html` 只有 15 處 `aria-`。動態產生的清單（`admin.js` 15 處）覆蓋不足 |
| **reduced-motion** | ⚠️ **完全沒有** |

---

## 二十、會被打到的測試

⚠️ **`tests/multipage.mjs` 有 282 處引用後台的 id 與 class。**

包含但不限於：`#adPage`、`#adMenuBtn`、`#adRsvpFilter`、`#adRsvpExport`、`#adModalMask`、`#adModalConfirm`、`#adLetterAddBtn`、`#adExhModalMask`、`#adQuizAddBtn`、`#adOffline`…

**原則：**
- **所有 `#adXxx` 的 id 一律不改名**，只改視覺與結構包裝
- 側欄分組要用**新增外層節點**的方式，不動 `.ad-tab` 本身
- 若動了 modal/drawer 的開關方式（例如 `.hidden` 改成 class），`bindAllLayers()` 的 MutationObserver（`admin.js:305-330`）與測試都要同步
- 改完務必跑 `npm run test:multipage` 與 `npm run test:butler`

---

## 建議的執行順序

依「風險 ÷ 感受提升」排序：

### 第一批：低風險、高回報（純 CSS／token，不動 DOM 與資料流）
1. **建立 motion token** + 補 `prefers-reduced-motion`（含 `scroll-behavior`）— 提案第十三節的缺口，也是 a11y 必要項
2. **補 `:focus-visible` 系統** — 目前全站只有 1 處
3. **雙軌 typography**：新增 `--font-ui`，只在 `body[data-page="admin"]` 覆寫，不動 `--font-body`
4. 陰影半徑收斂、`.btn` hover 改成微幅變化、表格 hover 底色從 1.8% 提到 3–4%

### 第二批：中風險（動 DOM，但不動資料流）
5. **Sidebar 分組 + tooltip**（tooltip render 到 body、觸控關閉、空群組要連 label 一起藏）
6. **Page header 系統**（先決定與頂列的層級關係，再套用）
7. **Top nav account popover**（處理桌機／抽屜兩份按鈕的重複）
8. **Empty state 元件化**（推廣 `.ad-donuts-empty` 的樣子到那 21 個呼叫點）
9. **表格動作收進 `⋮`** — 沿用既有的 `registerRowMenu()`，並把 `.is-act` 改成 sticky right

### 第三批：高風險（動資料流／權限／互動核心）
10. **共用 Detail Drawer** — 把 `.sp-drawer` 抽出來，接進 `pushLayer()` 圖層堆疊
11. **Inline editing** — **只做收禮明細**（要處理 `butlerOpen` 停用狀態）＋ RSVP 標籤，並且一律走 `guardedRender()`
12. **CSV 欄位選擇器** — 欄位清單從 `rsvpColumns()` 生成
13. **Search / command palette** — 只在桌機收合，觸控維持常駐

### 第四批：需要單獨評估
14. **排桌 Drag & Drop 改寫成 Pointer Events** — 工作量最大、回歸風險最高，但也是提案裡「tactile」最有感的一項。可參考測驗題目排序既有的 Pointer 實作，順便讓觸控裝置也能拖

---

## 一句話總結

這份提案的**視覺方向（第一、十四、十五、十六節）現況已經達成八成**，真正的落差集中在三件事：

1. **互動的 state 完整性** —— focus、reduced-motion、success 回饋
2. **漸進揭露** —— 動作收進 hover／`⋮`，但必須配好觸控與鍵盤的替代路徑
3. **不離開工作區** —— drawer 與 inline editing

而**唯二真正的「不能做」**是：
- **RSVP 不能 inline 編輯**（`allow update: if false`，且是刻意的產品決定）
- **排桌的 tactile drag** 在現有的 HTML5 DnD 上做不到，必須改寫
