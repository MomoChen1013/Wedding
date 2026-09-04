/* ============================================================
   multipage.mjs — 多頁面站台的瀏覽器測試
   ・驗證每一頁都載得起來、沒有 console 錯誤
   ・驗證站內連結都帶上 /w/{slug}
   ・驗證未啟用的頁面會被導回大廳、入口也不會出現
   ・驗證兩組新人的資料互不相見
============================================================ */
import { chromium } from 'playwright';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5000';

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

/* ---------- 種測試資料 ---------- */
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
const { initializeApp: adminInit } = await import('firebase-admin/app');
const { getFirestore: adminFirestore, Timestamp: TS } = await import('firebase-admin/firestore');

adminInit({ projectId: process.env.GCLOUD_PROJECT || 'wedding-22b94' });
const adb = adminFirestore();

const DAY = 86400000;
const future = (d) => TS.fromMillis(Date.now() + d * DAY);

/* invitation 已經併進 rsvp：網址是 /invitation，開關代號仍然是 rsvp */
const ALL_PAGES = ['rsvp','wall','cake','draw','exhibition','quiz',
  'seating','letter'];
const allOn = Object.fromEntries(ALL_PAGES.map((k) => [k, true]));
/* 排桌管理沒有對外網址，開關同樣放在 pages 裡（見 site-context.js 的 ADMIN_FEATURES）。
   還原 pages 的地方也要記得帶上它，不然後台的分頁會跟著消失。 */
const allOnPlusAdmin = { ...allOn, seatingPlan: true };

const SEED = {
  /* 全部頁面都開的站台 */
  'ginny-one-20260919': {
    groomName:'Ginny', brideName:'One',
    themeColor:'#3D9AD1',
    venueName:'台北國賓大飯店・二樓國際廳',
    venueAddress:'台北市中山區中山北路二段63號',
    story:'第一次見面是在朋友的聚會上，\n那天我們聊到了最後一個離開。',
    dressCode:'溫柔大地色系', giftNote:'您願意撥空前來就是最好的禮物 ♡',
    hashtags:['#GinnyOne2026'],
    pages: allOnPlusAdmin,
    ownerEmails:['couple@example.com'],
    /* 賓客標籤：整個功能由我們打開（新人改不動），
       onForm 的那個才會變成表單上的選項 */
    guestTagsEnabled: true,
    guestTags: [
      { id:'tag-college', name:'大學同學', onForm:true },
      { id:'tag-vip',     name:'VIP',      onForm:false },
    ],
    /* 固定日期，斷言才不會隨執行日期漂移：台北 2026-09-19 12:00 */
    eventDate: TS.fromDate(new Date('2026-09-19T04:00:00Z')),
  },
  /* 只開最少頁面的站台，用來驗證開關真的有效 */
  /* 有素材資料夾的站台，驗證 manifest 自動載入 */
  'demo-wedding-2027': {
    groomName:'示範', brideName:'站台',
    themeColor:'#7A9E7E',
    venueName:'示範會館', venueAddress:'台北市',
    story:'', dressCode:'', giftNote:'', hashtags:[],
    pages: allOn, ownerEmails:[],
  },
  /* 關掉入場登入的站台：賓客不必報上名來，一進來就是大廳 */
  'no-login-2027': {
    groomName:'阿明', brideName:'阿美',
    themeColor:'#B5838D',
    venueName:'福華飯店', venueAddress:'台北市大安區仁愛路三段',
    story:'', dressCode:'', giftNote:'', hashtags:[],
    pages: Object.fromEntries(ALL_PAGES.map((k) => [k, k === 'seating' || k === 'wall'])),
    ownerEmails:[],
    entryLoginEnabled: false,
  },
  'minimal-site-2027': {
    groomName:'小明', brideName:'小美',
    themeColor:'#B5838D',
    venueName:'圓山大飯店', venueAddress:'台北市士林區中山北路四段1號',
    story:'', dressCode:'', giftNote:'', hashtags:[],
    pages: Object.fromEntries(ALL_PAGES.map((k) => [k, k === 'rsvp'])),
    /* 後台分頁要跟著頁面開關收起來，所以這組站台也要能登入後台 */
    ownerEmails:['couple@example.com'],
  },
};

async function seed(){
  for(const col of ['sites','slugs']){
    const snap = await adb.collection(col).get();
    await Promise.all(snap.docs.map((d) => adb.recursiveDelete(d.ref)));
  }
  const ids = {};
  for(const [slug, data] of Object.entries(SEED)){
    const ref = adb.collection('sites').doc();
    await ref.set({
      slug, status:'published',
      eventDate: future(200), timezone:'Asia/Taipei',
      rsvpDeadline: future(150), rsvpEnabled:true,
      venueMapUrl:'', coverImageUrl:'', photos:[], ownerEmail:'',
      createdAt: TS.now(), updatedAt: TS.now(),
      ...data,
    });
    await adb.collection('slugs').doc(slug).set({ siteId: ref.id, createdAt: TS.now() });
    ids[slug] = ref.id;
  }
  return ids;
}

/* 三個新模組的測試資料：桌次名單、祝福信、Explore 自訂卡片。
   這些平常由新人在 /w/{slug}/admin 建立，測試裡用 Admin SDK 直接寫。 */
async function seedModules(siteId){
  const sub = (name) => adb.collection('sites').doc(siteId).collection(name);
  const now = Date.now();

  await sub('seating').doc('s1').set({ name:'王小明', table:'第 3 桌', note:'素食', time: now });
  await sub('seating').doc('s2').set({ name:'林美美', table:'第 3 桌', note:'', time: now });
  await sub('seating').doc('s3').set({ name:'陳大同', table:'主桌',   note:'', time: now });

  await sub('blessings').doc('b1').set({
    terms:['王小明','小明'], title:'給小明的一封信',
    body:'謝謝你今天特地趕來，我們真的很開心。',
    sign:'Ginny & One', isDefault:false, time: now,
  });
  await sub('blessings').doc('b2').set({
    terms:[], title:'給每一位朋友',
    body:'謝謝你來，這一天因為你更完整。',
    sign:'Ginny & One', isDefault:true, time: now,
  });

  await sub('explore').doc('x1').set({
    title:'接駁車資訊', sub:'幾點在哪裡上車，這裡先講清楚',
    kind:'popup', url:'', body:'早上 10:30 在台北車站東三門集合。',
    order:1, time: now,
  });
  await sub('explore').doc('x2').set({
    title:'婚禮直播', sub:'不能到場也能一起參與',
    kind:'link', url:'https://example.com/live', body:'',
    order:2, time: now,
  });
}

const siteIds = await seed();
await seedModules(siteIds['ginny-one-20260919']);
console.log('已寫入測試資料。');

/* ---------- 瀏覽器 ---------- */
const browser = await chromium.launch({ executablePath: findChromium() });

const SDK_DIR = new URL('../node_modules/firebase/', import.meta.url);
const sdk = {
  app: readFileSync(new URL('firebase-app.js', SDK_DIR), 'utf8'),
  firestore: readFileSync(new URL('firebase-firestore.js', SDK_DIR), 'utf8'),
  auth: readFileSync(new URL('firebase-auth.js', SDK_DIR), 'utf8'),
};
/* cake.html 的物理效果來自 CDN 的 matter-js，沙箱連不出去，改餵本機版本 */
const matterJs = readFileSync(
  new URL('../node_modules/matter-js/build/matter.min.js', import.meta.url), 'utf8');

/* 子頁面都要求先在大廳報到過，否則會被導回大廳。
   測試時直接把「已入場」的狀態寫進 localStorage。 */
