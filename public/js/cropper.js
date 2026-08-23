/* ============================================================
   cropper.js — 照片裁切器（新人後台專用）
   ------------------------------------------------------------
   為什麼要有這個東西：
     囍卡是直式 2:3、展品是拍立得比例，新人手上的照片幾乎不會剛好對上。
     沒有裁切器的話，圖不是被塞歪就是重要的人被切掉 ——
     所以上傳前先讓新人自己決定「要留畫面的哪一塊」。

   用法（回傳 Promise，取消時 resolve(null)、圖片讀不開時 reject）：
     const dataUrl = await cropImage(file, {
       aspect: 2/3,        // 寬 / 高
       outWidth: 900,      // 輸出寬度（px）
       maxBytes: 900000,   // data URL 的字元數上限
       title: '裁切囍卡',
     });

   ・source 可以是 File，也可以是既有的 data URL（重新裁切用）
   ・輸出一律是 JPEG data URL，尺寸與畫質會自動往下試，
     直到塞得進 Firestore 單一文件的 1MB 限制
   ・沒有旋轉功能：手機拍的照片瀏覽器會自己依 EXIF 轉正，
     再多做一層反而容易轉錯
============================================================ */

/* 這支檔案由 admin.html 直接載入，全域只留一個函式 */
function cropImage(source, options){
  const opt = Object.assign({
    aspect:   2/3,
    outWidth: 900,
    maxBytes: 900000,
    title:    '裁切照片',
    hint:     '拖曳移動・滑桿或滾輪縮放',
  }, options || {});

  return new Promise((resolve, reject)=>{
    const srcUrl = typeof source === 'string' ? source : URL.createObjectURL(source);
    const revoke = () => { if(typeof source !== 'string') URL.revokeObjectURL(srcUrl); };

    const img = new Image();
    /* 解不開 ≠ 使用者按了取消。
       兩者原本都走 resolve(null)，結果 HEIC 讀不開時被算成「略過」，
       toast 說「已加入 3 張（略過 2 張）」——上傳的人完全不知道發生了什麼事。
       所以這裡要 reject，讓呼叫端有機會說清楚是哪一個檔案、為什麼。 */
    img.onerror = ()=>{
      revoke();
      const err = new Error('這個格式瀏覽器讀不開');
      err.code = 'image-decode-failed';
      reject(err);
    };
    img.onload  = ()=> openEditor(img);
    img.src = srcUrl;

    function openEditor(image){
      /* ---------- 畫面 ---------- */
      const mask = document.createElement('div');
      mask.className = 'cr-mask';
      mask.innerHTML = `
        <div class="cr-card" role="dialog" aria-modal="true">
          <div class="cr-title">${escapeHtml(opt.title)}</div>
          <div class="cr-stage" id="crStage">
            <img class="cr-img" alt="" draggable="false">
            <div class="cr-grid" aria-hidden="true"></div>
          </div>
          <div class="cr-hint">${escapeHtml(opt.hint)}</div>
          <input class="cr-zoom" id="crZoom" type="range" min="100" max="400" value="100"
                 aria-label="縮放">
          <div class="cr-row">
            <button class="btn small ghost" id="crCancel" type="button">取消</button>
            <button class="btn small" id="crOk" type="button">用這個範圍</button>
          </div>
        </div>`;
      document.body.appendChild(mask);

      const stage  = mask.querySelector('#crStage');
      const el     = mask.querySelector('.cr-img');
      const zoomEl = mask.querySelector('#crZoom');
      el.src = image.src;

      /* 裁切框：寬度吃滿卡片，高度由 aspect 決定 */
      const stageW = stage.clientWidth;
      const stageH = Math.round(stageW / opt.aspect);
      stage.style.height = stageH + 'px';

      const nw = image.naturalWidth, nh = image.naturalHeight;
      /* cover：不論怎麼縮放，圖片都不會露出裁切框外的空白 */
      const baseScale = Math.max(stageW / nw, stageH / nh);

      let zoom = 1, tx = 0, ty = 0;

      function dims(){ return { w: nw * baseScale * zoom, h: nh * baseScale * zoom }; }

      /* 圖片永遠蓋滿裁切框：位移限制在「不露白」的範圍內 */
      function clamp(){
        const { w, h } = dims();
        tx = Math.min(0, Math.max(stageW - w, tx));
        ty = Math.min(0, Math.max(stageH - h, ty));
      }
      function paint(){
        const { w, h } = dims();
        el.style.width  = w + 'px';
        el.style.height = h + 'px';
        el.style.transform = `translate(${tx}px, ${ty}px)`;
      }
      function setZoom(next, anchorX, anchorY){
        const prev = zoom;
        zoom = Math.min(4, Math.max(1, next));
        /* 以畫面上的某一點為中心縮放，手指按著的地方才不會亂跑 */
        const ax = anchorX == null ? stageW / 2 : anchorX;
        const ay = anchorY == null ? stageH / 2 : anchorY;
        const k = zoom / prev;
        tx = ax - (ax - tx) * k;
        ty = ay - (ay - ty) * k;
        clamp(); paint();
        zoomEl.value = String(Math.round(zoom * 100));
      }

      /* 一開始置中 */
      tx = (stageW - dims().w) / 2;
      ty = (stageH - dims().h) / 2;
      clamp(); paint();

      /* ---------- 拖曳 / 縮放 ---------- */
      const pointers = new Map();
      let dragX = 0, dragY = 0, pinchDist = 0, pinchZoom = 1;

      stage.addEventListener('pointerdown', (e)=>{
        stage.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
        if(pointers.size === 1){ dragX = e.clientX - tx; dragY = e.clientY - ty; }
        if(pointers.size === 2){ pinchDist = spread(); pinchZoom = zoom; }
      });

      stage.addEventListener('pointermove', (e)=>{
        if(!pointers.has(e.pointerId)) return;
        pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });

        if(pointers.size >= 2){
          /* 兩指縮放：以兩指中點為錨 */
          const d = spread();
          if(pinchDist > 0){
            const r = stage.getBoundingClientRect();
            const c = center();
            setZoom(pinchZoom * (d / pinchDist), c.x - r.left, c.y - r.top);
          }
          return;
        }
        tx = e.clientX - dragX;
        ty = e.clientY - dragY;
        clamp(); paint();
      });

      const release = (e)=>{
        pointers.delete(e.pointerId);
        if(pointers.size < 2) pinchDist = 0;
        if(pointers.size === 1){
          const p = [...pointers.values()][0];
          dragX = p.x - tx; dragY = p.y - ty;
        }
      };
      stage.addEventListener('pointerup', release);
      stage.addEventListener('pointercancel', release);

      function spread(){
        const [a, b] = [...pointers.values()];
        return Math.hypot(a.x - b.x, a.y - b.y);
      }
      function center(){
        const [a, b] = [...pointers.values()];
        return { x:(a.x + b.x) / 2, y:(a.y + b.y) / 2 };
      }

      stage.addEventListener('wheel', (e)=>{
        e.preventDefault();
        const r = stage.getBoundingClientRect();
        setZoom(zoom * (e.deltaY < 0 ? 1.12 : 1/1.12), e.clientX - r.left, e.clientY - r.top);
      }, { passive:false });

      zoomEl.addEventListener('input', ()=> setZoom(Number(zoomEl.value) / 100));

      /* ---------- 結束 ---------- */
      function close(value){
        document.removeEventListener('keydown', onKey);
        mask.remove();
        revoke();
        resolve(value);
      }
      function onKey(e){ if(e.key === 'Escape') close(null); }
      document.addEventListener('keydown', onKey);

      mask.querySelector('#crCancel').addEventListener('click', ()=> close(null));
      mask.addEventListener('click', (e)=>{ if(e.target === mask) close(null); });

      mask.querySelector('#crOk').addEventListener('click', ()=>{
        const okBtn = mask.querySelector('#crOk');
        okBtn.disabled = true;
        okBtn.textContent = '處理中…';
        /* 讓瀏覽器先把「處理中」畫出來，再做同步的匯出 */
        setTimeout(()=>{
          let out = null;
          try{ out = exportCrop(); }catch(err){ console.warn('[cropper] 匯出失敗', err); }
          close(out);
        }, 0);
      });

      /* 把畫面上的位移／縮放，等比例放大到輸出尺寸 */
      function exportCrop(){
        let outW = opt.outWidth;

        for(let round = 0; round < 5; round++){
          const outH  = Math.max(1, Math.round(outW / opt.aspect));
          const ratio = outW / stageW;
          const { w, h } = dims();

          const cv = document.createElement('canvas');
          cv.width = outW; cv.height = outH;
          const cx = cv.getContext('2d');
          /* JPEG 沒有透明度，PNG 的透明區不鋪白底會變成黑塊 */
          cx.fillStyle = '#fff';
          cx.fillRect(0, 0, outW, outH);
          cx.imageSmoothingQuality = 'high';
          cx.drawImage(image, tx * ratio, ty * ratio, w * ratio, h * ratio);

          for(const q of [0.86, 0.78, 0.68, 0.58]){
            const data = cv.toDataURL('image/jpeg', q);
            if(data.length <= opt.maxBytes) return data;
          }
          outW = Math.round(outW * 0.8);   /* 還是太大就整體再縮一輪 */
        }
        return null;
      }
    }
  });
}
