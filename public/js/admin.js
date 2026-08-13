/* ============================================================
   admin.js — 新人後台
   ------------------------------------------------------------
   一個地方管六件事：
     1. 大廳內容 — 地點、Dress Code、禮金說明、當日流程（寫回 sites 文件）
     2. 桌次     — 上傳桌次圖、匯入賓客名單
     3. 祝福信   — 寫給特定賓客的電子信
     4. 首頁卡片 — Explore 區的自訂模組（連結型／彈窗型）
     5. 囍卡     — 抽卡頁的卡池：裁切上傳照片、設等級與說明
     6. 展覽     — 戀愛時光的展品與章節分隔卡

   門檻和悄悄話信箱一樣是 Google 登入，不是密碼：
   Security Rules 只讓 sites.ownerEmails 名單內、信箱已驗證的帳號寫入，
   所以這裡沒有任何「純前端遮罩」——改了 DOM 也寫不進去。
============================================================ */

const pwGate   = document.getElementById('pwGate');
const pwErr    = document.getElementById('pwErr');
const loginBtn = document.getElementById('ownerLoginBtn');
const adPage   = document.getElementById('adPage');

/* ============================================================
   小工具
============================================================ */
const toastEl = document.getElementById('adToast');
let toastTimer = null;

function toast(msg, isError){
  toastEl.textContent = msg;
  toastEl.classList.toggle('is-error', !!isError);
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ toastEl.hidden = true; }, isError ? 5200 : 2600);
}

/* 寫入失敗多半是規則擋下來的，講清楚原因比丟 code 有用 */
function writeFailed(err){
  console.warn('[admin] 寫入失敗', err);
  if(err && err.code === 'permission-denied'){
    toast('沒有寫入權限：這個 Google 帳號不在 ownerEmails 名單裡', true);
  }else{
    toast(`存檔失敗：${(err && err.message) || '請再試一次'}`, true);
  }
}

