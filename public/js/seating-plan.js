/* ============================================================
   seating-plan.js — 排桌管理（新人後台的一個分頁）
   ------------------------------------------------------------
   目標不是「把 Excel 搬到網頁」，而是讓新人比 Excel 更快排完桌。
   所以整頁圍著四件事打轉：

     1. 未安排的人永遠看得見（左邊那一欄不會被捲走）
     2. 拖曳就能安排，拖到哪就進哪一桌
     3. 容量與特殊需求即時算給你看，超過不擋、但一定講
     4. 每一步都可以復原

   三個實體，不把賓客寫死在桌子裡：

     Guest（賓客）  ── SeatingAssignment（排桌關係）── Table（桌位）

   賓客的來源是既有的出席回覆（rsvps）＋ 新人自己補的名單，
   標籤沿用既有的賓客標籤（guestTags／rsvpTags），不另外做一套分類。

   ------------------------------------------------------------
   資料放哪裡
   ------------------------------------------------------------
   整份排桌是一份草稿，存在 sites/{siteId}/seatingPlan/draft：

     tables  桌位清單
     guests  賓客的排桌欄位（編號、類別、人數、喜餅…）
             ── rsvps 一個字都不會被改，這裡只放「排桌時補的資料」
     assign  賓客 id → 桌位 id

   為什麼是一份文件：排桌是「改一堆、看整體、覺得可以了才存」的工作。
   一次寫一份文件才存得起完整的一版，也才做得到「儲存」與「同步」分開：

     改動 →（在瀏覽器裡，可以無限復原）
       → 按「儲存排桌」→ 寫進草稿
       → 問一句「要同步到桌次查詢嗎？」
       → 新人說要，才寫進 seating（賓客查得到的那一份）

   前台不會因為後台還在整理座位就跟著變 —— 這是刻意的，不要改成自動同步。
============================================================ */
(function () {
  'use strict';

  /* ============================================================
     常數
  ============================================================ */
  const MAX_TABLES   = 60;    /* 規則也擋同一個數字 */
  const MAX_GUESTS   = 600;
  const DEFAULT_CAP  = 10;
  const UNDO_LIMIT   = 60;

  /* 桌位類型：這張桌子是什麼用途（和賓客標籤是兩回事）。
     custom 讓新人自己打字，之後要再加固定類型直接補在這裡。 */
  const TABLE_TYPES = [
    ['main',      '主桌'],
    ['family',    '家人桌'],
    ['relative',  '親友桌'],
    ['classmate', '同學桌'],
    ['colleague', '同事桌'],
    ['vip',       'VIP'],
    ['custom',    '自訂'],
  ];

  /* 需要在桌上被看見的特殊需求。比對的是標籤「名字」——
     標籤是新人自己取的，所以用關鍵字包含判斷，取名叫「全素」「素食者」都認得。 */
  const SPECIAL_TAGS = [
    { key:'veg',   icon:'🥬', label:'素食',     match:['素'] },
    { key:'a11y',  icon:'♿', label:'行動不便', match:['行動不便', '輪椅', '無障礙'] },
    { key:'kid',   icon:'👶', label:'兒童',     match:['小孩', '兒童', '幼兒', '寶寶'] },
    { key:'vip',   icon:'✦',  label:'VIP',      match:['vip'] },
  ];

  const RSVP_TEXT = { yes:'已確認', maybe:'待確認', no:'無法出席' };

  /* 沒有標籤時，類別的預設值就用「與新人的關係」 */
  const RELATION_TEXT = { groom:'男方親友', bride:'女方親友', both:'雙方親友', other:'其他' };
  /* 自動編號的字首：看得出是哪一邊的親友，B01 一眼就知道是女方 */
  const CODE_PREFIX = { groom:'A', bride:'B', both:'C', other:'D' };

  /* ============================================================
     狀態
     ------------------------------------------------------------
     plan 是「還沒存進資料庫」的工作狀態，undo／redo 都在這一層。
  ============================================================ */
  const plan = {
    tables: [],     /* [{ id, no, name, cap, type, typeName, order }] */
    meta:   {},     /* guestId → 排桌欄位（rsvp 賓客只存被改過的） */
    assign: {},     /* guestId → tableId */
  };

  let loadPromise = null;   /* load() 的 promise，外面要等草稿讀完才問得到排桌資料 */
  let savedAt = 0;      /* 上次按「儲存排桌」的時間 */
  let syncedAt = 0;     /* 上次同步到桌次查詢的時間 */
  let dirty = false;    /* 有還沒存的修改 */
  let started = false;  /* init() 只跑一次 */
  let loaded = false;   /* 草稿讀回來了沒 */

  const undoStack = [];
  const redoStack = [];

  /* 提醒收起來時只佔一行，其餘展開才看（見 renderWarns） */
  let warnsOpen = false;

  /* 篩選預設收起來：這一頁最重要的是那兩欄工作區，
     一進來就先看到人和桌子，需要篩再展開。 */
  let filtersOpen = false;

  /* 手機／平板上被收起來的桌子（放桌 id）。
     排完的桌先關上，螢幕才留得給還沒排完的那幾桌。
     只是「暫時關起來」的看法，不是資料，所以不進 plan、也不進 localStorage：
     重整之後每一桌都是打開的。
     收合鈕只給拖不動的裝置（觸控或 ≤960px，見 admin.css）。 */
  const foldedTables = new Set();

  /* 畫面上的篩選與排序 */
  const view = {
    q: '',
    rsvp: 'all',          /* all / yes / maybe */
    tags: new Set(),      /* 多選；空的代表不篩 */
    showDeclined: false,  /* 「無法出席」預設不列 —— 他們不需要位子 */
    sort: 'default',
    tagOrder: [],         /* 標籤權重（標籤 id），沒設定就照標籤庫的順序 */
  };

  /* ============================================================
     小工具
  ============================================================ */
  const $ = (id) => document.getElementById(id);
  const esc = (s) => escapeHtml(s == null ? '' : s);

  /* 桌號一律兩位數：1 → 01、10 → 10。
     顯示是兩位數字串，資料庫存的仍然是數字（才排得了序） */
  function no2(n) {
    const v = Math.max(0, Math.min(99, Number(n) || 0));
    return String(v).padStart(2, '0');
  }

  function newId(prefix) {
    return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  function clampInt(v, min, max, fallback) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function tagsOn() { return typeof guestTagsOn === 'function' && guestTagsOn(); }
  function tagLib() { return tagsOn() ? guestTagList() : []; }

  /* 標籤名字 → 特殊需求（素食、行動不便…）。名字用包含比對，大小寫不計 */
  function specialsOf(names) {
    const low = names.map((n) => String(n).toLowerCase());
    return SPECIAL_TAGS.filter((sp) =>
      low.some((n) => sp.match.some((m) => n.includes(m.toLowerCase()))));
  }

  /* ============================================================
     賓客
     ------------------------------------------------------------
     一位賓客 ＝ 出席回覆本身（改不動）＋ 排桌時補的欄位（meta）。
     手動加的、匯入進來的賓客沒有回覆，整筆都在 meta 裡（src:'manual'）。
  ============================================================ */

  /* rsvpId → 標籤 id（賓客自己選的那一個 ＋ 新人在後台掛的） */
  function tagIdsOfRsvp(r) {
    if (!tagsOn()) return [];
    const mine = DataStore.getRsvpTagMap()[r.id] || [];
    return [...new Set([String(r.tag || ''), ...mine].filter(Boolean))]
      .filter((id) => guestTagName(id));
  }

  /* 出席回覆已經問過「葷素分配」與「兒童座椅」了，
     填了就不該再叫新人手動掛一次標籤。所以：
       mealVeg  > 0 → 自動帶素食標籤
       childSeat> 0 → 自動帶小孩標籤
     找得到標籤庫裡對應的標籤才掛得上去（名字自己取的，用關鍵字比對）。
     這是從回覆推出來的，不寫回 rsvpTags —— 回覆改不動，推論就跟著回覆走。 */
  function tagIdByName(re) {
    const hit = tagLib().find((t) => re.test(t.name));
    return hit ? hit.id : '';
  }
  function vegTagId() { return tagIdByName(/素/); }
  function kidTagId() { return tagIdByName(/小孩|兒童|幼兒|寶寶/); }

  function derivedTagIds(r) {
    const out = [];
    if (Number(r.mealVeg) > 0) { const id = vegTagId(); if (id) out.push(id); }
    if (Number(r.childSeat) > 0) { const id = kidTagId(); if (id) out.push(id); }
    return out;
  }

  /* 自動編號：同一個字首依回覆時間排序後給 01、02…
     算出來的東西不存進資料庫 —— 新人沒改過就每次算一樣的結果。

     ------------------------------------------------------------
     號碼「不重複使用」
     ------------------------------------------------------------
     編號是拿來對人的：桌卡上寫 B06、跟長輩講「你是 B06」、
     匯出的 CSV 裡也是 B06。所以一個號碼一輩子只能屬於一個人。

     刪掉 B05 之後：
       ・B06～B08 不會往前挪（他們手上那張紙沒有跟著改）
       ・下一筆新回覆拿到的是 B09，不是把 B05 補回去
     空號沒有成本，重號有 —— 兩個不同的人在不同時間都叫 B05，
     紙本名單和後台就對不起來了。

     實作上靠 plan.meta[id].code：那是「已經定下來」的號碼。
     刪回覆之前後台會先呼叫 freezeCodes() 把當下的號碼全部釘進去，
     所以這裡只要「跳過已經用掉的號碼、從最大的往後發」就夠了。 */
  function codeOf(prefix, n) { return `${prefix}${String(n).padStart(2, '0')}`; }

  function autoCodes() {
    const rows = DataStore.getRSVPs()
      .slice()
      .sort((a, b) => rsvpMs(a) - rsvpMs(b) || String(a.id).localeCompare(String(b.id)));

    const out = {};
    const used = new Set();   /* 已經被用掉的號碼（含手動賓客的） */
    const next = {};          /* 字首 → 下一個要發的號碼 */

    /* 第一輪：先收下所有「已經定下來」的號碼 */
    const take = (code) => {
      if (!code) return;
      used.add(String(code).toUpperCase());
      const m = /^([A-Za-z]+)(\d+)$/.exec(String(code));
      if (!m) return;
      const p = m[1].toUpperCase();
      next[p] = Math.max(next[p] || 1, Number(m[2]) + 1);
    };
    Object.values(plan.meta).forEach((m) => take(m && m.code));
    rows.forEach((r) => {
      const m = plan.meta[r.id];
      if (m && m.code) out[r.id] = m.code;
    });

    /* 第二輪：還沒有號碼的，從各自字首的最大號往後發，跳過用掉的 */
    rows.forEach((r) => {
      if (out[r.id]) return;
      const p = CODE_PREFIX[r.relation] || 'D';
      let n = next[p] || 1;
      while (used.has(codeOf(p, n).toUpperCase())) n++;
      out[r.id] = codeOf(p, n);
      used.add(out[r.id].toUpperCase());
      next[p] = n + 1;
    });
    return out;
  }

  function rsvpMs(r) {
    const t = r.createdAt;
    return t && typeof t.toDate === 'function' ? t.toDate().getTime() : 0;
  }

  let codeCache = null;
  function invalidateGuests() { codeCache = null; }

  /* 全部賓客（回覆 ＋ 手動加的），已經套好 meta 覆寫 */
  function allGuests() {
    if (!codeCache) codeCache = autoCodes();

    const list = DataStore.getRSVPs().map((r) => {
      const m = plan.meta[r.id] || {};
      const status = DataStore.rsvpStatus(r);
      const derived = derivedTagIds(r);
      const ids = [...new Set([...tagIdsOfRsvp(r), ...derived])];
      /* 無法出席的人預設不佔位子；真的要留位就在抽屜裡自己填人數 */
      const baseCount = status === 'no' ? 0 : (Number(r.guestCount) || 1);
      return {
        id: r.id,
        src: 'rsvp',
        code: m.code || codeCache[r.id] || '',
        name: r.name || '（沒有名字）',
        cat:  m.cat != null && m.cat !== '' ? m.cat : (RELATION_TEXT[r.relation] || ''),
        count: m.count != null ? m.count : baseCount,
        rsvp: m.rsvp || status,
        tagIds: ids,
        tagNames: ids.map(guestTagName).filter(Boolean),
        /* 這幾個標籤是從回覆推出來的，抽屜裡畫成關不掉的勾勾 */
        lockedTagIds: [...derived, String(r.tag || '')].filter(Boolean),
        note: m.note != null && m.note !== '' ? m.note : (r.note || r.dietaryNote || ''),
        gift: Number(m.gift) || 0,
        got: m.got === true,
        /* 這兩個是回覆裡問到的實際數字，比「整筆算一個人」準得多 */
        veg: Number(r.mealVeg) || 0,
        seats: m.seats != null ? Number(m.seats) : (Number(r.childSeat) || 0),
        since: rsvpMs(r),
      };
    });

    Object.entries(plan.meta).forEach(([id, m]) => {
      if (m.src !== 'manual') return;
      const ids = (m.tags || []).filter((t) => guestTagName(t));
      list.push({
        id,
        src: 'manual',
        lockedTagIds: [],
        code: m.code || '',
        name: m.name || '（沒有名字）',
        cat: m.cat || '',
        count: Number(m.count) || 0,
        rsvp: m.rsvp || 'yes',
        tagIds: ids,
        tagNames: ids.map(guestTagName).filter(Boolean),
        note: m.note || '',
        gift: Number(m.gift) || 0,
        got: m.got === true,
        veg: 0,
        seats: Number(m.seats) || 0,
        since: 0,
      });
    });

    list.forEach((g) => {
      g.tableId = plan.assign[g.id] || '';
      g.specials = specialsOf(g.tagNames);
    });
    return list;
  }

  function guestById(id) { return allGuests().find((g) => g.id === id) || null; }

  /* ============================================================
     桌位
  ============================================================ */
  function sortedTables() {
    return plan.tables.slice().sort((a, b) => (a.order - b.order) || (a.no - b.no));
  }

  function tableById(id) { return plan.tables.find((t) => t.id === id) || null; }

  function tableLabel(t) {
    /* 沒設定桌名就只顯示桌號 —— 不要出現「01｜（桌名）」這種空殼 */
    return t.name ? `${no2(t.no)}｜${t.name}` : no2(t.no);
  }

  function typeName(t) {
    if (t.type === 'custom') return t.typeName || '自訂';
    const hit = TABLE_TYPES.find(([k]) => k === t.type);
    return hit ? hit[1] : '';
  }

  /* 一桌現在坐了幾位（單位是人，不是筆數） */
  function seatedOf(tableId, guests) {
    const rows = (guests || allGuests()).filter((g) => g.tableId === tableId);
    return {
      rows,
      heads: rows.reduce((n, g) => n + (Number(g.count) || 0), 0),
    };
  }

  /* 下一個沒被用掉的桌號 */
  function nextTableNo() {
    const used = new Set(plan.tables.map((t) => t.no));
    for (let i = 1; i <= 99; i++) if (!used.has(i)) return i;
    return 99;
  }

  /* ============================================================
     復原 / 重做
     ------------------------------------------------------------
     每一次改動前先拍一張快照。整份 plan 不大（幾百筆字串），
     直接深拷貝比逐一記錄「做了什麼」單純得多，也不會有漏記的動作。
  ============================================================ */
  function snapshot() {
    return JSON.stringify({ tables: plan.tables, meta: plan.meta, assign: plan.assign });
  }

  function restore(json) {
    const d = JSON.parse(json);
    plan.tables = d.tables || [];
    plan.meta   = d.meta || {};
    plan.assign = d.assign || {};
  }

  /* 所有會改到排桌的動作都走這裡：拍快照 → 改 → 重畫 */
  function mutate(fn) {
    const before = snapshot();
    fn();
    const after = snapshot();
    if (before === after) return;      /* 沒有真的變化就不佔一格復原 */
    undoStack.push(before);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
    dirty = true;
    scheduleLocalDraft();
    renderAll();
  }

  function undo() {
    if (!undoStack.length) return;
    const cur = snapshot();
    restore(undoStack.pop());
    redoStack.push(cur);
    dirty = true;
    scheduleLocalDraft();
    renderAll();
    toast('已復原上一步');
  }

  function redo() {
    if (!redoStack.length) return;
    const cur = snapshot();
    restore(redoStack.pop());
    undoStack.push(cur);
    dirty = true;
    scheduleLocalDraft();
    renderAll();
    toast('已重做');
  }

  /* ============================================================
     讀 / 存
  ============================================================ */
  function planDoc() {
    const { db, doc } = window.fb;
    return doc(db, 'sites', window.SITE.siteId, 'seatingPlan', 'draft');
  }

  /* ============================================================
     本機草稿
     ------------------------------------------------------------
     為什麼需要：
       undo/redo stack 與還沒存的 plan 都只活在記憶體裡，
       而 iOS Safari 在背景分頁被系統回收時 **不會觸發 beforeunload**。
       整個下午的排桌就這樣無聲消失，而且完全沒有跡象。

     所以每次有修改就（debounce 之後）把 planPayload() 寫進 localStorage，
     下次進來如果草稿比雲端新，就問一句要不要接續。
     localStorage 由 LS 以 siteId 分隔，不會和別場婚禮互相汙染。
  ============================================================ */
  const DRAFT_KEY = 'seatPlan.localDraft';
  let draftTimer = 0;

  function writeLocalDraft() {
    clearTimeout(draftTimer);
    draftTimer = 0;
    if (!loaded) return;
    try {
      LS.set(DRAFT_KEY, { at: Date.now(), dirty, payload: planPayload() });
    } catch (err) {
      console.warn('[排桌] 本機草稿寫不進去', err);
    }
  }

  function scheduleLocalDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(writeLocalDraft, 1500);
  }

  function clearLocalDraft() {
    clearTimeout(draftTimer);
    draftTimer = 0;
    LS.remove(DRAFT_KEY);
  }

  /* 雲端讀完之後才問：草稿比雲端新（而且當時真的還沒存）才有意義 */
  async function offerLocalDraft() {
    const d = LS.get(DRAFT_KEY, null);
    if (!d || !d.payload || !d.dirty || d.declined) return;

    /* 已經被別的裝置存過、或這台自己後來存過了 → 草稿沒有價值，收掉 */
    if (Number(d.payload.savedAt) <= savedAt) { clearLocalDraft(); return; }

    const ok = await confirmModal({
      title: '有一份還沒存的排桌',
      message: `這台裝置在 ${fmtTime(d.at)} 有一份排桌還沒存進去。要接續那一份嗎？`
             + '（選「重新開始」的話，會用雲端上最後存好的那一份。）',
      confirmText: '接續那一份',
      cancelText: '重新開始',
    });

    /* 不接就記一筆「問過了」，但**不要刪掉**草稿 ——
       誤點遮罩也會走到這裡，而這份草稿可能是整個下午的工作 */
    if (!ok) { LS.set(DRAFT_KEY, { ...d, declined: true }); return; }

    plan.tables = (Array.isArray(d.payload.tables) ? d.payload.tables : [])
      .map(readTable).filter(Boolean);
    plan.meta = {};
    (Array.isArray(d.payload.guests) ? d.payload.guests : []).forEach((g) => {
      const m = readGuestMeta(g);
      if (m) plan.meta[m.id] = m;
    });
    plan.assign = {};
    const a = d.payload.assign && typeof d.payload.assign === 'object' ? d.payload.assign : {};
    Object.keys(a).forEach((k) => { if (a[k]) plan.assign[k] = String(a[k]); });

    dirty = true;
    invalidateGuests();
    renderAll();
    toast('已接回上次沒存完的排桌，記得按「儲存排桌」');
  }

  async function load() {
    try {
      const snap = await window.fb.getDoc(planDoc());
      if (snap.exists()) {
        const d = snap.data() || {};
        plan.tables = (Array.isArray(d.tables) ? d.tables : []).map(readTable).filter(Boolean);
        plan.meta = {};
        (Array.isArray(d.guests) ? d.guests : []).forEach((g) => {
          const m = readGuestMeta(g);
          if (m) plan.meta[m.id] = m;
        });
        plan.assign = {};
        const a = d.assign && typeof d.assign === 'object' ? d.assign : {};
        Object.keys(a).forEach((k) => { if (a[k]) plan.assign[k] = String(a[k]); });
        savedAt = Number(d.savedAt) || 0;
        syncedAt = Number(d.syncedAt) || 0;
      }
      loaded = true;
      dirty = false;
    } catch (err) {
      loaded = true;
      console.warn('[排桌] 讀取草稿失敗', err);
      toast('讀不到排桌資料，請確認這個帳號在新人帳號名單內', true);
      renderAll();
      return;
    }
    renderAll();
    await offerLocalDraft();
  }

  /* 讀回來的每一筆都重新收斂一次型別 ——
     手動改過資料庫、或舊版存的欄位，都不該讓畫面壞掉 */
  function readTable(t) {
    if (!t || typeof t !== 'object' || !t.id) return null;
    return {
      id: String(t.id).slice(0, 40),
      no: clampInt(t.no, 1, 99, 1),
      name: String(t.name || '').slice(0, 20),
      cap: clampInt(t.cap, 1, 30, DEFAULT_CAP),
      type: TABLE_TYPES.some(([k]) => k === t.type) ? t.type : 'relative',
      typeName: String(t.typeName || '').slice(0, 10),
      order: clampInt(t.order, 0, 999, 1),
    };
  }

  function readGuestMeta(g) {
    if (!g || typeof g !== 'object' || !g.id) return null;
    const m = { id: String(g.id).slice(0, 60), src: g.src === 'manual' ? 'manual' : 'rsvp' };
    if (g.code != null) m.code = String(g.code).slice(0, 12);
    if (g.cat  != null) m.cat  = String(g.cat).slice(0, 20);
    if (g.name != null) m.name = String(g.name).slice(0, 40);
    if (g.count != null && g.count !== '') m.count = clampInt(g.count, 0, 30, 0);
    if (g.rsvp && RSVP_TEXT[g.rsvp]) m.rsvp = g.rsvp;
    if (Array.isArray(g.tags)) m.tags = g.tags.map(String).slice(0, 20);
    if (g.note != null) m.note = String(g.note).slice(0, 200);
    if (g.seats != null && g.seats !== '') m.seats = clampInt(g.seats, 0, 10, 0);
    if (g.gift != null) m.gift = clampInt(g.gift, 0, 99, 0);
    if (g.got === true) m.got = true;
    return m;
  }

  /* 回覆來的賓客如果一個欄位都沒被改過，就不必存 ——
     不然 600 筆的上限會被一堆空殼佔滿 */
  function metaIsEmpty(m) {
    if (m.src === 'manual') return false;
    return !m.code && !m.cat && !m.name && m.count == null && !m.rsvp
      && !(m.tags && m.tags.length) && !m.note && !m.gift && m.got !== true
      && m.seats == null;
  }

  function planPayload() {
    const guests = Object.values(plan.meta)
      .filter((m) => !metaIsEmpty(m))
      .slice(0, MAX_GUESTS);
    const keep = new Set([...DataStore.getRSVPs().map((r) => r.id), ...guests.map((g) => g.id)]);
    const tableIds = new Set(plan.tables.map((t) => t.id));
    const assign = {};
    Object.entries(plan.assign).forEach(([gid, tid]) => {
      /* 已經被刪掉的桌位或賓客不要留下孤兒關係 */
      if (tableIds.has(tid) && keep.has(gid)) assign[gid] = tid;
    });
    return {
      tables: plan.tables.slice(0, MAX_TABLES).map(readTable).filter(Boolean),
      guests,
      assign,
      savedAt: Date.now(),
      syncedAt,
    };
  }

  /* 儲存／送出時把對應的按鈕鎖起來並換文案。
     按下去畫面完全沒反應的話，使用者會再按一次、再按一次 ——
     排桌這一頁按兩次的代價是整份草稿被送兩遍。 */
  function setBusy(ids, on, label) {
    ids.forEach((id) => {
      const b = $(id);
      if (!b) return;
      if (on) {
        if (b._spText == null) b._spText = b.textContent;
        b.disabled = true;
        b.classList.add('is-saving');
        b.textContent = label;
      } else {
        b.disabled = false;
        b.classList.remove('is-saving');
        if (b._spText != null) { b.textContent = b._spText; b._spText = null; }
      }
    });
  }
  const SAVE_BTNS = ['spSaveBtn', 'spMbSave'];
  const SYNC_BTNS = ['spSyncBtn', 'spMbSync'];

  /* markSynced：這一次的存檔是「送到查座位頁」的收尾。
     兩個時間戳一定要來自同一份 payload —— 各自呼叫一次 Date.now() 的話，
     只要中間差 1 毫秒，savedAt 就會比 syncedAt 新，
     畫面立刻變回「有修改還沒送出」，但其實什麼都沒改。 */
  async function save(silent, markSynced) {
    const payload = planPayload();
    if (markSynced) payload.syncedAt = payload.savedAt;
    if (payload.guests.length >= MAX_GUESTS) {
      toast(`排桌名單最多 ${MAX_GUESTS} 位，請先整理一下`, true);
      return false;
    }
    setBusy(SAVE_BTNS, true, '儲存中…');
    try {
      await withWriteTimeout(window.fb.setDoc(planDoc(), payload));
      savedAt = payload.savedAt;
      syncedAt = payload.syncedAt;
      plan.assign = payload.assign;
      dirty = false;
      clearLocalDraft();
      renderAll();
      if (!silent) toast('排桌已儲存');
      return true;
    } catch (err) {
      /* 沒送出去的話，本機草稿是最後一道防線 —— 先寫下來再說 */
      writeLocalDraft();
      writeFailed(err, () => save(silent));
      return false;
    } finally {
      setBusy(SAVE_BTNS, false);
    }
  }

  /* ============================================================
     同步到桌次查詢
     ------------------------------------------------------------
     桌次查詢（賓客那一頁）讀的是 seating 子集合。
     同步 ＝ 把目前排好的結果整份換過去，所以要先問一次。
     刻意不做自動同步：新人排桌會反覆調整，前台不該跟著跳。
  ============================================================ */
  async function syncToSeating(skipConfirm) {
    const guests = allGuests().filter((g) => g.tableId);
    if (!guests.length) {
      toast('目前還沒有任何賓客被排進桌位', true);
      return;
    }

    /* 剛剛才在「排桌已儲存」那一步問過的話，不要連問兩次 */
    if (!skipConfirm) {
      const ok = await confirmModal({
        title: '送到賓客的查座位頁',
        message: `會把目前排好的 ${guests.length} 位賓客整份送到賓客的「我的桌次」，`
               + '原本那一份桌次名單會被換掉。要繼續嗎？',
        confirmText: '送出去',
        cancelText: '稍後再說',
      });
      if (!ok) return;
    }

    const rows = guests.map((g) => {
      const t = tableById(g.tableId);
      const bits = [];
      if (Number(g.count) > 1) bits.push(`共 ${g.count} 位`);
      if (g.note) bits.push(g.note);
      return {
        name: String(g.name).slice(0, 40),
        table: (t ? tableLabel(t) : '').slice(0, 40),
        note: bits.join('・').slice(0, 100),
      };
    }).filter((r) => r.name && r.table);

    setBusy(SYNC_BTNS, true, '送出中…');
    try {
      await DataStore.wipeCollection('seating');
      await DataStore.importSeating(rows);
      await save(true, /* markSynced */ true);
      afterSyncToast(rows.length);
    } catch (err) {
      writeFailed(err, () => syncToSeating(true));
    } finally {
      setBusy(SYNC_BTNS, false);
    }
  }

  /* 同步完不代表賓客看得到 —— 桌次那一頁還有一個總開關
     （「婚禮資訊」分頁最上面的「開放桌次功能」），關著的話前台什麼都沒有。
     這是婚禮當天最容易卡住的地方，所以同步成功就直接問。 */
  function afterSyncToast(n) {
    const off = siteData().seatingFeatureEnabled === false;
    if (!off) {
      toast(`已同步 ${n} 位賓客到桌次查詢`);
      return;
    }
    showToast(`已同步 ${n} 位，但「開放桌次功能」還關著，賓客目前還看不到`, {
      duration: 9000,
      actionLabel: '現在打開',
      onAction() {
        location.hash = 'lobby/info';
        /* 換分頁要一點時間，等畫面切過去再把開關捲進視野並閃一下 */
        setTimeout(() => {
          const box = document.getElementById('adSeatFeature');
          if (!box) return;
          box.closest('.ad-callout').scrollIntoView({ block:'center', behavior:'smooth' });
          box.closest('.ad-callout').classList.add('is-flash');
          setTimeout(() => box.closest('.ad-callout').classList.remove('is-flash'), 1600);
        }, 260);
      },
    });
  }

  /* 儲存 →（存成功才問）要不要同步 */
  async function saveThenAsk() {
    const okSave = await save();
    if (!okSave) return;
    const go = await confirmModal({
      title: '排桌已儲存',
      message: '要順便送到賓客的查座位頁嗎？送出之後賓客馬上查得到自己的桌次；'
             + '還在調整的話可以稍後再說，賓客那邊不會跟著變動。',
      confirmText: '送出去',
      cancelText: '稍後再說',
    });
    if (go) await syncToSeating(true);
  }

  /* ============================================================
     篩選 / 排序 / 分組
  ============================================================ */

  /* 一位多標籤的賓客要被歸到哪一組：照標籤權重由上往下，第一個對到的就是他的組。
     原本的標籤全部保留，只是「顯示在哪一群」需要一個唯一答案。 */
  function groupOrder() {
    const lib = tagLib();
    const byId = new Map(lib.map((t) => [t.id, t]));
    const ordered = view.tagOrder.map((id) => byId.get(id)).filter(Boolean);
    lib.forEach((t) => { if (!ordered.includes(t)) ordered.push(t); });
    return ordered;
  }

  function primaryTag(g) {
    const order = groupOrder();
    const hit = order.find((t) => g.tagIds.includes(t.id));
    return hit || null;
  }

  /* 搜尋比對用的一串字（姓名、編號、類別、標籤、桌號都吃得到） */
  function haystack(g) {
    const t = tableById(g.tableId);
    return normKey([g.name, g.code, g.cat, g.tagNames.join(' '), t ? tableLabel(t) : ''].join(' '));
  }

  function hitsSearch(g) {
    return !view.q || haystack(g).includes(view.q);
  }

  /* 篩選只作用在「未安排」那一區 —— 它就住在那一區裡。
     已經排好的人不會因為篩選而從桌上消失（那樣會嚇到人），
     搜尋到的人改成在桌上標起來（見 renderBoard）。 */
  function inPool(g) {
    if (g.tableId) return false;
    if (!view.showDeclined && g.rsvp === 'no') return false;
    if (view.rsvp !== 'all' && g.rsvp !== view.rsvp) return false;
    if (view.tags.size && !g.tagIds.some((id) => view.tags.has(id))) return false;
    return hitsSearch(g);
  }

  function sortGuests(list) {
    const arr = list.slice();
    const byCode = (a, b) => String(a.code).localeCompare(String(b.code), 'zh-Hant');
    /* 預設排序就是編號由小到大 —— 編號是照回覆時間給的，
       所以「預設」等於「回覆進來的順序」，最接近新人手上那份 Excel */
    if (view.sort === 'name') arr.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hant'));
    else if (view.sort === 'countDesc') arr.sort((a, b) => b.count - a.count || byCode(a, b));
    else if (view.sort === 'countAsc') arr.sort((a, b) => a.count - b.count || byCode(a, b));
    else if (view.sort === 'tag') {
      const order = groupOrder();
      const rank = (g) => {
        const p = primaryTag(g);
        const i = p ? order.findIndex((t) => t.id === p.id) : -1;
        return i < 0 ? order.length : i;   /* 沒有標籤的排最後（＝「其他」） */
      };
      arr.sort((a, b) => rank(a) - rank(b) || byCode(a, b));
    } else arr.sort(byCode);
    return arr;
  }

  /* ============================================================
     畫面：統計
  ============================================================ */
  function renderStats() {
    const guests = allGuests();
    const heads = guests.reduce((n, g) => n + g.count, 0);
    const seated = guests.filter((g) => g.tableId);
    const seatedHeads = seated.reduce((n, g) => n + g.count, 0);
    const avg = plan.tables.length ? (seatedHeads / plan.tables.length) : 0;

    /* 只留四個一直要盯著的數字。超過容量、特殊需求、待確認 RSVP
       都在下面的提醒列講得更清楚（而且會指名是第幾桌），
       擺在這裡只會讓真正要看的四個數字變小。 */
    const cells = [
      [heads, '總人數'],
      [plan.tables.length, '總桌數'],
      [heads - seatedHeads, '未安排人數'],
      [plan.tables.length ? avg.toFixed(1) : '—', '平均一桌人數'],
    ];
    const html = cells.map(([n, lab]) => `
      <div class="ad-stat">
        <div class="ad-stat-num">${esc(n)}</div>
        <div class="ad-stat-lab">${esc(lab)}</div>
      </div>`).join('');
    $('spStats').innerHTML = html;
    /* 手機把統計收進「⋮ 更多」，底列只留「未安排」與「儲存排桌」 */
    $('spMoreStats').innerHTML = html;
  }

  /* ============================================================
     畫面：提醒
     ------------------------------------------------------------
     一律只提醒，不擋操作 —— 婚宴實務上常常要臨時硬塞一個人進去。
  ============================================================ */
  /* 提醒分兩級：
       warn 要處理（沒排到、爆容量、缺人數）
       info 知道就好（誰還沒回覆、哪一桌有幾位素食）
     混在一起數的話，「8 項提醒」看起來會比實際嚴重得多。 */
  function buildWarns() {
    const guests = allGuests();
    const list = [];

    /* 1. 沒排到的人 —— 這一頁最不想發生的事，永遠排第一 */
    const unassigned = guests.filter((g) => !g.tableId && g.count > 0);
    if (unassigned.length) {
      const heads = unassigned.reduce((n, g) => n + g.count, 0);
      list.push({ level:'warn', text:`尚有 ${unassigned.length} 位賓客（${heads} 人）未安排` });
    }

    /* 2. 上次儲存之後才進來的回覆 —— RSVP 常常一路收到婚禮前一週，
          排完之後又進來幾筆是常態，不講的話很容易整批漏掉 */
    if (savedAt) {
      const fresh = guests.filter((g) => g.src === 'rsvp' && !g.tableId
        && g.rsvp !== 'no' && g.since > savedAt);
      if (fresh.length) {
        list.push({ level:'warn', text:`有 ${fresh.length} 筆新回覆還沒排（上次儲存之後進來的）` });
      }
    }

    /* 3. 爆容量的桌子 */
    sortedTables().forEach((t) => {
      const { heads } = seatedOf(t.id, guests);
      if (heads > t.cap) {
        list.push({ level:'warn', text:`第 ${no2(t.no)} 桌超過容量 ${heads - t.cap} 位（${heads} / ${t.cap}）` });
      }
    });

    /* 4. 排了桌卻沒有人數，容量就算不準 */
    const noCount = guests.filter((g) => g.tableId && g.count <= 0);
    if (noCount.length) {
      list.push({ level:'warn', text:`有 ${noCount.length} 位已排桌的賓客缺少人數` });
    }

    /* 5. 還沒確認出席的人 */
    const pending = guests.filter((g) => g.rsvp === 'maybe');
    if (pending.length) {
      const who = pending.slice(0, 3).map((g) => g.code || g.name).join('、');
      list.push({ level:'info',
        text:`${who}${pending.length > 3 ? ` 等 ${pending.length} 位` : ''} 尚未確認 RSVP` });
    }

    /* 每一桌的特殊需求（素食、行動不便、兒童、VIP）刻意不做成提醒：
       每桌每種各一條，二十幾桌就是幾十條，真正要處理的那幾條會被埋掉。
       它們本來就寫在桌卡上（🥬 2 位素食），那裡才是看得到桌況的地方。 */

    return list;
  }

  /* 收起來的時候只佔一行：最該處理的那一條 ＋「還有 N 項」。
     二十幾桌的婚禮一次會有十幾條提醒，全部攤開會把工作區推出螢幕，
     那就違反了「未安排的人要一直看得見」。 */
  function renderWarns() {
    const list = buildWarns();
    const box = $('spWarns');

    if (!list.length) {
      box.innerHTML = `<div class="sp-warn is-ok">目前沒有需要注意的地方</div>`;
      return;
    }

    const [first, ...rest] = list;
    const warnCount = list.filter((w) => w.level === 'warn').length;

    const row = (w) => `
      <div class="sp-warn is-${w.level}">
        <span class="sp-warn-ic">${w.icon ? esc(w.icon) : (w.level === 'warn' ? '⚠️' : '·')}</span>
        <span class="sp-warn-text">${esc(w.text)}</span>
      </div>`;

    box.innerHTML = `
      <div class="sp-warn is-${first.level} sp-warn-head">
        <span class="sp-warn-ic">${first.icon ? esc(first.icon) : (first.level === 'warn' ? '⚠️' : '·')}</span>
        <span class="sp-warn-text">${esc(first.text)}</span>
        ${rest.length ? `
          <button class="sp-warn-more${warnCount > 1 ? ' has-warn' : ''}" type="button"
                  id="spWarnToggle" aria-expanded="${warnsOpen}" aria-controls="spWarnRest"
                  title="${warnCount > 1 ? `其中 ${warnCount - 1} 項要處理` : '其餘都是知道就好'}">${
            warnsOpen ? '收起' : `還有 ${rest.length} 項`}</button>` : ''}
      </div>
      ${rest.length ? `<div class="sp-warn-rest" id="spWarnRest"${warnsOpen ? '' : ' hidden'}>${
        rest.map(row).join('')}</div>` : ''}`;

    const toggle = $('spWarnToggle');
    if (toggle) toggle.addEventListener('click', () => { warnsOpen = !warnsOpen; renderWarns(); });
  }

  /* ============================================================
     畫面：賓客卡
     ------------------------------------------------------------
     一張卡就兩行：
       第一行　編號　姓名 …………… 人數
       第二行　標籤（放不下就左右滑）
     排桌時要掃過去的是「誰、幾位、什麼標籤」，其餘（類別、RSVP、
     備註、目前桌號）收進 peek —— 桌機滑過去、手機點一下才出現。
     卡片小一格，一個螢幕就多看得到好幾桌。
  ============================================================ */
  function guestCard(g) {
    const primary = primaryTag(g);
    const chips = [];
    if (primary) chips.push(`<span class="sp-chip">${esc(primary.name)}</span>`);
    g.specials.forEach((sp) => {
      /* 主要標籤本身就是特殊需求時不要重複出現 */
      if (primary && primary.name === sp.label) return;
      chips.push(`<span class="sp-chip is-special">${sp.icon} ${esc(sp.label)}</span>`);
    });
    /* 其餘標籤照樣掛上去，放不下就左右滑 */
    g.tagNames.forEach((n) => {
      if (primary && n === primary.name) return;
      if (g.specials.some((sp) => sp.label === n
        || sp.match.some((m) => n.toLowerCase().includes(m.toLowerCase())))) return;
      chips.push(`<span class="sp-chip">${esc(n)}</span>`);
    });
    /* 一個標籤都沒有的人也不要空一行，退回顯示類別 */
    const line2 = chips.length
      ? chips.join('')
      : (g.cat ? `<span class="sp-chip is-plain">${esc(g.cat)}</span>` : '');

    /* 搜尋有打字時，命中的卡片標起來（含已經坐在桌上的） */
    const hit = view.q && hitsSearch(g) ? ' is-hit' : '';

    return `
      <article class="sp-card is-rsvp-${g.rsvp}${hit}" data-guest="${esc(g.id)}"
               draggable="true" tabindex="0"
               aria-label="${esc(g.name)}，${g.count} 位，${RSVP_TEXT[g.rsvp]}">
        <div class="sp-card-line">
          <span class="sp-card-code">${esc(g.code || '—')}</span>
          <!-- 人數緊接在名字後面（不再推到最右邊）：中間隔一大段空白時，
               會讓人以為那是另一個人的數字，名字短的時候特別明顯。
               人數不能被名字的刪節號吃掉，所以是它自己一個元素 -->
          <span class="sp-card-name">${esc(g.name)}</span>
          <span class="sp-card-count">（${g.count} 人）</span>
        </div>
        ${line2 ? `<div class="sp-card-tags">${line2}</div>` : ''}
        <!-- 觸控裝置拖不動，而且原本要「點卡片 → peek → 移動到桌位」兩下才碰得到。
             這一顆直接把最常做的動作放在手邊（桌機用 CSS 收起來，那裡有拖曳） -->
        <button class="sp-card-move" type="button" data-move-guest="${esc(g.id)}"
                aria-label="把 ${esc(g.name)} 移動到桌位">⇄</button>
      </article>`;
  }

  /* ============================================================
     完整樣貌（peek）
     ------------------------------------------------------------
     卡片只留兩行，其餘資訊在這一片浮層裡。
     ・桌機（有滑鼠）：滑過去就出現
     ・手機／平板：點一下才出現，再點別的地方收起來
     浮層用 position:fixed 貼著卡片畫，才不會被「未安排」那一欄的
     捲動容器裁掉，也不會把下面的卡片擠開。
  ============================================================ */
  const peekEl = $('spPeek');
  const hoverMq = window.matchMedia('(hover: hover) and (pointer: fine)');
  let peekId = '';
  let peekTimer = 0;

  /* 「這台機器有沒有滑鼠」不夠用 —— 觸控筆電兩種都有。
     所以再看最後一次是用手指還是滑鼠碰的：
       手指 → 點一下先展開 peek（沒有 hover 可以用）
       滑鼠 → 滑過去就看得到，點下去直接開詳細資料 */
  let lastTouch = false;
  document.addEventListener('pointerdown', (e) => {
    lastTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
  }, true);

  function usingMouse() { return !lastTouch && hoverMq.matches; }

  function peekRow(name, value) {
    return value
      ? `<div class="sp-peek-row"><span>${esc(name)}</span><b>${esc(value)}</b></div>`
      : '';
  }

  function openPeek(card) {
    const g = guestById(card.dataset.guest);
    if (!g) return;
    peekId = g.id;
    const t = tableById(g.tableId);

    peekEl.innerHTML = `
      <div class="sp-peek-head">
        <span class="sp-peek-code">${esc(g.code || '—')}</span>
        <span class="sp-peek-name">${esc(g.name)}</span>
        <span class="sp-peek-count">${g.count} 人</span>
      </div>
      <div class="sp-peek-rows">
        ${peekRow('類別', g.cat)}
        ${peekRow('RSVP', RSVP_TEXT[g.rsvp])}
        ${peekRow('目前桌號', t ? tableLabel(t) : '未安排')}
        ${peekRow('備註', g.note)}
        ${g.seats ? peekRow('兒童椅', `${g.seats} 個`) : ''}
        ${g.gift ? peekRow('喜餅', `${g.gift} 份${g.got ? '・已確認收到' : ''}`) : ''}
      </div>
      ${g.tagNames.length
        ? `<div class="sp-peek-tags">${g.tagNames
            .map((n) => `<span class="sp-chip">${esc(n)}</span>`).join('')}</div>`
        : ''}
      <div class="sp-peek-actions">
        <button class="btn small ghost" type="button" data-peek="move">移動到桌位</button>
        <button class="btn small ghost" type="button" data-peek="detail">詳細資料</button>
      </div>`;

    peekEl.hidden = false;
    placePeek(card);
  }

  /* 貼著卡片放；下面塞不下就翻到上面，左右超出畫面就往內收 */
  function placePeek(card) {
    const r = card.getBoundingClientRect();
    const w = Math.min(280, window.innerWidth - 16);
    peekEl.style.width = `${w}px`;
    const h = peekEl.offsetHeight;

    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    let left = r.left;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;

    peekEl.style.top = `${Math.round(top)}px`;
    peekEl.style.left = `${Math.round(Math.max(8, left))}px`;
  }

  function closePeek() {
    clearTimeout(peekTimer);
    peekEl.hidden = true;
    peekId = '';
  }

  function bindPeek() {
    const panel = document.querySelector('[data-panel="seatingPlan"]');

    /* 桌機：滑過去就看得到，晚一點點出現才不會一路掃過去閃個不停 */
    panel.addEventListener('mouseover', (e) => {
      /* 觸控裝置點一下之後也會補送 mouseover，這裡要擋掉 */
      if (!usingMouse()) return;
      const card = e.target.closest('.sp-card');
      if (!card || card.dataset.guest === peekId) return;
      clearTimeout(peekTimer);
      peekTimer = setTimeout(() => openPeek(card), 140);
    });
    panel.addEventListener('mouseout', (e) => {
      if (!usingMouse()) return;
      const card = e.target.closest('.sp-card');
      if (!card) return;
      if (e.relatedTarget && (card.contains(e.relatedTarget) || peekEl.contains(e.relatedTarget))) return;
      closePeek();
    });

    /* 手機／平板：點一下卡片就展開，點別的地方收起來 */
    document.addEventListener('click', (e) => {
      if (peekEl.hidden) return;
      if (peekEl.contains(e.target)) return;
      if (e.target.closest('.sp-card')) return;
      closePeek();
    });

    peekEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-peek]');
      if (!btn) return;
      const id = peekId;
      closePeek();
      if (btn.dataset.peek === 'move') openMove(id);
      else openDrawer(id);
    });

    /* 捲動、拖曳、換分頁時先收起來，浮層才不會留在半空中 */
    ['scroll', 'wheel'].forEach((ev) =>
      window.addEventListener(ev, () => { if (!peekEl.hidden) closePeek(); }, true));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePeek(); });
  }

  /* ============================================================
     第一次進來的引導
     ------------------------------------------------------------
     還沒有任何桌位＝這組新人第一次用。與其只寫「還沒有任何桌位」，
     不如把整條路講完：標籤 → 開桌 → 排人 → 存檔同步。
     已經做完的那一步會打勾，看得出自己走到哪裡。
  ============================================================ */
  function startGuideHtml(guests) {
    const lib = tagLib();
    const hasGuests = guests.length > 0;

    const steps = [
      {
        done: lib.length > 0,
        title: '建立賓客標籤',
        body: tagsOn()
          ? '女方好友、VIP、素食…之後排桌就是靠它分群。到「出席回覆 → 設定賓客標籤」建立。'
          : '這個站台還沒開賓客標籤功能，可以先跳過，用「類別」分群也排得完。',
        act: tagsOn() ? { label:'去建立標籤', act:'goto-tags' } : null,
      },
      {
        done: hasGuests,
        title: '把賓客放進來',
        body: '填過出席回覆的人會自動出現在左邊。沒填表單的長輩、臨時加的親友，'
            + '用「＋ 新增賓客」一位一位加，或從 Excel／CSV 整份匯入。',
        act: { label:'匯入名單', act:'goto-import' },
      },
      {
        done: false,
        title: '開桌位',
        body: `先把桌子開出來才有地方放人。桌號、桌名、容量、順序之後都改得動。`,
        act: { label:'一次加好幾桌', act:'batch-table' },
        alt: { label:'只加一桌', act:'add-table' },
      },
      {
        done: false,
        title: '排桌，然後存檔',
        body: '把左邊的人拖到桌上（手機是點卡片 →「移動到桌位」）。'
            + '排完按「儲存排桌」，系統才會問你要不要同步到賓客的「我的桌次」——'
            + '在那之前，前台看到的還是舊的。',
        act: null,
      },
    ];

    return `
      <div class="sp-start">
        <div class="sp-start-head">
          <span class="sp-start-title">開始排桌</span>
          <span class="sp-start-sub">四個步驟，做完就可以交給賓客查了</span>
        </div>
        <ol class="sp-start-steps">
          ${steps.map((st, i) => `
            <li class="sp-start-step${st.done ? ' is-done' : ''}">
              <span class="sp-start-no">${st.done ? '✓' : i + 1}</span>
              <div class="sp-start-body">
                <div class="sp-start-name">${esc(st.title)}</div>
                <p class="sp-start-text">${esc(st.body)}</p>
                ${st.act || st.alt ? `<div class="ad-row">
                  ${st.act ? `<button class="btn small" type="button" data-act="${st.act.act}">${esc(st.act.label)}</button>` : ''}
                  ${st.alt ? `<button class="btn small ghost" type="button" data-act="${st.alt.act}">${esc(st.alt.label)}</button>` : ''}
                </div>` : ''}
              </div>
            </li>`).join('')}
        </ol>
      </div>`;
  }

  /* ============================================================
     畫面：未安排區 ＋ 桌位
  ============================================================ */
  function renderBoard() {
    const guests = allGuests();

    /* ---- 未安排 ---- */
    const pool = sortGuests(guests.filter(inPool));
    const poolHeads = pool.reduce((n, g) => n + g.count, 0);
    $('spPoolCount').textContent = `${pool.length} 筆・${poolHeads} 人`;
    $('spMbPoolCount').textContent = String(poolHeads);

    const body = $('spPoolBody');
    const anyUnseated = guests.some((g) => !g.tableId
      && (view.showDeclined || g.rsvp !== 'no'));

    if (!loaded) {
      body.innerHTML = skeletonHtml(3, ['60%', '40%']);
    } else if (!pool.length) {
      body.innerHTML = anyUnseated
        ? emptyState({ title:'沒有符合條件的賓客', body:'把篩選放寬一點，或清掉搜尋關鍵字。' })
        : (guests.length
            ? emptyState({ title:'都排好位子了', body:'每一位賓客都有桌次了。要調整的話，直接把人從桌上拖回來。' })
            : emptyState({
                title: '還沒有賓客',
                body: '賓客填了出席回覆就會自動出現在這裡；沒填的長輩或臨時加的親友，'
                    + '用「＋ 新增賓客」或「匯入」放進來。',
              }));
    } else if (view.sort === 'tag') {
      /* 依標籤分組：同一位賓客只會出現在一組（主要排序 Tag） */
      const order = groupOrder();
      const groups = new Map(order.map((t) => [t.id, { name: t.name, list: [] }]));
      groups.set('__other', { name: '其他', list: [] });
      pool.forEach((g) => {
        const p = primaryTag(g);
        groups.get(p ? p.id : '__other').list.push(g);
      });
      body.innerHTML = [...groups.values()]
        .filter((grp) => grp.list.length)
        .map((grp) => `
          <div class="sp-group">
            <div class="sp-group-head">${esc(grp.name)}
              <small>${grp.list.length} 筆・${grp.list.reduce((n, g) => n + g.count, 0)} 人</small>
            </div>
            ${grp.list.map(guestCard).join('')}
          </div>`).join('');
    } else {
      body.innerHTML = pool.map(guestCard).join('');
    }

    /* ---- 桌位 ---- */
    const board = $('spTablesBoard');
    const tables = sortedTables();
    if (!tables.length) {
      board.innerHTML = startGuideHtml(guests);
      return;
    }

    board.innerHTML = tables.map((t) => {
      const { rows, heads } = seatedOf(t.id, guests);
      const left = t.cap - heads;
      const state = heads > t.cap ? 'over' : (left === 0 ? 'full' : 'ok');
      const leftText = heads > t.cap
        ? `超過容量 ${heads - t.cap} 位`
        : (left === 0 ? '已滿' : `剩餘 ${left} 位`);

      const flags = tableFlags(rows);

      /* 已經排好的人不會因為篩選而消失 —— 那樣會讓人以為位子不見了。
         搜尋到的那幾位改成在桌上標起來（「王小明在第 06 桌」一眼看到）。 */
      const cards = rows;
      const type = typeName(t);

      /* 搜尋有命中這一桌的話就自己打開 —— 收起來的桌子裡標了一位「王小明」
         而畫面上什麼都沒有，看起來會像搜尋壞了。手動收合的狀態留著，
         關鍵字清掉就會收回去。 */
      const folded = foldedTables.has(t.id)
        && !(view.q && rows.some(hitsSearch));
      const bodyId = `spTableBody-${t.id}`;

      return `
        <article class="sp-table is-${state}${folded ? ' is-folded' : ''}" data-table="${esc(t.id)}">
          <!-- 桌號、桌名、人數、剩餘位子都在分隔線「上面」：
               這四件事講的是同一張桌子的狀態，線的下面才是坐在上面的人 -->
          <header class="sp-table-head" draggable="true" data-table-head="${esc(t.id)}">
            <div class="sp-table-head-row">
              <span class="sp-table-no">${no2(t.no)}</span>
              <!-- 沒設定桌名就只留桌號，不要生出「（桌名）」這種空殼 -->
              <span class="sp-table-name">${esc(t.name)}</span>
              ${type ? `<span class="sp-table-type">${esc(type)}</span>` : ''}
              <button class="ad-edit sp-table-edit" type="button" data-edit-table="${esc(t.id)}">編輯</button>
              <!-- 收合：手機／平板才看得到（桌機要靠桌卡是打開的才拖得進人） -->
              <button class="sp-table-fold" type="button" data-fold-table="${esc(t.id)}"
                      aria-expanded="${folded ? 'false' : 'true'}" aria-controls="${esc(bodyId)}"
                      aria-label="${folded ? '展開' : '收合'}第 ${no2(t.no)} 桌">▾</button>
            </div>
            <div class="sp-table-meta">
              <span class="sp-table-count">${heads} / ${t.cap} 人</span>
              <span class="sp-table-left">${esc(leftText)}</span>
            </div>
          </header>
          ${flags ? `<div class="sp-table-flags">${flags}</div>` : ''}
          <div class="sp-table-body" id="${esc(bodyId)}" data-drop="${esc(t.id)}">
            ${cards.length
              ? cards.map(guestCard).join('')
              : `<div class="sp-table-empty"><span class="only-fine">把賓客拖進來</span><span class="only-coarse">點賓客卡右邊的 ⇄，選這一桌</span></div>`}
          </div>
        </article>`;
    }).join('');
  }

  /* 收合／展開一桌（只有手機、平板按得到這顆鈕）。
     不重畫整個工作區 —— 收合是「看法」不是「資料」，
     重畫會把捲動位置和剛剛按下的那顆鈕的焦點一起弄丟。 */
  function toggleTableFold(id) {
    const box = [...document.querySelectorAll('.sp-table')]
      .find((el) => el.dataset.table === id);
    if (!box) { foldedTables.delete(id); renderBoard(); return; }

    /* 要不要收，看的是「畫面上現在是開的還是關的」，不是 foldedTables ——
       被搜尋強制打開的那幾桌兩者會不一樣，照著記錄走的話第一下會按不動 */
    const folded = !box.classList.contains('is-folded');
    if (folded) foldedTables.add(id); else foldedTables.delete(id);

    box.classList.toggle('is-folded', folded);
    const btn = box.querySelector('[data-fold-table]');
    if (!btn) return;
    const no = box.querySelector('.sp-table-no');
    btn.setAttribute('aria-expanded', folded ? 'false' : 'true');
    btn.setAttribute('aria-label',
      `${folded ? '展開' : '收合'}第 ${no ? no.textContent : ''} 桌`);
  }

  /* 一桌要提醒的事，直接寫在桌卡上，不用點進去才看得到。
     數字能用回覆裡問到的實際值就用實際值 ——
     一筆「3 位」裡面只有 1 位吃素的話，寫「3 位素食」是錯的。 */
  function tableFlags(rows) {
    const has = (g, sp) => g.tagNames.some((x) =>
      sp.match.some((m) => x.toLowerCase().includes(m.toLowerCase())));
    const out = [];

    /* 素食：回覆填過葷素分配的用實際人數，只有標籤沒有數字的才整筆算 */
    const vegSp = SPECIAL_TAGS.find((sp) => sp.key === 'veg');
    const veg = rows.reduce((n, g) =>
      n + (g.veg > 0 ? g.veg : (has(g, vegSp) ? g.count : 0)), 0);
    if (veg) out.push(`${vegSp.icon} ${veg} 位素食`);

    /* 兒童座椅：這是「要跟飯店要幾張椅子」的數字，單位是張不是人 */
    const seats = rows.reduce((n, g) => n + (Number(g.seats) || 0), 0);
    if (seats) out.push(`🪑 ${seats} 個兒童椅`);

    /* 有小孩但沒要兒童椅的，另外算一筆，才不會和上面那個重複數 */
    const kidSp = SPECIAL_TAGS.find((sp) => sp.key === 'kid');
    const kids = rows.reduce((n, g) =>
      n + (has(g, kidSp) && !g.seats ? g.count : 0), 0);
    if (kids) out.push(`${kidSp.icon} ${kids} 位兒童`);

    /* 剩下這兩種回覆裡沒有數字可用，只能整筆算 */
    ['a11y', 'vip'].forEach((key) => {
      const sp = SPECIAL_TAGS.find((x) => x.key === key);
      const n = rows.reduce((acc, g) => acc + (has(g, sp) ? g.count : 0), 0);
      if (n) out.push(`${sp.icon} ${n} 位${sp.label}`);
    });

    return out.map((t) => `<span class="sp-flag">${esc(t)}</span>`).join('');
  }

  /* ============================================================
     畫面：桌位管理清單
  ============================================================ */
  function renderTableList() {
    const el = $('spTableList');
    const tables = sortedTables();
    const guests = allGuests();
    if (!tables.length) {
      el.innerHTML = emptyState({
        title: '還沒有任何桌位',
        body: '先把桌子開出來（主桌、男方親友、女方同事…），才有地方可以放人。',
        action: { label:'新增桌位', id:'spTableEmptyAdd' },
      });
      return;
    }
    el.innerHTML = tables.map((t, i) => {
      const { heads } = seatedOf(t.id, guests);
      const type = typeName(t);
      return `
        <div class="ad-item sp-table-row" data-table="${esc(t.id)}">
          <div class="ad-item-main">
            <span class="ad-item-title">${esc(tableLabel(t))}</span>
            ${type ? `<span class="ad-tag">${esc(type)}</span>` : ''}
            <span class="ad-item-sub">${heads} / ${t.cap} 人${
              heads > t.cap ? `・超過 ${heads - t.cap} 位` : ''}</span>
          </div>
          <div class="ad-item-actions">
            <button class="ad-edit sp-move-btn" type="button" data-move-table="up" data-id="${esc(t.id)}"
                    ${i === 0 ? 'disabled' : ''} aria-label="往前移">↑</button>
            <button class="ad-edit sp-move-btn" type="button" data-move-table="down" data-id="${esc(t.id)}"
                    ${i === tables.length - 1 ? 'disabled' : ''} aria-label="往後移">↓</button>
            <button class="ad-edit" type="button" data-edit-table="${esc(t.id)}">編輯</button>
            <button class="ad-del ad-del-inline" type="button" data-del-table="${esc(t.id)}">刪除</button>
            ${rowMenuBtn('spTable', t.id)}
          </div>
        </div>`;
    }).join('');
  }

  /* ============================================================
     畫面：工具列（標籤篩選、桌號下拉、同步狀態）
  ============================================================ */
  function renderTools() {
    const lib = tagLib();
    $('spTagFilterLine').hidden = !lib.length;
    $('spTagChips').innerHTML = lib.map((t) => `
      <button class="ad-chip${view.tags.has(t.id) ? ' is-on' : ''}" type="button"
              data-tag="${esc(t.id)}">${esc(t.name)}</button>`).join('');
    /* 標籤權重只有在「優先按照標籤分組」時才有作用，
       其他排序方式下擺著只會讓人不知道那顆按鈕是幹嘛的 */
    $('spTagOrderBtn').hidden = !lib.length || view.sort !== 'tag';
    $('spShowDeclined').checked = view.showDeclined;
  }

  function renderFilterToggle() {
    const n = (view.rsvp !== 'all' ? 1 : 0)
            + view.tags.size
            + (view.showDeclined ? 1 : 0);
    const btn = $('spFilterToggle');
    btn.textContent = n ? `篩選（${n}）` : '篩選';
    btn.classList.toggle('is-on', n > 0);
    /* 有套條件時不讓它被收起來藏著，不然會找不到為什麼名單少了人 */
    const open = filtersOpen || n > 0;
    $('spFilters').hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  }

  function renderSyncState() {
    const el = $('spSyncState');
    const note = $('spSyncNote');
    const btn = $('spSyncBtn');

    /* hint 只補徽章沒講的事（時間、還有沒存檔的異動）——
       徽章已經是「有修改還沒送出」了，hint 不用把同一件事再講一次句子版。 */
    let state = 'none';
    let text = '還沒送出';
    let hint = '還沒送到賓客的查座位頁';

    if (syncedAt && syncedAt >= savedAt) {
      state = 'ok';
      text = '已送出';
      hint = `最後送出：${fmtTime(syncedAt)}`;
    } else if (syncedAt) {
      state = 'stale';
      text = '有修改還沒送出';
      hint = `最後送出：${fmtTime(syncedAt)}`;
    }
    if (dirty) {
      hint += `（還有修改沒存檔）`;
    }

    el.dataset.state = state;
    el.textContent = text;
    note.textContent = hint;
    btn.textContent = syncedAt ? '再送一次' : '送到賓客的查座位頁';

    $('spSaveBtn').classList.toggle('is-dirty', dirty);
    $('spUndo').disabled = !undoStack.length;
    $('spRedo').disabled = !redoStack.length;

    /* 手機底列與「⋮ 更多」裡的那一組是同一件事，狀態要一起同步 */
    $('spMbSave').classList.toggle('is-dirty', dirty);
    $('spMbUndo').disabled = !undoStack.length;
    $('spMbRedo').disabled = !redoStack.length;
    $('spMbSync').textContent = btn.textContent;
    $('spMoreSync').textContent = hint;
  }

  /* ============================================================
     手機的固定底列
     ------------------------------------------------------------
     .sp-bar 不是 sticky，所以手機上的流程是：捲到最上面看未安排 →
     往下捲找桌位 → 點卡片 → 移動 → 再捲回最上面按儲存。
     一場 30 桌的婚禮，這條路要走幾十遍。
     所以只把兩件事釘在畫面上：還剩幾位沒排、儲存。
  ============================================================ */
  const mobileBarMq = window.matchMedia('(max-width: 960px)');

  function syncMobileBar() {
    const bar = $('spMobileBar');
    if (!bar) return;
    const panel = document.querySelector('[data-panel="seatingPlan"]');
    const board = document.querySelector('[data-subpanel="board"]');
    const on = mobileBarMq.matches
      && !!panel && panel.classList.contains('is-on')
      && !!board && board.classList.contains('is-on');

    bar.hidden = !on;
    /* toast 與整頁的底部留白都要讓開這一條，不然會互相蓋住 */
    if (on) document.body.dataset.stickybar = '1';
    else delete document.body.dataset.stickybar;
  }

  function renderAll() {
    if (!started) return;
    syncMobileBar();
    renderTools();
    renderFilterToggle();
    renderStats();
    renderWarns();
    renderBoard();
    renderTableList();
    renderSyncState();
    if (!peekEl.hidden) closePeek();
    if (!$('spDrawer').hidden) fillDrawer($('spDrawerId').value);
  }

  /* ============================================================
     排桌動作
  ============================================================ */
  function assignGuest(guestId, tableId) {
    mutate(() => {
      if (tableId) plan.assign[guestId] = tableId;
      else delete plan.assign[guestId];
    });
  }

  /* 兩位賓客交換位子；其中一位在未安排區時，就是「換過去、把他換下來」 */
  function swapGuests(aId, bId) {
    if (aId === bId) return;
    mutate(() => {
      const at = plan.assign[aId] || '';
      const bt = plan.assign[bId] || '';
      if (at === bt) return;
      if (bt) plan.assign[aId] = bt; else delete plan.assign[aId];
      if (at) plan.assign[bId] = at; else delete plan.assign[bId];
    });
  }

  /* ============================================================
     拖曳
     ------------------------------------------------------------
     ・賓客卡 → 桌位／未安排區：安排、換桌、退回未安排
     ・賓客卡 → 賓客卡：兩位交換
     ・桌位標題 → 桌位標題：調整桌位順序
     手機沒有 HTML5 拖曳，所以每張卡片都留一顆「移動到桌位」（見 openMove）。
  ============================================================ */
  let dragGuest = '';
  let dragTable = '';

  function clearDropMarks() {
    document.querySelectorAll('.sp-table.is-drop, .sp-pool.is-drop, .sp-card.is-drop')
      .forEach((el) => {
        el.classList.remove('is-drop');
        el.removeAttribute('data-hint');
      });
  }

  function bindDnd() {
    const board = document.querySelector('[data-panel="seatingPlan"]');

    board.addEventListener('dragstart', (e) => {
      const head = e.target.closest('[data-table-head]');
      const card = e.target.closest('.sp-card');
      if (head) {
        dragTable = head.dataset.tableHead;
        dragGuest = '';
      } else if (card) {
        dragGuest = card.dataset.guest;
        dragTable = '';
        card.classList.add('is-dragging');
      } else return;
      closePeek();
      e.dataTransfer.effectAllowed = 'move';
      /* Firefox 需要真的設一份資料，拖曳才會開始 */
      try { e.dataTransfer.setData('text/plain', dragGuest || dragTable); } catch {}
    });

    board.addEventListener('dragend', () => {
      document.querySelectorAll('.sp-card.is-dragging')
        .forEach((el) => el.classList.remove('is-dragging'));
      clearDropMarks();
      dragGuest = '';
      dragTable = '';
    });

    board.addEventListener('dragover', (e) => {
      if (!dragGuest && !dragTable) return;
      const zone = dropZone(e.target);
      if (!zone) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      markZone(zone);
    });

    board.addEventListener('dragleave', (e) => {
      const zone = dropZone(e.target);
      if (zone && !zone.el.contains(e.relatedTarget)) {
        zone.el.classList.remove('is-drop');
        zone.el.removeAttribute('data-hint');
      }
    });

    board.addEventListener('drop', (e) => {
      const zone = dropZone(e.target);
      if (!zone) return;
      e.preventDefault();
      clearDropMarks();

      if (dragTable) {
        if (zone.kind === 'table' && zone.tableId !== dragTable) reorderTable(dragTable, zone.tableId);
        dragTable = '';
        return;
      }
      if (!dragGuest) return;

      if (zone.kind === 'card') swapGuests(dragGuest, zone.guestId);
      else if (zone.kind === 'pool') assignGuest(dragGuest, '');
      else if (zone.kind === 'table') assignGuest(dragGuest, zone.tableId);
      dragGuest = '';
    });
  }

  /* 滑鼠現在停在哪一種放置目標上 */
  function dropZone(target) {
    if (!target || !target.closest) return null;

    if (dragTable) {
      const t = target.closest('.sp-table');
      return t ? { kind:'table', el:t, tableId: t.dataset.table } : null;
    }

    const card = target.closest('.sp-card');
    if (card && card.dataset.guest !== dragGuest) {
      return { kind:'card', el:card, guestId: card.dataset.guest };
    }
    const pool = target.closest('.sp-pool');
    if (pool) return { kind:'pool', el:pool };
    const table = target.closest('.sp-table');
    if (table) return { kind:'table', el:table, tableId: table.dataset.table };
    return null;
  }

  /* 放置提示：要放進第幾桌、放進去會不會超過容量 */
  function markZone(zone) {
    clearDropMarks();
    zone.el.classList.add('is-drop');

    if (zone.kind === 'pool') {
      zone.el.dataset.hint = '移回未安排';
      return;
    }
    if (zone.kind === 'card') {
      const g = guestById(zone.guestId);
      zone.el.dataset.hint = g ? `與 ${g.name} 交換` : '交換位子';
      return;
    }
    const t = tableById(zone.tableId);
    if (!t) return;
    if (dragTable) {
      zone.el.dataset.hint = `移到第 ${no2(t.no)} 桌前面`;
      return;
    }
    const g = guestById(dragGuest);
    const guests = allGuests();
    const heads = seatedOf(t.id, guests).heads;
    const already = plan.assign[dragGuest] === t.id;
    const after = already ? heads : heads + (g ? g.count : 0);
    zone.el.dataset.hint = after > t.cap
      ? `⚠️ 此桌將超過容量（${after} / ${t.cap}）`
      : `放入第 ${no2(t.no)} 桌`;
  }

  /* 把 fromId 這一桌插到 toId 前面，其餘依序重編 order */
  function reorderTable(fromId, toId) {
    mutate(() => {
      const list = sortedTables();
      const from = list.findIndex((t) => t.id === fromId);
      const to = list.findIndex((t) => t.id === toId);
      if (from < 0 || to < 0) return;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      list.forEach((t, i) => { tableById(t.id).order = i + 1; });
    });
  }

  /* ============================================================
     「移動到桌位」（手機的替代方案，桌機也用得到）
  ============================================================ */
  const moveMask = $('spMoveMask');
  let moveGuestId = '';

  function openMove(guestId) {
    const g = guestById(guestId);
    if (!g) return;
    if (!plan.tables.length) { toast('還沒有任何桌位，先到「桌位管理」新增', true); return; }

    moveGuestId = guestId;
    $('spMoveWho').textContent = `${g.name}・${g.count} 人`;
    const guests = allGuests();
    $('spMoveList').innerHTML = sortedTables().map((t) => {
      const heads = seatedOf(t.id, guests).heads;
      const after = plan.assign[guestId] === t.id ? heads : heads + g.count;
      const warn = after > t.cap ? `<span class="sp-move-warn">⚠️ 將超過容量</span>` : '';
      return `
        <button class="sp-move-item${plan.assign[guestId] === t.id ? ' is-on' : ''}"
                type="button" data-to="${esc(t.id)}">
          <span class="sp-move-name">${esc(tableLabel(t))}</span>
          <span class="sp-move-cap">${heads} / ${t.cap} 人</span>${warn}
        </button>`;
    }).join('')
      + `<button class="sp-move-item is-clear" type="button" data-to="">移出桌位（放回未安排）</button>`;
    moveMask.hidden = false;
  }

  /* ============================================================
     桌位的新增 / 編輯 / 刪除
  ============================================================ */
  const tableMask = $('spTableModalMask');

  function fillTypeSelect() {
    $('spTableType').innerHTML = TABLE_TYPES
      .map(([k, label]) => `<option value="${k}">${label}</option>`).join('');
  }

  function openTableModal(id) {
    const t = id ? tableById(id) : null;
    $('spTableModalTitle').textContent = t ? `編輯第 ${no2(t.no)} 桌` : '新增桌位';
    $('spTableId').value = t ? t.id : '';
    $('spTableNo').value = t ? t.no : nextTableNo();
    $('spTableName').value = t ? t.name : '';
    $('spTableCap').value = t ? t.cap : DEFAULT_CAP;
    $('spTableType').value = t ? t.type : 'relative';
    $('spTableTypeCustom').value = t ? t.typeName : '';
    syncTypeCustom();
    $('spTableDeleteBtn').hidden = !t;
    tableMask.hidden = false;
  }

  function syncTypeCustom() {
    $('spTableTypeCustomBox').hidden = $('spTableType').value !== 'custom';
  }

  function submitTable(e) {
    e.preventDefault();
    const id = $('spTableId').value;
    const no = clampInt($('spTableNo').value, 1, 99, 1);
    const name = $('spTableName').value.trim().slice(0, 20);
    const cap = clampInt($('spTableCap').value, 1, 30, DEFAULT_CAP);
    const type = $('spTableType').value;
    const custom = $('spTableTypeCustom').value.trim().slice(0, 10);

    if (plan.tables.some((t) => t.no === no && t.id !== id)) {
      toast(`第 ${no2(no)} 桌已經存在，換一個桌號`, true);
      return;
    }
    if (!id && plan.tables.length >= MAX_TABLES) {
      toast(`最多 ${MAX_TABLES} 桌`, true);
      return;
    }

    mutate(() => {
      if (id) {
        const t = tableById(id);
        Object.assign(t, { no, name, cap, type, typeName: custom });
      } else {
        plan.tables.push({
          id: newId('tb'), no, name, cap, type, typeName: custom,
          order: plan.tables.length + 1,
        });
      }
    });
    tableMask.hidden = true;
    toast(id ? '桌位已更新' : '桌位已新增');
  }

  async function deleteTable(id) {
    const t = tableById(id);
    if (!t) return;
    const n = seatedOf(id).rows.length;
    const ok = await confirmModal({
      title: `刪除第 ${no2(t.no)} 桌`,
      message: n
        ? `這一桌目前有 ${n} 位賓客，刪掉之後他們會回到「未安排」。`
        : '這一桌目前是空的。刪掉之後可以按「復原」救回來。',
      danger: true,
      confirmText: '刪除',
    });
    if (!ok) return;
    mutate(() => {
      plan.tables = plan.tables.filter((x) => x.id !== id);
      Object.keys(plan.assign).forEach((g) => {
        if (plan.assign[g] === id) delete plan.assign[g];
      });
      sortedTables().forEach((x, i) => { tableById(x.id).order = i + 1; });
    });
    toast('桌位已刪除，可以按「復原」救回來');
  }

  /* 要開幾桌？系統已經知道總人數了，就別讓新人自己算。
     用「需要安排的人數 ÷ 每桌容量」無條件進位，扣掉已經開好的桌數。 */
  function suggestTables() {
    const heads = allGuests()
      .filter((g) => g.rsvp !== 'no')
      .reduce((n, g) => n + g.count, 0);
    const need = Math.ceil(heads / DEFAULT_CAP);
    return { heads, need, more: Math.max(1, need - plan.tables.length) };
  }

  async function batchAddTables() {
    const { heads, need, more } = suggestTables();
    const hint = heads
      ? `目前 ${heads} 人，${DEFAULT_CAP} 人桌大約需要 ${need} 桌${
          plan.tables.length ? `（已經開了 ${plan.tables.length} 桌）` : ''}。`
      : '';

    const raw = await promptModal({
      title: '一次加好幾桌',
      message: `${hint}會從第 ${no2(nextTableNo())} 桌接著編號，容量預設 ${DEFAULT_CAP} 人，之後都可以改。`,
      placeholder: '例如 12',
      maxLength: 3,
      value: String(more),
      confirmText: '新增',
    });
    if (!raw) return;
    const n = clampInt(raw, 1, MAX_TABLES, 0);
    if (!n) { toast('請輸入 1 到 60 之間的數字', true); return; }
    const room = MAX_TABLES - plan.tables.length;
    if (room <= 0) { toast(`最多 ${MAX_TABLES} 桌`, true); return; }
    const add = Math.min(n, room);

    mutate(() => {
      for (let i = 0; i < add; i++) {
        plan.tables.push({
          id: newId('tb'), no: nextTableNo(), name: '', cap: DEFAULT_CAP,
          type: 'relative', typeName: '', order: plan.tables.length + 1,
        });
      }
    });
    toast(add < n ? `已新增 ${add} 桌（達到上限 ${MAX_TABLES} 桌）` : `已新增 ${add} 桌`);
  }

  function moveTable(id, dir) {
    const list = sortedTables();
    const i = list.findIndex((t) => t.id === id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return;
    reorderTable(id, list[j].id);
  }

  /* ============================================================
     賓客詳細資料抽屜
  ============================================================ */
  const drawer = $('spDrawer');
  const drawerMask = $('spDrawerMask');

  function openDrawer(guestId) {
    if (!fillDrawer(guestId)) return;
    drawer.hidden = false;
    drawerMask.hidden = false;
    $('spDrawerCode').focus();
  }

  function closeDrawer() {
    drawer.hidden = true;
    drawerMask.hidden = true;
  }

  function fillDrawer(guestId) {
    const g = guestById(guestId);
    if (!g) { closeDrawer(); return false; }
    const t = tableById(g.tableId);

    $('spDrawerId').value = g.id;
    $('spDrawerName').textContent = g.name;
    $('spDrawerWhere').textContent = t
      ? `目前在 ${tableLabel(t)}`
      : '目前未安排桌位';

    $('spDrawerCode').value = g.code;
    const nameInput = $('spDrawerNameInput');
    nameInput.value = g.name;
    nameInput.disabled = g.src === 'rsvp';
    $('spDrawerNameLock').hidden = g.src !== 'rsvp';
    $('spDrawerCat').value = g.cat;
    $('spDrawerRsvp').value = g.rsvp;
    $('spDrawerOverride').hidden = g.src !== 'rsvp';
    $('spDrawerCount').value = g.count;
    $('spDrawerNote').value = g.note;
    $('spDrawerSeats').value = g.seats;
    $('spDrawerGift').value = g.gift;
    $('spDrawerGot').checked = g.got;
    $('spDrawerDelete').hidden = g.src !== 'manual';

    const lib = tagLib();
    $('spDrawerTagsOff').hidden = !!lib.length;
    /* 兩種標籤後台改不動，畫成關不掉的勾勾：
       ・賓客自己在表單上選的那一個（那是他送出的紀錄）
       ・從回覆推出來的（葷素分配填了素食） */
    const r = g.src === 'rsvp' ? DataStore.getRSVPs().find((x) => x.id === g.id) : null;
    const own = r ? String(r.tag || '') : '';
    const veg = r && Number(r.mealVeg) > 0 ? vegTagId() : '';
    const kid = r && Number(r.childSeat) > 0 ? kidTagId() : '';
    $('spDrawerTags').innerHTML = lib.map((tg) => {
      const why = tg.id === own ? '賓客自己選的'
        : (tg.id === veg ? '出席回覆填了素食'
          : (tg.id === kid ? '出席回覆要了兒童座椅' : ''));
      return `
      <label class="ad-check sp-drawer-tag${why ? ' is-fixed' : ''}">
        <input type="checkbox" value="${esc(tg.id)}"${g.tagIds.includes(tg.id) ? ' checked' : ''}${
          why ? ' disabled' : ''}>
        <span>${esc(tg.name)}${why ? `<small>${why}</small>` : ''}</span>
      </label>`;
    }).join('');

    $('spDrawerTable').innerHTML = `<option value="">（未安排）</option>`
      + sortedTables().map((x) =>
        `<option value="${esc(x.id)}"${x.id === g.tableId ? ' selected' : ''}>${esc(tableLabel(x))}</option>`).join('');
    return true;
  }

  async function submitDrawer(e) {
    e.preventDefault();
    const id = $('spDrawerId').value;
    const g = guestById(id);
    if (!g) return;

    const tagIds = [...$('spDrawerTags').querySelectorAll('input:checked:not(:disabled)')]
      .map((el) => el.value);
    const patch = {
      code: $('spDrawerCode').value.trim().slice(0, 12),
      cat:  $('spDrawerCat').value.trim().slice(0, 20),
      rsvp: $('spDrawerRsvp').value,
      count: clampInt($('spDrawerCount').value, 0, 30, 0),
      note: $('spDrawerNote').value.trim().slice(0, 200),
      seats: clampInt($('spDrawerSeats').value, 0, 10, 0),
      gift: clampInt($('spDrawerGift').value, 0, 99, 0),
      got: $('spDrawerGot').checked,
    };
    if (g.src === 'manual') {
      patch.name = $('spDrawerNameInput').value.trim().slice(0, 40);
      patch.tags = tagIds;
      if (!patch.name) { toast('姓名不能是空的', true); return; }
    }

    const table = $('spDrawerTable').value;

    mutate(() => {
      const m = plan.meta[id] || { id, src: g.src };
      Object.assign(m, patch);
      plan.meta[id] = m;
      if (table) plan.assign[id] = table; else delete plan.assign[id];
    });

    /* 回覆來的賓客，標籤仍然寫回既有的 rsvpTags —— 排桌不另外做一套分類。
       賓客自己在表單上選的那一個改不動，這裡只送新人掛的部分。 */
    if (g.src === 'rsvp' && tagsOn()) {
      /* 這一步是真的會寫進資料庫的（標籤存在 rsvpTags），
         弱網時可能等好幾秒，所以按鈕要有狀態 */
      setBusy(['spDrawerSave'], true, '儲存中…');
      try {
        await DataStore.saveRsvpTags(id, tagIds);
      } catch (err) {
        writeFailed(err, () => DataStore.saveRsvpTags(id, tagIds).catch(writeFailed));
      } finally {
        setBusy(['spDrawerSave'], false);
      }
    }

    toast('賓客資料已更新（記得按「儲存排桌」）');
    renderAll();
  }

  /* 沒填出席回覆的長輩、臨時加的親友：直接在這裡補一位。
     存成 src='manual'，和賓客送出的回覆分開，回覆那一份不會被動到。 */
  async function addManualGuest() {
    const used = Object.values(plan.meta).filter((m) => !metaIsEmpty(m)).length;
    if (used >= MAX_GUESTS) { toast(`排桌名單最多 ${MAX_GUESTS} 位`, true); return; }

    const name = await promptModal({
      title: '新增賓客',
      message: '用在沒有填出席回覆的賓客（長輩、臨時加的親友）。'
             + '加完可以在右邊的詳細資料裡補人數與標籤。',
      placeholder: '賓客姓名',
      maxLength: 40,
      confirmText: '新增',
    });
    if (!name) return;

    const id = newId('g');
    mutate(() => {
      plan.meta[id] = {
        id, src:'manual', name: name.slice(0, 40), code:'', cat:'',
        count: 1, tags: [], rsvp:'yes', note:'',
      };
    });
    openDrawer(id);
  }

  async function deleteManualGuest(id) {
    const g = guestById(id);
    if (!g || g.src !== 'manual') return;
    const ok = await confirmModal({
      title: `刪除「${g.name}」`,
      message: '這位賓客是手動加上去的（不是出席回覆），刪掉之後可以按「復原」救回來。',
      danger: true,
      confirmText: '刪除',
    });
    if (!ok) return;
    mutate(() => {
      delete plan.meta[id];
      delete plan.assign[id];
    });
    closeDrawer();
    toast('已刪除這位賓客');
  }

  /* ============================================================
     標籤權重（決定多標籤的賓客歸到哪一組）
  ============================================================ */
  function renderTagOrder() {
    const order = groupOrder();
    $('spTagOrderList').innerHTML = order.map((t, i) => `
      <div class="sp-tagorder-row">
        <span class="sp-tagorder-no">${i + 1}</span>
        <span class="sp-tagorder-name">${esc(t.name)}</span>
        <button class="ad-edit" type="button" data-order="up" data-id="${esc(t.id)}"
                ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="ad-edit" type="button" data-order="down" data-id="${esc(t.id)}"
                ${i === order.length - 1 ? 'disabled' : ''}>↓</button>
      </div>`).join('')
      + `<div class="sp-tagorder-row is-rest"><span class="sp-tagorder-no">—</span>
           <span class="sp-tagorder-name">其他（沒有以上任何標籤的賓客）</span></div>`;
  }

  function moveTagOrder(id, dir) {
    const order = groupOrder().map((t) => t.id);
    const i = order.indexOf(id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= order.length) return;
    order.splice(j, 0, order.splice(i, 1)[0]);
    view.tagOrder = order;
    LS.set('seatPlan.tagOrder', order);
    renderTagOrder();
    renderBoard();
  }

  /* ============================================================
     匯出
  ============================================================ */
  function exportRows() {
    const guests = allGuests();
    return sortGuests(guests).map((g) => {
      const t = tableById(g.tableId);
      return [
        g.cat || '',
        g.code || '',
        t ? no2(t.no) : '',
        t ? (t.name || '') : '',
        g.name,
        g.count,
        RSVP_TEXT[g.rsvp],
        g.tagNames.join('／'),
        g.note || '',
      ];
    });
  }

  const EXPORT_HEAD = ['類別', '編號', '桌號', '桌名', '賓客姓名', '人數', 'RSVP', 'Tags', '備註'];

  /* 桌位排桌表：依桌位分組，每桌最後補一列總人數 */
  function exportTableRows() {
    const guests = allGuests();
    const rows = [];
    sortedTables().forEach((t) => {
      const { rows: list, heads } = seatedOf(t.id, guests);
      rows.push([tableLabel(t), '', '']);
      rows.push(['姓名', '人數', '備註']);
      sortGuests(list).forEach((g) => rows.push([g.name, g.count, g.note || '']));
      rows.push(['總人數', heads, `容量 ${t.cap} 人`]);
      rows.push(['', '', '']);
    });
    const rest = guests.filter((g) => !g.tableId);
    if (rest.length) {
      rows.push(['未安排', '', '']);
      rows.push(['姓名', '人數', '備註']);
      sortGuests(rest).forEach((g) => rows.push([g.name, g.count, g.note || '']));
      rows.push(['總人數', rest.reduce((n, g) => n + g.count, 0), '']);
    }
    return rows;
  }

  function exportXlsx() {
    if (!window.XLSXLite) { toast('這個瀏覽器不支援匯出 Excel，請改用 CSV', true); return; }
    const blob = window.XLSXLite.write([
      { name: '賓客明細', rows: [EXPORT_HEAD, ...exportRows()] },
      { name: '桌位排桌表', rows: exportTableRows() },
    ]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    /* 檔名維持純英數，和 downloadCsv() 同一套 ——
       中文檔名在部分瀏覽器／下載器會被換成 "download" */
    a.download = `seating-plan-${window.SITE.slug}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    toast('已匯出 Excel');
  }

  /* ============================================================
     從出席表單匯入
     ------------------------------------------------------------
     排桌名單的第一個來源就是出席回覆：allGuests() 直接讀 rsvps，
     所以「匯入」在這裡不是把資料複製一份，而是把回覆接進來 ——
     新的回覆一進來，名單自己就會多一位，不會有兩份各自過期的名單。

     這顆按鈕做三件事：
       1. 講清楚現在接進來的是誰（幾筆、幾人、幾位還沒排）
       2. 抓最新的一次回覆（畫面重畫，順便把推導出來的標籤重算）
       3. 找出「和回覆同名的手動賓客」—— 先從 Excel 匯入、之後那個人
          又自己填了表單，就會一個人佔兩張卡，這裡可以一鍵清掉
  ============================================================ */
  const rsvpImportMask = $('spRsvpImportMask');

  /* 目前的出席回覆 vs 排桌名單 */
  function rsvpImportStat() {
    const guests = allGuests();
    const rsvps = guests.filter((g) => g.src === 'rsvp');
    const byName = new Map();
    rsvps.forEach((g) => { if (g.name) byName.set(normKey(g.name), g); });

    return {
      rsvps,
      heads: rsvps.reduce((n, g) => n + (Number(g.count) || 0), 0),
      yes: rsvps.filter((g) => g.rsvp === 'yes').length,
      maybe: rsvps.filter((g) => g.rsvp === 'maybe').length,
      no: rsvps.filter((g) => g.rsvp === 'no').length,
      unseated: rsvps.filter((g) => !g.tableId && g.rsvp !== 'no').length,
      /* 同名的手動賓客：多半是先匯了 Excel，那個人後來又自己填了表單 */
      dupes: guests.filter((g) => g.src === 'manual' && byName.has(normKey(g.name))),
    };
  }

  function openRsvpImport() {
    renderRsvpImport();
    rsvpImportMask.hidden = false;
  }

  function renderRsvpImport() {
    const st = rsvpImportStat();
    const body = $('spRsvpImportBody');
    $('spRsvpImportDedupe').hidden = !st.dupes.length;
    $('spRsvpImportGo').hidden = !st.rsvps.length;

    if (!st.rsvps.length) {
      body.innerHTML = `
        <p class="ad-modal-note">目前還沒有收到任何出席回覆。</p>
        <div class="ad-hint">
          賓客在<b>邀請函</b>那一頁送出出席回覆之後，這裡就會有人。
          等不及的話，先用「匯入 Excel／CSV」或「＋ 新增賓客」把手上的名單放進來。
        </div>`;
      return;
    }

    const preview = st.rsvps.slice(0, 12);
    body.innerHTML = `
      <p class="ad-modal-note">
        已經帶進排桌名單的出席回覆共 <b>${st.rsvps.length}</b> 筆、<b>${st.heads}</b> 人
        （已確認 ${st.yes}・待確認 ${st.maybe}・無法出席 ${st.no}）。
        ${st.unseated ? `其中 <b>${st.unseated}</b> 筆還沒排到桌位。` : '全部都排好位子了。'}
      </p>
      <div class="ad-hint">
        出席回覆是<b>即時接進來</b>的，不需要每次重按 ——
        賓客一送出，左邊的「未安排」就會多一位。
        人數、葷素、兒童座椅、賓客自己選的標籤都跟著回覆走；
        要改成別的數字，點開那位賓客的抽屜覆寫就好，<b>回覆本身不會被動到</b>。
      </div>
      ${st.dupes.length ? `<div class="sp-bad"><div class="sp-bad-row">
        有 <b>${st.dupes.length}</b> 位手動賓客和出席回覆同名
        （${esc(st.dupes.slice(0, 6).map((g) => g.name).join('、'))}${st.dupes.length > 6 ? '…' : ''}），
        可能是先匯過 Excel、那個人後來又自己填了表單，同一個人會佔兩張卡。
      </div></div>` : ''}
      <div class="sp-table-scroll"><table class="sp-preview">
        <thead><tr><th>編號</th><th>姓名</th><th>人數</th><th>RSVP</th><th>標籤</th><th>桌位</th></tr></thead>
        <tbody>${preview.map((g) => {
          const t = tableById(g.tableId);
          return `<tr>
            <td>${esc(g.code)}</td><td>${esc(g.name)}</td><td>${g.count}</td>
            <td>${esc(RSVP_TEXT[g.rsvp] || '')}</td>
            <td>${esc(g.tagNames.join('／'))}</td>
            <td>${esc(t ? tableLabel(t) : '未安排')}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
      ${st.rsvps.length > preview.length
        ? `<div class="ad-hint">只列出前 ${preview.length} 筆，其餘都在排桌工作區裡。</div>` : ''}`;
  }

  /* 清掉和出席回覆同名的手動賓客。走 mutate() 所以可以「復原」救回來 */
  async function dedupeManualGuests() {
    const dupes = rsvpImportStat().dupes;
    if (!dupes.length) { toast('沒有重複的手動賓客'); return; }

    const ok = await confirmModal({
      title: '清掉重複的手動賓客',
      message: `會移除 ${dupes.length} 位和出席回覆同名的手動賓客`
             + `（${dupes.slice(0, 6).map((g) => g.name).join('、')}${dupes.length > 6 ? '…' : ''}），`
             + '出席回覆那一份會留著。按下去之後仍然可以用「復原」還原。',
      danger: true,
      confirmText: '清掉',
    });
    if (!ok) return;

    mutate(() => {
      dupes.forEach((g) => {
        delete plan.meta[g.id];
        delete plan.assign[g.id];
      });
    });
    renderRsvpImport();
    toast(`已清掉 ${dupes.length} 位重複的手動賓客，記得按「儲存排桌」`);
  }

  /* ============================================================
     匯入（五步）
     ------------------------------------------------------------
     1 選檔案 → 2 預覽 → 3 欄位對應 → 4 檢查資料 → 5 確認匯入
     有問題的那幾筆不匯進來，並且逐筆講清楚是第幾列、哪裡不對。
  ============================================================ */
  const importMask = $('spImportMask');

  /* 系統欄位 ← Excel 欄位。key 是系統這邊的名字 */
  const IMPORT_FIELDS = [
    { key:'name',  label:'姓名',   required:true,  guess:['姓名', '賓客姓名', '名字', 'name'] },
    { key:'code',  label:'編號',   required:false, guess:['編號', '代號', 'id', 'code'] },
    { key:'cat',   label:'類別',   required:false, guess:['類別', '分類', '關係', '群組'] },
    { key:'count', label:'人數',   required:false, guess:['人數', '數量', '出席人數', 'count'] },
    { key:'table', label:'桌位',   required:false, guess:['桌號', '桌次', '桌位', 'table'] },
    { key:'tags',  label:'Tags',   required:false, guess:['標籤', 'tags', 'tag'] },
    { key:'rsvp',  label:'RSVP',   required:false, guess:['rsvp', '出席', '是否出席'] },
    { key:'note',  label:'備註',   required:false, guess:['備註', '註記', 'note', '說明'] },
  ];

  const imp = {
    step: 1,
    rows: [],        /* 整份表格（含表頭） */
    sheetName: '',
    map: {},         /* 系統欄位 → 欄位索引（-1 代表不匯入） */
    result: null,    /* { ok:[], bad:[] } */
  };

  function openImport() {
    imp.step = 1;
    imp.rows = [];
    imp.map = {};
    imp.result = null;
    importMask.hidden = false;
    renderImport();
  }

  function renderImport() {
    document.querySelectorAll('#spSteps li').forEach((li) => {
      const n = Number(li.dataset.step);
      li.classList.toggle('is-on', n === imp.step);
      li.classList.toggle('is-done', n < imp.step);
    });
    $('spImportBack').hidden = imp.step === 1;
    $('spImportNext').textContent = imp.step === 5 ? '確認匯入' : '下一步';
    $('spImportNext').hidden = false;

    const body = $('spStepBody');
    if (imp.step === 1) {
      body.innerHTML = `
        <label class="ad-upload" id="spImportDrop">
          <input type="file" id="spImportFile" accept=".xlsx,.csv,text/csv" hidden>
          <span class="ad-upload-mark">＋</span>
          <span class="ad-upload-text">點這裡選擇 Excel／CSV，或把檔案拖進來</span>
          <span class="ad-upload-hint">.xlsx 讀第一張工作表・.csv 需為逗號分隔</span>
        </label>
        <div class="ad-hint" id="spImportFileName"></div>`;
      $('spImportNext').hidden = true;
      return;
    }

    if (imp.step === 2) {
      const head = imp.rows[0] || [];
      const preview = imp.rows.slice(1, 11);
      body.innerHTML = `
        <p class="ad-modal-note">
          讀到 <b>${imp.rows.length - 1}</b> 列資料${imp.sheetName ? `（工作表：${esc(imp.sheetName)}）` : ''}。
          下面是前 ${preview.length} 列，確認一下第一列是不是欄位名稱。
        </p>
        <div class="sp-table-scroll"><table class="sp-preview">
          <thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${preview.map((r) => `<tr>${head.map((_, i) =>
            `<td>${esc(r[i] || '')}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>`;
      return;
    }

    if (imp.step === 3) {
      const head = imp.rows[0] || [];
      body.innerHTML = `
        <p class="ad-modal-note">
          左邊是系統的欄位，右邊挑出 Excel 裡對應的那一欄。
          <b>姓名一定要對到</b>，其餘沒有就留「不匯入」。
        </p>
        ${IMPORT_FIELDS.map((f) => `
          <div class="sp-map-row">
            <span class="sp-map-name">${esc(f.label)}${f.required ? ' *' : ''}</span>
            <select class="ad-input" data-map="${f.key}">
              <option value="-1">（不匯入）</option>
              ${head.map((h, i) =>
                `<option value="${i}"${imp.map[f.key] === i ? ' selected' : ''}>${esc(h || `第 ${i + 1} 欄`)}</option>`).join('')}
            </select>
          </div>`).join('')}`;
      return;
    }

    if (imp.step === 4) {
      const { ok, bad } = imp.result;
      body.innerHTML = `
        <p class="ad-modal-note">
          可以匯入 <b>${ok.length}</b> 筆${bad.length ? `，<b>${bad.length}</b> 筆有問題（不會被匯入）` : ''}。
        </p>
        ${bad.length ? `<div class="sp-bad">${bad.map((b) =>
          `<div class="sp-bad-row">第 ${b.line} 筆資料：${esc(b.why)}</div>`).join('')}</div>` : ''}
        ${ok.length ? `<div class="sp-table-scroll"><table class="sp-preview">
          <thead><tr><th>編號</th><th>姓名</th><th>人數</th><th>類別</th><th>桌位</th><th>Tags</th></tr></thead>
          <tbody>${ok.slice(0, 12).map((g) => `<tr>
            <td>${esc(g.code)}</td><td>${esc(g.name)}</td><td>${g.count}</td>
            <td>${esc(g.cat)}</td><td>${esc(g.tableText || '')}</td>
            <td>${esc((g.tagNames || []).join('／'))}</td></tr>`).join('')}</tbody>
        </table></div>` : ''}`;
      return;
    }

    const { ok } = imp.result;
    const withTable = ok.filter((g) => g.tableId).length;
    body.innerHTML = `
      <p class="ad-modal-note">
        即將新增 <b>${ok.length}</b> 位賓客${withTable ? `，其中 ${withTable} 位會直接排進對應的桌位` : ''}。
        匯入是「加上去」，原本的名單不會被清掉；按下去之後仍然可以用「復原」還原。
      </p>
      <div class="ad-hint">
        匯進來的是<b>手動賓客</b>，和出席回覆分開存 ——
        回覆是賓客送出的紀錄，不會被匯入的資料覆蓋。
      </div>`;
  }

  /* CSV：逗號分隔，支援雙引號包住的欄位與欄位內換行 */
  function parseCsv(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    const src = text.replace(/^﻿/, '');
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (quoted) {
        if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(cell.trim()); cell = ''; }
      else if (c === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
    return rows.filter((r) => r.some((v) => v !== ''));
  }

  async function readImportFile(file) {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.csv')) {
      imp.rows = parseCsv(await file.text());
      imp.sheetName = '';
    } else {
      if (!window.XLSXLite) throw new Error('這個瀏覽器不支援讀取 Excel，請改用 CSV');
      const sheets = await window.XLSXLite.read(file);
      const sheet = sheets.find((s) => s.rows.length) || sheets[0];
      if (!sheet) throw new Error('這個檔案裡沒有資料');
      imp.rows = sheet.rows.filter((r) => r.some((v) => String(v || '').trim() !== ''));
      imp.sheetName = sheet.name;
    }
    if (imp.rows.length < 2) throw new Error('至少要有一列欄位名稱和一列資料');

    /* 先猜一次欄位對應，多數檔案不用手動調 */
    const head = imp.rows[0].map((h) => normKey(h));
    imp.map = {};
    IMPORT_FIELDS.forEach((f) => {
      const i = head.findIndex((h) => h && f.guess.some((g) => h.includes(normKey(g))));
      imp.map[f.key] = i;
    });
  }

  /* 檢查每一列，回傳可以匯入的與有問題的 */
  function validateImport() {
    const get = (row, key) => {
      const i = imp.map[key];
      return i >= 0 ? String(row[i] == null ? '' : row[i]).trim() : '';
    };

    const lib = tagLib();
    const tagByName = new Map(lib.map((t) => [normKey(t.name), t]));
    const tableByNo = new Map(plan.tables.map((t) => [no2(t.no), t]));
    const tableByName = new Map(plan.tables.filter((t) => t.name).map((t) => [normKey(t.name), t]));

    const existing = new Set(allGuests().map((g) => normKey(g.code)).filter(Boolean));
    const existingNames = new Set(allGuests().map((g) => normKey(g.name)));
    const seenCode = new Set();
    const ok = [];
    const bad = [];

    imp.rows.slice(1).forEach((row, idx) => {
      const line = idx + 1;
      const name = get(row, 'name').slice(0, 40);
      if (!name) { bad.push({ line, why: '姓名是空的' }); return; }

      const rawCount = get(row, 'count');
      let count = 1;
      if (rawCount !== '') {
        const n = Number(rawCount);
        if (!Number.isFinite(n) || n < 0 || n > 30 || !Number.isInteger(n)) {
          bad.push({ line, why: `人數不是有效數字（讀到「${rawCount}」）` });
          return;
        }
        count = n;
      }

      const code = get(row, 'code').slice(0, 12);
      if (code) {
        const key = normKey(code);
        if (seenCode.has(key)) { bad.push({ line, why: `編號「${code}」在這個檔案裡重複了` }); return; }
        if (existing.has(key)) { bad.push({ line, why: `編號「${code}」已經有人用了` }); return; }
        seenCode.add(key);
      }
      if (existingNames.has(normKey(name))) {
        bad.push({ line, why: `名單裡已經有「${name}」，避免重複所以先跳過` });
        return;
      }

      const tableText = get(row, 'table');
      let tableId = '';
      if (tableText) {
        const t = tableByNo.get(no2(tableText.replace(/\D/g, '')))
          || tableByName.get(normKey(tableText));
        if (!t) { bad.push({ line, why: `找不到桌號「${tableText}」，請先在「桌位管理」建立` }); return; }
        tableId = t.id;
      }

      const tagText = get(row, 'tags');
      const tagIds = [];
      const tagNames = [];
      let tagErr = '';
      tagText.split(/[,、／/｜|]/).map((s) => s.trim()).filter(Boolean).forEach((n) => {
        const hit = tagByName.get(normKey(n));
        if (!hit) { tagErr = tagErr || n; return; }
        tagIds.push(hit.id);
        tagNames.push(hit.name);
      });
      if (tagErr) { bad.push({ line, why: `標籤「${tagErr}」不存在，請先在「賓客標籤」建立` }); return; }

      const rsvpText = normKey(get(row, 'rsvp'));
      let rsvp = 'yes';
      if (rsvpText) {
        if (/no|不|無法|缺席/.test(rsvpText)) rsvp = 'no';
        else if (/maybe|待|視情況|未定/.test(rsvpText)) rsvp = 'maybe';
      }

      ok.push({
        id: newId('g'), src: 'manual',
        name, code, cat: get(row, 'cat').slice(0, 20),
        count, tags: tagIds, tagNames, rsvp,
        note: get(row, 'note').slice(0, 200),
        tableId, tableText,
      });
    });

    /* 沒對到的欄位提醒一次就好，不必每一列都講 */
    const unknown = (imp.rows[0] || []).filter((h, i) =>
      h && !Object.values(imp.map).includes(i));
    if (unknown.length) {
      bad.push({ line: '—', why: `這幾欄沒有對應到系統欄位，已略過：${unknown.join('、')}` });
    }
    return { ok, bad };
  }

  function applyImport() {
    const rows = imp.result.ok;
    if (!rows.length) { toast('沒有可以匯入的資料', true); return; }
    const room = MAX_GUESTS - Object.values(plan.meta).filter((m) => !metaIsEmpty(m)).length;
    const add = rows.slice(0, Math.max(0, room));
    if (!add.length) { toast(`排桌名單最多 ${MAX_GUESTS} 位`, true); return; }

    mutate(() => {
      add.forEach((g) => {
        plan.meta[g.id] = {
          id: g.id, src: 'manual', name: g.name, code: g.code, cat: g.cat,
          count: g.count, tags: g.tags, rsvp: g.rsvp, note: g.note,
        };
        if (g.tableId) plan.assign[g.id] = g.tableId;
      });
    });
    importMask.hidden = true;
    toast(add.length < rows.length
      ? `已匯入 ${add.length} 位（達到 ${MAX_GUESTS} 位上限）`
      : `已匯入 ${add.length} 位，記得按「儲存排桌」`);
  }

  async function takeImportFile(file) {
    try {
      await readImportFile(file);
      $('spImportFileName').textContent = `已讀取：${file.name}`;
      imp.step = 2;
      renderImport();
    } catch (err) {
      toast((err && err.message) || '這個檔案讀不進來', true);
    }
  }

  async function nextImportStep() {
    if (imp.step === 2) { imp.step = 3; renderImport(); return; }
    if (imp.step === 3) {
      /* 欄位對應收下來再驗證 */
      $('spStepBody').querySelectorAll('[data-map]').forEach((sel) => {
        imp.map[sel.dataset.map] = Number(sel.value);
      });
      if (!(imp.map.name >= 0)) { toast('「姓名」一定要對到一個欄位', true); return; }
      imp.result = validateImport();
      imp.step = 4;
      renderImport();
      return;
    }
    if (imp.step === 4) {
      if (!imp.result.ok.length) { toast('沒有任何一筆可以匯入，請修正檔案後再試', true); return; }
      imp.step = 5;
      renderImport();
      return;
    }
    if (imp.step === 5) applyImport();
  }

  /* ============================================================
     事件
  ============================================================ */
  function bindEvents() {
    const panel = document.querySelector('[data-panel="seatingPlan"]');

    /* ---- 上方按鈕 ---- */
    $('spSaveBtn').addEventListener('click', saveThenAsk);
    $('spSyncBtn').addEventListener('click', () => syncToSeating());
    $('spUndo').addEventListener('click', undo);
    $('spRedo').addEventListener('click', redo);

    /* ---- 手機底列 ＋「⋮ 更多」---- */
    $('spMbSave').addEventListener('click', saveThenAsk);
    $('spMbPool').addEventListener('click', () => {
      const pool = $('spPool');
      if (pool) pool.scrollIntoView({ behavior:'smooth', block:'start' });
      $('spSearch').focus({ preventScroll:true });
    });
    $('spMbMore').addEventListener('click', () => { $('spMoreMask').hidden = false; });
    $('spMoreClose').addEventListener('click', () => { $('spMoreMask').hidden = true; });
    registerFormModal($('spMoreMask'));
    $('spMbUndo').addEventListener('click', undo);
    $('spMbRedo').addEventListener('click', redo);
    $('spMbSync').addEventListener('click', () => {
      $('spMoreMask').hidden = true;
      syncToSeating();
    });

    /* 轉向、切分頁都會改變「底列該不該出現」 */
    mobileBarMq.addEventListener('change', syncMobileBar);
    window.addEventListener('hashchange', () => setTimeout(syncMobileBar, 0));

    /* ---- 搜尋 / 篩選 / 排序 ---- */
    /* input ＋ search 兩個都接：type="search" 的原生清除鈕（✕）
       在 Safari 只發 search。少接一個，按了 ✕ 之後名單不會變回全部。 */
    ['input', 'search'].forEach((evt) => {
      $('spSearch').addEventListener(evt, (e) => {
        view.q = normKey(e.target.value);
        renderBoard();
      });
    });
    $('spSort').addEventListener('change', (e) => {
      view.sort = e.target.value;
      renderTools();
      renderBoard();
    });
    $('spShowDeclined').addEventListener('change', (e) => {
      view.showDeclined = e.target.checked;
      renderFilterToggle();
      renderBoard();
    });
    $('spFilterToggle').addEventListener('click', () => {
      filtersOpen = $('spFilters').hidden;
      renderFilterToggle();
    });

    $('spRsvpChips').addEventListener('click', (e) => {
      const chip = e.target.closest('.ad-chip');
      if (!chip) return;
      view.rsvp = chip.dataset.rsvp;
      $('spRsvpChips').querySelectorAll('.ad-chip').forEach((c) => c.classList.toggle('is-on', c === chip));
      renderFilterToggle();
      renderBoard();
    });
    /* 標籤是多選：VIP ＋ 素食 可以一起篩 */
    $('spTagChips').addEventListener('click', (e) => {
      const chip = e.target.closest('.ad-chip');
      if (!chip) return;
      const id = chip.dataset.tag;
      if (view.tags.has(id)) view.tags.delete(id); else view.tags.add(id);
      chip.classList.toggle('is-on');
      renderFilterToggle();
      renderBoard();
    });

    /* ---- 工作區：點卡片開抽屜、點「移動到桌位」開選單 ---- */
    panel.addEventListener('click', (e) => {
      const foldTable = e.target.closest('[data-fold-table]');
      if (foldTable) { toggleTableFold(foldTable.dataset.foldTable); return; }

      const editTable = e.target.closest('[data-edit-table]');
      if (editTable) { openTableModal(editTable.dataset.editTable); return; }

      const delTable = e.target.closest('[data-del-table]');
      if (delTable) { deleteTable(delTable.dataset.delTable); return; }

      const moveTableBtn = e.target.closest('[data-move-table]');
      if (moveTableBtn) { moveTable(moveTableBtn.dataset.id, moveTableBtn.dataset.moveTable); return; }

      const act = e.target.closest('[data-act]');
      if (act) {
        const what = act.dataset.act;
        if (what === 'add-table') openTableModal('');
        if (what === 'batch-table') batchAddTables();
        /* 標籤庫住在「出席回覆」那一頁，直接帶過去，不用自己找 */
        if (what === 'goto-tags') location.hash = 'rsvp/tags';
        if (what === 'goto-import') location.hash = 'seatingPlan/io';
        return;
      }

      /* 卡片右邊那顆「⇄」：觸控裝置的主要動線，不用先開 peek */
      const moveBtn = e.target.closest('[data-move-guest]');
      if (moveBtn) {
        closePeek();
        openMove(moveBtn.dataset.moveGuest);
        return;
      }

      const card = e.target.closest('.sp-card');
      if (!card) return;
      /* 有滑鼠的機器滑過去就看得到完整樣貌，點下去直接開詳細資料；
         觸控裝置沒有 hover，點一下先展開 peek（裡面才有「詳細資料」） */
      if (usingMouse()) openDrawer(card.dataset.guest);
      else if (card.dataset.guest === peekId) closePeek();
      else openPeek(card);
    });

    /* 鍵盤也走得完：卡片上按 Enter／空白鍵等於點開 */
    panel.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.sp-card');
      if (!card) return;
      e.preventDefault();
      openDrawer(card.dataset.guest);
    });

    /* ---- 桌位管理 ---- */
    $('spGuestAddBtn').addEventListener('click', addManualGuest);
    $('spTableAddBtn').addEventListener('click', () => openTableModal(''));
    /* 空狀態上的「新增桌位」指的是同一件事，走同一條路徑 */
    $('spTableList').addEventListener('click', (e) => {
      if (e.target.closest('#spTableEmptyAdd')) openTableModal('');
    });
    $('spTableBatchBtn').addEventListener('click', batchAddTables);
    $('spTableForm').addEventListener('submit', submitTable);
    $('spTableType').addEventListener('change', syncTypeCustom);
    $('spTableCancelBtn').addEventListener('click', () => { tableMask.hidden = true; });
    $('spTableDeleteBtn').addEventListener('click', () => {
      const id = $('spTableId').value;
      tableMask.hidden = true;
      deleteTable(id);
    });
    registerFormModal(tableMask);

    /* ---- 移動到桌位 ---- */
    $('spMoveList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-to]');
      if (!btn) return;
      assignGuest(moveGuestId, btn.dataset.to);
      moveMask.hidden = true;
    });
    $('spMoveCancel').addEventListener('click', () => { moveMask.hidden = true; });
    registerFormModal(moveMask);

    /* ---- 抽屜 ---- */
    $('spDrawerClose').addEventListener('click', closeDrawer);
    drawerMask.addEventListener('click', closeDrawer);
    $('spDrawerForm').addEventListener('submit', submitDrawer);
    $('spDrawerDelete').addEventListener('click', () => deleteManualGuest($('spDrawerId').value));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !drawer.hidden) closeDrawer();
    });

    /* ---- 標籤權重 ---- */
    $('spTagOrderBtn').addEventListener('click', () => {
      renderTagOrder();
      $('spTagOrderMask').hidden = false;
    });
    $('spTagOrderCancel').addEventListener('click', () => { $('spTagOrderMask').hidden = true; });
    $('spTagOrderList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-order]');
      if (btn) moveTagOrder(btn.dataset.id, btn.dataset.order);
    });
    registerFormModal($('spTagOrderMask'));

    /* ---- 匯入 / 匯出 ---- */
    $('spImportRsvpBtn').addEventListener('click', openRsvpImport);
    $('spRsvpImportClose').addEventListener('click', () => { rsvpImportMask.hidden = true; });
    $('spRsvpImportDedupe').addEventListener('click', dedupeManualGuests);
    $('spRsvpImportGo').addEventListener('click', () => {
      rsvpImportMask.hidden = true;
      location.hash = 'seatingPlan/board';
    });
    registerFormModal(rsvpImportMask);

    $('spImportBtn').addEventListener('click', openImport);
    $('spImportCancel').addEventListener('click', () => { importMask.hidden = true; });
    $('spImportBack').addEventListener('click', () => {
      imp.step = Math.max(1, imp.step - 1);
      renderImport();
    });
    $('spImportNext').addEventListener('click', nextImportStep);
    registerFormModal(importMask);

    /* 匯入第一步支援把檔案拖進來（這個彈窗在排桌工作區之外，不會和排桌的拖曳打架） */
    const stepBody = $('spStepBody');
    ['dragenter', 'dragover'].forEach((ev) => stepBody.addEventListener(ev, (e) => {
      if (imp.step !== 1) return;
      e.preventDefault();
      const box = $('spImportDrop');
      if (box) box.classList.add('is-over');
    }));
    ['dragleave', 'drop'].forEach((ev) => stepBody.addEventListener(ev, (e) => {
      const box = $('spImportDrop');
      if (box) box.classList.remove('is-over');
      if (ev === 'drop') e.preventDefault();
    }));
    stepBody.addEventListener('drop', async (e) => {
      if (imp.step !== 1) return;
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) await takeImportFile(file);
    });

    stepBody.addEventListener('change', async (e) => {
      if (e.target.id !== 'spImportFile') return;
      const file = e.target.files && e.target.files[0];
      if (file) await takeImportFile(file);
    });

    $('spExportXlsx').addEventListener('click', exportXlsx);
    $('spExportCsv').addEventListener('click', () => {
      downloadCsv('seating-guests', EXPORT_HEAD, exportRows());
      toast('已匯出賓客明細');
    });
    $('spExportCsvTable').addEventListener('click', () => {
      downloadCsv('seating-tables', ['桌位／姓名', '人數', '備註'], exportTableRows());
      toast('已匯出桌位排桌表');
    });

    /* 鍵盤快捷鍵：⌘／Ctrl + Z 復原、加 Shift（或 Ctrl+Y）重做。
       只在排桌分頁開著、而且游標不在輸入框裡的時候接手。 */
    document.addEventListener('keydown', (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      if (!panel.classList.contains('is-on')) return;
      const el = document.activeElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      e.preventDefault();
      if (key === 'y' || e.shiftKey) redo(); else undo();
    });

    /* ---- 資料變動 ---- */
    /* 「從出席表單匯入」開著的時候有新回覆進來，數字要跟著跳 —— 這一頁講的就是即時 */
    const onData = () => {
      invalidateGuests();
      renderAll();
      if (!rsvpImportMask.hidden) renderRsvpImport();
    };
    document.addEventListener('data:rsvps', onData);
    document.addEventListener('data:rsvpTags', onData);

    /* 有還沒存的修改時提醒一聲，不要整個下午的排桌被一個關閉分頁弄不見 */
    window.addEventListener('beforeunload', (e) => {
      if (!dirty) return;
      writeLocalDraft();
      e.preventDefault();
      e.returnValue = '';
    });

    /* beforeunload 在行動裝置上不可靠 —— iOS Safari 回收背景分頁時根本不會發。
       頁面一切到背景就先把草稿寫下來，這才是手機上真正會走到的那條路。 */
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && dirty) writeLocalDraft();
    });
    window.addEventListener('pagehide', () => { if (dirty) writeLocalDraft(); });
  }

  /* ============================================================
     啟動（admin.js 登入成功後呼叫）
  ============================================================ */
  /* 提示看過一次就夠了。收起來的狀態記在這台裝置上（以 siteId 分隔），
     不寫回資料庫 —— 這是「這台手機的使用者知道了」，不是站台設定。 */
  const TIP_KEY = 'seatPlan.touchTipHidden';

  function bindTouchTip() {
    const tip = $('spTouchTip');
    if (!tip) return;
    if (LS.get(TIP_KEY, false)) { tip.hidden = true; return; }
    $('spTouchTipClose').addEventListener('click', () => {
      tip.hidden = true;
      LS.set(TIP_KEY, true);
    });
  }

  function init() {
    if (started) return;
    started = true;
    fillTypeSelect();
    bindTouchTip();

    /* 一列的動作收進「⋮」：刪除原本和「編輯」只隔 10px，很容易點錯。
       順序也一起放進來 —— ↑↓ 一次只能挪一格，30 桌要按很多下。 */
    registerRowMenu('spTable', (id) => {
      const list = sortedTables();
      const i = list.findIndex((t) => t.id === id);
      const moveTo = (to) => mutate(() => {
        const next = list.slice();
        const [x] = next.splice(i, 1);
        next.splice(to, 0, x);
        next.forEach((t, k) => { tableById(t.id).order = k + 1; });
      });
      return [
        { label:'上移一位',   disabled: i <= 0,                  run: () => moveTo(i - 1) },
        { label:'下移一位',   disabled: i >= list.length - 1,    run: () => moveTo(i + 1) },
        { label:'移到最前面', disabled: i <= 0,                  run: () => moveTo(0) },
        { label:'移到最後面', disabled: i >= list.length - 1,    run: () => moveTo(list.length - 1) },
        '-',
        { label:'編輯這一桌', run: () => openTableModal(id) },
        { label:'刪除這一桌', danger:true, run: () => deleteTable(id) },
      ];
    });
    view.tagOrder = LS.get('seatPlan.tagOrder', []) || [];
    bindEvents();
    bindDnd();
    bindPeek();
    renderAll();
    loadPromise = load();
  }

  /* 把現在算出來的自動編號釘進草稿裡。
     ------------------------------------------------------------
     後台要刪掉一筆出席回覆之前會先呼叫這個（見 admin.js 的 deleteRsvp）。
     編號本來是照回覆順序算的，少一筆就會讓後面每個人往前挪一號 ——
     新人可能已經把 B06 寫在紙本名單、桌卡上了。先釘住，
     刪掉的那一號就變成空號，其他人一個都不會動。

     回傳有沒有真的寫進資料庫（沒開排桌管理的站台就是 false，不算失敗）。 */
  async function freezeCodes() {
    if (!started) return false;                 /* 沒開排桌管理，沒有編號這回事 */
    if (loadPromise) await loadPromise;

    const codes = autoCodes();
    let changed = 0;
    DataStore.getRSVPs().forEach((r) => {
      const m = plan.meta[r.id];
      if (m && m.code) return;                  /* 已經定下來了 */
      const code = codes[r.id];
      if (!code) return;
      plan.meta[r.id] = { ...(m || {}), id: r.id, src: 'rsvp', code };
      changed++;
    });
    if (!changed) return false;

    invalidateGuests();
    /* 有沒存的修改時不要偷偷幫他存整份草稿（儲存在這一頁是刻意的動作）——
       釘在記憶體裡，等新人自己按「儲存排桌」一起帶走。 */
    if (dirty) { renderAll(); return false; }
    return save(true);
  }

  /* 「桌次名單」那一頁的「同步現在的排桌」按鈕走這裡。
     草稿是非同步讀進來的，太早按會誤判成沒資料，所以先等它讀完。 */
  async function syncNow() {
    if (!started) init();
    if (loadPromise) await loadPromise;
    if (!allGuests().some((g) => g.tableId)) {
      toast('尚無排桌資料', true);
      return false;
    }
    await syncToSeating();
    return true;
  }

  /* 排好的名單攤成一份純資料，給「收禮小幫手」匯出去用（見 admin.js 的
     butlerImport）。回傳的是一份快照，不是接上去的即時資料 ——
     收禮台在婚宴當天要的是「現在這一版」，不該因為新人回頭調桌次就跟著跳。

     草稿是非同步讀進來的，太早叫會拿到空的，所以先等它讀完。 */
  async function roster() {
    if (!started) init();
    if (loadPromise) await loadPromise;
    return allGuests()
      .slice()
      .sort((a, b) => String(a.code).localeCompare(String(b.code)))
      .map((g) => {
        const t = tableById(g.tableId);
        return {
          id: g.id,
          code: g.code || '',
          name: g.name || '',
          table: t ? tableLabel(t) : '',
          count: Number(g.count) || 0,
          cat: g.cat || '',
          note: g.note || '',
        };
      });
  }

  window.SeatingPlan = { init, syncNow, freezeCodes, roster };
})();
