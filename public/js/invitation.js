/* ============================================================
   invitation.js — 單頁式邀請函（/w/{slug}/invitation）
   ------------------------------------------------------------
   ・版型與其他頁面共用 css/common.css，只多一份 css/invitation.css
   ・出席回覆用 js/rsvp-form.js，和 /w/{slug}/rsvp 是同一份表單
   ・這一頁是對外分享的入口，刻意不呼叫 requireUser()：
     賓客直接點連結進來就看得到，不必先去大廳報到
   ・每個區塊在對應欄位是空的時候整段隱藏，不留空標題
============================================================ */

const W = window.WED || {};

/* ---------- 封面照 ---------- */
(function renderCover(){
  const src = W.coverImageUrl || (window.SITE && window.SITE.assets && window.SITE.assets.cover);
  if(!src) return;
  const box = document.getElementById('invCover');
  const img = document.getElementById('invCoverImg');
  img.src = src;
  img.alt = `${W.couple || ''} 的合照`;
  /* 載不到就整塊收起來，不留破圖 */
  img.addEventListener('error', ()=>{ box.hidden = true; }, { once:true });
  box.hidden = false;
})();

/* ---------- 日期 ---------- */
(function renderDate(){
  document.getElementById('invDate').textContent = W.date || '日期待定';

  /* 「2027.03.15（一）12:00」：週幾去掉「星期」兩個字，時間去掉「開始」 */
  const wd = (W.weekday || '').replace('星期', '');
  const time = (W.time || '').replace(' 開始', '');
  document.getElementById('detailDate').textContent = W.date
    ? `${W.date}${wd ? `（${wd}）` : ''}${time}`
    : '日期待定';
})();

/* ---------- 倒數計時 ----------
   邀請函只看剩幾天就好，不需要秒級跳動，每小時校正一次即可 */
(function renderCountdown(){
  const box = document.getElementById('invCountdown');
  if(!W.dateISO) return;
  const target = new Date(W.dateISO).getTime();
  if(isNaN(target)) return;

  function tick(){
    const diff = target - Date.now();
    if(diff <= 0){
      box.textContent = '我們結婚囉';
      return false;
    }
    box.innerHTML = `距離婚禮還有 <b>${Math.ceil(diff / 86400000)}</b> 天`;
    return true;
  }
  if(tick()) setInterval(tick, 3600000);
})();

/* ---------- 地點 ---------- */
(function renderVenue(){
  if(!W.venue && !W.address) return;
  document.getElementById('venueRow').hidden = false;
  document.getElementById('venueName').textContent = W.venue || '';
  document.getElementById('venueAddress').textContent = W.address || '';

  const query = W.address || W.venue;
  const url = W.mapUrl || (query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : '');
  if(/^https?:\/\//i.test(url)){
    const link = document.getElementById('mapLink');
    link.href = url;
    link.hidden = false;
  }
})();

/* ---------- 服裝／禮金／兩人的故事（留白就不出現） ---------- */
(function renderNotes(){
  const show = (rowId, textId, value) => {
    if(!value) return;
    document.getElementById(rowId).hidden = false;
    document.getElementById(textId).textContent = value;
  };
  show('dressRow',    'dressCode', W.dressCode);
  show('giftNoteRow', 'giftNote', W.giftNote);

  if(W.story){
    document.getElementById('storyBlock').hidden = false;
    document.getElementById('storyText').textContent = W.story;
  }
})();

/* ---------- 照片牆 ---------- */
(function renderGallery(){
  const photos = (Array.isArray(W.photos) ? W.photos : [])
    .filter(p => typeof p === 'string' && p.trim());
  if(!photos.length) return;

  const grid = document.getElementById('gallery');
  photos.forEach((src, i) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = `${W.couple || ''} 的婚紗照 ${i + 1}`;
    img.loading = 'lazy';
    img.decoding = 'async';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', `放大第 ${i + 1} 張照片`);
    btn.appendChild(img);
    btn.addEventListener('click', () => openLightbox(src, img.alt));

    /* 載不到的照片整格移除，不留破圖 */
    img.addEventListener('error', () => btn.remove(), { once:true });
    grid.appendChild(btn);
  });

  document.getElementById('galleryBlock').hidden = false;
})();

function openLightbox(src, alt){
  const box = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  img.src = src;
  img.alt = alt;
  box.hidden = false;
  document.body.style.overflow = 'hidden';
  document.getElementById('lightboxClose').focus();
}

function closeLightbox(){
  document.getElementById('lightbox').hidden = true;
  document.getElementById('lightboxImg').src = '';
  document.body.style.overflow = '';
}

document.getElementById('lightbox').addEventListener('click', closeLightbox);
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape' && !document.getElementById('lightbox').hidden) closeLightbox();
});

/* ---------- hashtag（沒設定就用 common.js 的預設兩個） ---------- */
(function renderTags(){
  const box = document.getElementById('hashtags');
  const tags = hashtagList();
  if(!tags.length){ document.getElementById('tagBlock').hidden = true; return; }
  tags.forEach(tag => {
    const el = document.createElement('span');
    el.textContent = tag.startsWith('#') ? tag : `#${tag}`;
    box.appendChild(el);
  });
})();

/* ---------- 加入行事曆 ----------
   前端直接產生 .ics 讓各平台自己開，不依賴任何第三方服務 */
(function setupCalendar(){
  if(!W.dateISO) return;
  const start = new Date(W.dateISO);
  if(isNaN(start.getTime())) return;

  /* 沒設結束時間就抓 3 小時 */
  const end = W.dateEndISO && !isNaN(new Date(W.dateEndISO).getTime())
    ? new Date(W.dateEndISO)
    : new Date(start.getTime() + 3 * 3600000);

  const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  /* ics 規格要求逗號、分號、反斜線需逃脫，換行寫成 \n */
  const esc = (s) => String(s || '')
    .replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n');

  const slug = (window.SITE && window.SITE.slug) || 'wedding';
  const place = [W.venue, W.address].filter(Boolean).join(' ');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Minato Studio//Wedding//ZH',
    'BEGIN:VEVENT',
    `UID:${slug}-${stamp(start)}@minato`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`${W.couple} 的婚禮`)}`,
    place ? `LOCATION:${esc(place)}` : '',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  const btn = document.getElementById('calBtn');
  btn.hidden = false;
  btn.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([ics], { type:'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();

/* ---------- 出席回覆（與 /w/{slug}/rsvp 共用同一份表單） ---------- */
RSVPForm.mount({
  host: 'rsvpFormHost',
  onDone(mine){
    confettiRain();
    if(mine.attending === 'yes') setTimeout(fireworksBurst, 300);
  },
});
