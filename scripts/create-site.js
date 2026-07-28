#!/usr/bin/env node
/* ============================================================
   create-site.js — 建立客戶站台（slug + site 同一 transaction）
   ------------------------------------------------------------
   用法範例：
     node scripts/create-site.js \
       --slug chen-lin-0315 --groom 陳彥廷 --bride 林佳蓉 --date 2026-03-15

   完整參數：
     --slug           必填，網址代稱（小寫英數與連字號，3–40 字）
     --groom          必填，新郎姓名
     --bride          必填，新娘姓名
     --date           必填，婚禮日期 YYYY-MM-DD
     --time           選填，婚禮時間 HH:mm，預設 12:00
     --timezone       選填，婚禮所在時區（IANA），預設 Asia/Taipei
                       邀請函一律以這個時區顯示時間，海外賓客才不會看錯
     --venue          選填，場地名稱
     --address        選填，場地地址
     --map-url        選填，Google Maps 連結
     --theme-color    選填，主題色 hex，預設 #3D9AD1
     --cover          選填，封面圖片網址
     --story          選填，兩人的故事
     --owner-email    選填，新人聯絡信箱
     --status         選填，draft／published／archived，預設 draft
     --rsvp-deadline  選填，RSVP 截止日 YYYY-MM-DD，預設同婚禮日期
     --rsvp-enabled   選填，true／false，預設 true
     --project        選填，覆寫 Firebase 專案 ID（預設用 GOOGLE_CLOUD_PROJECT
                       或 service account key 內的 project_id）

   連線方式：
     1) 正式環境：需先設定 GOOGLE_APPLICATION_CREDENTIALS 指向
        Firebase Console →專案設定→服務帳戶→產生新的私密金鑰 下載的 JSON。
     2) 本機測試：先啟動 `firebase emulators:start --only firestore`，
        再設定環境變數 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 執行本腳本，
        會自動改寫入 emulator，不會動到正式資料。
============================================================ */

import { parseArgs } from 'node:util';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';

/* ---------- 保留字黑名單 ---------- */
const RESERVED_SLUGS = new Set(['admin', 'api', 'www', 'app', 'w', 's', 'assets', 'static']);
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/* ---------- 參數解析 ---------- */
function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      slug:          { type: 'string' },
      groom:         { type: 'string' },
      bride:         { type: 'string' },
      date:          { type: 'string' },
      time:          { type: 'string', default: '12:00' },
      timezone:      { type: 'string', default: 'Asia/Taipei' },
      venue:         { type: 'string', default: '' },
      address:       { type: 'string', default: '' },
      'map-url':     { type: 'string', default: '' },
      'theme-color': { type: 'string', default: '#3D9AD1' },
      cover:         { type: 'string', default: '' },
      story:         { type: 'string', default: '' },
      'owner-email': { type: 'string', default: '' },
      status:        { type: 'string', default: 'draft' },
      'rsvp-deadline': { type: 'string' },
      'rsvp-enabled':  { type: 'string', default: 'true' },
      project:       { type: 'string' },
    },
  });
  return values;
}

/* ---------- 驗證 ---------- */
function assertValidSlug(slug) {
  if (!slug) {
    throw new Error('請用 --slug 指定網址代稱');
  }
  if (slug.length < 3 || slug.length > 40) {
    throw new Error(`slug 長度必須介於 3–40 字之間（目前 ${slug.length} 字）`);
  }
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error('slug 格式不合法，只允許小寫英數與連字號，例如 "chen-lin-0315"');
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new Error(`slug 「${slug}」是保留字，請換一個`);
  }
}

/* 把「某時區的牆上時間」轉成正確的 UTC 瞬間（可處理日光節約時間） */
function parseDateTime(dateStr, timeStr, timeZone, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`${label} 格式錯誤，請用 YYYY-MM-DD（目前收到 "${dateStr}"）`);
  }
  if (!/^\d{2}:\d{2}$/.test(timeStr)) {
    throw new Error(`時間格式錯誤，請用 HH:mm（目前收到 "${timeStr}"）`);
  }

  const naive = new Date(`${dateStr}T${timeStr}:00Z`);
  if (Number.isNaN(naive.getTime())) {
    throw new Error(`${label} 不是有效的日期（目前收到 "${dateStr}"）`);
  }

  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(naive);
  } catch {
    throw new Error(`--timezone 「${timeZone}」不是有效的時區，例如 Asia/Taipei、Asia/Tokyo`);
  }

  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const asUtc = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    get('hour') % 24, get('minute'), get('second'),
  );
  /* naive 被當成該時區的時間後多出來的位移，扣掉才是真正的 UTC 瞬間 */
  return new Date(naive.getTime() - (asUtc - naive.getTime()));
}

function assertValidStatus(status) {
  if (!['draft', 'published', 'archived'].includes(status)) {
    throw new Error('--status 只能是 draft／published／archived 其中之一');
  }
}

/* ---------- 建站主流程 ---------- */
async function createSite(values) {
  const slug = (values.slug || '').trim();
  const groomName = (values.groom || '').trim();
  const brideName = (values.bride || '').trim();

  assertValidSlug(slug);
  if (!groomName) throw new Error('請用 --groom 指定新郎姓名');
  if (!brideName) throw new Error('請用 --bride 指定新娘姓名');
  if (!values.date) throw new Error('請用 --date 指定婚禮日期（YYYY-MM-DD）');
  assertValidStatus(values.status);

  const timezone = values.timezone;
  const eventDate = parseDateTime(values.date, values.time, timezone, '--date');
  const rsvpDeadline = values['rsvp-deadline']
    ? parseDateTime(values['rsvp-deadline'], '23:59', timezone, '--rsvp-deadline')
    : eventDate;
  const rsvpEnabled = values['rsvp-enabled'] !== 'false';

  const db = getFirestore();
  const siteRef = db.collection('sites').doc();
  const slugRef = db.collection('slugs').doc(slug);

  const siteData = {
    slug,
    ownerEmail: values['owner-email'] || '',
    status: values.status,
    groomName,
    brideName,
    eventDate: Timestamp.fromDate(eventDate),
    timezone,
    venueName: values.venue || '',
    venueAddress: values.address || '',
    venueMapUrl: values['map-url'] || '',
    themeColor: values['theme-color'] || '#3D9AD1',
    coverImageUrl: values.cover || '',
    story: values.story || '',
    rsvpDeadline: Timestamp.fromDate(rsvpDeadline),
    rsvpEnabled,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await db.runTransaction(async (tx) => {
    const slugSnap = await tx.get(slugRef);
    if (slugSnap.exists) {
      throw new Error(`slug 「${slug}」已經被使用了，請換一個網址代稱`);
    }
    tx.set(siteRef, siteData);
    tx.set(slugRef, {
      siteId: siteRef.id,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { siteId: siteRef.id, slug };
}

/* ---------- CLI 進入點 ---------- */
async function main() {
  const values = parseCliArgs(process.argv.slice(2));

  const initOptions = { projectId: values.project || process.env.GOOGLE_CLOUD_PROJECT };
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    initOptions.credential = applicationDefault();
  }
  initializeApp(initOptions);

  const { siteId, slug } = await createSite(values);

  console.log('✅ 站台建立成功！');
  console.log(`   siteId : ${siteId}`);
  console.log(`   slug   : ${slug}`);
  console.log(`   網址   : https://minato.3udesign.website/w/${slug}`);
}

main().catch((err) => {
  console.error(`❌ 建立站台失敗：${err.message}`);
  process.exit(1);
});