function fmtTime(ts){
  const d = new Date(ts || Date.now());
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ============================================================
   登入
============================================================ */
function showError(msg){
  pwErr.textContent = msg;
  const card = document.querySelector('#pwGate .gate-card');
  if(card){
    card.animate(
      [{transform:'translateX(0)'},{transform:'translateX(-8px)'},
       {transform:'translateX(8px)'},{transform:'translateX(0)'}],
      { duration:300 }
    );
  }
}

let opened = false;
function openAdmin(){
  if(opened) return;
  opened = true;
  pwGate.style.display = 'none';
  adPage.hidden = false;
  setNavVisible(true);

  const user = window.fb.auth.currentUser;
  document.getElementById('adWho').textContent =
    `${(window.WED && window.WED.couple) || ''}・${user ? user.email : ''}`;
  document.getElementById('adViewBtn').href = sitePath('lobby');

  /* 訂閱各份資料，畫面隨著資料變動重畫 */
  DataStore.subscribeRsvps();
  DataStore.subscribeSeating();
  DataStore.subscribeBlessings();
  DataStore.subscribeExplore();
  DataStore.subscribeCards();
  DataStore.subscribeExhibits();
  renderRsvps();
  renderSeatList();
  renderImages();
  renderLetters();
  renderExplore();
  renderCards();
  renderExhibits();

  /* 大廳文案不是子集合，是站台文件本身；載入時已經讀進 window.SITE.data */
  fillSiteForm();
  renderSchedule(siteSchedule());
}

loginBtn.addEventListener('click', async ()=>{
  pwErr.innerHTML = '&nbsp;';
  loginBtn.disabled = true;
  try{
    const email = await signInAsOwner();
    if(isSiteOwner()){
      openAdmin();
    }else{
      showError(`${email || '這個帳號'} 不在這場婚禮的新人名單裡`);
    }
  }catch(e){
    if(e && e.code === 'auth/popup-closed-by-user'){
      pwErr.innerHTML = '&nbsp;';
    }else{
      showError('登入沒有成功，請再試一次');
    }
  }
  loginBtn.disabled = false;
});

document.getElementById('adLock').addEventListener('click', async ()=>{
  try{ await window.fb.signOut(window.fb.auth); }catch{}
  location.reload();
});

if(!ownerEmails().length){
  loginBtn.disabled = true;
  pwErr.textContent = '這個站台還沒設定新人的 Google 信箱（ownerEmails）';
}else{
  window.fb.onAuthStateChanged(window.fb.auth, ()=>{
    if(isSiteOwner()) openAdmin();
  });
}

/* ============================================================
   分頁切換
============================================================ */
document.getElementById('adTabs').addEventListener('click', (e)=>{
  const btn = e.target.closest('.ad-tab');
  if(!btn) return;
  document.querySelectorAll('.ad-tab').forEach(b => b.classList.toggle('is-on', b === btn));
  document.querySelectorAll('.ad-panel').forEach(p =>
    p.classList.toggle('is-on', p.dataset.panel === btn.dataset.tab));
  window.scrollTo({ top:0, behavior:'instant' });
});

/* ============================================================
   0. 出席回覆
   ------------------------------------------------------------
   規則只讓 ownerEmails 名單內的帳號讀得到，賓客彼此看不到。
   這裡只看與匯出，不提供修改 —— 回覆是賓客送出的紀錄。
============================================================ */
const RSVP_LABEL = { yes:'會來', maybe:'未定', no:'不克出席' };

const rsvpListEl   = document.getElementById('adRsvpList');
const rsvpFilterEl = document.getElementById('adRsvpFilter');
let rsvpFilter = 'all';

/* createdAt 是 Firestore 的 Timestamp（伺服器時間），不是數字 */
function rsvpTime(r){
  const t = r.createdAt;
  if(t && typeof t.toDate === 'function') return t.toDate().getTime();
  return 0;
}

function visibleRsvps(){
  const q = normKey(rsvpFilterEl.value);
  return DataStore.getRSVPs().filter(r => {
    if(rsvpFilter !== 'all' && DataStore.rsvpStatus(r) !== rsvpFilter) return false;
    if(!q) return true;
    return normKey(r.name).includes(q) || normKey(r.message).includes(q);
  });
}

function renderRsvps(){
  const tally = DataStore.getRsvpTally();
  document.getElementById('adRsvpHead').textContent  = DataStore.getAttendingCount();
  document.getElementById('adRsvpYes').textContent   = tally.yes;
  document.getElementById('adRsvpMaybe').textContent = tally.maybe;
  document.getElementById('adRsvpNo').textContent    = tally.no;

  const list = visibleRsvps();
  if(!list.length){
    rsvpListEl.innerHTML = `<div class="ad-empty">${
      DataStore.getRSVPCount() ? '沒有符合的回覆' : '還沒有人回覆出席'}</div>`;
    return;
  }

  rsvpListEl.innerHTML = list.map(r => {
    const st = DataStore.rsvpStatus(r);
    const bits = [];
    if(st === 'yes') bits.push(`${Number(r.guestCount) || 1} 位`);
    if(r.meal) bits.push(`餐點：${r.meal}`);
    if(r.dietaryNote) bits.push(`飲食：${r.dietaryNote}`);
    const t = rsvpTime(r);

    return `
      <div class="ad-item">
        <div class="ad-item-main">
          <span class="ad-item-title">${escapeHtml(r.icon || '')} ${escapeHtml(r.name || '（沒有名字）')}</span>
          <span class="ad-tag ad-tag-${st}">${RSVP_LABEL[st]}</span>
          ${bits.length ? `<span class="ad-item-sub">${escapeHtml(bits.join('・'))}</span>` : ''}
          ${r.message ? `<span class="ad-item-sub">「${escapeHtml(r.message)}」</span>` : ''}
          <span class="ad-item-sub">${t ? fmtTime(t) : '時間未知'}</span>
        </div>
      </div>`;
  }).join('');
}

document.addEventListener('data:rsvps', renderRsvps);
rsvpFilterEl.addEventListener('input', renderRsvps);

document.getElementById('adRsvpChips').addEventListener('click', (e)=>{
  const chip = e.target.closest('.ad-chip');
  if(!chip) return;
  rsvpFilter = chip.dataset.filter;
  document.querySelectorAll('#adRsvpChips .ad-chip')
    .forEach(c => c.classList.toggle('is-on', c === chip));
  renderRsvps();
});

/* 規則拒絕讀取時（例如帳號被移出 ownerEmails）講清楚，不要留一個空名單 */
document.addEventListener('data:rsvps:denied', ()=>{
  rsvpListEl.innerHTML =
    `<div class="ad-empty">沒有讀取出席回覆的權限<br>請確認這個帳號在 ownerEmails 名單內</div>`;
});

/* ---------- 匯出 CSV ----------
   欄位與 scripts/export-rsvps.js 對齊，兩邊拿到的檔案格式一致。
   Excel 打開中文會亂碼，所以加上 BOM。 */
document.getElementById('adRsvpExport').addEventListener('click', ()=>{
  const rows = visibleRsvps();
  if(!rows.length){ toast('目前沒有可以匯出的回覆', true); return; }

  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const header = ['稱呼','是否出席','人數','餐點','飲食禁忌','給新人的話','回覆時間'];

  const body = rows.map(r => {
    const st = DataStore.rsvpStatus(r);
    const t  = rsvpTime(r);
    return [
      r.name || '',
      RSVP_LABEL[st],
      st === 'yes' ? (Number(r.guestCount) || 1) : '',
      r.meal || '',
      r.dietaryNote || '',
      r.message || '',
      t ? fmtTime(t) : '',
    ].map(esc).join(',');
  });

  const csv  = '﻿' + [header.map(esc).join(','), ...body].join('\r\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `rsvps-${window.SITE.slug}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast(`已匯出 ${rows.length} 筆回覆`);
});

/* ============================================================
   1-1 桌次圖上傳
   ------------------------------------------------------------
   Firestore 單一文件上限 1MB，所以上傳前先在瀏覽器縮圖：
   最長邊縮到 1800px、轉成 JPEG，還是太大就降畫質、再不行就再縮一輪。
   （不用 Firebase Storage：Storage 規則讀不到 Firestore，
     沒辦法用 ownerEmails 白名單判斷是不是新人本人。）
============================================================ */
const MAX_DATAURL = 900000;

async function shrinkImage(file){
  const url = URL.createObjectURL(file);
  try{
    const img = await new Promise((resolve, reject)=>{
      const im = new Image();
      im.onload  = ()=> resolve(im);
      im.onerror = ()=> reject(new Error('這個檔案不是瀏覽器讀得懂的圖片'));
      im.src = url;
    });

    let edge = 1800;   /* 桌次圖上有字，解析度不能砍太兇 */
    for(let round = 0; round < 6; round++){
      const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth  * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));

      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const cx = cv.getContext('2d');
      /* JPEG 沒有透明度，PNG 的透明區不鋪白底會變成黑塊 */
      cx.fillStyle = '#fff';
      cx.fillRect(0, 0, w, h);
      cx.drawImage(img, 0, 0, w, h);

      for(const q of [0.86, 0.74, 0.62]){
        const out = cv.toDataURL('image/jpeg', q);
        if(out.length <= MAX_DATAURL) return out;
      }
      edge = Math.round(edge * 0.75);
    }
    throw new Error('圖片太大，請先裁切或縮小再上傳');
  } finally {
    URL.revokeObjectURL(url);
  }
}

const fileInput  = document.getElementById('adFile');
const uploadBox  = document.getElementById('adUploadBox');
const progressEl = document.getElementById('adProgress');

