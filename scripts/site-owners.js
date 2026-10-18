/* ============================================================
   site-owners.js — 新人白名單（誰進得了後台）的讀寫，給 Admin SDK 的腳本共用
   ------------------------------------------------------------
   白名單放在 siteOwners/{siteId}：{ emails: ['小寫信箱', …], updatedAt }
   不放在 sites/{siteId} —— 那份是任何人都讀得到的公開文件，信箱放在那裡等於公開。
   規則見 firestore.rules 的 isSiteOwner() 與 match /siteOwners。

   舊的站台把名單放在 sites.ownerEmails；scripts/migrate-site-owners.js 會搬過來。
   readOwners() 讀不到新位置時會退回舊欄位，讓還沒搬的站台在檢查時也看得到原本的名單。
============================================================ */
import { FieldValue } from 'firebase-admin/firestore';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* 整理成規則比對用的樣子：去空白、轉小寫、去重複；格式不對直接報錯 */
export function normalizeOwners(list) {
  const out = [...new Set((list || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
  out.forEach((e) => {
    if (!EMAIL.test(e)) throw new Error(`「${e}」看起來不是有效的信箱`);
  });
  return out;
}

export function ownersRef(db, siteId) {
  return db.collection('siteOwners').doc(siteId);
}

/* 回傳 { emails, legacy }：legacy=true 表示還是舊欄位 sites.ownerEmails（還沒搬） */
export async function readOwners(db, siteId, siteData) {
  const snap = await ownersRef(db, siteId).get();
  if (snap.exists && Array.isArray(snap.data().emails)) return { emails: snap.data().emails, legacy: false };
  const old = siteData && Array.isArray(siteData.ownerEmails) ? siteData.ownerEmails : [];
  return { emails: old, legacy: old.length > 0 };
}

/* 寫入新位置；tx 有給就排進同一個 transaction／batch */
export function writeOwners(db, siteId, emails, tx) {
  const data = { emails: normalizeOwners(emails), updatedAt: FieldValue.serverTimestamp() };
  const ref = ownersRef(db, siteId);
  return tx ? tx.set(ref, data) : ref.set(data);
}
