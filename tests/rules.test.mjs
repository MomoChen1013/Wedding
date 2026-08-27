import { readFileSync } from 'fs';
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs,
  collection, addDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';

let testEnv;

const SITE_ID = 'site-chen-lin-0315';

function baseSite(overrides = {}) {
  const now = Timestamp.now();
  return {
    slug: 'chen-lin-0315',
    ownerEmail: 'couple@example.com',
    status: 'published',
    groomName: '陳彥廷',
    brideName: '林佳蓉',
    eventDate: Timestamp.fromDate(new Date('2026-03-15T04:00:00Z')),
    venueName: '晶華酒店',
    venueAddress: '台北市中山區',
    venueMapUrl: '',
    themeColor: '#3D9AD1',
    coverImageUrl: '',
    story: '',
    rsvpDeadline: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 3600 * 1000)),
    rsvpEnabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function seedSite(siteId, overrides = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `sites/${siteId}`), baseSite(overrides));
  });
}

function validRsvpPayload(overrides = {}) {
  return {
    name: '王小明',
    attending: true,
    guestCount: 2,
    dietaryNote: '',
    message: '祝福你們百年好合',
    createdAt: serverTimestamp(),
    ...overrides,
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'wedding-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedSite(SITE_ID);
});

describe('sites/{siteId}', () => {
  it('允許任何人讀取已發布的站台', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, `sites/${SITE_ID}`)));
  });

  it('拒絕未登入使用者新建 site', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, 'sites/new-site'), baseSite()));
  });

  it('拒絕未登入使用者修改 site', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), { status: 'archived' }));
  });

  it('拒絕未登入使用者刪除 site', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(deleteDoc(doc(db, `sites/${SITE_ID}`)));
  });
});

describe('slugs/{slug}', () => {
  it('允許讀取，拒絕未登入使用者寫入', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'slugs/chen-lin-0315'), {
        siteId: SITE_ID,
        createdAt: Timestamp.now(),
      });
    });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, 'slugs/chen-lin-0315')));
    await assertFails(setDoc(doc(db, 'slugs/chen-lin-0315'), { siteId: 'hacked' }));
    await assertFails(deleteDoc(doc(db, 'slugs/chen-lin-0315')));
  });
});

describe('sites/{siteId}/rsvps/{rsvpId}', () => {
  it('未登入的使用者可以建立合法 RSVP', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(
      addDoc(collection(db, `sites/${SITE_ID}/rsvps`), validRsvpPayload())
    );
  });

  it('未登入的使用者無法讀取任何 RSVP', async () => {
    let rsvpId;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const ref = await addDoc(
        collection(context.firestore(), `sites/${SITE_ID}/rsvps`),
        validRsvpPayload({ createdAt: Timestamp.now() })
      );
      rsvpId = ref.id;
    });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, `sites/${SITE_ID}/rsvps/${rsvpId}`)));
    await assertFails(getDocs(collection(db, `sites/${SITE_ID}/rsvps`)));
  });

  it('夾帶額外欄位（isAdmin: true）的 RSVP 寫入會被拒絕', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      addDoc(
        collection(db, `sites/${SITE_ID}/rsvps`),
        validRsvpPayload({ isAdmin: true })
      )
    );
  });

  it('guestCount: 99 會被拒絕', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      addDoc(
        collection(db, `sites/${SITE_ID}/rsvps`),
        validRsvpPayload({ guestCount: 99 })
      )
    );
  });

  it('guestCount: 0 會被拒絕', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      addDoc(
        collection(db, `sites/${SITE_ID}/rsvps`),
        validRsvpPayload({ guestCount: 0 })
      )
    );
  });

  it('已過 rsvpDeadline 的站台，RSVP 寫入會被拒絕', async () => {
    await seedSite(SITE_ID, {
      rsvpDeadline: Timestamp.fromDate(new Date(Date.now() - 24 * 3600 * 1000)),
    });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      addDoc(collection(db, `sites/${SITE_ID}/rsvps`), validRsvpPayload())
    );
  });

  it('rsvpEnabled: false 的站台，RSVP 寫入會被拒絕', async () => {
    await seedSite(SITE_ID, { rsvpEnabled: false });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      addDoc(collection(db, `sites/${SITE_ID}/rsvps`), validRsvpPayload())
    );
  });

  it('status 非 published 的站台，RSVP 寫入會被拒絕', async () => {
    await seedSite(SITE_ID, { status: 'draft' });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      addDoc(collection(db, `sites/${SITE_ID}/rsvps`), validRsvpPayload())
    );
  });

  it('對應的 site 不存在時，RSVP 寫入會被拒絕', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      addDoc(collection(db, 'sites/non-existent-site/rsvps'), validRsvpPayload())
    );
  });

  it('name 為空字串會被拒絕', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      addDoc(collection(db, `sites/${SITE_ID}/rsvps`), validRsvpPayload({ name: '' }))
    );
  });

  it('name 超過 40 字會被拒絕', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      addDoc(
        collection(db, `sites/${SITE_ID}/rsvps`),
        validRsvpPayload({ name: '王'.repeat(41) })
      )
    );
  });

  it('message 超過 300 字會被拒絕', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      addDoc(
        collection(db, `sites/${SITE_ID}/rsvps`),
        validRsvpPayload({ message: '祝'.repeat(301) })
      )
    );
  });

  it('未登入的使用者無法修改或刪除 RSVP', async () => {
    let rsvpId;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const ref = await addDoc(
        collection(context.firestore(), `sites/${SITE_ID}/rsvps`),
        validRsvpPayload({ createdAt: Timestamp.now() })
      );
      rsvpId = ref.id;
    });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}/rsvps/${rsvpId}`), { attending: false }));
    await assertFails(deleteDoc(doc(db, `sites/${SITE_ID}/rsvps/${rsvpId}`)));
  });

  /* 「改不動」和「刪得掉」是兩件事：新人可以整筆拿掉重複的回覆，
     但不能動裡面任何一個字。 */
  describe('新人刪除重複的回覆', () => {
    const OWNER = 'couple@example.com';
    const ownerDb = () => testEnv
      .authenticatedContext('couple', { email: OWNER, email_verified: true })
      .firestore();

    async function seedRsvp() {
      let id;
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const ref = await addDoc(
          collection(context.firestore(), `sites/${SITE_ID}/rsvps`),
          validRsvpPayload({ createdAt: Timestamp.now() })
        );
        id = ref.id;
      });
      return id;
    }

    beforeEach(async () => {
      await seedSite(SITE_ID, { ownerEmails: [OWNER] });
    });

    it('新人刪得掉自己站台的回覆', async () => {
      const id = await seedRsvp();
      await assertSucceeds(deleteDoc(doc(ownerDb(), `sites/${SITE_ID}/rsvps/${id}`)));
    });

    it('新人仍然改不動回覆的內容', async () => {
      const id = await seedRsvp();
      await assertFails(
        updateDoc(doc(ownerDb(), `sites/${SITE_ID}/rsvps/${id}`), { attending: false })
      );
    });

    it('不在 ownerEmails 名單內的帳號刪不掉', async () => {
      const id = await seedRsvp();
      const db = testEnv
        .authenticatedContext('nosy', { email: 'nosy@example.com', email_verified: true })
        .firestore();
      await assertFails(deleteDoc(doc(db, `sites/${SITE_ID}/rsvps/${id}`)));
    });

    it('信箱沒驗證的帳號刪不掉', async () => {
      const id = await seedRsvp();
      const db = testEnv
        .authenticatedContext('couple2', { email: OWNER, email_verified: false })
        .firestore();
      await assertFails(deleteDoc(doc(db, `sites/${SITE_ID}/rsvps/${id}`)));
    });
  });
});

describe('short/{code}', () => {
  it('允許讀取，拒絕未登入使用者寫入', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'short/ab12cd'), {
        target: 'https://minato.3udesign.website/w/chen-lin-0315',
        createdAt: Timestamp.now(),
        hits: 0,
      });
    });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, 'short/ab12cd')));
    await assertFails(setDoc(doc(db, 'short/ab12cd'), { target: 'https://evil.example' }));
  });
});

/* ============================================================
   多頁面功能的子集合規則
============================================================ */
describe('多頁面子集合', () => {
  function wish(overrides = {}) {
    return { name:'王小明', icon:'🎀', text:'祝你們幸福', time: Date.now(), ...overrides };
  }

  it('祝福牆：可新增、可讀取，但不可修改刪除', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(addDoc(collection(db, `sites/${SITE_ID}/wishes`), wish()));
    await assertSucceeds(getDocs(collection(db, `sites/${SITE_ID}/wishes`)));

    let id;
    await testEnv.withSecurityRulesDisabled(async (c) => {
      const r = await addDoc(collection(c.firestore(), `sites/${SITE_ID}/wishes`), wish());
      id = r.id;
    });
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}/wishes/${id}`), { text:'改掉' }));
    await assertFails(deleteDoc(doc(db, `sites/${SITE_ID}/wishes/${id}`)));
  });

  it('祝福牆：夾帶額外欄位會被拒', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      addDoc(collection(db, `sites/${SITE_ID}/wishes`), wish({ isAdmin:true })));
  });

  it('祝福牆：內容超過 300 字會被拒', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      addDoc(collection(db, `sites/${SITE_ID}/wishes`), wish({ text:'祝'.repeat(301) })));
  });

  it('祝福牆：未發布的站台不可寫入', async () => {
    await seedSite(SITE_ID, { status:'draft' });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/wishes`), wish()));
  });

  it('祝福牆：站台關閉該頁面時不可寫入', async () => {
    await seedSite(SITE_ID, { pages: { wall:false, cake:true, draw:true, quiz:true } });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/wishes`), wish()));
  });

  it('甜點桌：欄位正確才可寫入', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const cake = { name:'王小明', icon:'🎀', cake:'草莓蛋糕', emoji:'🍰', img:'/x.png', time: Date.now() };
    await assertSucceeds(addDoc(collection(db, `sites/${SITE_ID}/cakes`), cake));
    await assertFails(
      addDoc(collection(db, `sites/${SITE_ID}/cakes`), { ...cake, evil:1 }));
  });

  it('抽卡收藏：只讀得到自己的卡', async () => {
    const card = {
      uid:'user-a', userName:'A', art:'/c.png', name:'卡片', rarity:'SSR', time: Date.now(),
    };
    await testEnv.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), `sites/${SITE_ID}/collected/card1`), card);
    });
    const a = testEnv.authenticatedContext('user-a').firestore();
    const b = testEnv.authenticatedContext('user-b').firestore();
    await assertSucceeds(getDoc(doc(a, `sites/${SITE_ID}/collected/card1`)));
    await assertFails(getDoc(doc(b, `sites/${SITE_ID}/collected/card1`)));
  });

  it('抽卡收藏：不能冒用別人的 uid', async () => {
    const a = testEnv.authenticatedContext('user-a').firestore();
    await assertFails(addDoc(collection(a, `sites/${SITE_ID}/collected`), {
      uid:'user-b', userName:'A', art:'/c.png', name:'卡', rarity:'N', time: Date.now(),
    }));
  });

  it('抽卡收藏：未登入不可寫入', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/collected`), {
      uid:'x', userName:'A', art:'/c.png', name:'卡', rarity:'N', time: Date.now(),
    }));
  });

  it('愛心計數：只能一次加一，不能亂設數字', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const ref = doc(db, `sites/${SITE_ID}/meta/hearts`);
    await assertSucceeds(setDoc(ref, { count: 1 }));
    await assertFails(setDoc(ref, { count: 9999 }));
    await assertSucceeds(setDoc(ref, { count: 2 }));
  });

  it('RSVP：帶 icon／tentative／meal 的多頁版表單可寫入', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(addDoc(collection(db, `sites/${SITE_ID}/rsvps`), {
      ...validRsvpPayload(), icon:'🎀', tentative:false, meal:'veg',
    }));
  });

  it('RSVP：tentative 不是 boolean 會被拒', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`), {
      ...validRsvpPayload(), tentative:'maybe',
    }));
  });
});

