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
ok('--ink-soft 兩頁都是後台那一階（5.53:1）',
   inkAdmin === inkButler && inkAdmin === '#6f6459',
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

await browser.close();
console.log(failures ? `\n有 ${failures} 項未通過。` : '\n全部通過。');
process.exitCode = failures ? 1 : 0;
