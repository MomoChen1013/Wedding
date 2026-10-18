#!/usr/bin/env node
/* ============================================================
   migrate-site-owners.js — 把新人白名單從 sites.ownerEmails 搬到 siteOwners/{siteId}
   ------------------------------------------------------------
   用法：
     node scripts/migrate-site-owners.js --dry-run   # 只列出會做什麼
     node scripts/migrate-site-owners.js             # 第 1 步：複製到 siteOwners（舊欄位先留著）
     node scripts/migrate-site-owners.js --strip     # 第 3 步：把 sites 裡的舊欄位刪掉

   為什麼要搬：sites/{siteId} 是任何人都讀得到的公開文件，
   新人的 Google 信箱放在那裡等於公開。新的規則只認 siteOwners/{siteId}。

   ⚠️ 上線順序（一定要照這個順序）：
     1. node scripts/migrate-site-owners.js            複製名單（舊欄位還在，舊版前端照常可用）
     2. npx firebase deploy --only firestore:rules,hosting
                                                       新規則只認 siteOwners，新版前端也改讀它
     3. node scripts/migrate-site-owners.js --strip    確認新人登得進後台之後，刪掉公開文件裡的信箱
   第 1 步沒做就部署第 2 步，所有新人都會進不了後台。

   連線方式與 create-site.js 相同（Admin SDK ／ emulator）。可以重複執行。
============================================================ */
import { parseArgs } from 'node:util';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { ownersRef, normalizeOwners, writeOwners } from './site-owners.js';

const { values } = parseArgs({
  options: {
    strip: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    project: { type: 'string' },
  },
});

const initOptions = { projectId: values.project || process.env.GOOGLE_CLOUD_PROJECT };
if (!process.env.FIRESTORE_EMULATOR_HOST) initOptions.credential = applicationDefault();
initializeApp(initOptions);
const db = getFirestore();
const dry = values['dry-run'];

const sites = await db.collection('sites').get();
let copied = 0, stripped = 0, skipped = 0, missing = 0;

for (const d of sites.docs) {
  const s = d.data();
  const legacy = Array.isArray(s.ownerEmails) ? s.ownerEmails : null;
  const ownSnap = await ownersRef(db, d.id).get();
  const label = `${s.slug || '(沒有 slug)'}（${d.id}）`;

  if (!values.strip) {
    if (ownSnap.exists) { skipped++; continue; }                 /* 搬過了：以 siteOwners 為準，不覆蓋 */
    if (!legacy || !legacy.length) { missing++; console.log(`⚠️  ${label}：沒有任何新人信箱`); continue; }
    console.log(`→ ${label}：${normalizeOwners(legacy).join('、')}`);
    if (!dry) await writeOwners(db, d.id, legacy);
    copied++;
  } else {
    if (!legacy) continue;
    if (!ownSnap.exists) {
      console.log(`⛔ ${label}：siteOwners 還沒有這一份，先不刪（請先不加 --strip 跑一次）`);
      continue;
    }
    console.log(`✂️  ${label}：刪掉 sites.ownerEmails`);
    if (!dry) await d.ref.update({ ownerEmails: FieldValue.delete() });
    stripped++;
  }
}

console.log('');
if (!values.strip) {
  console.log(`複製 ${copied} 個站台、已經搬過 ${skipped} 個、沒有信箱 ${missing} 個${dry ? '（--dry-run，沒有寫入）' : ''}`);
  if (!dry && copied) console.log('下一步：npx firebase deploy --only firestore:rules,hosting，確認新人登得進後台後再跑 --strip');
} else {
  console.log(`刪掉 ${stripped} 個站台的 sites.ownerEmails${dry ? '（--dry-run，沒有寫入）' : ''}`);
}
