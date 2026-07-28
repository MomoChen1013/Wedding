import { chromium } from 'playwright';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5000';

/* 找出環境中可用的 Chromium；找不到就交給 Playwright 的預設路徑 */
function findChromium(){
  if(process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if(root && existsSync(root)){
    const dir = readdirSync(root)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort()
      .pop();
    const bin = dir && `${root}/${dir}/chrome-linux/chrome`;
    if(bin && existsSync(bin)) return bin;
  }
  return undefined;
}

/* ---------- 先把測試資料寫進 emulator ---------- */
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
const { initializeApp: adminInit } = await import('firebase-admin/app');
const { getFirestore: adminFirestore, Timestamp: AdminTimestamp } =
  await import('firebase-admin/firestore');

adminInit({ projectId: process.env.GCLOUD_PROJECT || 'wedding-22b94' });
const adb = adminFirestore();

const DAY = 24 * 3600 * 1000;
const future = (days) => AdminTimestamp.fromMillis(Date.now() + days * DAY);
const past = (days) => AdminTimestamp.fromMillis(Date.now() - days * DAY);

/* 婚禮固定在 Asia/Taipei 的 2027-03-15 12:00 → UTC 2027-03-15T04:00Z */
const TAIPEI_NOON = AdminTimestamp.fromDate(new Date('2027-03-15T04:00:00Z'));
/* 東京 2027-12-20 18:30 → UTC 2027-12-20T09:30Z */
const TOKYO_EVENING = AdminTimestamp.fromDate(new Date('2027-12-20T09:30:00Z'));

const SEED = {
  'chen-lin-0315': {
    slug: 'chen-lin-0315', status: 'published',
    groomName: '陳彥廷', brideName: '林佳蓉',
    eventDate: TAIPEI_NOON, timezone: 'Asia/Taipei',
    venueName: '晶華酒店・三樓宴會廳',
    venueAddress: '台北市中山區中山北路二段39巷3號',
    venueMapUrl: '', themeColor: '#3D9AD1', coverImageUrl: '',
    story: '我們在一場朋友的婚禮上第一次見面，\n那天他把最後一塊蛋糕讓給了我。\n\n七年後，換我們請大家吃蛋糕了。',
    photos: ['/assets/e2e/a.svg', '/assets/e2e/b.svg', '/assets/e2e/c.svg'],
    hashtags: ['#陳林2027', '我們結婚了'],
    dressCode: '溫柔大地色系・香檳金／裸粉／霧綠',
    giftNote: '您願意撥空前來，就是給我們最好的禮物 ♡',
    eventEndDate: AdminTimestamp.fromDate(new Date('2027-03-15T07:00:00Z')),
    rsvpDeadline: future(60), rsvpEnabled: true, ownerEmail: '',
  },
  'wu-yang-1220': {
    slug: 'wu-yang-1220', status: 'published',
    groomName: '吳柏勳', brideName: '楊雅婷',
    eventDate: TOKYO_EVENING, timezone: 'Asia/Tokyo',
    venueName: '目黒雅叙園', venueAddress: '東京都目黒区下目黒1-8-1',
    venueMapUrl: '', themeColor: '#B5838D', coverImageUrl: '', story: '',
    photos: [], hashtags: [], dressCode: '', giftNote: '',
    rsvpDeadline: future(120), rsvpEnabled: true, ownerEmail: '',
  },
  'draft-site-test': {
    slug: 'draft-site-test', status: 'draft',
    groomName: '測', brideName: '試',
    eventDate: TAIPEI_NOON, timezone: 'Asia/Taipei',
    venueName: '', venueAddress: '', venueMapUrl: '',
    themeColor: '#3D9AD1', coverImageUrl: '', story: '',
    rsvpDeadline: future(30), rsvpEnabled: true, ownerEmail: '',
  },
  'past-deadline': {
    slug: 'past-deadline', status: 'published',
    groomName: '過期', brideName: '測試',
    eventDate: TAIPEI_NOON, timezone: 'Asia/Taipei',
    venueName: '', venueAddress: '', venueMapUrl: '',
    themeColor: '#3D9AD1', coverImageUrl: '', story: '',
    rsvpDeadline: past(1), rsvpEnabled: true, ownerEmail: '',
  },
  'rsvp-off': {
    slug: 'rsvp-off', status: 'published',
    groomName: '關閉', brideName: '回覆',
    eventDate: TAIPEI_NOON, timezone: 'Asia/Taipei',
    venueName: '', venueAddress: '', venueMapUrl: '',
    themeColor: '#3D9AD1', coverImageUrl: '', story: '',
    rsvpDeadline: future(30), rsvpEnabled: false, ownerEmail: '',
  },
};

async function seed() {
  for (const col of ['sites', 'slugs', 'short']) {
    const snap = await adb.collection(col).get();
    await Promise.all(snap.docs.map((d) => adb.recursiveDelete(d.ref)));
  }
  for (const [slug, data] of Object.entries(SEED)) {
    const ref = adb.collection('sites').doc();
    await ref.set({ ...data, createdAt: AdminTimestamp.now(), updatedAt: AdminTimestamp.now() });
    await adb.collection('slugs').doc(slug).set({ siteId: ref.id, createdAt: AdminTimestamp.now() });
  }
  /* 短連結：一筆正常、一筆帶惡意協定 */
  await adb.collection('short').doc('ab23cd').set({
    target: `${BASE}/w/chen-lin-0315/invitation`, createdAt: AdminTimestamp.now(), hits: 0,
  });
  await adb.collection('short').doc('evil99').set({
    target: 'javascript:alert(1)', createdAt: AdminTimestamp.now(), hits: 0,
  });
}

await seed();
console.log('已寫入測試資料。');

const browser = await chromium.launch({ executablePath: findChromium() });

/* 離線環境下，把 CDN 的 Firebase SDK 與字體換成本機資源，
   讓測試不依賴對外網路（正式頁面仍走 CDN） */
const SDK_DIR = new URL('../node_modules/firebase/', import.meta.url);
const sdk = {
  app: readFileSync(new URL('firebase-app.js', SDK_DIR), 'utf8'),
  firestore: readFileSync(new URL('firebase-firestore.js', SDK_DIR), 'utf8'),
};

async function installOfflineRoutes(page) {
  await page.route('**/firebasejs/**/firebase-app.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: sdk.app }));
  await page.route('**/firebasejs/**/firebase-firestore.js', (route) => {
    /* 把 firestore 內部 import 的 app 版本改成頁面請求的版本，
       否則會載入兩份 firebase-app 實例，導致 "Service firestore is not available" */
    const version = route.request().url().match(/firebasejs\/([^/]+)\//)?.[1];
    const body = sdk.firestore.replace(
      /https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/firebase-app\.js/g,
      `https://www.gstatic.com/firebasejs/${version}/firebase-app.js`,
    );
    return route.fulfill({ contentType: 'text/javascript', body });
  });
  await page.route('**://fonts.googleapis.com/**', (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('**://fonts.gstatic.com/**', (route) => route.abort());
}

async function newPage(opts = {}) {
  const page = await browser.newPage(opts);
  await installOfflineRoutes(page);
  return page;
}

async function visit(path) {
  const page = await newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  /* 等到頁面決定要顯示邀請函還是 404 為止 */
  await page.waitForFunction(() => {
    const vis = (id) => !document.getElementById(id).hidden;
    return vis('content') || vis('notFoundState');
  }, null, { timeout: 15000 });
  return { page, consoleErrors };
}

function ok(label, cond, extra = '') {
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
}

/* ---------- 站台 A ---------- */
console.log('\n[1] /w/chen-lin-0315/invitation');
{
  const { page, consoleErrors } = await visit('/w/chen-lin-0315/invitation');
  const t = await page.title();
  const groom = await page.textContent('#groomName');
  const bride = await page.textContent('#brideName');
  const theme = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--theme').trim());
  const detailDate = await page.textContent('#detailDate');
  const venue = await page.textContent('#venueName');
  const storyVisible = await page.isVisible('#storySection');
  const story = await page.textContent('#story');
  const formVisible = await page.isVisible('#rsvpForm');
  const notFoundHidden = !(await page.isVisible('#notFoundState'));

  ok('標題', t.includes('陳彥廷') && t.includes('林佳蓉'), t);
  ok('新人姓名', groom === '陳彥廷' && bride === '林佳蓉', `${groom}/${bride}`);
  ok('主題色 #3D9AD1', theme === '#3D9AD1', theme);
  ok('日期以婚禮時區顯示', detailDate === '2027.03.15（一）12:00', detailDate);
  ok('場地', venue.includes('晶華'), venue);
  ok('故事區塊顯示', storyVisible && story.includes('蛋糕'));
  ok('故事保留換行', story.includes('\n'));
  ok('RSVP 表單顯示', formVisible);
  ok('未顯示 404', notFoundHidden);

  /* 新增內容區塊 */
  ok('倒數計時顯示', (await page.textContent('#countdown')).includes('距離婚禮還有'),
    await page.textContent('#countdown'));
  ok('照片牆顯示 3 張', await page.locator('#gallery button').count() === 3,
    String(await page.locator('#gallery button').count()));
  ok('Dress code 顯示',
    (await page.textContent('#dressCode')).includes('香檳金'));
  ok('禮金說明顯示',
    (await page.textContent('#giftNote')).includes('最好的禮物'));
  const tags = await page.locator('#hashtags li').allTextContents();
  ok('hashtag 顯示且自動補 #',
    tags.join(',') === '#陳林2027,#我們結婚了', tags.join(','));
  ok('加入行事曆按鈕顯示', await page.isVisible('#calBtn'));

  ok('無 console 錯誤', consoleErrors.length === 0, consoleErrors.join(' | '));
  await page.close();
}

/* ---------- 照片放大 ---------- */
console.log('\n[1b] 照片放大');
{
  const { page } = await visit('/w/chen-lin-0315/invitation');
  ok('lightbox 預設關閉', !(await page.isVisible('#lightbox')));
  await page.locator('#gallery button').first().click();
  await page.waitForSelector('#lightbox', { state: 'visible', timeout: 5000 });
  ok('點圖後開啟 lightbox', await page.isVisible('#lightbox'));
  await page.keyboard.press('Escape');
  await page.waitForSelector('#lightbox', { state: 'hidden', timeout: 5000 });
  ok('按 Esc 可關閉', !(await page.isVisible('#lightbox')));
  await page.close();
}

/* ---------- 站台 B（主題色與內容須互不干擾） ---------- */
console.log('\n[2] /w/wu-yang-1220/invitation');
{
  const { page, consoleErrors } = await visit('/w/wu-yang-1220/invitation');
  const groom = await page.textContent('#groomName');
  const bride = await page.textContent('#brideName');
  const theme = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--theme').trim());
  const submitBg = await page.evaluate(() =>
    getComputedStyle(document.getElementById('submitBtn')).backgroundColor);
  const detailDate = await page.textContent('#detailDate');
  const storyHidden = !(await page.isVisible('#storySection'));

  ok('新人姓名', groom === '吳柏勳' && bride === '楊雅婷', `${groom}/${bride}`);
  ok('主題色 #B5838D', theme === '#B5838D', theme);
  ok('主題色實際套用到按鈕', submitBg === 'rgb(181, 131, 141)', submitBg);
  ok('日期以東京時區顯示', detailDate === '2027.12.20（一）18:30', detailDate);
  ok('無 story 時區塊隱藏', storyHidden);
  ok('無照片時照片牆隱藏', !(await page.isVisible('#gallerySection')));
  ok('無 dress code 時該列隱藏', !(await page.isVisible('#dressRow')));
  ok('無禮金說明時該列隱藏', !(await page.isVisible('#giftRow')));
  ok('無 hashtag 時區塊隱藏', !(await page.isVisible('#tagSection')));
  ok('無 console 錯誤', consoleErrors.length === 0, consoleErrors.join(' | '));
  await page.close();
}

/* ---------- 不存在的 slug ---------- */
console.log('\n[3] /w/does-not-exist/invitation');
{
  const { page, consoleErrors } = await visit('/w/does-not-exist/invitation');
  const nf = await page.isVisible('#notFoundState');
  const contentHidden = !(await page.isVisible('#content'));
  const loadingHidden = !(await page.isVisible('#loadingState'));
  const text = await page.textContent('#notFoundState');

  ok('顯示 404 畫面', nf);
  ok('內容區隱藏', contentHidden);
  ok('載入動畫消失（非白畫面）', loadingHidden);
  ok('中文友善訊息', text.includes('找不到這張邀請函'));
  ok('無 console 錯誤', consoleErrors.length === 0, consoleErrors.join(' | '));
  await page.close();
}

/* ---------- draft 站台不應對外顯示 ---------- */
console.log('\n[4] draft 站台');
{
  const { page } = await visit('/w/draft-site-test/invitation');
  ok('draft 顯示 404', await page.isVisible('#notFoundState'));
  await page.close();
}

/* ---------- 已過截止日 / 關閉回覆 ---------- */
console.log('\n[4b] RSVP 截止與關閉');
{
  const { page } = await visit('/w/past-deadline/invitation');
  ok('過期站台隱藏表單', !(await page.isVisible('#rsvpForm')));
  ok('過期站台顯示截止說明',
    (await page.textContent('#rsvpClosed')).includes('截止'));
  await page.close();
}
{
  const { page } = await visit('/w/rsvp-off/invitation');
  ok('關閉回覆時隱藏表單', !(await page.isVisible('#rsvpForm')));
  ok('關閉回覆時顯示說明',
    (await page.textContent('#rsvpClosed')).includes('尚未開放'));
  await page.close();
}

/* ---------- RSVP 實際送出 ---------- */
console.log('\n[5] RSVP 送出流程');
{
  const { page, consoleErrors } = await visit('/w/chen-lin-0315/invitation');
  await page.fill('#fName', '王小明');
  await page.click('label.choice:has(input[value="yes"])');
  await page.click('#plusBtn');
  await page.click('#plusBtn');
  const count = await page.textContent('#guestCount');
  ok('人數 stepper', count === '3', count);
  await page.fill('#fDiet', '素食 1 位');
  await page.fill('#fMsg', '祝你們永遠幸福！');

  const urlBefore = page.url();
  await page.click('#submitBtn');
  await page.waitForSelector('#doneBox:visible', { timeout: 8000 });

  ok('不跳頁', page.url() === urlBefore);
  ok('顯示成功狀態', await page.isVisible('#doneBox'));
  ok('表單隱藏', !(await page.isVisible('#rsvpForm')));
  const doneText = await page.textContent('#doneText');
  ok('成功訊息含人數', doneText.includes('3'), doneText);
  ok('無 console 錯誤', consoleErrors.length === 0, consoleErrors.join(' | '));
  await page.close();
}

/* ---------- honeypot ---------- */
console.log('\n[6] honeypot 擋機器人');
{
  const { page } = await visit('/w/chen-lin-0315/invitation');
  await page.fill('#fName', '機器人');
  await page.click('label.choice:has(input[value="yes"])');
  await page.evaluate(() => { document.getElementById('fWebsite').value = 'http://spam.example'; });
  await page.click('#submitBtn');
  await page.waitForSelector('#doneBox:visible', { timeout: 8000 });
  ok('honeypot 觸發時畫面仍顯示成功', await page.isVisible('#doneBox'));
  await page.close();

  /* 關鍵：畫面雖然顯示成功，但資料庫不該多出這筆 */
  const siteId = (await adb.collection('slugs').doc('chen-lin-0315').get()).data().siteId;
  const rsvps = await adb.collection('sites').doc(siteId).collection('rsvps').get();
  const names = rsvps.docs.map((d) => d.data().name);
  ok('honeypot 觸發時未寫入 Firestore', !names.includes('機器人'), names.join('、'));
  ok('正常回覆有寫入 Firestore', names.includes('王小明'), names.join('、'));
  ok('RSVP 總數為 1', rsvps.size === 1, String(rsvps.size));

  const saved = rsvps.docs[0].data();
  ok('guestCount 正確', saved.guestCount === 3, String(saved.guestCount));
  ok('attending 為 boolean true', saved.attending === true);
  ok('dietaryNote 正確', saved.dietaryNote === '素食 1 位', saved.dietaryNote);
  ok('createdAt 由伺服器寫入', saved.createdAt && typeof saved.createdAt.toDate === 'function');
  ok('未夾帶多餘欄位',
    Object.keys(saved).sort().join(',') ===
    'attending,createdAt,dietaryNote,guestCount,message,name',
    Object.keys(saved).sort().join(','));
}

/* ---------- 短連結 ---------- */
console.log('\n[8] 短連結 /s/{code}');
{
  const page = await newPage();
  await page.goto(BASE + '/s/ab23cd', { waitUntil: 'domcontentloaded' });
  await page.waitForURL('**/w/chen-lin-0315/invitation', { timeout: 15000 });
  ok('正確轉址到邀請函', page.url().endsWith('/w/chen-lin-0315/invitation'), page.url());
  await page.waitForSelector('#content', { state: 'visible', timeout: 15000 });
  ok('轉址後邀請函正常顯示',
    (await page.textContent('#groomName')) === '陳彥廷');
  await page.close();
}
{
  const page = await newPage();
  await page.goto(BASE + '/s/zzzzzz', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#notFoundState', { state: 'visible', timeout: 15000 });
  ok('不存在的代號顯示 404', await page.isVisible('#notFoundState'));
  await page.close();
}
{
  const page = await newPage();
  await page.goto(BASE + '/s/evil99', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#notFoundState', { state: 'visible', timeout: 15000 });
  ok('javascript: 協定被擋下', await page.isVisible('#notFoundState'));
  ok('未離開轉址頁', page.url().includes('/s/evil99'), page.url());
  await page.close();
}

/* ---------- 手機版 RWD ---------- */
console.log('\n[7] 手機版 RWD（375px）');
{
  const page = await newPage({ viewport: { width: 375, height: 812 } });
  await page.goto(BASE + '/w/chen-lin-0315/invitation', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#content', { state: 'visible', timeout: 15000 });
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('無水平捲動', overflow <= 0, `溢出 ${overflow}px`);
  await page.screenshot({ path: '/tmp/mobile.png', fullPage: true });
  await page.close();
}

/* ---------- 桌機截圖 ---------- */
{
  const page = await newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(BASE + '/w/chen-lin-0315/invitation', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#content', { state: 'visible', timeout: 15000 });
  await page.screenshot({ path: '/tmp/desktop.png', fullPage: true });
  await page.close();
}

await browser.close();
console.log('\n完成。');
