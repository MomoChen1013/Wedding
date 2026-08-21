/* ============================================================
   butler.mjs — 收禮小幫手的瀏覽器測試
   ------------------------------------------------------------
   這一支要證明的事，按重要性排：

     1. 通行碼是**真的**：算對了才進得去，算錯了連資料在哪都找不到
        （bookId 是 PBKDF2(通行碼, token) 推導出來的，見 js/butler-key.js）
     2. 現場那一輪流程走得完：搜尋賓客 → 填金額與禮餅 → 儲存 → 寫進 Firestore
     3. 統計是加起來的：不同小幫手記的每一筆都算進同一組數字
     4. 新人按「停用」之後就記不進新的資料

   這一頁不吃 site-context.js（它不在 /w/{slug}/ 底下），
   所以沒有 data-site-ready 可以等，改等畫面自己出現。
============================================================ */
import { chromium } from 'playwright';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { pbkdf2Sync } from 'node:crypto';

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

/* 和瀏覽器端 js/butler-key.js 的 derive() 必須完全一致，
   算出來不一樣的話「通行碼對了也進不去」—— 這一行就是那份契約 */
function deriveBookId(token, passcode){
  return pbkdf2Sync(String(passcode), `butler:${token}`, 200000, 32, 'sha256')
    .toString('hex');
}

/* ---------- 種測試資料 ---------- */
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
const { initializeApp: adminInit } = await import('firebase-admin/app');
const { getFirestore: adminFirestore, Timestamp: TS } = await import('firebase-admin/firestore');

adminInit({ projectId: process.env.GCLOUD_PROJECT || 'wedding-22b94' });
const adb = adminFirestore();

const TOKEN = 'testtokenabcdefgh2345';
const PASSCODE = '246813';
const BOOK_ID = deriveBookId(TOKEN, PASSCODE);

const GUESTS = [
  { id:'g1', code:'A01', name:'王小明', table:'01｜主桌', count:2, cat:'男方親友', note:'' },
  { id:'g2', code:'B01', name:'林美美', table:'05',       count:1, cat:'女方親友', note:'素食' },
  { id:'g3', code:'B02', name:'陳大同', table:'05',       count:4, cat:'女方親友', note:'' },
];