async function uploadFiles(files){
  const list = Array.from(files).filter(f => f.type.startsWith('image/'));
  if(!list.length){ toast('請選圖片檔', true); return; }

  progressEl.hidden = false;
  let done = 0, failed = 0;
  const base = DataStore.getSeatingImages().length;

  for(const file of list){
    progressEl.textContent = `處理中… ${done + failed + 1} / ${list.length}`;
    try{
      const img = await shrinkImage(file);
      await DataStore.saveDoc('seatingImages', null, {
        img,
        title: file.name.replace(/\.[^.]+$/, '').slice(0, 60),
        order: base + done + 1,
        time: Date.now(),
      });
      done++;
    }catch(err){
      failed++;
      console.warn('[admin] 上傳失敗', file.name, err);
    }
  }

  progressEl.hidden = true;
  fileInput.value = '';
  if(failed) toast(`上傳 ${done} 張，${failed} 張失敗（可能是檔案太大或格式不支援）`, true);
  else toast(`已上傳 ${done} 張桌次圖`);
}

fileInput.addEventListener('change', ()=> uploadFiles(fileInput.files));

['dragenter','dragover'].forEach(ev =>
  uploadBox.addEventListener(ev, (e)=>{ e.preventDefault(); uploadBox.classList.add('is-over'); }));
['dragleave','drop'].forEach(ev =>
  uploadBox.addEventListener(ev, (e)=>{ e.preventDefault(); uploadBox.classList.remove('is-over'); }));
uploadBox.addEventListener('drop', (e)=>{
  if(e.dataTransfer && e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
});

/* ---------- 已上傳的圖 ---------- */
const imgsEl = document.getElementById('adImgs');

function renderImages(){
  const list = DataStore.getSeatingImages();
  if(!list.length){
    imgsEl.innerHTML = `<div class="ad-empty">還沒有桌次圖</div>`;
    return;
  }
  imgsEl.innerHTML = list.map(it => `
    <figure class="ad-img">
      <img src="${escapeHtml(it.img)}" alt="${escapeHtml(it.title || '')}">
      <figcaption>
        <input class="ad-img-title" data-id="${it.id}" type="text" maxlength="60"
               value="${escapeHtml(it.title || '')}" placeholder="這張圖的標題">
        <button class="ad-del" data-del-img="${it.id}" type="button">刪除</button>
      </figcaption>
    </figure>`).join('');
}
document.addEventListener('data:seatingImages', renderImages);

imgsEl.addEventListener('click', async (e)=>{
  const id = e.target.dataset.delImg;
  if(!id) return;
  if(!confirm('確定要刪掉這張桌次圖嗎？')) return;
  try{
    await DataStore.removeDoc('seatingImages', id);
    toast('已刪除');
  }catch(err){ writeFailed(err); }
});

/* 標題改完（離開欄位）就存回去 */
imgsEl.addEventListener('change', async (e)=>{
  const el = e.target.closest('.ad-img-title');
  if(!el) return;
  const item = DataStore.getSeatingImages().find(i => i.id === el.dataset.id);
  if(!item) return;
  try{
    await DataStore.saveDoc('seatingImages', item.id, {
      img: item.img,
      title: el.value.trim().slice(0, 60),
      order: item.order || 0,
      time: item.time || Date.now(),
    });
    toast('標題已更新');
  }catch(err){ writeFailed(err); }
});

/* ============================================================
   1-2 桌次名單
============================================================ */
/* 一行一位：姓名, 桌次, 備註
   Excel 貼過來可能是 Tab 分隔，全形逗號也一併接受 */
function parseSeatRows(text){
  const rows = [], bad = [];
  text.split(/\r?\n/).forEach((line, i)=>{
    const raw = line.trim();
    if(!raw) return;
    const parts = raw.split(/[,\t，]/).map(s => s.trim());
    const name  = parts[0];
    const table = parts[1];
    if(!name || !table){ bad.push(i + 1); return; }
    rows.push({
      name:  name.slice(0, 40),
      table: table.slice(0, 40),
      note:  parts.slice(2).filter(Boolean).join(' ').slice(0, 100),
    });
  });
  return { rows, bad };
}

const bulkEl = document.getElementById('adSeatBulk');

document.getElementById('adSeatImport').addEventListener('click', async ()=>{
  const { rows, bad } = parseSeatRows(bulkEl.value);
  if(!rows.length){
    toast('沒有讀到任何一行有效的名單（每行至少要有「姓名, 桌次」）', true);
    return;
  }
  if(!confirm(`要匯入 ${rows.length} 位賓客嗎？（原本的名單會保留，這次是「加上去」）`)) return;
  try{
    await DataStore.importSeating(rows);
    bulkEl.value = '';
    toast(bad.length
      ? `已匯入 ${rows.length} 位；第 ${bad.join('、')} 行格式不完整，已略過`
      : `已匯入 ${rows.length} 位`);
  }catch(err){ writeFailed(err); }
});

document.getElementById('adSeatClear').addEventListener('click', async ()=>{
  const n = DataStore.getSeating().length;
  if(!n){ toast('名單本來就是空的'); return; }
  if(!confirm(`確定要清空整份名單嗎？共 ${n} 位，刪掉就回不來了。`)) return;
  try{
    await DataStore.wipeCollection('seating');
    toast('名單已清空');
  }catch(err){ writeFailed(err); }
});

const seatListEl   = document.getElementById('adSeatList');
const seatFilterEl = document.getElementById('adSeatFilter');

function renderSeatList(){
  const all = DataStore.getSeating();
  document.getElementById('adSeatCount').textContent = `目前 ${all.length} 位`;

  const q = normKey(seatFilterEl.value);
  const list = q
    ? all.filter(r => normKey(r.name).includes(q) || normKey(r.table).includes(q))
    : all;

  if(!list.length){
    seatListEl.innerHTML = `<div class="ad-empty">${
      all.length ? '沒有符合的賓客' : '還沒有名單，用上面的欄位匯入'}</div>`;
    return;
  }
  seatListEl.innerHTML = list.map(r => `
    <div class="ad-item">
      <div class="ad-item-main">
        <span class="ad-item-title">${escapeHtml(r.name)}</span>
        <span class="ad-tag">${escapeHtml(r.table)}</span>
        ${r.note ? `<span class="ad-item-sub">${escapeHtml(r.note)}</span>` : ''}
      </div>
      <button class="ad-del" data-del-seat="${r.id}" type="button">刪除</button>
    </div>`).join('');
}

document.addEventListener('data:seating', renderSeatList);
seatFilterEl.addEventListener('input', renderSeatList);

seatListEl.addEventListener('click', async (e)=>{
  const id = e.target.dataset.delSeat;
  if(!id) return;
  try{
    await DataStore.removeDoc('seating', id);
    toast('已刪除');
  }catch(err){ writeFailed(err); }
});

/* ============================================================
   2. 祝福信
============================================================ */
const lf = {
  form:    document.getElementById('adLetterForm'),
  id:      document.getElementById('adLetterId'),
  terms:   document.getElementById('adLetterTerms'),
  title:   document.getElementById('adLetterTitle'),
  body:    document.getElementById('adLetterBody'),
  sign:    document.getElementById('adLetterSign'),
  isDef:   document.getElementById('adLetterDefault'),
  len:     document.getElementById('adLetterLen'),
  list:    document.getElementById('adLetterList'),
};

lf.body.addEventListener('input', ()=>{ lf.len.textContent = lf.body.value.length; });

function resetLetterForm(){
  lf.form.reset();
  lf.id.value = '';
  lf.len.textContent = '0';
}
document.getElementById('adLetterReset').addEventListener('click', resetLetterForm);

lf.form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const body = lf.body.value.trim();
  if(!body){ toast('信的內容不能是空的', true); lf.body.focus(); return; }

  const terms = lf.terms.value
    .split(/[,，\n]/).map(s => s.trim()).filter(Boolean).slice(0, 20)
    .map(s => s.slice(0, 40));

  if(!terms.length && !lf.isDef.checked){
    toast('請填專屬詞彙，或把這封設為通用信', true);
    lf.terms.focus();
    return;
  }

  try{
    await DataStore.saveDoc('blessings', lf.id.value || null, {
      terms,
      title: lf.title.value.trim().slice(0, 60),
      body:  body.slice(0, 2000),
      sign:  lf.sign.value.trim().slice(0, 60),
      isDefault: lf.isDef.checked,
      time: Date.now(),
    });
    resetLetterForm();
    toast('信已儲存');
  }catch(err){ writeFailed(err); }
});

