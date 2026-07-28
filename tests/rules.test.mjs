import { readFileSync } from 'fs';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
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
