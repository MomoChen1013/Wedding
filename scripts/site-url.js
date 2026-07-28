/* ============================================================
   site-url.js — 決定站台的對外網址前綴
   ------------------------------------------------------------
   優先序：
     1. 指令參數 --base
     2. 環境變數 WEDDING_BASE_URL
     3. 下面的 PRIMARY_DOMAIN（本專案的正式網域）
     4. .firebaserc 裡的專案 ID → https://{projectId}.web.app
     5. 最後才退回本機

   ▸ 換網域時只要改 PRIMARY_DOMAIN 這一行，
     所有腳本印出來的網址就會跟著變。
     設成空字串則自動改用 Firebase 的 {projectId}.web.app。
============================================================ */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* 本專案的正式網域（需先在 Firebase Hosting 新增自訂網域） */
const PRIMARY_DOMAIN = 'https://minato.3udesign.website';

function projectIdFromFirebaserc() {
  const file = fileURLToPath(new URL('../.firebaserc', import.meta.url));
  if (!existsSync(file)) return null;
  try {
    const json = JSON.parse(readFileSync(file, 'utf8'));
    return json?.projects?.default || null;
  } catch {
    return null;
  }
}

/* 回傳結尾不含斜線的網址前綴 */
export function resolveBaseUrl(explicit) {
  const pick = explicit
    || process.env.WEDDING_BASE_URL
    || PRIMARY_DOMAIN
    || (() => {
      const id = projectIdFromFirebaserc();
      return id ? `https://${id}.web.app` : null;
    })()
    || 'http://127.0.0.1:5000';

  return pick.replace(/\/+$/, '');
}
