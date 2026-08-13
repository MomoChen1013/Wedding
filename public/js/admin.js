/* ============================================================
   admin.js — 新人後台
   ------------------------------------------------------------
   一個地方管三件事：
     1. 桌次   — 上傳桌次圖、匯入賓客名單
     2. 祝福信 — 寫給特定賓客的電子信
     3. 首頁卡片 — Explore 區的自訂模組（連結型／彈窗型）

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

  /* 訂閱三份資料，畫面隨著資料變動重畫 */
  DataStore.subscribeSeating();
  DataStore.subscribeBlessings();
  DataStore.subscribeExplore();
  renderSeatList();
  renderImages();
  renderLetters();
  renderExplore();
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
