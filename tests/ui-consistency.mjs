/* ============================================================
   ui-consistency.mjs — 後台元件庫的一致性測試
   ------------------------------------------------------------
   後台（/w/{slug}/admin）與收禮小幫手（/butler）用的是**同一組
   .ad-* 元件**。這支測試守的就是那句話：同一個功能 = 同一份規格。

   規格本身寫在 docs/UI-SPEC.md，這裡只驗證最容易默默漂掉的那幾項：
     1. 雙軌字體：同一顆元件在兩頁要是同一種字
     2. 對比修正：--ink-soft 兩頁一致
     3. 焦點框：收禮台也要有（不然鍵盤使用者在那一頁是盲走的）
     4. 搜尋框：八個地方，一份 HTML 樣板
     5. 抽屜：兩個實作（.sp-drawer／.ad-drawer）同一份規格
     6. 遮罩：全部收在同一支暖墨
     7. 選單：兩個下拉選單（.ad-rowmenu／.ad-acct-pop）面與項同一份規格
     8. 圖示按鈕：✕ 只有兩個字級、每一顆都有 aria-label
     9. Pill 按鈕：只有 32／28 兩階
    10. Tab：選中的只有兩個訊號（字轉 ink ＋ 字重 500）＋ 一條會滑的定位線
    11. 卡片：白底 ＋ 1px --line ＋ --radius
    12. 表單設定的四個新元件：Badge／Switch／Radio group／Conditional Reveal
    13. Ivory：--primary 不得出現在任何 color 屬性上（它只做面、線與圖示）

   這一支不需要 Firestore，只要 hosting 起得來就跑得動
   （頁面停在登入門也沒關係 —— 要量的是 CSS 與 HTML 屬性）。
============================================================ */
import { chromium } from 'playwright';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5000';
const ADMIN  = `${BASE}/w/ui-consistency/admin`;
const BUTLER = `${BASE}/butler#ui-consistency`;

