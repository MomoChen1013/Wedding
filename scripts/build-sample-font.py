"""
build-sample-font.py — 版型總覽頁（/samples）的中文字體：源樣明體 GenYoMin TC
------------------------------------------------------------
  python3 scripts/build-sample-font.py <源樣明體 otf 所在的資料夾> [辰宇落雁體 ttf]

源樣明體一個字重就 16MB，整套放上網站太重。總覽頁是產出的靜態頁，
用到的字是固定的，所以只把「這一頁真的用到的字」切出來，
存成 public/samples/fonts/genyomin-{r,m}.woff2（每個字重一兩百 KB）。

  需要的檔案  GenYoMin2TC-R.otf、GenYoMin2TC-M.otf
              https://github.com/ButTaiwan/genyo-font（otf/TC/，SIL OFL 1.1）
  需要的套件  pip install fonttools brotli

  第二個參數（選填）給辰宇落雁體，順便切手寫字 public/samples/fonts/hand.woff2：
  只用在可以操作的示範上面那行「動手操作看看」（class="try-note"），只切那幾個字。
  需要的檔案  ChenYuluoyan-2.0-Thin.ttf
              https://github.com/Chenyu-otf/chenyuluoyan_thin（SIL OFL 1.1）
  「辰宇落雁」是 OFL 的保留字型名稱（Reserved Font Name），切過的子集算改作，
  不能再叫這個名字 —— 所以字族名稱改成 Shin9 Samples Hand，版權與授權欄位照留，
  授權全文在 public/samples/fonts/OFL-chenyuluoyan.txt。

  ▸ 改了 scripts/sample-index.html 或 sample-catalog.js 的文案，
    先跑 npm run build-samples，再跑這一支。
    漏跑的話新出現的字會退回思源宋體（頁面上看得出字型不一樣，但不會缺字）。
"""
import re
import sys
from html import unescape
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / 'public/samples/index.html'
OUT = ROOT / 'public/samples/fonts'
WEIGHTS = {'r': 'GenYoMin2TC-R.otf', 'm': 'GenYoMin2TC-M.otf'}

# 頁面上的字 ＋ 英數與常用標點（文案小改時不至於馬上缺字）
html = PAGE.read_text(encoding='utf8')
html = re.sub(r'<(style|script)[^>]*>.*?</\1>', ' ', html, flags=re.S)
text = unescape(re.sub(r'<[^>]+>', ' ', html))
extra = ''.join(chr(c) for c in range(0x20, 0x7f)) + '，。、；：？！「」『』（）《》〈〉…—–・·／％＋～'
chars = sorted(set(text + extra) - set('\n\r\t'))

src_dir = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
OUT.mkdir(parents=True, exist_ok=True)
for key, name in WEIGHTS.items():
    src = src_dir / name
    if not src.exists():
        sys.exit(f'找不到 {src}（第一個參數給源樣明體 otf 所在的資料夾）')
    font = TTFont(src)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']      # 保留標點擠壓等排版特性
    opts.name_IDs = ['*']             # 保留授權與字型名稱
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=[ord(c) for c in chars])
    sub.subset(font)
    dest = OUT / f'genyomin-{key}.woff2'
    font.flavor = 'woff2'
    font.save(dest)
    print(f'✅ {dest.relative_to(ROOT)}（{len(chars)} 字，{dest.stat().st_size // 1024} KB）')

# ---- 手寫字：辰宇落雁體 Thin，只切「動手操作看看」 ----
if len(sys.argv) > 2:
    hand_src = Path(sys.argv[2])
    if not hand_src.exists():
        sys.exit(f'找不到 {hand_src}（第二個參數給 ChenYuluoyan-2.0-Thin.ttf）')
    notes = re.findall(r'class="try-note"[^>]*>(.*?)</p>', PAGE.read_text(encoding='utf8'), flags=re.S)
    hand_chars = sorted(set(unescape(re.sub(r'<[^>]+>', '', ''.join(notes)))) - set(' \n\r\t'))
    if not hand_chars:
        sys.exit('頁面上找不到 class="try-note" 的字')
    font = TTFont(hand_src)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=[ord(c) for c in hand_chars])
    sub.subset(font)
    # 保留字型名稱不能用在改作上：字族、完整名稱、PostScript 名稱都換掉（版權 0、授權 13／14 不動）
    name = font['name']
    for nid in (1, 3, 4, 6, 16, 17, 18, 21, 22):
        name.removeNames(nameID=nid)
    for nid, text in ((1, 'Shin9 Samples Hand'), (2, 'Regular'), (3, 'Shin9 Samples Hand subset'),
                      (4, 'Shin9 Samples Hand'), (6, 'Shin9SamplesHand-Regular')):
        name.setName(text, nid, 3, 1, 0x409)
        name.setName(text, nid, 1, 0, 0)
    dest = OUT / 'hand.woff2'
    font.flavor = 'woff2'
    font.save(dest)
    print(f'✅ {dest.relative_to(ROOT)}（{"".join(hand_chars)}，{dest.stat().st_size} bytes）')