async function newPage(opts = {}, { guest = true } = {}){
  const page = await browser.newPage(opts);
  if(guest){
    await page.addInitScript((ids) => {
      for(const id of ids){
        localStorage.setItem(`wed.${id}.user`,
          JSON.stringify({ name:'測試賓客', icon:'\u2726' }));
      }
    }, Object.values(siteIds));
  }
  const pin = (body, url) => {
    const v = url.match(/firebasejs\/([^/]+)\//)?.[1];
    return body.replace(
      /https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/firebase-app\.js/g,
      `https://www.gstatic.com/firebasejs/${v}/firebase-app.js`);
  };
  await page.route('**/firebasejs/**/firebase-app.js', (r) =>
    r.fulfill({ contentType:'text/javascript', body: sdk.app }));
  await page.route('**/firebasejs/**/firebase-firestore.js', (r) =>
    r.fulfill({ contentType:'text/javascript', body: pin(sdk.firestore, r.request().url()) }));
  await page.route('**/firebasejs/**/firebase-auth.js', (r) =>
    r.fulfill({ contentType:'text/javascript', body: pin(sdk.auth, r.request().url()) }));
  await page.route('**://fonts.googleapis.com/**', (r) =>
    r.fulfill({ contentType:'text/css', body:'' }));
  await page.route('**://fonts.gstatic.com/**', (r) => r.abort());
  /* Playwright 後註冊的 route 優先，所以萬用的要先註冊 */
  await page.route('**://cdn.jsdelivr.net/**', (r) =>
    r.fulfill({ contentType:'text/javascript', body:'' }));
  await page.route('**://cdn.jsdelivr.net/**/matter*.js', (r) =>
    r.fulfill({ contentType:'text/javascript', body: matterJs }));
  return page;
}

let failures = 0;
function ok(label, cond, extra = ''){
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${extra ? ' — ' + extra : ''}`);
  if(!cond) failures++;
}

/* 忽略字體與圖片這類「測試環境沒有」的雜訊 */
function realErrors(list){
  return list.filter((t) =>
    !/favicon|fonts\.|\.png|\.jpg|\.jpeg|\.webp|jsdelivr|ERR_FAILED|status of 404/i.test(t));
}

async function visit(path, { waitForBody = true, guest = true } = {}){
  const page = await newPage({}, { guest });
  const errors = [];
  page.on('console', (m) => { if(m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(BASE + path, { waitUntil:'domcontentloaded' });
  if(waitForBody){
    /* site-context 載完 common.js 後 window.SITE 才會存在；
       失敗時畫面會帶上 [data-fatal] */
    await page.waitForFunction(
      () => document.documentElement.dataset.siteReady === '1'
         || !!document.querySelector('[data-fatal]'),
      null, { timeout: 20000 });
  }
  return { page, errors };
}

/* 清空一個子集合，並等到伺服器那邊真的空了才回來 */
async function wipeCol(col){
  await Promise.all((await col.get()).docs.map((d) => d.ref.delete()));
  await waitForColSize(col, 0);
}

/* 瀏覽器端的 onSnapshot 會先反映「還沒送到伺服器」的寫入，
   所以用 Admin SDK 查證之前，先等伺服器上的筆數對上 */
async function waitForColSize(col, want, orderField, ms = 15000){
  const until = Date.now() + ms;
  for(;;){
    const snap = await (orderField ? col.orderBy(orderField) : col).get();
    if(snap.size === want || Date.now() > until) return snap;
    await new Promise((r) => setTimeout(r, 300));
  }
}

const SLUG = 'ginny-one-20260919';
/* 素材測試用的站台，slug 對應 public/assets/demo-wedding-2027/ */
const ASSET_SLUG = 'demo-wedding-2027';

/* 用 Auth emulator 的假 Google 憑證登入成新人。
   emulator 接受把 claims 直接當成 idToken 傳進 GoogleAuthProvider.credential()，
   所以測試不需要真的開 Google 登入彈窗。 */
async function signInAsOwner(page, email){
  await page.evaluate(async (mail) => {
    const m = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js');
    /* sub 要跟著 email 走：同一個 sub 在 emulator 是同一個帳號，
       共用的話「換一個信箱登入」其實還是原來那位，測試會假性通過 */
    const cred = m.GoogleAuthProvider.credential(
      JSON.stringify({ sub:`uid-${mail}`, email: mail, email_verified: true }));
    await m.signInWithCredential(window.fb.auth, cred);
  }, email);
}

/* ---------- 每一頁都要載得起來 ---------- */
console.log('\n[1] 每個頁面都能正常載入');
for(const key of ['', 'invitation', 'wall', 'cake', 'draw', 'exhibition', 'quiz',
                  'seating', 'letter']){
  const path = `/w/${SLUG}/${key}`;
  const { page, errors } = await visit(path);
  const hasSite = await page.evaluate(() => !!window.SITE);
  const siteId = await page.evaluate(() => window.SITE && window.SITE.siteId);
  const real = realErrors(errors);
  ok(`${path || '/'} 載入`, hasSite, hasSite ? '' : 'window.SITE 未建立');
  ok(`${path} siteId 正確`, siteId === siteIds[SLUG], siteId || '(無)');
  ok(`${path} 無 console 錯誤`, real.length === 0, real.slice(0, 2).join(' | '));
  await page.close();
}

/* ---------- 站內連結都要帶 slug ---------- */
console.log('\n[2] 站內連結已 slug 化');
{
  const { page } = await visit(`/w/${SLUG}/`);
  const bad = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]'))
      .map((a) => a.getAttribute('href'))
      .filter((h) => /\.html$/.test(h)));
  ok('大廳沒有殘留的 xxx.html 連結', bad.length === 0, bad.join(', '));

  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href^="/w/"]')).map((a) => a.getAttribute('href')));
  ok('大廳有站內連結', links.length > 0, `${links.length} 個`);
  ok('連結都含本站 slug', links.every((h) => h.startsWith(`/w/${SLUG}`)), links.slice(0,3).join(', '));
  await page.close();
}

/* ---------- 樣板文字 ---------- */
console.log('\n[2b] 新人名字有套進畫面');
{
  /* 尚未入場的新訪客會看到大廳的入場 gate，名字與日期就在那裡 */
  const { page } = await visit(`/w/${SLUG}/`, { guest:false });
  const gate = await page.innerText('#gate');
  ok('入場畫面顯示這組新人', gate.includes('Ginny & One'), gate.slice(0, 50).replace(/\n/g, ' '));
  ok('入場畫面顯示婚禮日期', gate.includes('2026.09.19'), gate.slice(0, 80).replace(/\n/g, ' '));
  const text = await page.innerText('body');
  ok('沒有殘留上一組新人的名字', !/Ethan|Momo/.test(text));
  ok('沒有露出未取代的 token', !text.includes('{{'), text.match(/\{\{\w+\}\}/g)?.join(',') || '');
  await page.close();
}
{
  /* 婚禮資訊已經併進首頁，不再有獨立的 info 頁 */
  const { page } = await visit(`/w/${SLUG}/`);
  const text = await page.innerText('body');
  ok('首頁顯示新人與場地',
    text.includes('Ginny & One') && text.includes('台北國賓大飯店'),
    text.slice(0, 80).replace(/\n/g, ' '));
  /* 內建 6 張（wall/exhibition/quiz/draw/cake/letter 都開著；桌次已經改成
     資訊區最下面的「尋找我的座位」按鈕，不再是 Explore 的卡片）
     ＋ 新人自訂的 2 張。自訂卡是非同步讀進來的，等它出現再數 */
  await page.waitForSelector('.link-card.is-custom', { timeout: 10000 }).catch(() => {});
  const cardCount = await page.locator('.link-card').count();
  ok('首頁卡片＝內建 6 張＋自訂 2 張', cardCount === 8, String(cardCount));
  ok('資訊區最下面有「尋找我的座位」',
    await page.isVisible('#infoSeatCta a'));
  ok('每頁都有頂部導覽列', await page.isVisible('#siteNav'));
  await page.close();
}
{
  const { page } = await visit('/w/minimal-site-2027/', { guest:false });
  const gate = await page.innerText('#gate');
  ok('另一組站台顯示自己的名字', gate.includes('小明 & 小美'), gate.slice(0, 50).replace(/\n/g, ' '));
  await page.close();
}

/* ---------- 頁面開關 ---------- */
console.log('\n[3] 頁面開關');
{
  const { page } = await visit('/w/minimal-site-2027/');
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href^="/w/"]')).map((a) => a.getAttribute('href')));
  ok('未啟用的入口不出現在首頁',
    !links.some((h) => /\/(wall|cake|draw|exhibition|quiz|seating|letter)$/.test(h)),
    links.join(', '));
  ok('已啟用的出席回覆入口仍在（網址是 /invitation）',
    links.some((h) => h.endsWith('/invitation')), links.join(', '));
  await page.close();
}
{
  /* 直接打未啟用頁面的網址，應被導回大廳 */
  const page = await newPage();
  await page.goto(`${BASE}/w/minimal-site-2027/cake`, { waitUntil:'domcontentloaded' });
  await page.waitForURL(`**/w/minimal-site-2027/`, { timeout: 20000 }).catch(() => {});
  ok('直接開未啟用頁面會導回大廳',
    page.url().endsWith('/w/minimal-site-2027/'), page.url());
  await page.close();
}

/* ---------- 入場登入的開關 ---------- */
console.log('\n[3b] 入場登入（entryLoginEnabled）');
{
  /* guest:false＝localStorage 是乾淨的，等於一位第一次點進來的賓客 */
  const { page, errors } = await visit('/w/no-login-2027/', { guest:false });
  ok('關掉入場登入後大廳沒有入場畫面',
    (await page.locator('#gate').count()) === 0);
  ok('改成一進來就播開場字幕', await page.isVisible('#intro'));
  const line = (await page.innerText('#introLine')).trim();
  ok('字幕是開場文案',
    ['我們要結婚了', '邀請你，\n見證這一刻'].includes(line), JSON.stringify(line));
  ok('開場期間有「跳過」', await page.isVisible('#introSkip'));

  /* 第二句要真的斷成兩行（文案裡的 \n ＋ white-space:pre-line） */
  await page.waitForFunction(
    () => document.getElementById('introLine').textContent.includes('見證這一刻'),
    null, { timeout: 5000 });
  const second = await page.innerText('#introLine');
  ok('第二句斷成兩行', /邀請你，\s*\n\s*見證這一刻/.test(second), JSON.stringify(second));

  /* 不按跳過的話，字幕 2 秒 + 簾幕 1.5 秒之後自己進大廳 */
  await page.waitForSelector('#app', { state:'visible', timeout: 10000 });
  ok('開場播完自動進大廳', await page.isVisible('#app'));
  ok('播完收掉字幕與跳過按鈕',
    !(await page.isVisible('#intro')) && !(await page.isVisible('#introSkip')));
  ok('導覽列出現', await page.isVisible('#siteNav'));
  ok('還沒留名字，導覽列不出現 User 那塊',
    (await page.locator('.nav-user').count()) === 0);
  ok('無 console 錯誤', realErrors(errors).length === 0, realErrors(errors).slice(0,2).join(' | '));

  /* 同一個分頁再回大廳：開場不再播（sessionStorage 記著） */
  await page.goto(`${BASE}/w/no-login-2027/`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.siteReady === '1',
    null, { timeout: 20000 });
  ok('同一個分頁回大廳不再播開場',
    !(await page.isVisible('#intro')) && await page.isVisible('#app'));
  await page.close();
}
{
  /* 「跳過」要能中途把開場收掉，直接進大廳 */
  const { page } = await visit('/w/no-login-2027/', { guest:false });
  await page.click('#introSkip');
  ok('按跳過直接進大廳', await page.isVisible('#app'));
  ok('跳過後字幕、簾幕、跳過按鈕都收掉',
    !(await page.isVisible('#intro'))
    && !(await page.isVisible('#curtain'))
    && !(await page.isVisible('#introSkip')));
  await page.close();
}
{
  /* 入場畫面預設藏著（由 CSS 決定），所以在 JS 決定之前不會閃一下登入畫面 */
  const { page } = await visit(`/w/${SLUG}/`);
  const gateHiddenByCss = await page.evaluate(() => {
    for(const sheet of document.styleSheets){
      let rules;
      try{ rules = sheet.cssRules; }catch{ continue; }
      for(const r of rules){
        if(r.selectorText === '#gate' && r.style.display === 'none') return true;
      }
    }
    return false;
  });
  ok('入場畫面預設是藏著的（不會閃一下）', gateHiddenByCss);
  ok('報到過的賓客連 gate 元素都不留',
    (await page.locator('#gate').count()) === 0);
  await page.close();
}
{
  /* 沒有 gate 可以報到，所以需要名字的頁面不能再把賓客彈回大廳 */
  const { page, errors } = await visit('/w/no-login-2027/wall', { guest:false });
  ok('祝福牆不會被導回大廳',
    new URL(page.url()).pathname === '/w/no-login-2027/wall', page.url());

  await page.fill('#wishText', '祝你們幸福');
  await page.click('#postWish');
  await page.waitForSelector('.ask-name', { state:'visible', timeout: 5000 }).catch(() => {});
  ok('送出的那一刻才問名字', await page.isVisible('.ask-name'));

  await page.fill('.ask-name .ask-input', '路過的朋友');
  await page.click('.ask-name [data-act="ok"]');
  await page.waitForSelector('.ask-name', { state:'detached', timeout: 10000 });

  const wishes = await waitForColSize(
    adb.collection('sites').doc(siteIds['no-login-2027']).collection('wishes'), 1);
  ok('填完名字才真的送出', wishes.size === 1, `${wishes.size} 筆`);
  ok('祝福掛在剛填的名字下',
    wishes.size === 1 && wishes.docs[0].data().name === '路過的朋友',
    wishes.size ? JSON.stringify(wishes.docs[0].data()) : '');
  ok('有名字之後導覽列長出 User 那塊', await page.isVisible('.nav-user'));
  ok('無 console 錯誤', realErrors(errors).length === 0, realErrors(errors).slice(0,2).join(' | '));
  await page.close();
}
{
  /* 開著入場登入的站台照舊：第一次來的賓客先看到入場畫面，
     填完名字才播開場字幕 */
  const { page } = await visit(`/w/${SLUG}/`, { guest:false });
  ok('沒關開關的站台仍有入場畫面', await page.isVisible('#gate'));
  ok('入場畫面期間沒有跳過按鈕', !(await page.isVisible('#introSkip')));

  await page.fill('#nameInput', '第一次來的賓客');
  await page.click('#enterBtn');
  ok('填完名字才播開場字幕', await page.isVisible('#intro'));
  await page.waitForSelector('#app', { state:'visible', timeout: 10000 });
  ok('開場播完進大廳', await page.isVisible('#app'));
  await page.close();
}

/* ---------- 資料寫入正確的子集合 ---------- */
console.log('\n[4] 祝福牆寫入隔離');
{
  const { page, errors } = await visit(`/w/${SLUG}/wall`);
  await page.evaluate(() => DataStore.addWish({ name:'測試賓客', icon:'\u2726', text:'祝你們幸福！' }));
  await page.waitForTimeout(1500);

  const mine = await adb.collection('sites').doc(siteIds[SLUG]).collection('wishes').get();
  const other = await adb.collection('sites').doc(siteIds['minimal-site-2027']).collection('wishes').get();
  ok('祝福寫進本站台', mine.size === 1, `${mine.size} 筆`);
  ok('另一組新人看不到這筆', other.size === 0, `${other.size} 筆`);
  ok('欄位正確',
    mine.size === 1 && mine.docs[0].data().text === '祝你們幸福！',
    mine.size ? JSON.stringify(mine.docs[0].data()) : '');
  ok('無 console 錯誤', realErrors(errors).length === 0, realErrors(errors).slice(0,2).join(' | '));
  await page.close();
}

/* ---------- RSVP ----------
   表單由 js/rsvp-form.js 產生，與單頁邀請函共用同一份題目 */
console.log('\n[5] RSVP 寫入');
{
  const { page } = await visit(`/w/${SLUG}/invitation`);
  await page.fill('#rName', '王小明');
  await page.click('#attendRow .choice[data-val="yes"]');
  await page.click('#relationRow .choice[data-val="bride"]');
  ok('表單只出現新人開放的標籤',
    (await page.locator('#tagRow .choice').allInnerTexts()).join('／') === '大學同學',
    (await page.locator('#tagRow .choice').allInnerTexts()).join('／'));
  await page.click('#tagRow .choice[data-val="tag-college"]');
  await page.fill('#rPhone', '0912345678');
  await page.click('#headPlus');            // 2 位
  await page.click('#vegPlus');             // 其中 1 位素食
  await page.check('#childSeatOn');         // 需要 1 張兒童椅
  await page.click('#cardRow .choice[data-val="paper"]');
  await page.click('#cardDeliveryRow .choice[data-val="mail"]');
  await page.fill('#rCardZip', '104');
  await page.fill('#rCardAddr', '台北市中山區南京東路一段 1 號');
  await page.click('#giftRow .choice[data-val="pickup"]');
  await page.fill('#rNote', '恭喜！');
  await page.fill('#rMemo', '停車位需要一個');
  await page.click('#submitBtn');
  await page.waitForTimeout(2500);

  const snap = await adb.collection('sites').doc(siteIds[SLUG]).collection('rsvps').get();
  ok('RSVP 有寫入', snap.size === 1, `${snap.size} 筆`);
  if(snap.size){
    const d = snap.docs[0].data();
    ok('attending 是 boolean', d.attending === true, String(d.attending));
    ok('guestCount 正確', d.guestCount === 2, String(d.guestCount));
    ok('與新人關係有存下來', d.relation === 'bride', d.relation);
    ok('賓客自己選的標籤有存下來', d.tag === 'tag-college', d.tag);
    ok('葷素分配加起來等於人數',
      d.mealMeat === 1 && d.mealVeg === 1, `葷 ${d.mealMeat} / 素 ${d.mealVeg}`);
    ok('兒童座椅張數正確', d.childSeat === 1, String(d.childSeat));
    ok('喜帖紙本郵寄並帶地址',
      d.cardType === 'paper' && d.cardDelivery === 'mail' && d.cardZip === '104'
        && d.cardAddress.includes('南京東路'),
      `${d.cardType}/${d.cardDelivery}/${d.cardZip}`);
    ok('喜餅現場領取時不留地址',
      d.giftDelivery === 'pickup' && d.giftAddress === '', d.giftDelivery);
    ok('其他備註有存下來', d.note === '停車位需要一個', d.note);
    ok('聯絡電話有存下來', d.contactPhone === '0912345678', d.contactPhone);
    ok('tentative 為 false', d.tentative === false, String(d.tentative));
    ok('createdAt 由伺服器寫入', d.createdAt && typeof d.createdAt.toDate === 'function');
  }
  await page.close();
}

/* ---------- 視情況而定（maybe）也要能存 ---------- */
console.log('\n[6] 視情況而定的回覆');
{
  const { page } = await visit(`/w/${SLUG}/invitation`);
  await page.evaluate(() => LS.remove('rsvp.mine'));
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => !!document.getElementById('rsvpForm'), null, { timeout:20000 });
  await page.fill('#rName', '張三');
  await page.click('#attendRow .choice[data-val="maybe"]');
  await page.click('#relationRow .choice[data-val="other"]');
  await page.fill('#rEmail', 'zhang@example.com');
  await page.click('#cardRow .choice[data-val="none"]');
  await page.click('#giftRow .choice[data-val="pickup"]');
  await page.click('#submitBtn');
  await page.waitForTimeout(2500);

  const snap = await adb.collection('sites').doc(siteIds[SLUG]).collection('rsvps').get();
  const maybe = snap.docs.map((d) => d.data()).find((d) => d.name === '張三');
  ok('未定回覆有寫入', !!maybe);
  ok('未定 → attending false + tentative true',
    maybe && maybe.attending === false && maybe.tentative === true,
    maybe ? `${maybe.attending}/${maybe.tentative}` : '');
  ok('沒出席就不記人數與餐點',
    maybe && maybe.guestCount === 1 && maybe.mealMeat === 0 && maybe.mealVeg === 0,
    maybe ? `${maybe.guestCount}/${maybe.mealMeat}/${maybe.mealVeg}` : '');
  await page.close();
}

/* ---------- 必填的題目沒填完就送不出去 ---------- */
console.log('\n[6b] 表單驗證');
{
  const { page } = await visit(`/w/${SLUG}/invitation`);
  await page.evaluate(() => LS.remove('rsvp.mine'));
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => !!document.getElementById('rsvpForm'), null, { timeout:20000 });

  const before = (await adb.collection('sites').doc(siteIds[SLUG])
    .collection('rsvps').get()).size;

  await page.fill('#rName', '李四');
  await page.click('#attendRow .choice[data-val="no"]');
  await page.click('#submitBtn');            // 還沒選關係
  await page.waitForTimeout(400);
  ok('沒選關係會被擋下',
    (await page.innerText('#rErr')).includes('關係'), await page.innerText('#rErr'));

  await page.click('#relationRow .choice[data-val="groom"]');
  await page.click('#submitBtn');            // 還沒留聯絡方式
  await page.waitForTimeout(400);
  ok('沒留聯絡方式會被擋下',
    (await page.innerText('#rErr')).includes('聯絡方式'), await page.innerText('#rErr'));

  await page.fill('#rLine', 'lisi-line');
  await page.click('#submitBtn');            // 還沒選喜帖
  await page.waitForTimeout(400);
  ok('沒選喜帖會被擋下',
    (await page.innerText('#rErr')).includes('喜帖'), await page.innerText('#rErr'));

  const after = (await adb.collection('sites').doc(siteIds[SLUG])
    .collection('rsvps').get()).size;
  ok('沒填完不會寫進資料庫', after === before, `${before} → ${after}`);
  await page.close();
}

/* ---------- 多活動的讀取層 ----------
   Phase 2 只加讀取用的純函式，畫面一個字都沒改。
   這一段驗的就是那件事：
     ・沒有 events 的站台（＝所有既有站台）合成出一個婚宴，畫面照舊
     ・有 events 的站台讀得出多個活動，壞掉的那幾筆會被清掉
     ・舊回覆在多活動的世界裡仍然答得出主要活動，其餘算「待回覆」 */
console.log('\n[6c] 多活動的讀取層');
{
  /* ---- 先看既有站台（沒有 events）---- */
  const { page } = await visit(`/w/${SLUG}/invitation`);
  const single = await page.evaluate(() => ({
    multiOn: multiEventOn(),
    events: weddingEvents(),
    rsvpCount: rsvpEvents().length,
    primary: primaryEventId(),
  }));
  ok('沒有 events 的站台合成出一個活動', single.events.length === 1,
     `${single.events.length} 個`);
  ok('合成的那一個是婚宴，id 固定 main',
     single.events[0].id === 'main' && single.events[0].type === 'reception'
     && single.events[0].name === '婚宴',
     `${single.events[0].id} / ${single.events[0].type} / ${single.events[0].name}`);
  ok('地點從站台既有欄位帶過來',
     single.events[0].venueName === '台北國賓大飯店・二樓國際廳',
     single.events[0].venueName);
  ok('日期時間是婚禮當地的牆上時間',
     single.events[0].date === '2026-09-19' && single.events[0].startTime === '12:00',
     `${single.events[0].date} ${single.events[0].startTime}`);
  ok('婚宴四題全開',
     single.events[0].askCount && single.events[0].askMeal
     && single.events[0].askChildSeat && single.events[0].askDiet);
  ok('要回覆的活動就是那一個', single.rsvpCount === 1);
  ok('主要活動是 main', single.primary === 'main', single.primary);
  ok('沒開旗標時 multiEventOn() 是 false', single.multiOn === false);

  /* 舊回覆（沒有 events）只答得出主要活動 */
  const legacy = await page.evaluate(() => {
    const r = { attending:true, guestCount:3, mealVeg:1 };
    const no = { attending:false, tentative:false };
    const maybe = { attending:false, tentative:true };
    return {
      main:  eventResponse(r, 'main'),
      other: eventResponse(r, 'ev_ceremony'),
      no:    eventResponse(no, 'main'),
      maybe: eventResponse(maybe, 'main'),
    };
  });
  ok('舊回覆答得出主要活動',
     legacy.main && legacy.main.going === true && legacy.main.count === 3
     && legacy.main.veg === 1 && legacy.main.legacy === true,
     JSON.stringify(legacy.main));
  ok('舊回覆對其他活動是「沒有回應」（null，不是不參加）',
     legacy.other === null);
  ok('說不來的舊回覆是 going:false 不是 null',
     legacy.no && legacy.no.going === false && legacy.no.tentative === false);
  ok('「視情況而定」帶著 tentative，之後會算進待回覆',
     legacy.maybe && legacy.maybe.going === false && legacy.maybe.tentative === true);
  await page.close();
}

{
  /* ---- 換成有 events 的站台 ----
     文訂不需要回覆，另外故意種三筆壞資料，驗證清洗有做事 */
  await adb.collection('sites').doc(siteIds[SLUG]).update({
    multiEventEnabled: true,
    events: [
      { id:'ev_engage', type:'engagement', name:'文訂', date:'2026-09-05',
        startTime:'11:00', venueName:'女方家', requiresRsvp:false },
      { id:'ev_ceremony', type:'ceremony', date:'2026-09-19', startTime:'14:00',
        venueName:'台北真理堂', address:'台北市大安區新生南路三段86號',
        mapUrl:'javascript:alert(1)' },
      { id:'ev_reception', type:'reception', name:'婚宴', date:'2026-09-19',
        startTime:'18:00', venueName:'台北國賓大飯店', askChildSeat:false },
      { id:'ev_party', type:'afterparty', name:'派對', date:'2026-09-19',
        startTime:'21:30', venueName:'某某 Bar',
        questions:[
          { id:'q_shuttle', kind:'choice', label:'需要接駁車嗎？',
            opts:[{ id:'yes', label:'需要' }, { id:'no', label:'不需要' }] },
          { id:'q_broken', kind:'choice', label:'沒有選項的單選題', opts:[] },
        ] },
      /* 前兩筆整筆會被丟掉（沒有 id、id 重複）；
         第三筆只有 date 格式不對 —— 一個欄位壞掉不該讓整個活動消失，
         那一欄清空就好，其餘照常顯示 */
      { type:'ceremony', name:'沒有 id' },
      { id:'ev_party', type:'afterparty', name:'重複的 id' },
      { id:'ev_bad_date', type:'custom', name:'日期格式錯', date:'2026/09/19' },
    ],
  });

  const { page } = await visit(`/w/${SLUG}/invitation`);
  const multi = await page.evaluate(() => ({
    multiOn: multiEventOn(),
    ids: weddingEvents().map((e) => e.id),
    rsvpIds: rsvpEvents().map((e) => e.id),
    primary: primaryEventId(),
    ceremony: findEvent('ev_ceremony'),
    reception: findEvent('ev_reception'),
    party: findEvent('ev_party'),
    badDate: findEvent('ev_bad_date'),
  }));

  ok('旗標打開時 multiEventOn() 是 true', multi.multiOn === true);
  ok('沒有 id 與重複 id 的整筆丟掉，其餘照順序留著',
     multi.ids.join(',') === 'ev_engage,ev_ceremony,ev_reception,ev_party,ev_bad_date',
     multi.ids.join(','));
  ok('文訂不需要回覆，不進 RSVP 清單',
     !multi.rsvpIds.includes('ev_engage'), multi.rsvpIds.join(','));
  ok('主要活動挑的是婚宴', multi.primary === 'ev_reception', multi.primary);
  ok('名稱留白時退回型別的預設名', multi.ceremony.name === '證婚', multi.ceremony.name);
  ok('英文 kicker 也一起帶好',
     multi.ceremony.nameEn === 'CEREMONY' && multi.party.nameEn === 'AFTER PARTY');
  ok('證婚預設不問餐點與兒童椅',
     multi.ceremony.askCount === true && multi.ceremony.askMeal === false
     && multi.ceremony.askChildSeat === false);
  ok('新人關掉的那一題確實是關的', multi.reception.askChildSeat === false);
  ok('婚宴其餘三題仍然是開的',
     multi.reception.askCount && multi.reception.askMeal && multi.reception.askDiet);
  ok('不是 http(s) 的地圖連結被丟掉', multi.ceremony.mapUrl === '', multi.ceremony.mapUrl);
  ok('日期格式不對就當作沒填', multi.badDate.date === '', multi.badDate.date);
  ok('沒有選項的單選題被丟掉',
     multi.party.questions.length === 1 && multi.party.questions[0].id === 'q_shuttle',
     multi.party.questions.map((q) => q.id).join(','));
  ok('選項是 map 的陣列（不是巢狀陣列）',
     multi.party.questions[0].opts[0].id === 'yes'
     && multi.party.questions[0].opts[0].label === '需要');

  /* ---- 各活動獨立 headcount ----
     DataStore.getEventStats() 是對 _rsvps 的純還原，
     這裡直接塞資料進去，不必登入後台也驗得到算法。 */
  const stats = await page.evaluate(() => {
    DataStore._rsvps = [
      /* 三個活動全參加 */
      { id:'r1', attending:true, guestCount:2, mealVeg:1,
        primaryEventId:'ev_reception', events:{
          ev_ceremony:  { going:true, count:2, veg:0 },
          ev_reception: { going:true, count:2, veg:1 },
          ev_party:     { going:true, count:2, veg:0 },
        } },
      /* 只參加婚宴 */
      { id:'r2', attending:true, guestCount:4, mealVeg:0,
        primaryEventId:'ev_reception', events:{
          ev_ceremony:  { going:false, count:0, veg:0 },
          ev_reception: { going:true,  count:4, veg:0 },
          ev_party:     { going:false, count:0, veg:0 },
        } },
      /* 婚宴 ＋ 派對 */
      { id:'r3', attending:true, guestCount:1, mealVeg:0,
        primaryEventId:'ev_reception', events:{
          ev_ceremony:  { going:false, count:0, veg:0 },
          ev_reception: { going:true,  count:1, veg:0 },
          ev_party:     { going:true,  count:3, veg:0 },
        } },
      /* 舊回覆：只答得出婚宴，證婚與派對算「待回覆」 */
      { id:'r4', attending:true, guestCount:5, mealVeg:2 },
      /* 舊回覆：明確說不來 */
      { id:'r5', attending:false, tentative:false },
      /* 舊回覆：視情況而定 → 算待回覆，不是不出席 */
      { id:'r6', attending:false, tentative:true },
    ];
    return {
      ceremony:  DataStore.getEventStats('ev_ceremony'),
      reception: DataStore.getEventStats('ev_reception'),
      party:     DataStore.getEventStats('ev_party'),
      table:     DataStore.getEventStatsTable().map((row) => row.event.id),
    };
  });

  const fmt = (s) => `是 ${s.yes} / 待 ${s.pending} / 否 ${s.no} / ${s.heads} 位`;
  ok('證婚：1 人回是、2 人回否、3 筆待回覆',
     stats.ceremony.yes === 1 && stats.ceremony.no === 2 && stats.ceremony.pending === 3
     && stats.ceremony.heads === 2, fmt(stats.ceremony));
  ok('婚宴：四筆會來、共 12 位（舊回覆也算得進來）',
     stats.reception.yes === 4 && stats.reception.heads === 12
     && stats.reception.veg === 3, fmt(stats.reception));
  ok('婚宴：說不來 1 筆、視情況而定算待回覆',
     stats.reception.no === 1 && stats.reception.pending === 1, fmt(stats.reception));
  ok('派對：headcount 和婚宴不一樣（這就是多活動的重點）',
     stats.party.yes === 2 && stats.party.heads === 5, fmt(stats.party));
  ok('三個桶子加起來等於總回覆筆數',
     [stats.ceremony, stats.reception, stats.party].every(
       (s) => s.yes + s.no + s.pending === s.total && s.total === 6));
  ok('統計表只列需要回覆的活動（文訂不在裡面）',
     !stats.table.includes('ev_engage')
     && stats.table.join(',') === multi.rsvpIds.join(','), stats.table.join(','));

  await page.close();

  /* 還原：events 清空之後又回到合成的單一活動，畫面也回到原樣 */
  await adb.collection('sites').doc(siteIds[SLUG])
    .update({ multiEventEnabled: false, events: [] });
  const back = await visit(`/w/${SLUG}/invitation`);
  const restored = await back.page.evaluate(() => ({
    ids: weddingEvents().map((e) => e.id),
    hasForm: !!document.getElementById('rsvpForm'),
    hasAttendRow: !!document.getElementById('attendRow'),
  }));
  ok('清空 events 之後回到合成的單一活動', restored.ids.join(',') === 'main',
     restored.ids.join(','));
  ok('邀請函仍然是原本那份表單（Phase 2 沒有動畫面）',
     restored.hasForm && restored.hasAttendRow);
  ok('沒有 console 錯誤', back.errors.length === 0, back.errors.join(' | '));
  await back.page.close();
}

/* ---------- 賓客端的多活動 RSVP ---------- */
console.log('\n[6d] 多活動的出席回覆');

const MULTI_EVENTS = [
  { id:'ev_engage', type:'engagement', name:'文訂', nameEn:'ENGAGEMENT',
    date:'2026-09-05', startTime:'11:00', endTime:'', venueName:'女方家',
    address:'', mapUrl:'', desc:'', requiresRsvp:false,
    askCount:false, askMeal:false, askChildSeat:false, askDiet:false, questions:[] },
  { id:'ev_ceremony', type:'ceremony', name:'證婚', nameEn:'CEREMONY',
    date:'2026-09-19', startTime:'14:00', endTime:'', venueName:'台北真理堂',
    address:'台北市大安區新生南路三段86號', mapUrl:'', desc:'', requiresRsvp:true,
    askCount:true, askMeal:false, askChildSeat:false, askDiet:false, questions:[] },
  { id:'ev_reception', type:'reception', name:'婚宴', nameEn:'WEDDING RECEPTION',
    date:'2026-09-19', startTime:'18:00', endTime:'21:00',
    venueName:'台北國賓大飯店', address:'台北市中山區中山北路二段63號',
    mapUrl:'', desc:'', requiresRsvp:true,
    askCount:true, askMeal:true, askChildSeat:true, askDiet:true, questions:[] },
  { id:'ev_party', type:'afterparty', name:'派對', nameEn:'AFTER PARTY',
    date:'2026-09-19', startTime:'21:30', endTime:'', venueName:'某某 Bar',
    address:'台北市信義區', mapUrl:'', desc:'', requiresRsvp:true,
    askCount:true, askMeal:false, askChildSeat:false, askDiet:false,
    questions:[{ id:'q_shuttle', kind:'choice', label:'需要接駁車嗎？',
                 opts:[{ id:'yes', label:'需要' }, { id:'no', label:'不需要' }] }] },
];

{
  await adb.collection('sites').doc(siteIds[SLUG]).update({
    multiEventEnabled: true, events: MULTI_EVENTS,
    rsvpAskCard: true, rsvpAskGift: true, rsvpAskMessage: true,
    rsvpContactMethods: ['phone', 'line', 'email'],
  });

  const { page, errors } = await visit(`/w/${SLUG}/invitation`);
  await page.evaluate(() => LS.remove('rsvp.mine'));
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => !!document.getElementById('rsvpForm'),
    null, { timeout:20000 });

  /* 只有需要回覆的三場長成卡片；文訂不在表單裡 */
  ok('三張活動卡（文訂不在表單裡）',
    (await page.locator('.ev-card').count()) === 3,
    String(await page.locator('.ev-card').count()));
  ok('「能來參加嗎」那一整題不見了（改成每張卡自己問）',
    (await page.locator('#attendRow').count()) === 0);
  ok('人數／葷素也不在共用區了',
    (await page.locator('#detailBox').count()) === 0);
  ok('英文 kicker 有出現',
    (await page.locator('.ev-card .ev-kicker').allInnerTexts())
      .join(',') === 'CEREMONY,WEDDING RECEPTION,AFTER PARTY',
    (await page.locator('.ev-card .ev-kicker').allInnerTexts()).join(','));
  ok('每張卡各有自己的地圖連結',
    (await page.locator('.ev-card .ev-map').count()) === 3);
  ok('婚宴那張看得到時間區間',
    (await page.locator('.ev-card').nth(1).locator('.ev-when').innerText())
      .includes('18:00–21:00'),
    await page.locator('.ev-card').nth(1).locator('.ev-when').innerText());

  /* 三場（≥HINT_FROM 是 4）→ 不出現進度與「全部參加」 */
  ok('三場時不出現進度提示與「全部參加」',
    (await page.locator('#evProgress').count()) === 0
      && (await page.locator('#evAllYes').count()) === 0);

  /* 沒回答就送出：捲到第一張沒答的卡，而不是列一長串錯誤 */
  /* 名字刻意和別的測試不一樣：這個站台是共用的，
     叫「王小明」的話會混進 [16] 標籤那一段的固定資料裡 */
  await page.fill('#rName', '林多場');
  await page.click('#submitBtn');
  await page.waitForTimeout(400);
  ok('沒回答就送出時，指出第一張沒答的卡',
    (await page.locator('.ev-card').first().locator('[data-ev-err]').innerText())
      .includes('還沒回答'),
    await page.locator('.ev-card').first().locator('[data-ev-err]').innerText());

  /* 賓客 C：證婚不參加、婚宴 4 位（素 1、兒童椅 1）、派對 2 位＋接駁 */
  const card = (i) => page.locator('.ev-card').nth(i);
  await card(0).locator('[data-ev-go="no"]').click();
  await page.waitForTimeout(200);
  ok('說不來的卡片會淡下去、細節收起來',
    await card(0).evaluate((el) => el.classList.contains('is-no')));

  await card(1).locator('[data-ev-go="yes"]').click();
  await page.waitForTimeout(200);
  ok('說會來才展開細節',
    await card(1).locator('.ev-detail').isVisible());
  for(let i = 0; i < 3; i++){
    await card(1).locator('[id$="_headPlus"]').click();
    await page.waitForTimeout(80);
  }
  await card(1).locator('[id$="_vegPlus"]').click();
  await page.waitForTimeout(100);
  await card(1).locator('[id$="_childOn"]').check();
  await page.waitForTimeout(150);
  await card(1).locator('[id$="_dietBox"]').count();
  await card(1).locator('input[id$="_diet"]').fill('不吃牛');
  ok('葷素加起來等於人數',
    (await card(1).locator('[id$="_mealHint"]').innerText()).includes('共 4 位'),
    await card(1).locator('[id$="_mealHint"]').innerText());

  await card(2).locator('[data-ev-go="yes"]').click();
  await page.waitForTimeout(200);
  await card(2).locator('[id$="_headPlus"]').click();
  await page.waitForTimeout(100);
  await card(2).locator('.choice-row[data-ev-q] .choice').first().click();
  await page.waitForTimeout(100);
  ok('活動自己的追加題目選得起來',
    await card(2).locator('.choice-row[data-ev-q] .choice').first()
      .evaluate((el) => el.classList.contains('on')));

  /* 三場都答完 → 除了剛剛回答的那一張，其餘收成一行（手風琴）。
     剛答完的那張一定要留著開 —— 說「會參加」之後還要填人數 */
  ok('答完的卡片收成一行，剛回答的那張留著開',
    (await page.locator('.ev-card.is-folded').count()) === 2
      && !(await card(2).evaluate((el) => el.classList.contains('is-folded'))),
    String(await page.locator('.ev-card.is-folded').count()));
  ok('收起來那一行寫著答案',
    (await card(1).locator('[data-ev-ans]').innerText()) === '會參加・4 位',
    await card(1).locator('[data-ev-ans]').innerText());
  await card(1).locator('[data-ev-unfold]').click();
  await page.waitForTimeout(200);
  ok('點一下又打得開',
    !(await card(1).evaluate((el) => el.classList.contains('is-folded'))));

  /* 共用的那幾題照舊 */
  await page.click('#relationRow .choice[data-val="groom"]');
  await page.fill('#rPhone', '0912345678');
  await page.click('#cardRow .choice[data-val="none"]');
  await page.click('#giftRow .choice[data-val="pickup"]');
  await page.click('#submitBtn');
  await page.waitForTimeout(2000);

  const snap = await adb.collection('sites').doc(siteIds[SLUG])
    .collection('rsvps').orderBy('createdAt', 'desc').limit(1).get();
  const d = snap.docs[0].data();

  ok('primaryEventId 指向婚宴', d.primaryEventId === 'ev_reception', d.primaryEventId);
  ok('events 只有需要回覆的三場',
    Object.keys(d.events).sort().join(',') === 'ev_ceremony,ev_party,ev_reception',
    Object.keys(d.events).sort().join(','));
  ok('證婚存成不參加',
    d.events.ev_ceremony.going === false && d.events.ev_ceremony.count === 0);
  ok('婚宴存成 4 位、素 1',
    d.events.ev_reception.going === true && d.events.ev_reception.count === 4
      && d.events.ev_reception.veg === 1,
    JSON.stringify(d.events.ev_reception));
  ok('婚宴的飲食補充存在那一場裡',
    d.events.ev_reception.note === '不吃牛', d.events.ev_reception.note);
  ok('派對存成 2 位、接駁選了「需要」',
    d.events.ev_party.going === true && d.events.ev_party.count === 2
      && d.events.ev_party.answers.q_shuttle === 'yes',
    JSON.stringify(d.events.ev_party));

  /* ★ 鏡像：頂層欄位講的是主要活動 —— 這是相容性的地基 */
  ok('頂層 attending／人數／葷素是婚宴的鏡像',
    d.attending === true && d.guestCount === 4 && d.mealMeat === 3 && d.mealVeg === 1,
    JSON.stringify({ a:d.attending, n:d.guestCount, m:d.mealMeat, v:d.mealVeg }));
  ok('頂層兒童椅也是婚宴那一場的', d.childSeat === 1, String(d.childSeat));
  ok('頂層飲食補充也是婚宴那一場的', d.dietaryNote === '不吃牛', d.dietaryNote);
  ok('共用的那幾題照舊存進去',
    d.name === '林多場' && d.relation === 'groom'
      && d.contactPhone === '0912345678' && d.cardType === 'none',
    JSON.stringify({ n:d.name, r:d.relation, p:d.contactPhone, c:d.cardType }));

  /* 感謝畫面逐條列出 */
  ok('感謝畫面列出每一場的答案',
    (await page.locator('#tkEvents .tk-ev').count()) === 3,
    String(await page.locator('#tkEvents .tk-ev').count()));
  ok('感謝畫面上婚宴寫著 4 位',
    (await page.locator('#tkEvents .tk-ev').nth(1).innerText()).includes('4 位'),
    (await page.locator('#tkEvents .tk-ev').nth(1).innerText()).replace(/\n/g, ' '));

  /* 回訪：整份帶回畫面 */
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => !!document.getElementById('thanksCard'),
    null, { timeout:20000 });
  await page.click('#editBtn');
  await page.waitForTimeout(400);
  ok('回訪時每一場的答案都帶回來',
    (await page.locator('.ev-card.is-done').count()) === 3,
    String(await page.locator('.ev-card.is-done').count()));
  ok('回訪時人數也帶回來',
    (await page.locator('.ev-card').nth(1).locator('[data-ev-ans]').innerText())
      === '會參加・4 位',
    await page.locator('.ev-card').nth(1).locator('[data-ev-ans]').innerText());

  ok('多活動表單無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}

{
  /* ---- 邀請函的資訊列 ＋ 大廳 ---- */
  const { page } = await visit(`/w/${SLUG}/invitation`);
  const inv = await page.evaluate(() => ({
    rows: [...document.querySelectorAll('.inv-ev .ir-label')].map((e) => e.textContent),
    hasVenueRow: !!document.getElementById('venueRow'),
    maps: document.querySelectorAll('.inv-ev .ir-jump').length,
  }));
  ok('邀請函資訊列變成四列活動（含文訂）',
    inv.rows.join(',') === '文訂,證婚,婚宴,派對', inv.rows.join(','));
  ok('原本那一列「地點」不見了', !inv.hasVenueRow);
  /* 地址留白時沿用既有規則：拿場地名去搜 Google Maps
     （見 invitation.js 原本的 renderVenue），所以「女方家」那一場也有一顆 */
  ok('每個有地點的活動各有一個地圖連結', inv.maps === 4, String(inv.maps));
  await page.close();

  const lob = await visit(`/w/${SLUG}/`);
  await lob.page.evaluate(() => {
    const g = document.getElementById('gate');
    if(g) g.remove();
  });
  const lobby = await lob.page.evaluate(() => ({
    rows: [...document.querySelectorAll('.info-ev .ir-label')].map((e) => e.textContent),
    hasTimeRow: !!document.getElementById('infoTimeRow'),
    hasVenueRow: !!document.getElementById('infoVenueRow'),
    hasMapBtn: !!document.getElementById('mapBtn'),
    cdTarget: document.getElementById('cdTarget')?.textContent || '',
    dateRowHidden: document.getElementById('infoDate')?.closest('.info-row')?.hidden,
  }));
  ok('大廳資訊卡也列出四個活動',
    lobby.rows.join(',') === '文訂,證婚,婚宴,派對', lobby.rows.join(','));
  ok('原本的「時間」「地點」兩列不見了',
    !lobby.hasTimeRow && !lobby.hasVenueRow);
  ok('全域那顆「開啟地圖」拿掉了（每個活動各有一顆）', !lobby.hasMapBtn);
  ok('跨日活動時最上面那列日期收起來', lobby.dateRowHidden === true);
  ok('倒數寫明是哪一場', lobby.cdTarget.startsWith('婚宴・'), lobby.cdTarget);
  await lob.page.close();
}

{
  /* ---- 後台：各活動統計、名單欄位、CSV ---- */
  const { page, errors } = await visit(`/w/${SLUG}/admin`);
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });
  await page.waitForTimeout(1200);

  ok('總覽長出「各活動出席統計」', await page.isVisible('#adEvStats'));
  const stats = await page.evaluate(() =>
    [...document.querySelectorAll('#adEvStats tbody tr')].map((tr) =>
      [...tr.children].map((td) => td.textContent.trim().replace(/\s+/g, ' '))));
  ok('統計表三列（文訂不需要回覆，不在裡面）', stats.length === 3,
    String(stats.length));
  /* 這個站台在前面的測試已經累積了幾筆舊回覆（沒有 events），
     所以比的是「各場算出來不一樣」這件事，不是某個絕對值 */
  const num = (r, i) => Number(String(r[i]).replace(/[^0-9]/g, '')) || 0;
  ok('婚宴那一列把剛才那 4 位算進去了',
    stats[1][0].startsWith('婚宴') && num(stats[1], 4) >= 4, stats[1].join(' | '));
  ok('證婚是「不出席」，婚宴是「已確認」—— 各場獨立計算',
    num(stats[0], 3) >= 1 && num(stats[0], 1) === 0 && num(stats[1], 1) >= 1,
    `${stats[0].join(' | ')}　／　${stats[1].join(' | ')}`);
  ok('舊回覆落在「待回覆」而不是「不出席」',
    num(stats[0], 2) >= 1, stats[0].join(' | '));
  ok('三個桶子加起來每一場都一樣（＝總回覆筆數）',
    new Set(stats.map((r) => num(r, 1) + num(r, 2) + num(r, 3))).size === 1,
    stats.map((r) => num(r, 1) + num(r, 2) + num(r, 3)).join(','));

  await page.click('.ad-subtabs[data-subtabs="rsvp"] .ad-subtab[data-subtab="replies"]');
  await page.waitForTimeout(400);
  const heads = await page.locator('#adRsvpList thead th').allInnerTexts();
  ok('名單多出每個活動一欄',
    heads.includes('證婚') && heads.includes('婚宴') && heads.includes('派對'),
    heads.join(','));
  const row = await page.locator('#adRsvpList tbody tr').first().allInnerTexts();
  ok('那幾欄的值是 ✓／✗',
    row.join('|').includes('✗') && row.join('|').includes('✓ 4'),
    row.join('|').slice(0, 90));

  ok('後台多活動無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}

{
  /* ---- 只剩一個活動時，賓客那一頁要回到原本的表單 ---- */
  await adb.collection('sites').doc(siteIds[SLUG]).update({
    multiEventEnabled: false, events: [],
  });
  const { page } = await visit(`/w/${SLUG}/invitation`);
  await page.evaluate(() => LS.remove('rsvp.mine'));
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => !!document.getElementById('rsvpForm'),
    null, { timeout:20000 });
  ok('回到原本那份表單：沒有活動卡',
    (await page.locator('.ev-card').count()) === 0);
  ok('「能來參加嗎」回來了', (await page.locator('#attendRow').count()) === 1);
  ok('人數／葷素回到共用區', (await page.locator('#detailBox').count()) === 1);
  ok('資訊列也回到原本的「地點」那一列',
    (await page.locator('#venueRow').count()) === 1
      && (await page.locator('.inv-ev').count()) === 0);
  await page.close();
}

/* ---------- 不存在的 slug ---------- */
console.log('\n[7] 不存在的 slug');
{
  const page = await newPage();
  await page.goto(`${BASE}/w/no-such-site/`, { waitUntil:'domcontentloaded' });
  await page.waitForSelector('[data-fatal]', { timeout: 20000 }).catch(() => {});
  ok('顯示中文找不到畫面', (await page.innerText('body')).includes('找不到這張邀請函'));
  await page.close();
}

/* ---------- 素材自動抓取 ---------- */
console.log('\n[9] 素材資料夾自動載入');
{
  const { page } = await visit(`/w/${ASSET_SLUG}/`);
  const assets = await page.evaluate(() => window.SITE.assets);
  ok('manifest 有載入', !!assets && !!assets.cover, JSON.stringify(assets || {}).slice(0, 60));
  ok('照片牆 3 張', assets.gallery && assets.gallery.length === 3,
    String(assets.gallery && assets.gallery.length));
  ok('背景音樂讀到客戶的音檔',
    assets.bgm === '/assets/demo-wedding-2027/bgm.mp3', assets.bgm || '(無)');
  ok('大廳背景換成客戶的圖',
    await page.evaluate(() => {
      const bg = document.querySelector('img.bg');
      return !!bg && bg.getAttribute('src').includes('/assets/');
    }));
  await page.close();
}
{
  const { page } = await visit(`/w/${ASSET_SLUG}/cake`);
  const cakes = await page.evaluate(() => CAKES.map((c) => c.name));
  ok('甜點桌用客戶的甜點', cakes.join('、') === '草莓千層、抹茶生乳捲', cakes.join('、'));
  await page.close();
}
{
  const { page } = await visit(`/w/${ASSET_SLUG}/draw`);
  const cards = await page.evaluate(() => CARDS.map((c) => `${c.name}(${c.rarity})`));
  ok('囍卡用客戶的卡片',
    cards.join('、') === '戀愛中的新娘(SSR)、認真工作的新郎(N)', cards.join('、'));
  ok('有卡片時抽卡按鈕是打開的', !(await page.isDisabled('#drawBtn')));
  await page.close();
}
{
  const { page } = await visit(`/w/${ASSET_SLUG}/exhibition`);
  const items = await page.evaluate(() => ITEMS.map((i) => `${i.year}:${i.title}`));
  ok('戀愛時光用客戶的展品',
    items.join('、') === '2019:第一次見面、2023:求婚那天', items.join('、'));
  await page.close();
}
{
  /* 沒有素材、後台也還沒設定時，看到的是內建的新人故事範例
     （這一段要跑在 [12] 後台寫入展品之前，否則會被新人自己的內容蓋掉） */
  const { page } = await visit(`/w/${SLUG}/exhibition`);
  const nodes = await page.evaluate(() => ({
    photos: Array.from(document.querySelectorAll('.tl-node .tl-cap')).map((e) => e.textContent),
    acts:   Array.from(document.querySelectorAll('.tl-act-div .ac-label')).map((e) => e.textContent),
  }));
  ok('內建範例是新人的故事', nodes.photos[0] === '我們結婚了', nodes.photos.slice(0, 2).join('、'));
  ok('內建範例分成四幕',
    nodes.acts.join('、') === '第一幕、第二幕、第三幕、第四幕', nodes.acts.join('、'));
  ok('內建範例最後留一張合影卡',
    nodes.photos[nodes.photos.length - 1] === '下一張，等你一起入鏡！',
    nodes.photos[nodes.photos.length - 1]);
  await page.close();
}
{
  /* 素材與後台都沒有卡片時，抽卡按鈕要停用，並且說清楚在等什麼。
     minimal-site-2027 沒有素材資料夾、後台也沒上傳過卡，
     只有抽卡頁本來是關著的 —— 借開一下，量完再關回去。 */
  await adb.collection('sites').doc(siteIds['minimal-site-2027'])
    .update({ pages: Object.fromEntries(ALL_PAGES.map((k) => [k, k === 'rsvp' || k === 'draw'])) });

  const { page } = await visit('/w/minimal-site-2027/draw');
  await page.waitForFunction(
    () => document.getElementById('drawEmpty') && !document.getElementById('drawEmpty').hidden,
    null, { timeout:10000 }).catch(() => {});
  ok('沒有卡片時卡池是空的', (await page.evaluate(() => CARDS.length)) === 0);
  ok('沒有卡片時抽卡按鈕停用', await page.isDisabled('#drawBtn'));
  ok('沒有卡片時寫著在等新人上傳',
    (await page.textContent('#drawEmpty')).trim() === '等待新人上傳照片',
    await page.textContent('#drawEmpty'));
  await page.close();

  /* 還原，後面的測試還要用這組站台 */
  await adb.collection('sites').doc(siteIds['minimal-site-2027'])
    .update({ pages: Object.fromEntries(ALL_PAGES.map((k) => [k, k === 'rsvp'])) });
}
{
  /* 沒放素材的站台要沿用預設，不能整個空掉 */
  const { page } = await visit('/w/minimal-site-2027/');
  const assets = await page.evaluate(() => window.SITE.assets);
  ok('沒有素材資料夾時 assets 為空物件',
    assets && Object.keys(assets).length === 0, JSON.stringify(assets));
  await page.close();
}

/* ---------- 背景音樂 ---------- */
console.log('\n[9b] 背景音樂');
{
  const { page } = await visit(`/w/${ASSET_SLUG}/`);
  const src = await page.evaluate(() => bgmSrc());
  ok('bgmSrc() 指向客戶的音檔', src === `/assets/${ASSET_SLUG}/bgm.mp3`, src || '(無)');
  await page.close();
}
{
  /* 沒放音檔的站台要退回內建的預設背景音樂，不能整個沒聲音。
     有素材資料夾的站台會用自己的 bgm.mp3，所以這裡要用沒有素材資料夾的站台來驗。 */
  const { page } = await visit('/w/minimal-site-2027/');
  const src = await page.evaluate(() => bgmSrc());
  ok('沒有音檔時用內建的預設背景音樂', src === '/audio/bgm.mp3', src || '(空)');
  ok('預設音檔真的拿得到',
    (await page.request.get(`${BASE}/audio/bgm.mp3`)).ok());
  ok('音檔載不起來時的合成音樂函式還在',
    await page.evaluate(() => typeof startSynthBGM === 'function'));
  await page.close();
}

/* ---------- 悄悄話信箱：賓客寫得進去、只有新人在後台讀得到 ---------- */
console.log('\n[10] 信箱權限');
{
  /* 賓客寫得進去 */
  const { page } = await visit(`/w/${SLUG}/wall`);
  await page.evaluate(() =>
    DataStore.addLetter({ name:'測試賓客', icon:'\u2726', text:'偷偷跟你們說…' }));
  await page.waitForTimeout(1500);
  const snap = await adb.collection('sites').doc(siteIds[SLUG]).collection('letters').get();
  ok('賓客寫得進信箱', snap.size === 1, `${snap.size} 筆`);
  await page.close();
}
{
  /* 但賓客讀不到：直接用未登入的前端 SDK 嘗試讀取應該被規則擋下 */
  const { page } = await visit(`/w/${SLUG}/wall`);
  const denied = await page.evaluate(async () => {
    const { getDocs, collection, db } = window.fb;
    try{
      await getDocs(collection(db, 'sites', window.SITE.siteId, 'letters'));
      return false;      // 讀到了 → 規則沒擋住
    }catch(e){
      return e.code === 'permission-denied';
    }
  });
  ok('賓客讀不到信件內容（規則擋下）', denied);
  ok('信件內容沒有出現在祝福牆上',
    !(await page.innerText('body')).includes('偷偷跟你們說'));
  await page.close();
}
{
  /* 悄悄話信箱已經併進後台，舊的 /inbox 網址直接帶過去 */
  const page = await newPage();
  await page.goto(`${BASE}/w/${SLUG}/inbox`, { waitUntil:'domcontentloaded' });
  await page.waitForURL(`**/w/${SLUG}/admin`, { timeout: 20000 }).catch(() => {});
  ok('舊的 /inbox 網址導到新人後台', page.url().endsWith(`/w/${SLUG}/admin`), page.url());
  ok('後台一樣停在登入畫面', await page.isVisible('#pwGate'));
  ok('沒登入看不到信件內容',
    !(await page.innerText('body')).includes('偷偷跟你們說'));
  await page.close();
}
{
  /* 新人登入後台，「悄悄話」分頁就讀得到 */
  const { page, errors } = await visit(`/w/${SLUG}/admin`);
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });

  await page.click('.ad-tab[data-tab="inbox"]');
  await page.waitForFunction(() => DataStore.getLetters().length === 1, null, { timeout:15000 });

  const listText = await page.innerText('#adInboxList');
  ok('後台讀得到信件內容', listText.includes('偷偷跟你們說'),
    listText.replace(/\n/g, ' ').slice(0, 60));
  ok('信件上有賓客的名字', listText.includes('測試賓客'));
  ok('封數顯示正確', (await page.textContent('#adInboxCount')) === '目前 1 封',
    await page.textContent('#adInboxCount'));

  await page.fill('#adInboxFilter', '不存在的關鍵字');
  await page.waitForTimeout(200);
  ok('搜尋沒結果時顯示空狀態',
    (await page.innerText('#adInboxList')).includes('沒有符合的悄悄話'));
  await page.fill('#adInboxFilter', '偷偷');
  await page.waitForTimeout(200);
  ok('搜尋找得到內容關鍵字',
    (await page.innerText('#adInboxList')).includes('偷偷跟你們說'));

  ok('悄悄話分頁無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}
{
  /* 不在 ownerEmails 名單內的帳號，登入了也讀不到信 */
  const { page } = await visit(`/w/${SLUG}/admin`);
  await signInAsOwner(page, 'nosy@example.com');
  await page.waitForTimeout(1200);
  const denied = await page.evaluate(async () => {
    const { getDocs, collection, db } = window.fb;
    try{
      await getDocs(collection(db, 'sites', window.SITE.siteId, 'letters'));
      return false;
    }catch(e){ return e.code === 'permission-denied'; }
  });
  ok('外人讀不到悄悄話（規則擋下）', denied);
  await page.close();
}
{
  /* 公開的信件數量仍看得到，祝福牆才不會永遠顯示 0 */
  const { page } = await visit(`/w/${SLUG}/wall`);
  await page.waitForFunction(
    () => Number(document.getElementById('letterCount').textContent) > 0,
    null, { timeout: 10000 }).catch(() => {});
  const count = await page.textContent('#letterCount');
  ok('祝福牆看得到信件數量（但看不到內容）', count === '1', count);
  await page.close();
}

/* ---------- 桌次查詢 ---------- */
console.log('\n[11] 桌次查詢');
{
  const { page, errors } = await visit(`/w/${SLUG}/seating`);
  await page.waitForFunction(() => DataStore.getSeating().length > 0, null, { timeout:10000 });

  await page.fill('#stInput', '王小明');
  await page.click('#stBtn');
  const text = await page.innerText('#stResult');
  ok('查得到自己的桌次', text.includes('第 3 桌'), text.replace(/\n/g, ' ').slice(0, 60));
  ok('顯示備註', text.includes('素食'), text.replace(/\n/g, ' ').slice(0, 60));
  ok('列出同桌的人', text.includes('林美美'), text.replace(/\n/g, ' ').slice(0, 60));

  /* 只打名字（沒有姓）也要找得到 */
  await page.fill('#stInput', '小明');
  await page.click('#stBtn');
  ok('只輸入名字也找得到',
    (await page.innerText('#stResult')).includes('第 3 桌'));

  /* 查無資料要給友善說明，不是空白 */
  await page.fill('#stInput', '不存在的人');
  await page.click('#stBtn');
  const miss = await page.innerText('#stResult');
  ok('查無資料有友善提示', miss.includes('找不到'), miss.replace(/\n/g, ' ').slice(0, 40));

  ok('桌次頁無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}

/* ---------- 桌次 × 祝福信的串接 ---------- */
console.log('\n[11b] 查桌次時一併提示有信');
{
  const { page } = await visit(`/w/${SLUG}/seating`);
  await page.waitForFunction(
    () => DataStore.getSeating().length > 0 && DataStore.getBlessings().length > 0,
    null, { timeout:10000 });

  /* 有專屬信的賓客 */
  await page.fill('#stInput', '王小明');
  await page.click('#stBtn');
  await page.waitForSelector('.st-letter', { timeout:5000 });
  const personal = await page.evaluate(() => {
    const a = document.querySelector('.st-letter');
    return { text: a.innerText, href: a.getAttribute('href') };
  });
  ok('有專屬信時提示「寫給你」',
    personal.text.includes('新人寫了一封信給你'), personal.text.replace(/\n/g, ' '));
  ok('連結帶上名字，點過去直接開信',
    personal.href === `/w/${SLUG}/letter?name=${encodeURIComponent('王小明')}`, personal.href);

  /* 沒有專屬信、但新人設了通用信的賓客 */
  await page.fill('#stInput', '陳大同');
  await page.click('#stBtn');
  await page.waitForSelector('.st-letter', { timeout:5000 });
  ok('沒有專屬信時提示通用信',
    (await page.innerText('.st-letter')).includes('新人寫了一封信給大家'),
    (await page.innerText('.st-letter')).replace(/\n/g, ' '));
  await page.close();
}
{
  /* 從桌次頁點過來，信件頁要自己打開，不用再打一次名字 */
  const { page } = await visit(`/w/${SLUG}/letter?name=${encodeURIComponent('王小明')}`);
  await page.waitForSelector('#wlSheet:not([hidden])', { timeout:10000 });
  ok('帶 ?name= 進來會自動開信',
    (await page.innerText('#wlSheet')).includes('謝謝你今天特地趕來'));
  ok('輸入框已經填好名字',
    (await page.inputValue('#wlInput')) === '王小明',
    await page.inputValue('#wlInput'));
  await page.close();
}
{
  /* 沒開 letter 頁的站台不該出現這個入口，也不該去讀 blessings */
  await adb.collection('sites').doc(siteIds[SLUG]).update({
    pages: { ...allOnPlusAdmin, letter: false },
  });
  const { page } = await visit(`/w/${SLUG}/seating`);
  await page.waitForFunction(() => DataStore.getSeating().length > 0, null, { timeout:10000 });
  await page.fill('#stInput', '王小明');
  await page.click('#stBtn');
  await page.waitForTimeout(800);
  ok('關掉信件頁時不顯示信件入口',
    (await page.locator('.st-letter').count()) === 0);
  await page.close();
  await adb.collection('sites').doc(siteIds[SLUG]).update({ pages: allOnPlusAdmin });
}
{
  /* 賓客不能竄改桌次名單 */
  const { page } = await visit(`/w/${SLUG}/seating`);
  const denied = await page.evaluate(async () => {
    const { addDoc, collection, db } = window.fb;
    try{
      await addDoc(collection(db, 'sites', window.SITE.siteId, 'seating'),
        { name:'冒充者', table:'主桌', note:'', time: Date.now() });
      return false;
    }catch(e){ return e.code === 'permission-denied'; }
  });
  ok('賓客改不了桌次名單（規則擋下）', denied);
  await page.close();
}

/* ---------- 電子祝福信 ---------- */
console.log('\n[12] 電子祝福信');
{
  const { page, errors } = await visit(`/w/${SLUG}/letter`);
  await page.waitForFunction(() => DataStore.getBlessings().length > 0, null, { timeout:10000 });

  await page.fill('#wlInput', '小明');
  await page.click('#wlBtn');
  await page.waitForSelector('#wlSheet:not([hidden])', { timeout:10000 });
  const sheet = await page.innerText('#wlSheet');
  ok('對到專屬詞彙就拿到那封信',
    sheet.includes('謝謝你今天特地趕來'), sheet.replace(/\n/g, ' ').slice(0, 60));
  ok('信上有署名', sheet.includes('Ginny & One'), sheet.replace(/\n/g, ' ').slice(0, 80));
  ok('開信後信封是掀開狀態',
    await page.evaluate(() => document.getElementById('wlEnvelope').classList.contains('is-open')));

  /* 沒對到任何詞彙 → 領到通用信 */
  await page.click('#wlAgain');
  await page.fill('#wlInput', '路過的朋友');
  await page.click('#wlBtn');
  await page.waitForSelector('#wlSheet:not([hidden])', { timeout:10000 });
  ok('沒對到詞彙就給通用信',
    (await page.innerText('#wlSheet')).includes('這一天因為你更完整'));

  /* 儲存下載：把信畫成 JPG */
  const letterDl = await Promise.all([
    page.waitForEvent('download', { timeout:15000 }),
    page.click('#wlSave'),
  ]).then(([d]) => d).catch(() => null);
  ok('感謝信存得下來，而且是 JPG',
    !!letterDl && /^letter-.*\.jpg$/.test(letterDl.suggestedFilename()),
    letterDl ? letterDl.suggestedFilename() : '(沒有下載)');

  ok('祝福信頁無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}
{
  /* 好幾封通用信：同一個名字每次拿到的都是同一封，不同名字會分散開 */
  const site = adb.collection('sites').doc(siteIds[SLUG]);
  await site.collection('blessings').doc('b3').set({
    terms:[], title:'給遠道而來的朋友',
    body:'謝謝你跑這麼遠，這一路辛苦了。',
    sign:'Ginny & One', isDefault:true, time: Date.now(),
  });

  const { page } = await visit(`/w/${SLUG}/letter`);
  await page.waitForFunction(() => DataStore.getBlessings().length >= 3, null, { timeout:10000 });

  const pick = (name) => page.evaluate((n) =>
    findBlessing(n, DataStore.getBlessings()).item.id, name);

  const first = await pick('路過的朋友');
  ok('好幾封通用信時仍然領得到一封', first === 'b2' || first === 'b3', String(first));
  ok('同一個名字每次拿到同一封', (await pick('路過的朋友')) === first);

  const spread = new Set();
  for(const n of ['阿一','阿二','阿三','阿四','阿五','阿六','阿七','阿八']){
    spread.add(await pick(n));
  }
  ok('不同名字會分到不同的通用信', spread.size === 2, [...spread].join(','));

  ok('有專屬詞彙的信仍然優先',
    (await pick('小明')) === 'b1', String(await pick('小明')));

  await page.close();
  await site.collection('blessings').doc('b3').delete();
}

/* ---------- Explore 自訂卡片 ---------- */
console.log('\n[13] Explore 自訂卡片');
{
  const { page, errors } = await visit(`/w/${SLUG}/`);
  await page.waitForSelector('.link-card.is-custom', { timeout:10000 });

  const custom = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.link-card.is-custom')).map((el) => ({
      tag: el.tagName,
      title: el.querySelector('.lc-title').textContent,
      href: el.getAttribute('href') || '',
      target: el.getAttribute('target') || '',
    })));

  ok('兩張自訂卡片都出現', custom.length === 2, String(custom.length));
  ok('連結型是 <a> 且另開分頁',
    custom.some((c) => c.tag === 'A' && c.href === 'https://example.com/live' && c.target === '_blank'),
    JSON.stringify(custom));
  ok('彈窗型是 <button>',
    custom.some((c) => c.tag === 'BUTTON' && c.title === '接駁車資訊'),
    JSON.stringify(custom));

  /* 點彈窗型的卡片要跳出內文 */
  await page.click('.link-card.is-custom:has-text("接駁車資訊")');
  await page.waitForSelector('#lcModal.open', { timeout:5000 });
  const modal = await page.innerText('#lcModal');
  ok('點卡片跳出 popup 並顯示內文',
    modal.includes('台北車站東三門'), modal.replace(/\n/g, ' ').slice(0, 60));

  await page.click('#lcModalClose');
  ok('關得掉 popup',
    !(await page.evaluate(() => document.getElementById('lcModal').classList.contains('open'))));

  /* 編號要含自訂卡一起重編，不能跳號 */
  const idx = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.link-card .lc-index')).map((e) => e.textContent));
  ok('卡片編號連號到最後一張',
    idx.join(',') === '01,02,03,04,05,06,07,08', idx.join(','));

  ok('首頁無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}

/* ---------- 新人後台 ---------- */
console.log('\n[14] 新人後台');

{
  const { page } = await visit(`/w/${SLUG}/admin`);
  ok('後台停在 Google 登入畫面', await page.isVisible('#pwGate'));
  ok('沒登入時看不到管理介面',
    await page.evaluate(() => document.getElementById('adPage').hidden));

  /* 未登入的訪客即使改了 DOM 也寫不進去 —— 門檻在規則層 */
  const denied = await page.evaluate(async () => {
    try{
      await DataStore.saveDoc('explore', null, {
        title:'冒充的卡片', sub:'', kind:'popup', url:'', body:'x',
        order:99, time: Date.now(),
      });
      return false;
    }catch(e){ return e.code === 'permission-denied'; }
  });
  ok('未登入寫不進自訂卡片（規則擋下）', denied);
  await page.close();
}

/* ---------- 後台的出席回覆名單 ---------- */
console.log('\n[14b] 後台看得到出席回覆');
{
  /* 前面的測試已經從表單送出過回覆，這裡以資料庫的實際內容為準 */
  const snap = await adb.collection('sites').doc(siteIds[SLUG]).collection('rsvps').get();
  const rows = snap.docs.map((d) => d.data());
  const expectHead = rows
    .filter((r) => r.attending === true)
    .reduce((s, r) => s + (Number(r.guestCount) || 1), 0);

  const { page, errors } = await visit(`/w/${SLUG}/admin`);
  await signInAsOwner(page, 'couple@example.com');

  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });
  ok('新人登入後進得了後台', !(await page.evaluate(
    () => document.getElementById('adPage').hidden)));

  await page.waitForFunction(
    (n) => DataStore.getRSVPCount() === n, rows.length, { timeout:15000 });

  /* 儀表板：最大的數字是總回覆筆數，底下五張環狀圖 */
  ok('總回覆人數正確',
    Number(await page.textContent('#adRsvpTotal')) === rows.length,
    `應為 ${rows.length}`);
  /* 四個數字改成右邊一列一項（不再是一段長句），所以逐項比對 */
  const heroRows = await page.$$eval('#adRsvpSub .ad-hero-item', (els) =>
    els.map((e) => [...e.children].map((c) => c.textContent.trim()).join(' ')));
  ok('副標帶出確定出席人數',
    heroRows.some((t) => t === `確定出席 ${expectHead} 位`),
    heroRows.join('｜'));

  /* 圖表區塊在載入中會換成 skeleton，剛畫好的那一刻可能還在 scInF 的
     淡入動畫裡 —— innerText 是看版面算出來的，會受這個影響。
     這裡要驗的是「標題是不是這五個」，所以讀 textContent。 */
  const chartTitles = (await page.locator('#adRsvpCharts .ad-donut-title').allTextContents())
    .map((t) => t.replace(/依.*$|共需.*$/s, '').trim());
  ok('五張環狀圖：出席、飲食、兒童座椅、喜帖、喜餅',
    chartTitles.join(',') === '出席,飲食,兒童座椅,喜帖,喜餅',
    chartTitles.join(','));
  ok('環狀圖有畫出色塊',
    (await page.locator('#adRsvpCharts .ad-donut-seg').count()) > 0,
    String(await page.locator('#adRsvpCharts .ad-donut-seg').count()));

  /* 出席那一張的中心數字＝回覆筆數，圖例的百分比要加得起來 */
  const attendCenter = await page.locator('#adRsvpCharts .ad-donut').first()
    .locator('.ad-donut-center b').textContent();
  ok('出席圖的中心是回覆筆數', Number(attendCenter) === rows.length, attendCenter);

  /* 名單搬到「回覆資訊」子分頁 */
  await page.click('.ad-subtabs[data-subtabs="rsvp"] .ad-subtab[data-subtab="replies"]');
  await page.waitForTimeout(200);

  const listText = await page.innerText('#adRsvpList');
  ok('名單列出賓客的名字', listText.includes('王小明'), listText.replace(/\n/g, ' ').slice(0, 80));

  /* 篩選：只看「未定」 */
  await page.click('#adRsvpChips .ad-chip[data-filter="maybe"]');
  await page.waitForTimeout(200);
  const maybeCount = await page.locator('#adRsvpList tbody tr').count();
  const expectMaybe = rows.filter((r) => r.attending !== true && r.tentative === true).length;
  ok('可以只篩出未定的回覆', maybeCount === expectMaybe, `${maybeCount} / 應為 ${expectMaybe}`);

  await page.click('#adRsvpChips .ad-chip[data-filter="all"]');
  await page.waitForTimeout(200);

  /* 搜尋 */
  await page.fill('#adRsvpFilter', '不存在的賓客');
  await page.waitForTimeout(200);
  ok('搜尋沒結果時顯示空狀態',
    (await page.innerText('#adRsvpList')).includes('沒有符合的回覆'));
  await page.fill('#adRsvpFilter', '');
  await page.waitForTimeout(200);

  /* 表格：表頭欄位固定在上面，一欄一件事 */
  const heads = await page.$$eval('#adRsvpList thead th', (els) =>
    els.map((e) => e.textContent.replace('設定標籤', '').trim()));
  ok('名單是表格，表頭列出各欄位',
    ['姓名', '出席回應', '分類', '聯絡資訊', '葷', '素', '喜帖', '喜餅', '備註', '填表時間']
      .every((h) => heads.includes(h)),
    heads.join('｜'));
  ok('表頭是 sticky（捲動時留在上面）',
    await page.$eval('#adRsvpList thead th', (el) => getComputedStyle(el).position === 'sticky'));
  ok('表格橫向捲在自己的框裡，不會把整頁撐開',
    await page.$eval('#adRsvpList .ad-tablewrap',
      (el) => getComputedStyle(el).overflowX !== 'visible'));

  /* 匯出 CSV 搬到標題右邊 */
  ok('匯出 CSV 在標題列右側',
    await page.$eval('#adRsvpExport',
      (el) => !!el.closest('.ad-sec-head-actions')));

  /* 篩選收在同一塊裡 */
  ok('狀態 chips 與搜尋框在同一組篩選列',
    await page.$eval('#adRsvpChips', (el) => !!el.closest('.ad-filterbar'))
      && await page.$eval('#adRsvpFilter', (el) => !!el.closest('.ad-filterbar')));

  ok('後台無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}
{
  /* 刪除一筆重複的回覆：要連過兩關，第二關還要打字 */
  const rsvpCol = adb.collection('sites').doc(siteIds[SLUG]).collection('rsvps');
  await rsvpCol.doc('dupe-1').set({
    name:'重複小明', attending:true, tentative:false, guestCount:1,
    relation:'groom', mealMeat:1, mealVeg:0, childSeat:0,
    dietaryNote:'', message:'', note:'', createdAt: TS.now(),
  });

  const { page, errors } = await visit(`/w/${SLUG}/admin`);
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });
  await page.click('.ad-subtabs[data-subtabs="rsvp"] .ad-subtab[data-subtab="replies"]');
  await page.waitForFunction(
    () => document.querySelector('#adRsvpList tbody tr'), null, { timeout:10000 });
  await page.fill('#adRsvpFilter', '重複小明');
  await page.waitForTimeout(300);

  const dupRow = page.locator('#adRsvpList tbody tr', { hasText:'重複小明' }).first();
  ok('找得到那筆重複的回覆', (await dupRow.count()) === 1);

  /* 一列的動作收進「⋯」之後，刪除的入口是那顆按鈕裡的最後一項
     （危險的動作排最後、用危險色，誤觸的代價因此降下來） */
  async function openRowDelete(){
    await dupRow.locator('.ad-rowmenu-btn').click();
    await page.waitForSelector('.ad-rowmenu:not([hidden])', { timeout:5000 });
    await page.click('.ad-rowmenu .ad-rowmenu-item.is-danger');
  }

  ok('一列的刪除收進「⋯」裡，不再常駐在表格上',
    (await dupRow.locator('.ad-rowmenu-btn').count()) === 1
    && (await dupRow.locator('.ad-del').count()) === 0);

  /* 第一關：取消就什麼都不會發生 */
  await openRowDelete();
  await page.waitForSelector('#adModalMask:not([hidden])', { timeout:5000 });
  await page.click('#adModalCancel');
  await page.waitForTimeout(600);
  ok('第一關按取消不會刪掉', (await rsvpCol.doc('dupe-1').get()).exists);

  /* 再來一次，這次走完兩關 */
  await openRowDelete();
  await page.waitForSelector('#adModalMask:not([hidden])', { timeout:5000 });
  await page.click('#adModalConfirm');
  await page.waitForTimeout(400);
  ok('第二關要打字才按得下去', await page.isDisabled('#adModalConfirm'));
  await page.fill('#adModalPhrase', '刪除');
  await page.waitForTimeout(200);
  await page.click('#adModalConfirm');
  await page.waitForTimeout(2500);

  ok('兩關都過了才真的刪掉', !(await rsvpCol.doc('dupe-1').get()).exists);
  ok('刪掉的那筆從名單上消失',
    !(await page.innerText('#adRsvpList')).includes('重複小明'),
    (await page.innerText('#adRsvpList')).replace(/\n/g, ' ').slice(0, 60));

  ok('刪除回覆無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}
{
  /* 不在 ownerEmails 名單內的帳號：登入了也進不去、也讀不到 */
  const { page } = await visit(`/w/${SLUG}/admin`);
  await signInAsOwner(page, 'nosy@example.com');
  await page.waitForTimeout(1200);
  ok('外人登入後仍停在登入畫面',
    await page.evaluate(() => document.getElementById('adPage').hidden));

  const denied = await page.evaluate(async () => {
    const { getDocs, collection, db } = window.fb;
    try{
      await getDocs(collection(db, 'sites', window.SITE.siteId, 'rsvps'));
      return false;
    }catch(e){ return e.code === 'permission-denied'; }
  });
  ok('外人讀不到出席回覆（規則擋下）', denied);
  await page.close();
}

/* ---------- 後台改大廳文案 ---------- */
console.log('\n[15] 後台改得動大廳文案');
{
  const { page, errors } = await visit(`/w/${SLUG}/admin`);
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });

  await page.click('.ad-tab[data-tab="lobby"]');
  ok('表單帶出目前的地點',
    (await page.inputValue('#adVenueName')) === '台北國賓大飯店・二樓國際廳',
    await page.inputValue('#adVenueName'));

  await page.fill('#adVenueName', '晶華酒店・三樓宴會廳');
  await page.fill('#adVenueAddress', '台北市中山區中山北路二段 39 巷 3 號');
  await page.fill('#adDressCode', '請穿得舒服就好');
  await page.fill('#adGiftNote', '人到就好，禮金真的不用');
  await page.click('#adSiteForm button[type="submit"]');
  await page.waitForTimeout(1500);

  const site = (await adb.collection('sites').doc(siteIds[SLUG]).get()).data();
  ok('地點寫回 sites 文件', site.venueName === '晶華酒店・三樓宴會廳', site.venueName);
  ok('Dress Code 寫回 sites 文件', site.dressCode === '請穿得舒服就好', site.dressCode);
  ok('沒有動到站台狀態與名單',
    site.status === 'published' && site.ownerEmails.join() === 'couple@example.com',
    `${site.status} / ${site.ownerEmails.join()}`);

  /* 當日流程：現在是大廳內容底下的子分頁，要先切過去 */
  await page.click('.ad-subtabs[data-subtabs="lobby"] .ad-subtab[data-subtab="schedule"]');
  await page.waitForSelector('.ad-subpanel[data-subpanel="schedule"].is-on');
  await page.fill('#adSchList .ad-sch-row:nth-child(1) .ad-sch-time', '11:30');
  await page.fill('#adSchList .ad-sch-row:nth-child(1) .ad-sch-title', '入場迎賓');
  await page.fill('#adSchList .ad-sch-row:nth-child(1) .ad-sch-desc', '簽到、拍照');
  await page.click('#adSchAdd');
  await page.fill('#adSchList .ad-sch-row:nth-child(2) .ad-sch-time', '12:00');
  await page.fill('#adSchList .ad-sch-row:nth-child(2) .ad-sch-title', '婚宴開始');
  await page.click('#adSchSave');
  await page.waitForTimeout(1500);

  const sch = (await adb.collection('sites').doc(siteIds[SLUG]).get()).data().schedule;
  ok('流程存了兩列', Array.isArray(sch) && sch.length === 2, JSON.stringify(sch));
  ok('流程欄位正確',
    sch && sch[0].time === '11:30' && sch[0].title === '入場迎賓' && sch[1].title === '婚宴開始',
    JSON.stringify(sch));

  ok('大廳分頁無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}
{
  /* 賓客那一側要看得到改完的內容 */
  const { page } = await visit(`/w/${SLUG}/`);
  const text = await page.innerText('body');
  ok('大廳顯示新的地點', text.includes('晶華酒店・三樓宴會廳'));
  ok('大廳顯示新的 Dress Code', text.includes('請穿得舒服就好'));
  const tl = await page.innerText('#schedule');
  ok('大廳時間軸顯示流程', tl.includes('入場迎賓') && tl.includes('婚宴開始'),
    tl.replace(/\n/g, ' ').slice(0, 60));
  await page.close();
}

/* ---------- 後台上傳婚禮小卡（含裁切器） ---------- */
console.log('\n[16] 後台上傳婚禮小卡與故事牆內容');

/* 測試用的小圖：60×90 的單色 PNG，直接餵給 <input type="file"> */
const TEST_PNG = {
  name: '海邊的我們.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAADwAAABaCAIAAABrM6JiAAAAaklEQVR4nO3OAQkAIBAAMWOb' +
    'ySTGMob3MFiArXv2OOv7QDpMWlo6QFpaOkBaWjpAWlo6QFpaOkBaWjpAWlo6QFpaOkBaWjpA' +
    'Wlo6QFpaOkBaWjpAWlo6QFpaOkBaWjpAWlo6QFpaOmBk+gGDjGJJWqVO2QAAAABJRU5ErkJg' +
    'gg==', 'base64'),
};

{
  const { page, errors } = await visit(`/w/${SLUG}/admin`);
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });

  /* --- 婚禮小卡 --- */
  await page.click('.ad-tab[data-tab="cards"]');
  await page.setInputFiles('#adCardFile', TEST_PNG);

  /* 裁切器會跳出來，確認之後才寫進 Firestore */
  await page.waitForSelector('.cr-mask', { timeout:10000 });
  ok('選了照片會跳出裁切器', await page.isVisible('.cr-stage'));
  const frame = await page.evaluate(() => {
    const s = document.querySelector('.cr-stage');
    return { w: s.clientWidth, h: s.clientHeight };
  });
  ok('裁切框是直式 2:3',
    Math.abs(frame.w / frame.h - 2/3) < 0.02, `${frame.w}×${frame.h}`);
  await page.click('#crOk');
  await page.waitForSelector('.cr-mask', { state:'detached', timeout:15000 });
  await page.waitForTimeout(1500);

  const cards = await adb.collection('sites').doc(siteIds[SLUG]).collection('cards').get();
  ok('婚禮小卡寫進 Firestore', cards.size === 1, `${cards.size} 張`);
  const card = cards.size ? cards.docs[0].data() : {};
  ok('存的是 data URL', String(card.img || '').startsWith('data:image/jpeg;base64,'),
    String(card.img || '').slice(0, 24));
  ok('圖沒有超過文件上限', String(card.img || '').length <= 950000,
    `${String(card.img || '').length} 字元`);
  ok('卡名沿用檔名', card.name === '海邊的我們', card.name);
  ok('等級預設 N', card.rarity === 'N', card.rarity);

  /* 卡名／等級／說明改完就自動存回去 */
  await page.fill('.ad-card .ad-card-name', '海邊的我們・改');
  await page.selectOption('.ad-card .ad-card-rarity', 'SSR');
  await page.fill('.ad-card .ad-card-desc', '那天風很大');
  await page.locator('.ad-card .ad-card-desc').blur();
  await page.waitForTimeout(1500);

  const after = (await adb.collection('sites').doc(siteIds[SLUG])
    .collection('cards').get()).docs[0].data();
  ok('卡名改得動', after.name === '海邊的我們・改', after.name);
  ok('等級改得動', after.rarity === 'SSR', after.rarity);
  ok('說明改得動', after.desc === '那天風很大', after.desc);

  /* --- 新人故事牆：故事與章節 --- */
  const exhCol = adb.collection('sites').doc(siteIds[SLUG]).collection('exhibits');
  await page.click('.ad-tab[data-tab="exhibits"]');

  /* 先清空，才驗得出「這個分頁第一次打開就把預設內容寫進來當起點」
     （前面幾段的後台分頁也會各自載一次，這裡要的是這一個分頁自己寫的那一份） */
  const defCount = await page.evaluate(() => EXHIBIT_DEFAULTS.length);
  await wipeCol(exhCol);
  await page.waitForFunction(
    () => DataStore.getExhibits().length === EXHIBIT_DEFAULTS.length,
    null, { timeout:20000 });
  /* 瀏覽器端的 snapshot 會先反映還沒送達的寫入，等伺服器真的收齊再查 */
  const seededExh = (await waitForColSize(exhCol, defCount, 'order')).docs.map((d) => d.data());
  ok('第一次打開就寫進預設的故事牆內容', seededExh.length === defCount,
    `${seededExh.length} / ${defCount} 筆`);
  ok('預設內容有故事也有章節',
    seededExh.some((it) => it.kind === 'photo') && seededExh.some((it) => it.kind === 'act'),
    seededExh.map((it) => it.kind).join(',').slice(0, 40));
  ok('預設內容的排序是連號',
    seededExh.map((it) => it.order).join(',') ===
      seededExh.map((_, i) => i + 1).join(','),
    seededExh.map((it) => it.order).join(','));

  /* 清掉預設內容，後面的斷言才看得清楚新增了什麼
     （這個分頁已經記下「載過預設了」，不會又被補回來） */
  await wipeCol(exhCol);
  await page.waitForFunction(() => DataStore.getExhibits().length === 0,
    null, { timeout:15000 });

  await page.click('#adExhAddAct');
  await page.waitForSelector('#adExhModalMask:not([hidden])', { timeout:5000 });
  await page.fill('#adExhTitle', '第一幕');
  await page.fill('#adExhSub', '我們的相遇');
  await page.fill('#adExhOrder', '1');
  await page.click('#adExhForm button[type="submit"]');
  await page.waitForTimeout(1200);

  await page.click('#adExhAddPhoto');
  await page.waitForSelector('#adExhModalMask:not([hidden])', { timeout:5000 });
  await page.setInputFiles('#adExhFile', TEST_PNG);
  await page.waitForSelector('.cr-mask', { timeout:10000 });
  await page.click('#crOk');
  await page.waitForSelector('.cr-mask', { state:'detached', timeout:15000 });
  ok('故事照片有預覽', await page.isVisible('#adExhPrev img'));

  await page.fill('#adExhTitle', '第一次一起旅行');
  await page.fill('#adExhYear', '2021');
  await page.fill('#adExhSub', '夏天');
  await page.fill('#adExhDesc', '那天下著大雨，我們還是走完了整條老街。');
  await page.fill('#adExhOrder', '2');
  await page.click('#adExhForm button[type="submit"]');
  await page.waitForTimeout(1500);

  const exhibits = await waitForColSize(exhCol, 2, 'order');
  ok('故事牆存了兩筆', exhibits.size === 2, `${exhibits.size} 筆`);
  const [act, photo] = exhibits.docs.map((d) => d.data());
  ok('第一筆是章節卡', act.kind === 'act' && act.title === '第一幕', JSON.stringify(act));
  ok('第二筆是故事', photo.kind === 'photo' && photo.title === '第一次一起旅行');
  ok('故事照片是 data URL',
    String(photo.img || '').startsWith('data:image/jpeg;base64,'),
    String(photo.img || '').slice(0, 24));

  ok('婚禮小卡與故事牆分頁無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}
{
  /* 賓客那一側：抽卡用新人上傳的卡，收藏只記 cardId */
  const { page, errors } = await visit(`/w/${SLUG}/draw`);
  await page.waitForFunction(() => DataStore.getCards().length > 0, null, { timeout:10000 });
  const cards = await page.evaluate(() => CARDS.map((c) => `${c.name}(${c.rarity})`));
  ok('抽卡用新人上傳的婚禮小卡', cards.join('、') === '海邊的我們・改(SSR)', cards.join('、'));

  await page.click('#drawBtn');
  await page.waitForTimeout(1800);
  const collected = await adb.collection('sites').doc(siteIds[SLUG])
    .collection('collected').get();
  ok('抽到的卡有收藏起來', collected.size === 1, `${collected.size} 筆`);
  const rec = collected.size ? collected.docs[0].data() : {};
  ok('收藏只記 cardId，不塞整段圖', rec.cardId && rec.art === '',
    `${rec.cardId} / art=${JSON.stringify(rec.art)}`);
  ok('收藏的小卡看得到圖',
    await page.evaluate(() => !!document.querySelector('#collection .mini-card img')));

  /* 點收藏裡的小卡 → 放大看，並且存得下來 */
  ok('收藏的小卡是可以點的（有 button 語意）',
    await page.getAttribute('#collection .mini-card', 'role') === 'button');

  await page.click('#collection .mini-card');
  await page.waitForSelector('#cardView:not([hidden])', { timeout:5000 });
  ok('點下去看得到那張照片的大圖',
    await page.evaluate(() => {
      const img = document.querySelector('#cardViewArt img');
      return !!img && img.getAttribute('src').startsWith('data:image');
    }));
  /* 卡面上只有照片：等級、卡名、說明都不疊上去 */
  ok('大圖上只有照片，沒有等級／卡名的字幕條',
    await page.evaluate(() => {
      const t = document.getElementById('cardViewCard').innerText.trim();
      return t === '' && !document.querySelector('#cardViewCard .cv-meta');
    }));
  ok('SSR 的彩虹光膜還在',
    await page.evaluate(() => !document.getElementById('cardViewHolo').hidden));

  const cardDl = await Promise.all([
    page.waitForEvent('download', { timeout:15000 }),
    page.click('#cardViewSave'),
  ]).then(([d]) => d).catch(() => null);
  ok('收藏的小卡存得下來，而且是 JPG',
    !!cardDl && /^card-.*\.jpg$/.test(cardDl.suggestedFilename()),
    cardDl ? cardDl.suggestedFilename() : '(沒有下載)');

  /* Esc 關得掉，捲動也要還回去 */
  await page.keyboard.press('Escape');
  await page.waitForSelector('#cardView[hidden]', { state:'attached', timeout:5000 });
  ok('Esc 關得掉大圖', await page.evaluate(
    () => document.getElementById('cardView').hidden && document.body.style.overflow === ''));

  ok('抽卡頁無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}
{
  /* 賓客那一側：戀愛時光用新人設定的展品 */
  const { page, errors } = await visit(`/w/${SLUG}/exhibition`);
  await page.waitForFunction(() => DataStore.getExhibits().length > 0, null, { timeout:10000 });
  await page.waitForTimeout(500);
  const nodes = await page.evaluate(() => ({
    photos: Array.from(document.querySelectorAll('.tl-node .tl-cap')).map((e) => e.textContent),
    acts:   Array.from(document.querySelectorAll('.tl-act-div .ac-label')).map((e) => e.textContent),
    imgs:   document.querySelectorAll('.tl-node .tl-ph img').length,
  }));
  ok('時間軸只剩新人設定的故事',
    nodes.photos.join('、') === '第一次一起旅行', nodes.photos.join('、'));
  ok('章節分隔卡有出現', nodes.acts.join('、') === '第一幕', nodes.acts.join('、'));
  ok('故事照片有畫出來', nodes.imgs === 1, String(nodes.imgs));
  ok('戀愛時光無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}

/* ---------- 後台分頁跟著頁面開關 ---------- */
console.log('\n[17] 後台只顯示有開的頁面');
{
  /* minimal-site 只開了 rsvp：桌次、感謝信、婚禮小卡、故事牆的分頁都不該出現 */
  const { page, errors } = await visit('/w/minimal-site-2027/admin');
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });

  const tabs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ad-tab'))
      .filter((b) => !b.hidden)
      .map((b) => ({ tab:b.dataset.tab, locked:b.classList.contains('is-locked') })));
  const open = tabs.filter((t) => !t.locked).map((t) => t.tab);
  const locked = tabs.filter((t) => t.locked).map((t) => t.tab);
  /* 側欄現在分成三組（婚禮管理／婚禮內容／賓客互動），DOM 順序跟著改了：
       婚禮管理  rsvp, seating, seatingPlan, butler
       婚禮內容  lobby, letters, cards, exhibits
       賓客互動  inbox, quiz
     minimal-site 只開 rsvp，加上永遠都在的 lobby 與沒有開關的 inbox。
     其餘的不再收起來，而是鎖著留在側欄（進階方案）。 */
  ok('有開的頁面正常可用',
    open.join(',') === 'rsvp,lobby,inbox', open.join(','));
  ok('沒開的頁面留在側欄、鎖起來',
    locked.join(',') === 'seating,seatingPlan,butler,letters,cards,exhibits,quiz',
    locked.join(','));
  ok('大廳內容永遠在', open.includes('lobby'));
  ok('鎖起來的分頁有鎖頭圖示',
    await page.evaluate(() =>
      !!document.querySelector('.ad-tab[data-tab="cards"] .ad-ic-lock')));
  ok('鎖起來的分頁蓋上說明卡',
    await page.evaluate(() =>
      !!document.querySelector('.ad-panel[data-panel="cards"] > .ad-lock-cover')));
  ok('鎖起來的分頁點得進去',
    await (async () => {
      await page.click('.ad-tab[data-tab="cards"]');
      return page.evaluate(() =>
        document.querySelector('.ad-tab.is-on')?.dataset.tab === 'cards'
        && !!document.querySelector('.ad-panel[data-panel="cards"].is-on .ad-lock-cover'));
    })());

  ok('後台分頁無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}
{
  /* 「沒開」有兩種：可加購（鎖頭，看得見）與還沒對外開放（整顆收起來）。
     分界是 site-context.js 的 UNRELEASED_FEATURES —— 那是一份寫在程式裡的
     清單（產品層級的事實），預設是空的，所以這裡直接換掉 isUnreleased
     再重跑一次 applyTabVisibility，看畫面有沒有跟著分開。 */
  const { page } = await visit('/w/minimal-site-2027/admin');
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });

  const st = await page.evaluate(() => {
    window.SITE.isUnreleased = (k) => k === 'quiz';
    applyTabVisibility();
    const q = document.querySelector('.ad-tab[data-tab="quiz"]');
    const c = document.querySelector('.ad-tab[data-tab="cards"]');
    return {
      quizHidden:  q.hidden,
      quizLocked:  q.classList.contains('is-locked'),
      quizIcon:    !!q.querySelector('.ad-ic-lock'),
      quizCover:   !!document.querySelector('.ad-panel[data-panel="quiz"] > .ad-lock-cover'),
      cardsHidden: c.hidden,
      cardsLocked: c.classList.contains('is-locked'),
    };
  });
  ok('還沒開放的功能整顆收起來', st.quizHidden === true, JSON.stringify(st));
  ok('還沒開放的功能不掛鎖頭', !st.quizLocked && !st.quizIcon);
  ok('還沒開放的功能不留說明卡', !st.quizCover);
  ok('其他沒開的功能還是可加購（鎖頭）', !st.cardsHidden && st.cardsLocked);
  await page.close();
}
{
  /* 連預設開著的那一頁都被關掉時，要自動改開第一個還在的分頁 */
  await adb.collection('sites').doc(siteIds['minimal-site-2027'])
    .update({ pages: Object.fromEntries(ALL_PAGES.map((k) => [k, false])) });

  const { page } = await visit('/w/minimal-site-2027/admin');
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });

  const onTab = await page.evaluate(() =>
    document.querySelector('.ad-tab.is-on')?.dataset.tab);
  /* 分組之後，「婚禮資訊」是第一個沒有頁面開關（永遠都在）的分頁 ——
     它排在「婚禮內容」那一組的第一顆，而「婚禮管理」整組這時候都關掉了。
     所以出席回覆被關掉時，第一個還在的分頁就是它。 */
  ok('出席回覆關掉時自動改開第一個還在的分頁', onTab === 'lobby', String(onTab));
  ok('出席回覆的內容也收起來',
    await page.evaluate(() =>
      !document.querySelector('.ad-panel[data-panel="rsvp"]').classList.contains('is-on')));
  /* 分組的標題不再跟著收：每一組至少有一顆鎖著的按鈕在，
     那正是要讓新人看見的「還可以加開什麼」 */
  ok('整組都關掉時，group label 還在（底下是鎖著的分頁）',
    await page.evaluate(() =>
      !document.querySelector('.ad-navgroup[data-navgroup="manage"]').hidden));
  await page.close();

  /* 還原，後面的測試還要用這組站台 */
  await adb.collection('sites').doc(siteIds['minimal-site-2027'])
    .update({ pages: Object.fromEntries(ALL_PAGES.map((k) => [k, k === 'rsvp'])) });
}

/* ---------- 大廳：沒填的欄位不出現 ---------- */
console.log('\n[18] 大廳的選填區塊與預設 hashtag');
{
  const { page } = await visit('/w/minimal-site-2027/');
  const state = await page.evaluate(() => ({
    note:      document.getElementById('noteBlock').hidden,
    transport: document.getElementById('transportBlock').hidden,
    story:     document.getElementById('storyBlock').hidden,
    tags:      Array.from(document.querySelectorAll('#lobbyTags .tag')).map((e) => e.textContent),
  }));
  ok('沒填 Dress Code／禮金時整塊不出現', state.note === true);
  ok('沒填交通資訊時整塊不出現', state.transport === true);
  ok('沒填交通資訊時「地點」那列也沒有捷徑',
    await page.evaluate(() => document.getElementById('infoVenueJump').hidden));
  ok('沒填兩人的故事時整塊不出現', state.story === true);
  ok('沒填 hashtag 時用預設的兩個',
    state.tags.join('') === '#我們結婚了#Married', state.tags.join(' '));
  await page.close();
}
{
  /* 有填的站台：該出現的要出現，時間那一列也要有跳到流程的捷徑 */
  await adb.collection('sites').doc(siteIds[SLUG]).update({
    coupleTitle: '結婚快樂',
    transportPublic: '捷運中山站 2 號出口步行 5 分鐘',
    transportParking: '飯店 B2 停車場，用餐折抵 3 小時',
  });

  const { page } = await visit(`/w/${SLUG}/`);
  const state = await page.evaluate(() => ({
    couple:    document.getElementById('infoCouple').textContent,
    transport: document.getElementById('transportBlock').hidden,
    park:      document.getElementById('transportParking').textContent,
    story:     document.getElementById('storyBlock').hidden,
    note:      document.getElementById('noteBlock').hidden,
    jump:      document.getElementById('infoTimeJump').hidden,
    venueJump: document.getElementById('infoVenueJump').hidden,
    tags:      Array.from(document.querySelectorAll('#lobbyTags .tag')).map((e) => e.textContent),
  }));
  ok('大廳稱呼用新人自己寫的', state.couple === '結婚快樂', state.couple);
  ok('填了交通資訊就出現', state.transport === false);
  ok('停車資訊顯示出來', state.park.includes('B2'), state.park);
  ok('填了故事就出現', state.story === false);
  ok('填了 Dress Code 就出現', state.note === false);
  ok('有流程時「時間」那列出現捷徑', state.jump === false);
  ok('有交通資訊時「地點」那列出現捷徑', state.venueJump === false);
  ok('有填 hashtag 時用新人自己的',
    state.tags.join('') === '#GinnyOne2026', state.tags.join(' '));

  /* 點了捷徑會捲到 Schedule */
  await page.click('#infoTimeJump');
  await page.waitForTimeout(900);
  const near = await page.evaluate(() =>
    Math.abs(document.getElementById('scheduleBlock').getBoundingClientRect().top));
  ok('點捷徑會捲到當日流程', near < 120, `距離視窗頂端 ${Math.round(near)}px`);

  /* 「地點」那列的捷徑會捲到 Transport */
  await page.click('#infoVenueJump');
  await page.waitForTimeout(900);
  const nearT = await page.evaluate(() =>
    Math.abs(document.getElementById('transportBlock').getBoundingClientRect().top));
  ok('點捷徑會捲到交通資訊', nearT < 120, `距離視窗頂端 ${Math.round(nearT)}px`);
  await page.close();
}

/* ---------- 開放桌次功能 ---------- */
console.log('\n[18b] 桌次功能可以整個關掉');
{
  const { page } = await visit(`/w/${SLUG}/admin`);
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });

  await page.click('.ad-tab[data-tab="lobby"]');
  ok('桌次功能開關預設是開著的', await page.isChecked('#adSeatFeature'));

  await page.uncheck('#adSeatFeature');
  await page.waitForTimeout(1500);
  const site = (await adb.collection('sites').doc(siteIds[SLUG]).get()).data();
  ok('開關寫回 sites 文件', site.seatingFeatureEnabled === false,
    String(site.seatingFeatureEnabled));
  ok('關掉之後後台還進得去桌次分頁',
    !(await page.evaluate(() =>
      document.querySelector('#adSide .ad-tab[data-tab="seating"]').hidden)));
  await page.close();
}
{
  /* 賓客那一側：大廳沒有按鈕、導覽列沒有桌次、直接打網址會被導回大廳 */
  const { page } = await visit(`/w/${SLUG}/`);
  ok('關掉後大廳沒有「尋找我的座位」',
    await page.evaluate(() => document.getElementById('infoSeatCta').hidden));
  ok('關掉後導覽列也沒有桌次',
    await page.evaluate(() => !Array.from(document.querySelectorAll('#siteNav .nav-link'))
      .some((a) => a.textContent.includes('桌次'))));
  await page.close();

  const direct = await newPage();
  await direct.goto(`${BASE}/w/${SLUG}/seating`, { waitUntil:'domcontentloaded' });
  await direct.waitForURL(`**/w/${SLUG}/`, { timeout: 20000 }).catch(() => {});
  ok('關掉後直接打網址會導回大廳', direct.url().endsWith(`/w/${SLUG}/`), direct.url());
  await direct.close();

  /* 還原，後面的桌次測試還要用 */
  await adb.collection('sites').doc(siteIds[SLUG]).update({ seatingFeatureEnabled: true });
}

/* ---------- 桌次搜尋開關 ---------- */
console.log('\n[19] 桌次搜尋可以關掉');
{
  const { page, errors } = await visit(`/w/${SLUG}/admin`);
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });

  await page.click('.ad-tab[data-tab="seating"]');
  await page.click('.ad-subtabs[data-subtabs="seating"] .ad-subtab[data-subtab="list"]');
  await page.waitForSelector('.ad-subpanel[data-subpanel="list"].is-on');
  ok('搜尋開關預設是開著的', await page.isChecked('#adSeatSearch'));

  await page.uncheck('#adSeatSearch');
  await page.waitForTimeout(1500);
  const site = (await adb.collection('sites').doc(siteIds[SLUG]).get()).data();
  ok('開關寫回 sites 文件', site.seatingSearchEnabled === false,
    String(site.seatingSearchEnabled));
  ok('關掉後提醒名單暫時用不到',
    !(await page.evaluate(() => document.getElementById('adSeatListOff').hidden)));

  ok('桌次分頁無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}

/* ---------- 後台的測驗題目 ---------- */
console.log('\n[20] 後台出測驗題目');

const quizCol = adb.collection('sites').doc(siteIds[SLUG]).collection('quiz');
const voteCol = adb.collection('sites').doc(siteIds[SLUG]).collection('quizVotes');
const LONG_OPT = '這是一個故意寫得非常長的選項內容，長到一行放不完，一定會被收成刪節號';

{
  /* 先清空題目，才驗得出「第一次打開後台就有 3 題預設題目」 */
  const old = await quizCol.get();
  await Promise.all(old.docs.map((d) => d.ref.delete()));

  const { page, errors } = await visit(`/w/${SLUG}/admin`);
  page.on('dialog', (d) => d.accept());
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });
  await page.click('.ad-tab[data-tab="quiz"]');

  /* 預設題目 */
  await page.waitForFunction(() => DataStore.getQuiz().length === 3, null, { timeout:15000 });
  /* 瀏覽器端的 snapshot 會先反映還沒送達的寫入，等伺服器真的收齊再查 */
  const seeded = (await waitForColSize(quizCol, 3, 'order')).docs.map((d) => d.data());
  ok('第一次打開就寫進 3 題預設題目', seeded.length === 3, `${seeded.length} 題`);
  ok('預設題目的題號是 1、2、3',
    seeded.map((q) => q.order).join(',') === '1,2,3', seeded.map((q) => q.order).join(','));
  ok('每題都是四個選項',
    seeded.every((q) => Array.isArray(q.opts) && q.opts.length === 4),
    seeded.map((q) => (q.opts || []).length).join(','));
  ok('預設題目有單選也有複選',
    seeded.some((q) => q.type === 'single') && seeded.some((q) => q.type === 'multi'),
    seeded.map((q) => q.type).join(','));

  /* 新增一題複選（表單現在在彈窗裡） */
  await page.click('#adQuizAddBtn');
  await page.waitForSelector('#adQuizModalMask:not([hidden])', { timeout:5000 });
  await page.selectOption('#adQuizType', 'multi');
  await page.fill('#adQuizQ', '我們的貓最愛做什麼？');
  await page.fill('.ad-quiz-text[data-oi="0"]', LONG_OPT);
  await page.fill('.ad-quiz-text[data-oi="1"]', '睡整天');
  await page.fill('.ad-quiz-text[data-oi="2"]', '討摸');
  await page.fill('.ad-quiz-text[data-oi="3"]', '看著我們工作');
  await page.check('.ad-quiz-ans input[data-oi="0"]');
  await page.check('.ad-quiz-ans input[data-oi="2"]');
  await page.click('#adQuizForm button[type="submit"]');
  await page.waitForFunction(() => DataStore.getQuiz().length === 4, null, { timeout:15000 });
  /* admin SDK 讀到的 emulator 資料偶爾會落後瀏覽器端的 onSnapshot 一拍，
     這裡跟其他段落一樣多等一下再查，不然讀到的還是寫入前的快照 */
  await page.waitForTimeout(1000);

  const added = (await quizCol.orderBy('order').get()).docs.map((d) => d.data()).pop();
  ok('新題目排在最後', added.order === 4, String(added.order));
  ok('新題目是複選、答案有兩個',
    added.type === 'multi' && added.answer.join(',') === '0,2',
    `${added.type} / ${added.answer.join(',')}`);
  ok('選項內容照原文存下來', added.opts[0] === LONG_OPT, added.opts[0]);

  /* 調順序：拖曳第一題的把手，跨過第二題放開（取代原本的 ↓ 按鈕） */
  const before = (await quizCol.orderBy('order').get()).docs.map((d) => d.id);
  const item1 = page.locator('#adQuizList .ad-quiz-item').nth(0);
  const item2 = page.locator('#adQuizList .ad-quiz-item').nth(1);
  const handleBox = await item1.locator('.ad-drag-handle').boundingBox();
  const item2Box   = await item2.boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    handleBox.x + handleBox.width / 2, item2Box.y + item2Box.height + 6, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(1800);
  const after = (await quizCol.orderBy('order').get()).docs.map((d) => d.id);
  ok('拖曳把第一題換到第二題',
    after[0] === before[1] && after[1] === before[0], after.slice(0, 2).join(' → '));
  ok('順序仍然是連號 1…4',
    (await quizCol.orderBy('order').get()).docs
      .map((d) => d.data().order).join(',') === '1,2,3,4');

  /* 刪一題：點刪除後要在站內的確認 modal 上再按一次確定 */
  const delId = after[after.length - 1];
  await page.click(`#adQuizList [data-del-quiz="${delId}"]`);
  await page.waitForSelector('#adModalMask:not([hidden])', { timeout:5000 });
  await page.click('#adModalConfirm');
  await page.waitForFunction(() => DataStore.getQuiz().length === 3, null, { timeout:15000 });
  /* 畫面會先把它藏起來，真正的刪除要等「復原」的 5 秒過了才送出 */
  const left = await waitForColSize(quizCol, 3, null, 20000);
  ok('刪得掉題目', left.size === 3, `${left.size} 題`);

  ok('測驗分頁無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}

/* ---------- 賓客那一側的測驗 ---------- */
console.log('\n[20b] 賓客做測驗');
{
  /* 把長選項那題再加回來（上一段把它刪掉了），順便測長字串的截斷 */
  await quizCol.doc('long-one').set({
    type:'multi', q:'我們的貓最愛做什麼？',
    opts:[LONG_OPT, '睡整天', '討摸', '看著我們工作'],
    answer:[0, 2], order: 4, time: Date.now(),
  });

  const { page, errors } = await visit(`/w/${SLUG}/quiz`);
  await page.waitForFunction(() => document.querySelectorAll('.q-block').length === 4,
    null, { timeout:15000 });

  const questions = (await quizCol.orderBy('order').get()).docs;
  ok('題目用新人設定的那一份', questions.length === 4, `${questions.length} 題`);
  ok('題號依 order 排',
    (await page.evaluate(() =>
      Array.from(document.querySelectorAll('.q-block .q-text')).map((e) => e.textContent)))
      .join('|') === questions.map((d) => d.data().q).join('|'));

  /* 單選題選完會自動捲到下一題 */
  const y0 = await page.evaluate(() => window.scrollY);
  await page.click('.q-block[data-qi="0"] .q-opt[data-oi="0"]');
  await page.waitForTimeout(900);
  const y1 = await page.evaluate(() => window.scrollY);
  ok('單選選完自動捲到下一題', y1 > y0, `${y0} → ${y1}`);
  ok('送出鈕在全部作答前是關著的',
    await page.evaluate(() => document.getElementById('qSubmit').disabled));

  /* 其餘每題都選 A */
  for(let i = 1; i < 4; i++){
    await page.click(`.q-block[data-qi="${i}"] .q-opt[data-oi="0"]`);
    await page.waitForTimeout(400);
  }
  ok('全部作答完才打開送出鈕',
    await page.evaluate(() => !document.getElementById('qSubmit').disabled));

  await page.click('#qSubmit');
  await page.waitForSelector('.q-result-head', { timeout:10000 });
  await page.waitForTimeout(1500);

  /* 每題都選 A，只有「正確答案剛好只有 A」的那幾題會得分 */
  const expectScore = questions
    .filter((d) => (d.data().answer || []).join(',') === '0').length;
  const scoreText = await page.textContent('.q-score');
  ok('分數等於答對的題數',
    scoreText.replace(/\s/g, '') === `${expectScore}／4`, scoreText.replace(/\s/g, ''));

  const votes = await voteCol.get();
  ok('作答有寫進 quizVotes', votes.size === 1, `${votes.size} 筆`);
  const vote = votes.size ? votes.docs[0].data() : {};
  ok('票以題目 id 為 key',
    Object.keys(vote.picks || {}).sort().join(',') === questions.map((d) => d.id).sort().join(','),
    Object.keys(vote.picks || {}).join(','));
  ok('分數與題數一起存下來',
    vote.score === expectScore && vote.total === 4, `${vote.score}/${vote.total}`);

  /* 長條圖：只掛「你」的標籤（新人不作答，所以沒有第二種標籤） */
  const chart = await page.evaluate(() => ({
    rows:    document.querySelectorAll('.q-bar-row').length,
    youTags: Array.from(document.querySelectorAll('.q-bar-badge')).map((e) => e.textContent),
    counts:  Array.from(document.querySelectorAll('.q-bar-row.is-you .q-bar-count'))
               .map((e) => e.textContent),
    answers: document.querySelectorAll('.q-bar-row.is-answer').length,
  }));
  ok('四題各四條長條', chart.rows === 16, String(chart.rows));
  ok('標籤只有「你」', chart.youTags.length === 4 && chart.youTags.every((t) => t === '你'),
    chart.youTags.join(','));
  /* 只有我一個人作答，所以自己那格剛好一票 —— 樂觀疊圖不能重複計算 */
  ok('自己選的那格只算一票', chart.counts.every((c) => c === '1'), chart.counts.join(','));
  ok('正確答案有標記出來', chart.answers >= 4, String(chart.answers));

  /* 選項寫在長條裡，不能溢出長條、也不能壓到「你」 */
  const overflow = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.q-bar-row').forEach((row) => {
      const label = row.querySelector('.q-bar-label');
      const track = row.querySelector('.q-bar-track');
      const badge = row.querySelector('.q-bar-badge');
      const l = label.getBoundingClientRect();
      const t = track.getBoundingClientRect();
      if(l.right > t.right + 1 || l.left < t.left - 1) bad.push(`超出長條：${label.textContent}`);
      if(badge && l.right > badge.getBoundingClientRect().left + 1){
        bad.push(`壓到「你」：${label.textContent}`);
      }
      if(label.scrollWidth > label.clientWidth + 1 &&
         getComputedStyle(label).textOverflow !== 'ellipsis'){
        bad.push(`沒有以「…」收尾：${label.textContent}`);
      }
    });
    return bad;
  });
  ok('長選項只在長條裡截斷，不會壓到「你」', overflow.length === 0, overflow.slice(0, 2).join(' | '));

  ok('測驗頁無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}
{
  /* 賓客那一側：只剩桌次圖，沒有搜尋欄 */
  const { page } = await visit(`/w/${SLUG}/seating`);
  await page.waitForTimeout(800);
  ok('關掉後前台看不到搜尋',
    await page.evaluate(() => document.getElementById('stSearch').hidden));
  ok('關掉後也不去讀整份名單',
    await page.evaluate(() => DataStore.getSeating().length === 0));
  await page.close();
}
{
  /* 再打開，賓客那一側就回到原本的樣子 */
  await adb.collection('sites').doc(siteIds[SLUG]).update({ seatingSearchEnabled: true });
  const { page: seatPage } = await visit(`/w/${SLUG}/seating`);
  ok('重新打開後搜尋又回來了',
    !(await seatPage.evaluate(() => document.getElementById('stSearch').hidden)));
  await seatPage.close();

  /* 後台看得到剛剛那筆作答，也清得掉 —— 危險操作現在走站內的確認 modal，
     整批清空要打「確認刪除」才能按確定，不是原生 confirm() 了 */
  const { page } = await visit(`/w/${SLUG}/admin`);
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });
  await page.click('.ad-tab[data-tab="quiz"]');
  await page.click('.ad-subtabs[data-subtabs="quiz"] .ad-subtab[data-subtab="votes"]');
  await page.waitForSelector('.ad-subpanel[data-subpanel="votes"].is-on');
  await page.waitForFunction(() => DataStore.getQuizVotes().length === 1, null, { timeout:15000 });
  ok('後台看得到作答人數',
    (await page.textContent('#adQuizVoteCount')) === '1',
    await page.textContent('#adQuizVoteCount'));

  await page.click('#adQuizWipe');
  await page.waitForSelector('#adModalMask:not([hidden])', { timeout:5000 });
  await page.fill('#adModalPhrase', '確認刪除');
  await page.click('#adModalConfirm');
  await page.waitForTimeout(1800);
  ok('新人清得掉作答紀錄', (await voteCol.get()).size === 0, `${(await voteCol.get()).size} 筆`);
  ok('題目沒被一起清掉', (await quizCol.get()).size === 4, `${(await quizCol.get()).size} 題`);
  await page.close();
}

