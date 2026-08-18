/* ============================================================
   e2e.mjs — 出席回覆（/w/{slug}/invitation）的瀏覽器測試
   ------------------------------------------------------------
   婚禮資訊與出席回覆表單已經合併成這一頁，版型與其他頁面相同：
   走 js/site-context.js 載入站台設定 → 注入 common.js 與 invitation.js，
   表單則由 js/rsvp-form.js 依新人在後台的設定產生。
   所以這裡等的是 data-site-ready，而不是舊版自己管的 #content。
============================================================ */
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
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
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
  auth: readFileSync(new URL('firebase-auth.js', SDK_DIR), 'utf8'),
};

/* 把子模組 import 的 app 版本改成頁面請求的版本，
   否則會載入兩份 firebase-app 實例，導致 "Service firestore is not available" */
function pinAppVersion(body, url) {
  const version = url.match(/firebasejs\/([^/]+)\//)?.[1];
  return body.replace(
    /https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/firebase-app\.js/g,
    `https://www.gstatic.com/firebasejs/${version}/firebase-app.js`,
  );
}

async function installOfflineRoutes(page) {
  await page.route('**/firebasejs/**/firebase-app.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: sdk.app }));
  await page.route('**/firebasejs/**/firebase-firestore.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: pinAppVersion(sdk.firestore, route.request().url()),
    }));
  await page.route('**/firebasejs/**/firebase-auth.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: pinAppVersion(sdk.auth, route.request().url()),
    }));
  await page.route('**://fonts.googleapis.com/**', (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('**://fonts.gstatic.com/**', (route) => route.abort());
}

async function newPage(opts = {}) {
  const page = await browser.newPage(opts);
  await installOfflineRoutes(page);
  return page;
}

/* 等到 site-context.js 決定要顯示邀請函，還是換上找不到的畫面為止 */
async function waitReady(page) {
  await page.waitForFunction(
    () => document.documentElement.dataset.siteReady === '1'
       || !!document.querySelector('[data-fatal]'),
    null, { timeout: 15000 });
}

async function visit(path) {
  const page = await newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  return { page, consoleErrors };
}

/* 字體與素材圖在沙箱裡本來就抓不到，不算真的錯誤 */
function realErrors(list) {
  return list.filter((t) =>
    !/favicon|fonts\.|\.png|\.jpg|\.jpeg|\.webp|\.mp3|ERR_FAILED|status of 404/i.test(t));
}

function ok(label, cond, extra = '') {
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
}

/* 出席回覆表單：把必填的題目一次填完（能來參加、關係、喜帖、喜餅） */
/* 預設用「不需要喜帖」＋「現場領取」：這兩個選項不會再追問地址或 Email，
   讓每個測試只需要填自己真正要驗的欄位 */
async function fillRsvp(page, { name, attend = 'yes', relation = 'groom',
                                card = 'none', gift = 'pickup',
                                phone = '0912345678' } = {}) {
  await page.fill('#rName', name);
  await page.click(`#attendRow .choice[data-val="${attend}"]`);
  await page.click(`#relationRow .choice[data-val="${relation}"]`);
  await page.fill('#rPhone', phone);
  await page.click(`#cardRow .choice[data-val="${card}"]`);
  await page.click(`#giftRow .choice[data-val="${gift}"]`);
}

/* ---------- 站台 A ---------- */
console.log('\n[1] /w/chen-lin-0315/invitation');
{
  const { page, consoleErrors } = await visit('/w/chen-lin-0315/invitation');
  const t = await page.title();
  const couple = await page.textContent('.inv-couple');
  const detailDate = await page.textContent('#detailDate');
  const venue = await page.textContent('#venueName');
  const storyVisible = await page.isVisible('#storyBlock');
  const story = await page.textContent('#storyText');
  const formVisible = await page.isVisible('#rsvpForm');
  const notFound = await page.locator('[data-fatal]').count();

  ok('標題', t.includes('陳彥廷') && t.includes('林佳蓉'), t);
  ok('新人姓名', couple.trim() === '陳彥廷 & 林佳蓉', couple.trim());
  ok('日期以婚禮時區顯示', detailDate === '2027.03.15（一）12:00', detailDate);
  ok('場地', venue.includes('晶華'), venue);
  ok('故事區塊顯示', storyVisible && story.includes('蛋糕'));
  ok('故事保留換行', story.includes('\n'));
  ok('RSVP 表單顯示', formVisible);
  ok('未顯示找不到畫面', notFound === 0);

  /* 與其他頁面同一套版型（共用的浮動控制要在），
     但邀請函是單獨分享出去的一頁，不掛導覽列 */
  ok('套用共用版型（common.css）',
    await page.evaluate(() => Array.from(document.styleSheets)
      .some((s) => (s.href || '').includes('/css/common.css'))));
  ok('邀請函不掛頂部導覽列',
    await page.evaluate(() => !document.getElementById('siteNav')
      && document.body.classList.contains('nav-off')));
  ok('有共用的主題／音樂浮動控制', await page.isVisible('.floating'));
  ok('沿用共用的區塊標題樣式',
    await page.locator('.section-title').count() >= 3,
    String(await page.locator('.section-title').count()));

  /* 內容區塊 */
  ok('倒數計時顯示', (await page.textContent('#invCountdown')).includes('距離婚禮還有'),
    await page.textContent('#invCountdown'));
  ok('照片牆顯示 3 張', await page.locator('#gallery button').count() === 3,
    String(await page.locator('#gallery button').count()));
  ok('Dress code 顯示',
    (await page.textContent('#dressCode')).includes('香檳金'));
  ok('禮金說明顯示',
    (await page.textContent('#giftNote')).includes('最好的禮物'));
  const tags = await page.locator('#hashtags span').allTextContents();
  ok('hashtag 顯示且自動補 #',
    tags.join(',') === '#陳林2027,#我們結婚了', tags.join(','));
  ok('加入行事曆按鈕顯示', await page.isVisible('#calBtn'));

  ok('無 console 錯誤', realErrors(consoleErrors).length === 0,
    realErrors(consoleErrors).join(' | '));
  await page.close();
}

/* ---------- 表單題目 ---------- */
console.log('\n[1a] 出席回覆的題目');
{
  const { page } = await visit('/w/chen-lin-0315/invitation');
  const opts = (sel) => page.locator(sel).allTextContents();

  ok('能來參加嗎？三個選項',
    (await opts('#attendRow .choice')).join('／') === '熱情出席／視情況而定／誠摯祝福但無法出席',
    (await opts('#attendRow .choice')).join('／'));
  ok('與新人關係四個選項',
    (await opts('#relationRow .choice')).join('／') === '男方親友／女方親友／雙方親友／其他',
    (await opts('#relationRow .choice')).join('／'));
  ok('喜帖三個選項',
    (await opts('#cardRow .choice')).join('／') === '需要紙本喜帖／需要電子喜帖／不需要喜帖',
    (await opts('#cardRow .choice')).join('／'));
  ok('喜餅兩個選項',
    (await opts('#giftRow .choice')).join('／') === '現場領取／郵寄',
    (await opts('#giftRow .choice')).join('／'));
  ok('其他備註欄位存在', await page.locator('#rMemo').count() === 1);
  ok('沒設定時三種聯絡方式都問',
    (await page.locator('.rf-contact-name').allTextContents()).join('／')
      === '電話號碼／LINE ID／Email',
    (await page.locator('.rf-contact-name').allTextContents()).join('／'));

  /* 出席細節：沒選「熱情出席」之前不出現 */
  ok('未選出席時細節收起來', !(await page.isVisible('#detailBox')));
  await page.click('#attendRow .choice[data-val="yes"]');
  ok('選了出席才展開細節', await page.isVisible('#detailBox'));

  /* 葷素分配跟著人數走 */
  await page.click('#headPlus');
  await page.click('#headPlus');
  ok('人數 stepper', (await page.textContent('#headNum')) === '3',
    await page.textContent('#headNum'));
  ok('預設全部算葷食', (await page.textContent('#meatNum')) === '3',
    await page.textContent('#meatNum'));
  await page.click('#vegPlus');
  ok('素食加一，葷食自動減一',
    (await page.textContent('#meatNum')) === '2' && (await page.textContent('#vegNum')) === '1',
    `${await page.textContent('#meatNum')}/${await page.textContent('#vegNum')}`);

  /* 兒童座椅：打勾才問幾張 */
  ok('未勾選時不問張數', !(await page.isVisible('#childSeatBox')));
  await page.check('#childSeatOn');
  ok('勾選後可以選張數', await page.isVisible('#childSeatBox'));
  ok('勾選後預設 1 張', (await page.textContent('#childNum')) === '1',
    await page.textContent('#childNum'));

  /* 喜帖：紙本才問領取方式，郵寄才問地址 */
  ok('未選紙本時不問領取方式', !(await page.isVisible('#cardPaperBox')));
  await page.click('#cardRow .choice[data-val="paper"]');
  ok('選了紙本才問領取方式', await page.isVisible('#cardPaperBox'));
  ok('未選郵寄時不問地址', !(await page.isVisible('#cardAddrBox')));
  await page.click('#cardDeliveryRow .choice[data-val="mail"]');
  ok('選了郵寄才問地址', await page.isVisible('#cardAddrBox'));

  /* 喜餅：郵寄才問地址 */
  ok('喜餅預設不問地址', !(await page.isVisible('#giftAddrBox')));
  await page.click('#giftRow .choice[data-val="mail"]');
  ok('喜餅選郵寄才問地址', await page.isVisible('#giftAddrBox'));

  /* 喜餅「同上」：喜帖填了地址才會出現，勾了就帶下來 */
  await page.fill('#rCardZip', '104');
  await page.fill('#rCardAddr', '台北市中山區南京東路一段 1 號');
  await page.click('#giftRow .choice[data-val="mail"]');
  ok('喜帖有地址時，喜餅才出現「同上」', await page.isVisible('#giftAddrSameWrap'));
  await page.check('#giftAddrSame');
  ok('勾同上就帶入喜帖的地址',
    (await page.inputValue('#rGiftZip')) === '104'
      && (await page.inputValue('#rGiftAddr')).includes('南京東路'),
    `${await page.inputValue('#rGiftZip')} / ${await page.inputValue('#rGiftAddr')}`);
  ok('帶進來的欄位轉成唯讀',
    await page.evaluate(() => document.getElementById('rGiftAddr').readOnly));

  /* 電子喜帖「同上」：聯絡方式填了 Email 才會出現 */
  await page.click('#cardRow .choice[data-val="digital"]');
  ok('沒填聯絡 Email 時不出現同上', !(await page.isVisible('#cardEmailSameWrap')));
  await page.fill('#rEmail', 'guest@example.com');
  ok('填了聯絡 Email 才出現同上', await page.isVisible('#cardEmailSameWrap'));
  await page.check('#cardEmailSame');
  ok('勾同上就帶入聯絡的 Email',
    (await page.inputValue('#rCardEmail')) === 'guest@example.com',
    await page.inputValue('#rCardEmail'));

  /* 沒留任何聯絡方式就送出：要被擋下 */
  await page.fill('#rName', '沒留聯絡方式');
  await page.click('#relationRow .choice[data-val="both"]');
  await page.fill('#rEmail', '');
  await page.click('#submitBtn');
  await page.waitForTimeout(300);
  ok('沒留聯絡方式會被擋下',
    (await page.textContent('#rErr')).includes('聯絡方式'),
    await page.textContent('#rErr'));

  /* 郵寄卻沒填地址就送出：要被擋下 */
  await page.fill('#rPhone', '0912345678');
  await page.click('#cardRow .choice[data-val="paper"]');
  await page.click('#cardDeliveryRow .choice[data-val="mail"]');
  await page.fill('#rCardZip', '');
  await page.click('#submitBtn');
  await page.waitForTimeout(300);
  ok('郵寄沒填郵遞區號會被擋下',
    (await page.textContent('#rErr')).includes('郵遞區號'),
    await page.textContent('#rErr'));
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

/* ---------- 站台 B（內容須互不干擾） ---------- */
console.log('\n[2] /w/wu-yang-1220/invitation');
{
  const { page, consoleErrors } = await visit('/w/wu-yang-1220/invitation');
  const couple = await page.textContent('.inv-couple');
  const detailDate = await page.textContent('#detailDate');

  ok('新人姓名', couple.trim() === '吳柏勳 & 楊雅婷', couple.trim());
  ok('日期以東京時區顯示', detailDate === '2027.12.20（一）18:30', detailDate);
  ok('無 story 時區塊隱藏', !(await page.isVisible('#storyBlock')));
  ok('無照片時照片牆隱藏', !(await page.isVisible('#galleryBlock')));
  ok('無 dress code 時該列隱藏', !(await page.isVisible('#dressRow')));
  ok('無禮金說明時該列隱藏', !(await page.isVisible('#giftNoteRow')));
  const tags = await page.locator('#hashtags span').allTextContents();
  ok('沒設 hashtag 時用預設兩個',
    tags.join(',') === '#我們結婚了,#Married', tags.join(','));
  ok('無 console 錯誤', realErrors(consoleErrors).length === 0,
    realErrors(consoleErrors).join(' | '));
  await page.close();
}

/* ---------- 不存在的 slug ---------- */
console.log('\n[3] /w/does-not-exist/invitation');
{
  const { page, consoleErrors } = await visit('/w/does-not-exist/invitation');
  const text = await page.textContent('body');

  ok('顯示找不到畫面', (await page.locator('[data-fatal]').count()) === 1);
  ok('中文友善訊息', text.includes('找不到這張邀請函'));
  ok('不是白畫面', text.trim().length > 0);
  ok('無 console 錯誤', realErrors(consoleErrors).length === 0,
    realErrors(consoleErrors).join(' | '));
  await page.close();
}

/* ---------- draft 站台不應對外顯示 ---------- */
console.log('\n[4] draft 站台');
{
  const { page } = await visit('/w/draft-site-test/invitation');
  ok('draft 顯示找不到畫面', (await page.locator('[data-fatal]').count()) === 1);
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
  await fillRsvp(page, { name: '王小明', relation: 'groom', card: 'paper', gift: 'mail' });

  /* 出席細節 */
  await page.click('#headPlus');
  await page.click('#headPlus');
  await page.click('#vegPlus');
  await page.check('#childSeatOn');
  await page.fill('#rDiet', '不吃牛');

  /* 紙本喜帖自行領取、喜餅郵寄 */
  await page.click('#cardDeliveryRow .choice[data-val="pickup"]');
  await page.fill('#rGiftZip', '104');
  await page.fill('#rGiftAddr', '台北市中山區南京東路一段 1 號');

  await page.fill('#rNote', '祝你們永遠幸福！');
  await page.fill('#rMemo', '會晚 20 分鐘到');

  const urlBefore = page.url();
  await page.click('#submitBtn');
  await page.waitForSelector('#thanksCard:visible', { timeout: 8000 });

  ok('不跳頁', page.url() === urlBefore);
  ok('顯示成功狀態', await page.isVisible('#thanksCard'));
  ok('表單隱藏', !(await page.isVisible('#rsvpForm')));
  const doneText = await page.textContent('#tkMsg');
  ok('成功訊息含人數', doneText.includes('3'), doneText);
  ok('無 console 錯誤', realErrors(consoleErrors).length === 0,
    realErrors(consoleErrors).join(' | '));
  await page.close();
}

/* ---------- honeypot ---------- */
console.log('\n[6] honeypot 擋機器人');
{
  const { page } = await visit('/w/chen-lin-0315/invitation');
  /* 上一段已經回覆過，這一頁會直接顯示感謝畫面 —— 先清掉本機紀錄 */
  await page.evaluate(() => LS.remove('rsvp.mine'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitReady(page);

  await fillRsvp(page, { name: '機器人', attend: 'no' });
  await page.evaluate(() => { document.getElementById('rWebsite').value = 'http://spam.example'; });
  await page.click('#submitBtn');
  await page.waitForSelector('#thanksCard:visible', { timeout: 8000 });
  ok('honeypot 觸發時畫面仍顯示成功', await page.isVisible('#thanksCard'));
  await page.close();

  /* 關鍵：畫面雖然顯示成功，但資料庫不該多出這筆 */
  const siteId = (await adb.collection('slugs').doc('chen-lin-0315').get()).data().siteId;
  const rsvps = await adb.collection('sites').doc(siteId).collection('rsvps').get();
  const names = rsvps.docs.map((d) => d.data().name);
  ok('honeypot 觸發時未寫入 Firestore', !names.includes('機器人'), names.join('、'));
  ok('正常回覆有寫入 Firestore', names.includes('王小明'), names.join('、'));
  ok('RSVP 總數為 1', rsvps.size === 1, String(rsvps.size));

  const saved = rsvps.docs[0].data();
  ok('attending 為 boolean true', saved.attending === true);
  ok('guestCount 正確', saved.guestCount === 3, String(saved.guestCount));
  ok('與新人關係正確', saved.relation === 'groom', saved.relation);
  ok('葷素分配加起來等於人數',
    saved.mealMeat === 2 && saved.mealVeg === 1,
    `葷 ${saved.mealMeat} / 素 ${saved.mealVeg}`);
  ok('兒童座椅張數正確', saved.childSeat === 1, String(saved.childSeat));
  ok('飲食習慣正確', saved.dietaryNote === '不吃牛', saved.dietaryNote);
  ok('喜帖為紙本自取', saved.cardType === 'paper' && saved.cardDelivery === 'pickup',
    `${saved.cardType}/${saved.cardDelivery}`);
  ok('紙本自取時不留地址', saved.cardAddress === '' && saved.cardZip === '');
  ok('聯絡電話有存下來', saved.contactPhone === '0912345678', saved.contactPhone);
  ok('喜餅郵寄且有地址',
    saved.giftDelivery === 'mail' && saved.giftZip === '104'
      && saved.giftAddress.includes('南京東路'),
    `${saved.giftDelivery}/${saved.giftZip}/${saved.giftAddress}`);
  ok('其他備註有存下來', saved.note === '會晚 20 分鐘到', saved.note);
  ok('createdAt 由伺服器寫入', saved.createdAt && typeof saved.createdAt.toDate === 'function');
  ok('未夾帶多餘欄位',
    Object.keys(saved).sort().join(',') ===
    'attending,cardAddress,cardDelivery,cardEmail,cardType,cardZip,childSeat,contactEmail,'
    + 'contactLine,contactPhone,createdAt,dietaryNote,giftAddress,giftDelivery,giftZip,'
    + 'guestCount,icon,mealMeat,mealVeg,message,name,note,relation,tag,tentative',
    Object.keys(saved).sort().join(','));
}

/* ---------- 短連結 ---------- */
console.log('\n[8] 短連結 /s/{code}');
{
  const page = await newPage();
  await page.goto(BASE + '/s/ab23cd', { waitUntil: 'domcontentloaded' });
  await page.waitForURL('**/w/chen-lin-0315/invitation', { timeout: 15000 });
  ok('正確轉址到邀請函', page.url().endsWith('/w/chen-lin-0315/invitation'), page.url());
  await waitReady(page);
  ok('轉址後邀請函正常顯示',
    (await page.textContent('.inv-couple')).trim() === '陳彥廷 & 林佳蓉');
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

/* ---------- 舊網址 /rsvp ---------- */
console.log('\n[9] 舊的 /rsvp 網址');
{
  const page = await newPage();
  await page.goto(BASE + '/w/chen-lin-0315/rsvp', { waitUntil: 'domcontentloaded' });
  await page.waitForURL('**/w/chen-lin-0315/invitation', { timeout: 15000 }).catch(() => {});
  ok('導到合併後的邀請函',
    page.url().endsWith('/w/chen-lin-0315/invitation'), page.url());
  await waitReady(page);
  ok('導過去之後表單正常顯示', await page.isVisible('#rsvpForm'));
  await page.close();
}

/* ---------- 手機版 RWD ---------- */
console.log('\n[7] 手機版 RWD（375px）');
{
  const page = await newPage({ viewport: { width: 375, height: 812 } });
  await page.goto(BASE + '/w/chen-lin-0315/invitation', { waitUntil: 'domcontentloaded' });
  await waitReady(page);
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
  await waitReady(page);
  await page.screenshot({ path: '/tmp/desktop.png', fullPage: true });
  await page.close();
}

await browser.close();
console.log('\n完成。');