/* ============================================================
   RSVP 的新題目：關係、葷素分配、兒童座椅、喜帖、喜餅、備註
============================================================ */
describe('rsvps 的完整表單欄位', () => {
  /* js/rsvp-form.js 實際會送出的形狀 */
  function fullRsvp(overrides = {}) {
    return {
      ...validRsvpPayload(),
      icon: '✦',
      tentative: false,
      relation: 'groom',
      contactPhone: '0912345678',
      contactLine: 'guest-line',
      contactEmail: 'guest@example.com',
      mealMeat: 1,
      mealVeg: 1,
      childSeat: 1,
      cardType: 'paper',
      cardDelivery: 'mail',
      cardZip: '104',
      cardAddress: '台北市中山區南京東路一段 1 號',
      cardEmail: '',
      giftDelivery: 'pickup',
      giftZip: '',
      giftAddress: '',
      note: '會晚 20 分鐘到',
      ...overrides,
    };
  }

  it('完整填完的回覆寫得進去', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(addDoc(collection(db, `sites/${SITE_ID}/rsvps`), fullRsvp()));
  });

  it('舊版表單（只有核心欄位）仍然寫得進去', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(
      addDoc(collection(db, `sites/${SITE_ID}/rsvps`), validRsvpPayload()));
  });

  it('關係、喜帖、喜餅只收允許的值', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      fullRsvp({ relation: 'boss' })));
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      fullRsvp({ cardType: 'nft' })));
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      fullRsvp({ cardDelivery: 'drone' })));
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      fullRsvp({ giftDelivery: 'drone' })));
  });

  it('人數類欄位必須是 0–10 的整數', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      fullRsvp({ childSeat: 99 })));
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      fullRsvp({ mealVeg: -1 })));
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      fullRsvp({ mealMeat: '兩位' })));
  });

  it('地址與備註有長度上限', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      fullRsvp({ cardAddress: '路'.repeat(201) })));
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      fullRsvp({ giftZip: '1'.repeat(11) })));
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      fullRsvp({ note: '備'.repeat(301) })));
  });

  it('聯絡方式有長度上限', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      fullRsvp({ contactPhone: '0'.repeat(31) })));
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      fullRsvp({ contactEmail: `${'a'.repeat(115)}@example.com` })));
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      fullRsvp({ cardEmail: `${'a'.repeat(115)}@example.com` })));
  });

  it('夾帶白名單以外的欄位仍然整筆被拒', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      fullRsvp({ isAdmin: true })));
  });
});

