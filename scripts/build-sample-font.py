"""
build-sample-font.py — 版型總覽頁（/samples）的中文字體：源樣明體 GenYoMin TC
------------------------------------------------------------
  python3 scripts/build-sample-font.py <源樣明體 otf 所在的資料夾>

源樣明體一個字重就 16MB，整套放上網站太重。總覽頁是產出的靜態頁，
用到的字是固定的，所以只把「這一頁真的用到的字」切出來，
存成 public/samples/fonts/genyomin-{r,m}.woff2（每個字重一兩百 KB）。

  需要的檔案  GenYoMin2TC-R.otf、GenYoMin2TC-M.otf
              https://github.com/ButTaiwan/genyo-font（otf/TC/，SIL OFL 1.1）
  需要的套件  pip install fonttools brotli

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