async function seed(){
  const siteRef = adb.collection('sites').doc('butler-test-site');
  await siteRef.set({
    slug:'butler-test', ownerEmail:'couple@example.com', status:'published',
    groomName:'阿明', brideName:'阿美',
    eventDate: TS.fromDate(new Date('2027-01-01T04:00:00Z')),
    venueName:'測試會館', venueAddress:'台北市',
    rsvpDeadline: TS.fromMillis(Date.now() + 86400000),
    rsvpEnabled: true,
    pages: { butler: true, rsvp: true },
    ownerEmails: ['couple@example.com'],
    createdAt: TS.now(), updatedAt: TS.now(),
  });
  await adb.collection('slugs').doc('butler-test').set({
    siteId: siteRef.id, createdAt: TS.now(),
  });

  /* 先把舊的紀錄清乾淨，重跑測試才不會被上一輪的數字污染 */
  const old = await adb.collection('butlers').doc(BOOK_ID).collection('entries').get();
  await Promise.all(old.docs.map((d) => d.ref.delete()));

  await adb.collection('butlers').doc(BOOK_ID).set({
    siteId: siteRef.id,
    slug: 'butler-test',
    couple: '阿明 & 阿美',
    label: '收禮台',
    guests: GUESTS,
    revoked: false,
    importedAt: Date.now(),
    importedFrom: 'plan',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return siteRef.id;
}

const SITE_ID = await seed();
console.log('已寫入測試資料。bookId =', BOOK_ID.slice(0, 12) + '…');

/* ---------- 瀏覽器 ---------- */
const browser = await chromium.launch({ executablePath: findChromium() });

const SDK_DIR = new URL('../node_modules/firebase/', import.meta.url);
const sdk = {
  app: readFileSync(new URL('firebase-app.js', SDK_DIR), 'utf8'),
  firestore: readFileSync(new URL('firebase-firestore.js', SDK_DIR), 'utf8'),
  auth: readFileSync(new URL('firebase-auth.js', SDK_DIR), 'utf8'),
};

async function newPage(opts = {}){
  const page = await browser.newPage(opts);
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
  return page;
}

/* 後台的門檻是 Google 登入；emulator 收得下自己捏的 credential */
async function signInAsOwner(page, email){
  await page.evaluate(async (mail) => {
    const m = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js');
    const cred = m.GoogleAuthProvider.credential(
      JSON.stringify({ sub:`uid-${mail}`, email: mail, email_verified: true }));
    await m.signInWithCredential(window.fb.auth, cred);
  }, email);
}

let failures = 0;
function ok(label, cond, extra = ''){
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${extra ? ' — ' + extra : ''}`);
  if(!cond) failures++;
}

/* butler.js 走的是 127.0.0.1 的 emulator（isLocal 判斷），
   所以測試一律用 127.0.0.1 這個網址開 */
async function openButler(hash = `#${TOKEN}`){
  const page = await newPage({ viewport:{ width:390, height:844 } });   /* iPhone 尺寸 */
  const errors = [];
  page.on('console', (m) => { if(m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(`${BASE}/butler${hash}`, { waitUntil:'domcontentloaded' });
  return { page, errors };
}

async function unlock(page, passcode = PASSCODE){
  await page.waitForSelector('#btGate:not([hidden])', { timeout:15000 });
  await page.fill('#btPass', passcode);
  await page.click('#btEnter');
}

function entriesCol(){
  return adb.collection('butlers').doc(BOOK_ID).collection('entries');
}

/* ============================================================
   1. 通行碼
============================================================ */
console.log('\n【通行碼】');
{
  const { page } = await openButler();
  await unlock(page, '000000');
  /* #btGateErr 一開始就放著一個 &nbsp;（保留高度不讓畫面跳），
     所以不能用「非空」判斷，要等真正的訊息出現 */
  await page.waitForFunction(
    () => document.getElementById('btGateErr').textContent.includes('通行碼'),
    null, { timeout:20000 });
  const msg = await page.textContent('#btGateErr');
  ok('通行碼錯的時候進不去', (msg || '').includes('通行碼不對'), msg.trim());
  ok('主畫面沒有被打開', await page.isHidden('#btApp'));
  await page.close();
}

{
  const { page, errors } = await openButler();
  await unlock(page);
  await page.waitForSelector('#btApp:not([hidden])', { timeout:20000 });
  ok('通行碼對了就進得去', true);
  ok('頂列顯示這場婚禮', (await page.textContent('#btCouple')).includes('阿明'));
  ok('名單載進來了（三位賓客）',
    (await page.locator('#btList .bt-row').count()) === 3);
  ok('沒有 console 錯誤', errors.length === 0, errors.join(' / '));
  await page.close();
}

{
  const { page } = await openButler('');
  await page.waitForSelector('#btFatal:not([hidden])', { timeout:15000 });
  ok('網址少了代號就直接擋下來',
    (await page.textContent('#btFatalTitle')).includes('連結不完整'));
  await page.close();
}

/* ============================================================
   2. 現場那一輪：搜尋 → 記帳 → 存進去
============================================================ */
console.log('\n【記一筆禮金】');
{
  const { page, errors } = await openButler();
  await unlock(page);
  await page.waitForSelector('#btApp:not([hidden])', { timeout:20000 });

  /* 先報上自己的名字（每一筆都會記下是誰收的） */
  await page.click('#btWho');
  await page.waitForSelector('#btNameSheet:not([hidden])');
  await page.fill('#btInWho', '阿華');
  await page.click('#btNameForm button[type=submit]');
  await page.waitForSelector('#btNameSheet', { state:'hidden' });
  ok('記錄者的名字留在頂列', (await page.textContent('#btWhoName')).trim() === '阿華');

  /* 搜尋：打「美美」找得到「林美美」 */
  await page.fill('#btSearch', '美美');
  await page.waitForFunction(
    () => document.querySelectorAll('#btList .bt-row').length === 1, null, { timeout:5000 });
  ok('搜尋名字找得到人', true);

  await page.click('#btList .bt-row');
  await page.waitForSelector('#btSheet:not([hidden])');
  ok('表單帶出這位賓客', (await page.textContent('#btFormName')).includes('林美美'));
  ok('人數預設帶入名單上的人數',
    (await page.inputValue('#btInPeople')) === '1');

  /* 常見金額點一下就填好 */
  await page.click('#btQuick button[data-amt="3600"]');
  ok('點金額捷徑就填好了', (await page.inputValue('#btInAmount')) === '3600');

  await page.click('#btGiftSeg button[data-gift="1"]');
  await page.waitForSelector('#btBoxField:not([hidden])');
  await page.click('.bt-step[data-step="boxes"] button[data-d="1"]');
  ok('禮餅盒數加得上去', (await page.inputValue('#btInBoxes')) === '2');

  await page.fill('#btInNote', '幫她媽媽一起帶的');
  await page.click('#btSave');
  await page.waitForSelector('#btSheet', { state:'hidden', timeout:10000 });

  /* 真的寫進 Firestore 了嗎 */
  let snap;
  for(let i = 0; i < 40 && (!snap || snap.size !== 1); i++){
    snap = await entriesCol().get();
    if(snap.size !== 1) await new Promise((r) => setTimeout(r, 250));
  }
  const rec = snap.size === 1 ? snap.docs[0].data() : null;
  ok('收禮寫進 Firestore 了', !!rec, `共 ${snap ? snap.size : 0} 筆`);
  if(rec){
    ok('金額正確', rec.amount === 3600, String(rec.amount));
    ok('禮餅與盒數正確', rec.gift === true && rec.boxes === 2, `gift=${rec.gift} boxes=${rec.boxes}`);
    ok('對得回名單上的那一位', rec.guestId === 'g2' && rec.code === 'B01');
    ok('記下了是誰收的', rec.by === '阿華', rec.by);
  }

  /* 名單上那一列跟著變成「已收」 */
  await page.fill('#btSearch', '');
  await page.waitForFunction(
    () => document.querySelectorAll('#btList .bt-row.is-done').length === 1,
    null, { timeout:10000 });
  ok('名單上標成已收，不會有人被收兩次', true);

  ok('上方摘要更新了', (await page.textContent('#btStripSum')).includes('3,600'));

  /* 現場是站著單手用手機，畫面橫向跑掉的話按鈕就按不到了 */
  for(const view of ['list', 'log', 'stat']){
    await page.click(`#btTabbar button[data-go="${view}"]`);
    const over = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${view} 在手機上沒有水平捲動`, over <= 0, `溢出 ${over}px`);
  }
  await page.click('#btTabbar button[data-go="list"]');
  await page.click('#btList .bt-row');
  await page.waitForSelector('#btSheet:not([hidden])');
  const sheetOver = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('記帳表單也沒有水平捲動', sheetOver <= 0, `溢出 ${sheetOver}px`);
  await page.click('#btSheet .bt-x');

  ok('沒有 console 錯誤', errors.length === 0, errors.join(' / '));
  await page.close();
}

/* ============================================================
   3. 統計是所有人加起來的
============================================================ */
console.log('\n【統計】');
{
  /* 另一位小幫手在別的手機上記的那一筆 */
  await entriesCol().add({
    guestId:'g1', name:'王小明', code:'A01', table:'01｜主桌',
    amount: 6000, gift: true, boxes: 3, people: 2,
    note:'', by:'阿真', createdAt: Date.now(), updatedAt: Date.now(),
  });

  const { page } = await openButler();
  await unlock(page);
  await page.waitForSelector('#btApp:not([hidden])', { timeout:20000 });
  await page.click('#btTabbar button[data-go="stat"]');
  await page.waitForFunction(
    () => document.getElementById('btSumMoney').textContent.includes('9,600'),
    null, { timeout:15000 });
  ok('禮金總額把兩個人記的加起來', true, await page.textContent('#btSumMoney'));

  const tiles = await page.textContent('#btTiles');
  ok('禮餅總盒數也加起來了（2 ＋ 3）', tiles.includes('5'), tiles.replace(/\s+/g, ' ').trim());

  const byWho = await page.textContent('#btByWho');
  ok('看得出誰記了多少', byWho.includes('阿華') && byWho.includes('阿真'));
  await page.close();
}

/* ============================================================
   4. 名單外的賓客
============================================================ */
console.log('\n【名單外的賓客】');
{
  const { page } = await openButler();
  await unlock(page);
  await page.waitForSelector('#btApp:not([hidden])', { timeout:20000 });
  /* 上一輪存在 localStorage 的名字不會跟著新的瀏覽器 context 走，先補一次 */
  await page.click('#btWho');
  await page.waitForSelector('#btNameSheet:not([hidden])');
  await page.fill('#btInWho', '阿華');
  await page.click('#btNameForm button[type=submit]');
  await page.waitForSelector('#btNameSheet', { state:'hidden' });

  await page.click('#btAddManual');
  await page.waitForSelector('#btSheet:not([hidden])');
  ok('名單外的賓客要自己填名字', await page.isVisible('#btNameField'));
  await page.fill('#btInName', '臨時來的表哥');
  await page.fill('#btInAmount', '2200');
  await page.click('#btSave');
  await page.waitForSelector('#btSheet', { state:'hidden', timeout:10000 });

  let hit = null;
  for(let i = 0; i < 40 && !hit; i++){
    const snap = await entriesCol().where('name', '==', '臨時來的表哥').get();
    hit = snap.empty ? null : snap.docs[0].data();
    if(!hit) await new Promise((r) => setTimeout(r, 250));
  }
  ok('名單外的也記得起來', !!hit && hit.amount === 2200);
  ok('沒有掛在任何一位名單上的賓客身上', !!hit && hit.guestId === '');
  await page.close();
}

/* ============================================================
   5. 新人按停用之後
============================================================ */
console.log('\n【停用】');
{
  await adb.collection('butlers').doc(BOOK_ID).update({ revoked: true, updatedAt: Date.now() });
  const { page } = await openButler();
  await unlock(page);
  await page.waitForSelector('#btFatal:not([hidden])', { timeout:20000 });
  ok('停用之後就進不去了',
    (await page.textContent('#btFatalTitle')).includes('停用'));
  await page.close();
  await adb.collection('butlers').doc(BOOK_ID).update({ revoked: false, updatedAt: Date.now() });
}

/* ============================================================
   6. 後台這一側：產生連結、匯入名單、看得到統計
============================================================ */
console.log('\n【後台】');
{
  /* 出席回覆匯入要有回覆可匯，先種兩筆 */
  const rsvps = adb.collection('sites').doc(SITE_ID).collection('rsvps');
  await Promise.all((await rsvps.get()).docs.map((d) => d.ref.delete()));
  await rsvps.add({
    name:'黃美麗', attending:true, guestCount:3, dietaryNote:'', message:'',
    relation:'bride', note:'', createdAt: TS.now(),
  });
  await rsvps.add({
    name:'不能來的朋友', attending:false, guestCount:1, dietaryNote:'', message:'',
    relation:'groom', note:'', createdAt: TS.now(),
  });

  const page = await newPage({ viewport:{ width:1200, height:900 } });
  const errors = [];
  page.on('console', (m) => { if(m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(`${BASE}/w/butler-test/admin`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.siteReady === '1',
    null, { timeout:20000 });
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:20000 });

  ok('後台長出「收禮小幫手」分頁',
    await page.isVisible('.ad-tab[data-tab="butler"]'));

  await page.click('.ad-tab[data-tab="butler"]');
  await page.waitForFunction(
    () => document.querySelector('.ad-tab.is-on')?.dataset.tab === 'butler',
    null, { timeout:5000 });
  ok('網址帶到第一個子分頁', page.url().endsWith('#butler/stats'), page.url());

  /* 統計要看得到前面那幾筆（測試資料的收禮簿還沒登記成連結，
     所以先切到「連結與名單」產生一組新的） */
  await page.click('.ad-subtab[data-subtab="links"]');
  await page.waitForSelector('#adBtLinks', { state:'visible' });

  await page.click('#adBtNewLink');
  await page.waitForSelector('#adModalMask:not([hidden])', { timeout:5000 });
  await page.fill('#adModalPhrase', '收禮台');
  await page.click('#adModalConfirm');

  await page.waitForFunction(
    () => document.querySelectorAll('#adBtLinks .ad-bt-link').length === 1,
    null, { timeout:20000 });
  ok('產生得出一組連結', true);

  const url = await page.inputValue('#adBtLinks input[data-url]');
  const pass = (await page.textContent('#adBtLinks .ad-bt-pass')).trim();
  ok('連結長對了（/butler#…）', /\/butler#[a-z0-9]{22}$/.test(url), url);
  ok('通行碼是六位數字', /^\d{6}$/.test(pass), pass);

  /* 後台算出來的位置，Node 這邊用同一套參數重算要對得起來 ——
     對不起來的話「通行碼對了也進不去」 */
  const token = url.split('#')[1];
  const derived = deriveBookId(token, pass);
  const bookSnap = await adb.collection('butlers').doc(derived).get();
  ok('通行碼推導出來的位置真的有那本收禮簿', bookSnap.exists);
  ok('收禮簿掛在這場婚禮底下',
    bookSnap.exists && bookSnap.data().siteId === SITE_ID);

  /* 匯入出席回覆（這個站台沒開 seatingPlan，所以只會有這一顆） */
  ok('沒開排桌管理就不出現「匯入排桌名單」',
    (await page.locator('#adBtLinks [data-import-plan]').count()) === 0);

  await page.click('#adBtLinks [data-import-rsvp]');
  await page.waitForSelector('#adModalMask:not([hidden])', { timeout:5000 });
  await page.click('#adModalConfirm');
  await page.waitForFunction(
    () => /名單 1 位/.test(document.getElementById('adBtLinks').textContent),
    null, { timeout:20000 });
  ok('匯入出席回覆，說不來的那位不會被帶進去', true);

  const after = await adb.collection('butlers').doc(derived).get();
  ok('名單寫進收禮簿了',
    after.data().guests.length === 1 && after.data().guests[0].name === '黃美麗');
  ok('人數跟著回覆走', after.data().guests[0].count === 3);

  /* 現場記一筆，後台的統計要跟著動 */
  await adb.collection('butlers').doc(derived).collection('entries').add({
    guestId: after.data().guests[0].id, name:'黃美麗', code:'', table:'',
    amount: 3600, gift: true, boxes: 2, people: 3, note:'', by:'阿華',
    createdAt: Date.now(), updatedAt: Date.now(),
  });

  await page.click('.ad-subtab[data-subtab="stats"]');
  await page.waitForFunction(
    () => document.getElementById('adBtSum').textContent.includes('3,600'),
    null, { timeout:20000 });
  ok('後台看得到現場記的金額', true, await page.textContent('#adBtSum'));
  ok('明細列出那一筆',
    (await page.textContent('#adBtRows')).includes('黃美麗'));
  ok('看得出是誰收的', (await page.textContent('#adBtByWho')).includes('阿華'));

  ok('沒有 console 錯誤', errors.length === 0, errors.join(' / '));
  await page.close();
}

await browser.close();
console.log(failures ? `\n有 ${failures} 項未通過。` : '\n全部通過。');
process.exitCode = failures ? 1 : 0;