/* ============================================================
   悄悄話信箱：只有站台 ownerEmails 名單內的帳號讀得到
============================================================ */
describe('letters 的擁有者權限', () => {
  const OWNER = 'couple@example.com';

  function letter(overrides = {}) {
    return { name:'王小明', icon:'💌', text:'偷偷跟你們說…', time: Date.now(), ...overrides };
  }

  async function seedLetter() {
    await testEnv.withSecurityRulesDisabled(async (c) => {
      await addDoc(collection(c.firestore(), `sites/${SITE_ID}/letters`), letter());
    });
  }

  beforeEach(async () => {
    await seedSite(SITE_ID, { ownerEmails: [OWNER] });
    await seedLetter();
  });

  it('賓客可以寫信', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(addDoc(collection(db, `sites/${SITE_ID}/letters`), letter()));
  });

  it('未登入的賓客讀不到信件', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(db, `sites/${SITE_ID}/letters`)));
  });

  it('登入但不在名單內的帳號讀不到信件', async () => {
    const db = testEnv
      .authenticatedContext('someone', { email:'stranger@example.com', email_verified: true })
      .firestore();
    await assertFails(getDocs(collection(db, `sites/${SITE_ID}/letters`)));
  });

  it('名單內但信箱未驗證，也讀不到', async () => {
    const db = testEnv
      .authenticatedContext('couple', { email: OWNER, email_verified: false })
      .firestore();
    await assertFails(getDocs(collection(db, `sites/${SITE_ID}/letters`)));
  });

  it('名單內且信箱已驗證，讀得到信件', async () => {
    const db = testEnv
      .authenticatedContext('couple', { email: OWNER, email_verified: true })
      .firestore();
    await assertSucceeds(getDocs(collection(db, `sites/${SITE_ID}/letters`)));
  });

  it('站台沒設定 ownerEmails 時，誰都讀不到', async () => {
    await seedSite(SITE_ID);
    const db = testEnv
      .authenticatedContext('couple', { email: OWNER, email_verified: true })
      .firestore();
    await assertFails(getDocs(collection(db, `sites/${SITE_ID}/letters`)));
  });

  it('別的站台的擁有者讀不到這個站台的信件', async () => {
    await seedSite('other-site', { ownerEmails: ['other@example.com'] });
    const db = testEnv
      .authenticatedContext('other', { email:'other@example.com', email_verified: true })
      .firestore();
    await assertFails(getDocs(collection(db, `sites/${SITE_ID}/letters`)));
  });

  it('擁有者也不能改或刪信件', async () => {
    let id;
    await testEnv.withSecurityRulesDisabled(async (c) => {
      const r = await addDoc(collection(c.firestore(), `sites/${SITE_ID}/letters`), letter());
      id = r.id;
    });
    const db = testEnv
      .authenticatedContext('couple', { email: OWNER, email_verified: true })
      .firestore();
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}/letters/${id}`), { text:'改掉' }));
    await assertFails(deleteDoc(doc(db, `sites/${SITE_ID}/letters/${id}`)));
  });

  it('信件數量是公開的，但只能一次加一', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const ref = doc(db, `sites/${SITE_ID}/meta/letterCount`);
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(setDoc(ref, { count: 1 }));
    await assertFails(setDoc(ref, { count: 500 }));
    await assertSucceeds(setDoc(ref, { count: 2 }));
  });
});

/* ============================================================
   桌次查詢：名單與桌次圖公開可讀，只有新人寫得進去
============================================================ */
describe('seating（桌次名單與桌次圖）', () => {
  const OWNER = 'couple@example.com';

  function ownerDb() {
    return testEnv
      .authenticatedContext('couple', { email: OWNER, email_verified: true })
      .firestore();
  }

  function seat(overrides = {}) {
    return { name:'王小明', table:'第 3 桌', note:'', time: Date.now(), ...overrides };
  }

  beforeEach(async () => {
    await seedSite(SITE_ID, { ownerEmails: [OWNER] });
  });

  it('賓客讀得到桌次名單（要能查自己的位子）', async () => {
    await testEnv.withSecurityRulesDisabled(async (c) => {
      await addDoc(collection(c.firestore(), `sites/${SITE_ID}/seating`), seat());
    });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDocs(collection(db, `sites/${SITE_ID}/seating`)));
  });

  it('賓客不能自己新增或竄改桌次', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/seating`), seat()));
  });

  it('新人可以新增、修改、刪除桌次', async () => {
    const db = ownerDb();
    const ref = doc(db, `sites/${SITE_ID}/seating/s1`);
    await assertSucceeds(setDoc(ref, seat()));
    await assertSucceeds(setDoc(ref, seat({ table:'主桌' })));
    await assertSucceeds(deleteDoc(ref));
  });

  it('夾帶額外欄位或缺少桌次的資料會被拒', async () => {
    const db = ownerDb();
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/seating/s2`),
      seat({ isAdmin: true })));
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/seating/s3`),
      seat({ table: '' })));
  });

  it('不在名單內的登入帳號寫不進去', async () => {
    const db = testEnv
      .authenticatedContext('nosy', { email:'nosy@example.com', email_verified: true })
      .firestore();
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/seating/s4`), seat()));
  });

  it('桌次圖只收 data URL，且有大小上限', async () => {
    const db = ownerDb();
    const okImg = { img:'data:image/jpeg;base64,AAAA', title:'一樓', order:1, time: Date.now() };
    await assertSucceeds(setDoc(doc(db, `sites/${SITE_ID}/seatingImages/i1`), okImg));
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/seatingImages/i2`),
      { ...okImg, img:'https://evil.example.com/x.jpg' }));
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/seatingImages/i3`),
      { ...okImg, img: `data:image/jpeg;base64,${'A'.repeat(960000)}` }));
  });
});

/* ============================================================
   排桌管理：整份草稿只有新人讀得寫得，賓客碰不到
============================================================ */
describe('seatingPlan（排桌草稿）', () => {
  const OWNER = 'couple@example.com';

  function ownerDb() {
    return testEnv
      .authenticatedContext('couple', { email: OWNER, email_verified: true })
      .firestore();
  }

  function planDoc(overrides = {}) {
    return {
      tables: [{ id:'tb1', no:1, name:'主桌', cap:10, type:'main', typeName:'', order:1 }],
      guests: [{ id:'g1', src:'manual', name:'王小明', code:'M01', count:2 }],
      assign: { g1: 'tb1' },
      savedAt: Date.now(),
      ...overrides,
    };
  }

  beforeEach(async () => {
    await seedSite(SITE_ID, { ownerEmails: [OWNER] });
  });

  it('新人可以建立、修改、刪除排桌草稿', async () => {
    const ref = doc(ownerDb(), `sites/${SITE_ID}/seatingPlan/draft`);
    await assertSucceeds(setDoc(ref, planDoc()));
    await assertSucceeds(setDoc(ref, planDoc({ syncedAt: Date.now() })));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(deleteDoc(ref));
  });

  it('賓客讀不到也寫不進去（名單上有姓名與備註）', async () => {
    await testEnv.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), `sites/${SITE_ID}/seatingPlan/draft`), planDoc());
    });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, `sites/${SITE_ID}/seatingPlan/draft`)));
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/seatingPlan/draft`), planDoc()));
  });

  it('夾帶白名單以外的欄位會被拒', async () => {
    await assertFails(setDoc(doc(ownerDb(), `sites/${SITE_ID}/seatingPlan/draft`),
      planDoc({ ownerEmails: ['evil@example.com'] })));
  });

  it('桌位最多 60 桌、賓客最多 600 位', async () => {
    const ref = doc(ownerDb(), `sites/${SITE_ID}/seatingPlan/draft`);
    await assertFails(setDoc(ref, planDoc({
      tables: Array.from({ length: 61 }, (_, i) => ({ id:`tb${i}`, no:i + 1, cap:10 })),
    })));
    await assertFails(setDoc(ref, planDoc({
      guests: Array.from({ length: 601 }, (_, i) => ({ id:`g${i}`, src:'manual', name:`賓客${i}` })),
    })));
  });

  it('型別不對（tables 不是陣列、assign 不是 map、savedAt 不是數字）會被拒', async () => {
    const ref = doc(ownerDb(), `sites/${SITE_ID}/seatingPlan/draft`);
    await assertFails(setDoc(ref, planDoc({ tables: '主桌' })));
    await assertFails(setDoc(ref, planDoc({ assign: ['tb1'] })));
    await assertFails(setDoc(ref, planDoc({ savedAt: '剛剛' })));
  });

  it('不在名單內的登入帳號讀不到也寫不進去', async () => {
    const db = testEnv
      .authenticatedContext('nosy', { email:'nosy@example.com', email_verified: true })
      .firestore();
    await assertFails(getDoc(doc(db, `sites/${SITE_ID}/seatingPlan/draft`)));
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/seatingPlan/draft`), planDoc()));
  });

  it('別的站台的新人碰不到這個站台的排桌草稿', async () => {
    await seedSite('other-site', { ownerEmails: ['other@example.com'] });
    const db = testEnv
      .authenticatedContext('other', { email:'other@example.com', email_verified: true })
      .firestore();
    await assertFails(getDoc(doc(db, `sites/${SITE_ID}/seatingPlan/draft`)));
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/seatingPlan/draft`), planDoc()));
  });
});

