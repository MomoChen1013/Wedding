# ginny-one-20260919 的素材

把檔案放進來之後，在專案根目錄執行：

    npm run sync-assets -- --slug ginny-one-20260919
    npx firebase deploy --only hosting

## 放這一層（檔名要一模一樣，副檔名不拘）

| 檔名 | 用途 |
|---|---|
| `cover.jpg` | 單頁邀請函的封面大圖 |
| `lobby.jpg` | 首頁固定背景（圖片） |
| `lobby.mp4` | 首頁固定背景（影片，放了就優先用影片） |
| `bgm.mp3` | 背景音樂，沒放就用內建的預設背景音樂 |

## 放進子資料夾（檔名排序＝顯示順序，建議 01、02、03）

| 資料夾 | 用途 |
|---|---|
| `gallery/` | 照片牆 |
| `exhibition/` | 戀愛時光的展品 |
| `cards/` | 囍卡 |
| `cakes/` | 甜點桌 |

子資料夾可以放選填的 `meta.json` 補上文字，用檔名當 key：

```json
{ "01": { "year": "2019", "title": "第一次見面", "desc": "朋友的聚會上" } }
```

沒放的部分會用內建預設，不會壞掉。

## 抽卡小卡（`cards/`）

### 1. 卡圖放哪裡

放進 `cards/`，檔名建議 `01`、`02`、`03`…（檔名排序＝卡片順序）：

    public/assets/ginny-one-20260919/cards/
      01.jpg
      02.jpg
      03.png
      meta.json

・副檔名可用 `.jpg` `.jpeg` `.png` `.webp` `.gif` `.avif` `.svg`
・建議直式 2:3、800×1200 以上
・`meta.json` 不是圖片，不會被當成一張卡
・**只要 `cards/` 裡有任何一張圖，內建的範例卡就整批被換掉**（全有或全無，不會混在一起）；資料夾空的就沿用內建範例卡

### 2. 改文字說明與星級

在 `cards/meta.json` 裡用檔名當 key（含不含副檔名都可以）：

```json
{
  "01": { "name": "小時候的Mo", "rarity": "SSR", "desc": "不怕高又不怕鏡頭" },
  "02": { "name": "攝影師Momo", "rarity": "R" },
  "03": { "name": "馬祖的Momo", "rarity": "N" }
}
```

| 欄位 | 說明 | 沒填的話 |
|---|---|---|
| `name` | 卡名，顯示在卡片下方 | 變成「囍卡 1」「囍卡 2」… |
| `rarity` | 星級：`SSR` / `SR` / `R` / `N` | 當作 `N` |
| `desc` | 一句話說明，顯示在大卡下方的小紙條 | 不顯示小紙條 |

### 3. 星級會影響什麼

・`SSR`、`SR`：卡面有彩虹光膜，抽到時放煙火
・`R`、`N`：一般卡，沒有光膜也沒有煙火
・**每張卡被抽中的機率都一樣**。想做「越稀有越難抽」，就讓高星級的卡少放幾張、`N` 卡多放幾張

### 4. 改完記得重跑

```
npm run sync-assets -- --slug ginny-one-20260919
npx firebase deploy --only hosting
```

`meta.json` 改字、改星級也一樣要重跑一次 `sync-assets`，因為網頁讀的是產生出來的 `manifest.json`。
