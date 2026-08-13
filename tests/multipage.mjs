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

const ALL_PAGES = ['rsvp','wall','cake','draw','exhibition','quiz','inbox','invitation',
  'seating','letter'];
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
    pages: Object.fromEntries(ALL_PAGES.map((k) => [k, k === 'rsvp'])),
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

const SLUG = 'ginny-one-20260919';
/* 素材測試用的站台，slug 對應 public/assets/demo-wedding-2027/ */
const ASSET_SLUG = 'demo-wedding-2027';

/* ---------- 每一頁都要載得起來 ---------- */
console.log('\n[1] 每個頁面都能正常載入');
for(const key of ['', 'rsvp', 'wall', 'cake', 'draw', 'exhibition', 'quiz', 'inbox',
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
  /* 內建 7 張（wall/exhibition/quiz/draw/cake/seating/letter 都開著）
     ＋ 新人自訂的 2 張。自訂卡是非同步讀進來的，等它出現再數 */
  await page.waitForSelector('.link-card.is-custom', { timeout: 10000 }).catch(() => {});
  const cardCount = await page.locator('.link-card').count();
  ok('首頁卡片＝內建 7 張＋自訂 2 張', cardCount === 9, String(cardCount));
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
    !links.some((h) => /\/(wall|cake|draw|exhibition|quiz|inbox|seating|letter)$/.test(h)),
    links.join(', '));
  ok('已啟用的 rsvp 入口仍在', links.some((h) => h.endsWith('/rsvp')), links.join(', '));
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

/* ---------- 悄悄話信箱：只有新人讀得到 ---------- */
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
    pages: { ...allOn, letter: false },
  });
  const { page } = await visit(`/w/${SLUG}/seating`);
  await page.waitForFunction(() => DataStore.getSeating().length > 0, null, { timeout:10000 });
  await page.fill('#stInput', '王小明');
  await page.click('#stBtn');
  await page.waitForTimeout(800);
  ok('關掉信件頁時不顯示信件入口',
    (await page.locator('.st-letter').count()) === 0);
  await page.close();
  await adb.collection('sites').doc(siteIds[SLUG]).update({ pages: allOn });
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

  ok('祝福信頁無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
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
    idx.join(',') === '01,02,03,04,05,06,07,08,09', idx.join(','));

  ok('首頁無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}

/* ---------- 新人後台 ---------- */
console.log('\n[14] 新人後台');

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

  ok('後台讀得到全部回覆',
    Number(await page.textContent('#adRsvpYes'))
      + Number(await page.textContent('#adRsvpMaybe'))
      + Number(await page.textContent('#adRsvpNo')) === rows.length,
    `資料庫 ${rows.length} 筆`);
  ok('確定出席人數是依 guestCount 加總',
    Number(await page.textContent('#adRsvpHead')) === expectHead, `應為 ${expectHead}`);

  const listText = await page.innerText('#adRsvpList');
  ok('名單列出賓客的名字', listText.includes('王小明'), listText.replace(/\n/g, ' ').slice(0, 80));

  /* 篩選：只看「未定」 */
  await page.click('#adRsvpChips .ad-chip[data-filter="maybe"]');
  await page.waitForTimeout(200);
  const maybeCount = await page.locator('#adRsvpList .ad-item').count();
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

  ok('後台無 console 錯誤', realErrors(errors).length === 0,
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

  /* 當日流程：兩列 */
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

/* ---------- 後台上傳囍卡（含裁切器） ---------- */
console.log('\n[16] 後台上傳囍卡與展品');

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

  /* --- 囍卡 --- */
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
  ok('囍卡寫進 Firestore', cards.size === 1, `${cards.size} 張`);
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

  /* --- 展品與章節 --- */
  await page.click('.ad-tab[data-tab="exhibits"]');
  await page.selectOption('#adExhKind', 'act');
  await page.fill('#adExhTitle', '第一幕');
  await page.fill('#adExhSub', '我們的相遇');
  await page.fill('#adExhOrder', '1');
  await page.click('#adExhForm button[type="submit"]');
  await page.waitForTimeout(1200);

  await page.selectOption('#adExhKind', 'photo');
  await page.setInputFiles('#adExhFile', TEST_PNG);
  await page.waitForSelector('.cr-mask', { timeout:10000 });
  await page.click('#crOk');
  await page.waitForSelector('.cr-mask', { state:'detached', timeout:15000 });
  ok('展品照片有預覽', await page.isVisible('#adExhPrev img'));

  await page.fill('#adExhTitle', '第一次一起旅行');
  await page.fill('#adExhYear', '2021');
  await page.fill('#adExhSub', '夏天');
  await page.fill('#adExhDesc', '那天下著大雨，我們還是走完了整條老街。');
  await page.fill('#adExhOrder', '2');
  await page.click('#adExhForm button[type="submit"]');
  await page.waitForTimeout(1500);

  const exhibits = await adb.collection('sites').doc(siteIds[SLUG])
    .collection('exhibits').orderBy('order').get();
  ok('展覽存了兩筆', exhibits.size === 2, `${exhibits.size} 筆`);
  const [act, photo] = exhibits.docs.map((d) => d.data());
  ok('第一筆是章節卡', act.kind === 'act' && act.title === '第一幕', JSON.stringify(act));
  ok('第二筆是展品', photo.kind === 'photo' && photo.title === '第一次一起旅行');
  ok('展品照片是 data URL',
    String(photo.img || '').startsWith('data:image/jpeg;base64,'),
    String(photo.img || '').slice(0, 24));

  ok('囍卡與展覽分頁無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}
{
  /* 賓客那一側：抽卡用新人上傳的卡，收藏只記 cardId */
  const { page, errors } = await visit(`/w/${SLUG}/draw`);
  await page.waitForFunction(() => DataStore.getCards().length > 0, null, { timeout:10000 });
  const cards = await page.evaluate(() => CARDS.map((c) => `${c.name}(${c.rarity})`));
  ok('抽卡用新人上傳的卡池', cards.join('、') === '海邊的我們・改(SSR)', cards.join('、'));

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
  ok('時間軸只剩新人設定的展品',
    nodes.photos.join('、') === '第一次一起旅行', nodes.photos.join('、'));
  ok('章節分隔卡有出現', nodes.acts.join('、') === '第一幕', nodes.acts.join('、'));
  ok('展品照片有畫出來', nodes.imgs === 1, String(nodes.imgs));
  ok('戀愛時光無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}

/* ---------- 後台的測驗題目 ---------- */
console.log('\n[17] 後台出測驗題目');

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
  const seeded = (await quizCol.orderBy('order').get()).docs.map((d) => d.data());
  ok('第一次打開就寫進 3 題預設題目', seeded.length === 3, `${seeded.length} 題`);
  ok('預設題目的題號是 1、2、3',
    seeded.map((q) => q.order).join(',') === '1,2,3', seeded.map((q) => q.order).join(','));
  ok('每題都是四個選項',
    seeded.every((q) => Array.isArray(q.opts) && q.opts.length === 4),
    seeded.map((q) => (q.opts || []).length).join(','));
  ok('預設題目有單選也有複選',
    seeded.some((q) => q.type === 'single') && seeded.some((q) => q.type === 'multi'),
    seeded.map((q) => q.type).join(','));

  /* 新增一題複選 */
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

  const added = (await quizCol.orderBy('order').get()).docs.map((d) => d.data()).pop();
  ok('新題目排在最後', added.order === 4, String(added.order));
  ok('新題目是複選、答案有兩個',
    added.type === 'multi' && added.answer.join(',') === '0,2',
    `${added.type} / ${added.answer.join(',')}`);
  ok('選項內容照原文存下來', added.opts[0] === LONG_OPT, added.opts[0]);

  /* 調順序：把第一題往後移 */
  const before = (await quizCol.orderBy('order').get()).docs.map((d) => d.id);
  await page.click('#adQuizList .ad-item:nth-child(1) [data-quiz-down]');
  await page.waitForTimeout(1800);
  const after = (await quizCol.orderBy('order').get()).docs.map((d) => d.id);
  ok('↓ 把第一題換到第二題',
    after[0] === before[1] && after[1] === before[0], after.slice(0, 2).join(' → '));
  ok('順序仍然是連號 1…4',
    (await quizCol.orderBy('order').get()).docs
      .map((d) => d.data().order).join(',') === '1,2,3,4');

  /* 刪一題 */
  const delId = after[after.length - 1];
  await page.click(`#adQuizList [data-del-quiz="${delId}"]`);
  await page.waitForFunction(() => DataStore.getQuiz().length === 3, null, { timeout:15000 });
  ok('刪得掉題目', (await quizCol.get()).size === 3, `${(await quizCol.get()).size} 題`);

  ok('測驗分頁無 console 錯誤', realErrors(errors).length === 0,
    realErrors(errors).slice(0, 2).join(' | '));
  await page.close();
}

/* ---------- 賓客那一側的測驗 ---------- */
console.log('\n[17b] 賓客做測驗');
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
  /* 後台看得到剛剛那筆作答，也清得掉 */
  const { page } = await visit(`/w/${SLUG}/admin`);
  page.on('dialog', (d) => d.accept());
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });
  await page.click('.ad-tab[data-tab="quiz"]');
  await page.waitForFunction(() => DataStore.getQuizVotes().length === 1, null, { timeout:15000 });
  ok('後台看得到作答人數',
    (await page.textContent('#adQuizVoteCount')) === '1',
    await page.textContent('#adQuizVoteCount'));

  await page.click('#adQuizWipe');
  await page.waitForTimeout(1800);
  ok('新人清得掉作答紀錄', (await voteCol.get()).size === 0, `${(await voteCol.get()).size} 筆`);
  ok('題目沒被一起清掉', (await quizCol.get()).size === 4, `${(await quizCol.get()).size} 題`);
  await page.close();
}

/* ---------- 手機版 ---------- */
console.log('\n[8] 手機版無水平捲動');
for(const key of ['', 'wall', 'rsvp', 'quiz', 'seating', 'letter']){
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

{
  /* 後台分頁多，手機上要能橫向滑動，但不能把整頁撐寬 */
  const page = await newPage({ viewport:{ width:375, height:812 } });
  await page.goto(`${BASE}/w/${SLUG}/admin`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(
    () => document.documentElement.dataset.siteReady === '1', null, { timeout:20000 });
  await signInAsOwner(page, 'couple@example.com');
  await page.waitForSelector('#adPage:not([hidden])', { timeout:15000 });
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('/admin 無水平捲動', overflow <= 1, `溢出 ${overflow}px`);
  ok('分頁列可以橫向滑動',
    await page.evaluate(() => {
      const el = document.getElementById('adTabs');
      return el.scrollWidth > el.clientWidth;
    }));
  await page.close();
}

await browser.close();
console.log(failures ? `\n有 ${failures} 項未通過。` : '\n全部通過。');
process.exitCode = failures ? 1 : 0;