/* ---------- 後台的婚禮流程（多活動） ---------- */
console.log('\n[14d] 後台婚禮流程');
{
  /* 先確認旗標關著時，後台一個新東西都沒有 —— 這是整個 Phase 3 的前提 */
  const { page } = await visit(`/w/${SLUG}/admin`);
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });
  ok('旗標關著時看不到「婚禮流程」子分頁',
    await page.isHidden('#adEventsSubtab'));
  ok('旗標關著時場地三欄照常可以改',
    !(await page.getAttribute('#adVenueName', 'readonly')) !== false
      || !(await page.$eval('#adVenueName', (el) => el.readOnly)));
  ok('旗標關著時場地不會出現「改在婚禮流程設定」',
    await page.isHidden('#adVenueManaged'));

  /* 打不進去的網址要退回第一個子分頁，不能卡在空白 */
  await page.evaluate(() => { location.hash = 'lobby/events'; });
  await page.waitForTimeout(300);
  ok('旗標關著時 #lobby/events 退回「婚禮資訊」',
    await page.$eval('.ad-subpanel[data-subpanel="info"]',
      (el) => el.classList.contains('is-on')));
  await page.close();
}

{
  /* 打開旗標 */
  await adb.collection('sites').doc(siteIds[SLUG]).update({ multiEventEnabled: true });
  const { page, errors } = await visit(`/w/${SLUG}/admin`);
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });

  await page.click('.ad-tab[data-tab="lobby"]');
  await page.waitForTimeout(200);
  ok('旗標開了才看得到「婚禮流程」', await page.isVisible('#adEventsSubtab'));

  await page.click('.ad-subtabs[data-subtabs="lobby"] .ad-subtab[data-subtab="events"]');
  await page.waitForTimeout(300);

  /* 第一次打開：用既有的婚禮資訊帶出一張填好的婚宴卡（還沒寫進資料庫） */
  const first = await page.evaluate(() => ({
    cards: document.querySelectorAll('#adEvList .ad-ev').length,
    name: document.querySelector('#adEvList .ad-ev-name')?.textContent,
    flag: document.querySelector('#adEvList .ad-ev-flag')?.textContent,
    savedEvents: (window.SITE.data.events || []).length,
  }));
  ok('第一次打開帶出一張婚宴卡', first.cards === 1 && first.name === '婚宴',
    `${first.cards} 張 / ${first.name}`);
  ok('那一張是「需要回覆」', first.flag === '需要回覆', first.flag);
  ok('這一刻還沒寫進資料庫', first.savedEvents === 0, String(first.savedEvents));

  /* 加兩個活動：證婚（預設就是證婚）＋ 派對 */
  await page.click('#adEvAdd');
  await page.waitForTimeout(200);
  await page.click('#adEvAdd');
  await page.waitForTimeout(200);
  ok('加得出第二、三個活動',
    (await page.locator('#adEvList .ad-ev').count()) === 3,
    String(await page.locator('#adEvList .ad-ev').count()));
  ok('加完會說還沒儲存',
    (await page.innerText('#adEvDirty')).includes('還沒儲存'));

  /* 最後一張改成派對，順便驗「換型別會帶預設」 */
  const last = page.locator('#adEvList .ad-ev').last();
  await last.locator('[data-ev-field="type"]').selectOption('afterparty');
  await page.waitForTimeout(200);
  ok('換型別會帶出預設名稱',
    (await last.locator('.ad-ev-name').textContent()) === '派對',
    await last.locator('.ad-ev-name').textContent());

  /* 中間那張（證婚）填地點與時間 */
  const mid = page.locator('#adEvList .ad-ev').nth(1);
  await mid.locator('[data-ev-toggle]').click();
  await page.waitForTimeout(200);
  await mid.locator('[data-ev-field="startTime"]').fill('14:00');
  await mid.locator('[data-ev-field="venueName"]').fill('台北真理堂');
  await mid.locator('[data-ev-field="address"]').fill('台北市大安區新生南路三段86號');
  await page.waitForTimeout(200);
  ok('一次只展開一張卡',
    (await page.locator('#adEvList .ad-ev.is-open').count()) === 1,
    String(await page.locator('#adEvList .ad-ev.is-open').count()));

  /* 文訂：換成不需要回覆的型別，flag 要跟著變 */
  await page.click('#adEvAdd');
  await page.waitForTimeout(200);
  const fourth = page.locator('#adEvList .ad-ev').last();
  await fourth.locator('[data-ev-field="type"]').selectOption('engagement');
  await page.waitForTimeout(200);
  ok('文訂自動變成「不用回覆」',
    (await fourth.locator('.ad-ev-flag').textContent()) === '不用回覆',
    await fourth.locator('.ad-ev-flag').textContent());

  /* ↑↓ 排序：把文訂一路移到最前面。
     每一次都要重新抓「文訂」那一張 —— 移動之後它就不是最後一張了 */
  const engageCard = () => page.locator('#adEvList .ad-ev')
    .filter({ has: page.locator('.ad-ev-name', { hasText:'文訂' }) });
  for(let i = 0; i < 3; i++){
    await engageCard().locator('[data-ev-move="up"]').click();
    await page.waitForTimeout(150);
  }
  ok('↑↓ 排得動',
    (await page.locator('#adEvList .ad-ev-name').first().textContent()) === '文訂',
    await page.locator('#adEvList .ad-ev-name').first().textContent());
  ok('第一張的「往上」是關的',
    await page.locator('#adEvList .ad-ev').first()
      .locator('[data-ev-move="up"]').isDisabled());

  await page.click('#adEvSave');
  await page.waitForTimeout(1500);

  const site = (await adb.collection('sites').doc(siteIds[SLUG]).get()).data();
  ok('四個活動寫進 sites.events', (site.events || []).length === 4,
    String((site.events || []).length));
  ok('順序照畫面上的',
    (site.events || []).map((e) => e.name).join(',') === '文訂,婚宴,證婚,派對',
    (site.events || []).map((e) => e.name).join(','));
  const evByName = (n) => (site.events || []).find((e) => e.name === n) || {};
  ok('文訂的 requiresRsvp 是 false',
    evByName('文訂').requiresRsvp === false && evByName('婚宴').requiresRsvp === true);
  ok('證婚的地點存進去了',
    evByName('證婚').venueName === '台北真理堂'
      && evByName('證婚').startTime === '14:00',
    `${evByName('證婚').venueName} / ${evByName('證婚').startTime}`);
  ok('每個活動的 id 都不一樣',
    new Set(site.events.map((e) => e.id)).size === 4);
  /* 比的是「有沒有鏡像」這件事本身，不是某一個地點的字面值 ——
     前面的測試改過站台的地點，寫死字面值只會測到測試順序 */
  ok('主要活動的地點鏡像回站台文件',
    site.venueName === evByName('婚宴').venueName
      && site.venueAddress === evByName('婚宴').address,
    `${site.venueName} ← ${evByName('婚宴').venueName}`);
  ok('存完就不再說有未儲存的變更',
    !(await page.innerText('#adEvDirty')).includes('還沒儲存'));

  /* ---- 場地三欄轉唯讀 ---- */
  await page.click('.ad-subtabs[data-subtabs="lobby"] .ad-subtab[data-subtab="info"]');
  await page.waitForTimeout(300);
  ok('婚禮資訊出現「改在婚禮流程設定」', await page.isVisible('#adVenueManaged'));
  ok('場地三欄轉成唯讀',
    await page.evaluate(() => ['adVenueName','adVenueAddress','adVenueMapUrl']
      .every((id) => document.getElementById(id).readOnly)));
  await page.click('#adVenueManagedJump');
  await page.waitForTimeout(300);
  ok('「去設定婚禮流程」跳得過去',
    await page.$eval('.ad-subpanel[data-subpanel="events"]',
      (el) => el.classList.contains('is-on')));

  /* ---- 表單設定：每個活動各自要問的 ---- */
  await page.click('.ad-tab[data-tab="rsvp"]');
  await page.waitForTimeout(200);
  await page.click('.ad-subtabs[data-subtabs="rsvp"] .ad-subtab[data-subtab="form"]');
  await page.waitForTimeout(300);

  ok('多活動時長出「每個活動各自要問的」', await page.isVisible('#adEvAskGroup'));
  ok('只列需要回覆的活動（文訂不在裡面）',
    (await page.locator('#adEvAskList .ad-evask-item').count()) === 3,
    String(await page.locator('#adEvAskList .ad-evask-item').count()));
  ok('那四題從「只問一次」那一組收起來', await page.isHidden('#adFixedEventQs'));
  ok('編號跟著往後挪',
    (await page.innerText('#adFormGroupNoA')) === '2'
      && (await page.innerText('#adFormGroupNoB')) === '3');
  ok('第一組的標題換成「整份回覆只問一次的」',
    (await page.innerText('#adFormGroupTitleA')) === '整份回覆只問一次的');

  /* 型別預設：證婚不問餐點與兒童椅，婚宴四題全開 */
  const asks = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('#adEvAskList .ad-evask-item').forEach((item) => {
      const name = item.querySelector('.ad-evask-name').textContent;
      out[name] = {};
      item.querySelectorAll('[data-evask-field]').forEach((el) => {
        out[name][el.dataset.evaskField] = el.checked;
      });
    });
    return out;
  });
  ok('婚宴四題全開',
    asks['婚宴'].askCount && asks['婚宴'].askMeal
      && asks['婚宴'].askChildSeat && asks['婚宴'].askDiet,
    JSON.stringify(asks['婚宴']));
  ok('證婚只問人數',
    asks['證婚'].askCount && !asks['證婚'].askMeal
      && !asks['證婚'].askChildSeat && !asks['證婚'].askDiet,
    JSON.stringify(asks['證婚']));

  /* 勾掉婚宴的兒童椅 → 立刻存回 events[]，其餘欄位不能被動到 */
  await page.locator('#adEvAskList .ad-evask-item')
    .filter({ hasText:'婚宴' }).locator('[data-evask-field="askChildSeat"]').uncheck();
  await page.waitForTimeout(1500);
  const site2 = (await adb.collection('sites').doc(siteIds[SLUG]).get()).data();
  const banquet = site2.events.find((e) => e.name === '婚宴');
  ok('勾掉的那一題寫回 events[]', banquet.askChildSeat === false);
  ok('同一個活動的其他題目沒被動到',
    banquet.askCount === true && banquet.askMeal === true && banquet.askDiet === true);
  ok('其他活動與其他欄位都沒被動到',
    site2.events.length === 4
      && site2.events.find((e) => e.name === '證婚').venueName === '台北真理堂',
    String(site2.events.length));

  ok('婚禮流程無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}

{
  /* ---- 只剩一個活動時，表單設定要回到原本的樣子 ----
     「簡單婚禮不能被複雜化」在後台的具體長相 */
  await adb.collection('sites').doc(siteIds[SLUG]).update({
    events: [{ id:'ev_only', type:'reception', name:'婚宴', nameEn:'WEDDING RECEPTION',
               date:'2026-09-19', startTime:'12:00', endTime:'',
               venueName:'晶華酒店・三樓宴會廳', address:'台北市中山區',
               mapUrl:'', desc:'', requiresRsvp:true,
               askCount:true, askMeal:true, askChildSeat:true, askDiet:true, questions:[] }],
  });
  const { page } = await visit(`/w/${SLUG}/admin`);
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });
  await page.click('.ad-tab[data-tab="rsvp"]');
  await page.click('.ad-subtabs[data-subtabs="rsvp"] .ad-subtab[data-subtab="form"]');
  await page.waitForTimeout(300);

  ok('只有一個活動時，不長出「每個活動各自要問的」',
    await page.isHidden('#adEvAskGroup'));
  ok('那四題留在原本的位置', await page.isVisible('#adFixedEventQs'));
  ok('編號回到 1 / 2',
    (await page.innerText('#adFormGroupNoA')) === '1'
      && (await page.innerText('#adFormGroupNoB')) === '2');
  ok('標題回到「題目」', (await page.innerText('#adFormGroupTitleA')) === '題目');
  const fixedQs = '#adRsvpForm .ad-check.is-fixed:not(#adAskTagRow) input:disabled:checked';
  ok('固定題目仍然是 8 條（和改版前一樣）',
    (await page.locator(fixedQs).count()) === 8,
    String(await page.locator(fixedQs).count()));
  await page.close();

  /* 還原：關掉旗標、清空 events，後面的測試看到的是原本的站台。
     地點刻意不動 —— 那是前面 [14] 那一段存進去的，不是這一段弄出來的 */
  await adb.collection('sites').doc(siteIds[SLUG]).update({
    multiEventEnabled: false, events: [],
  });
}