function findChromium(){
  if(process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if(root && existsSync(root)){
    const dir = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
    const bin = dir && `${root}/${dir}/chrome-linux/chrome`;
    if(bin && existsSync(bin)) return bin;
  }
  return undefined;
}

let failures = 0;
function ok(msg, pass, detail){
  const line = detail ? `${msg} — ${detail}` : msg;
  if(pass){ console.log(`  ✅ ${line}`); }
  else{ console.log(`  ❌ ${line}`); failures++; }
}

const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage();
const go = (url) => page.goto(url, { waitUntil:'domcontentloaded' });

/* ------------------------------------------------------------
   1. 雙軌字體
   ------------------------------------------------------------
   admin.css 的字體規則掛的是 body:is([data-page="admin"],[data-page="butler"])。
   哪天有人把它改回只掛 admin，同一顆按鈕就會在收禮台變成明朝體 ——
   這一條就是為了在那個當下就叫出來。
------------------------------------------------------------ */
console.log('\n【雙軌字體：同一顆元件在兩頁是同一種字】');
const fontOf = async (url, sel) => {
  await go(url);
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    return el ? getComputedStyle(el).fontFamily : null;
  }, sel);
};
for(const sel of ['.btn', '.ad-filter']){
  const a = await fontOf(ADMIN, sel);
  const b = await fontOf(BUTLER, sel);
  ok(`${sel} 兩頁同字族`, !!a && a === b, b ? b.slice(0, 34) + '…' : String(b));
  /* Ivory §00-03：UI 軌固定 Noto Sans TC，不再吃 system-ui。
     system-ui 在 Mac 是蘋方、Windows 是微軟正黑、Android 是思源 ——
     哪天有人把它改回去，同一顆按鈕就會在三台裝置上長出三種字。 */
  ok(`${sel} 走 UI 軌（Noto Sans TC 排在最前面）`,
     /^["']?Noto Sans TC/.test((b || '').trim()), (b || '').slice(0, 34));
}

/* Editorial 軌是**刻意**的例外，不是漏網之魚：通行碼、編號、大數字
   在兩頁都該是明朝體（後台的 .ad-bt-pass ↔ 收禮台的 .bt-pass 是同一組
   通行碼的兩端）。這一條在這裡，是為了讓下一個人看得出來
   「.bt-pass 是襯線」是規格，不要順手把它一起改成 sans。 */
const passFont = await fontOf(BUTLER, '#btPass');
ok('#btPass 留在 Editorial 軌（與後台顯示的通行碼同一種字）',
   /Noto Serif/.test(passFont || ''), passFont);

/* ------------------------------------------------------------
   2. 對比修正
------------------------------------------------------------ */
console.log('\n【--ink-soft：兩頁一致】');
const inkOf = async (url) => {
  await go(url);
  return page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--ink-soft').trim());
};
const inkAdmin = await inkOf(ADMIN);
const inkButler = await inkOf(BUTLER);
ok('--ink-soft 兩頁都是後台那一階（Ivory：6.85:1）',
   inkAdmin === inkButler && inkAdmin === '#5C564C',
   `admin=${inkAdmin} butler=${inkButler}`);

/* Ivory 新增的第三階墨。它站在 --bg2 上只有 4.07:1（不過 AA），
   所以規範明講「只能站在 --bg1 或 --surface 上」——
   這一條先確認它真的存在，用法由 docs/UI-SPEC.md §2.1 守。 */
await go(ADMIN);
const ink3 = await page.evaluate(() =>
  getComputedStyle(document.body).getPropertyValue('--ink-3').trim());
ok('--ink-3 存在（Ivory 的第三階墨）', ink3 === '#7A7167', ink3);

/* ------------------------------------------------------------
   3. 焦點框
------------------------------------------------------------ */
console.log('\n【焦點：底線換色，不是光暈】');
await go(BUTLER);
const rest = await page.evaluate(() => {
  /* 通行碼那一層預設收著，focus() 打不進 display:none 的元素 */
  document.querySelector('#btGate').hidden = false;
  const el = document.querySelector('#btPass');
  if(!el) return null;
  const v = getComputedStyle(el).borderBottomColor;
  el.focus();
  return v;
});
/* 底線是 transition 換色的（--dur-hover 150ms）。聚焦後立刻量，量到的是
   動畫跑到一半的插值色 —— 那不是規格，是碼錶。等它收完再讀。 */
await page.waitForTimeout(300);
const focusState = rest === null ? null : await page.evaluate((restVal) => {
  const el = document.querySelector('#btPass');
  const cs = getComputedStyle(el);
  return { rest:restVal, on:cs.borderBottomColor, shadow:cs.boxShadow };
}, rest);
ok('找得到通行碼欄位', !!focusState);
if(focusState){
  /* Ivory §06：輸入框的焦點語彙就是「那條底線換色」。
     改版前是 border-color ＋ 一圈 --primary-soft 的內光，兩個訊號講同一件事。 */
  ok('.ad-input 聚焦時底線換色', focusState.on !== focusState.rest,
     `${focusState.rest} → ${focusState.on}`);
  ok('.ad-input 聚焦時的底線是 --ink', focusState.on === 'rgb(35, 32, 32)', focusState.on);
  ok('.ad-input 聚焦時不再長出光暈', focusState.shadow === 'none', focusState.shadow);
}

/* ------------------------------------------------------------
   4. 搜尋框：一份 HTML 樣板
------------------------------------------------------------ */
console.log('\n【搜尋框：八個地方一份規格】');
let filterCount = 0;
for(const [label, url] of [['後台', ADMIN], ['收禮台', BUTLER]]){
  await go(url);
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('.ad-filter')].map((el) => ({
      id: el.id,
      type: el.type,
      inputmode: el.getAttribute('inputmode'),
      enterkeyhint: el.getAttribute('enterkeyhint'),
      autocomplete: el.getAttribute('autocomplete'),
      ariaLabel: el.getAttribute('aria-label'),
      placeholder: el.getAttribute('placeholder') || '',
    })));
  filterCount += rows.length;
  for(const r of rows){
    const missing = [];
    if(r.type !== 'search')            missing.push('type="search"');
    if(r.inputmode !== 'search')       missing.push('inputmode');
    if(r.enterkeyhint !== 'search')    missing.push('enterkeyhint');
    if(r.autocomplete !== 'off')       missing.push('autocomplete="off"');
    if(!r.ariaLabel)                   missing.push('aria-label');
    if(!/^搜尋/.test(r.placeholder))    missing.push('placeholder 要以「搜尋」開頭');
    ok(`${label} #${r.id}`, missing.length === 0,
       missing.length ? `缺 ${missing.join('、')}` : r.placeholder);
  }
}
ok('八個搜尋框都還在（少了代表有人自己做了一個新的）', filterCount === 8, `找到 ${filterCount} 個`);

