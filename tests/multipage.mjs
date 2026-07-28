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

const ALL_PAGES = ['info','rsvp','wall','cake','draw','exhibition','quiz','inbox','invitation'];
const allOn = Object.fromEntries(ALL_PAGES.map((k) => [k, true]));

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
    pages: allOn,
    ownerEmails:['couple@example.com'],
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
  'minimal-site-2027': {
    groomName:'小明', brideName:'小美',
    themeColor:'#B5838D',
    venueName:'圓山大飯店', venueAddress:'台北市士林區中山北路四段1號',
    story:'', dressCode:'', giftNote:'', hashtags:[],
    pages: Object.fromEntries(ALL_PAGES.map((k) => [k, k === 'info'])),
    ownerEmails:[],
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

const siteIds = await seed();
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
          JSON.stringify({ name:'測試賓客', icon:'🎀' }));
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

const SLUG = 'ginny-one-20260919';
/* 素材測試用的站台，slug 對應 public/assets/demo-wedding-2027/ */
const ASSET_SLUG = 'demo-wedding-2027';

/* ---------- 每一頁都要載得起來 ---------- */
console.log('\n[1] 每個頁面都能正常載入');
for(const key of ['', 'info', 'rsvp', 'wall', 'cake', 'draw', 'exhibition', 'quiz', 'inbox']){
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
  const { page } = await visit(`/w/${SLUG}/info`);
  const text = await page.innerText('body');
  ok('婚禮資訊頁顯示新人與場地',
    text.includes('Ginny & One') && text.includes('台北國賓大飯店'),
    text.slice(0, 80).replace(/\n/g, ' '));
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
  ok('未啟用的入口不出現在大廳',
    !links.some((h) => /\/(wall|cake|draw|exhibition|quiz|inbox|rsvp)$/.test(h)),
    links.join(', '));
  ok('已啟用的 info 入口仍在', links.some((h) => h.endsWith('/info')), links.join(', '));
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

/* ---------- 資料寫入正確的子集合 ---------- */
console.log('\n[4] 祝福牆寫入隔離');
{
  const { page, errors } = await visit(`/w/${SLUG}/wall`);
  await page.evaluate(() => DataStore.addWish({ name:'測試賓客', icon:'🎀', text:'祝你們幸福！' }));
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

/* ---------- RSVP ---------- */
console.log('\n[5] RSVP 寫入');
{
  const { page } = await visit(`/w/${SLUG}/rsvp`);
  await page.fill('#rName', '王小明');
  await page.click('#attendRow .choice[data-val="yes"]');
  await page.click('#mealRow .choice[data-val="veg"]');
  await page.click('#plusBtn');
  await page.fill('#rNote', '恭喜！');
  await page.click('#submitBtn');
  await page.waitForTimeout(2500);

  const snap = await adb.collection('sites').doc(siteIds[SLUG]).collection('rsvps').get();
  ok('RSVP 有寫入', snap.size === 1, `${snap.size} 筆`);
  if(snap.size){
    const d = snap.docs[0].data();
    ok('attending 是 boolean', d.attending === true, String(d.attending));
    ok('guestCount 正確', d.guestCount === 2, String(d.guestCount));
    ok('meal 保留', d.meal === 'veg', d.meal);
    ok('tentative 為 false', d.tentative === false, String(d.tentative));
    ok('createdAt 由伺服器寫入', d.createdAt && typeof d.createdAt.toDate === 'function');
  }
  await page.close();
}

/* ---------- 未定（maybe）也要能存 ---------- */
console.log('\n[6] 未定回覆');
{
  const { page } = await visit(`/w/${SLUG}/rsvp`);
  await page.evaluate(() => LS.remove('rsvp.mine'));
  await page.fill('#rName', '張三');
  await page.click('#attendRow .choice[data-val="maybe"]');
  await page.click('#submitBtn');
  await page.waitForTimeout(2500);

  const snap = await adb.collection('sites').doc(siteIds[SLUG]).collection('rsvps').get();
  const maybe = snap.docs.map((d) => d.data()).find((d) => d.name === '張三');
  ok('未定回覆有寫入', !!maybe);
  ok('未定 → attending false + tentative true',
    maybe && maybe.attending === false && maybe.tentative === true,
    maybe ? `${maybe.attending}/${maybe.tentative}` : '');
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
  /* 沒放素材的站台要沿用預設，不能整個空掉 */
  const { page } = await visit('/w/minimal-site-2027/');
  const assets = await page.evaluate(() => window.SITE.assets);
  ok('沒有素材資料夾時 assets 為空物件',
    assets && Object.keys(assets).length === 0, JSON.stringify(assets));
  await page.close();
}

/* ---------- 悄悄話信箱：只有新人讀得到 ---------- */
console.log('\n[10] 信箱權限');
{
  /* 賓客寫得進去 */
  const { page } = await visit(`/w/${SLUG}/wall`);
  await page.evaluate(() =>
    DataStore.addLetter({ name:'測試賓客', icon:'💌', text:'偷偷跟你們說…' }));
  await page.waitForTimeout(1500);
  const snap = await adb.collection('sites').doc(siteIds[SLUG]).collection('letters').get();
  ok('賓客寫得進信箱', snap.size === 1, `${snap.size} 筆`);
  await page.close();
}
{
  /* 但賓客讀不到：直接用未登入的前端 SDK 嘗試讀取應該被規則擋下 */
  const { page } = await visit(`/w/${SLUG}/inbox`);
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
  ok('信箱頁面停在登入畫面', await page.isVisible('#pwGate'));
  ok('信件內容沒有出現在畫面上',
    !(await page.innerText('body')).includes('偷偷跟你們說'));
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

/* ---------- 手機版 ---------- */
console.log('\n[8] 手機版無水平捲動');
for(const key of ['', 'info', 'wall', 'rsvp']){
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

await browser.close();
console.log(failures ? `\n有 ${failures} 項未通過。` : '\n全部通過。');
process.exitCode = failures ? 1 : 0;