/* ---------- 後台的表單設定 ---------- */
console.log('\n[14c] 後台開關表單題目');
{
  const { page, errors } = await visit(`/w/${SLUG}/admin`);
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });

  /* 表單設定是出席回覆的第三個子分頁 */
  await page.click('.ad-subtabs[data-subtabs="rsvp"] .ad-subtab[data-subtab="form"]');
  await page.waitForTimeout(200);

  ok('「查看表單」指向賓客那一頁',
    (await page.getAttribute('#adRsvpViewForm', 'href')) === `/w/${SLUG}/invitation`,
    await page.getAttribute('#adRsvpViewForm', 'href'));
  const fixedQs = '#adRsvpForm .ad-check.is-fixed:not(#adAskTagRow) input:disabled:checked';
  ok('固定題目用關不掉的勾選框列出來',
    (await page.locator(fixedQs).count()) === 8,
    String(await page.locator(fixedQs).count()));
  ok('表單資訊列出婚禮資訊的內容',
    (await page.innerText('#adRsvpInfoList')).includes('地點名稱'),
    (await page.innerText('#adRsvpInfoList')).replace(/\n/g, ' ').slice(0, 80));

  ok('題目預設全部開著',
    (await page.isChecked('#adAskCard')) && (await page.isChecked('#adAskGift'))
      && (await page.isChecked('#adAskMessage')));
  ok('聯絡方式預設三種都問',
    (await page.isChecked('#adContactPhone')) && (await page.isChecked('#adContactLine'))
      && (await page.isChecked('#adContactEmail')));

  /* 關掉喜餅與留言，聯絡方式只留 Email，照片集也收起來 */
  await page.uncheck('#adAskGift');
  await page.uncheck('#adAskMessage');
  await page.uncheck('#adContactPhone');
  await page.uncheck('#adContactLine');
  await page.uncheck('#adShowGallery');
  await page.click('#adRsvpForm button[type="submit"]');
  await page.waitForTimeout(1500);

  const site = (await adb.collection('sites').doc(siteIds[SLUG]).get()).data();
  ok('開關寫回 sites 文件',
    site.rsvpAskCard === true && site.rsvpAskGift === false
      && site.rsvpAskMessage === false && site.rsvpShowGallery === false,
    JSON.stringify({ card:site.rsvpAskCard, gift:site.rsvpAskGift,
                     msg:site.rsvpAskMessage, gallery:site.rsvpShowGallery }));
  ok('聯絡方式只留 Email',
    (site.rsvpContactMethods || []).join(',') === 'email',
    (site.rsvpContactMethods || []).join(','));
  ok('沒有動到出席回覆的開關與截止時間',
    site.rsvpEnabled === true && !!site.rsvpDeadline);

  /* 關掉的題目不再畫成環狀圖（圖表在「出席回覆總覽」那個子分頁） */
  await page.click('.ad-subtabs[data-subtabs="rsvp"] .ad-subtab[data-subtab="overview"]');
  await page.waitForTimeout(300);
  const titles = await page.locator('#adRsvpCharts .ad-donut-title').allInnerTexts();
  ok('關掉的題目不出現在儀表板',
    titles.map((t) => t.split('\n')[0].trim()).join(',') === '出席,飲食,兒童座椅,喜帖',
    titles.map((t) => t.split('\n')[0].trim()).join(','));

  ok('表單設定無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}
{
  /* 賓客那一側：關掉的題目真的不見了，聯絡方式只剩 Email */
  const { page } = await visit(`/w/${SLUG}/invitation`);
  await page.evaluate(() => LS.remove('rsvp.mine'));
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => !!document.getElementById('rsvpForm'), null, { timeout:20000 });

  ok('喜帖還在', (await page.locator('#cardRow').count()) === 1);
  ok('喜餅整題不見了', (await page.locator('#giftRow').count()) === 0);
  ok('想對新人說的話不見了', (await page.locator('#rNote').count()) === 0);
  ok('其他備註仍然在', (await page.locator('#rMemo').count()) === 1);
  ok('聯絡方式只剩 Email',
    (await page.locator('.rf-contact-name').allTextContents()).join('／') === 'Email',
    (await page.locator('.rf-contact-name').allTextContents()).join('／'));
  ok('照片集整塊收起來', !(await page.isVisible('#galleryBlock')));
  ok('兩人的故事還在', await page.isVisible('#storyBlock'));

  /* 關掉的題目不會擋住送出 */
  await page.fill('#rName', '設定測試');
  await page.click('#attendRow .choice[data-val="no"]');
  await page.click('#relationRow .choice[data-val="other"]');
  await page.fill('#rEmail', 'setting@example.com');
  await page.click('#cardRow .choice[data-val="none"]');
  await page.click('#submitBtn');
  await page.waitForSelector('#thanksCard:visible', { timeout:8000 });

  const snap = await adb.collection('sites').doc(siteIds[SLUG]).collection('rsvps').get();
  const row = snap.docs.map((d) => d.data()).find((d) => d.name === '設定測試');
  ok('關掉題目後仍然送得出去', !!row);
  ok('關掉的題目存成空字串',
    row && row.giftDelivery === '' && row.message === '',
    row ? `${JSON.stringify(row.giftDelivery)}/${JSON.stringify(row.message)}` : '');
  ok('Email 有存下來', row && row.contactEmail === 'setting@example.com',
    row && row.contactEmail);
  await page.close();
}
{
  /* 改回全開，後面的測試才不受影響 */
  await adb.collection('sites').doc(siteIds[SLUG]).update({
    rsvpAskCard: true, rsvpAskGift: true, rsvpAskMessage: true,
    rsvpShowStory: true, rsvpShowGallery: true,
    rsvpContactMethods: ['phone', 'line', 'email'],
  });
}