/* ------------------------------------------------------------
   5. 抽屜
------------------------------------------------------------ */
console.log('\n【抽屜：兩個實作同一份規格】');
await go(ADMIN);
const drawer = await page.evaluate(() => {
  const d = document.querySelector('#spDrawer');
  const m = document.querySelector('#spDrawerMask');
  if(!d || !m) return null;
  d.hidden = false; m.hidden = false;
  const cs = getComputedStyle(d);
  const out = {
    role: d.getAttribute('role'),
    modal: d.getAttribute('aria-modal'),
    label: d.getAttribute('aria-label'),
    width: cs.width,
    zBox: cs.zIndex,
    zMask: getComputedStyle(m).zIndex,
    scrim: getComputedStyle(m).backgroundColor,
    close: !!d.querySelector('.sp-drawer-close[aria-label]'),
    foot: !!d.querySelector('.sp-drawer-foot'),
  };
  d.hidden = true; m.hidden = true;
  return out;
});
ok('找得到 .sp-drawer', !!drawer);
if(drawer){
  ok('.sp-drawer 有 dialog 語意', drawer.role === 'dialog' && drawer.modal === 'true' && !!drawer.label,
     `role=${drawer.role} aria-modal=${drawer.modal}`);
  ok('.sp-drawer 寬度 = min(92vw,400px)', drawer.width === '400px', drawer.width);
  ok('.sp-drawer 層級 1300／1310', drawer.zMask === '1300' && drawer.zBox === '1310',
     `mask=${drawer.zMask} box=${drawer.zBox}`);
  ok('遮罩 = --scrim-drawer(.2)', drawer.scrim === 'rgba(35, 32, 32, 0.2)', drawer.scrim);
  ok('關閉鈕有 aria-label', drawer.close);
  ok('CTA 貼底（-foot）', drawer.foot);
}

/* ------------------------------------------------------------
   6. 遮罩：同一支暖墨（Ivory：色相跟 --ink 同一支，不再是冷灰）
   ------------------------------------------------------------
   側欄只有在 <900px 才是抽屜，桌機是常駐的、根本沒有遮罩，
   所以這一段要先把視窗縮到手機尺寸。
------------------------------------------------------------ */
console.log('\n【遮罩：全部收在同一支暖墨】');
await page.setViewportSize({ width:390, height:780 });
await go(ADMIN);
const scrims = await page.evaluate(() => {
  const read = (sel) => {
    const el = document.querySelector(sel);
    if(!el) return null;
    const was = el.hidden;
    el.hidden = false;
    const v = getComputedStyle(el).backgroundColor;
    el.hidden = was;
    return v;
  };
  return { nav: read('#adSideBackdrop'), modal: read('#adModalMask'), drawer: read('#spDrawerMask') };
});
for(const [name, want] of [['側欄', 'rgba(35, 32, 32, 0.32)'],
                           ['彈窗', 'rgba(35, 32, 32, 0.72)'],
                           ['抽屜', 'rgba(35, 32, 32, 0.2)']]){
  const got = scrims[{ 側欄:'nav', 彈窗:'modal', 抽屜:'drawer' }[name]];
  ok(`${name}遮罩`, got === want, got);
}

