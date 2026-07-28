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
| `bgm.mp3` | 背景音樂，沒放就用內建的音樂盒版 |

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
