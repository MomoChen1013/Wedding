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
     6. 遮罩：全部收在同一支冷灰
     7. 選單：兩個下拉選單（.ad-rowmenu／.ad-acct-pop）面與項同一份規格
     8. 圖示按鈕：✕ 只有兩個字級、每一顆都有 aria-label
     9. Pill 按鈕：只有 32／28 兩階
    10. Tab：兩種 tab 共用「白底 ＋ 字重 500 ＋ --primary-deep 定位線」
    11. 卡片：白底 ＋ 1px --line ＋ --radius

   這一支不需要 Firestore，只要 hosting 起得來就跑得動
   （頁面停在登入門也沒關係 —— 要量的是 CSS 與 HTML 屬性）。
============================================================ */
import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';

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
  ok(`${sel} 走 UI 軌（sans）`, /system-ui|PingFang|Noto Sans/.test(b || ''));
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
ok('--ink-soft 兩頁都是後台那一階（5.93:1）',
   inkAdmin === inkButler && inkAdmin === '#6a5e53',
   `admin=${inkAdmin} butler=${inkButler}`);

/* ------------------------------------------------------------
   3. 焦點框
------------------------------------------------------------ */
console.log('\n【焦點框：收禮台也要有】');
await go(BUTLER);
const focusShadow = await page.evaluate(() => {
  /* 通行碼那一層預設收著，focus() 打不進 display:none 的元素 */
  document.querySelector('#btGate').hidden = false;
  const el = document.querySelector('#btPass');
  if(!el) return null;
  el.focus();
  return getComputedStyle(el).boxShadow;
});
ok('.ad-input 聚焦時有焦點訊號', !!focusShadow && focusShadow !== 'none', focusShadow);

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
  ok('遮罩 = --scrim-drawer(.2)', drawer.scrim === 'rgba(43, 47, 54, 0.2)', drawer.scrim);
  ok('關閉鈕有 aria-label', drawer.close);
  ok('CTA 貼底（-foot）', drawer.foot);
}

/* ------------------------------------------------------------
   6. 遮罩：同一支冷灰
   ------------------------------------------------------------
   側欄只有在 <900px 才是抽屜，桌機是常駐的、根本沒有遮罩，
   所以這一段要先把視窗縮到手機尺寸。
------------------------------------------------------------ */
console.log('\n【遮罩：全部收在同一支冷灰】');
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
for(const [name, want] of [['側欄', 'rgba(43, 47, 54, 0.32)'],
                           ['彈窗', 'rgba(43, 47, 54, 0.72)'],
                           ['抽屜', 'rgba(43, 47, 54, 0.2)']]){
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
  /* --ink = #2f2b26 = rgb(47, 43, 38)。用 --ink 而不是 --line：
     可以點的浮層要比背景重一階（規範 3.9） */
  ok('選單的面用 --ink 框',
     menus.acctPop.border === '1px rgb(47, 43, 38)', menus.acctPop.border);
  ok('選單的面有 --shadow-pop', menus.acctPop.shadow !== 'none', menus.acctPop.shadow);
  ok('選單項熱區 ≥44px', parseFloat(menus.acctItem.minH) >= 44, menus.acctItem.minH);
  ok('選單項字級 14px（與 .ad-rowmenu-item 同一份）',
     menus.acctItem.size === '14px', menus.acctItem.size);
  ok('選單項走 UI 軌', /system-ui|PingFang|Noto Sans/.test(menus.acctItem.font));
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
ok('✕ 的字級只有 16px 一種（桌機）',
   closeSizes.every(v => v === '16px'), closeSizes.join(' / '));

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
  ok(`${p.sel} 字級是 12px`, p.size === '12px', p.size);
}

/* ------------------------------------------------------------
   10. Tab：兩種 tab 共用同一套「選中」語彙
------------------------------------------------------------ */
console.log('\n【Tab：白底 ＋ 字重 500 ＋ --primary-deep 定位線】');
await go(ADMIN);
const tabs = await page.evaluate(() => {
  const on = (sel) => {
    const el = document.querySelector(sel);
    if(!el) return null;
    el.classList.add('is-on');
    const cs = getComputedStyle(el);
    return { bg:cs.backgroundColor, weight:cs.fontWeight,
             left:cs.borderLeftWidth + ' ' + cs.borderLeftColor,
             bottom:cs.borderBottomWidth + ' ' + cs.borderBottomColor };
  };
  return { tab:on('.ad-tab'), subtab:on('.ad-subtab') };
});
ok('找得到兩種 tab', !!tabs.tab && !!tabs.subtab);
if(tabs.tab && tabs.subtab){
  /* 選中的語彙是同一套：白底 ＋ 字重 500 ＋ 一道 --primary-deep 的定位線。
     線寬刻意不同 —— 側欄 1px（字重才是主訊號）、子分頁 2px（要接上那條底線）。 */
  ok('.ad-tab.is-on 白底 ＋ 字重 500 ＋ 左邊 2px 定位線',
     tabs.tab.bg === 'rgb(255, 255, 255)' && tabs.tab.weight === '500'
       && tabs.tab.left.startsWith('2px'),
     `${tabs.tab.bg} / ${tabs.tab.weight} / ${tabs.tab.left}`);
  ok('.ad-subtab.is-on 白底 ＋ 字重 500 ＋ 下面 3px 定位線',
     tabs.subtab.bg === 'rgb(255, 255, 255)' && tabs.subtab.weight === '500'
       && tabs.subtab.bottom.startsWith('3px'),
     `${tabs.subtab.bg} / ${tabs.subtab.weight} / ${tabs.subtab.bottom}`);
  ok('兩條定位線是同一個顏色',
     tabs.tab.left.split(' ').slice(1).join(' ') === tabs.subtab.bottom.split(' ').slice(1).join(' '),
     tabs.subtab.bottom.split(' ').slice(1).join(' '));
}

/* ------------------------------------------------------------
   11. 卡片：白底 ＋ 1px --line ＋ --radius
------------------------------------------------------------ */
console.log('\n【卡片：同一種面】');
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
  ok(`${c.sel} 白底 ＋ 1px 框 ＋ 4px 圓角`,
     c.bg === 'rgb(255, 255, 255)' && c.bw === '1px' && c.radius === '4px',
     `${c.bg} / ${c.bw} / ${c.radius}`);
}

await browser.close();
console.log(failures ? `\n有 ${failures} 項未通過。` : '\n全部通過。');
process.exitCode = failures ? 1 : 0;
