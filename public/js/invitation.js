/* ============================================================
   invitation.js — 出席回覆（/w/{slug}/invitation）
   ------------------------------------------------------------
   這一頁只做一件事：**收下這位賓客的回覆**。

   會拿到這個連結的人，多半已經知道要回覆出席了 ——
   婚禮資訊、兩人的故事、照片迴廊在大廳都有，在這裡再放一次，
   等於把真正要做的那件事一路往下推。所以頁面剩下：
   封面（姓名／日期／倒數）→ 出席回覆表單 → hashtag → footer。
   想回頭看的人，從送出之後的結果卡就進得去（見 js/rsvp-form.js）。

   ・版型與其他頁面共用 css/common.css，只多一份 css/invitation.css
   ・表單題目由 js/rsvp-form.js 依新人在後台的設定產生
   ・**刻意不呼叫 requireUser()**：這一頁是對外分享的連結，
     賓客點進來就該看得到表單，不必先回大廳看入場動畫、填名字報到
============================================================ */

const W = window.WED || {};

/* ---------- 日期 ---------- */
(function renderDate(){
  document.getElementById('invDate').textContent = W.date || '日期待定';
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

/* ---------- 出席回覆表單 ---------- */
RSVPForm.mount({
  host: 'rsvpFormHost',
  onDone(mine){
    confettiRain();
    if(mine.attending === 'yes') setTimeout(fireworksBurst, 300);
  },
});
