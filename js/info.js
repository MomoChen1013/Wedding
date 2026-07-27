/* ============================================================
   info.js — 婚禮資訊卡 + 日期倒數
   資料全部來自 config.js 的 window.WED，改設定即可更新本頁
============================================================ */
if(!requireUser()) { /* requireUser 已導向首頁 */ }

const W = window.WED || {};

/* ---------- 新人姓名 ---------- */
setText('infoCouple',   W.couple || 'Ethan & Momo');
setText('infoCoupleCn', W.coupleCn || '');

/* ---------- 基本資訊 ---------- */
setText('infoDate',  [W.date, W.weekday].filter(Boolean).join('・'));
setText('infoTime',  W.time || '');
setText('infoVenue', [W.city, W.venue].filter(Boolean).join('　'));
setText('infoAddr',  W.address || '');

/* ---------- 日期倒數 ---------- */
startCountdown(document.getElementById('cdGrid'), W.dateISO, 'grid');
setText('cdTarget', W.date ? `${W.date}（${W.weekday || ''}）${W.time || ''}` : '');

/* ---------- 地圖連結 ---------- */
const mapBtn = document.getElementById('mapBtn');
if(mapBtn){
  const q = encodeURIComponent(W.address || W.venue || '');
  mapBtn.href = W.mapUrl || `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/* ---------- 加入行事曆（Google 日曆）---------- */
const calBtn = document.getElementById('calBtn');
if(calBtn){
  const fmt = iso => {
    const d = new Date(iso);
    if(isNaN(d)) return '';
    const p = n => String(n).padStart(2,'0');
    // 用 UTC 產生 Google Calendar 需要的 YYYYMMDDTHHMMSSZ 格式
    return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}T`
         + `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  };
  const start = fmt(W.dateISO);
  const end   = fmt(W.dateEndISO || W.dateISO);
  const title = encodeURIComponent(`${W.couple || ''} 婚禮`);
  const loc   = encodeURIComponent([W.venue, W.address].filter(Boolean).join(' '));
  const det   = encodeURIComponent('一起見證我們的幸福時刻 ♡');
  if(start && end){
    calBtn.href = `https://calendar.google.com/calendar/render?action=TEMPLATE`
                + `&text=${title}&dates=${start}/${end}&location=${loc}&details=${det}`;
  } else {
    calBtn.style.display = 'none';
  }
}

/* ---------- 當日流程 ---------- */
const sch = document.getElementById('schedule');
if(sch){
  const list = Array.isArray(W.schedule) ? W.schedule : [];
  if(!list.length){
    sch.innerHTML = `<div class="tl-empty">流程稍後公布，敬請期待 ♡</div>`;
  } else {
    sch.innerHTML = list.map(s => `
      <div class="tl-item">
        <div class="tl-time">${escapeHtml(s.time || '')}</div>
        <div class="tl-dot"></div>
        <div class="tl-content">
          <div class="tl-t">${escapeHtml(s.title || '')}</div>
          ${s.desc ? `<div class="tl-d">${escapeHtml(s.desc)}</div>` : ''}
        </div>
      </div>`).join('');
  }
}

/* ---------- Dress code / 禮金 ---------- */
setText('dressCode', W.dressCode || '輕鬆舒適就好，一起把畫面拍得漂漂亮亮 ♡');
setText('giftNote',  W.giftNote  || '您的到來就是最好的禮物 ♡');

/* ---------- 小工具 ---------- */
function setText(id, txt){
  const el = document.getElementById(id);
  if(el) el.textContent = txt || '';
}
