# Crescendo demo 實作設計（2026-08-27）

要改這支 demo 的核心玩法前，先讀這份。規格本體在 [`docs/spec.md`](../../spec.md)。

| 項目 | 值 |
|---|---|
| 主路徑 | `D:\demo\test\index.html`（唯一，2809 → 約 2830 行） |
| `APP_BUILD` | `crescendo-1`（改版務必 +1，用來確認測到的是新版） |
| `TUNE_KEY` / `TUNE_VERSION` | `crescendo_tuning` / `1` |
| 骨架來源 | `~/.claude/skills/slot-demo-from-gdd/assets/demo-scaffold.html`（`scaffold-2`） |
| 驗證 | `python tools/runverify.py`（129 條斷言）／`python tools/shot.py`（8 場景截圖） |

---

## 1. 為什麼判定要整支換掉

骨架預設是「最左列起連續同符號的 5 條固定線」（`evaluateLines`）。Crescendo 是**撲克牌型**，
不是線、不是 ways、不是 cluster——所以 `evaluateLines()` 整支換成 `classifyHand(ids)`。

`classifyHand` 回傳與骨架同形狀的物件，所以演繹（壓暗、得分框、粒子、鎖定）全部自動跟上：

```js
{ key: 'flush', idx: 5, name: '同花', pay: 1, cells: [0,1,2,3,4] }
```

`cells` 決定「哪些牌會被高亮／鎖定／噴粒子」，也決定重轉走哪個分支（見第 3 節），
所以 `cells` 填對比什麼都重要。

### WILD 用分析法，不要枚舉

WILD 可代替任意牌。5 張全 WILD 時枚舉替換是 52⁵ ≈ 3.8 億種，不可行。
改用**分析法**：把非 WILD 的牌依點數／花色分組，取 `a` = 最大同點數組的張數、
`b` = 第二大、`maxSuit` = 最大同花色張數、`w` = WILD 數，然後：

| 牌型 | 條件 |
|---|---|
| 五條 | `a + w >= 5` |
| 皇家同花順 | `isFlush && isStraight && 序列 == [10,J,Q,K,A]` |
| 同花順 | `isFlush && isStraight` |
| 鐵支 | `a + w >= 4` |
| 葫蘆 | `a+w>=3 && b+(w-x)>=2 && a+b+w>=5`，其中 `x = max(0, 3-a)` |
| 同花 | `maxSuit + w >= 5` |
| 順子 | 非 WILD 牌點數互異，且全部落在同一組合法序列內 |
| 三條 | `a + w >= 3` |
| 兩對 | `a >= 2 && b >= 2`（有 WILD 時一定先被三條接走，所以不看 `w`） |
| 一對 | `a + w >= 2` |

**判定順序＝賠率高低順序**，第一個成立的就是答案（企劃 `[D57]`：取賠率最高者）。

**順子序列由大到小掃**（`STRAIGHTS` 反向遍歷），這樣 `WILD + 10♠J♠Q♠K♠` 才會判成皇家而不是
先命中低序列。`STRAIGHTS[0]` 是 `A2345`（企劃 `[B25]`），最後一組是 `10JQKA`（`[B26]`），
`JQKA2` 不在表內（`[B27]`：不可跨 A 接環）。

---

## 2. 牌與牌階的 id 編碼

```
id = rank * 4 + suit      // 0~51
rank: 0='2' … 8='10', 9='J', 10='Q', 11='K', 12='A'
suit: 0=♠ 1=♥ 2=♦ 3=♣
WILD_ID = 52, FREE_ID = 53
```

**功能卡的「牌階」共 18 種**（企劃 `[E69]`）：13 個點數 + 4 個花色 + 1 個「人頭牌」群組。
人頭牌 = J/Q/K（`FACE_RANKS`），**不含 A**——這是 `[自設]`，企劃只寫「1 種群組（人頭牌）」。

### 轉換 WILD 的雙重身分

企劃 `[H81]`：「該牌會同時作為 WILD 與原牌牌階」。實作用 `cell.origId` 保存原本的 id：

- `cell.id` → 變成 `WILD_ID`，**牌型判定看這個**
- `cell.origId` → 原本的牌，**功能卡牌階比對看這個**（透過 `tierIdAt(c)`）

