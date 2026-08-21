/* ============================================================
   butler-key.js — 收禮小幫手的「鑰匙」
   ------------------------------------------------------------
   butler.html（小幫手用的工具）與 admin.html（新人產生連結）
   共用同一份推導，兩邊算出來的位置才會是同一個。

   為什麼收禮簿的位置要用算的
   ------------------------------------------------------------
   Firestore 的讀取請求不帶 payload，Security Rules 沒有辦法
   驗證使用者輸入的通行碼 —— 純前端的密碼框只是遮住畫面，
   資料仍然可以透過 API 直接取得（見 SPEC 第 12 節）。

   但如果「通行碼算得出資料在哪裡」，把它算進文件 id 就等於真的驗過了：

     bookId = PBKDF2-SHA256(通行碼, salt = 'butler:' + token, 200000 次)

   ・只有連結（token）→ 少了通行碼，算不出 bookId
   ・只有通行碼        → 少了 token，同樣算不出來
   ・兩個都有          → 才走得到 butlers/{bookId}

   規則那邊只要做一件對應的事：get 全開、**list 一律拒絕** ——
   能列出整個 butlers 集合的話，上面這道門就整個白做了。

   20 萬次迭代不是為了防止暴力破解 token（110 bits 本來就猜不到），
   是為了讓「拿到連結之後再猜六位數通行碼」變得不划算：
   每猜一次都要先算一次 PBKDF2，還要打一趟 Firestore。
============================================================ */
(function () {
  const ITERATIONS = 200000;

  /* token 用的字母表：去掉 l / o / 0 / 1 這些手抄容易混淆的字。
     剛好 32 個字元 —— 256 除得盡 32，隨機取模不會有偏差。 */
  const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

  function randomBytes(n) {
    const buf = new Uint8Array(n);
    crypto.getRandomValues(buf);
    return buf;
  }

  /* 網址上的 token：22 個字 ≒ 110 bits，猜不到 */
  function newToken(len) {
    const n = len || 22;
    return [...randomBytes(n)].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  }

  /* 通行碼：六位數字。現場要用嘴巴唸、用手打，字母大小寫只會出錯。
     取樣時丟掉 250 以上的位元組，十個數字才會等機率出現。 */
  function newPasscode(len) {
    const want = len || 6;
    let out = '';
    while (out.length < want) {
      for (const b of randomBytes(want * 2)) {
        if (b >= 250) continue;
        out += String(b % 10);
        if (out.length === want) break;
      }
    }
    return out;
  }

  function toHex(buf) {
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /* 需要 crypto.subtle：https 或 localhost 才有（Hosting 一律是 https） */
  function available() {
    return !!(window.crypto && window.crypto.subtle && window.crypto.subtle.deriveBits);
  }

  async function derive(token, passcode) {
    if (!available()) throw new Error('這個瀏覽器環境不支援加密功能（需要 https）');
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(String(passcode)), 'PBKDF2', false, ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: enc.encode('butler:' + String(token)),
        iterations: ITERATIONS,
        hash: 'SHA-256',
      },
      key, 256,
    );
    return toHex(bits);
  }

  /* 分享出去的網址。token 放在 # 後面而不是查詢字串：
     fragment 不會被送到伺服器、也不會出現在 Referer 標頭裡，
     少一個外流的管道。 */
  function urlFor(token, origin) {
    return `${origin || location.origin}/butler#${token}`;
  }

  window.ButlerKey = { newToken, newPasscode, derive, urlFor, available, ITERATIONS };
})();