function renderLetters(){
  const list = DataStore.getBlessings();
  if(!list.length){
    lf.list.innerHTML = `<div class="ad-empty">還沒有寫任何一封信</div>`;
    return;
  }
  lf.list.innerHTML = list.map(b => `
    <div class="ad-item">
      <div class="ad-item-main">
        <span class="ad-item-title">${escapeHtml(b.title || '（沒有標題）')}</span>
        ${b.isDefault ? `<span class="ad-tag">通用信</span>` : ''}
        <span class="ad-item-sub">
          ${(Array.isArray(b.terms) && b.terms.length)
            ? `詞彙：${escapeHtml(b.terms.join('、'))}`
            : '沒有專屬詞彙'}
        </span>
        <span class="ad-item-sub">${escapeHtml((b.body || '').slice(0, 48))}…・${fmtTime(b.time)}</span>
      </div>
      <div class="ad-item-actions">
        <button class="ad-edit" data-edit-letter="${b.id}" type="button">編輯</button>
        <button class="ad-del"  data-del-letter="${b.id}"  type="button">刪除</button>
      </div>
    </div>`).join('');
}
document.addEventListener('data:blessings', renderLetters);

lf.list.addEventListener('click', async (e)=>{
  const editId = e.target.dataset.editLetter;
  const delId  = e.target.dataset.delLetter;

  if(editId){
    const b = DataStore.getBlessings().find(x => x.id === editId);
    if(!b) return;
    lf.id.value    = b.id;
    lf.terms.value = (b.terms || []).join(', ');
    lf.title.value = b.title || '';
    lf.body.value  = b.body || '';
    lf.sign.value  = b.sign || '';
    lf.isDef.checked = b.isDefault === true;
    lf.len.textContent = lf.body.value.length;
    lf.form.scrollIntoView({ behavior:'smooth', block:'start' });
    return;
  }

  if(delId){
    if(!confirm('確定要刪掉這封信嗎？')) return;
    try{
      await DataStore.removeDoc('blessings', delId);
      if(lf.id.value === delId) resetLetterForm();
      toast('已刪除');
    }catch(err){ writeFailed(err); }
  }
});

/* ============================================================
   3. 首頁自訂卡片
============================================================ */
const ef = {
  form:  document.getElementById('adExpForm'),
  id:    document.getElementById('adExpId'),
  title: document.getElementById('adExpTitle'),
  sub:   document.getElementById('adExpSub'),
  kind:  document.getElementById('adExpKind'),
  url:   document.getElementById('adExpUrl'),
  body:  document.getElementById('adExpBody'),
  order: document.getElementById('adExpOrder'),
  urlBox:  document.getElementById('adExpUrlBox'),
  bodyBox: document.getElementById('adExpBodyBox'),
  list:  document.getElementById('adExpList'),
};

