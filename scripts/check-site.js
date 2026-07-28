#!/usr/bin/env node
/* ============================================================
   check-site.js — 檢查某個站台為什麼打不開
   ------------------------------------------------------------
   用法：
     node scripts/check-site.js --slug ginny-one-20260919
     node scripts/check-site.js                 # 列出全部站台

   會檢查並指出常見的問題：
     ・slugs/{slug} 有沒有建立
     ・sites/{siteId} 存不存在
     ・status 是不是 published（draft 會被當成不存在）
     ・pages 開了哪些頁
     ・ownerEmails 有沒有設（沒設的話悄悄話信箱沒人讀得到）
     ・rsvpDeadline 是不是已經過了

   連線方式與 create-site.js 相同（Admin SDK ／ emulator）。
============================================================ */

import { parseArgs } from 'node:util';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const BASE = 'https://minato.3udesign.website';

function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      slug:    { type: 'string' },
      base:    { type: 'string', default: BASE },
      project: { type: 'string' },
    },
  });
  return values;
}

function fmtDate(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '（未設定）';
  return ts.toDate().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

async function listAll(db) {
  const snap = await db.collection('slugs').get();
  if (snap.empty) {
    console.log('資料庫裡還沒有任何站台。');
    console.log('用 scripts/create-site.js 建立第一組。');
    return;
  }
  console.log(`共 ${snap.size} 個站台：\n`);
  for (const d of snap.docs) {
    const siteSnap = await db.collection('sites').doc(d.data().siteId).get();
    const s = siteSnap.exists ? siteSnap.data() : null;
    const mark = !s ? '❌' : s.status === 'published' ? '✅' : '⚠️ ';
    const status = !s ? '找不到 site 文件' : s.status;
    console.log(`${mark} ${d.id.padEnd(28)} ${status}`);
  }
  console.log('\n用 --slug 看單一站台的細節。');
}

async function checkOne(db, slug, base) {
  const problems = [];
  console.log(`檢查站台：${slug}\n`);

  /* 1. slug 對照表 */
  const slugSnap = await db.collection('slugs').doc(slug).get();
  if (!slugSnap.exists) {
    console.log('❌ slugs/' + slug + ' 不存在');
    console.log('   → 這個 slug 沒有建立過，或建立時打錯字。');
    console.log('   → 用 node scripts/check-site.js（不加參數）看看有哪些站台。');
    return 1;
  }
  const siteId = slugSnap.data().siteId;
  console.log(`✅ slugs/${slug} → siteId: ${siteId}`);

  /* 2. site 本體 */
  const siteSnap = await db.collection('sites').doc(siteId).get();
  if (!siteSnap.exists) {
    console.log(`❌ sites/${siteId} 不存在（slug 指向一個不存在的站台）`);
    return 1;
  }
  const s = siteSnap.data();
  console.log(`✅ sites/${siteId} 存在`);
  console.log('');

  /* 3. 發布狀態 —— 最常見的「打不開」原因 */
  if (s.status === 'published') {
    console.log('✅ status: published（賓客看得到）');
  } else {
    console.log(`❌ status: ${s.status}`);
    console.log('   → 不是 published 的站台，前端一律當成「找不到這張邀請函」。');
    console.log('   → 到 Firebase Console → Firestore → sites → 這筆文件，');
    console.log('      把 status 改成 published。');
    problems.push('status 不是 published');
  }

  /* 4. 基本內容 */
  console.log('');
  console.log(`   新人     : ${s.groomName || '（未設定）'} & ${s.brideName || '（未設定）'}`);
  console.log(`   婚禮日期 : ${fmtDate(s.eventDate)}（時區 ${s.timezone || 'Asia/Taipei'}）`);
  console.log(`   場地     : ${s.venueName || '（未設定）'}`);
  console.log(`   主題色   : ${s.themeColor || '（預設）'}`);

  /* 5. 頁面開關 */
  console.log('');
  if (!s.pages || typeof s.pages !== 'object') {
    console.log('ℹ️  沒有 pages 欄位 → 視為「全部頁面都開」');
  } else {
    const on = Object.entries(s.pages).filter(([, v]) => v).map(([k]) => k);
    const off = Object.entries(s.pages).filter(([, v]) => !v).map(([k]) => k);
    console.log(`   已開頁面 : 大廳（固定）${on.length ? '、' + on.join('、') : ''}`);
    if (off.length) console.log(`   已關頁面 : ${off.join('、')}`);
  }

  /* 6. RSVP */
  console.log('');
  if (s.rsvpEnabled === false) {
    console.log('ℹ️  rsvpEnabled: false → 出席回覆表單不會出現');
  } else if (s.rsvpDeadline && s.rsvpDeadline.toDate() < new Date()) {
    console.log(`⚠️  RSVP 已截止（${fmtDate(s.rsvpDeadline)}）→ 表單會顯示「已截止」`);
    problems.push('RSVP 截止日已過');
  } else {
    console.log(`✅ RSVP 開放中，截止 ${fmtDate(s.rsvpDeadline)}`);
  }

  /* 7. 悄悄話信箱 */
  const owners = Array.isArray(s.ownerEmails) ? s.ownerEmails : [];
  if (owners.length) {
    console.log(`✅ 信箱可讀帳號 : ${owners.join('、')}`);
  } else {
    console.log('⚠️  沒有設定 ownerEmails → 悄悄話信箱沒有人讀得到');
    problems.push('未設定 ownerEmails');
  }

  /* 8. 網址 */
  const root = base.replace(/\/+$/, '');
  console.log('');
  console.log('網址：');
  console.log(`   大廳 : ${root}/w/${slug}/`);
  const pageKeys = s.pages && typeof s.pages === 'object'
    ? Object.entries(s.pages).filter(([, v]) => v).map(([k]) => k)
    : ['info', 'rsvp', 'wall', 'cake', 'draw', 'exhibition', 'quiz', 'inbox', 'invitation'];
  pageKeys.forEach((k) => console.log(`          ${root}/w/${slug}/${k}`));

  console.log('');
  if (problems.length) {
    console.log(`⚠️  有 ${problems.length} 個問題：${problems.join('、')}`);
    return 1;
  }
  console.log('✅ 資料看起來沒問題。');
  console.log('   如果網頁還是打不開，問題多半在 Hosting 那一側：');
  console.log(`   先試預設網域 https://<專案ID>.web.app/w/${slug}/`);
  console.log('   打得開 → 是自訂網域還沒指到這個專案；打不開 → 是還沒 deploy hosting。');
  return 0;
}

async function main() {
  const values = parseCliArgs(process.argv.slice(2));

  const initOptions = { projectId: values.project || process.env.GOOGLE_CLOUD_PROJECT };
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    initOptions.credential = applicationDefault();
  }
  initializeApp(initOptions);
  const db = getFirestore();

  const code = values.slug
    ? await checkOne(db, values.slug.trim().toLowerCase(), values.base)
    : (await listAll(db), 0);

  process.exitCode = code;
}

main().catch((err) => {
  console.error(`❌ 檢查失敗：${err.message}`);
  process.exit(1);
});
