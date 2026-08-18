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

  let savedAt = 0;      /* 上次按「儲存排桌」的時間 */
  let syncedAt = 0;     /* 上次同步到桌次查詢的時間 */
  let dirty = false;    /* 有還沒存的修改 */
  let started = false;  /* init() 只跑一次 */
  let loaded = false;   /* 草稿讀回來了沒 */

  const undoStack = [];
  const redoStack = [];

  /* 提醒先只露出前幾條，其餘收起來（見 renderWarns） */
  const WARN_PREVIEW = 3;
  let warnsOpen = false;

  /* 篩選預設收起來：這一頁最重要的是那兩欄工作區，
     一進來就先看到人和桌子，需要篩再展開。 */
  let filtersOpen = false;

  /* 畫面上的篩選與排序 */
  const view = {
    q: '',
    seat: 'all',       /* all / none / done */
    rsvp: 'all',       /* all / yes / maybe / no */
    tags: new Set(),   /* 多選；空的代表不篩 */
    table: 'all',
    sort: 'code',
    tagOrder: [],      /* 分組優先順序（標籤 id），沒設定就照標籤庫的順序 */
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

  /* 自動編號：同一個字首依回覆時間排序後給 01、02…
     算出來的東西不存進資料庫 —— 新人沒改過就每次算一樣的結果。 */
  function autoCodes() {
    const rows = DataStore.getRSVPs()
      .slice()
      .sort((a, b) => rsvpMs(a) - rsvpMs(b) || String(a.id).localeCompare(String(b.id)));
    const seq = {};
    const out = {};
    rows.forEach((r) => {
      const p = CODE_PREFIX[r.relation] || 'D';
      seq[p] = (seq[p] || 0) + 1;
      out[r.id] = `${p}${String(seq[p]).padStart(2, '0')}`;
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
      const ids = tagIdsOfRsvp(r);
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
        note: m.note != null && m.note !== '' ? m.note : (r.note || r.dietaryNote || ''),
        gift: Number(m.gift) || 0,
        got: m.got === true,
      };
    });

    Object.entries(plan.meta).forEach(([id, m]) => {
      if (m.src !== 'manual') return;
      const ids = (m.tags || []).filter((t) => guestTagName(t));
      list.push({
        id,
        src: 'manual',
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
    renderAll();
  }

  function undo() {
    if (!undoStack.length) return;
    const cur = snapshot();
    restore(undoStack.pop());
    redoStack.push(cur);
    dirty = true;
    renderAll();
    toast('已復原上一步');
  }

  function redo() {
    if (!redoStack.length) return;
    const cur = snapshot();
    restore(redoStack.pop());
    undoStack.push(cur);
    dirty = true;
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
      toast('讀不到排桌資料，請確認這個帳號在 ownerEmails 名單內', true);
    }
    renderAll();
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
    if (g.gift != null) m.gift = clampInt(g.gift, 0, 99, 0);
    if (g.got === true) m.got = true;
    return m;
  }

  /* 回覆來的賓客如果一個欄位都沒被改過，就不必存 ——
     不然 600 筆的上限會被一堆空殼佔滿 */
  function metaIsEmpty(m) {
    if (m.src === 'manual') return false;
    return !m.code && !m.cat && !m.name && m.count == null && !m.rsvp
      && !(m.tags && m.tags.length) && !m.note && !m.gift && m.got !== true;
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

  async function save(silent) {
    const payload = planPayload();
    if (payload.guests.length >= MAX_GUESTS) {
      toast(`排桌名單最多 ${MAX_GUESTS} 位，請先整理一下`, true);
      return false;
    }
    try {
      await window.fb.setDoc(planDoc(), payload);
      savedAt = payload.savedAt;
      plan.assign = payload.assign;
      dirty = false;
      renderAll();
      if (!silent) toast('排桌已儲存');
      return true;
    } catch (err) {
      writeFailed(err);
      return false;
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
        title: '同步至桌次查詢系統',
        message: `會把目前排好的 ${guests.length} 位賓客整份送到賓客的「我的桌次」，`
               + '原本那一份桌次名單會被換掉。要繼續嗎？',
        confirmText: '同步',
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

    try {
      await DataStore.wipeCollection('seating');
      await DataStore.importSeating(rows);
      syncedAt = Date.now();
      await save(true);
      toast(`已同步 ${rows.length} 位賓客到桌次查詢`);
    } catch (err) {
      writeFailed(err);
    }
  }

  /* 儲存 →（存成功才問）要不要同步 */
  async function saveThenAsk() {
    const okSave = await save();
    if (!okSave) return;
    const go = await confirmModal({
      title: '排桌已儲存',
      message: '是否要同步至桌次查詢系統？同步之後賓客馬上查得到自己的桌次；'
             + '還在調整的話可以稍後再說，前台不會跟著變動。',
      confirmText: '同步',
      cancelText: '稍後再說',
    });
    if (go) await syncToSeating(true);
  }

  /* ============================================================
     篩選 / 排序 / 分組
  ============================================================ */

  /* 一位多標籤的賓客要被歸到哪一組：照分組順序，第一個對到的就是他的組。
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

  function matchesFilters(g) {
    if (view.seat === 'none' && g.tableId) return false;
    if (view.seat === 'done' && !g.tableId) return false;
    if (view.rsvp !== 'all' && g.rsvp !== view.rsvp) return false;
    if (view.tags.size && !g.tagIds.some((id) => view.tags.has(id))) return false;
    if (view.table !== 'all' && g.tableId !== view.table) return false;

    if (!view.q) return true;
    const t = tableById(g.tableId);
    const hay = [g.name, g.code, g.cat, g.tagNames.join(' '), t ? tableLabel(t) : '']
      .join(' ');
    return normKey(hay).includes(view.q);
  }

  function sortGuests(list) {
    const arr = list.slice();
    const byCode = (a, b) => String(a.code).localeCompare(String(b.code), 'zh-Hant');
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
    $('spStats').innerHTML = cells.map(([n, lab]) => `
      <div class="ad-stat">
        <div class="ad-stat-num">${esc(n)}</div>
        <div class="ad-stat-lab">${esc(lab)}</div>
      </div>`).join('');
  }

  /* ============================================================
     畫面：提醒
     ------------------------------------------------------------
     一律只提醒，不擋操作 —— 婚宴實務上常常要臨時硬塞一個人進去。
  ============================================================ */
  function renderWarns() {
    const guests = allGuests();
    const out = [];

    const unassigned = guests.filter((g) => !g.tableId && g.count > 0);
    if (unassigned.length) {
      const heads = unassigned.reduce((n, g) => n + g.count, 0);
      out.push(`尚有 ${unassigned.length} 位賓客（${heads} 人）未安排`);
    }

    sortedTables().forEach((t) => {
      const { heads, rows } = seatedOf(t.id, guests);
      if (heads > t.cap) out.push(`第 ${no2(t.no)} 桌超過容量 ${heads - t.cap} 位`);
      const names = rows.flatMap((g) => g.tagNames);
      specialsOf(names).forEach((sp) => {
        const n = rows.filter((g) => g.tagNames.some((x) =>
          sp.match.some((m) => x.toLowerCase().includes(m.toLowerCase()))))
          .reduce((s, g) => s + g.count, 0);
        if (n) out.push(`第 ${no2(t.no)} 桌有 ${n} 位${sp.label}賓客`);
      });
    });

    const pending = guests.filter((g) => g.rsvp === 'maybe');
    if (pending.length) {
      const who = pending.slice(0, 3).map((g) => g.code || g.name).join('、');
      out.push(`${who}${pending.length > 3 ? ` 等 ${pending.length} 位` : ''} 尚未確認 RSVP`);
    }

    const noCount = guests.filter((g) => g.tableId && g.count <= 0);
    if (noCount.length) out.push(`有 ${noCount.length} 位已排桌的賓客缺少人數`);

    /* 二十幾桌的婚禮很容易一次列出十幾條提醒，整片攤開會把工作區
       擠到螢幕外 —— 那就違反了「未安排的人要一直看得見」。
       所以只先露出前幾條，其餘收起來讓使用者自己決定要不要看。 */
    if (!out.length) {
      $('spWarns').innerHTML = `<div class="sp-warn is-ok">目前沒有需要注意的地方</div>`;
      return;
    }

    const shown = warnsOpen ? out : out.slice(0, WARN_PREVIEW);
    const rest = out.length - shown.length;
    $('spWarns').innerHTML =
      shown.map((w) => `<div class="sp-warn">⚠️ ${esc(w)}</div>`).join('')
      + (rest > 0 || warnsOpen
        ? `<button class="sp-warn-more" type="button" id="spWarnToggle">${
            warnsOpen ? '收起提醒' : `還有 ${rest} 項提醒，展開看看`}</button>`
        : '');

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

    return `
      <article class="sp-card is-rsvp-${g.rsvp}" data-guest="${esc(g.id)}"
               draggable="true" tabindex="0"
               aria-label="${esc(g.name)}，${g.count} 位，${RSVP_TEXT[g.rsvp]}">
        <div class="sp-card-line">
          <span class="sp-card-code">${esc(g.code || '—')}</span>
          <span class="sp-card-name">${esc(g.name)}</span>
          <span class="sp-card-count">${g.count} 人</span>
        </div>
        ${line2 ? `<div class="sp-card-tags">${line2}</div>` : ''}
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
     畫面：未安排區 ＋ 桌位
  ============================================================ */
  function renderBoard() {
    const guests = allGuests();
    const shown = guests.filter(matchesFilters);

    /* ---- 左邊：未安排 ---- */
    const pool = sortGuests(shown.filter((g) => !g.tableId));
    const poolHeads = pool.reduce((n, g) => n + g.count, 0);
    $('spPoolCount').textContent = `${pool.length} 筆・${poolHeads} 人`;

    const body = $('spPoolBody');
    if (!loaded) {
      body.innerHTML = skeletonHtml(3, ['60%', '40%']);
    } else if (!pool.length) {
      body.innerHTML = `<div class="ad-empty">${
        guests.some((g) => !g.tableId) ? '沒有符合條件的未安排賓客' : '所有賓客都排好位子了'
      }</div>`;
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

    /* ---- 右邊：桌位 ---- */
    const board = $('spTablesBoard');
    const tables = sortedTables();
    if (!tables.length) {
      board.innerHTML = `
        <div class="ad-empty sp-tables-empty">
          還沒有任何桌位
          <div class="ad-row" style="justify-content:center">
            <button class="btn small" type="button" data-act="add-table">新增第一桌</button>
            <button class="btn small ghost" type="button" data-act="batch-table">一次加好幾桌</button>
          </div>
        </div>`;
      return;
    }

    board.innerHTML = tables.map((t) => {
      const { rows, heads } = seatedOf(t.id, guests);
      const left = t.cap - heads;
      const state = heads > t.cap ? 'over' : (left === 0 ? 'full' : 'ok');
      const leftText = heads > t.cap
        ? `超過容量 ${heads - t.cap} 位`
        : (left === 0 ? '已滿' : `剩餘 ${left} 位`);

      /* 這一桌的特殊需求：直接寫成「🥬 2 位素食」，不用點進去才看得到 */
      const flags = specialsOf(rows.flatMap((g) => g.tagNames)).map((sp) => {
        const n = rows.filter((g) => g.tagNames.some((x) =>
          sp.match.some((m) => x.toLowerCase().includes(m.toLowerCase()))))
          .reduce((s, g) => s + g.count, 0);
        return n ? `<span class="sp-flag">${sp.icon} ${n} 位${esc(sp.label)}</span>` : '';
      }).join('');

      const cards = rows.filter(matchesFilters);
      const type = typeName(t);

      return `
        <article class="sp-table is-${state}" data-table="${esc(t.id)}">
          <header class="sp-table-head" draggable="true" data-table-head="${esc(t.id)}">
            <span class="sp-table-no">${no2(t.no)}</span>
            <!-- 沒設定桌名就只留桌號，不要生出「（桌名）」這種空殼 -->
            <span class="sp-table-name">${esc(t.name)}</span>
            ${type ? `<span class="sp-table-type">${esc(type)}</span>` : ''}
            <button class="ad-edit sp-table-edit" type="button" data-edit-table="${esc(t.id)}">編輯</button>
          </header>
          <div class="sp-table-meta">
            <span class="sp-table-count">${heads} / ${t.cap} 人</span>
            <span class="sp-table-left">${esc(leftText)}</span>
          </div>
          ${flags ? `<div class="sp-table-flags">${flags}</div>` : ''}
          <div class="sp-table-body" data-drop="${esc(t.id)}">
            ${cards.length
              ? cards.map(guestCard).join('')
              : `<div class="sp-table-empty">把賓客拖進來</div>`}
            ${rows.length && cards.length < rows.length
              ? `<div class="sp-table-hidden">另有 ${rows.length - cards.length} 位被目前的篩選藏起來</div>`
              : ''}
          </div>
        </article>`;
    }).join('');
  }

  /* ============================================================
     畫面：桌位管理清單
  ============================================================ */
  function renderTableList() {
    const el = $('spTableList');
    const tables = sortedTables();
    const guests = allGuests();
    if (!tables.length) {
      el.innerHTML = `<div class="ad-empty">還沒有桌位，按右上角「新增桌位」開始</div>`;
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
            <button class="ad-edit" type="button" data-move-table="up" data-id="${esc(t.id)}"
                    ${i === 0 ? 'disabled' : ''} aria-label="往前移">↑</button>
            <button class="ad-edit" type="button" data-move-table="down" data-id="${esc(t.id)}"
                    ${i === tables.length - 1 ? 'disabled' : ''} aria-label="往後移">↓</button>
            <button class="ad-edit" type="button" data-edit-table="${esc(t.id)}">編輯</button>
            <button class="ad-del" type="button" data-del-table="${esc(t.id)}">刪除</button>
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
    $('spTagOrderBtn').hidden = !lib.length;

    const sel = $('spTableFilter');
    const cur = view.table;
    sel.innerHTML = `<option value="all">全部桌位</option>`
      + sortedTables().map((t) =>
        `<option value="${esc(t.id)}">${esc(tableLabel(t))}</option>`).join('');
    sel.value = sortedTables().some((t) => t.id === cur) ? cur : 'all';
    view.table = sel.value;
  }

  /* 篩選鈕上寫著現在套了幾個條件，收起來也知道有沒有在篩 */
  function renderFilterToggle() {
    const n = (view.seat !== 'all' ? 1 : 0)
            + (view.rsvp !== 'all' ? 1 : 0)
            + view.tags.size
            + (view.table !== 'all' ? 1 : 0);
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

    let state = 'none';
    let text = '尚未同步';
    let hint = '目前排桌資料尚未同步至桌次查詢系統';

    if (syncedAt && syncedAt >= savedAt) {
      state = 'ok';
      text = '已同步';
      hint = `最後同步：${fmtTime(syncedAt)}`;
    } else if (syncedAt) {
      state = 'stale';
      text = '有修改尚未同步';
      hint = `排桌已修改，尚未同步（最後同步：${fmtTime(syncedAt)}）`;
    }
    if (dirty) {
      hint += hint ? '・有還沒儲存的修改' : '有還沒儲存的修改';
    }

    el.dataset.state = state;
    el.textContent = text;
    note.textContent = hint;
    btn.textContent = syncedAt ? '再次同步' : '同步至桌次查詢';

    $('spSaveBtn').classList.toggle('is-dirty', dirty);
    $('spUndo').disabled = !undoStack.length;
    $('spRedo').disabled = !redoStack.length;
  }

  function renderAll() {
    if (!started) return;
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

  async function batchAddTables() {
    const raw = await promptModal({
      title: '一次加好幾桌',
      message: `要新增幾桌？會從第 ${no2(nextTableNo())} 桌接著編號，容量預設 ${DEFAULT_CAP} 人。`,
      placeholder: '例如 12',
      maxLength: 3,
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
    $('spDrawerGift').value = g.gift;
    $('spDrawerGot').checked = g.got;
    $('spDrawerDelete').hidden = g.src !== 'manual';

    const lib = tagLib();
    $('spDrawerTagsOff').hidden = !!lib.length;
    /* 賓客自己在表單上選的那一個是他送出的紀錄，後台改不動，畫成關不掉的勾勾 */
    const r = g.src === 'rsvp' ? DataStore.getRSVPs().find((x) => x.id === g.id) : null;
    const own = r ? String(r.tag || '') : '';
    $('spDrawerTags').innerHTML = lib.map((tg) => {
      const isOwn = tg.id === own;
      return `
      <label class="ad-check sp-drawer-tag${isOwn ? ' is-fixed' : ''}">
        <input type="checkbox" value="${esc(tg.id)}"${g.tagIds.includes(tg.id) ? ' checked' : ''}${
          isOwn ? ' disabled' : ''}>
        <span>${esc(tg.name)}${isOwn ? '<small>賓客自己選的</small>' : ''}</span>
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
      try {
        await DataStore.saveRsvpTags(id, tagIds);
      } catch (err) { writeFailed(err); }
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
     分組順序
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

    /* ---- 搜尋 / 篩選 / 排序 ---- */
    $('spSearch').addEventListener('input', (e) => {
      view.q = normKey(e.target.value);
      renderBoard();
    });
    $('spSort').addEventListener('change', (e) => { view.sort = e.target.value; renderBoard(); });
    $('spTableFilter').addEventListener('change', (e) => {
      view.table = e.target.value;
      renderFilterToggle();
      renderBoard();
    });
    $('spFilterToggle').addEventListener('click', () => {
      filtersOpen = $('spFilters').hidden;
      renderFilterToggle();
    });

    $('spSeatChips').addEventListener('click', (e) => {
      const chip = e.target.closest('.ad-chip');
      if (!chip) return;
      view.seat = chip.dataset.seat;
      $('spSeatChips').querySelectorAll('.ad-chip').forEach((c) => c.classList.toggle('is-on', c === chip));
      renderFilterToggle();
      renderBoard();
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
      const editTable = e.target.closest('[data-edit-table]');
      if (editTable) { openTableModal(editTable.dataset.editTable); return; }

      const delTable = e.target.closest('[data-del-table]');
      if (delTable) { deleteTable(delTable.dataset.delTable); return; }

      const moveTableBtn = e.target.closest('[data-move-table]');
      if (moveTableBtn) { moveTable(moveTableBtn.dataset.id, moveTableBtn.dataset.moveTable); return; }

      const act = e.target.closest('[data-act]');
      if (act) {
        if (act.dataset.act === 'add-table') openTableModal('');
        if (act.dataset.act === 'batch-table') batchAddTables();
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

    /* ---- 分組順序 ---- */
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
    document.addEventListener('data:rsvps', () => { invalidateGuests(); renderAll(); });
    document.addEventListener('data:rsvpTags', () => { invalidateGuests(); renderAll(); });

    /* 有還沒存的修改時提醒一聲，不要整個下午的排桌被一個關閉分頁弄不見 */
    window.addEventListener('beforeunload', (e) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  /* ============================================================
     啟動（admin.js 登入成功後呼叫）
  ============================================================ */
  function init() {
    if (started) return;
    started = true;
    fillTypeSelect();
    view.tagOrder = LS.get('seatPlan.tagOrder', []) || [];
    bindEvents();
    bindDnd();
    bindPeek();
    renderAll();
    load();
  }

  window.SeatingPlan = { init };
})();