/* 選了「開啟連結」就只問網址，選了「跳出說明」就只問內文 */
function syncKindFields(){
  const isLink = ef.kind.value === 'link';
  ef.urlBox.hidden  = !isLink;
  ef.bodyBox.hidden = isLink;
}
ef.kind.addEventListener('change', syncKindFields);
syncKindFields();

function resetExpForm(){
  ef.form.reset();
  ef.id.value = '';
  ef.order.value = String(DataStore.getExplore().length + 1);
  syncKindFields();
}
document.getElementById('adExpReset').addEventListener('click', resetExpForm);

ef.form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const title = ef.title.value.trim();
  if(!title){ toast('卡片標題不能是空的', true); ef.title.focus(); return; }

  const kind = ef.kind.value === 'link' ? 'link' : 'popup';
  const url  = ef.url.value.trim();
  const body = ef.body.value.trim();

  if(kind === 'link' && !/^https?:\/\//i.test(url)){
    toast('連結要以 http:// 或 https:// 開頭', true);
    ef.url.focus();
    return;
  }
  if(kind === 'popup' && !body){
    toast('彈窗內文不能是空的', true);
    ef.body.focus();
    return;
  }

  try{
    await DataStore.saveDoc('explore', ef.id.value || null, {
      title: title.slice(0, 40),
      sub:   ef.sub.value.trim().slice(0, 120),
      kind,
      url:   kind === 'link' ? url.slice(0, 500) : '',
      body:  kind === 'popup' ? body.slice(0, 2000) : '',
      order: Number(ef.order.value) || 0,
      time:  Date.now(),
    });
    resetExpForm();
    toast('卡片已儲存');
  }catch(err){ writeFailed(err); }
});

function renderExplore(){
  const list = DataStore.getExplore();
  if(!list.length){
    ef.list.innerHTML = `<div class="ad-empty">還沒有自訂卡片</div>`;
    return;
  }
  ef.list.innerHTML = list.map(it => `
    <div class="ad-item">
      <div class="ad-item-main">
        <span class="ad-item-title">${escapeHtml(it.title)}</span>
        <span class="ad-tag">${it.kind === 'link' ? '連結' : '彈窗'}</span>
        ${it.sub ? `<span class="ad-item-sub">${escapeHtml(it.sub)}</span>` : ''}
        <span class="ad-item-sub">${escapeHtml(
          it.kind === 'link' ? (it.url || '') : (it.body || '').slice(0, 48)
        )}</span>
      </div>
      <div class="ad-item-actions">
        <span class="ad-order">#${it.order ?? 0}</span>
        <button class="ad-edit" data-edit-exp="${it.id}" type="button">編輯</button>
        <button class="ad-del"  data-del-exp="${it.id}"  type="button">刪除</button>
      </div>
    </div>`).join('');
}
document.addEventListener('data:explore', renderExplore);

ef.list.addEventListener('click', async (e)=>{
  const editId = e.target.dataset.editExp;
  const delId  = e.target.dataset.delExp;

  if(editId){
    const it = DataStore.getExplore().find(x => x.id === editId);
    if(!it) return;
    ef.id.value    = it.id;
    ef.title.value = it.title || '';
    ef.sub.value   = it.sub || '';
    ef.kind.value  = it.kind === 'link' ? 'link' : 'popup';
    ef.url.value   = it.url || '';
    ef.body.value  = it.body || '';
    ef.order.value = String(it.order ?? 0);
    syncKindFields();
    ef.form.scrollIntoView({ behavior:'smooth', block:'start' });
    return;
  }

  if(delId){
    if(!confirm('確定要刪掉這張卡片嗎？')) return;
    try{
      await DataStore.removeDoc('explore', delId);
      if(ef.id.value === delId) resetExpForm();
      toast('已刪除');
    }catch(err){ writeFailed(err); }
  }
});

/* ============================================================
   4. 大廳內容（寫回 sites/{siteId} 的文案欄位）
   ------------------------------------------------------------
   這一頁改的不是子集合，而是站台文件本身。
   規則只放行白名單內的欄位（地點、dress code、流程…），
   status／ownerEmails／pages 這些「規則自己拿來判斷的欄位」寫不進去 ——
   否則等於讓新人自己開後門。
============================================================ */
const sf = {
  form:    document.getElementById('adSiteForm'),
  venue:   document.getElementById('adVenueName'),
  addr:    document.getElementById('adVenueAddress'),
  map:     document.getElementById('adVenueMapUrl'),
  dress:   document.getElementById('adDressCode'),
  gift:    document.getElementById('adGiftNote'),
  story:   document.getElementById('adStory'),
  tags:    document.getElementById('adHashtags'),
};

function siteData(){ return (window.SITE && window.SITE.data) || {}; }

function fillSiteForm(){
  const d = siteData();
  sf.venue.value = d.venueName    || '';
  sf.addr.value  = d.venueAddress || '';
  sf.map.value   = d.venueMapUrl  || '';
  sf.dress.value = d.dressCode    || '';
  sf.gift.value  = d.giftNote     || '';
  sf.story.value = d.story        || '';
  sf.tags.value  = Array.isArray(d.hashtags) ? d.hashtags.join(', ') : '';
}
document.getElementById('adSiteReset').addEventListener('click', fillSiteForm);

sf.form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const map = sf.map.value.trim();
  if(map && !/^https?:\/\//i.test(map)){
    toast('地圖連結要以 http:// 或 https:// 開頭，或整格留白', true);
    sf.map.focus();
    return;
  }

  /* hashtag 沒寫 # 就自動補上，大廳才不會出現光禿禿的字 */
  const hashtags = sf.tags.value
    .split(/[,，\s]+/).map(s => s.trim()).filter(Boolean).slice(0, 10)
    .map(s => (s.startsWith('#') ? s : `#${s}`).slice(0, 40));

  try{
    await DataStore.saveSiteFields({
      venueName:    sf.venue.value.trim().slice(0, 80),
      venueAddress: sf.addr.value.trim().slice(0, 200),
      venueMapUrl:  map.slice(0, 500),
      dressCode:    sf.dress.value.trim().slice(0, 500),
      giftNote:     sf.gift.value.trim().slice(0, 500),
      story:        sf.story.value.trim().slice(0, 2000),
      hashtags,
    });
    fillSiteForm();
    toast('婚禮資訊已更新，重新整理大廳就看得到');
  }catch(err){ writeFailed(err); }
});

