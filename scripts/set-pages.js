#!/usr/bin/env node
/* ============================================================
   set-pages.js — 修改「已經建好」的站台要開哪些頁面
   ------------------------------------------------------------
   建站時可以用 create-site.js 的 --pages 決定；
   站台建好之後要改，就用這支（也可以直接去 Firebase Console 改，
   但 pages 是一個 map，手動一格一格點很容易打錯字）。

   用法範例：
     # 只留抽卡，其他全關（--pages 是整組覆蓋）
     node scripts/set-pages.js --slug ginny-one-20260919 --pages draw

     # 在現有設定上加減
     node scripts/set-pages.js --slug ginny-one-20260919 --disable quiz --enable rsvp

     # 只想看目前設定，不要改
     node scripts/set-pages.js --slug ginny-one-20260919 --dry-run

     # 順便補上新人後台的可用帳號（整組覆蓋，可重複給）
     node scripts/set-pages.js --slug ginny-one-20260919 \
       --owner-email groom@gmail.com --owner-email bride@gmail.com

     # 打開／關掉「賓客標籤」（配合排桌次用的進階功能，預設是關的）
     node scripts/set-pages.js --slug ginny-one-20260919 --guest-tags on

     # 關掉「入場登入」：賓客不用報上名來，一進來就是大廳
     # （只用大廳＋桌次查詢的站台適合關掉，預設是開的）
     node scripts/set-pages.js --slug ginny-one-20260919 --entry-login off

   參數：
     --slug          必填，要修改的站台代稱
     --pages         逗號分隔的完整清單，沒列到的一律關掉
     --enable        加開某頁；可重複給多次
     --disable       關掉某頁；可重複給多次
     --owner-email   重設後台可用帳號；可重複給多次
     --guest-tags    on／off，賓客標籤功能的總開關（新人自己改不動）
     --entry-login   on／off，大廳入場登入（填名字才進得去）的總開關；
                     關掉時需要名字的動作（寫祝福、送甜點）才會當場問
     --dry-run       只印出結果，不寫入資料庫
     --project       覆寫 Firebase 專案 ID

   ▸ 這是改資料不是改程式，存檔後重新整理網頁就生效，
     不需要重新 firebase deploy。

   ▸ 舊站台如果根本沒有 pages 這個欄位，前端與安全規則都會
     當成「全部開啟」。所以第一次跑這支的起點是「全開」，
     跑完才會真的寫進一組明確的開關。

   連線方式與 create-site.js 相同（Admin SDK ／ emulator）。
============================================================ */

import { parseArgs } from 'node:util';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { resolveBaseUrl } from './site-url.js';
import { OPTIONAL_PAGES, resolvePages, labelOf } from './site-pages.js';

function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      slug:          { type: 'string' },
      pages:         { type: 'string' },
      enable:        { type: 'string', multiple: true },
      disable:       { type: 'string', multiple: true },
      'owner-email': { type: 'string', multiple: true },
      'guest-tags':  { type: 'string' },
      'entry-login': { type: 'string' },
      'dry-run':     { type: 'boolean', default: false },
      base:          { type: 'string' },
      project:       { type: 'string' },
    },
  });
  return values;
}

/* 讀出目前的開關；沒有 pages 欄位就視為全開，
   跟前端 site-context.js 和 firestore.rules 的行為一致 */
function currentPages(site) {
  const raw = site.pages && typeof site.pages === 'object' ? site.pages : null;
  return Object.fromEntries(
    OPTIONAL_PAGES.map((k) => [k, raw ? raw[k] === true : true])
  );
}

function onKeys(pages) {
  return OPTIONAL_PAGES.filter((k) => pages[k]);
}