/* ============================================================
   電子祝福信：賓客領得到，但只有新人寫得出來
============================================================ */
describe('blessings（電子祝福信）', () => {
  const OWNER = 'couple@example.com';

  function ownerDb() {
    return testEnv
      .authenticatedContext('couple', { email: OWNER, email_verified: true })
      .firestore();
  }

  function blessing(overrides = {}) {
    return {
      terms: ['王小明', '小明'],
      title: '給小明的信',
      body: '謝謝你今天特地趕來',
      sign: '彥廷 & 佳蓉',
      isDefault: false,
      time: Date.now(),
      ...overrides,
    };
  }

  beforeEach(async () => {
    await seedSite(SITE_ID, { ownerEmails: [OWNER] });
  });

  it('賓客讀得到信（比對在前端做）', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDocs(collection(db, `sites/${SITE_ID}/blessings`)));
  });

  it('賓客不能自己寫信', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/blessings`), blessing()));
  });

  it('新人可以寫、改、刪信', async () => {
    const db = ownerDb();
    const ref = doc(db, `sites/${SITE_ID}/blessings/b1`);
    await assertSucceeds(setDoc(ref, blessing()));
    await assertSucceeds(setDoc(ref, blessing({ isDefault: true })));
    await assertSucceeds(deleteDoc(ref));
  });

  it('空內文或超長內文會被拒', async () => {
    const db = ownerDb();
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/blessings/b2`),
      blessing({ body: '' })));
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/blessings/b3`),
      blessing({ body: 'ㄅ'.repeat(2001) })));
  });
});

/* ============================================================
   Explore 自訂卡片
============================================================ */
describe('explore（首頁自訂卡片）', () => {
  const OWNER = 'couple@example.com';

  function ownerDb() {
    return testEnv
      .authenticatedContext('couple', { email: OWNER, email_verified: true })
      .firestore();
  }

  function card(overrides = {}) {
    return {
      title: '婚禮當天的接駁車',
      sub: '幾點在哪裡上車',
      kind: 'popup',
      url: '',
      body: '早上 10:30 在台北車站東三門集合',
      order: 1,
      time: Date.now(),
      ...overrides,
    };
  }

  beforeEach(async () => {
    await seedSite(SITE_ID, { ownerEmails: [OWNER] });
  });

  it('賓客讀得到卡片，但不能新增', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDocs(collection(db, `sites/${SITE_ID}/explore`)));
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/explore`), card()));
  });

  it('新人可以新增連結型與彈窗型的卡片', async () => {
    const db = ownerDb();
    await assertSucceeds(setDoc(doc(db, `sites/${SITE_ID}/explore/e1`), card()));
    await assertSucceeds(setDoc(doc(db, `sites/${SITE_ID}/explore/e2`),
      card({ kind:'link', url:'https://example.com/shuttle', body:'' })));
  });

  it('連結型卡片擋掉非 http(s) 的網址', async () => {
    const db = ownerDb();
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/explore/e3`),
      card({ kind:'link', url:'javascript:alert(1)', body:'' })));
  });

  it('沒有標題或用了未知的 kind 會被拒', async () => {
    const db = ownerDb();
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/explore/e4`), card({ title:'' })));
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/explore/e5`), card({ kind:'iframe' })));
  });
});

/* ============================================================
   囍卡卡池：新人在後台裁切上傳，賓客只讀得到
============================================================ */
describe('cards（囍卡卡池）', () => {
  const OWNER = 'couple@example.com';

  function ownerDb() {
    return testEnv
      .authenticatedContext('couple', { email: OWNER, email_verified: true })
      .firestore();
  }

  function card(overrides = {}) {
    return {
      img: 'data:image/jpeg;base64,AAAA',
      name: '海邊的我們',
      rarity: 'SSR',
      desc: '那天風很大',
      order: 1,
      time: Date.now(),
      ...overrides,
    };
  }

  beforeEach(async () => {
    await seedSite(SITE_ID, { ownerEmails: [OWNER] });
  });

  it('賓客讀得到卡池，但不能自己上傳', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDocs(collection(db, `sites/${SITE_ID}/cards`)));
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/cards`), card()));
  });

  it('新人可以新增、修改、刪除囍卡', async () => {
    const db = ownerDb();
    const ref = doc(db, `sites/${SITE_ID}/cards/c1`);
    await assertSucceeds(setDoc(ref, card()));
    await assertSucceeds(setDoc(ref, card({ rarity: 'N', name: '改個名字' })));
    await assertSucceeds(deleteDoc(ref));
  });

  it('只收 data URL、擋掉外部網址與過大的圖', async () => {
    const db = ownerDb();
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/cards/c2`),
      card({ img: 'https://evil.example.com/x.jpg' })));
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/cards/c3`),
      card({ img: `data:image/jpeg;base64,${'A'.repeat(960000)}` })));
  });

  it('未知的等級會被拒', async () => {
    const db = ownerDb();
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/cards/c4`), card({ rarity: 'UR' })));
  });

  it('收藏可以只記 cardId（卡圖太長，塞不進 art）', async () => {
    const db = testEnv.authenticatedContext('guest').firestore();
    await assertSucceeds(addDoc(collection(db, `sites/${SITE_ID}/collected`), {
      uid: 'guest', userName: '王小明', art: '', name: '海邊的我們',
      rarity: 'SSR', desc: '', cardId: 'c1', time: Date.now(),
    }));
  });
});

/* ============================================================
   展覽：戀愛時光的展品與章節
============================================================ */
describe('exhibits（展品與章節）', () => {
  const OWNER = 'couple@example.com';

  function ownerDb() {
    return testEnv
      .authenticatedContext('couple', { email: OWNER, email_verified: true })
      .firestore();
  }

  function exhibit(overrides = {}) {
    return {
      kind: 'photo',
      img: 'data:image/jpeg;base64,AAAA',
      title: '第一次一起旅行',
      sub: '現在・31 歲',
      desc: '那天下著大雨',
      year: '2021',
      act: '第一幕',
      order: 3,
      time: Date.now(),
      ...overrides,
    };
  }

  beforeEach(async () => {
    await seedSite(SITE_ID, { ownerEmails: [OWNER] });
  });

  it('賓客讀得到展品，但不能自己新增', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDocs(collection(db, `sites/${SITE_ID}/exhibits`)));
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/exhibits`), exhibit()));
  });

  it('新人可以新增展品與章節卡', async () => {
    const db = ownerDb();
    await assertSucceeds(setDoc(doc(db, `sites/${SITE_ID}/exhibits/x1`), exhibit()));
    await assertSucceeds(setDoc(doc(db, `sites/${SITE_ID}/exhibits/x2`),
      exhibit({ kind:'act', img:'', desc:'', year:'', act:'',
                title:'第一幕', sub:'我們的相遇', order: 2 })));
    await assertSucceeds(deleteDoc(doc(db, `sites/${SITE_ID}/exhibits/x1`)));
  });

  it('沒有照片的展品也收得下（可以先寫文字再補圖）', async () => {
    const db = ownerDb();
    await assertSucceeds(setDoc(doc(db, `sites/${SITE_ID}/exhibits/x3`), exhibit({ img: '' })));
  });

  it('外部網址、未知型態、超長描述會被拒', async () => {
    const db = ownerDb();
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/exhibits/x4`),
      exhibit({ img: 'https://evil.example.com/x.jpg' })));
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/exhibits/x5`),
      exhibit({ kind: 'video' })));
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/exhibits/x6`),
      exhibit({ desc: '字'.repeat(501) })));
  });
});

/* ============================================================
   測驗：題目由新人出，作答紀錄由賓客送
============================================================ */
describe('quiz（測驗的題目與作答）', () => {
  const OWNER = 'couple@example.com';

  function ownerDb(email = OWNER) {
    return testEnv
      .authenticatedContext('couple', { email, email_verified: true })
      .firestore();
  }

  function question(overrides = {}) {
    return {
      type: 'single',
      q: '我們是怎麼認識的？',
      opts: ['朋友介紹', '同學或同事', '在網路上聊起來', '旅行的路上'],
      answer: [0],
      order: 1,
      time: Date.now(),
      ...overrides,
    };
  }

  function vote(overrides = {}) {
    return { picks: { q1: [0], q2: [1, 3] }, score: 1, total: 2, time: Date.now(), ...overrides };
  }

  beforeEach(async () => {
    await seedSite(SITE_ID, { ownerEmails: [OWNER] });
  });

  it('賓客讀得到題目，但不能自己出題', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDocs(collection(db, `sites/${SITE_ID}/quiz`)));
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/quiz`), question()));
  });

  it('新人可以新增、修改、刪除題目', async () => {
    const db = ownerDb();
    const ref = doc(db, `sites/${SITE_ID}/quiz/q1`);
    await assertSucceeds(setDoc(ref, question()));
    await assertSucceeds(setDoc(ref, question({ q: '我們在哪裡認識的？', answer: [2] })));
    await assertSucceeds(deleteDoc(ref));
  });

  it('複選題可以有多個正確答案，單選題只能有一個', async () => {
    const db = ownerDb();
    await assertSucceeds(setDoc(doc(db, `sites/${SITE_ID}/quiz/q2`),
      question({ type: 'multi', answer: [0, 3] })));
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/quiz/q3`),
      question({ type: 'single', answer: [0, 3] })));
  });

  it('選項不是四個、沒有題目、沒有答案都會被拒', async () => {
    const db = ownerDb();
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/quiz/q4`),
      question({ opts: ['只有兩個', '選項'] })));
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/quiz/q5`), question({ q: '' })));
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/quiz/q6`), question({ answer: [] })));
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/quiz/q7`), question({ type: 'open' })));
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/quiz/q8`),
      question({ q: '字'.repeat(61) })));
  });

  it('不在名單內的登入帳號出不了題', async () => {
    await assertFails(setDoc(doc(ownerDb('nosy@example.com'), `sites/${SITE_ID}/quiz/q9`),
      question()));
  });

  it('賓客送得出作答，票數公開可讀', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(addDoc(collection(db, `sites/${SITE_ID}/quizVotes`), vote()));
    await assertSucceeds(getDocs(collection(db, `sites/${SITE_ID}/quizVotes`)));
  });

  it('作答夾帶額外欄位、或分數不是數字會被拒', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/quizVotes`),
      vote({ name: '王小明' })));
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/quizVotes`),
      vote({ score: '滿分' })));
  });

  it('站台關掉測驗頁時，作答寫不進去', async () => {
    await seedSite(SITE_ID, { ownerEmails: [OWNER], pages: { quiz: false, wall: true } });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/quizVotes`), vote()));
  });

  it('作答不能被改；只有新人清得掉', async () => {
    let id;
    await testEnv.withSecurityRulesDisabled(async (c) => {
      const ref = await addDoc(collection(c.firestore(), `sites/${SITE_ID}/quizVotes`), vote());
      id = ref.id;
    });
    const guest = testEnv.unauthenticatedContext().firestore();
    await assertFails(updateDoc(doc(guest, `sites/${SITE_ID}/quizVotes/${id}`), { score: 99 }));
    await assertFails(deleteDoc(doc(guest, `sites/${SITE_ID}/quizVotes/${id}`)));
    await assertSucceeds(deleteDoc(doc(ownerDb(), `sites/${SITE_ID}/quizVotes/${id}`)));
  });
});

/* ============================================================
   大廳文案：新人改得動文字，但改不動規則自己要用的欄位
============================================================ */
describe('sites 的大廳文案更新', () => {
  const OWNER = 'couple@example.com';

  function ownerDb(email = OWNER) {
    return testEnv
      .authenticatedContext('couple', { email, email_verified: true })
      .firestore();
  }

  beforeEach(async () => {
    await seedSite(SITE_ID, { ownerEmails: [OWNER] });
  });

  it('新人可以改地點、交通、dress code、禮金說明與流程', async () => {
    const db = ownerDb();
    await assertSucceeds(updateDoc(doc(db, `sites/${SITE_ID}`), {
      coupleTitle: '彥廷與佳蓉',
      venueName: '晶華酒店・三樓宴會廳',
      venueAddress: '台北市中山區中山北路二段 39 巷 3 號',
      venueMapUrl: 'https://maps.app.goo.gl/abc',
      transportPublic: '捷運中山站 2 號出口步行 5 分鐘',
      transportParking: '飯店 B2 停車場，用餐折抵 3 小時',
      dressCode: '溫柔大地色系',
      giftNote: '您的到來就是最好的禮物',
      story: '第一次見面是在朋友的聚會上',
      schedule: [{ time: '11:30', title: '入場迎賓', desc: '簽到、拍照' }],
      hashtags: ['#我們結婚了'],
      updatedAt: Timestamp.now(),
    }));
  });

  it('新人可以開關出席回覆的題目與區塊', async () => {
    const db = ownerDb();
    await assertSucceeds(updateDoc(doc(db, `sites/${SITE_ID}`), {
      rsvpAskCard: false,
      rsvpAskGift: true,
      rsvpAskMessage: false,
      rsvpShowStory: true,
      rsvpShowGallery: false,
      rsvpContactMethods: ['phone', 'email'],
      updatedAt: Timestamp.now(),
    }));
    /* 只認 boolean 與 list，型別不對就整筆擋下 */
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), { rsvpAskCard: 'off' }));
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), {
      rsvpContactMethods: 'phone',
    }));
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), {
      rsvpContactMethods: ['a', 'b', 'c', 'd'],
    }));
  });

  it('題目開關放行，但出席回覆的開關與截止時間仍然改不動', async () => {
    const db = ownerDb();
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), {
      rsvpAskCard: false, rsvpEnabled: false,
    }));
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), {
      rsvpAskCard: false, rsvpDeadline: Timestamp.fromDate(new Date('2099-01-01')),
    }));       
  }); 

  it('婚禮 hashtag 最多 3 個', async () => {
    const db = ownerDb();
    await assertSucceeds(updateDoc(doc(db, `sites/${SITE_ID}`), {
      hashtags: ['#a', '#b', '#c'],
    }));
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), {
      hashtags: ['#a', '#b', '#c', '#d'],
    }));
  });


  it('交通資訊可以各配一張圖，型別跟大小要合法', async () => {
    const db = ownerDb();
    const tinyImg = 'data:image/jpeg;base64,' + 'a'.repeat(100);
    await assertSucceeds(updateDoc(doc(db, `sites/${SITE_ID}`), {
      transportPublicImg: tinyImg,
      transportParkingImg: tinyImg,
    }));
    /* 移除圖片：空字串合法 */
    await assertSucceeds(updateDoc(doc(db, `sites/${SITE_ID}`), {
      transportPublicImg: '',
    }));
    /* 不是 data:image/... 開頭的一律擋下 */
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), {
      transportPublicImg: 'https://evil.example.com/x.jpg',
    }));
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), {
      transportParkingImg: 'data:image/jpeg;base64,' + 'a'.repeat(300001),
    }));
  });

  it('新人可以開關桌次搜尋', async () => {
    const db = ownerDb();
    await assertSucceeds(updateDoc(doc(db, `sites/${SITE_ID}`), {
      seatingSearchEnabled: false,
      updatedAt: Timestamp.now(),
    }));
    /* 只認 boolean，塞字串進去就當作無效 */
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), {
      seatingSearchEnabled: 'off',
    }));
  });

  it('新人可以開關桌次功能', async () => {
    const db = ownerDb();
    await assertSucceeds(updateDoc(doc(db, `sites/${SITE_ID}`), {
      seatingFeatureEnabled: false,
      updatedAt: Timestamp.now(),
    }));
    /* 只認 boolean，塞字串進去就當作無效 */
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), {
      seatingFeatureEnabled: 'off',
    }));
  });

  it('賓客改不動任何欄位', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), { dressCode: '隨便穿' }));
  });

  it('不在 ownerEmails 名單內的帳號改不動', async () => {
    await assertFails(updateDoc(doc(ownerDb('nosy@example.com'), `sites/${SITE_ID}`),
      { dressCode: '隨便穿' }));
  });

  it('白名單以外的欄位一律擋下（狀態、名單、頁面開關、出席截止）', async () => {
    const db = ownerDb();
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), { status: 'archived' }));
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), {
      ownerEmails: [OWNER, 'attacker@example.com'],
    }));
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), { pages: { wall: false } }));
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), {
      rsvpDeadline: Timestamp.fromDate(new Date('2099-01-01')),
    }));
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), { slug: 'someone-else' }));
    /* 合法欄位夾帶一個不合法的，也整筆擋下 */
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), {
      dressCode: '正常的文案', status: 'archived',
    }));
  });

  it('文案太長或地圖連結不是 http(s) 會被拒', async () => {
    const db = ownerDb();
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), { dressCode: '衣'.repeat(501) }));
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), {
      venueMapUrl: 'javascript:alert(1)',
    }));
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), { story: '字'.repeat(2001) }));
    /* 大廳上的稱呼只給 20 個字 */
    await assertSucceeds(updateDoc(doc(db, `sites/${SITE_ID}`), { coupleTitle: '字'.repeat(20) }));
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), { coupleTitle: '字'.repeat(21) }));
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), {
      transportPublic: '車'.repeat(501),
    }));
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), {
      transportParking: '車'.repeat(501),
    }));
  });

  it('新人可以改婚禮開始時間，但要是合法的 Timestamp', async () => {
    const db = ownerDb();
    await assertSucceeds(updateDoc(doc(db, `sites/${SITE_ID}`), {
      eventDate: Timestamp.fromDate(new Date('2026-03-15T05:30:00Z')),
    }));
    /* 塞字串／數字進去（不是 Timestamp）要被擋下 */
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), {
      eventDate: '2026-03-15T05:30:00Z',
    }));
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), {
      eventDate: Date.now(),
    }));
  });

  it('新人仍然不能刪掉整個站台', async () => {
    await assertFails(deleteDoc(doc(ownerDb(), `sites/${SITE_ID}`)));
  });
});

/* ============================================================
   出席回覆：賓客寫得進去、讀不出來；只有新人讀得到
============================================================ */
describe('rsvps 的擁有者權限', () => {
  const OWNER = 'couple@example.com';

  function ownerDb(email = OWNER) {
    return testEnv
      .authenticatedContext('couple', { email, email_verified: true })
      .firestore();
  }

  async function seedRsvp() {
    await testEnv.withSecurityRulesDisabled(async (c) => {
      await addDoc(
        collection(c.firestore(), `sites/${SITE_ID}/rsvps`),
        validRsvpPayload({ createdAt: Timestamp.now() })
      );
    });
  }

  beforeEach(async () => {
    await seedSite(SITE_ID, { ownerEmails: [OWNER] });
    await seedRsvp();
  });

  it('新人讀得到自己站台的出席回覆', async () => {
    await assertSucceeds(getDocs(collection(ownerDb(), `sites/${SITE_ID}/rsvps`)));
  });

  it('賓客（匿名）仍然讀不到出席回覆', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(db, `sites/${SITE_ID}/rsvps`)));
  });

  it('不在 ownerEmails 名單內的登入帳號讀不到', async () => {
    await assertFails(getDocs(collection(ownerDb('nosy@example.com'), `sites/${SITE_ID}/rsvps`)));
  });

  it('信箱沒有驗證過的帳號讀不到', async () => {
    const db = testEnv
      .authenticatedContext('fake', { email: OWNER, email_verified: false })
      .firestore();
    await assertFails(getDocs(collection(db, `sites/${SITE_ID}/rsvps`)));
  });

  it('別的站台的新人讀不到這個站台的回覆', async () => {
    await seedSite('other-site', { ownerEmails: ['other@example.com'] });
    const db = testEnv
      .authenticatedContext('other', { email:'other@example.com', email_verified: true })
      .firestore();
    await assertFails(getDocs(collection(db, `sites/${SITE_ID}/rsvps`)));
  });

  /* 新人改不動回覆的內容，但刪得掉整筆（重複送出的那幾份）。
     「改不動」和「刪得掉」不衝突：留下來的每一筆都還是賓客當初寫的原文。 */
  it('新人改不動回覆的內容', async () => {
    let rsvpId;
    await testEnv.withSecurityRulesDisabled(async (c) => {
      const ref = await addDoc(
        collection(c.firestore(), `sites/${SITE_ID}/rsvps`),
        validRsvpPayload({ createdAt: Timestamp.now() })
      );
      rsvpId = ref.id;
    });
    const db = ownerDb();
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}/rsvps/${rsvpId}`), { attending: false }));
    await assertSucceeds(deleteDoc(doc(db, `sites/${SITE_ID}/rsvps/${rsvpId}`)));
  });

  it('站台沒有設定 ownerEmails 時，誰都讀不到', async () => {
    await seedSite(SITE_ID);      // 不帶 ownerEmails
    await assertFails(getDocs(collection(ownerDb(), `sites/${SITE_ID}/rsvps`)));
  });
});


