/* ============================================================
   exhibit-story.js — 「我們的故事」的共用資料層
   ------------------------------------------------------------
   exhibition.html 用 <script defer> 直接載入，全域只留 EXHIBIT_STORY
   一個常數（和 exhibit-defaults.js、quiz-defaults.js 同一套做法）。

   為什麼要有這一份：一頁的敘事模組（sites.storyLayout）有好幾種編排，
   但它們吃的是**同一份 exhibits**。來源怎麼挑、怎麼排序、怎麼分章，
   三件事各寫一份的話，換一個模組就會多一種對不起來的分章結果 ——
   新人在後台看到的章節，和賓客看到的不一樣。所以收在這裡一份。

   各模組只管畫面：拿 items() 或 chapters() 回來的東西排版就好。
============================================================ */
const EXHIBIT_STORY = (() => {

  /* ---------- exhibits 的欄位 → 各模組共用的格式 ----------
     （kind='act' 是章節分隔卡，sub 在故事是時間補充、在章節是副標） */
  function toItem(it, i){
    const n = (typeof it.order === 'number') ? it.order : (i + 1);
    return it.kind === 'act'
      ? { n, type:'act', label: it.title || '', subtitle: it.sub || '' }
      : { n, type:'photo', src: it.img || '',
          year: it.year || '', when: it.sub || '',
          title: it.title || '', desc: it.desc || '', act: it.act || '',
          finale: it.finale === true };
  }

  /* ---------- 素材資料夾的 exhibition/ ----------
     meta.json 的欄位（year／title／desc／act）由 site-context.js 掃進
     window.SITE.assets.exhibition，這裡只負責轉成同一種格式。 */
  function assetItems(){
    const list = (window.SITE && window.SITE.assets && window.SITE.assets.exhibition) || [];
    return list.map((item, i) => ({
      n: typeof item.order === 'number' ? item.order : (i + 1),
      type:'photo', src: item.src,
      year: item.year || '', when: item.when || '',
      title: item.title || '', desc: item.desc || '', act: item.act || '',
      finale: false,
    }));
  }

  /* ---------- 內建範例 ----------
     照片一律留空、也不寫年份：範例不曉得這對新人是哪一年相遇的。
     各模組要自己處理「沒有照片、沒有年份」長什麼樣子。 */
  function defaultItems(){
    const list = (typeof EXHIBIT_DEFAULTS !== 'undefined' && Array.isArray(EXHIBIT_DEFAULTS))
      ? EXHIBIT_DEFAULTS : [];
    return list.map(toItem);
  }

  /* ---------- 現在該用哪一份（由上而下，先找到就用） ----------
       1. 新人在後台設定的故事（Firestore exhibits）
       2. 素材資料夾 public/assets/{slug}/exhibition/
       3. js/exhibit-defaults.js 的內建範例
     排序一律照 n（後台的 order）—— 三個來源都排過，模組不必再排一次。 */
  function items(){
    const owner = (typeof DataStore !== 'undefined' ? DataStore.getExhibits() : []) || [];
    const list = owner.length ? owner.map(toItem)
               : (assetItems().length ? assetItems() : defaultItems());
    return list.slice().sort((a, b) => a.n - b.n);
  }

  /* ============================================================
     分章：一條規則，所有模組共用
     ------------------------------------------------------------
     `act` 在資料裡有兩個身分，這是分章唯一需要小心的地方：

       kind:'act'   一張獨立的分隔卡，有自己的 title（章名）與 sub（副標）
       act:'第一幕'  每一則 photo 上的字串欄位

     分章**只看分隔卡**：依 order 排好之後，遇到一張 kind:'act'
     就開一個新的章。photo 上的 act 字串只當顯示用的標籤與退路
     （分隔卡被刪掉、或素材資料夾的 meta.json 只填了 act 沒有分隔卡）。

     為什麼不照 photo 的 act 字串分組：內建範例開頭那兩則
     （「我們結婚了」「在成為『我們』之前」）**沒有 act**，
     照字串分組會把它們歸到一個叫空字串的章，或者整段掉出去。
     它們其實是序章 —— 照分隔卡切段的話，它們自然就是第 0 章，
     而那正是章節式故事想要的開場白。

     回傳：[{ label, subtitle, lead, photos:[…] }, …]
       label     章名（序章沒有，是空字串）
       subtitle  章的副標
       lead      這一章是不是序章（第一張分隔卡之前的那一段）
       photos    這一章的故事，維持原本的順序

     空的章（連續兩張分隔卡、或最後一張分隔卡後面沒有故事）會被收掉：
     一個只有標題、底下什麼都沒有的章節，在畫面上只會是一段突兀的留白。
  ============================================================ */
  function chapters(list){
    const src = Array.isArray(list) ? list : items();
    const out = [];
    let cur = { label:'', subtitle:'', lead:true, photos:[] };

    src.forEach(item => {
      if(item.type === 'act'){
        if(cur.photos.length) out.push(cur);
        cur = { label:item.label || '', subtitle:item.subtitle || '', lead:false, photos:[] };
        return;
      }
      cur.photos.push(item);
    });
    if(cur.photos.length) out.push(cur);

    /* 分隔卡一張都沒有（素材資料夾的 meta.json 常常是這樣）：
       退回 photo 自己的 act 字串分組，至少還有章節感。
       全部都沒填 act 就維持單一一章 —— 那是對的，本來就沒有章節。 */
    if(out.length === 1 && out[0].lead){
      const byAct = groupByActField(out[0].photos);
      if(byAct) return byAct;
    }
    return out;
  }

  /* 退路：照 photo 的 act 字串切段（相鄰且同名的歸同一章）。
     一則 act 都沒填就回 null，交給上面維持單一一章。 */
  function groupByActField(photos){
    if(!photos.some(p => p.act)) return null;
    const out = [];
    photos.forEach(p => {
      const name = p.act || '';
      const last = out[out.length - 1];
      if(last && last.label === name){ last.photos.push(p); return; }
      out.push({ label:name, subtitle:'', lead:!name, photos:[p] });
    });
    return out;
  }

  return { toItem, items, chapters };
})();
