# 信封開場：AI 生圖清單

照這份清單生成圖片，上傳給 Claude，由 Claude 負責切圖、去背、做動畫與透光效果。
提示詞都用英文（生圖模型對英文的理解最好），每一段前面有中文說明這張圖拿來做什麼。

---

## 先讀：所有圖片共通的規則

這些規則是為了讓圖可以被「切開、動起來」，請盡量遵守：

1. **正上方俯拍、沒有透視**。信封要塞滿整個畫面，四邊不能露出桌面或背景。
2. **四片紙在同一點會合**：上方的封口是一個大 V，尖端在畫面**左右正中間**、**上下中間偏下一點**（大約 50–55% 的高度）。左、右、下三片也都在這一點會合，摺線要清楚。
3. **封口尖端那一圈要空著**：不要有封蠟、貼紙、字母、縮寫。封蠟由程式另外放上去，上面會壓新人的姓名縮寫。
   - 如果怎麼生都會出現封蠟：只要它在正中間、大小不超過畫面寬度的 1/4，還可以用，程式的封蠟會蓋在上面。
4. **畫面上不要有任何文字**（包括 Tap to open）。文字由程式加，才能換成每一對新人的內容。
5. **裝飾不要跨過摺線懸空**：例如羽毛滾邊要「縫在封口上、在邊緣內側」，不要垂到旁邊那片紙上。因為封口掀起來時，掀走的只有封口那一片。
6. **尺寸**：直式至少 1152×2048，橫式至少 2048×1152（工具能給多大就給多大）。PNG 或高品質 JPG。
7. **同一款的直式、橫式要看起來是同一個信封**：先生成直式，滿意了再把直式當參考圖丟回去，請它「same design, landscape」。

---

## 共用的基底提示詞

每一款的「整封信封」都是這段，再接上該款的描述：

**直式（手機用，9:16）**

```
Photorealistic top-down product photograph of the back of a closed wedding envelope,
shot perfectly overhead with no perspective. The envelope fills the entire frame edge
to edge, no table or background visible. Classic diamond-flap construction: the top flap
is a large V whose point sits exactly at the horizontal center of the image, slightly
below the vertical middle; the left, right and bottom flaps fold in and meet at that
same point, with crisp visible fold lines. The area around the flap point is left clean
and empty: no wax seal, no sticker, no monogram, no text. Soft diffused daylight from
the upper left, gentle natural shadows, subtle vignette toward the edges, extremely fine
paper texture, luxurious editorial wedding stationery, 8k detail.
No text, no letters, no hands, no props. Portrait 9:16.
```

**橫式（桌機用，16:9）**：把最後一句換成 `Landscape 16:9, the envelope is wider than it is tall.`，並附上直式那張當參考圖。

## 共用的封蠟提示詞

每一款一枚，**中間是空白平面**，程式會把新人的姓名縮寫壓上去：

```
Top-down product photograph of a single blank round wax seal, perfectly smooth flat empty
center with no design and no letters, organic irregular poured-wax rim with soft ripples,
[COLOR] wax with a subtle pearlescent sheen, lit softly from the upper left, isolated in
the center on a solid pure black background, nothing else in the frame. Square 1:1.
```

`[COLOR]` 換成該款的顏色（寫在下面各款裡）。**背景一定要純黑**，去背才乾淨。

---

## 第 1 款：壓紋金邊（白信封・金封蠟）

拆開時壓紋浮出金光、信封裡透出暖光，就是參考圖 webgency 那個效果。

**1-A 整封信封（直式＋橫式）**：基底提示詞，接上

```
Heavy soft-white cotton paper with a warm ivory tone. Deep blind embossing, white on
white, raised relief with no ink: a lush bouquet of peonies, roses and leaves on the top
flap just above its point; slender climbing floral vines along the outer part of the left
and right flaps; a matching bouquet on the bottom flap below the point. Generous plain
negative space between the motifs. The embossing catches the light with soft highlights
and shadows. Tone on tone only.
```

**1-B 金光版（選做，最能拉開差距）**：把 1-A 當參考圖丟回去，**直式、橫式各做一張**

```
Exactly the same image and composition, nothing moved. Only the embossed flowers now
glow warm metallic gold, as if softly lit from within, with a gentle golden bloom around
them. The paper itself stays ivory.
```

如果你的工具不能「參考同一張圖修改」就跳過，我改用程式模擬金光，效果會差一點。

**1-C 內襯**

```
Flat lay of luxurious envelope liner paper filling the entire frame: champagne gold foil
paper with a delicate tone-on-tone floral damask pattern, evenly lit, no shadows, no text.
Portrait 9:16.
```

**1-D 封蠟**：`[COLOR]` = `soft champagne gold`

---

## 第 2 款：鵝毛絨（白信封・粉紅封蠟）

**2-A 整封信封（直式＋橫式）**：基底提示詞，接上

```
Velvety matte pure-white paper with a faint blush undertone. Along the entire V-shaped
edge of the top flap, a fluffy white marabou ostrich-feather trim is attached; it lies on
the flap just inside its edge and does not hang over onto the other flaps. Tone on tone,
soft and dreamy, delicate.
```

