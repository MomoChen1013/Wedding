/* ============================================================
   exhibition.js — 橫向時間軸照片牆
   ・每筆資料依照 n（編號）排序，混入幕別分隔卡
   ・第三幕之後不顯示時間／年份
   ・卡片下方提供美術館式的描述文字
   填資料：在下方 ITEMS 陣列加入 {n, type, year, when, src, title, desc, act}
   　　　　幕別分隔卡：{type:'act', label, subtitle, n}
============================================================ */
if(!requireUser()) { /* requireUser 已導向首頁 */ }

/* ★ 以下時間軸為範例（沿用原作 Momo 的人生故事）
   換成你們的戀愛里程碑：相遇 → 曖昧 → 交往 → 求婚 → 結婚
   每筆：{n:編號, type:'photo', year:'年份', when:'說明', src:'/images/xxx.png', title:'標題', desc:'描述', act:'第幾幕'}
   幕別分隔卡：{type:'act', label:'第一幕', subtitle:'我們的相遇', n:編號} */
const ITEMS = [
  /* ===== 序章 ===== */
  {n:1,  type:'photo', year:'2026', when:'現在・31 歲',
    src:'/images/photo-01.png', title:'31.0 版上線',
    desc:'本人 31.0 版正式上線——偶爾還是會當機，但還是要持續更新。'},
  {n:2,  type:'photo', year:'1995', when:'故事從這裡開始',
    src:'/images/photo-02.png', title:'家庭合照',
    desc:'我有一個充滿歡樂跟愛的家庭。'},

  /* ===== 第一幕 ===== */
  {n:2.5, type:'act', label:'第一幕', subtitle:'學生時期'},
  {n:3,  type:'photo', year:'2002', src:'/images/photo-03.png', act:'第一幕',
    title:'山囝仔',
    desc:'我都說我是山裡的孩子，有記憶以來都在山上長大，暑假也都在山上阿公家度過（阿公家在奮起湖方圓 10 公里內）。'},
  {n:4,  type:'photo', year:'2008', src:'/images/photo-04.png', act:'第一幕',
    title:'畫畫的起點',
    desc:'國中開始入坑動漫，因為朋友圈開始畫畫，第一個畫的角色是奇犽——當過班長，但曾經翹課。'},
  {n:5,  type:'photo', year:'2011', src:'/images/photo-05.png', act:'第一幕',
    title:'青春熱血',
    desc:'高中在東山唸書，充滿許多青春回憶，是個活潑的籃球社成員。什麼長都當過了，但最不想當的是風紀股長。'},
  {n:6,  type:'photo', year:'2013', src:'/images/photo-06.png', act:'第一幕',
    title:'衝一發家人團',
    desc:'成為「衝一發團」，說走就走的旅行讓我去過很多地方，也開始了九州鬆餅的打工——面試才發現人資主管是媽媽學生的家長。'},
  {n:7,  type:'photo', year:'2015', src:'/images/photo-07.png', act:'第一幕',
    title:'用爸爸給的愛・愛日本',
    desc:'開始花爸爸的錢一直飛日本，經歷了日本遊學與打工換宿。'},

  /* ===== 第二幕 ===== */
  {n:7.5, type:'act', label:'第二幕', subtitle:'出社會跟旅遊'},
  {n:8,  type:'photo', year:'2017–2018', src:'/images/photo-08.png', act:'第二幕',
    title:'澳打',
    desc:'第一次離家長期生活——在加工肉廠打工、後來去當咖啡師。採藍莓一天就決定逃跑。'},
  {n:9,  type:'photo', year:'2019', src:'/images/photo-09.png', act:'第二幕',
    title:'開始找工作',
    desc:'找不到工作的時候曾想說是不是不要做設計。甲狀腺第一次復發，一週掉 5 公斤暴瘦。'},
  {n:10, type:'photo', year:'2020', src:'/images/photo-10.png', act:'第二幕',
    title:'第一份穩定正職',
    desc:'像大學同學一樣的同事，讓我感到溫暖跟專業，甚至逼大家陪我出去玩。'},
  {n:11, type:'photo', year:'2019~', src:'/images/photo-11.png', act:'第二幕',
    title:'跑遍各地方',
    desc:'環東澳、德瑞奧、雲南、桂林、越南、墨爾本，跟無限次的日本和韓國——總是莫名的在獨旅，但更喜歡跟朋友一起。'},
  {n:12, type:'photo', year:'2021', src:'/images/photo-12.png', act:'第二幕',
    title:'培養了奇怪的技能',
    desc:'面對情緒化的主管、邊拉花邊跟客人拉ㄌㄟ、跟不對頻的人相處、理解恐慌症、知道人際關係不是非黑即白……'},

  /* ===== 第三幕（不再顯示時間／年份） ===== */
  {n:12.5, type:'act', label:'第三幕', subtitle:'我與我ㄉ朋朋們'},
  {n:13, type:'photo', src:'/images/photo-13.png', act:'第三幕',
    title:'體驗各樣興趣',
    desc:'空中瑜伽、騎馬、密室逃脫、雷射槍、劇本殺、射箭、圍棋……'},
  {n:14, type:'photo', src:'/images/photo-14.png', act:'第三幕',
    title:'貓貓朋友',
    desc:'2021.04.17 養貓那天，逼迫媽媽接受——但後來他最愛哈納。'},
  {n:15, type:'photo', src:'/images/photo-15.png', act:'第三幕',
    title:'搞過的瘋狂事',
    desc:'帶旅遊團、四國跳島、日韓多點機票、武漢自由行、辦市集、成立帳號、做一堆產品、當遊戲主持人、教水彩、在台上唱歌。'},
  {n:16, type:'photo', src:'/images/photo-16.png', act:'第三幕',
    title:'朋友圈大擴張',
    desc:'開始認識許多朋友：旅遊朋友、追星朋友、賺錢朋友、讀書朋友、日系朋友、酒肉朋友、夫妻朋友、設計師朋友……'},
  {n:17, type:'photo', src:'/images/photo-17.png', act:'第三幕',
    title:'下班最喜歡做的事',
    desc:'跟朋吃飯、夜唱、居酒屋、散步；假日去露營、玩桌遊、打 Switch、密室逃脫。'},

  /* ===== 第四幕 ===== */
  {n:17.5, type:'act', label:'第四幕', subtitle:'給朋友，也給未來'},
  {n:18, type:'photo', src:'/images/photo-18.png', act:'第四幕',
    title:'這一年我學會的事',
    desc:'雖然看過很多商業思維、數據思維、設計思考等等——現在更想學會愛生活，並找到自己的人生～'},
  {n:19, type:'photo', src:'/images/photo-19.png', act:'第四幕',
    title:'一句話送給你',
    desc:'希望你現在過的生活，是「你」想過的生活，而不是別人希望你這麼過的生活。'},
  {n:20, type:'photo', src:'', act:'第四幕', finale:true,
    title:'下一張，等你一起入鏡！',
    desc:'這裡留下一張空白照片——下一張，等你一起入鏡。'},
];