/* ============================================================
   賓客標籤
   ------------------------------------------------------------
   標籤庫在站台文件（新人自己維護），掛在誰身上在 rsvpTags，
   總開關 guestTagsEnabled 只能由我們改。
============================================================ */
describe('賓客標籤', () => {
  const OWNER = 'couple@example.com';
  const ownerDb = () => testEnv
    .authenticatedContext('couple', { email: OWNER, email_verified: true })
    .firestore();

  beforeEach(async () => {
    await seedSite(SITE_ID, {
      ownerEmails: [OWNER],
      guestTagsEnabled: true,
      guestTags: [{ id:'t1', name:'大學同學', onForm:true }],
    });
  });

  it('新人改得動標籤庫', async () => {
    await assertSucceeds(updateDoc(doc(ownerDb(), `sites/${SITE_ID}`), {
      guestTags: [
        { id:'t1', name:'大學同學', onForm:true },
        { id:'t2', name:'VIP', onForm:false },
      ],
    }));
  });

  it('標籤庫最多 30 個', async () => {
    const many = Array.from({ length: 31 }, (_, i) => ({ id:`t${i}`, name:`標籤${i}`, onForm:false }));
    await assertFails(updateDoc(doc(ownerDb(), `sites/${SITE_ID}`), { guestTags: many }));
  });

  it('新人改不動總開關 guestTagsEnabled', async () => {
    await assertFails(updateDoc(doc(ownerDb(), `sites/${SITE_ID}`), { guestTagsEnabled: false }));
  });

  it('開了功能時，賓客可以在回覆裡帶一個標籤', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      validRsvpPayload({ tag: 't1' })));
  });

  it('沒開功能的站台，帶標籤的回覆會被拒（空字串仍然可以）', async () => {
    await seedSite(SITE_ID, { ownerEmails: [OWNER] });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      validRsvpPayload({ tag: 't1' })));
    await assertSucceeds(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      validRsvpPayload({ tag: '' })));
  });

  it('新人讀寫得了 rsvpTags，賓客讀不到也寫不進去', async () => {
    const owner = ownerDb();
    await assertSucceeds(setDoc(doc(owner, `sites/${SITE_ID}/rsvpTags/r1`),
      { tags: ['t1'], updatedAt: Date.now() }));
    await assertSucceeds(getDocs(collection(owner, `sites/${SITE_ID}/rsvpTags`)));
    await assertSucceeds(deleteDoc(doc(owner, `sites/${SITE_ID}/rsvpTags/r1`)));

    const guest = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(guest, `sites/${SITE_ID}/rsvpTags`)));
    await assertFails(setDoc(doc(guest, `sites/${SITE_ID}/rsvpTags/r1`),
      { tags: ['t1'], updatedAt: Date.now() }));
  });

  it('rsvpTags 只收 tags 與 updatedAt，且最多 20 個標籤', async () => {
    const owner = ownerDb();
    await assertFails(setDoc(doc(owner, `sites/${SITE_ID}/rsvpTags/r2`),
      { tags: ['t1'], updatedAt: Date.now(), table: '主桌' }));
    await assertFails(setDoc(doc(owner, `sites/${SITE_ID}/rsvpTags/r2`),
      { tags: Array.from({ length: 21 }, (_, i) => `t${i}`), updatedAt: Date.now() }));
    await assertFails(setDoc(doc(owner, `sites/${SITE_ID}/rsvpTags/r2`),
      { tags: 't1', updatedAt: Date.now() }));
  });

  it('別的站台的新人碰不到這個站台的 rsvpTags', async () => {
    await seedSite('other-site', { ownerEmails: ['other@example.com'] });
    const db = testEnv
      .authenticatedContext('other', { email:'other@example.com', email_verified: true })
      .firestore();
    await assertFails(getDocs(collection(db, `sites/${SITE_ID}/rsvpTags`)));
    await assertFails(setDoc(doc(db, `sites/${SITE_ID}/rsvpTags/r3`),
      { tags: ['t1'], updatedAt: Date.now() }));
  });
});