所以「轉換 WILD」把 ♠3 變 WILD 後，一張指定「♠」的加得分卡**仍然會觸發**。
改動功能卡觸發邏輯時務必走 `tierIdAt()`，不要直接讀 `board[c][0].id`。

---

## 3. 三種重轉共用同一條路

企劃 `[D43:E51]` 的三種重轉，在程式裡都是「決定 `cols[]`（哪幾欄要轉）後呼叫 `beginReels(cols)`」：

| 條件 | 判斷處 | `cols` |
|---|---|---|
| 成牌 2~4 張 | `doRespin()`：`cells.length < COLS` | 得分牌以外的欄 = true |
| 成牌 5 張 | `doRespin()`：`cells.length >= COLS` | 全部 true，且先走 `MULT_BOOST` 把 `startMult` 加倍 |
| 未得分但差一張 | `enterChecking()` → `findDraw()` | 只有 `drawInfo.cell` = true |

**差一張的路徑不增加 `roundIdx`、也不新增功能卡**（企劃 `[E51]`），所以它不吃回合上限，
改用 `drawRespinUsed` / `ODDS.drawRespinMax`（`[自設]` 5 次）獨立收斂。
第一次是**必定**觸發（`[E49]` 沒寫機率），第二次起才擲 `ODDS.drawRespinPct`（`[E50]`「有機率」）。

### 連爆的收斂機制只有一個

`scoredKeys`（Set）記錄本局已計分的**具體牌組**：

```js
const key = h.key + '|' + h.cells.map(c => ids[c] + '@' + c).sort().join(',');
```

同一個 key 第二次出現就不計分 → 該回合無得分 → 局結束。這是企劃 `[D56]` 的實作，
也是**唯一**讓連爆停下來的規則（使用者 2026-08-27 決議：照「具體牌組」而非「牌型種類」）。

**注意**：key 含格位置。所以「鎖定的那對牌沒變、但重轉出來的 3 張換了」→ 判定結果若還是同一對，
key 相同 → 停止；若湊出更好的牌型 → key 不同 → 繼續（符合 `[D52]`）。
改這個 key 的組成方式會直接改變連爆長度與 RTP，動之前先看 `docs/spec.md` 的 5.3。

---

## 4. 得分用「賠率單位」算，不要用金額累加

企劃 `[F95/F96]` 是兩段式：

```
得分 = 押注額 × 牌型賠率          ← 功能卡的「加得分／乘得分」作用在這裡
彩金 = 得分（含加成） × 倍數       ← 功能卡的「加倍數／乘倍數」作用在這裡
```

所以程式維護兩個純量，**不是金額**：

- `payUnits`：從 `handResult.pay`（例如一對 0.1）起算，加得分 `+= value`、乘得分 `*= value`
- `curMult`：從 `startMult` 起算，加倍數 `+= value`、乘倍數 `*= value`

```js
function scoreNow() { return ODDS.bet * payUnits * ODDS.payMul; }   // 得分欄顯示這個
function winNow()   { return Math.round(scoreNow() * curMult); }    // 實際入袋
```

這樣「加得分 +0.25」自然就是「+0.25 × 押注」（企劃 `[H73]`「數值隨押注變動」），
高倍卡門檻也能直接用 `value >= FX.highCardRatio`（`[F119]`「押注額的 10× 以上」）比較。

**功能卡一律由左至右依序套用**（`[D53]`），順序存在 `featOrder`，`FEAT_APPLY` 狀態用
`featCursor` 逐張推進，每張停 `TIMING.featTrigger` 秒。

---

## 5. 狀態機（16 個狀態）

```
IDLE → SPINNING
  ├─ 盤面有 FREE → FREE_COLLECT → 重轉那幾格（回 SPINNING）
  ├─ 有「轉換WILD」卡命中 → WILD_CONVERT
  └─ CHECKING
       ├─ 有得分 → SHOWING_WIN → FEAT_APPLY → PRE_HOLD → SCORE_RUN → POST_HOLD
       │            → (5 張全中? MULT_BOOST) → RESPIN_PREP → SPINNING
       └─ 無得分 → (差一張? DRAW_HINT → 只轉那一格 → SPINNING)
                  → endSpin() → (四階大獎? BIGWIN) → (fgPending? FG_ENTER) → IDLE
                                                     (inFG 且 fgLeft 歸零? FG_END)
```

