/* ============================================================
   lobby-mount.js — 三份模板共用的同一支 renderer
   ------------------------------------------------------------
   這是藍圖 Phase 3 的原型：模板只提供「結構」，這裡只負責「填空」。
   規則有三條，三份模板都靠它們才能長得完全不一樣卻共用同一份資料：

     1. [data-field="key"]  → 填文字。找不到欄位就留空，不會露出 {{}}
     2. <template data-list="schedule"> → 清單。模板自己決定一格長什麼樣，
        這裡只 clone 再填 [data-field]，所以 markup 完全由模板決定
     3. 全部 null-safe：模板少一塊就少一塊，不會整頁掛掉

   正式版會再加上 window.SITE／rewriteNavLinks／DataStore，
   這支示範刻意只留跟「模板」有關的部分。
============================================================ */
(function () {
  const D = window.DEMO || {};

  /* ---------- 1. 單一欄位 ---------- */
  function fillFields(root) {
    (root || document).querySelectorAll('[data-field]').forEach((el) => {
      const key = el.dataset.field;
      const val = key.split('.').reduce((o, k) => (o == null ? o : o[k]), D);
      if (val == null || val === '') {
        /* 沒有值：可省略的欄位整格收起來，不留空標題 */
        if (el.hasAttribute('data-optional')) el.hidden = true;
        return;
      }
      el.textContent = String(val);
    });
  }

  /* ---------- 2. 清單：模板出 <template>，這裡只 clone ---------- */
  function fillLists(root) {
    (root || document).querySelectorAll('template[data-list]').forEach((tpl) => {
      const items = D[tpl.dataset.list];
      const host  = tpl.parentElement;
      if (!host || !Array.isArray(items) || !items.length) {
        /* 沒資料就把整個區塊收起來（模板用 data-section 宣告自己是誰） */
        const sec = tpl.closest('[data-section]');
        if (sec) sec.hidden = true;
        return;
      }
      items.forEach((item, i) => {
        const node = tpl.content.cloneNode(true);
        node.querySelectorAll('[data-field]').forEach((el) => {
          const key = el.dataset.field;
          let val = key === '_index' ? String(i + 1).padStart(2, '0') : item[key];
          if (val == null || val === '') { el.hidden = true; return; }
          el.textContent = String(val);
        });
        /* 自訂卡片的小記號：資料說了算，不是模板寫死的 */
        node.querySelectorAll('[data-flag="custom"]').forEach((el) => {
          if (!item.custom) el.remove();
        });
        host.insertBefore(node, tpl);
      });
    });
  }

  /* ---------- 3. 區塊捷徑（資訊卡 → 流程／交通） ---------- */
  function bindJumps(root) {
    (root || document).querySelectorAll('[data-jump]').forEach((el) => {
      el.addEventListener('click', (e) => {
        const target = document.querySelector(`[data-section="${el.dataset.jump}"]`);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  /* ---------- 4. 倒數 ---------- */
  const UNITS = [['days', '天'], ['hours', '時'], ['mins', '分'], ['secs', '秒']];
  function startCountdown() {
    const host = document.querySelector('[data-countdown]');
    if (!host || !D.dateISO) return;
    const target = new Date(D.dateISO).getTime();
    if (isNaN(target)) return;
    const tpl = host.querySelector('template');

    function tick() {
      const diff = target - Date.now();
      if (diff <= 0) {
        host.innerHTML = `<div class="cd-done">我們結婚囉</div>`;
        return;
      }
      const s = Math.floor(diff / 1000);
      const v = {
        days:  Math.floor(s / 86400),
        hours: Math.floor((s % 86400) / 3600),
        mins:  Math.floor((s % 3600) / 60),
        secs:  s % 60,
      };
      if (tpl) {
        host.querySelectorAll('[data-unit]').forEach((el) => el.remove());
        UNITS.forEach(([k, label]) => {
          const node = tpl.content.cloneNode(true);
          const box  = node.querySelector('[data-unit]');
          const num  = node.querySelector('[data-num]');
          const lab  = node.querySelector('[data-label]');
          if (num) num.textContent = String(v[k]).padStart(2, '0');
          if (lab) lab.textContent = label;
          if (box) host.insertBefore(node, tpl);
        });
      }
      setTimeout(tick, 1000);
    }
    tick();
  }

  /* ---------- 5. 蕨葉裝飾（Forest 用；沒有這個容器就不畫） ----------
     線稿用迴圈生出來，不手刻一長串 path */
  function drawFerns() {
    document.querySelectorAll('[data-fern]').forEach((host) => {
      const leaves = 13;
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 120 190');
      svg.setAttribute('aria-hidden', 'true');

      const stem = document.createElementNS(ns, 'path');
      stem.setAttribute('d', 'M60 188 C 58 140, 54 90, 62 8');
      stem.setAttribute('fill', 'none');
      stem.setAttribute('stroke', 'currentColor');
      stem.setAttribute('stroke-width', '1.1');
      svg.appendChild(stem);

      for (let i = 0; i < leaves; i++) {
        const t  = i / (leaves - 1);
        const y  = 178 - t * 158;
        const x  = 59 + t * 3;
        const len = 34 * Math.sin(Math.PI * (0.18 + t * 0.72)) + 6;
        for (const dir of [-1, 1]) {
          const leaf = document.createElementNS(ns, 'ellipse');
          leaf.setAttribute('cx', String(x + dir * len * 0.5));
          leaf.setAttribute('cy', String(y - len * 0.16));
          leaf.setAttribute('rx', String(len * 0.5));
          leaf.setAttribute('ry', String(3 + len * 0.09));
          leaf.setAttribute('fill', 'none');
          leaf.setAttribute('stroke', 'currentColor');
          leaf.setAttribute('stroke-width', '0.9');
          leaf.setAttribute('transform',
            `rotate(${dir * (24 + t * 14)} ${x} ${y})`);
          svg.appendChild(leaf);
        }
      }
      host.appendChild(svg);
    });
  }

  function boot() {
    fillFields();
    fillLists();
    bindJumps();
    startCountdown();
    drawFerns();
    document.documentElement.dataset.demoReady = '1';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