/* ---------- 賓客標籤 ---------- */
console.log('\n[14d] 後台賓客標籤');
{
  const tagCol = adb.collection('sites').doc(siteIds[SLUG]).collection('rsvpTags');
  const siteRef = adb.collection('sites').doc(siteIds[SLUG]);
  const readTags = async () => ((await siteRef.get()).data().guestTags || []);

  const { page, errors } = await visit(`/w/${SLUG}/admin`);
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });
  await page.click('.ad-subtabs[data-subtabs="rsvp"] .ad-subtab[data-subtab="form"]');
  await page.waitForTimeout(300);
  ok('題目清單多了標籤那一題', await page.isVisible('#adAskTagRow'));

  /* 標籤設定自己一個橫向子分頁 */
  ok('看得到「設定賓客標籤」子分頁', await page.isVisible('#adTagSubtab'));
  await page.click('.ad-subtabs[data-subtabs="rsvp"] .ad-subtab[data-subtab="tags"]');
  await page.waitForTimeout(300);
  ok('標籤區塊看得到', await page.isVisible('#adTagSec'));
  const names = await page.$$eval('#adTagList .ad-tagrow-name', (els) => els.map((e) => e.value));
  ok('列出目前的標籤', names.join('／') === '大學同學／VIP', names.join('／'));

  /* 一鍵帶入常用標籤：已經有的不重複加 */
  await page.click('#adTagPresetBtn');
  await page.waitForTimeout(1200);
  const preset = await readTags();
  ok('常用標籤只補沒有的那幾個', preset.length === 8, `${preset.length} 個`);
  ok('常用標籤的表單選項預設值正確',
    preset.filter((t) => t.onForm).map((t) => t.name).join('／') === '大學同學／公司同事／教會朋友／親戚',
    preset.filter((t) => t.onForm).map((t) => t.name).join('／'));

  /* 自訂標籤：走輸入視窗 */
  await page.click('#adTagAddBtn');
  await page.waitForSelector('#adModalMask:not([hidden])', { timeout:5000 });
  await page.fill('#adModalPhrase', '伴娘團');
  await page.click('#adModalConfirm');
  await page.waitForTimeout(1200);
  const added = await readTags();
  ok('新人加得了自訂標籤',
    added.length === 9 && added.some((t) => t.name === '伴娘團'), `${added.length} 個`);

  /* 改名與「當表單選項」都是離開欄位就存 */
  await page.fill('#adTagList .ad-tagrow:last-child .ad-tagrow-name', '伴娘伴郎');
  await page.locator('#adTagList .ad-tagrow:last-child .ad-tagrow-onform').check();
  await page.waitForTimeout(1200);
  const renamed = (await readTags()).find((t) => t.id === added[added.length - 1].id);
  ok('改名與表單選項都存得回去',
    renamed && renamed.name === '伴娘伴郎' && renamed.onForm === true,
    JSON.stringify(renamed));

  /* 名單：標籤篩選 */
  await page.click('.ad-subtabs[data-subtabs="rsvp"] .ad-subtab[data-subtab="replies"]');
  await page.waitForTimeout(400);
  ok('名單上看得到標籤篩選', await page.isVisible('#adRsvpTagChips'));
  ok('王小明身上有自己選的標籤',
    (await page.innerText('#adRsvpList')).includes('大學同學'));

  await page.click('#adRsvpTagChips .ad-chip[data-tag="tag-college"]');
  await page.waitForTimeout(300);
  ok('篩得出某個標籤的賓客',
    (await page.innerText('#adRsvpList')).includes('王小明'));
  await page.click('#adRsvpTagChips .ad-chip[data-tag="none"]');
  await page.waitForTimeout(300);
  ok('「沒有標籤」篩掉已經有標籤的人',
    !(await page.innerText('#adRsvpList')).includes('王小明'));
  await page.click('#adRsvpTagChips .ad-chip[data-tag="all"]');
  await page.waitForTimeout(300);

  /* chips 最後一顆是出口，不是篩選條件 */
  const lastChip = page.locator('#adRsvpTagChips .ad-chip').last();
  ok('標籤 chips 最後一顆是「設定標籤 ↗」',
    (await lastChip.innerText()).includes('設定標籤')
      && (await lastChip.innerText()).includes('↗'),
    await lastChip.innerText());
  await lastChip.click();
  await page.waitForTimeout(300);
  ok('「設定標籤 ↗」跳到設定賓客標籤那一頁',
    page.url().endsWith('#rsvp/tags'), page.url());
  await page.click('.ad-subtabs[data-subtabs="rsvp"] .ad-subtab[data-subtab="replies"]');
  await page.waitForTimeout(300);

  /* 幫賓客加掛標籤（賓客自己選的那個關不掉） */
  const row = page.locator('#adRsvpList tbody tr', { hasText:'王小明' }).first();
  await row.locator('[data-tag-edit]').click();
  await page.waitForSelector('#adTagPickMask:not([hidden])', { timeout:5000 });
  ok('賓客自己選的標籤在彈窗裡關不掉',
    await page.isDisabled('#adTagPickList input[value="tag-college"]'));
  await page.check('#adTagPickList input[value="tag-vip"]');
  await page.click('#adTagPickSave');
  await page.waitForTimeout(1500);

  const tagDocs = (await tagCol.get()).docs.map((d) => d.data());
  ok('新人掛的標籤寫進 rsvpTags',
    tagDocs.length === 1 && tagDocs[0].tags.join(',') === 'tag-vip',
    JSON.stringify(tagDocs));
  ok('名單上一起顯示兩個標籤',
    (await page.innerText('#adRsvpList')).includes('VIP'));

  /* 匯出的 CSV 也要有標籤欄 */
  ok('回覆沒有被改動（rsvps 仍然只有賓客送出的內容）',
    (await adb.collection('sites').doc(siteIds[SLUG]).collection('rsvps').get())
      .docs.every((d) => !('tags' in d.data())));

  /* 刪掉標籤：連掛在賓客身上的那一份一起拿掉 */
  await page.click('.ad-subtabs[data-subtabs="rsvp"] .ad-subtab[data-subtab="tags"]');
  await page.waitForTimeout(300);
  const vipRow = page.locator('#adTagList .ad-tagrow[data-id="tag-vip"]');
  ok('標籤列出用了幾次', (await vipRow.innerText()).includes('1 位'), await vipRow.innerText());
  await vipRow.locator('.ad-del').click();
  await page.waitForSelector('#adModalMask:not([hidden])', { timeout:5000 });
  await page.click('#adModalConfirm');
  await page.waitForTimeout(1800);

  const afterDel = await readTags();
  ok('標籤刪得掉',
    afterDel.length === 8 && !afterDel.some((t) => t.name === 'VIP'), `${afterDel.length} 個`);
  const leftovers = (await tagCol.get()).docs.flatMap((d) => d.data().tags || []);
  ok('賓客身上的那個標籤也跟著拿掉',
    !leftovers.includes('tag-vip'), leftovers.join(','));

  ok('標籤無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}
{
  /* 沒開這個功能的站台：後台不出現標籤，賓客表單也沒有那一題 */
  const { page } = await visit('/w/minimal-site-2027/admin');
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });
  await page.click('.ad-subtabs[data-subtabs="rsvp"] .ad-subtab[data-subtab="form"]');
  await page.waitForTimeout(300);
  ok('沒開標籤功能的站台看不到標籤設定', !(await page.isVisible('#adTagSec')));
  ok('沒開標籤功能的站台也沒有標籤子分頁', !(await page.isVisible('#adTagSubtab')));
  ok('沒開標籤功能的站台也沒有標籤那一題', !(await page.isVisible('#adAskTagRow')));
  await page.close();

  const guest = await visit('/w/minimal-site-2027/invitation');
  await guest.page.waitForFunction(
    () => !!document.getElementById('rsvpForm'), null, { timeout:20000 });
  ok('沒開標籤功能時賓客也看不到那一題',
    (await guest.page.locator('#tagRow').count()) === 0);
  await guest.page.close();
}