- `PRE_HOLD` / `POST_HOLD` 的長度**依得分層級**取 `F_PRE[winTier]` / `F_POST[winTier]`
  （企劃 §高倍得分層級設計的一/二/三階，三階各有獨立的 TIMING 參數）
- `FREE_COLLECT` 有 `freeRespins < 10` 的保護；`freeCount` 滿 3 後 FREE 權重歸零（`freeAllowed()`），
  所以不會無限收集
- **FG 的局不計入 `stats.spins`**（免費局沒有押注，計入會讓 RTP 分母錯）

---

## 6. 踩過的坑（改動時當心）

| 坑 | 症狀 | 正解 |
|---|---|---|
| `colOffsets/colBounce/colStopped` 只在 `beginReels()` 初始化 | **剛載入的待機畫面盤面整個畫不出來**（`GRID_Y + undefined` = NaN）。邏輯斷言全綠，只有截圖看得到 | 在 `generateBoard()` 就備齊這幾個陣列 |
| 撲克花色被 emoji 字型接手 | `♠` 畫成金色圓底的彩色圖案 | 用 `SUIT_FONT`（Segoe UI Symbol）＋ `suitGlyph()` 加 U+FE0E。**三處**：牌角、牌面中央、功能卡牌階、DRAW 提示 |
| 起始倍數沒有上限 | 單局贏分指數爆炸，soak RTP 1.35e18% | `ODDS.maxStartMult`（`[自設]` 64）。企劃沒寫上限，這是待拍板項 |
| 倍數欄顯示 `curMult` | 待機／預報時顯示上一回合的殘值 | 只有結算四個狀態顯示 `curMult`，其餘顯示 `startMult` |
| `loadTuning()` 版本不符只刪 localStorage | 執行期呼叫（storage 事件、另一分頁是舊版）舊值會留在物件上 | 版本不符時把 `TIMING/FX/ODDS/LAYOUT/...` 全部還原成 `DEFAULT_*` |
| 骨架的 `drawUI()` 引用 `roundScore` | 換掉變數名後 `draw()` 直接 ReferenceError | WIN 數字改讀 `fmtScore(displayScore)`。`drawUI` 其餘部分是公版，不要動 |
| 測試被隨機發到的功能卡干擾 | 同一份程式碼有時 129/129、有時少 1~2 條 | 會改變盤面的只有「轉換WILD」卡 → 測試裡設 `ODDS.wToWild = 0` 隔離；手動擺盤面要**5 格全設**，別留隨機格 |

---

## 6b. 得分牌抬起（出牌感）與功能卡命中箭頭

2026-08-27 追加，依使用者提供的企劃畫面示意實作。兩個獨立效果：

1. **得分牌抬起**：得分牌逐張往上彈出、放大、扇形傾斜，像把牌打出去
2. **命中箭頭**：命中某張功能卡牌階的牌，上方出現紫色箭頭 ＋ 牌身紫框；
   正在被套用的那張卡對應的牌，箭頭與紫框加強（放大 1.3 倍、轉白）

### 抬起是 cell 上的狀態，不是動畫佇列

每個 `board[c][0]` 帶三個欄位：`lift`（0~1 目前進度）、`liftTarget`（0 或 1）、`liftDelay`（剩餘延遲幀）。

- `setLiftTargets()`：進入 `SHOWING_WIN` 時呼叫。得分牌 target=1，並依序給 `liftDelay = k * F_LIFTSTAG` 做逐張錯開
- `updateLift()`：每幀往 target 逼近 `1/F_CARDLIFT`
- `clearLift()`：`doRespin` / `doDrawRespin` / `endSpin` 時呼叫，牌落回盤面
- `liftEase()`：easeOutBack，抬到頂會超衝再回落（`FX.cardLiftBack`，設 0 就沒超衝）

這樣做的好處是「抬起」與狀態機解耦——跳過（`skipCurrent`）不需要特別處理它，動畫自己會收斂。

### 繪製必須分兩段，因為盤面有 clip

原本 `drawBoard()` 整段包在 `ctx.clip()` 裡（為了讓轉動中的上方預備牌不露出盤面）。
但**抬起的牌要能超出盤面上緣**，包在 clip 裡會被裁掉一截。所以拆成：