/* 素材資料夾有 exhibition/ 就用客戶自己的展品，否則沿用上面的預設 */
(function applyExhibitionAssets(){
  const list = (window.SITE && window.SITE.assets && window.SITE.assets.exhibition) || [];
  if(!list.length) return;
  ITEMS.length = 0;
  list.forEach((item, i) => {
    ITEMS.push({
      n:     i + 1,
      type:  'photo',
      src:   item.src,
      year:  item.year  || '',
      when:  item.when  || '',
      title: item.title || '',
      desc:  item.desc  || '',
      act:   item.act   || '',
    });
  });
})();

/* 依編號排序 */
ITEMS.sort((a,b)=> a.n - b.n);

const track     = document.getElementById('tlTrack');
const tlSec     = document.getElementById('tlSec');
const yearBack  = document.getElementById('tlYearBack');
const topProg   = document.getElementById('tlTopbar');
const dotsWrap  = document.getElementById('tlDots');

/* ===== 渲染所有節點（混合 photo 與 act） ===== */
const photoNodes = [];
const photoData  = [];

ITEMS.forEach(item=>{
  if(item.type === 'act'){
    const div = document.createElement('div');
    div.className = 'tl-act-div';
    div.innerHTML = `
      <div class="ac-label">${escapeHtml(item.label)}</div>
      <div class="ac-line"></div>
      <div class="ac-sub">${escapeHtml(item.subtitle)}</div>
    `;
    track.appendChild(div);
    return;
  }

  const idx       = photoData.length;
  const isFinale  = item.finale === true;
  const fallback  = '';
  const photoHtml = item.src
    ? `<img src="${item.src}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.parentNode.classList.add('no-img');this.remove();" data-fallback="${fallback}">`
    : fallback;

  /* 卡片下方的時間標籤：沒有時間就整列隱藏 */
  const eyebrowText = item.year
    ? (item.when ? `${item.year}・${item.when}` : item.year)
    : '';
  const eyebrowHtml = eyebrowText
    ? `<div class="when">${escapeHtml(eyebrowText)}</div>`
    : '';

  const node = document.createElement('div');
  node.className = 'tl-node' + (isFinale ? ' finale' : '') + (item.year ? '' : ' no-year');
  node.dataset.idx = idx;
  /* 交錯的微微傾斜（拍立得隨手擺放感） */
  node.style.setProperty('--tilt', (idx % 2 === 0 ? '-1.4deg' : '1.6deg'));
  node.innerHTML = `
    <div class="tl-media">
      <div class="tl-ph">${photoHtml}</div>
      <div class="tl-cap">${escapeHtml(item.title)}</div>
    </div>
    <div class="tl-meta">
      ${eyebrowHtml}
      <p class="desc">${escapeHtml(item.desc || '')}</p>
    </div>
  `;
  track.appendChild(node);

  photoNodes.push(node);
  photoData.push(item);

  const d = document.createElement('div');
  d.className = 'pd' + (photoData.length === 1 ? ' on' : '');
  dotsWrap.appendChild(d);
});