/* ---------- 當日流程 ----------
   一列一個項目，順序就是大廳時間軸的顯示順序（不依時間重排）。 */
const schListEl = document.getElementById('adSchList');

function siteSchedule(){
  const s = siteData().schedule;
  return Array.isArray(s) ? s : [];
}

function schRowHtml(item){
  const it = item || {};
  return `
    <div class="ad-sch-row">
      <input class="ad-input ad-sch-time"  type="text" maxlength="20"
             value="${escapeHtml(it.time || '')}"  placeholder="11:30">
      <input class="ad-input ad-sch-title" type="text" maxlength="40"
             value="${escapeHtml(it.title || '')}" placeholder="入場迎賓">
      <input class="ad-input ad-sch-desc"  type="text" maxlength="80"
             value="${escapeHtml(it.desc || '')}"  placeholder="說明（選填）">
      <button class="ad-del" type="button" data-sch-del="1">刪除</button>
    </div>`;
}

function renderSchedule(list){
  schListEl.innerHTML = (list && list.length)
    ? list.map(schRowHtml).join('')
    : schRowHtml(null);
}

document.getElementById('adSchAdd').addEventListener('click', ()=>{
  schListEl.insertAdjacentHTML('beforeend', schRowHtml(null));
});

schListEl.addEventListener('click', (e)=>{
  if(!e.target.dataset.schDel) return;
  e.target.closest('.ad-sch-row').remove();
  if(!schListEl.children.length) renderSchedule([]);
});

document.getElementById('adSchSave').addEventListener('click', async ()=>{
  /* 整列都空白的就當作沒填，新人不用先刪乾淨才存得起來 */
  const rows = Array.from(schListEl.querySelectorAll('.ad-sch-row')).map(row => ({
    time:  row.querySelector('.ad-sch-time').value.trim().slice(0, 20),
    title: row.querySelector('.ad-sch-title').value.trim().slice(0, 40),
    desc:  row.querySelector('.ad-sch-desc').value.trim().slice(0, 80),
  })).filter(r => r.time || r.title || r.desc).slice(0, 40);

  const bad = rows.findIndex(r => !r.title);
  if(bad >= 0){
    toast(`第 ${bad + 1} 列還沒填項目名稱`, true);
    return;
  }

  try{
    await DataStore.saveSiteFields({ schedule: rows });
    renderSchedule(rows);
    toast(rows.length ? `已儲存 ${rows.length} 個流程項目` : '流程已清空');
  }catch(err){ writeFailed(err); }
});

/* ============================================================
   5. 囍卡（抽卡頁的卡池）
   ------------------------------------------------------------
   照片先讓新人自己裁成 2:3（cropper.js），再以 data URL 存進文件，
   理由與桌次圖相同：Firebase Storage 的規則讀不到 Firestore，
   沒辦法用 ownerEmails 白名單判斷是不是新人本人。
============================================================ */
const CARD_ASPECT   = 2/3;      /* 卡片是直式 2:3 */
const CARD_OUTWIDTH = 700;      /* 700×1050，手機上顯示寬度約 300px，這個解析度綽綽有餘 */
/* 抽卡頁會一次載入整個卡池（要隨機抽，沒辦法只載一張），
   所以每張卡壓得比桌次圖更小 —— 30 張大約 4MB，手機用行動網路也還行。
   規則的上限仍是 950000，這裡是自我約束。 */
const CARD_MAX_BYTES = 200000;

const cardListEl  = document.getElementById('adCardList');
const cardFileEl  = document.getElementById('adCardFile');
const cardUpload  = document.getElementById('adCardUpload');
const cardProgEl  = document.getElementById('adCardProgress');

async function uploadCards(files){
  const list = Array.from(files).filter(f => f.type.startsWith('image/'));
  if(!list.length){ toast('請選圖片檔', true); return; }

  cardProgEl.hidden = false;
  let done = 0, skipped = 0, failed = 0;
  let order = DataStore.getCards().length;

  for(let i = 0; i < list.length; i++){
    const file = list[i];
    cardProgEl.textContent = `裁切中… ${i + 1} / ${list.length}`;
    try{
      const img = await cropImage(file, {
        aspect:   CARD_ASPECT,
        outWidth: CARD_OUTWIDTH,
        maxBytes: CARD_MAX_BYTES,
        title:    `裁切囍卡（${i + 1} / ${list.length}）`,
        hint:     '直式 2:3・拖曳移動、滑桿或滾輪縮放',
      });
      if(!img){ skipped++; continue; }     /* 新人自己按了取消 */

      order += 1;
      await DataStore.saveDoc('cards', null, {
        img,
        name:   file.name.replace(/\.[^.]+$/, '').slice(0, 60) || `囍卡 ${order}`,
        rarity: 'N',
        desc:   '',
        order,
        time:   Date.now(),
      });
      done++;
    }catch(err){
      failed++;
      console.warn('[admin] 囍卡上傳失敗', file.name, err);
    }
  }

  cardProgEl.hidden = true;
  cardFileEl.value = '';
  if(failed) toast(`已加入 ${done} 張，${failed} 張失敗（可能是格式不支援）`, true);
  else if(done) toast(`已加入 ${done} 張囍卡${skipped ? `（略過 ${skipped} 張）` : ''}`);
  else if(skipped) toast('沒有加入任何一張');
}