async function main() {
  const values = parseCliArgs(process.argv.slice(2));
  if (!values.slug) {
    console.error('❌ 請用 --slug 指定要修改的站台');
    console.error('   例：node scripts/set-pages.js --slug ginny-one-20260919 --pages draw');
    process.exit(1);
  }

  const initOptions = { projectId: values.project || process.env.GOOGLE_CLOUD_PROJECT };
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    initOptions.credential = applicationDefault();
  }
  initializeApp(initOptions);

  const db = getFirestore();
  const slugSnap = await db.collection('slugs').doc(values.slug).get();
  if (!slugSnap.exists) {
    throw new Error(`找不到 slug「${values.slug}」，用 npm run check-site 看看有哪些站台`);
  }
  const siteId = slugSnap.data().siteId;
  const siteRef = db.collection('sites').doc(siteId);
  const siteSnap = await siteRef.get();
  if (!siteSnap.exists) {
    throw new Error(`slug「${values.slug}」指向一個不存在的站台（sites/${siteId}）`);
  }
  const site = siteSnap.data();

  const before = currentPages(site);
  const hadPagesField = site.pages && typeof site.pages === 'object';

  const owners = values['owner-email']
    ? values['owner-email'].map((e) => e.trim().toLowerCase()).filter(Boolean)
    : null;
  owners?.forEach((e) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      throw new Error(`--owner-email 「${e}」看起來不是有效的信箱`);
    }
  });

  /* 賓客標籤與入場登入：新人在後台都改不動（規則的白名單裡沒有這兩個欄位），
     所以要開要關都從這裡下指令 */
  const guestTags  = parseSwitch(values['guest-tags'], '--guest-tags');
  const entryLogin = parseSwitch(values['entry-login'], '--entry-login');

  const touchesPages =
    values.pages !== undefined || values.enable?.length || values.disable?.length;

  if (!touchesPages && !owners && guestTags === null && entryLogin === null) {
    /* 什麼都沒指定就當成查詢 */
    console.log(`站台：${values.slug}（siteId: ${siteId}）`);
    console.log(hadPagesField ? '' : '⚠️ 這個站台還沒有 pages 欄位，目前等於「全部開啟」。');
    printPages(before);
    console.log(`   ${padDisplay('賓客標籤（排桌次用）', 28)}${
      site.guestTagsEnabled === true ? '✅ 開' : '⛔ 關'}`);
    console.log(`   ${padDisplay('入場登入（填名字進場）', 28)}${
      site.entryLoginEnabled === false ? '⛔ 關' : '✅ 開'}`);
    console.log('\n加上 --pages／--enable／--disable／--guest-tags／--entry-login 才會實際修改。');
    return;
  }

  /* --pages 沒給的話，從「目前的設定」加減，而不是從預設值 */
  const after = touchesPages ? resolvePages(values, onKeys(before)) : before;

  console.log(`站台：${values.slug}（siteId: ${siteId}）`);
  if (!hadPagesField && touchesPages) {
    console.log('ℹ️ 這個站台原本沒有 pages 欄位（等於全開），這次會寫入明確的開關。');
  }
  console.log('');
  printPages(after, before);

  if (owners) {
    console.log('');
    console.log(`   後台可用 : ${owners.length ? owners.join('、') : '（清空，將沒有人進得去）'}`);
    if (Array.isArray(site.ownerEmails) && site.ownerEmails.length) {
      console.log(`   （原本   : ${site.ownerEmails.join('、')}）`);
    }
  } else if (!Array.isArray(site.ownerEmails) || !site.ownerEmails.length) {
    console.log('');
    console.log('⚠️ 這個站台沒有 ownerEmails，新人後台目前沒有人進得去。');
    console.log('   要修的話加上 --owner-email 新人的Gmail');
  }

  if (guestTags !== null) {
    console.log('');
    console.log(`   ${padDisplay('賓客標籤（排桌次用）', 28)}${guestTags ? '✅ 開' : '⛔ 關'}${
      site.guestTagsEnabled === guestTags ? '' : (guestTags ? '  ← 這次打開' : '  ← 這次關掉')}`);
  }

  if (entryLogin !== null) {
    console.log('');
    console.log(`   ${padDisplay('入場登入（填名字進場）', 28)}${entryLogin ? '✅ 開' : '⛔ 關'}${
      (site.entryLoginEnabled !== false) === entryLogin
        ? '' : (entryLogin ? '  ← 這次打開' : '  ← 這次關掉')}`);
    if (!entryLogin) {
      console.log('     大廳不再出現入場畫面；寫祝福、送甜點時才會當場問名字。');
    }
  }

  if (values['dry-run']) {
    console.log('\n（--dry-run，沒有寫入資料庫）');
    return;
  }

  const patch = { updatedAt: FieldValue.serverTimestamp() };
  if (touchesPages) patch.pages = after;
  if (owners) patch.ownerEmails = owners;
  if (guestTags !== null) patch.guestTagsEnabled = guestTags;
  if (entryLogin !== null) patch.entryLoginEnabled = entryLogin;
  await siteRef.update(patch);

  console.log('\n✅ 已更新，重新整理網頁就會生效（不用重新 deploy）。');
  console.log(`   ${resolveBaseUrl(values.base)}/w/${values.slug}/`);
}

/* on／off 開關：沒給就回 null（代表這次不動它） */
function parseSwitch(raw, flag) {
  if (raw === undefined) return null;
  const v = String(raw).trim().toLowerCase();
  if (!['on', 'off', 'true', 'false'].includes(v)) {
    throw new Error(`${flag} 只接受 on 或 off`);
  }
  return v === 'on' || v === 'true';
}

/* 中日文字在終端機佔兩格，padEnd 會算錯，自己補空白才對得齊 */
function padDisplay(text, width) {
  let w = 0;
  for (const ch of text) w += /[⺀-￯]/.test(ch) ? 2 : 1;
  return text + ' '.repeat(Math.max(0, width - w));
}

/* 印出開關；有 before 就標出這次的變化 */
function printPages(after, before) {
  console.log(`   ${padDisplay('大廳（首頁）', 28)}✅ 開（永遠開啟）`);
  for (const key of OPTIONAL_PAGES) {
    const mark = after[key] ? '✅ 開' : '⛔ 關';
    let change = '';
    if (before && before[key] !== after[key]) {
      change = after[key] ? '  ← 這次打開' : '  ← 這次關掉';
    }
    console.log(`   ${padDisplay(labelOf(key), 28)}${mark}${change}`);
  }
}

main().catch((err) => {
  console.error(`❌ 修改失敗：${err.message}`);
  process.exit(1);
});