| 段 | 內容 | clip |
|---|---|---|
| 1 | 還在轉的欄（`!colStopped[c]`）＋ 上方預備牌 | **要** |
| 2 | 已停輪的欄：抬起變換、牌、得分框、紫框、鎖定框、預報框 | 不要 |
| 3 | 命中箭頭 | 不要，且**不套牌的旋轉**（箭頭要保持垂直） |

第 2 段的所有框都在同一個 `ctx.save()` 變換內畫，所以框會跟著牌一起抬起傾斜。
落影的做法是「先畫一個帶 shadow 的實心牌形，牌本身蓋掉它，只留外溢的陰影」——
不能直接對 `drawCard` 設 shadow，那會讓牌面文字也拖影子。

### 垂直間距是排過的，有斷言釘住

抬起 ＋ 上方箭頭需要「功能列底」到「盤面上緣」之間有足夠空隙：

```
箭頭頂 = grid.y − cardLiftY − CARD_H×(cardLiftScale−1)/2 − 10 − arrowSize×1.5×1.3
必須 > featureRow.y + featureRow.h
```

目前 `grid.y=336`、`cardLiftY=30`、`featureRow` 底 246 → 箭頭頂 256.9，餘裕約 11px。
**改 `grid.y` / `featureRow` / `cardLiftY` / `arrowSize` 之前先看驗證腳本第 10c 節「版面幾何」**，
那裡有 12 條斷言把所有重疊關係釘住（含盤面不壓公版面板、牌型資訊兩行放得下、燈條與 FG 欄不撞盤面）。
這類問題邏輯斷言抓不到、只有肉眼看得到，所以改成幾何斷言。

### 功能列的灰階與箭頭共用一份事實

`featIsHit(i)` 反查「這張卡有沒有被盤面任何一張牌命中」，功能列的灰階判定與牌上的箭頭都讀它。
早期版本功能列讀 `f.triggered`、箭頭讀 `cardFeatHits`，結果出現「卡片顯示未觸發、牌上卻有箭頭指向它」
的矛盾畫面。`toWild` 卡例外（它不畫箭頭，狀態來自 `applyWildConvert()` 設的 `f.triggered`）。

### 參數（都在調校面板）

| 分頁 | 參數 | 預設 | 意義 |
|---|---|---|---|
| 節奏 | `cardLift` | 0.34s | 抬起動畫時長 |
| 節奏 | `cardLiftStagger` | 0.06s | 逐張錯開間隔 |
| 特效 | `cardLiftY` | 30px | 抬起高度 |
| 特效 | `cardLiftScale` | 1.10 | 抬起放大 |
| 特效 | `cardLiftTilt` | 7° | 扇形外傾角度 |
| 特效 | `cardLiftArc` | 0.25 | 中間最高的弧度（0 = 全部同高） |
| 特效 | `cardLiftBack` | 1.7 | 回彈超衝（0 = 不超衝） |
| 特效 | `arrowSize` / `arrowGlow` / `arrowBob` / `arrowBobMs` | 15 / 24 / 4 / 520 | 箭頭大小、發光、上下浮動幅度與週期 |
| 特效 | `hitFrameGlow` | 26 | 命中牌紫框的發光 |

`cardLiftArc` 這一項是實作後才發現需要的：只有外傾（tilt）時，兩側牌的外角被轉高，
視覺上中間那張反而最矮，不像扇形出牌。加了弧度讓中間最高才自然。

## 7. 素材接上的方式

- 牌面：`assets/icon_<id>.png`，`id` 照第 2 節的編碼（`icon_0.png` = 2♠、`icon_51.png` = A♣、
  `icon_52.png` = WILD、`icon_53.png` = FREE）。缺件時 `drawCard()` 自動退回白底牌＋點數＋花色。
- 下方面板：`assets/public_ui.png`（1280×126，**跨遊戲共用的公版，勿改尺寸**）。
  已確認在 file:// 下載得起來；`drawUI()` 只補 BET/WIN 動態數字與按鈕狀態框。
- 背景：`assets/bg.png`（缺件時用漸層，NG 藍、FG 紫）。

## 8. 還沒做的（不在 demo 範圍，見 spec.md 5.2）

TURBO/QUICK 節奏、音效、多語系、3D 演繹與觀景窗轉場、購買的真扣款流程、RTP 校準。
另外 §BONUS GAME／§輪盤遊戲／§說明文件／§乘積／§成就 五個分頁經使用者確認是
《東海龍王》的範本殘留，**不是這款遊戲的規格**。
