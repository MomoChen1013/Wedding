/* ============================================================
   sample-catalog.js — 版型展示頁（/samples）每一張卡片上的文案
   ------------------------------------------------------------
   scripts/build-samples.js 讀這一份產出 public/samples/index.html。
   key 是版型代號（TEMPLATES 的 key），卡片連到 /samples/{key}/；
   classic 四種配色共用 'classic' 這一張（示範頁左下角可以換配色）。

     name    卡片標題（英文 ＋ 中文）
     mood    一句話的氣質，寫給客人看的，不寫技術
     dress   適合的婚紗：禮服的款式、婚紗照的拍法，各一兩個關鍵字
     colors  卡片上的色票（大廳實際看到的顏色，不是子頁的色票）

   順序就是展示頁的順序。新增版型時這裡沒寫到的，build 會直接報錯。
============================================================ */
export const SAMPLE_CATALOG = {
  'classic': {
    name: ['Classic', '經典'],
    mood: '一張滿版的婚紗照當背景，資訊安靜地疊在上面。最不挑照片，四種配色可以換。',
    dress: ['簡約緞面', '一字領', '棚拍或戶外都適合'],
    colors: ['#fbfaf7', '#b39a6d', '#c28794', '#8b9c7c', '#8295ad'],
  },
  'korean': {
    name: ['Korean Modern', '韓系簡約'],
    mood: '大量留白、細線條，照片像雜誌內頁一樣被排進版面裡。',
    dress: ['韓系棚拍', '極簡緞面', '俐落直筒'],
    colors: ['#fbfaf8', '#a8b8c5', '#93a3b1', '#21284f'],
  },
  'forest': {
    name: ['Forest Botanical', '森林系'],
    mood: '滿版照片，四周是可愛的手繪森林小物：橡實、香菇、小熊與兔子。',
    dress: ['森林戶外', '輕紗', '花環頭飾'],
    colors: ['#f2efe5', '#a5ad94', '#806f5c', '#26382d'],
  },
  'tapestry': {
    name: ['Tapestry', '中古刺繡'],
    mood: '拆開一封蓋著封蠟的信，走進中世紀的刺繡掛毯。',
    dress: ['復古蕾絲', '長袖', '宮廷風'],
    colors: ['#f1e8d5', '#b08a3e', '#5d6b3a', '#7a1f2b'],
  },
  'botanical-letter': {
    name: ['Botanical Letter', '植物信箋'],
    mood: '一本植物標本冊：壓花、棉紙、郵票，每張照片旁邊都壓著一枝乾燥花。',
    dress: ['細肩帶雪紡', '乾燥花捧花', '自然光'],
    colors: ['#f6f2e9', '#8a9a6b', '#b88a7a', '#3a4031'],
  },
  'secret-garden': {
    name: ['Secret Garden', '秘密花園'],
    mood: '推開常春藤牆上的玻璃門，走進玫瑰拱門與水彩花朵的花園。',
    dress: ['花園戶外', '蕾絲刺繡', '立體花朵'],
    colors: ['#f3f1e8', '#7a9a6a', '#9b8ab8', '#2f3b2b'],
  },
  'spring-orangerie': {
    name: ['Spring Orangerie', '春日溫室'],
    mood: '明亮的玻璃溫室，白玫瑰、檸檬枝與斜射進來的陽光。',
    dress: ['玻璃屋', '輕盈 A-line', '薄紗'],
    colors: ['#f7f7f1', '#9fbfa8', '#e7b18a', '#2e3a36'],
  },
  'night-sky': {
    name: ['Night Sky', '現代星空'],
    mood: '深藍夜空、會轉的星圖與越捲越圓的月亮。唯一一個深色的版型。',
    dress: ['夜景', '亮片', '深色西裝'],
    colors: ['#141a33', '#1f2440', '#b9a46a', '#8a93c7'],
  },
  'french-manor': {
    name: ['French Manor', '法式莊園'],
    mood: '天頂壁畫、大理石雕像與剪紙城堡，像走進一座文藝復興的莊園。',
    dress: ['法式宮廷', '緞面拖尾', '城堡或莊園'],
    colors: ['#f4efe7', '#a89679', '#8c9a7c', '#3b3530'],
  },
  'monet-garden': {
    name: ['Monet Garden', '莫內花園'],
    mood: '走進一幅會流動的莫內油畫：日本橋、睡蓮與花園小徑。',
    dress: ['印象派油畫感', '粉彩', '輕紗'],
    colors: ['#f7f3ea', '#8fae96', '#a99cc4', '#c9748a'],
  },
  'outdoor-party': {
    name: ['Outdoor Party', '美式戶外派對'],
    mood: '藍天、草地、野餐籃和一顆顆飄走的粉彩氣球，輕鬆又熱鬧。',
    dress: ['戶外派對', '短紗', '輕便禮服'],
    colors: ['#f8fbfd', '#7fbfe3', '#f6c85f', '#f07a5a'],
  },
  'morning-window': {
    name: ['Morning Window', '晨光房間'],
    mood: '侘寂風的早晨：窗前的鬱金香、亞麻布與牆上的窗格陽光。',
    dress: ['日系自然光', '居家婚紗', '素面簡約'],
    colors: ['#faf6ef', '#d9c3a5', '#c9d6db', '#9a7b5b'],
  },
  'white-church': {
    name: ['White Church', '白色教堂'],
    mood: '午夜點亮三根蠟燭，天一亮，是一座純白的教堂。白紗、蕾絲與珍珠。',
    dress: ['教堂證婚', '長頭紗', '蕾絲拖尾'],
    colors: ['#f8f6f3', '#b09460', '#857e8c', '#3d3743'],
  },
};
