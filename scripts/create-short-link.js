#!/usr/bin/env node
/* ============================================================
   create-short-link.js — 建立短連結
   ------------------------------------------------------------
   用法範例：
     node scripts/create-short-link.js --slug chen-lin-0315
     node scripts/create-short-link.js --target https://example.com/w/chen-lin-0315
     node scripts/create-short-link.js --slug chen-lin-0315 --code abc123

   參數：
     --slug     指定要縮的站台 slug，會自動組成邀請函完整網址
     --target   直接指定完整目標網址（與 --slug 擇一）
     --code     選填，指定 6 碼代號；不給則隨機產生
     --base     選填，站台網域，預設 https://minato.3udesign.website
     --project  選填，覆寫 Firebase 專案 ID

   連線方式與 create-site.js 相同（Admin SDK ／ emulator）。
============================================================ */

import { parseArgs } from 'node:util';
import { randomInt } from 'node:crypto';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const DEFAULT_BASE = 'https://minato.3udesign.website';

/* 去掉容易看錯的字元（0/o/O、1/l/I），避免口頭或手抄時出錯 */
const CODE_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 6;
const CODE_PATTERN = /^[a-z0-9]{6}$/;
const MAX_ATTEMPTS = 10;

function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      slug:    { type: 'string' },
      target:  { type: 'string' },
      code:    { type: 'string' },
      base:    { type: 'string', default: DEFAULT_BASE },
      project: { type: 'string' },
    },
  });
  return values;
}

function randomCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/* 解析出最終要轉址的完整網址 */
function resolveTarget(values) {
  if (values.target) {
    if (!/^https?:\/\//i.test(values.target)) {
      throw new Error('--target 必須是 http:// 或 https:// 開頭的完整網址');
    }
    return values.target;
  }
  if (values.slug) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(values.slug)) {
      throw new Error('--slug 格式不合法，只允許小寫英數與連字號');
    }
    return `${values.base.replace(/\/+$/, '')}/w/${values.slug}`;
  }
  throw new Error('請用 --slug 或 --target 指定要縮的網址');
}

/* 以 transaction 確認代號沒撞號才寫入 */
async function createShortLink(target, preferredCode) {
  const db = getFirestore();

  if (preferredCode && !CODE_PATTERN.test(preferredCode)) {
    throw new Error('--code 必須是 6 碼小寫英數');
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const code = preferredCode || randomCode();
    const ref = db.collection('short').doc(code);

    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) {
          const err = new Error(`短連結代號 「${code}」 已經被使用了`);
          err.code = 'TAKEN';
          throw err;
        }
        tx.set(ref, {
          target,
          createdAt: FieldValue.serverTimestamp(),
          hits: 0,
        });
      });
      return code;
    } catch (err) {
      /* 指定代號撞號就直接報錯；隨機代號則換一組再試 */
      if (err.code !== 'TAKEN' || preferredCode) throw err;
    }
  }

  throw new Error(`連續 ${MAX_ATTEMPTS} 次都撞號，請再試一次`);
}

async function main() {
  const values = parseCliArgs(process.argv.slice(2));
  const target = resolveTarget(values);

  const initOptions = { projectId: values.project || process.env.GOOGLE_CLOUD_PROJECT };
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    initOptions.credential = applicationDefault();
  }
  initializeApp(initOptions);

  const code = await createShortLink(target, values.code);
  const base = values.base.replace(/\/+$/, '');

  console.log('✅ 短連結建立成功！');
  console.log(`   短網址 : ${base}/s/${code}`);
  console.log(`   轉址至 : ${target}`);
}

main().catch((err) => {
  console.error(`❌ 建立短連結失敗：${err.message}`);
  process.exit(1);
});