/* ---------- 後台感謝信 ---------- */
console.log('\n[14e] 後台感謝信（通用信／指定信）');
{
  const site = adb.collection('sites').doc(siteIds[SLUG]);
  await site.collection('blessings').doc('b3').set({
    terms:[], title:'給遠道而來的朋友',
    body:'謝謝你跑這麼遠，這一路辛苦了。',
    sign:'Ginny & One', isDefault:true, time: Date.now(),
  });

  const { page, errors } = await visit(`/w/${SLUG}/admin`);
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });
  await page.click('.ad-tab[data-tab="letters"]');
  await page.waitForFunction(
    () => document.querySelectorAll('#adLetterList .ad-letter-card').length >= 3,
    null, { timeout:10000 });

  const chipText = await page.innerText('#adLetterChips');
  ok('chip 上帶著各自的封數',
    chipText.includes('全部（3）') && chipText.includes('通用信（2）')
      && chipText.includes('指定信（1）'),
    chipText.replace(/\n/g, ' '));

  await page.click('#adLetterChips [data-letter-kind="default"]');
  await page.waitForTimeout(300);
  const defs = await page.innerText('#adLetterList');
  ok('「通用信」只列通用信',
    defs.includes('給每一位朋友') && defs.includes('給遠道而來的朋友')
      && !defs.includes('給小明的一封信'),
    defs.replace(/\n/g, ' ').slice(0, 80));

  await page.click('#adLetterChips [data-letter-kind="personal"]');
  await page.waitForTimeout(300);
  const pers = await page.innerText('#adLetterList');
  ok('「指定信」只列有專屬詞彙的信',
    pers.includes('給小明的一封信') && !pers.includes('給每一位朋友'),
    pers.replace(/\n/g, ' ').slice(0, 80));

  /* 每一列都標得出自己是哪一種 */
  ok('指定信這一列標成「指定信」', pers.includes('指定信'), pers.replace(/\n/g, ' ').slice(0, 60));

  /* 再寫一封通用信：新人可以有好幾封 */
  await page.click('#adLetterChips [data-letter-kind="all"]');
  await page.click('#adLetterAddBtn');
  await page.waitForSelector('#adLetterModalMask:not([hidden])', { timeout:5000 });
  await page.fill('#adLetterTitle', '給臨時趕來的你');
  await page.fill('#adLetterBody', '不管你幾點到，我們都很開心。');
  await page.check('#adLetterDefault');
  await page.click('#adLetterForm button[type="submit"]');
  await page.waitForSelector('#adLetterModalMask', { state:'hidden', timeout:8000 });
  await page.waitForTimeout(1200);

  const saved = (await site.collection('blessings').get()).docs
    .map((d) => d.data()).filter((b) => b.isDefault === true);
  ok('通用信存得了第三封（沒有專屬詞彙也過得了驗證）',
    saved.length === 3, `${saved.length} 封`);

  ok('後台感謝信無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();

  /* 收乾淨，後面的測試還用得到原本那兩封 */
  const extra = (await site.collection('blessings').get()).docs
    .filter((d) => !['b1', 'b2'].includes(d.id));
  await Promise.all(extra.map((d) => d.ref.delete()));
}

