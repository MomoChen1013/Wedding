#!/usr/bin/env node
/* ============================================================
   export-rsvps.js — 匯出某站台的 RSVP 成 CSV
   ------------------------------------------------------------
   用法範例：
     node scripts/export-rsvps.js --slug chen-lin-0315
     node scripts/export-rsvps.js --slug chen-lin-0315 --out rsvps.csv
     node scripts/export-rsvps.js --site-id abc123XYZ

   參數：
     --slug      站台的網址代稱（與 --site-id 擇一）
     --site-id   直接指定 siteId（與 --slug 擇一）
     --out       選填，輸出檔名；不給則印到 stdout
     --project   選填，覆寫 Firebase 專案 ID

   連線方式與 create-site.js 相同（Admin SDK ／ emulator）。
   賓客的 RSVP 前端讀不到，只有這支腳本用管理員權限能匯出。
============================================================ */

import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/* 代號 → 中文。與 public/js/common.js 的 RSVP_OPTIONS 對齊，
   匯出的 CSV 才和後台儀表板／名單上寫的是同一組字。 */
const LABELS = {
  relation:     { groom:'男方親友', bride:'女方親友', both:'雙方親友', other:'其他' },
  cardType:     { paper:'需要紙本喜帖', digital:'需要電子喜帖', none:'不需要喜帖' },
  cardDelivery: { pickup:'自行領取', mail:'郵寄' },
  giftDelivery: { pickup:'現場領取', mail:'郵寄' },
};

const COLUMNS = [
  ['name',         '稱呼'],
  ['attending',    '是否出席'],
  ['relation',     '與新人關係'],
  /* 賓客自己選的那個標籤 ＋ 新人在後台掛的（存在 rsvpTags 子集合） */
  ['tags',         '標籤'],
  ['contactPhone', '電話'],
  ['contactLine',  'LINE'],
  ['contactEmail', 'Email'],
  ['guestCount',   '人數'],
  ['mealMeat',     '葷食'],
  ['mealVeg',      '素食'],
  ['childSeat',    '兒童座椅'],
  ['dietaryNote',  '飲食習慣'],
  ['cardType',     '喜帖'],
  ['cardDelivery', '喜帖領取'],
  ['cardZip',      '喜帖郵遞區號'],
  ['cardAddress',  '喜帖地址'],
  ['cardEmail',    '喜帖 Email'],
  ['giftDelivery', '喜餅'],
  ['giftZip',      '喜餅郵遞區號'],
  ['giftAddress',  '喜餅地址'],
  ['message',      '給新人的話'],
  ['note',         '其他備註'],
  ['createdAt',    '回覆時間'],
];

function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      slug:      { type: 'string' },
      'site-id': { type: 'string' },
      out:       { type: 'string' },
      project:   { type: 'string' },
    },
  });
  return values;
}

/* CSV 逃脫：含逗號、引號或換行就用雙引號包起來 */
function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* 以婚禮當地時區顯示回覆時間，跟邀請函頁面一致 */
function formatTime(ts, timeZone) {
  if (!ts || typeof ts.toDate !== 'function') return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(ts.toDate());
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}`;
}

async function resolveSiteId(db, values) {
  if (values['site-id']) return values['site-id'];
  if (!values.slug) throw new Error('請用 --slug 或 --site-id 指定站台');

  const snap = await db.collection('slugs').doc(values.slug).get();
  if (!snap.exists) {
    throw new Error(`找不到 slug 「${values.slug}」對應的站台`);
  }
  return snap.data().siteId;
}

async function exportRsvps(values) {
  const db = getFirestore();
  const siteId = await resolveSiteId(db, values);

  const siteSnap = await db.collection('sites').doc(siteId).get();
  if (!siteSnap.exists) {
    throw new Error(`找不到 siteId 「${siteId}」的站台資料`);
  }
  const site = siteSnap.data();
  const timeZone = site.timezone || 'Asia/Taipei';

  const rsvpSnap = await db
    .collection('sites').doc(siteId)
    .collection('rsvps')
    .orderBy('createdAt', 'asc')
    .get();

  /* 標籤：站台文件裡是「標籤庫」（id → 名字），
     掛在誰身上則在 rsvpTags/{回覆 id}。兩邊合起來才是一位賓客的標籤。 */
  const tagNames = new Map(
    (Array.isArray(site.guestTags) ? site.guestTags : [])
      .filter((t) => t && t.id && t.name)
      .map((t) => [String(t.id), String(t.name)])
  );
  const ownerTags = new Map();
  const tagSnap = await db
    .collection('sites').doc(siteId).collection('rsvpTags').get();
  tagSnap.forEach((d) => {
    ownerTags.set(d.id, Array.isArray(d.data().tags) ? d.data().tags.map(String) : []);
  });
  const tagsOf = (docId, data) => [
    ...new Set([String(data.tag || ''), ...(ownerTags.get(docId) || [])].filter(Boolean)),
  ].map((id) => tagNames.get(id)).filter(Boolean).join('／');

  const rows = [COLUMNS.map(([, label]) => label).join(',')];
  let attendingGroups = 0;
  let totalGuests = 0;

  rsvpSnap.forEach((docSnap) => {
    const d = docSnap.data();
    if (d.attending) {
      attendingGroups += 1;
      totalGuests += Number(d.guestCount) || 0;
    }
    rows.push(COLUMNS.map(([key]) => {
      if (key === 'attending') {
        /* tentative=true 代表「視情況而定」（此時 attending 為 false） */
        if (d.attending) return csvCell('熱情出席');
        return csvCell(d.tentative ? '視情況而定' : '無法出席');
      }
      if (key === 'createdAt') return csvCell(formatTime(d.createdAt, timeZone));
      if (key === 'tags') return csvCell(tagsOf(docSnap.id, d));
      /* 只有真的會來才有人數與餐點，其餘留空比填 0 好讀 */
      if (['guestCount', 'mealMeat', 'mealVeg', 'childSeat'].includes(key)) {
        return csvCell(d.attending ? (d[key] ?? '') : '');
      }
      /* 沒選紙本喜帖時，領取方式沒有意義 */
      if (key === 'cardDelivery' && d.cardType !== 'paper') return csvCell('');
      if (LABELS[key]) return csvCell(LABELS[key][d[key]] ?? d[key] ?? '');
      return csvCell(d[key]);
    }).join(','));
  });

  /* Excel 開 UTF-8 CSV 需要 BOM，否則中文會變亂碼 */
  const csv = `﻿${rows.join('\n')}\n`;

  return {
    csv,
    stats: {
      couple: `${site.groomName} & ${site.brideName}`,
      total: rsvpSnap.size,
      attendingGroups,
      totalGuests,
    },
  };
}

async function main() {
  const values = parseCliArgs(process.argv.slice(2));

  const initOptions = { projectId: values.project || process.env.GOOGLE_CLOUD_PROJECT };
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    initOptions.credential = applicationDefault();
  }
  initializeApp(initOptions);

  const { csv, stats } = await exportRsvps(values);

  if (values.out) {
    writeFileSync(values.out, csv, 'utf8');
    console.log('✅ 匯出完成！');
    console.log(`   站台   : ${stats.couple}`);
    console.log(`   回覆數 : ${stats.total} 筆`);
    console.log(`   出席   : ${stats.attendingGroups} 組・共 ${stats.totalGuests} 位`);
    console.log(`   檔案   : ${values.out}`);
  } else {
    process.stdout.write(csv);
  }
}

main().catch((err) => {
  console.error(`❌ 匯出失敗：${err.message}`);
  process.exit(1);
});