cardFileEl.addEventListener('change', ()=> uploadCards(cardFileEl.files));

['dragenter','dragover'].forEach(ev =>
  cardUpload.addEventListener(ev, (e)=>{ e.preventDefault(); cardUpload.classList.add('is-over'); }));
['dragleave','drop'].forEach(ev =>
  cardUpload.addEventListener(ev, (e)=>{ e.preventDefault(); cardUpload.classList.remove('is-over'); }));
cardUpload.addEventListener('drop', (e)=>{
  if(e.dataTransfer && e.dataTransfer.files.length) uploadCards(e.dataTransfer.files);
});

const RARITIES = ['SSR', 'SR', 'R', 'N'];

function renderCards(){
  const list = DataStore.getCards();
  document.getElementById('adCardCount').textContent = `目前 ${list.length} 張`;

  if(!list.length){
    cardListEl.innerHTML =
      `<div class="ad-empty">還沒有囍卡<br>沒上傳的話，抽卡頁會沿用素材資料夾或內建的範例卡</div>`;
    return;
  }

  cardListEl.innerHTML = list.map(c => `
    <figure class="ad-card" data-id="${c.id}">
      <img src="${escapeHtml(c.img)}" alt="${escapeHtml(c.name || '')}">
      <figcaption>
        <input class="ad-input ad-card-name" type="text" maxlength="60"
               value="${escapeHtml(c.name || '')}" placeholder="卡名">
        <select class="ad-input ad-card-rarity">
          ${RARITIES.map(r =>
            `<option value="${r}"${(c.rarity || 'N') === r ? ' selected' : ''}>${r}</option>`).join('')}
        </select>
        <input class="ad-input ad-card-desc" type="text" maxlength="200"
               value="${escapeHtml(c.desc || '')}" placeholder="說明（選填）">
        <div class="ad-card-actions">
          <span class="ad-order">#${c.order ?? 0}</span>
          <button class="ad-edit" type="button" data-recrop="${c.id}">重新裁切</button>
          <button class="ad-del"  type="button" data-del-card="${c.id}">刪除</button>
        </div>
      </figcaption>
    </figure>`).join('');
}
document.addEventListener('data:cards', renderCards);

/* 卡名／等級／說明改完（離開欄位）就存回去 */
cardListEl.addEventListener('change', async (e)=>{
  const box = e.target.closest('.ad-card');
  if(!box || e.target.matches('input[type="file"]')) return;
  const item = DataStore.getCards().find(c => c.id === box.dataset.id);
  if(!item) return;

  const rarity = box.querySelector('.ad-card-rarity').value;
  try{
    await DataStore.saveDoc('cards', item.id, {
      img:    item.img,
      name:   box.querySelector('.ad-card-name').value.trim().slice(0, 60),
      rarity: RARITIES.includes(rarity) ? rarity : 'N',
      desc:   box.querySelector('.ad-card-desc').value.trim().slice(0, 200),
      order:  item.order || 0,
      time:   item.time || Date.now(),
    });
    toast('已更新');
  }catch(err){ writeFailed(err); }
});

cardListEl.addEventListener('click', async (e)=>{
  const recropId = e.target.dataset.recrop;
  const delId    = e.target.dataset.delCard;

  if(recropId){
    const item = DataStore.getCards().find(c => c.id === recropId);
    if(!item) return;
    /* 拿現有的圖再裁一次：只能往內縮，但對「當初切歪了」很夠用 */
    const img = await cropImage(item.img, {
      aspect:   CARD_ASPECT,
      outWidth: CARD_OUTWIDTH,
      maxBytes: CARD_MAX_BYTES,
      title:    '重新裁切囍卡',
    });
    if(!img) return;
    try{
      await DataStore.saveDoc('cards', item.id, {
        img,
        name:   item.name || '',
        rarity: RARITIES.includes(item.rarity) ? item.rarity : 'N',
        desc:   item.desc || '',
        order:  item.order || 0,
        time:   item.time || Date.now(),
      });
      toast('已重新裁切');
    }catch(err){ writeFailed(err); }
    return;
  }

  if(delId){
    if(!confirm('確定要刪掉這張囍卡嗎？')) return;
    try{
      await DataStore.removeDoc('cards', delId);
      toast('已刪除');
    }catch(err){ writeFailed(err); }
  }
});

/* ============================================================
   6. 展覽（戀愛時光）
   ------------------------------------------------------------
   兩種型態，用同一個表單填：
     kind='photo' → 時間軸上的一張展品（照片可留空，只放文字）
     kind='act'   → 章節分隔卡（title 是章節名、sub 是副標）
   排序欄位決定先後，章節卡要排在它底下那些展品前面。
============================================================ */
const EXH_OUTWIDTH = 900;
/* 展品也是整頁一次載完，同樣壓小一點（理由見囍卡） */
const EXH_MAX_BYTES = 250000;

const xf = {
  form:   document.getElementById('adExhForm'),
  id:     document.getElementById('adExhId'),
  img:    document.getElementById('adExhImg'),
  kind:   document.getElementById('adExhKind'),
  title:  document.getElementById('adExhTitle'),
  sub:    document.getElementById('adExhSub'),
  year:   document.getElementById('adExhYear'),
  act:    document.getElementById('adExhAct'),
  desc:   document.getElementById('adExhDesc'),
  order:  document.getElementById('adExhOrder'),
  ratio:  document.getElementById('adExhRatio'),
  file:   document.getElementById('adExhFile'),
  prev:   document.getElementById('adExhPrev'),
  descLen:document.getElementById('adExhDescLen'),
  list:   document.getElementById('adExhList'),
  photoBoxes: [document.getElementById('adExhPhotoBox'),
               document.getElementById('adExhPhotoBox2')],
};

xf.desc.addEventListener('input', ()=>{ xf.descLen.textContent = xf.desc.value.length; });

