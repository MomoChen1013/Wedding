/* ============================================================
   invitation.js — 出席回覆（/w/{slug}/invitation）
   ------------------------------------------------------------
   婚禮資訊與出席回覆表單收在同一頁。原本 /rsvp 與 /invitation
   是兩頁、兩份表單、寫進同一個子集合，等於同一件事做兩次，
   所以合併成這一頁；舊網址 /rsvp 由 Hosting 301 導過來。

   ・版型與其他頁面共用 css/common.css，只多一份 css/invitation.css
   ・表單題目由 js/rsvp-form.js 依新人在後台的設定產生
   ・**刻意不呼叫 requireUser()**：這一頁是對外分享的連結，
     賓客點進來就該看得到表單，不必先回大廳看入場動畫、填名字報到
   ・每個區塊在對應欄位是空的、或新人在後台關掉時，整段隱藏
============================================================ */

const W = window.WED || {};
/* 新人在後台開關的項目（沒設定過一律視為開著） */
const CFG = rsvpConfig();

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

/* ---------- 地點 ----------
   多活動時「日期」與「地點」兩列換成一組活動列，一個活動一個地點。
   單一活動（＝目前全部的站台）走的還是原本那兩列，一個字都沒改。 */
(function renderVenue(){
  const evs = weddingEvents();
  if(evs.length > 1){ renderEventRows(evs); return; }

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

/* 多活動的資訊列：一個活動一列，左邊放名稱（原本放「日期／地點」的位置）。
   ★ 不需要回覆的活動（文訂、迎娶）也照樣列出來 ——
     這一段講的是「這場婚禮有哪些事」，不是「你要回覆什麼」。 */
function renderEventRows(evs){
  const rows = document.querySelector('#rsvpBlock') ? document.querySelector('.inv-rows') : null;
  if(!rows) return;

  /* 全部同一天才在最上面留一列日期，各活動只寫時間；
     跨日（文訂在前一個月）就收掉，每一列自己寫完整日期 */
  const sameDay = new Set(evs.map(e => e.date).filter(Boolean)).size === 1
    && evs.every(e => e.date);
  const dateRow = document.getElementById('detailDate').closest('.inv-row');
  if(!sameDay) dateRow.hidden = true;

  const venueRow = document.getElementById('venueRow');
  const html = evs.map(ev => {
    const w = eventWhen(ev);
    const when = sameDay
      ? w.range
      : [w.md ? `${w.md}${w.wdTw ? `（${w.wdTw}）` : ''}` : '', w.range]
          .filter(Boolean).join(' ');
    const map = eventMapUrl(ev);
    const addr = ev.address && ev.address !== ev.venueName ? ev.address : '';
    return `<div class="inv-row inv-ev">
      <div class="ir-label">${escapeHtml(ev.name)}</div>
      <div class="ir-body">
        ${when ? `<div class="ir-val ir-when">${escapeHtml(when)}</div>` : ''}
        ${ev.venueName ? `<div class="ir-val">${escapeHtml(ev.venueName)}</div>` : ''}
        ${addr ? `<div class="ir-sub">${escapeHtml(addr)}</div>` : ''}
        ${map ? `<a class="ir-jump" href="${escapeHtml(map)}" target="_blank"
                    rel="noopener noreferrer">查看地圖 →</a>` : ''}
      </div>
    </div>`;
  }).join('');

  venueRow.insertAdjacentHTML('beforebegin', html);
  venueRow.remove();
}

/* ---------- 服裝／禮金／兩人的故事 ----------
   留白就不出現；兩人的故事另外可以由新人在後台整塊關掉 */
(function renderNotes(){
  const show = (rowId, textId, value) => {
    if(!value) return;
    document.getElementById(rowId).hidden = false;
    document.getElementById(textId).textContent = value;
  };
  show('dressRow',    'dressCode', W.dressCode);
  show('giftNoteRow', 'giftNote', W.giftNote);

  /* Dress Code 的色塊：和大廳同一組顏色、同一個形狀。
     只選了顏色沒寫文字時，這一列也要出現 ——
     參考圖不放在邀請函上：這一頁要短，滑到底就是「我要回覆」。 */
  const swatchBox = document.getElementById('dressSwatches');
  const colors = (Array.isArray(W.dressCodeColors) ? W.dressCodeColors : [])
    .filter(c => /^#[0-9a-fA-F]{6}$/.test(String(c || '').trim()))
    .slice(0, 4);
  if(swatchBox && colors.length){
    colors.forEach(hex => {
      const dot = document.createElement('span');
      dot.className = 'dress-swatch';
      dot.style.background = hex;
      swatchBox.appendChild(dot);
    });
    swatchBox.hidden = false;
    document.getElementById('dressRow').hidden = false;
  }

  if(W.story && CFG.showStory){
    document.getElementById('storyBlock').hidden = false;
    document.getElementById('storyText').textContent = W.story;
  }
})();

/* ---------- 照片集（新人可以在後台整塊關掉） ---------- */
(function renderGallery(){
  if(!CFG.showGallery) return;
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

/* ---------- 出席回覆表單 ---------- */
RSVPForm.mount({
  host: 'rsvpFormHost',
  onDone(mine){
    confettiRain();
    if(mine.attending === 'yes') setTimeout(fireworksBurst, 300);
  },
});
