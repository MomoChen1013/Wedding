/* ============================================================
   xlsx-lite.js — 極小的 Excel（.xlsx）讀寫器
   ------------------------------------------------------------
   為什麼自己寫：
   全站不引入任何前端框架與函式庫（見 SPEC 第 1 節），
   但排桌管理必須能和新人手上的 Excel 雙向進出。
   .xlsx 其實就是一包 ZIP 裡的幾份 XML，需要的只有：

     讀：ZIP 解包（stored ／ deflate）→ 讀 sharedStrings ＋ sheet
     寫：把 XML 包成 ZIP（一律用 stored，不壓縮就不必實作 deflate）

   所以這裡只做「表格進、表格出」需要的那一小塊，
   不支援公式、樣式、合併儲存格 —— 名單類的檔案用不到。

   對外只有兩個函式，掛在 window.XLSXLite：
     await XLSXLite.read(file)            → [{ name, rows:[[值,…],…] }, …]
     XLSXLite.write([{ name, rows }, …])  → Blob（可直接下載）

   讀進來的每一格都是字串（數字也一樣）——
   排桌的「人數」「桌號」本來就要自己驗證，統一型別反而少一層意外。
============================================================ */
(function () {
  'use strict';

  /* ============================================================
     ZIP 讀取
     ------------------------------------------------------------
     只認一般的 ZIP：先找檔尾的 End of Central Directory，
     再走中央目錄拿到每個檔案的位置與壓縮方式。
     （不處理 ZIP64；.xlsx 名單檔遠遠到不了 4GB）
  ============================================================ */
  function u16(v, i) { return v[i] | (v[i + 1] << 8); }
  function u32(v, i) { return (v[i] | (v[i + 1] << 8) | (v[i + 2] << 16) | (v[i + 3] << 24)) >>> 0; }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('這個瀏覽器不支援解壓縮，請改用 CSV 匯入');
    }
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(buffer) {
    const v = new Uint8Array(buffer);

    /* End of Central Directory：從檔尾往回找簽名（後面可能還有註解） */
    let eocd = -1;
    for (let i = v.length - 22; i >= 0 && i > v.length - 22 - 65536; i--) {
      if (u32(v, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('這個檔案不是有效的 Excel 檔');

    const count = u16(v, eocd + 10);
    let p = u32(v, eocd + 16);

    const files = {};
    for (let n = 0; n < count; n++) {
      if (u32(v, p) !== 0x02014b50) break;
      const method   = u16(v, p + 10);
      const compSize = u32(v, p + 20);
      const nameLen  = u16(v, p + 28);
      const extraLen = u16(v, p + 30);
      const cmtLen   = u16(v, p + 32);
      const localAt  = u32(v, p + 42);
      const name = new TextDecoder().decode(v.subarray(p + 46, p + 46 + nameLen));

      /* 本地標頭的 extra 長度和中央目錄的不一定一樣，要各讀各的 */
      const lNameLen  = u16(v, localAt + 26);
      const lExtraLen = u16(v, localAt + 28);
      const dataAt = localAt + 30 + lNameLen + lExtraLen;
      files[name] = { method, bytes: v.subarray(dataAt, dataAt + compSize) };

      p += 46 + nameLen + extraLen + cmtLen;
    }

    /* 需要哪一份才解哪一份 */
    return {
      names: Object.keys(files),
      async text(name) {
        const f = files[name];
        if (!f) return '';
        const raw = f.method === 0 ? f.bytes : await inflateRaw(f.bytes);
        return new TextDecoder().decode(raw);
      },
    };
  }

  /* ============================================================
     XML：只取需要的那幾個標籤，不做完整 DOM 解析
     ------------------------------------------------------------
     用 DOMParser 讀就好 —— 瀏覽器本來就有，比自己寫 regex 可靠。
  ============================================================ */
  function parseXml(text) {
    return new DOMParser().parseFromString(text, 'application/xml');
  }

  /* A1 → 0、B1 → 1、AA1 → 26 */
  function colIndex(ref) {
    let n = 0;
    for (const ch of String(ref)) {
      const c = ch.charCodeAt(0);
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return Math.max(0, n - 1);
  }

  /* <si> 可能被拆成好幾段 <t>（Excel 會因為格式把一句話切開），要全部接起來 */
  function siText(node) {
    return Array.from(node.getElementsByTagName('t')).map((t) => t.textContent).join('');
  }

  async function read(file) {
    const sheets = [];
    const zip = await unzip(await file.arrayBuffer());

    /* 共用字串表 */
    const shared = [];
    const ssXml = await zip.text('xl/sharedStrings.xml');
    if (ssXml) {
      const doc = parseXml(ssXml);
      Array.from(doc.getElementsByTagName('si')).forEach((si) => shared.push(siText(si)));
    }

    /* 工作表名稱與檔案位置：workbook.xml 記名字與 r:id，rels 記 r:id → 檔名 */
    const relTarget = {};
    const relXml = await zip.text('xl/_rels/workbook.xml.rels');
    if (relXml) {
      Array.from(parseXml(relXml).getElementsByTagName('Relationship')).forEach((r) => {
        relTarget[r.getAttribute('Id')] = r.getAttribute('Target');
      });
    }

    const wbXml = await zip.text('xl/workbook.xml');
    const sheetDefs = [];
    if (wbXml) {
      Array.from(parseXml(wbXml).getElementsByTagName('sheet')).forEach((sh, i) => {
        const rid = sh.getAttribute('r:id')
          || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
        let target = relTarget[rid] || `worksheets/sheet${i + 1}.xml`;
        if (target.startsWith('/')) target = target.slice(1);
        else if (!target.startsWith('xl/')) target = `xl/${target}`;
        sheetDefs.push({ name: sh.getAttribute('name') || `工作表${i + 1}`, path: target });
      });
    }
    if (!sheetDefs.length) sheetDefs.push({ name: '工作表1', path: 'xl/worksheets/sheet1.xml' });

    for (const def of sheetDefs) {
      const xml = await zip.text(def.path);
      if (!xml) continue;
      const doc = parseXml(xml);
      const rows = [];
      Array.from(doc.getElementsByTagName('row')).forEach((row) => {
        const out = [];
        Array.from(row.getElementsByTagName('c')).forEach((c) => {
          const at = colIndex(c.getAttribute('r') || '');
          const type = c.getAttribute('t');
          let val = '';
          if (type === 's') {
            const vEl = c.getElementsByTagName('v')[0];
            val = shared[Number(vEl ? vEl.textContent : -1)] || '';
          } else if (type === 'inlineStr') {
            const is = c.getElementsByTagName('is')[0];
            val = is ? siText(is) : '';
          } else {
            const vEl = c.getElementsByTagName('v')[0];
            val = vEl ? vEl.textContent : '';
          }
          out[at] = String(val == null ? '' : val).trim();
        });
        /* 中間空掉的格子補空字串，欄位對齊才不會跑掉 */
        for (let i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = '';
        rows.push(out);
      });
      sheets.push({ name: def.name, rows });
    }
    return sheets;
  }

  /* ============================================================
     ZIP 寫入（一律 stored，不壓縮）
     ------------------------------------------------------------
     不壓縮的 ZIP 一樣是合法的 ZIP，Excel、Numbers、Google 試算表
     都打得開；換來的是完全不必實作 deflate。
     名單類的檔案本來就只有幾十 KB，省下來的體積沒有意義。
  ============================================================ */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zipStored(entries) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;

    const put = (arr, ...nums) => { nums.forEach((n) => arr.push(n)); };
    const w16 = (arr, n) => put(arr, n & 0xFF, (n >>> 8) & 0xFF);
    const w32 = (arr, n) => put(arr, n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF);

    entries.forEach(({ name, text }) => {
      const nameBytes = enc.encode(name);
      const data = enc.encode(text);
      const crc = crc32(data);

      const local = [];
      w32(local, 0x04034b50);
      w16(local, 20);            /* 需要的版本 */
      w16(local, 0x0800);        /* 檔名是 UTF-8 */
      w16(local, 0);             /* stored */
      w16(local, 0); w16(local, 0);   /* 時間、日期都填 0，看檔案的人不需要 */
      w32(local, crc);
      w32(local, data.length);
      w32(local, data.length);
      w16(local, nameBytes.length);
      w16(local, 0);
      parts.push(new Uint8Array(local), nameBytes, data);

      const cd = [];
      w32(cd, 0x02014b50);
      w16(cd, 20); w16(cd, 20);
      w16(cd, 0x0800);
      w16(cd, 0);
      w16(cd, 0); w16(cd, 0);
      w32(cd, crc);
      w32(cd, data.length);
      w32(cd, data.length);
      w16(cd, nameBytes.length);
      w16(cd, 0); w16(cd, 0); w16(cd, 0); w16(cd, 0);
      w32(cd, 0);
      w32(cd, offset);
      central.push(new Uint8Array(cd), nameBytes);

      offset += local.length + nameBytes.length + data.length;
    });

    const cdSize = central.reduce((n, a) => n + a.length, 0);
    const end = [];
    w32(end, 0x06054b50);
    w16(end, 0); w16(end, 0);
    w16(end, entries.length); w16(end, entries.length);
    w32(end, cdSize);
    w32(end, offset);
    w16(end, 0);

    return new Blob([...parts, ...central, new Uint8Array(end)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  /* ---------- XML 小工具 ---------- */
  function xmlEscape(s) {
    return String(s == null ? '' : s)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  function colName(i) {
    let s = '';
    let n = i + 1;
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  /* 工作表名稱：Excel 不接受 : \ / ? * [ ] 與超過 31 個字 */
  function safeSheetName(name, i) {
    const s = String(name || `工作表${i + 1}`).replace(/[:\\/?*[\]]/g, ' ').slice(0, 31);
    return s.trim() || `工作表${i + 1}`;
  }

  /* 看起來就是數字的字串才存成數字，其餘一律存文字 ——
     「01」這種桌號、「0912…」這種電話存成數字會掉開頭的 0 */
  function isPlainNumber(v) {
    return typeof v === 'number'
      || (typeof v === 'string' && /^-?(0|[1-9]\d*)(\.\d+)?$/.test(v));
  }

  function sheetXml(rows) {
    const body = rows.map((row, r) => {
      const cells = (row || []).map((val, c) => {
        const ref = `${colName(c)}${r + 1}`;
        if (val === '' || val == null) return '';
        if (isPlainNumber(val)) return `<c r="${ref}"><v>${xmlEscape(val)}</v></c>`;
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(val)}</t></is></c>`;
      }).join('');
      return `<row r="${r + 1}">${cells}</row>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
      + `<sheetData>${body}</sheetData></worksheet>`;
  }

  function write(sheets) {
    const list = (sheets || []).map((s, i) => ({
      name: safeSheetName(s.name, i),
      rows: Array.isArray(s.rows) ? s.rows : [],
    }));
    if (!list.length) list.push({ name: '工作表1', rows: [] });

    const entries = [
      {
        name: '[Content_Types].xml',
        text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
          + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
          + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
          + `<Default Extension="xml" ContentType="application/xml"/>`
          + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
          + list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" `
            + `ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
          + `</Types>`,
      },
      {
        name: '_rels/.rels',
        text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
          + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
          + `<Relationship Id="rId1" Target="xl/workbook.xml" `
          + `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"/>`
          + `</Relationships>`,
      },
      {
        name: 'xl/workbook.xml',
        text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
          + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" `
          + `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>`
          + list.map((s, i) =>
            `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
          + `</sheets></workbook>`,
      },
      {
        name: 'xl/_rels/workbook.xml.rels',
        text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
          + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
          + list.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml" `
            + `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/>`).join('')
          + `</Relationships>`,
      },
      ...list.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s.rows) })),
    ];

    return zipStored(entries);
  }

  window.XLSXLite = { read, write };
})();