/* ------------------------------------------------------------
   7. 選單：兩個下拉選單同一份規格
   ------------------------------------------------------------
   .ad-rowmenu（⋮）與 .ad-acct-pop（帳號）做的是同一件事。
   它們本來一個 --ink 框一個 --line 框、一個 44px 熱區一個沒有、
   一個 hover 變 --bg2 一個變主題色。
------------------------------------------------------------ */
console.log('\n【選單：兩個下拉選單同一份規格】');
await page.setViewportSize({ width:1280, height:900 });
await go(ADMIN);
const menus = await page.evaluate(() => {
  const read = (sel) => {
    const el = document.querySelector(sel);
    if(!el) return null;
    const was = el.hidden;
    el.hidden = false;
    const cs = getComputedStyle(el);
    const out = { border:cs.borderTopWidth + ' ' + cs.borderTopColor, pad:cs.padding,
                  bg:cs.backgroundColor, shadow:cs.boxShadow, role:el.getAttribute('role') };
    el.hidden = was;
    return out;
  };
  /* .ad-rowmenu 是 admin.js 動態插入的，先確保它存在 */
  const item = (sel) => {
    const el = document.querySelector(sel);
    if(!el) return null;
    const pop = el.closest('[hidden]');
    const was = pop && pop.hidden;
    if(pop) pop.hidden = false;
    const cs = getComputedStyle(el);
    const out = { font:cs.fontFamily, size:cs.fontSize, pad:cs.padding,
                  minH:cs.minHeight, role:el.getAttribute('role') };
    if(pop) pop.hidden = was;
    return out;
  };
  return { acctPop:read('.ad-acct-pop'), acctItem:item('.ad-acct-item') };
});
ok('找得到帳號選單', !!menus.acctPop && !!menus.acctItem);
if(menus.acctPop && menus.acctItem){
  /* --ink = #232020 = rgb(35, 32, 32)。用 --ink 而不是 --line：
     可以點的浮層要比背景重一階（規範 3.9） */
  ok('選單的面用 --ink 框',
     menus.acctPop.border === '1px rgb(35, 32, 32)', menus.acctPop.border);
  ok('選單的面有 --shadow-pop', menus.acctPop.shadow !== 'none', menus.acctPop.shadow);
  ok('選單項熱區 ≥44px', parseFloat(menus.acctItem.minH) >= 44, menus.acctItem.minH);
  ok('選單項字級 = --fs-ctl（與 .ad-rowmenu-item 同一份）',
     menus.acctItem.size === '15px', menus.acctItem.size);
  ok('選單項走 UI 軌', /^["']?Noto Sans TC/.test(menus.acctItem.font.trim()));
  ok('選單有 menu／menuitem 語意',
     menus.acctPop.role === 'menu' && menus.acctItem.role === 'menuitem',
     `${menus.acctPop.role} / ${menus.acctItem.role}`);
}

/* ------------------------------------------------------------
   8. 圖示按鈕
------------------------------------------------------------ */
console.log('\n【圖示按鈕：aria-label ＋ ✕ 的字級】');
await go(ADMIN);
const icons = await page.evaluate(() => {
  const sels = ['#adMenuBtn', '#adSideClose', '#spDrawerClose'];
  return sels.map((sel) => {
    const el = document.querySelector(sel);
    if(!el) return { sel, missing:true };
    const holder = el.closest('[hidden]');
    const was = holder && holder.hidden;
    if(holder) holder.hidden = false;
    const cs = getComputedStyle(el);
    const out = { sel, label:el.getAttribute('aria-label'), size:cs.fontSize };
    if(holder) holder.hidden = was;
    return out;
  });
});
for(const ic of icons){
  if(ic.missing){ ok(`找得到 ${ic.sel}`, false); continue; }
  ok(`${ic.sel} 有 aria-label`, !!ic.label, ic.label);
}
const closeSizes = icons.filter(i => i.sel !== '#adMenuBtn' && !i.missing).map(i => i.size);
/* ✕ ＋ ⋯ → 這些字元圖示吃 --fs-glyph，不吃文字層級 ——
   跟著內文走的話，關閉鈕會在不同斷點長成不同大小。 */
ok('✕ 的字級只有 --fs-glyph(17px) 一種（桌機）',
   closeSizes.every(v => v === '17px'), closeSizes.join(' / '));

/* ------------------------------------------------------------
   9. Pill 按鈕：只有 32／28 兩階
------------------------------------------------------------ */
console.log('\n【Pill 按鈕：只有 32／28 兩階】');
await go(ADMIN);
const pills = await page.evaluate(() => {
  /* .ad-th-link 由 admin.js 依標籤資料產生，登入門下不存在 —— 有才驗 */
  const want = { '#adRsvpFilterClear':32, '.ad-eye':28, '.ad-th-link':null };
  const out = [];
  for(const sel of Object.keys(want)){
    const el = document.querySelector(sel);
    if(!el){ out.push({ sel, absent:true }); continue; }
    const holder = el.closest('[hidden]');
    const was = holder && holder.hidden;
    if(holder) holder.hidden = false;
    const cs = getComputedStyle(el);
    out.push({ sel, minH:cs.minHeight, size:cs.fontSize, radius:cs.borderTopLeftRadius,
               want:want[sel] });
    if(holder) holder.hidden = was;
  }
  return out;
});
for(const p of pills){
  if(p.absent) continue;
  ok(`${p.sel} 是膠囊`, parseFloat(p.radius) >= 999 || p.radius === '999px', p.radius);
  if(p.want) ok(`${p.sel} min-height ${p.want}px`, parseFloat(p.minH) === p.want, p.minH);
  ok(`${p.sel} 字級是 --fs-meta(14px)`, p.size === '14px', p.size);
}

/* ------------------------------------------------------------
   10. Tab：選中的只有兩個訊號 ＋ 一條會滑的定位線
   ------------------------------------------------------------
   Ivory §07：改版前是「白底 ＋ 字重 500 ＋ 同色定位線」三個訊號疊在一起。
   現在只剩字轉墨色 ＋ 一條定位線，而且**線是滑的不是跳的** ——
   那一下位移就是「我從哪一頁到哪一頁」，是這個元件唯一要講的事。

   所以這一段守三件事：
     ・選中時沒有底色（白底回來 = 三個訊號又疊回去了）
     ・字是 --ink ＋ 字重 500
     ・定位線真的存在、量到了位置，而且**會過渡**
       （transition 被拿掉的話線就用跳的，等於沒有這個元件）
------------------------------------------------------------ */
console.log('\n【Tab：字轉 ink ＋ 一條會滑的定位線】');
await go(ADMIN);
const tabs = await page.evaluate(() => {
  /* 登入門下面板是收起來的，收起來的東西沒有版面就量不到位置。
     這一段守的是 CSS 與定位線的行為，不是「誰有沒有登入」——
     所以先把外殼打開（只動這一次 go(ADMIN) 的這一份 DOM）。 */
  document.querySelector('#pwGate')?.remove();
  document.querySelectorAll('.ad-page').forEach(e => { e.hidden = false; });
  const panel = document.querySelector('.ad-panel[data-panel="seatingPlan"]');
  if(panel){
    panel.style.display = 'block';
    panel.querySelectorAll('.ad-subpanel').forEach((sp, i) => { if(i === 0) sp.classList.add('is-on'); });
  }
  const read = (sel) => {
    const el = document.querySelector(sel);
    if(!el) return null;
    el.classList.add('is-on');
    const cs = getComputedStyle(el);
    return { bg:cs.backgroundColor, weight:cs.fontWeight, color:cs.color,
             left:cs.borderLeftWidth, bottom:cs.borderBottomWidth };
  };
  /* 子分頁要取**打開的那一個面板裡**的那一排 —— 文件裡第一顆 .ad-subtab
     屬於還收著的「出席回覆」，那一顆永遠量不到位置。 */
  return { tab:read('.ad-side .ad-tab'),
           subtab:read('.ad-panel[data-panel="seatingPlan"] .ad-subtab'),
           laidOut: !!document.querySelector('.ad-side .ad-tab')?.offsetParent
                    && !!document.querySelector('.ad-panel[data-panel="seatingPlan"] .ad-subtab')?.offsetParent };
});
/* 定位線是 rAF 之後才量的（切分頁時 .is-on 會先拿掉再掛上，
   只量最後一次）。所以要等一拍，不能在同一個 evaluate 裡讀。 */
await page.waitForTimeout(150);
const marks = await page.evaluate(() => {
  const mark = (sel) => {
    const el = document.querySelector(sel);
    if(!el) return null;
    const cs = getComputedStyle(el);
    return { w:cs.width, h:cs.height, bg:cs.backgroundColor,
             transition:cs.transitionProperty, ready:el.classList.contains('is-ready') };
  };
  return { navmark:mark('.ad-side .ad-navmark'),
           tabmark:mark('.ad-panel[data-panel="seatingPlan"] .ad-tabmark') };
});
tabs.navmark = marks.navmark; tabs.tabmark = marks.tabmark;
ok('找得到兩種 tab', !!tabs.tab && !!tabs.subtab);
if(tabs.tab && tabs.subtab){
  /* --ink = #232020 = rgb(35, 32, 32) */
  for(const [name, t] of [['.ad-tab', tabs.tab], ['.ad-subtab', tabs.subtab]]){
    ok(`${name}.is-on 沒有底色（不是白底）`,
       t.bg === 'rgba(0, 0, 0, 0)' || t.bg === 'transparent', t.bg);
    ok(`${name}.is-on 字是 --ink ＋ 字重 500`,
       t.color === 'rgb(35, 32, 32)' && t.weight === '500', `${t.color} / ${t.weight}`);
  }
}
/* 定位線由 js/ad-tabmarker.js 插進來。登入門下面板還沒畫出來，
   量不到就不算失敗 —— 但只要它在，就必須有寬高、而且會過渡。 */
for(const [name, m, dim] of [['側欄 .ad-navmark', tabs.navmark, 'h'],
                             ['子分頁 .ad-tabmark', tabs.tabmark, 'w']]){
  if(!m){ console.log(`  ·  ${name} 還沒被插進來，略過`); continue; }
  /* 這一條是整個元件的重點：線會不會滑。transition 被拿掉的話線就用跳的，
     等於沒有這個元件 —— 所以不管有沒有版面，這一條都要驗。 */
  ok(`${name} 是滑的不是跳的`, /transform/.test(m.transition), m.transition);
  if(!tabs.laidOut){ console.log(`  ·  ${name} 這一頁的分頁還沒有版面，位置略過`); continue; }
  ok(`${name} 量到了位置`, m.ready && parseFloat(m[dim]) > 0,
     `${dim === 'h' ? '高' : '寬'}=${m[dim]}`);
}
/* 兩條線刻意不同色：子分頁是 --ink（那一排字旁邊沒有別的顏色可以呼應），
   側欄是 --primary（旁邊的圖示已經是同一支色，讀成同一件事）。
   accent 的五個位置之一就是「選中的定位線」，見 docs/UI-SPEC.md §2.1。 */
if(tabs.navmark && tabs.tabmark){
  ok('子分頁的定位線是 --ink', tabs.tabmark.bg === 'rgb(35, 32, 32)', tabs.tabmark.bg);
  ok('側欄的定位線是 --primary', tabs.navmark.bg === 'rgb(240, 155, 125)', tabs.navmark.bg);
}

/* ------------------------------------------------------------
   11. 卡片：白底 ＋ 1px --line ＋ --radius
------------------------------------------------------------ */
console.log('\n【卡片：同一種面（--surface ＋ 1px --line ＋ --radius）】');
await go(ADMIN);
const cards = await page.evaluate(() =>
  ['.ad-modal-card', '.ad-letter-card', '.ad-callout'].map((sel) => {
    const el = document.querySelector(sel);
    if(!el) return { sel, absent:true };
    const holder = el.closest('[hidden]');
    const was = holder && holder.hidden;
    if(holder) holder.hidden = false;
    const cs = getComputedStyle(el);
    const out = { sel, bg:cs.backgroundColor, bw:cs.borderTopWidth, radius:cs.borderTopLeftRadius };
    if(holder) holder.hidden = was;
    return out;
  }));
for(const c of cards){
  if(c.absent) continue;   // 該分頁沒開就沒有這張卡，不算失敗
  ok(`${c.sel} --surface ＋ 1px 框 ＋ 4px 圓角`,
     c.bg === 'rgb(253, 252, 249)' && c.bw === '1px' && c.radius === '4px',
     `${c.bg} / ${c.bw} / ${c.radius}`);
}

/* ------------------------------------------------------------
   12. 表單設定新增的四個元件
   ------------------------------------------------------------
   Badge、Switch、Radio group、Conditional Reveal（UI-SPEC 3.5b／3.6b／
   3.6c／3.6d）。這一段守的是「它們沒有變成第五種長得差不多的東西」：
     ・Badge 是膠囊、字級 11px、不可點（沒有 hover 反應）
       —— Tag 改成方形之後，膠囊就是 Badge 專屬的形狀（見第 13 段）
     ・Switch 的原生 checkbox 要留在無障礙樹裡（不能 display:none）
       而且掛 role="switch"
     ・Radio 是方框（--radius）不是膠囊 —— 它是輸入元件，chip 是篩選器
     ・Reveal 收起來時是 display:none，不是灰掉
------------------------------------------------------------ */
console.log('\n【表單設定：Badge／Switch／Radio／Reveal】');
await go(ADMIN);
const bits = await page.evaluate(() => {
  const read = (sel) => {
    const el = document.querySelector(sel);
    if(!el) return null;
    const holder = el.closest('[hidden]');
    const was = holder && holder.hidden;
    if(holder) holder.hidden = false;
    const cs = getComputedStyle(el);
    const out = { size:cs.fontSize, radius:cs.borderTopLeftRadius, font:cs.fontFamily,
                  display:cs.display, minH:cs.minHeight, opacity:cs.opacity };
    if(holder) holder.hidden = was;
    return out;
  };
  /* .ad-badge 現在只由 admin.js 畫在活動卡上，登入門下的靜態 HTML 沒有 ——
     量不到就自己種一顆來量：這一段守的是 CSS 的規格，不是誰把它畫出來 */
  const readOrProbe = (sel, cls) => {
    const got = read(sel);
    if(got) return got;
    const el = document.createElement('span');
    el.className = cls;
    el.textContent = '測';
    document.body.appendChild(el);
    const cs = getComputedStyle(el);
    const out = { size:cs.fontSize, radius:cs.borderTopLeftRadius, font:cs.fontFamily,
                  display:cs.display, minH:cs.minHeight, opacity:cs.opacity };
    el.remove();
    return out;
  };
  const sw = document.querySelector('.ad-switch input');
  /* Switch 用的軌道就是「頁面設定」那一顆的 .ad-toggle-track —— 一份規格，
     所以這裡量到的尺寸與顏色，和頁面設定那一列量到的是同一份 CSS */
  const swBox = document.querySelector('.ad-switch .ad-toggle-track');
  const swCs = swBox ? getComputedStyle(swBox) : null;
  const swInCs = sw ? getComputedStyle(sw) : null;
  const reveal = document.querySelector('.ad-reveal');
  let revealHidden = null;
  if(reveal){
    reveal.hidden = true;
    revealHidden = getComputedStyle(reveal).display;
    reveal.hidden = false;
  }
  return {
    badge: readOrProbe('.ad-badge', 'ad-badge'),
    radio: read('.ad-radio'),
    switchRole: sw ? sw.getAttribute('role') : null,
    /* 藏起來但仍然在無障礙樹裡：不能是 display:none／visibility:hidden */
    switchInput: swInCs ? { display:swInCs.display, vis:swInCs.visibility } : null,
    switchBox: swCs ? { w:swCs.width, h:swCs.height, radius:swCs.borderTopLeftRadius } : null,
    /* 後台只有一種開關長相：Switch 不准自己另外畫一條軌道 */
    switchOwnTrack: !!document.querySelector('.ad-switch-box,.ad-switch-knob'),
    switchTracks: document.querySelectorAll('.ad-switch .ad-toggle-track').length,
    switchCount: document.querySelectorAll('.ad-switch').length,
    revealHidden,
  };
});
ok('找得到 Badge 與 Radio', !!bits.badge && !!bits.radio);
if(bits.badge){
  ok('.ad-badge 是膠囊', parseFloat(bits.badge.radius) >= 999, bits.badge.radius);
  ok('.ad-badge 字級 = --fs-pill(11px)', bits.badge.size === '11px', bits.badge.size);
  ok('.ad-badge 走 UI 軌', /^["']?Noto Sans TC/.test(bits.badge.font.trim()));
}
if(bits.radio){
  /* 方框而不是膠囊：和 .ad-chip 分得出來 */
  ok('.ad-radio 是 4px 方框（不是膠囊）', bits.radio.radius === '4px', bits.radio.radius);
  ok('.ad-radio 熱區 ≥40px（桌機）', parseFloat(bits.radio.minH) >= 40, bits.radio.minH);
}
ok('Switch 掛 role="switch"', bits.switchRole === 'switch', String(bits.switchRole));
if(bits.switchInput){
  ok('Switch 的原生 checkbox 仍在無障礙樹裡',
     bits.switchInput.display !== 'none' && bits.switchInput.vis !== 'hidden',
     `${bits.switchInput.display} / ${bits.switchInput.vis}`);
}
if(bits.switchBox){
  /* 和「頁面設定」那一顆同一條軌道，所以量到的是 .ad-toggle 的規格 */
  ok('Switch 的軌道是 44×24 的膠囊（＝ .ad-toggle-track）',
     bits.switchBox.w === '44px' && bits.switchBox.h === '24px'
       && parseFloat(bits.switchBox.radius) >= 999,
     `${bits.switchBox.w}×${bits.switchBox.h} / ${bits.switchBox.radius}`);
}
ok('Switch 沒有自己另外畫一條軌道', !bits.switchOwnTrack);
ok('每一顆 Switch 都用 .ad-toggle-track',
   bits.switchCount > 0 && bits.switchTracks === bits.switchCount,
   `${bits.switchTracks}/${bits.switchCount}`);
ok('Conditional Reveal 收起來是整塊不見（不是灰掉）',
   bits.revealHidden === 'none', String(bits.revealHidden));

/* ------------------------------------------------------------
   12b. 開關打開＝實心墨色；多行欄位有面，單行欄位沒有
   ------------------------------------------------------------
   ・Switch／Toggle 打開的底色是 --ink，和 .ad-chip.is-on 同一套「選中」語彙。
     accent 的職責是「記號」不是「開啟」—— 一排 accent 的開關讀起來像一排警示。
   ・輸入框底線化之後，單行的 input 和 96px 高的 textarea 只差在高度。
     多行那一個要有一層面，「一條線 ＝ 一行、一塊面 ＝ 一段」才說得通。
------------------------------------------------------------ */
console.log('\n【開關與多行欄位】');
await go(ADMIN);
const fields = await page.evaluate(() => {
  const probe = (tag, cls) => {
    const el = document.createElement(tag);
    el.className = cls;
    document.body.appendChild(el);
    const cs = getComputedStyle(el);
    const out = { bg:cs.backgroundColor, padL:cs.paddingLeft,
                  bTop:cs.borderTopWidth, bBottom:cs.borderBottomWidth };
    el.remove();
    return out;
  };
  /* 打開的軌道：種一顆真的出來量，不依賴頁面上剛好有沒有被打開的那一顆 */
  const wrap = document.createElement('label');
  wrap.className = 'ad-toggle';
  wrap.innerHTML = '<input type="checkbox" checked><span class="ad-toggle-track"></span>';
  document.body.appendChild(wrap);
  const trackOn = getComputedStyle(wrap.querySelector('.ad-toggle-track')).backgroundColor;
  wrap.remove();
  return { trackOn, input:probe('input','ad-input'), textarea:probe('textarea','ad-textarea') };
});
ok('Toggle 打開＝--ink 實心', fields.trackOn === 'rgb(35, 32, 32)', fields.trackOn);
ok('.ad-input 沒有面（只有一條底線）',
   fields.input.bg === 'rgba(0, 0, 0, 0)' && fields.input.bTop === '0px'
     && fields.input.bBottom === '1px',
   `${fields.input.bg} / 上${fields.input.bTop} 下${fields.input.bBottom}`);
ok('.ad-textarea 有一層 --bg2 的面，底線留著',
   fields.textarea.bg === 'rgb(241, 236, 227)' && fields.textarea.bBottom === '1px',
   `${fields.textarea.bg} / 下${fields.textarea.bBottom}`);
ok('.ad-textarea 的左右內距補回來了（字不貼著面的邊）',
   parseFloat(fields.textarea.padL) >= 10, fields.textarea.padL);

/* ------------------------------------------------------------
   13. Ivory：--primary 不得出現在任何 color 屬性上
   ------------------------------------------------------------
   改版前把品牌金放在**所有數字**上（禮金總額、統計方格、通行碼）。
   一個螢幕裡三十個金色數字，等於沒有任何一個數字被強調 ——
   而且舊金 #ca9a21 在白底只有 2.57:1，AA 與 AA Large 都不過。

   Ivory 把它降成「記號」：--primary 只做**面、線與圖示**，
   出現的地方只有五種 —— 焦點框、選中的定位線、側欄圖示、
   未儲存的那一點、.ad-badge.is-on。要拿它寫字時一律改用 --primary-deep。

   這一條直接掃 admin.css 的原始碼，而不是量算出來的樣式：
   規格講的是「不要這樣寫」，那就在寫的那一層攔下來。
   （--primary-deep 是專門當文字用的那一支，7.22:1 ✅，不在管制範圍。）
------------------------------------------------------------ */
console.log('\n【Ivory：--primary 只做面與線，不當文字】');
{
  const css = readFileSync(new URL('../public/css/admin.css', import.meta.url), 'utf8');
  /* 去掉註解再掃，不然說明文字裡提到的寫法會被誤判 */
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  /* 逐條規則看，而不是整份檔案掃字串：SVG 圖示用 stroke:currentColor 畫線，
     它的 color 是**線的顏色**不是文字顏色（.ad-ic ——「側欄圖示」正是 --primary
     該出現的五個地方之一）。那種規則放行，其餘一律不准。 */
  const bad = [];
  for(const m of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    const [, sel, decl] = m;
    if(!/(^|[;\s])color\s*:\s*var\(--primary\)/.test(decl)) continue;
    if(/stroke\s*:\s*currentColor/.test(decl)) continue;   // 圖示：color 是描邊色
    bad.push(sel.trim().slice(0, 60));
  }
  ok('admin.css 沒有 color:var(--primary)（圖示的 stroke:currentColor 除外）',
     bad.length === 0, bad.join(' / ') || '0 處');

  /* Tag 改成方形（Ivory §05）：tag 講「這一筆是什麼」（唯讀），
     chip 講「要不要篩掉」（可點）。形狀不同才說得出哪個能點。
     .ad-badge 維持膠囊，見第 12 段。 */
  const tag = /\.ad-tag\{[^}]*border-radius:var\(--radius\)/.test(body);
  ok('.ad-tag 是 --radius 方形（不再是膠囊）', tag);

  /* 字級全部走變數：改版前有 320 處硬寫、用掉 23 種值。 */
  const hard = [...body.matchAll(/font-size:\s*[\d.]+px/g)];
  ok('admin.css 沒有硬寫的 font-size', hard.length === 0,
     hard.slice(0, 3).map(m => m[0]).join(' / ') || '0 處');

  /* 白色與錯誤色同理：改版前 #fff 有 66 處、錯誤色三支散在 59 處。 */
  const white = [...body.matchAll(/#fff\b|#ffffff\b/gi)];
  ok('admin.css 沒有硬寫的白色', white.length === 0, `${white.length} 處`);
  const oldAlert = [...body.matchAll(/#a4677a\b|#8a5765\b/gi)];
  ok('admin.css 沒有硬寫的錯誤色', oldAlert.length === 0, `${oldAlert.length} 處`);

  /* 按鈕自己一階（--fs-btn）：和 --fs-ctl-sm 同值但刻意分開，
     不然「按鈕再大一點」會順手把整張表格一起改掉。 */
  ok('.btn 吃 --fs-btn 而不是 --fs-ctl-sm',
     /\.btn\{[^}]*font-size:var\(--fs-btn\)/.test(body.replace(/\s+/g, '')));

  /* Editorial 軌的拉丁字：Apple 吃系統內建的 Optima，
     其他裝置落到 Marcellus（Google Fonts 上最接近的一支），中文再落 Noto Serif TC。 */
  ok('--font-display 是 Optima → Marcellus → Noto Serif TC',
     /--font-display:'Optima','Marcellus','Noto Serif TC',serif/.test(body));
}

await browser.close();
console.log(failures ? `\n有 ${failures} 項未通過。` : '\n全部通過。');
process.exitCode = failures ? 1 : 0;