const dots = [...dotsWrap.children];

/* ===== 動態高度（節點越多滾得越久） ===== */
tlSec.style.height = Math.max(300, 100 + ITEMS.length * 70) + 'vh';

/* ===== 滾動邏輯 ===== */
let dragOffset = 0;
let maxShift   = 0;

function recalc(){
  maxShift = track.scrollWidth - window.innerWidth + window.innerWidth * 0.06;
}
recalc();
addEventListener('resize', ()=>{ recalc(); onScroll(); });
/* 拍立得寬度跟著照片實際尺寸走，圖片載入完要重算總寬度 */
track.addEventListener('load', e => {
  if(e.target && e.target.tagName === 'IMG'){ recalc(); onScroll(); }
}, true);

function onScroll(){
  const r = tlSec.getBoundingClientRect();
  const total = tlSec.offsetHeight - window.innerHeight;

  const sc = window.scrollY;
  const h  = document.documentElement.scrollHeight - window.innerHeight;
  topProg.style.width = (h > 0 ? sc / h * 100 : 0) + '%';

  let p = 0;
  if(r.top <= 0 && r.bottom >= window.innerHeight) p = (-r.top) / total;
  else if(r.top > 0) p = 0;
  else p = 1;
  p = Math.max(0, Math.min(1, p));

  const base = p * maxShift;
  const x = Math.max(0, Math.min(maxShift, base - dragOffset));
  track.style.transform = 'translateX(' + (-x) + 'px)';

  const centerX = window.innerWidth / 2;
  let nearest = 0, nd = Infinity;
  photoNodes.forEach((n, i)=>{
    const nr = n.getBoundingClientRect();
    const nc = nr.left + nr.width / 2;
    const dist = Math.abs(nc - centerX);
    if(dist < nd){ nd = dist; nearest = i; }
  });
  photoNodes.forEach((n, i)=> n.classList.toggle('focus', i === nearest));

  const focusItem = photoData[nearest];
  yearBack.textContent = focusItem.year || '';
  yearBack.classList.toggle('hidden', !focusItem.year);
  dots.forEach((d, i)=> d.classList.toggle('on', i === nearest));
}
addEventListener('scroll', onScroll, {passive:true});
onScroll();

/* ===== 拖曳橫向（只在 sticky 釘住時可動） ===== */
let dragging = false, startX = 0, startOffset = 0;
track.addEventListener('pointerdown', e=>{
  const r = tlSec.getBoundingClientRect();
  if(r.top > 0 || r.bottom < window.innerHeight) return;
  dragging = true; startX = e.clientX; startOffset = dragOffset;
  track.setPointerCapture(e.pointerId);
});
track.addEventListener('pointermove', e=>{
  if(!dragging) return;
  dragOffset = startOffset + (e.clientX - startX);
  onScroll();
});
track.addEventListener('pointerup',     ()=> dragging = false);
track.addEventListener('pointercancel', ()=> dragging = false);

/* ===== 鍵盤左右 ===== */
addEventListener('keydown', e=>{
  if(e.target.matches('input, textarea')) return;
  if(e.key === 'ArrowRight'){ dragOffset -= window.innerWidth * 0.35; onScroll(); }
  if(e.key === 'ArrowLeft' ){ dragOffset += window.innerWidth * 0.35; onScroll(); }
});

/* ===== lightbox ===== */
const lb     = document.getElementById('lb');
const lbPh   = document.getElementById('lbPh');
const lbT    = document.getElementById('lbT');
const lbDate = document.getElementById('lbDate');
const lbDesc = document.getElementById('lbDesc');

photoNodes.forEach((n, i)=>{
  n.querySelector('.tl-media').addEventListener('click', ()=>{
    const item = photoData[i];
    const isFinale = item.finale === true;
    lbPh.innerHTML = item.src
      ? `<img src="${item.src}" alt="${escapeHtml(item.title)}" onerror="this.parentNode.innerHTML='';">`
      : '';
    lbT.textContent    = item.title;
    lbDate.textContent = item.year
      ? (item.when ? `${item.year}・${item.when}` : item.year)
      : (item.act || '');
    if(lbDesc) lbDesc.textContent = item.desc || '';
    lb.classList.add('open');
  });
});
document.getElementById('lbClose').onclick = ()=> lb.classList.remove('open');
lb.addEventListener('click', e=>{ if(e.target === lb) lb.classList.remove('open'); });
addEventListener('keydown', e=>{ if(e.key === 'Escape') lb.classList.remove('open'); });