/* 章節卡只有名稱與副標，照片與年份那幾格就收起來 */
function syncExhKind(){
  const isAct = xf.kind.value === 'act';
  xf.photoBoxes.forEach(box => { box.hidden = isAct; });
  document.querySelectorAll('[data-kind-label]').forEach(el => {
    el.hidden = el.dataset.kindLabel !== (isAct ? 'act' : 'photo');
  });
}
xf.kind.addEventListener('change', syncExhKind);
syncExhKind();

function setExhPreview(dataUrl){
  xf.img.value = dataUrl || '';
  xf.prev.innerHTML = dataUrl
    ? `<img src="${escapeHtml(dataUrl)}" alt="展品照片預覽">`
    : `<span>還沒有照片</span>`;
}

document.getElementById('adExhPickBtn').addEventListener('click', ()=> xf.file.click());
document.getElementById('adExhClearImg').addEventListener('click', ()=> setExhPreview(''));

xf.file.addEventListener('change', async ()=>{
  const file = xf.file.files && xf.file.files[0];
  xf.file.value = '';
  if(!file) return;
  if(!file.type.startsWith('image/')){ toast('請選圖片檔', true); return; }
  try{
    const img = await cropImage(file, {
      aspect:   Number(xf.ratio.value) || 0.75,
      outWidth: EXH_OUTWIDTH,
      maxBytes: EXH_MAX_BYTES,
      title:    '裁切展品照片',
    });
    if(img) setExhPreview(img);
  }catch(err){
    console.warn('[admin] 展品裁切失敗', err);
    toast('這張圖讀不進來，換一張試試', true);
  }
});

function resetExhForm(){
  xf.form.reset();
  xf.id.value = '';
  setExhPreview('');
  xf.descLen.textContent = '0';
  xf.order.value = String(DataStore.getExhibits().length + 1);
  syncExhKind();
}
document.getElementById('adExhReset').addEventListener('click', resetExhForm);

xf.form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const kind  = xf.kind.value === 'act' ? 'act' : 'photo';
  const title = xf.title.value.trim();

  if(!title){
    toast(kind === 'act' ? '章節名稱不能是空的' : '展品標題不能是空的', true);
    xf.title.focus();
    return;
  }
  if(kind === 'photo' && !xf.img.value && !xf.desc.value.trim()){
    toast('展品至少要有一張照片或一段描述', true);
    return;
  }

  try{
    await DataStore.saveDoc('exhibits', xf.id.value || null, {
      kind,
      img:   kind === 'photo' ? xf.img.value : '',
      title: title.slice(0, 60),
      sub:   xf.sub.value.trim().slice(0, 60),
      desc:  kind === 'photo' ? xf.desc.value.trim().slice(0, 500) : '',
      year:  kind === 'photo' ? xf.year.value.trim().slice(0, 20) : '',
      act:   kind === 'photo' ? xf.act.value.trim().slice(0, 40) : '',
      order: Number(xf.order.value) || 0,
      time:  Date.now(),
    });
    resetExhForm();
    toast('已儲存');
  }catch(err){ writeFailed(err); }
});

function renderExhibits(){
  const list = DataStore.getExhibits();
  if(!list.length){
    xf.list.innerHTML =
      `<div class="ad-empty">還沒有展品<br>沒設定的話，戀愛時光會沿用素材資料夾或內建的範例</div>`;
    return;
  }
  xf.list.innerHTML = list.map(it => `
    <div class="ad-item">
      ${it.kind === 'photo' && it.img
        ? `<img class="ad-exh-thumb" src="${escapeHtml(it.img)}" alt="">`
        : ''}
      <div class="ad-item-main">
        <span class="ad-item-title">${escapeHtml(it.title || '（沒有標題）')}</span>
        <span class="ad-tag">${it.kind === 'act' ? '章節' : '展品'}</span>
        ${it.year ? `<span class="ad-tag">${escapeHtml(it.year)}</span>` : ''}
        ${it.sub ? `<span class="ad-item-sub">${escapeHtml(it.sub)}</span>` : ''}
        ${it.desc ? `<span class="ad-item-sub">${escapeHtml(it.desc.slice(0, 60))}${
          it.desc.length > 60 ? '…' : ''}</span>` : ''}
      </div>
      <div class="ad-item-actions">
        <span class="ad-order">#${it.order ?? 0}</span>
        <button class="ad-edit" type="button" data-edit-exh="${it.id}">編輯</button>
        <button class="ad-del"  type="button" data-del-exh="${it.id}">刪除</button>
      </div>
    </div>`).join('');
}
document.addEventListener('data:exhibits', renderExhibits);

xf.list.addEventListener('click', async (e)=>{
  const editId = e.target.dataset.editExh;
  const delId  = e.target.dataset.delExh;

  if(editId){
    const it = DataStore.getExhibits().find(x => x.id === editId);
    if(!it) return;
    xf.id.value    = it.id;
    xf.kind.value  = it.kind === 'act' ? 'act' : 'photo';
    xf.title.value = it.title || '';
    xf.sub.value   = it.sub   || '';
    xf.year.value  = it.year  || '';
    xf.act.value   = it.act   || '';
    xf.desc.value  = it.desc  || '';
    xf.order.value = String(it.order ?? 0);
    xf.descLen.textContent = xf.desc.value.length;
    setExhPreview(it.img || '');
    syncExhKind();
    xf.form.scrollIntoView({ behavior:'smooth', block:'start' });
    return;
  }

  if(delId){
    if(!confirm('確定要刪掉這一筆嗎？')) return;
    try{
      await DataStore.removeDoc('exhibits', delId);
      if(xf.id.value === delId) resetExhForm();
      toast('已刪除');
    }catch(err){ writeFailed(err); }
  }
});
