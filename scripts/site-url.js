/* ============================================================
   site-url.js — 決定站台的對外網址前綴
   ------------------------------------------------------------
   優先序：
     1. 指令參數 --base
     2. 環境變數 WEDDING_BASE_URL
     3. .firebaserc 裡的專案 ID → https://{projectId}.web.app
     4. 最後才退回 https://localhost:5000

   之所以不寫死網域：專案預設就有 {projectId}.web.app 可以直接用，
   要換成自訂網域時只要設一次 WEDDING_BASE_URL，
   不必回頭改每一支腳本。
============================================================ */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
    || (() => {
      const id = projectIdFromFirebaserc();
      return id ? `https://${id}.web.app` : null;
    })()
    || 'http://127.0.0.1:5000';

  return pick.replace(/\/+$/, '');
}