**2-B 飛散用的羽毛（3 張，每張一種）**：拆開時從封蠟往外飛的就是這幾根

```
A single soft white [FEATHER], isolated and centered on a solid pure black background,
studio lighting, high detail, nothing else in the frame. Square 1:1.
```

`[FEATHER]` 三張分別換成：

- `curled ostrich plume`
- `small straight goose feather with a fine quill`
- `round fluffy tuft of goose down`

**2-C 內襯**

```
Flat lay of soft blush-pink tissue paper filling the entire frame, with a sparse print of
tiny white feathers, evenly lit, no shadows, no text. Portrait 9:16.
```

**2-D 封蠟**：`[COLOR]` = `dusty blush pink`

---

## 第 3 款：緞帶絲綢（白信封・紅封蠟）

緞帶要能被「抽走」，所以**信封和緞帶分開生成**。

**3-A 整封信封（直式＋橫式，不要有緞帶）**：基底提示詞，接上

```
The envelope is covered in ivory silk satin fabric with a gentle liquid sheen and very
subtle natural fabric folds; the fine weave is visible. No ribbon.
```

**3-B 緞帶（1 張）**

```
A single long straight ivory double-faced satin ribbon, about 4 cm wide, running
horizontally across the entire frame from the left edge to the right edge, lustrous sheen
with gentle ripples, photographed from directly above on a solid pure black background,
nothing else in the frame. Landscape 16:9.
```

**3-C 內襯**

```
Flat lay of deep crimson silk satin fabric filling the entire frame, soft sheen, gentle
folds, no text. Portrait 9:16.
```

**3-D 封蠟**：`[COLOR]` = `deep crimson red`

---

## 第 4 款：華麗（白信封・紅封蠟）

**4-A 整封信封（直式＋橫式）**：基底提示詞，接上

```
Bright white heavyweight paper decorated with ornate raised gold-foil baroque filigree:
a frame of gold scrollwork running along all outer edges of the envelope, an elaborate
gold damask medallion on the top flap above its point, and fine gold foil lines tracing
every flap edge. A few small seed pearls accent the medallion. White and gold only.
```

**4-C 內襯**

```
Flat lay of deep burgundy red paper filling the entire frame with an all-over gold foil
damask pattern, evenly lit, no text. Portrait 9:16.
```

**4-D 封蠟**：`[COLOR]` = `deep crimson red`（可以直接沿用 3-D）

---

## 第 5 款：端莊（白信封・金封蠟）

**5-A 整封信封（直式＋橫式）**：基底提示詞，接上

```
Plain heavyweight bright-white cotton paper with soft hand-torn deckled edges on the
flaps and a single very fine gold foil line following the edge of the top flap. Nothing
else: minimal, calm, lots of empty space.
```

**5-C 內襯**

```
Flat lay of ivory paper filling the entire frame with very fine vertical gold foil
pinstripes, evenly lit, no text. Portrait 9:16.
```

**5-D 封蠟**：`[COLOR]` = `soft champagne gold`（可以直接沿用 1-D）

---

## 選做：第 0 款，原本的復古信封也升級

```
Aged antique cream parchment paper with soft foxing, faint tea stains and worn edges,
a thin faded gold stitched line along the edge of the top flap, warm candlelit tone.
```

封蠟 `[COLOR]` = `antique bronze`，內襯沿用原本的紅底金花，不用生成。

---

## 總數與檔名

| 款式 | 必做 | 選做 |
|---|---|---|
| 1 壓紋金邊 | 直式、橫式、內襯、封蠟 | 金光版直式、橫式 |
| 2 鵝毛絨 | 直式、橫式、內襯、封蠟、羽毛 ×3 | |
| 3 緞帶絲綢 | 直式、橫式、內襯、封蠟、緞帶 | |
| 4 華麗 | 直式、橫式、內襯 | 封蠟沿用 3-D |
| 5 端莊 | 直式、橫式、內襯 | 封蠟沿用 1-D |

一共 22 張必做（封蠟只有 3 種顏色要生成）。

建議檔名：`emboss-portrait.png`、`emboss-landscape.png`、`emboss-glow-portrait.png`、
`emboss-liner.png`、`seal-gold.png`、`feather-portrait.png`、`feather-plume-1.png`……
檔名不對也沒關係，上傳時說一聲哪張是哪張就好。

**不用一次全部做完**：建議先做第 1 款（壓紋金邊）的 1-A 到 1-D 傳上來。我先把那一款完整做好給你看，確認方向對了，其他四款再照同樣的方式做。

---

## 收到圖之後，程式這邊會做的事

- 量出每一張圖實際的摺線位置，沿著摺線把信封切成封口、左、右、下四片，掀封口和信封四散的動畫維持原樣
- 手機用直式、桌機用橫式，不再用拉伸的漸層去配合畫面比例
- 封蠟去背，中間用手寫體壓上新人的姓名縮寫（例如 G&O）
- 拆開時從縫隙透出暖光；壓紋款的金光版從封蠟往外淡入
- 鵝毛絨的羽毛、緞帶絲綢的緞帶改用你生成的單張素材
- 封面上的文字收成一句同色的手寫體，其他資訊移到信紙上