/* ---------- 手機版 ---------- */
console.log('\n[8] 手機版無水平捲動');
for(const key of ['', 'wall', 'invitation', 'quiz', 'seating', 'letter', 'exhibition']){
  const page = await newPage({ viewport:{ width:375, height:812 } });
  await page.goto(`${BASE}/w/${SLUG}/${key}`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(
    () => document.documentElement.dataset.siteReady === '1'
       || !!document.querySelector('[data-fatal]'),
    null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`/${key || 'lobby'} 無水平捲動`, overflow <= 1, `溢出 ${overflow}px`);
  await page.close();
}

/* ---------- 排桌管理 ---------- */
console.log('\n[21] 後台排桌管理');
{
  const siteId = siteIds[SLUG];
  const rsvpCol = adb.collection('sites').doc(siteId).collection('rsvps');

  /* 三位排桌用的賓客：人數刻意不同，容量才驗得出「算人不算筆」 */
  const base = {
    attending:true, tentative:false, dietaryNote:'', message:'', note:'',
    createdAt: TS.now(),
  };
  await rsvpCol.doc('plan-a').set({ ...base, name:'排桌小明', guestCount:2, relation:'bride' });
  await rsvpCol.doc('plan-b').set({ ...base, name:'排桌小美', guestCount:3, relation:'bride' });
  await rsvpCol.doc('plan-c').set({ ...base, name:'排桌大同', guestCount:1, relation:'groom' });

  const { page, errors } = await visit(`/w/${SLUG}/admin`);
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });

  ok('側欄看得到「排桌管理」',
    await page.isVisible('.ad-tab[data-tab="seatingPlan"]'));

  await page.click('.ad-tab[data-tab="seatingPlan"]');
  await page.waitForFunction(
    () => document.querySelector('.ad-tab.is-on')?.dataset.tab === 'seatingPlan',
    null, { timeout:5000 });
  ok('網址帶到第一個子分頁', page.url().endsWith('#seatingPlan/board'), page.url());

  /* ---- 桌位管理：新增兩桌 ---- */
  await page.click('.ad-subtabs[data-subtabs="seatingPlan"] .ad-subtab[data-subtab="tables"]');
  const addTable = async (name, cap) => {
    await page.click('#spTableAddBtn');
    await page.waitForSelector('#spTableModalMask:not([hidden])', { timeout:5000 });
    await page.fill('#spTableName', name);
    await page.fill('#spTableCap', String(cap));
    await page.click('#spTableForm button[type="submit"]');
    await page.waitForSelector('#spTableModalMask', { state:'hidden', timeout:5000 });
  };
  await addTable('主桌', 10);
  await addTable('女方親友', 2);

  const tableTitles = await page.$$eval('#spTableList .ad-item-title', (els) =>
    els.map((e) => e.textContent.trim()));
  ok('桌號補成兩位數且接著編號',
    tableTitles.join('／') === '01｜主桌／02｜女方親友', tableTitles.join('／'));

  /* ---- 工作區：未安排區看得到賓客 ---- */
  await page.click('.ad-subtabs[data-subtabs="seatingPlan"] .ad-subtab[data-subtab="board"]');
  await page.waitForTimeout(400);
  const poolText = await page.innerText('#spPoolBody');
  ok('未安排區列出賓客', poolText.includes('排桌小明') && poolText.includes('排桌小美'),
    poolText.replace(/\n/g, ' ').slice(0, 60));
  ok('自動編號有給到（女方是 B 開頭）', /B\d\d/.test(poolText), poolText.slice(0, 40));

  /* ---- 用「移動到桌位」把人放進第 01 桌（手機也是走這條路） ---- */
  /* 卡片只剩兩行，「移動到桌位」在滑過去才出現的完整樣貌（peek）裡 */
  const moveGuest = async (name, tableLabel) => {
    await page.hover(`.sp-card:has-text("${name}")`);
    await page.waitForSelector('#spPeek:not([hidden])', { timeout:5000 });
    await page.click('#spPeek [data-peek="move"]');
    await page.waitForSelector('#spMoveMask:not([hidden])', { timeout:5000 });
    await page.click(`.sp-move-item:has-text("${tableLabel}")`);
    await page.waitForSelector('#spMoveMask', { state:'hidden', timeout:5000 });
  };
  await moveGuest('排桌小明', '01｜主桌');
  await page.waitForTimeout(200);

  const tableCard = (no) => `.sp-table:has(.sp-table-no:text-is("${no}"))`;
  const t1 = await page.innerText(tableCard('01'));
  ok('桌位以「人數」計算容量（2 人）', t1.includes('2 / 10 人'), t1.replace(/\n/g, ' ').slice(0, 60));
  ok('顯示剩餘座位', t1.includes('剩餘 8 位'), t1.replace(/\n/g, ' ').slice(0, 60));

  /* ---- 超過容量：3 人排進容量 2 的桌子，提醒但不擋 ---- */
  await moveGuest('排桌小美', '02｜女方親友');
  await page.waitForTimeout(200);
  const t2 = await page.innerText(tableCard('02'));
  ok('超過容量仍然排得進去', t2.includes('3 / 2 人'), t2.replace(/\n/g, ' ').slice(0, 60));
  ok('超過容量有明確提醒', t2.includes('超過容量 1 位'), t2.replace(/\n/g, ' ').slice(0, 60));
  /* 提醒預設只露出前幾條，先展開再看 */
  if (await page.locator('#spWarnToggle').count()) await page.click('#spWarnToggle');
  await page.waitForTimeout(200);
  ok('上方警告列也講一次',
    (await page.innerText('#spWarns')).includes('第 02 桌超過容量 1 位'),
    (await page.innerText('#spWarns')).replace(/\n/g, ' ').slice(0, 80));

  /* ---- 復原 ---- */
  await page.click('#spUndo');
  await page.waitForTimeout(300);
  ok('復原把小美放回未安排',
    (await page.innerText('#spPoolBody')).includes('排桌小美'));
  await page.click('#spRedo');
  await page.waitForTimeout(300);
  ok('重做又把她排回去',
    (await page.innerText(tableCard('02'))).includes('排桌小美'));

  /* ---- 儲存：存完先問要不要同步，選「稍後再說」 ---- */
  await page.click('#spSaveBtn');
  await page.waitForSelector('#adModalMask:not([hidden])', { timeout:8000 });
  ok('存完會先問要不要同步',
    (await page.textContent('#adModalTitle')).includes('排桌已儲存'),
    await page.textContent('#adModalTitle'));
  await page.click('#adModalCancel');
  await page.waitForTimeout(600);

  const draft = (await adb.collection('sites').doc(siteId)
    .collection('seatingPlan').doc('draft').get()).data();
  ok('排桌草稿寫進 seatingPlan/draft', !!draft);
  ok('草稿裡有兩桌', draft && draft.tables.length === 2, draft && String(draft.tables.length));
  ok('草稿記下了排桌關係',
    draft && Object.keys(draft.assign).length === 2,
    draft && JSON.stringify(draft.assign));

  /* 沒按同步 → 前台的桌次名單不該被動到 */
  const before = await adb.collection('sites').doc(siteId).collection('seating').get();
  ok('沒同步就不會動到賓客的桌次查詢',
    before.docs.every((d) => !String(d.data().name).startsWith('排桌')),
    `${before.size} 筆`);
  ok('狀態顯示還沒送出',
    (await page.textContent('#spSyncState')).includes('還沒送出'),
    await page.textContent('#spSyncState'));

  /* ---- 同步 ---- */
  await page.click('#spSyncBtn');
  await page.waitForSelector('#adModalMask:not([hidden])', { timeout:8000 });
  await page.click('#adModalConfirm');
  await page.waitForTimeout(1500);

  const after = await adb.collection('sites').doc(siteId).collection('seating').get();
  const rows = after.docs.map((d) => d.data());
  ok('同步後桌次查詢讀得到排好的位子',
    rows.some((r) => r.name === '排桌小明' && r.table === '01｜主桌'),
    JSON.stringify(rows.slice(0, 2)));
  ok('同步是整份換掉（舊名單不會殘留）',
    !rows.some((r) => r.name === '王小明' && r.table === '第 3 桌'),
    `${rows.length} 筆`);
  ok('狀態變成已送出',
    (await page.textContent('#spSyncState')).includes('已送出'),
    await page.textContent('#spSyncState'));

  /* ---- 從出席表單匯入：講清楚現在接進來的是誰 ---- */
  await page.click('.ad-subtabs[data-subtabs="seatingPlan"] .ad-subtab[data-subtab="io"]');
  await page.waitForTimeout(300);
  await page.click('#spImportRsvpBtn');
  await page.waitForSelector('#spRsvpImportMask:not([hidden])', { timeout:5000 });
  const rsvpImportText = await page.innerText('#spRsvpImportBody');
  ok('從出席表單匯入列出回覆筆數',
    rsvpImportText.includes('3') && rsvpImportText.includes('出席回覆'),
    rsvpImportText.replace(/\n/g, ' ').slice(0, 80));
  ok('從出席表單匯入列出賓客本人',
    rsvpImportText.includes('排桌小明') && rsvpImportText.includes('排桌大同'),
    rsvpImportText.replace(/\n/g, ' ').slice(0, 80));
  await page.click('#spRsvpImportGo');
  await page.waitForSelector('#spRsvpImportMask', { state:'hidden', timeout:5000 });
  ok('「去排桌工作區」切回工作區', page.url().endsWith('#seatingPlan/board'), page.url());

  /* ---- 匯出：至少要跑得完、拿得到檔案 ---- */
  const dl = await Promise.all([
    page.waitForEvent('download', { timeout:10000 }),
    page.click('.ad-subtabs[data-subtabs="seatingPlan"] .ad-subtab[data-subtab="io"]')
      .then(() => page.click('#spExportXlsx')),
  ]).then(([d]) => d).catch(() => null);
  ok('匯出 Excel 下載得到檔案', !!dl && /^seating-plan-.*\.xlsx$/.test(dl.suggestedFilename()),
    dl ? dl.suggestedFilename() : '(沒有下載)');

  /* ---- 桌次名單那一頁的「同步現在的排桌」 ---- */
  await page.click('.ad-tab[data-tab="seating"]');
  await page.click('.ad-subtabs[data-subtabs="seating"] .ad-subtab[data-subtab="list"]');
  await page.waitForTimeout(400);
  ok('桌次名單看得到「同步現在的排桌」', await page.isVisible('#adSeatSyncPlan'));

  /* 先把名單清成別的內容，才驗得出這一顆真的把排桌搬過來 */
  await adb.collection('sites').doc(siteId).collection('seating').doc('probe')
    .set({ name:'名單探針', table:'第 9 桌', note:'', time: Date.now() });
  await page.waitForTimeout(800);

  await page.click('#adSeatSyncPlan');
  await page.waitForSelector('#adModalMask:not([hidden])', { timeout:8000 });
  await page.click('#adModalConfirm');
  await page.waitForTimeout(2000);

  const synced = (await adb.collection('sites').doc(siteId).collection('seating').get())
    .docs.map((d) => d.data());
  ok('桌次名單這一顆也同步得到排桌結果',
    synced.some((r) => r.name === '排桌小明' && r.table === '01｜主桌'),
    JSON.stringify(synced.slice(0, 2)));
  ok('同步是整份換掉，探針被清掉',
    !synced.some((r) => r.name === '名單探針'), `${synced.length} 筆`);

  /* ---- 刪掉一筆回覆之後，其他人的編號不會跟著往前挪 ---- */
  await page.click('.ad-tab[data-tab="seatingPlan"]');
  await page.click('.ad-subtabs[data-subtabs="seatingPlan"] .ad-subtab[data-subtab="board"]');
  await page.waitForTimeout(500);

  /* 未安排區已經空了（三位都排進桌位），所以直接從桌上的卡片讀編號 */
  const codeOfCard = (name) => page.evaluate((n) => {
    const card = Array.from(document.querySelectorAll('.sp-card'))
      .find((el) => el.querySelector('.sp-card-name')?.textContent.trim() === n);
    return card ? card.querySelector('.sp-card-code').textContent.trim() : '';
  }, name);

  const codeMing = await codeOfCard('排桌小明');
  const codeMei  = await codeOfCard('排桌小美');
  ok('兩位女方賓客拿到連號的 B 編號',
    /^B\d\d$/.test(codeMing) && /^B\d\d$/.test(codeMei) && codeMing !== codeMei,
    `${codeMing} / ${codeMei}`);

  /* 從「回覆資訊」把前面那一位刪掉 */
  await page.click('.ad-tab[data-tab="rsvp"]');
  await page.click('.ad-subtabs[data-subtabs="rsvp"] .ad-subtab[data-subtab="replies"]');
  await page.waitForTimeout(400);
  await page.fill('#adRsvpFilter', '排桌小明');
  await page.waitForTimeout(400);
  /* 刪除收在「⋯」裡（危險的動作排最後、用危險色） */
  await page.locator('#adRsvpList tbody tr', { hasText:'排桌小明' }).first()
    .locator('.ad-rowmenu-btn').click();
  await page.waitForSelector('.ad-rowmenu:not([hidden])', { timeout:5000 });
  await page.click('.ad-rowmenu .ad-rowmenu-item.is-danger');
  await page.waitForSelector('#adModalMask:not([hidden])', { timeout:5000 });
  await page.click('#adModalConfirm');
  await page.waitForTimeout(300);
  await page.fill('#adModalPhrase', '刪除');
  await page.click('#adModalConfirm');
  await page.waitForTimeout(2500);
  await page.fill('#adRsvpFilter', '');

  await page.click('.ad-tab[data-tab="seatingPlan"]');
  await page.waitForTimeout(600);
  ok('刪掉一筆之後，其他人的編號原地不動',
    (await codeOfCard('排桌小美')) === codeMei,
    `${await codeOfCard('排桌小美')}（原本 ${codeMei}）`);

  /* 新的回覆接在最大號後面，不會把空出來的號碼撿回去用 */
  await rsvpCol.doc('plan-d').set({
    ...base, name:'排桌新來', guestCount:1, relation:'bride', createdAt: TS.now(),
  });
  await page.waitForTimeout(1800);
  const codeNew = await codeOfCard('排桌新來');
  ok('新回覆不會撿走剛剛空出來的號碼',
    /^B\d\d$/.test(codeNew) && codeNew !== codeMing,
    `${codeNew}（空出來的是 ${codeMing}）`);
  ok('新回覆的號碼比現有的都大',
    Number(codeNew.slice(1)) > Number(codeMei.slice(1)),
    `${codeNew} vs ${codeMei}`);

  ok('排桌管理分頁無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}
{
  /* 沒開這個開關的站台，「排桌管理」是鎖著的（進階方案）：
     按鈕還在、掛著鎖頭，點進去只有那張說明卡，工作區進不去 */
  const { page } = await visit('/w/minimal-site-2027/admin');
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });
  ok('沒開 seatingPlan 的站台，排桌管理是鎖著的',
    await page.evaluate(() => {
      const b = document.querySelector('.ad-tab[data-tab="seatingPlan"]');
      return !b.hidden && b.classList.contains('is-locked')
          && !!b.querySelector('.ad-ic-lock');
    }));
  ok('鎖著的排桌管理進不去工作區',
    await page.evaluate(() => {
      const p = document.querySelector('.ad-panel[data-panel="seatingPlan"]');
      return !!p.querySelector(':scope > .ad-lock-cover')
          && Array.from(p.children)
               .filter((el) => !el.classList.contains('ad-lock-cover'))
               .every((el) => el.inert);
    }));
  await page.close();
}

