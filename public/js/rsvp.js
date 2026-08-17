/* ============================================================
   rsvp.js — 出席回覆頁（/w/{slug}/rsvp）
   ------------------------------------------------------------
   題目與送出邏輯都在 js/rsvp-form.js，和單頁邀請函共用同一份 ——
   兩頁寫進同一個 rsvps 子集合，後台也只有一份儀表板，
   題目各寫一份的話資料形狀就會不一致。

   這支檔案只負責這一頁自己的事：
     ・掛上表單
     ・送出後的特效
     ・新人專屬區塊（網址加 #couple）的說明
============================================================ */
if(!requireUser()) { /* requireUser 已導向首頁 */ }

/* ---------- 表單 ---------- */
RSVPForm.mount({
  host: 'rsvpFormHost',
  onDone(mine){
    confettiRain();
    if(mine.attending === 'yes') setTimeout(fireworksBurst, 300);
  },
});

/* ---------- 統計與名單 ----------
   出席回覆屬於個人資料，Security Rules 禁止前端讀取，
   因此這裡不顯示即時統計；新人請在後台看儀表板，或用指令匯出：
     node scripts/export-rsvps.js --slug <slug> --out 名單.csv
============================================================ */
(function hideGuestStats(){
  /* 統計數字讀不到，整塊藏起來比顯示 0 更誠實 */
  const stats = document.getElementById('rsvpCount');
  const box = stats && stats.closest('.rsvp-counter, .stat-row, .stats, .rsvp-stats');
  if(box) box.hidden = true;
  else if(stats) stats.closest('div')?.setAttribute('hidden', '');
})();

const ownerList = document.getElementById('ownerList');
if(ownerList && isOwnerVisitor()){
  ownerList.hidden = false;
  const summary = document.getElementById('olSummary');
  const items = document.getElementById('olItems');
  if(summary) summary.textContent = '出席名單不會顯示在網頁上';
  if(items){
    items.innerHTML =
      `<div class="ol-empty">為了保護賓客隱私，回覆內容只有你用管理金鑰才讀得到。<br>` +
      `完整的統計與名單請進<b>新人後台</b>，或在專案目錄執行：<br><br>` +
      `<code>node scripts/export-rsvps.js --slug ${escapeHtml(window.SITE.slug)} --out 名單.csv</code></div>`;
  }
}