/* ============================================================
   多活動（sites.events ＋ rsvps.events）
   ------------------------------------------------------------
   一場婚禮多個活動（文訂／迎娶／證婚／婚宴／派對），
   每個活動有自己的日期、地點與「要不要請賓客回覆」。

   規則在這一組只做兩件事，其餘（每一欄的長度、值域）在後台送出前切好：
     1. events 是 list／map，而且筆數不超過 10
     2. 頂層欄位的語意沒有變 —— 沒有 events 的回覆仍然照樣收得下

   總開關 multiEventEnabled 和 guestTagsEnabled 一樣只能由我們改。
============================================================ */
describe('多活動', () => {
  const OWNER = 'couple@example.com';
  const ownerDb = () => testEnv
    .authenticatedContext('couple', { email: OWNER, email_verified: true })
    .firestore();

  /* 證婚 ＋ 婚宴 ＋ 派對：報告裡的 Case 4 */
  const THREE_EVENTS = [
    { id:'ev_ceremony', type:'ceremony', name:'證婚', nameEn:'CEREMONY',
      date:'2026-03-15', startTime:'14:00', endTime:'',
      venueName:'台北真理堂', address:'台北市大安區新生南路三段 86 號', mapUrl:'',
      desc:'', requiresRsvp:true,
      askCount:true, askMeal:false, askChildSeat:false, askDiet:false, questions:[] },
    { id:'ev_reception', type:'reception', name:'婚宴', nameEn:'WEDDING RECEPTION',
      date:'2026-03-15', startTime:'18:00', endTime:'21:00',
      venueName:'晶華酒店 三樓宴會廳', address:'台北市中山區', mapUrl:'',
      desc:'', requiresRsvp:true,
      askCount:true, askMeal:true, askChildSeat:true, askDiet:true, questions:[] },
    { id:'ev_afterparty', type:'afterparty', name:'派對', nameEn:'AFTER PARTY',
      date:'2026-03-15', startTime:'21:30', endTime:'',
      venueName:'某某 Bar', address:'台北市信義區', mapUrl:'',
      desc:'', requiresRsvp:true,
      askCount:true, askMeal:false, askChildSeat:false, askDiet:false,
      /* opts 是「map 的陣列」而不是「陣列的陣列」——
         Firestore 不接受巢狀陣列（和 quizVotes.picks 是同一個限制），
         而且存 id 不是文字，新人日後改選項的字，已送出的作答還對得回來。 */
      questions:[{ id:'q_shuttle', kind:'choice', label:'需要接駁車嗎？',
                   opts:[{ id:'yes', label:'需要' },
                         { id:'no',  label:'不需要' }] }] },
  ];

  beforeEach(async () => {
    await seedSite(SITE_ID, { ownerEmails: [OWNER], multiEventEnabled: true });
  });

  /* ---------- 站台文件的 events ---------- */

  it('新人存得進活動清單', async () => {
    await assertSucceeds(updateDoc(doc(ownerDb(), `sites/${SITE_ID}`), {
      events: THREE_EVENTS,
      updatedAt: Timestamp.now(),
    }));
  });

  it('活動清單最多 10 個', async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({
      id:`ev${i}`, type:'custom', name:`活動${i}`, date:'2026-03-15',
      requiresRsvp:false,
    }));
    await assertFails(updateDoc(doc(ownerDb(), `sites/${SITE_ID}`), { events: many }));
  });

  it('events 不是 list 就整筆擋下', async () => {
    await assertFails(updateDoc(doc(ownerDb(), `sites/${SITE_ID}`), {
      events: { ev1: { name: '婚宴' } },
    }));
    await assertFails(updateDoc(doc(ownerDb(), `sites/${SITE_ID}`), { events: '婚宴' }));
  });

  it('清空活動清單是允許的（退回單一活動）', async () => {
    await assertSucceeds(updateDoc(doc(ownerDb(), `sites/${SITE_ID}`), { events: [] }));
  });

  /* 這一條是踩過的坑：Firestore **不接受巢狀陣列**，而且是 SDK 在送出前
     就同步丟例外，根本走不到規則（所以不能用 assertFails —— 那是在等
     規則回 permission-denied）。自訂題目的選項因此一定是「map 的陣列」，
     不能寫成 [['yes','需要'], ...]。
     同一個限制在 quizVotes.picks 也踩過（見 common.js 的 addQuizVote）。
     留一個測試釘住，日後不會有人改回去。 */
  it('活動裡不能出現巢狀陣列（自訂題目的選項只能是 map 的陣列）', () => {
    const withNestedArray = {
      events: [{
        id:'ev_afterparty', type:'afterparty', name:'派對', date:'2026-03-15',
        requiresRsvp:true,
        questions:[{ id:'q_shuttle', kind:'choice', label:'需要接駁車嗎？',
                     opts:[['yes','需要'], ['no','不需要']] }],
      }],
    };
    expect(() => updateDoc(doc(ownerDb(), `sites/${SITE_ID}`), withNestedArray))
      .toThrow(/Nested arrays are not supported/);
  });

  it('新人改不動總開關 multiEventEnabled', async () => {
    await assertFails(updateDoc(doc(ownerDb(), `sites/${SITE_ID}`), {
      multiEventEnabled: false,
    }));
  });

  it('不是這個站台的新人存不進活動清單', async () => {
    const db = testEnv
      .authenticatedContext('other', { email:'other@example.com', email_verified: true })
      .firestore();
    await assertFails(updateDoc(doc(db, `sites/${SITE_ID}`), { events: THREE_EVENTS }));
  });

  /* ---------- 回覆裡的 events ---------- */

  /* 賓客 C：不參加證婚、參加婚宴 2 位、參加派對 2 位。
     頂層欄位講的是主要活動（婚宴），和 events.ev_reception 是鏡像的。 */
  const multiRsvp = (overrides = {}) => validRsvpPayload({
    primaryEventId: 'ev_reception',
    events: {
      ev_ceremony:   { going:false, count:0, veg:0, note:'', answers:{} },
      ev_reception:  { going:true,  count:2, veg:1, note:'', answers:{} },
      ev_afterparty: { going:true,  count:2, veg:0, note:'',
                       answers:{ q_shuttle:'yes' } },
    },
    mealMeat: 1,
    mealVeg: 1,
    ...overrides,
  });

  it('賓客送得出多活動的回覆', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(addDoc(collection(db, `sites/${SITE_ID}/rsvps`), multiRsvp()));
  });

  it('events 最多 10 個活動', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const many = {};
    for (let i = 0; i < 11; i++) {
      many[`ev${i}`] = { going:true, count:1, veg:0, note:'', answers:{} };
    }
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      multiRsvp({ events: many })));
  });

  it('events 不是 map 就整筆擋下', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      multiRsvp({ events: [{ eventId:'ev_reception', going:true }] })));
  });

  it('primaryEventId 太長就整筆擋下', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      multiRsvp({ primaryEventId: 'e'.repeat(25) })));
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      multiRsvp({ primaryEventId: 123 })));
  });

  /* ---------- 相容性：這是整個改版的地基，一定要有測試守著 ---------- */

  it('沒有 events 的回覆照樣收得下（既有站台不受影響）', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      validRsvpPayload()));
  });

  it('沒開多活動的站台，帶 events 的回覆一樣收得下', async () => {
    /* events 不是規則的判斷依據（和 tag 不一樣）——
       總開關只決定後台看不看得到那個分頁，不決定資料收不收。
       這樣新人把多活動關掉時，已經送出的回覆不會突然變成不合法。 */
    await seedSite(SITE_ID, { ownerEmails: [OWNER] });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(addDoc(collection(db, `sites/${SITE_ID}/rsvps`), multiRsvp()));
  });

  it('多活動的回覆仍然改不動，只有新人刪得掉', async () => {
    let id;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const ref = await addDoc(
        collection(context.firestore(), `sites/${SITE_ID}/rsvps`),
        multiRsvp({ createdAt: Timestamp.now() })
      );
      id = ref.id;
    });
    const guest = testEnv.unauthenticatedContext().firestore();
    await assertFails(updateDoc(doc(guest, `sites/${SITE_ID}/rsvps/${id}`), {
      events: { ev_reception: { going:false, count:0, veg:0, note:'', answers:{} } },
    }));
    await assertFails(updateDoc(doc(ownerDb(), `sites/${SITE_ID}/rsvps/${id}`), {
      events: {},
    }));
    await assertSucceeds(deleteDoc(doc(ownerDb(), `sites/${SITE_ID}/rsvps/${id}`)));
  });

  it('夾帶未知欄位仍然被拒（白名單沒有因為多活動而變鬆）', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      multiRsvp({ eventResponses: [] })));
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`),
      multiRsvp({ isAdmin: true })));
  });

  it('多活動不會繞過 rsvpEnabled 與 rsvpDeadline', async () => {
    await seedSite(SITE_ID, { ownerEmails: [OWNER], multiEventEnabled: true,
      rsvpEnabled: false });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`), multiRsvp()));

    await seedSite(SITE_ID, { ownerEmails: [OWNER], multiEventEnabled: true,
      rsvpDeadline: Timestamp.fromDate(new Date(Date.now() - 24 * 3600 * 1000)) });
    await assertFails(addDoc(collection(db, `sites/${SITE_ID}/rsvps`), multiRsvp()));
  });
});