{
  /* 手機上側欄選單收成抽屜，不能把整頁撐寬；漢堡按鈕要點得開、選得到分頁。
     hasTouch/isMobile 要開著 —— 後台有一整批規則是靠
     `@media (pointer:coarse)` / `(hover:none)` 判斷的，
     不開的話 Playwright 會被當成有滑鼠的桌機，那幾條全部量不到。 */
  const page = await newPage({
    viewport:{ width:375, height:812 }, hasTouch:true, isMobile:true,
  });
  await page.goto(`${BASE}/w/${SLUG}/admin`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(
    () => document.documentElement.dataset.siteReady === '1', null, { timeout:20000 });
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('/admin 無水平捲動', overflow <= 1, `溢出 ${overflow}px`);

  ok('漢堡按鈕在手機上看得到', await page.isVisible('#adMenuBtn'));
  await page.click('#adMenuBtn');
  await page.waitForSelector('#adSide.is-open', { timeout:5000 });
  await page.click('.ad-tab[data-tab="seating"]');
  await page.waitForFunction(
    () => document.querySelector('.ad-tab.is-on')?.dataset.tab === 'seating', null, { timeout:5000 });
  ok('點分頁後抽屜會自動收起來',
    await page.evaluate(() => !document.getElementById('adSide').classList.contains('is-open')));
  /* 桌次分頁底下有子分頁（桌次圖／桌次搜尋及名單），網址會帶到第一個子分頁 */
  ok('網址跟著切到 #seating/map', page.url().endsWith('#seating/map'), page.url());

  /* ---------- 以下是「後台在手機上真的用得完」的那幾條 ---------- */

  /* iOS Safari 只要聚焦字級 <16px 的欄位就會把整頁放大。
     全站所有可輸入元件都必須 >= 16px，這是阻斷級的規則。 */
  const smallFields = await page.$$eval(
    '#adPage input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])'
    + ':not([type="file"]):not([type="range"]), #adPage textarea, #adPage select',
    (els) => els
      .filter((el) => el.offsetParent !== null || el.closest('.ad-panel'))
      .map((el) => [el.id || el.className, parseFloat(getComputedStyle(el).fontSize)])
      .filter(([, size]) => size < 16));
  ok('所有輸入欄位都 >= 16px（iOS 才不會自動放大整頁）',
    smallFields.length === 0,
    smallFields.slice(0, 4).map((f) => f.join(':')).join('｜') || '全部合格');

  /* 抽屜的不透明底色會蓋住漢堡鈕，手機也沒有 Esc —— 抽屜自己要有出口 */
  await page.click('#adMenuBtn');
  await page.waitForSelector('#adSide.is-open', { timeout:5000 });
  ok('抽屜裡有自己的關閉鈕', await page.isVisible('#adSideClose'));
  ok('抽屜開著時背景鎖住不捲',
    await page.evaluate(() => document.body.classList.contains('ad-lock')));
  await page.click('#adSideClose');
  await page.waitForTimeout(300);
  ok('關掉之後背景解鎖',
    await page.evaluate(() => !document.body.classList.contains('ad-lock')));

  /* 返回鍵＝關掉最上面那一層，不是離開後台 */
  await page.click('#adMenuBtn');
  await page.waitForSelector('#adSide.is-open', { timeout:5000 });
  await page.goBack();
  await page.waitForTimeout(300);
  ok('按返回鍵關掉抽屜、留在後台',
    await page.evaluate(() => !document.getElementById('adSide').classList.contains('is-open'))
      && page.url().includes('/admin'),
    page.url());

  /* 16 欄的表格在 390px 上要左右滑三四個螢幕，手機一律換成卡片 */
  await page.evaluate(() => { location.hash = 'rsvp/replies'; });
  await page.waitForTimeout(700);
  ok('回覆名單在手機是卡片不是表格',
    await page.evaluate(() => !!document.querySelector('#adRsvpList .ad-rcards')
      && !document.querySelector('#adRsvpList table')));
  const rcard = page.locator('#adRsvpList .ad-rcard').first();
  ok('卡片第一行是姓名 ＋ 出席狀態',
    await rcard.locator('.ad-rcard-name').count() === 1
      && await rcard.locator('.ad-tag').count() >= 1);
  ok('其餘欄位收在「展開更多」裡',
    await rcard.locator('.ad-rcard-rest[hidden]').count() === 1);
  await rcard.locator('[data-rcard-more]').click();
  await page.waitForTimeout(200);
  ok('點「展開更多」才攤開',
    await rcard.locator('.ad-rcard-rest:not([hidden])').count() === 1);

  /* 篩選條件會捲出畫面，所以要有一條跟著名單走的彙總 */
  await page.fill('#adRsvpFilter', '王');
  await page.waitForTimeout(400);
  ok('篩選時出現彙總那一條',
    await page.isVisible('#adRsvpFilterSum')
      && (await page.textContent('#adRsvpFilterSumText')).includes('搜尋'),
    await page.textContent('#adRsvpFilterSumText'));
  await page.click('#adRsvpFilterClear');
  await page.waitForTimeout(400);
  ok('「清除」把篩選條件全部歸零',
    (await page.inputValue('#adRsvpFilter')) === ''
      && !(await page.isVisible('#adRsvpFilterSum')));

  /* 觸控目標：文字按鈕視覺不變，靠 padding 撐到 44px */
  const smallHits = await page.$$eval(
    '.ad-panel.is-on .ad-edit:not([hidden]), .ad-panel.is-on .ad-rowmenu-btn',
    (els) => els.filter((el) => el.offsetParent !== null)
      .map((el) => [el.textContent.trim().slice(0, 6), Math.round(el.getBoundingClientRect().height)])
      .filter(([, h]) => h > 0 && h < 44));
  ok('行內動作的熱區至少 44px',
    smallHits.length === 0,
    smallHits.slice(0, 4).map((h) => h.join(':')).join('｜') || '全部合格');

  /* 長表單的儲存要浮在底部，不用捲五六個螢幕 */
  await page.evaluate(() => { location.hash = 'lobby/info'; });
  await page.waitForTimeout(600);
  ok('婚禮資訊的儲存列是 sticky',
    await page.$eval('#adSiteForm .ad-savebar',
      (el) => getComputedStyle(el).position === 'sticky'));
  await page.fill('#adDressCode', '正式服裝');
  await page.waitForTimeout(200);
  ok('改了東西就說「有還沒儲存的變更」',
    (await page.textContent('#adSiteDirty')).includes('有還沒儲存'),
    await page.textContent('#adSiteDirty'));
  await page.click('#adSiteReset');
  await page.waitForTimeout(200);

  /* 排桌工作區：儲存不能每次都要捲回最上面 */
  await page.evaluate(() => { location.hash = 'seatingPlan/board'; });
  await page.waitForTimeout(900);
  ok('排桌在手機有固定底列', await page.isVisible('#spMobileBar'));
  ok('底列上就是「儲存排桌」',
    (await page.textContent('#spMbSave')).includes('儲存排桌'));
  ok('toast 會讓開底列',
    await page.evaluate(() => document.body.dataset.stickybar === '1'));
  await page.click('#spMbMore');
  await page.waitForSelector('#spMoreMask:not([hidden])', { timeout:5000 });
  ok('「⋮ 更多」裡有送出、復原、重做與統計',
    await page.isVisible('#spMbSync') && await page.isVisible('#spMbUndo')
      && await page.$eval('#spMoreStats', (el) => el.children.length === 4));
  await page.click('#spMoreClose');
  await page.waitForTimeout(300);

  /* 離線時要看得到，而且不擋操作 */
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { value:false, configurable:true });
    window.dispatchEvent(new Event('offline'));
  });
  await page.waitForTimeout(200);
  ok('斷線時壓一條離線橫幅', await page.isVisible('#adOffline'));
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { value:true, configurable:true });
    window.dispatchEvent(new Event('online'));
  });
  await page.waitForTimeout(200);
  ok('連線回來橫幅就收掉', !(await page.isVisible('#adOffline')));

  await page.close();
}

await browser.close();
console.log(failures ? `\n有 ${failures} 項未通過。` : '\n全部通過。');
process.exitCode = failures ? 1 : 0;
