# 驗證工具

這台機器沒有 node，驗證一律用系統 Chrome headless。
**每次執行都會從當前的 `index.html` 重新產生測試檔**，不會重跑舊快照
（踩過：改完程式重跑舊測試檔，結果一模一樣，誤判「修正沒生效」）。

## 邏輯驗證（129 條斷言）

```bash
python tools/runverify.py
```

報告會寫到腳本同目錄的 `verify_report.txt`，主控台只印 ASCII 摘要
（Windows 主控台是 cp950，印中文會 UnicodeEncodeError）。
輸出第一行會印 `BUILD=` 識別值，用來確認測到的是最新版。

涵蓋：註冊表完整性（每個參數都接上面板）／撲克牌型判定含 WILD 與順子邊界／
差一張預報／功能卡五種效果／KMBT 格式／強開盤面生成／端對端走 `startSpin`+`update()`／
節奏參數拉極端值確認演出真的變長／四分頁建得起來／儲存往返／300 局 soak。

## 畫面驗證（8 個場景截圖）

```bash
python tools/shot.py
```

在專案目錄產生 `_shot_*.png`（已在 .gitignore）。用 Read 看圖確認版面。

## 注意

- 兩支腳本都用絕對路徑，不要依賴 cwd。
- Chrome 路徑寫死在 `C:\Program Files\Google\Chrome\Application\chrome.exe`。
- `--user-data-dir` 指向暫存目錄，避開既有 Chrome 的 profile 鎖。
- 測試若出現間歇性失敗，先懷疑「隨機發到的功能卡改變了盤面」——
  已知會干擾的是「轉換WILD」卡（設 `ODDS.wToWild = 0` 隔離）。