/* ============================================================
   收禮小幫手（butlers/{bookId}）
   ------------------------------------------------------------
   這一組規則的重點只有兩件事：
     1. get 全開、list 必須關 —— 整份保護就是「走得到這個路徑」，
        能列出集合的話那道門就白做了
     2. 拿著連結的親友寫得進收禮紀錄，但只限這一本、
        而且新人一停用就寫不進去
============================================================ */
describe('butlers/{bookId}（收禮小幫手）', () => {
  const OWNER = 'couple@example.com';
  const BOOK = 'a'.repeat(64);          /* 正式環境是 PBKDF2 算出來的 hex */

  const ownerDb = () => testEnv
    .authenticatedContext('couple', { email: OWNER, email_verified: true })
    .firestore();

  function bookPayload(overrides = {}) {
    return {
      siteId: SITE_ID,
      slug: 'chen-lin-0315',
      couple: '陳彥廷 & 林佳蓉',
      label: '收禮台',
      guests: [{ id: 'g1', code: 'A01', name: '王小明', table: '01', count: 2, cat: '', note: '' }],
      revoked: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    };
  }

  function entryPayload(overrides = {}) {
    return {
      guestId: 'g1',
      name: '王小明',
      code: 'A01',
      table: '01',
      amount: 3600,
      gift: true,
      boxes: 2,
      people: 2,
      note: '',
      by: '阿明',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    };
  }

  async function seedBook(overrides = {}) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `butlers/${BOOK}`), bookPayload(overrides));
    });
  }

  beforeEach(async () => {
    await seedSite(SITE_ID, {
      ownerEmails: [OWNER],
      pages: { butler: true, rsvp: true },
    });
  });

  it('知道 bookId 就讀得到收禮簿（通行碼算對了才走得到這個路徑）', async () => {
    await seedBook();
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, `butlers/${BOOK}`)));
  });

  it('不准列出整個 butlers 集合', async () => {
    await seedBook();
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(db, 'butlers')));
  });

  it('只有新人建得了收禮簿，未登入的人不行', async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anon, `butlers/${BOOK}`), bookPayload()));
    await assertSucceeds(setDoc(doc(ownerDb(), `butlers/${BOOK}`), bookPayload()));
  });

  it('別的站台的新人建不了掛在這個站台底下的收禮簿', async () => {
    await seedSite('other-site', { ownerEmails: ['other@example.com'] });
    const db = testEnv
      .authenticatedContext('other', { email: 'other@example.com', email_verified: true })
      .firestore();
    await assertFails(setDoc(doc(db, `butlers/${BOOK}`), bookPayload()));
  });

  it('賓客名單最多 600 位', async () => {
    const guests = Array.from({ length: 601 }, (_, i) => ({ id: `g${i}`, name: `賓客${i}` }));
    await assertFails(setDoc(doc(ownerDb(), `butlers/${BOOK}`), bookPayload({ guests })));
  });

  it('拿著連結的親友記得了收禮，也改得動、刪得掉', async () => {
    await seedBook();
    const db = testEnv.unauthenticatedContext().firestore();
    const ref = await addDoc(collection(db, `butlers/${BOOK}/entries`), entryPayload());
    await assertSucceeds(getDocs(collection(db, `butlers/${BOOK}/entries`)));
    await assertSucceeds(updateDoc(doc(db, `butlers/${BOOK}/entries/${ref.id}`),
      { ...entryPayload(), amount: 6000 }));
    await assertSucceeds(deleteDoc(doc(db, `butlers/${BOOK}/entries/${ref.id}`)));
  });

  it('金額必須是不小於 0 的整數，盒數與人數有上限', async () => {
    await seedBook();
    const db = testEnv.unauthenticatedContext().firestore();
    const col = collection(db, `butlers/${BOOK}/entries`);
    await assertFails(addDoc(col, entryPayload({ amount: -100 })));
    await assertFails(addDoc(col, entryPayload({ amount: 1200.5 })));
    await assertFails(addDoc(col, entryPayload({ amount: '3600' })));
    await assertFails(addDoc(col, entryPayload({ boxes: 100 })));
    await assertFails(addDoc(col, entryPayload({ people: 100 })));
    await assertFails(addDoc(col, entryPayload({ name: '' })));
  });

  it('夾帶名單外的欄位會被整筆拒絕', async () => {
    await seedBook();
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, `butlers/${BOOK}/entries`),
      entryPayload({ isAdmin: true })));
  });

  it('停用之後就記不進新的資料，但已經記的還讀得到', async () => {
    await seedBook({ revoked: true });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, `butlers/${BOOK}`)));
    await assertFails(addDoc(collection(db, `butlers/${BOOK}/entries`), entryPayload()));
  });

  it('站台沒開 butler 這個功能時，寫入一樣被擋下來', async () => {
    await seedSite(SITE_ID, { ownerEmails: [OWNER], pages: { butler: false } });
    await seedBook();
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(db, `butlers/${BOOK}/entries`), entryPayload()));
  });

  it('拿著連結的人改不動收禮簿本身（名單、停用狀態都不行）', async () => {
    await seedBook();
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(updateDoc(doc(db, `butlers/${BOOK}`), { revoked: false, guests: [] }));
    await assertFails(deleteDoc(doc(db, `butlers/${BOOK}`)));
  });

  it('新人改不了收禮簿掛在哪一個站台底下', async () => {
    await seedBook();
    await seedSite('other-site', { ownerEmails: [OWNER] });
    await assertFails(updateDoc(doc(ownerDb(), `butlers/${BOOK}`), { siteId: 'other-site' }));
  });

  it('連結簿只有新人讀得到', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `sites/${SITE_ID}/butlerLinks/l1`), {
        bookId: BOOK, token: 'abc123xyz', passcode: '123456',
        label: '收禮台', revoked: false, createdAt: Date.now(),
      });
    });
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, `sites/${SITE_ID}/butlerLinks/l1`)));
    await assertFails(getDocs(collection(anon, `sites/${SITE_ID}/butlerLinks`)));
    await assertSucceeds(getDoc(doc(ownerDb(), `sites/${SITE_ID}/butlerLinks/l1`)));
  });
});
