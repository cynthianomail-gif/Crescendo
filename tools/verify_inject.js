/* Crescendo demo 驗證腳本（注入用）。
   要點：1) 覆寫 rAF 讓 gameLoop 不啟動，全部同步呼叫 update()
        2) 純函式斷言 + 端對端斷言（真的走 startSpin/update 的呼叫路徑）
        3) 結果寫進 <pre id="verifyOut">，用 --dump-dom 取回 */
window.requestAnimationFrame = function () { return 0; };

var LINES = [], FAILS = 0, PASSES = 0;
function T(name, cond, extra) {
  var ok = !!cond;
  if (ok) PASSES++; else FAILS++;
  LINES.push((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra !== undefined && extra !== null ? ' | ' + extra : ''));
}
function NOTE(s) { LINES.push('---- ' + s); }
function ID(r, s) { return r * 4 + s; }

function run() {
  NOTE('BUILD=' + APP_BUILD + ' GAME=' + GAME_NAME + ' KEY=' + TUNE_KEY + ' VER=' + TUNE_VERSION);

  /* ===== 1. 註冊表完整性（漏接 META 面板上就調不到）===== */
  NOTE('1. 註冊表');
  T('符號數 = 52 牌 + WILD + FREE', SYMBOLS.length === 54, SYMBOLS.length);
  T('WILD_ID/FREE_ID', WILD_ID === 52 && FREE_ID === 53, WILD_ID + ',' + FREE_ID);
  T('盤面 1x5', COLS === 5 && ROWS === 1);
  T('牌型 10 種', HANDS.length === 10, HANDS.length);
  T('牌階 18 種', TIERS.length === 18, TIERS.length);
  T('功能卡 5 種效果', FEAT_TYPES.length === 5);
  var missT = Object.keys(DEFAULT_TIMING).filter(function (k) { return !TIMING_RANGE[k]; });
  T('每個 TIMING 都在 TIMING_META', missT.length === 0, missT.join(','));
  var missS = Object.keys(DEFAULT_TIMING).filter(function (k) { return DEFAULT_TIMING_START[k] === undefined; });
  T('每個 TIMING 都有甘特圖起點', missS.length === 0, missS.join(','));
  var missF = Object.keys(DEFAULT_FX).filter(function (k) { return !FX_RANGE[k]; });
  T('每個 FX 都在 FX_META', missF.length === 0, missF.join(','));
  var missO = Object.keys(DEFAULT_ODDS).filter(function (k) { return !ODDS_RANGE[k]; });
  T('每個 ODDS 都在 ODDS_META', missO.length === 0, missO.join(','));
  T('LAYOUT_META 覆蓋所有 LAYOUT key',
    Object.keys(DEFAULT_LAYOUT).every(function (k) {
      return LAYOUT_META.some(function (m) { return m[0] === k; });
    }));
  var lmErr = null;
  LAYOUT_META.forEach(function (m) {
    try {
      var r = m[2](LAYOUT[m[0]]);
      if (!r || typeof r.x !== 'number' || typeof r.w !== 'number') throw new Error('bad rect ' + m[0]);
    } catch (e) { lmErr = e.message; }
  });
  T('LAYOUT_META 外框函式可用', lmErr === null, lmErr || '');

  /* ===== 2. 牌型判定（純函式，含 WILD 與順子邊界）===== */
  NOTE('2. 牌型判定');
  function K(ids) { var h = classifyHand(ids); return h ? h.key : 'none'; }
  T('一對',     K([ID(0,0), ID(0,1), ID(3,0), ID(5,1), ID(7,2)]) === 'pair');
  T('兩對',     K([ID(0,0), ID(0,1), ID(3,0), ID(3,1), ID(7,2)]) === 'twopair');
  T('三條',     K([ID(0,0), ID(0,1), ID(0,2), ID(3,0), ID(7,2)]) === 'three');
  T('葫蘆',     K([ID(0,0), ID(0,1), ID(0,2), ID(3,0), ID(3,1)]) === 'full');
  T('鐵支',     K([ID(0,0), ID(0,1), ID(0,2), ID(0,3), ID(3,0)]) === 'four');
  T('五條(重複牌)', K([ID(0,0), ID(0,1), ID(0,2), ID(0,3), ID(0,0)]) === 'five');
  T('同花',     K([ID(0,0), ID(1,0), ID(2,0), ID(4,0), ID(6,0)]) === 'flush');
  T('順子(混花)', K([ID(0,0), ID(1,1), ID(2,2), ID(3,3), ID(4,0)]) === 'straight');
  T('同花順',   K([ID(0,0), ID(1,0), ID(2,0), ID(3,0), ID(4,0)]) === 'stflush');
  T('皇家同花順', K([ID(8,0), ID(9,0), ID(10,0), ID(11,0), ID(12,0)]) === 'royal');
  // 順子邊界 [§賠率表 B25:B27]
  T('最小順子 A2345 成立', K([ID(12,0), ID(0,1), ID(1,2), ID(2,3), ID(3,0)]) === 'straight');
  T('A2345 同花 = 同花順(非皇家)', K([ID(12,0), ID(0,0), ID(1,0), ID(2,0), ID(3,0)]) === 'stflush');
  T('JQKA2 不算順子', K([ID(9,0), ID(10,1), ID(11,2), ID(12,3), ID(0,0)]) === 'none');
  T('9-10-J-Q-K 同花 = 同花順(非皇家)', K([ID(7,0), ID(8,0), ID(9,0), ID(10,0), ID(11,0)]) === 'stflush');
  // WILD 替代
  T('WILD+散牌 = 一對',   K([WILD_ID, ID(0,0), ID(3,0), ID(5,1), ID(7,2)]) === 'pair');
  T('WILD+一對 = 三條',   K([WILD_ID, ID(0,0), ID(0,1), ID(3,0), ID(7,2)]) === 'three');
  T('WILD+三條 = 鐵支',   K([WILD_ID, ID(0,0), ID(0,1), ID(0,2), ID(3,0)]) === 'four');
  T('WILD+兩對 = 葫蘆',   K([WILD_ID, ID(0,0), ID(0,1), ID(3,0), ID(3,1)]) === 'full');
  T('WILD+10JQK同花 = 皇家', K([WILD_ID, ID(8,0), ID(9,0), ID(10,0), ID(11,0)]) === 'royal');
  T('5 張 WILD = 五條',   K([WILD_ID, WILD_ID, WILD_ID, WILD_ID, WILD_ID]) === 'five');
  T('取賠率最高者(葫蘆>三條)',
    classifyHand([ID(0,0), ID(0,1), ID(0,2), ID(3,0), ID(3,1)]).pay === 2.5);
  T('盤面有 FREE 時不判牌型',
    classifyHand([FREE_ID, ID(0,0), ID(0,1), ID(3,0), ID(7,2)]) === null);
  T('五張散牌無牌型', K([ID(0,0), ID(2,1), ID(4,2), ID(6,3), ID(9,0)]) === 'none');

  /* ===== 3. 差一張預報 findDraw ===== */
  NOTE('3. 差一張預報');
  var dfl = findDraw([ID(0,0), ID(1,0), ID(2,0), ID(4,0), ID(6,1)]);
  T('差一張成同花：找到第 5 格', dfl && dfl.kind === 'flush' && dfl.cell === 4,
    dfl ? dfl.kind + '@' + dfl.cell + ' needs=' + dfl.needs.length : 'null');
  var dst = findDraw([ID(0,0), ID(1,1), ID(2,2), ID(3,3), ID(7,0)]);
  T('差一張成順子：找到第 5 格', dst && dst.kind === 'straight' && dst.cell === 4,
    dst ? dst.kind + '@' + dst.cell + ' needs=' + dst.needs.length : 'null');
  T('差一張成順子：needs 含 6 與 A（兩種完成法）', dst && dst.needs.length === 8, dst ? dst.needs.length : '-');
  T('已成牌型時不回報 draw', findDraw([ID(0,0), ID(0,1), ID(0,2), ID(0,3), ID(3,0)]) === null);

  /* ===== 4. 功能卡效果（企劃 H72:H81）===== */
  NOTE('4. 功能卡');
  function setFeat(key, val) {
    features = [{ type: FEAT_IDX[key], tier: 0, value: val, triggered: true, flash: 0 }];
    payUnits = 1; curMult = 1;
    applyFeatureAt(0);
  }
  setFeat('addScore', 5);  T('加得分 +5 → payUnits 1→6', payUnits === 6, payUnits);
  setFeat('mulScore', 3);  T('乘得分 ×3 → payUnits 1→3', payUnits === 3, payUnits);
  setFeat('addMul', 10);   T('加倍數 +10 → mult 1→11', curMult === 11, curMult);
  setFeat('mulMul', 2);    T('乘倍數 ×2 → mult 1→2', curMult === 2, curMult);
  T('高倍卡門檻：加得分 25 是高倍',
    isHighFeat({ type: FEAT_IDX.addScore, value: 25 }) === true);
  T('高倍卡門檻：加得分 1 不是高倍',
    isHighFeat({ type: FEAT_IDX.addScore, value: 1 }) === false);
  // 轉換 WILD：該牌轉為 WILD 但保留原牌階 [§一般遊戲 H81]
  // 5 格全部固定：其餘 4 格都不是點數 '2'，否則會被一起轉換（正確行為，但會讓斷言間歇性失敗）
  board[0][0] = newCell(ID(0, 0));           // 2♠  ← 唯一該被轉換的
  board[1][0] = newCell(ID(5, 1));
  board[2][0] = newCell(ID(7, 2));
  board[3][0] = newCell(ID(9, 3));
  board[4][0] = newCell(ID(11, 0));
  features = [{ type: FEAT_IDX.toWild, tier: 0, value: 0, triggered: false, flash: 0 }];  // tier 0 = 點數 '2'
  var conv = applyWildConvert();
  T('轉換WILD：命中該牌階', conv.length === 1 && conv[0] === 0, conv.join(','));
  T('轉換WILD：牌變 WILD', board[0][0].id === WILD_ID);
  T('轉換WILD：保留原牌階', tierIdAt(0) === ID(0, 0), tierIdAt(0));
  // 牌階比對
  T('牌階 rank 比對', tierMatches({ kind: 'rank', v: 0 }, ID(0, 2)) === true);
  T('牌階 suit 比對', tierMatches({ kind: 'suit', v: 3 }, ID(7, 3)) === true);
  T('牌階 人頭=J/Q/K', tierMatches({ kind: 'face' }, ID(9, 0)) && tierMatches({ kind: 'face' }, ID(11, 0)));
  T('牌階 人頭不含 A', tierMatches({ kind: 'face' }, ID(12, 0)) === false);
  T('牌階 WILD 不屬任何牌階', tierMatches({ kind: 'rank', v: 0 }, WILD_ID) === false);

  /* ===== 5. 得分／KMBT 格式 ===== */
  NOTE('5. 得分與 KMBT');
  ODDS.bet = 100; ODDS.payMul = 1;
  payUnits = 0.1; curMult = 1;
  T('得分 = 押注 × 牌型賠率（一對 0.1 × 100）', scoreNow() === 10, scoreNow());
  payUnits = 0.1; curMult = 7;
  T('彩金 = 得分 × 倍數', winNow() === 70, winNow());
  T('KMBT：999999 不縮寫', fmtScore(999999) === '999,999', fmtScore(999999));
  T('KMBT：1234567 → 1.23M', fmtScore(1234567) === '1.23M', fmtScore(1234567));
  T('KMBT：1.5e9 → 1.50B', fmtScore(1500000000) === '1.50B', fmtScore(1500000000));
  T('KMBT：2e12 → 2.00T', fmtScore(2000000000000) === '2.00T', fmtScore(2000000000000));
  T('高倍數字門檻：>100×押注', isHighScore(10001) === true && isHighScore(9999) === false);
  T('得分層級：1 階 (<25×)', tierOf(2000) === 1, tierOf(2000));
  T('得分層級：2 階 (25~101×)', tierOf(5000) === 2, tierOf(5000));
  T('得分層級：3 階 (>=101×)', tierOf(20000) === 3, tierOf(20000));

  /* ===== 6. 強開盤面生成 ===== */
  NOTE('6. 強開生成');
  HANDS.forEach(function (h) {
    var ids = makeHand(h.key);
    var got = ids ? classifyHand(ids) : null;
    T('強開生成 ' + h.name, !!ids && got && got.key === h.key, got ? got.key : 'null');
  });
  var dsi = makeHand('drawst'), dfi = makeHand('drawfl');
  T('強開生成 差一張(順子)', !!dsi && classifyHand(dsi) === null && findDraw(dsi).kind === 'straight');
  T('強開生成 差一張(同花)', !!dfi && classifyHand(dfi) === null && findDraw(dfi).kind === 'flush');
  T('強開選單 21 項', forceMenuOptions().length === 21, forceMenuOptions().length);
  var fmr = forceMenuRect();
  T('強開選單幾何：rects 數 = 選項數', fmr.rects.length === fmr.opts.length);
  T('強開選單不超出畫面上緣', fmr.my0 >= 0, 'my0=' + fmr.my0);

  /* ===== 7. 端對端：真的走 startSpin / update() ===== */
  NOTE('7. 端對端（走真正的呼叫路徑）');
  function playSpin(max) {
    var hist = {}, n = 0;
    startSpin();
    hist[currentState] = 1;
    while (n < (max || 200000)) {
      update(); n++;
      hist[currentState] = (hist[currentState] || 0) + 1;
      if (currentState === STATE.IDLE && !inFG) break;
    }
    return { steps: n, hist: hist };
  }
  function reset() {
    inFG = false; isSFG = false; isAutoSpinning = false; isPaused = false;
    currentState = STATE.IDLE; stateTimer = 0;
    startMult = 1; freeCount = 0; fgPending = false;
    stats = { spins: 0, hits: 0 }; totalScore = 0; spinWin = 0; fgWin = 0;
    features = []; generateBoard();
    TIMING_AUTO  = Object.assign({}, DEFAULT_TIMING);
    TIMING_TURBO = Object.assign({}, DEFAULT_TIMING_TURBO);
    setSpeedMode('auto');
    FX = Object.assign({}, DEFAULT_FX);
    ODDS = Object.assign({}, DEFAULT_ODDS);
    applyTuning(); syncLayoutDerived();
  }

  // 7a 普通中獎
  reset(); forceSpinType = 'pair';
  var r1 = playSpin();
  T('7a 強開一對：本局有得分', spinWin > 0, 'spinWin=' + spinWin + ' steps=' + r1.steps);
  T('7a 走過 SHOWING_WIN', !!r1.hist[STATE.SHOWING_WIN]);
  T('7a 走過 SCORE_RUN', !!r1.hist[STATE.SCORE_RUN]);
  T('7a 走過 RESPIN_PREP（得分後必重轉）', !!r1.hist[STATE.RESPIN_PREP]);
  T('7a 局末回到 IDLE', currentState === STATE.IDLE);
  T('7a 統計有記到一局', stats.spins === 1 && stats.hits === 1, stats.spins + '/' + stats.hits);

  // 7b 2~4 張：鎖定得分牌，其餘重轉
  // wToWild=0：不讓隨機發到的「轉換WILD」卡把牌換成 WILD 而改變牌型（那會讓本測試間歇性失敗）
  reset(); ODDS.wToWild = 0; forceSpinType = 'four';
  startSpin();
  var lockedSeen = -1, n2 = 0;
  while (n2 < 200000) {
    update(); n2++;
    if (currentState === STATE.RESPIN_PREP) {
      lockedSeen = handResult ? handResult.cells.length : -1;
      break;
    }
    if (currentState === STATE.IDLE && !inFG) break;
  }
  T('7b 鐵支＝4 張成牌（走 2~4 張重轉分支）', lockedSeen === 4, 'cells=' + lockedSeen);
  while (n2 < 400000 && !(currentState === STATE.IDLE && !inFG)) { update(); n2++; }

  // 7c 5 張全中 → 起始倍數加倍
  reset(); forceSpinType = 'flush';
  startSpin();
  var boostSeen = false, multAt = 0, n3 = 0;
  while (n3 < 200000) {
    update(); n3++;
    if (currentState === STATE.MULT_BOOST) { boostSeen = true; }
    if (boostSeen && startMult >= 2 && !multAt) multAt = startMult;
    if (currentState === STATE.IDLE && !inFG) break;
  }
  T('7c 同花＝5 張成牌 → 走 MULT_BOOST', boostSeen);
  T('7c 起始倍數加倍（×1→×2）', multAt >= 2, 'startMult=' + startMult);

  // 7d 差一張 → 只重轉那一張，且不新增功能卡
  // wToWild=0：轉換WILD 會在判定前把牌變 WILD，湊成順子就不再是「差一張」（真實行為，但會干擾本測試）
  reset(); ODDS.wToWild = 0; forceSpinType = 'drawst';
  startSpin();
  var drawSeen = false, featAtDraw = -1, spinColsAtDraw = -1, n4 = 0;
  while (n4 < 200000) {
    update(); n4++;
    if (currentState === STATE.DRAW_HINT && !drawSeen) {
      drawSeen = true;
      featAtDraw = features.length;
    }
    if (drawSeen && spinColsAtDraw < 0 && currentState === STATE.SPINNING) {
      spinColsAtDraw = spinCols.filter(Boolean).length;
      T('7d 只重轉 1 格', spinColsAtDraw === 1, 'cols=' + spinColsAtDraw);
      T('7d 此重轉不新增功能卡', features.length === featAtDraw,
        featAtDraw + '→' + features.length);
    }
    if (currentState === STATE.IDLE && !inFG) break;
  }
  T('7d 走過 DRAW_HINT', drawSeen);

  // 7e FREE 收集 → 進 FG → 跑完 5 局 → 回 NG
  reset(); forceSpinType = 'free3';
  var hist5 = {}, n5 = 0, fgSpinCount = 0, prevFgLeft = -1, featAtFgEnter = -1, multAtFgEnter = -1;
  startSpin();
  while (n5 < 900000) {
    update(); n5++;
    hist5[currentState] = 1;
    if (inFG && fgLeft !== prevFgLeft) {
      if (prevFgLeft >= 0) fgSpinCount++;
      else { featAtFgEnter = features.length; multAtFgEnter = startMult; }
      prevFgLeft = fgLeft;
    }
    if (currentState === STATE.IDLE && !inFG) break;
  }
  T('7e FREE×3 走過 FREE_COLLECT', !!hist5[STATE.FREE_COLLECT]);
  T('7e 走過 FG_ENTER', !!hist5[STATE.FG_ENTER]);
  T('7e 走過 FG_END', !!hist5[STATE.FG_END]);
  T('7e FG 跑完回到 NG', inFG === false);
  T('7e FG 實跑 5 局', fgSpinCount === 5, 'fgSpins=' + fgSpinCount);
  T('7e FG 免費局不計入押注局數（stats.spins 只算 NG）', stats.spins === 1, 'spins=' + stats.spins);
  NOTE('7e 進 FG 時：功能卡 ' + featAtFgEnter + ' 張、起始倍數 ×' + multAtFgEnter + '（企劃 D29：應保留不重置）');

  // 7f 購買 SUPER FREE → 帶 5 張功能卡進 FG
  reset(); forceSpinType = 'buysf';
  startSpin();
  var n6 = 0;
  while (n6 < 200000 && !inFG) { update(); n6++; }
  T('7f 買 SUPER FREE → 進 FG', inFG === true);
  T('7f SFG 帶 5 張功能卡', features.length === 5, 'len=' + features.length);
  T('7f SFG 旗標', isSFG === true);
  while (n6 < 600000 && (inFG || currentState !== STATE.IDLE)) { update(); n6++; }
  T('7f SFG 結束回 NG', inFG === false);

  // 7g 購買 3/5 FEATURES 與 FREE HUNT
  reset(); forceSpinType = 'buy3f'; startSpin();
  T('7g 買 3 FEATURES → 開局 3 張卡', features.length === 3, features.length);
  reset(); forceSpinType = 'buy5f'; startSpin();
  T('7g 買 5 FEATURES → 開局 5 張卡', features.length === 5, features.length);
  reset(); forceSpinType = 'buyhunt'; startSpin();
  T('7g FREE HUNT → 預收集 1 個 FREE', freeCount === 1, freeCount);

  // 7h 同一具體牌組不重複計分（D56）
  reset();
  scoredKeys = new Set();
  handResult = null;
  board[0][0] = newCell(ID(0, 0)); board[1][0] = newCell(ID(0, 1));
  board[2][0] = newCell(ID(3, 0)); board[3][0] = newCell(ID(5, 1));
  board[4][0] = newCell(ID(7, 2));
  features = []; roundIdx = 0; drawRespinUsed = 99; ODDS.drawRespinMax = 0;
  currentState = STATE.CHECKING; enterChecking();
  var first = handResult !== null;
  currentState = STATE.CHECKING; enterChecking();
  var second = handResult !== null;
  T('7h 同一牌組第一次計分', first === true);
  T('7h 同一牌組第二次不計分', second === false);

  /* ===== 8. 節奏參數真的接上（拉極端值看演出長度變化）===== */
  NOTE('8. 節奏參數接線（端對端）');
  function countState(target, apply) {
    reset();
    ODDS.maxRound = 1;          // 固定單回合，排除「連爆回合數隨機」造成的雜訊
    apply(); applyTuning();
    forceSpinType = 'pair';     // 一對＝0.1×100＝10，ratio 0.1 → 必定是 1 階
    var c = 0, n = 0;
    startSpin();
    while (n < 400000) {
      update(); n++;
      if (currentState === target) c++;
      if (currentState === STATE.IDLE && !inFG) break;
    }
    return c;
  }
  var sp1 = countState(STATE.SPINNING, function () { TIMING.reelStart = 0.5; });
  var sp2 = countState(STATE.SPINNING, function () { TIMING.reelStart = 3.0; });
  T('拉長「啟動→第1輪停」→ SPINNING 幀數變多', sp2 > sp1 * 1.5, sp1 + ' → ' + sp2);
  var wh1 = countState(STATE.SHOWING_WIN, function () { TIMING.winHold = 0.1; TIMING.cardLock = 0.1; });
  var wh2 = countState(STATE.SHOWING_WIN, function () { TIMING.winHold = 3.0; TIMING.cardLock = 1.0; });
  T('拉長「停輪後中獎停頓」→ SHOWING_WIN 幀數變多', wh2 > wh1 * 2, wh1 + ' → ' + wh2);
  var sr1 = countState(STATE.SCORE_RUN, function () { TIMING.scoreAppear = 0.1; });
  var sr2 = countState(STATE.SCORE_RUN, function () { TIMING.scoreAppear = 4.0; });
  T('拉長「中獎後出現分數」→ SCORE_RUN 幀數變多', sr2 > sr1 * 2, sr1 + ' → ' + sr2);
  var ph1 = countState(STATE.PRE_HOLD, function () { TIMING.preHold1 = 0.05; });
  var ph2 = countState(STATE.PRE_HOLD, function () { TIMING.preHold1 = 3.0; });
  T('拉長「1階演繹前停留」→ PRE_HOLD 幀數變多', ph2 > ph1 * 2, ph1 + ' → ' + ph2);

  /* ===== 9. 調校面板四分頁 + 儲存往返 ===== */
  NOTE('9. 面板與儲存');
  reset();
  ['timing', 'layout', 'fx', 'odds'].forEach(function (t) {
    var ok = true, cnt = 0, msg = '';
    try { tuneTab = t; refreshTuneBody(); cnt = tuneBody.children.length; }
    catch (e) { ok = false; msg = e.message; }
    T('分頁建得起來：' + t, ok && cnt > 0, 'children=' + cnt + (msg ? ' ' + msg : ''));
  });
  ODDS.bet = 250; TIMING.winHold = 1.25; LAYOUT.grid.x = 300; FX.shake2 = 9;
  T('saveTuning 成功', saveTuning() === true);
  ODDS.bet = 10; TIMING.winHold = 0.1; LAYOUT.grid.x = 999; FX.shake2 = 1;
  loadTuning();
  T('儲存往返：odds', ODDS.bet === 250, ODDS.bet);
  T('儲存往返：timing', Math.abs(TIMING.winHold - 1.25) < 1e-9, TIMING.winHold);
  T('儲存往返：layout', LAYOUT.grid.x === 300, LAYOUT.grid.x);
  T('儲存往返：fx', FX.shake2 === 9, FX.shake2);
  T('儲存往返後 GRID_X 同步', GRID_X === 300, GRID_X);
  localStorage.setItem(TUNE_KEY, JSON.stringify({ version: TUNE_VERSION - 1, odds: { bet: 777 } }));
  loadTuning();
  T('舊版本保存值自動作廢', ODDS.bet === DEFAULT_ODDS.bet, ODDS.bet);
  localStorage.setItem(TUNE_KEY, '{ this is not json');
  var loadErr = null;
  try { loadTuning(); } catch (e) { loadErr = e.message; }
  T('壞掉的保存值不會炸', loadErr === null, loadErr || '');
  localStorage.removeItem(TUNE_KEY);

  /* ===== 10. 繪製不拋錯（各狀態都畫一次）===== */
  NOTE('10. 繪製');
  reset();
  var drawErr = null;
  try {
    var sts = [STATE.IDLE, STATE.SPINNING, STATE.FREE_COLLECT, STATE.WILD_CONVERT,
               STATE.SHOWING_WIN, STATE.FEAT_APPLY, STATE.PRE_HOLD, STATE.SCORE_RUN,
               STATE.POST_HOLD, STATE.MULT_BOOST, STATE.RESPIN_PREP, STATE.DRAW_HINT,
               STATE.MULT_SLAM, STATE.SCORE_HOLD,
               STATE.BIGWIN, STATE.FG_ENTER, STATE.FG_END];
    features = rollFeatures(5);
    handLabelText = 'FLUSH DRAW'; handLabelKind = 'draw';
    drawInfo = { cell: 2, kind: 'flush', needs: [1, 2, 3] };
    winCells = new Set([0, 1]);
    wildBeams = [{ c: 1, t: 4 }];
    freeCount = 2;
    // 強制讓「抬起」與「命中箭頭」的繪製路徑一定被走到（不靠隨機發牌碰運氣）
    cardFeatHits = [[0], [], [0, 1], [], [1]];
    featOrder = [0, 1]; featCursor = 0;
    setLiftTargets();
    for (var lq = 0; lq < F_CARDLIFT + F_LIFTSTAG * 6 + 5; lq++) updateLift();
    for (var i = 0; i < sts.length; i++) {
      currentState = sts[i];
      bigWinLabel = 'MEGA WIN';
      showForceMenu = (i % 2 === 0);
      draw();
    }
    showForceMenu = false;
    isPaused = true; draw(); isPaused = false;
    inFG = true; fgLeft = 3; draw(); inFG = false;
  } catch (e) { drawErr = (e && e.stack) ? e.stack.split('\n')[0] : String(e); }
  T('draw() 在所有狀態都不拋錯', drawErr === null, drawErr || '');

  /* ===== 10b. 得分牌抬起（出牌感）與功能卡命中箭頭 ===== */
  NOTE('10b. 抬起與箭頭');
  reset();
  T('TUNE_VERSION 已升版（DEFAULT 結構有變）', TUNE_VERSION === 7, TUNE_VERSION);

  // --- 哪張牌命中哪張功能卡 ---
  var T_RANK2 = 0, T_SUIT_H = 14, T_FACE = 17;   // TIERS: 0~12 點數 / 13~16 ♠♥♦♣ / 17 人頭
  T('TIERS 索引假設正確',
    TIERS[T_RANK2].kind === 'rank' && TIERS[T_RANK2].v === 0
    && TIERS[T_SUIT_H].kind === 'suit' && TIERS[T_SUIT_H].v === 1
    && TIERS[T_FACE].kind === 'face');
  board[0][0] = newCell(ID(0, 1));    // 2♥ → 命中「點數2」與「♥」
  board[1][0] = newCell(ID(9, 0));    // J♠ → 命中「人頭」
  board[2][0] = newCell(ID(0, 3));    // 2♣ → 命中「點數2」
  board[3][0] = newCell(ID(0, 2));    // 2♦ → 牌階對得上，但**不是得分牌** → 不該有箭頭
  board[4][0] = newCell(ID(11, 1));   // K♥ → 命中「♥」與「人頭」
  // 功能卡只跟得分牌比對 [§美術 G11/G24/G25]，所以要先指定哪幾格是得分牌
  handResult = { key: 'test', cells: [0, 1, 2, 4] };
  features = [
    { type: FEAT_IDX.addScore, tier: T_RANK2,  value: 1, triggered: false, flash: 0 },
    { type: FEAT_IDX.addMul,   tier: T_SUIT_H, value: 2, triggered: false, flash: 0 },
    { type: FEAT_IDX.mulMul,   tier: T_FACE,   value: 2, triggered: false, flash: 0 },
  ];
  computeCardFeatHits();
  T('命中「點數2」的卡 → 第 0、2 格',
    cardFeatHits[0].indexOf(0) >= 0 && cardFeatHits[2].indexOf(0) >= 0, JSON.stringify(cardFeatHits));
  T('命中「♥」的卡 → 第 0、4 格',
    cardFeatHits[0].indexOf(1) >= 0 && cardFeatHits[4].indexOf(1) >= 0);
  T('命中「人頭」的卡 → 第 1、4 格',
    cardFeatHits[1].indexOf(2) >= 0 && cardFeatHits[4].indexOf(2) >= 0);
  T('非得分牌即使牌階對上也不命中（2♦ 不在得分牌組裡）',
    !cardHasFeat(3), JSON.stringify(cardFeatHits[3]));
  T('一張牌可同時命中多張卡', cardFeatHits[4].length === 2, cardFeatHits[4].length);
  // 把第 3 格納入得分牌組，同一張 2♦ 就該被「點數2」的卡命中——證明差別真的來自「有沒有得分」
  handResult = { key: 'test', cells: [0, 1, 2, 3, 4] };
  computeCardFeatHits();
  T('同一張 2♦ 一旦變成得分牌就命中了', cardFeatHits[3].indexOf(0) >= 0,
    JSON.stringify(cardFeatHits[3]));
  handResult = { key: 'test', cells: [0, 1, 2, 4] };
  computeCardFeatHits();

  // 功能列的灰階與牌上的箭頭必須是同一份事實（否則會出現卡片說沒觸發、牌上卻有箭頭）
  T('featIsHit 與箭頭一致：點數2 的卡被命中', featIsHit(0) === true);
  T('featIsHit 與箭頭一致：♥ 的卡被命中', featIsHit(1) === true);
  T('featIsHit 與箭頭一致：人頭 的卡被命中', featIsHit(2) === true);
  features.push({ type: FEAT_IDX.addScore, tier: 8, value: 1, triggered: true, flash: 0 });
  computeCardFeatHits();
  T('featIsHit：沒有牌命中的卡回 false（即使 triggered 被亂設）',
    featIsHit(3) === false, '盤面沒有點數 10');
  features.pop();
  computeCardFeatHits();

  // 轉換WILD 卡另有向下光子演繹，不列入箭頭
  features = [{ type: FEAT_IDX.toWild, tier: T_RANK2, value: 0, triggered: false, flash: 0 }];
  computeCardFeatHits();
  T('轉換WILD 卡不畫箭頭', !cardHasFeat(0) && !cardHasFeat(2));

  // featTriggered 也只認得分牌（這條管的是「得分」，不只是箭頭）
  var fRank2 = { type: FEAT_IDX.addScore, tier: T_RANK2, value: 1, triggered: false, flash: 0 };
  handResult = { key: 'test', cells: [0] };          // 2♥ 得分
  T('featTriggered：得分牌對上 → 觸發', featTriggered(fRank2) === true);
  handResult = { key: 'test', cells: [1] };          // 只有 J♠ 得分，2♥/2♣/2♦ 都沒得分
  T('featTriggered：只有非得分牌對上 → 不觸發', featTriggered(fRank2) === false);
  handResult = { key: 'test', cells: [0, 1, 2, 4] };

  // 被轉成 WILD 的牌仍保留原牌階 → 箭頭照樣要指到它 [§一般遊戲 H81]
  features = [
    { type: FEAT_IDX.toWild,   tier: T_RANK2, value: 0, triggered: false, flash: 0 },
    { type: FEAT_IDX.addScore, tier: T_RANK2, value: 5, triggered: false, flash: 0 },
  ];
  applyWildConvert();
  T('轉換WILD 真的把牌變 WILD 了', board[0][0].id === WILD_ID);
  handResult = { key: 'test', cells: [0, 1, 2, 4] };
  computeCardFeatHits();
  T('轉成 WILD 的牌仍被加得分卡命中（雙重身分）',
    cardFeatHits[0].indexOf(1) >= 0, JSON.stringify(cardFeatHits[0]));

  // --- 抬起狀態機 ---
  reset();
  TIMING.cardLift = 0.20; TIMING.cardLiftStagger = 0.05; applyTuning();
  winCells = new Set([0, 2, 4]);
  setLiftTargets();
  T('抬起目標：得分牌 = 1',
    board[0][0].liftTarget === 1 && board[2][0].liftTarget === 1 && board[4][0].liftTarget === 1);
  T('抬起目標：非得分牌 = 0',
    board[1][0].liftTarget === 0 && board[3][0].liftTarget === 0);
  T('逐張錯開：第 1 張不延遲，後面依序遞增',
    board[0][0].liftDelay === 0 && board[2][0].liftDelay === F_LIFTSTAG
    && board[4][0].liftDelay === F_LIFTSTAG * 2,
    board[0][0].liftDelay + ',' + board[2][0].liftDelay + ',' + board[4][0].liftDelay);
  for (var lf = 0; lf < F_CARDLIFT + F_LIFTSTAG * 3 + 5; lf++) updateLift();
  T('跑完後得分牌抬到頂', board[0][0].lift === 1 && board[4][0].lift === 1,
    board[0][0].lift + ',' + board[4][0].lift);
  T('非得分牌不抬起', board[1][0].lift === 0);
  clearLift();
  for (var lf2 = 0; lf2 < F_CARDLIFT + 5; lf2++) updateLift();
  T('clearLift 後牌落回盤面', board[0][0].lift === 0 && board[4][0].lift === 0,
    board[0][0].lift + ',' + board[4][0].lift);

  // --- 回彈超衝（出牌的彈出感）---
  FX.cardLiftBack = 1.7;
  var peak = 0;
  for (var q = 0; q <= 100; q++) peak = Math.max(peak, liftEase(q / 100));
  T('超衝：中途會超過 1（彈出後回落）', peak > 1.02, 'peak=' + peak.toFixed(3));
  T('超衝：兩端仍是 0 與 1', liftEase(0) === 0 && liftEase(1) === 1);
  FX.cardLiftBack = 0;
  var peak0 = 0;
  for (var q2 = 0; q2 <= 100; q2++) peak0 = Math.max(peak0, liftEase(q2 / 100));
  T('超衝設 0 就不超過 1', peak0 <= 1.0001, 'peak=' + peak0.toFixed(3));
  FX.cardLiftBack = DEFAULT_FX.cardLiftBack;

  // --- 箭頭顯示時機 ---
  currentState = STATE.SHOWING_WIN; T('箭頭在 SHOWING_WIN 顯示', showFeatArrows() === true);
  currentState = STATE.FEAT_APPLY;  T('箭頭在 FEAT_APPLY 顯示', showFeatArrows() === true);
  currentState = STATE.SCORE_RUN;   T('箭頭在 SCORE_RUN 顯示', showFeatArrows() === true);
  currentState = STATE.IDLE;        T('箭頭在待機不顯示', showFeatArrows() === false);
  currentState = STATE.SPINNING;    T('箭頭在轉動中不顯示', showFeatArrows() === false);
  currentState = STATE.DRAW_HINT;   T('箭頭在差一張預報不顯示', showFeatArrows() === false);

  // --- 端對端：真的走 startSpin/update，得分時牌會抬起 ---
  reset(); ODDS.wToWild = 0; ODDS.maxRound = 1; forceSpinType = 'pair';
  startSpin();
  var liftSeen = 0, e2e = 0;
  while (e2e < 200000) {
    update(); e2e++;
    if (winCells) {
      var mx = 0;
      winCells.forEach(function (c) { mx = Math.max(mx, board[c][0].lift); });
      if (mx > liftSeen) liftSeen = mx;
    }
    if (currentState === STATE.IDLE && !inFG) break;
  }
  T('端對端：得分時得分牌抬到頂', liftSeen === 1, 'maxLift=' + liftSeen);

  function liftFrames(sec) {
    reset(); ODDS.wToWild = 0; ODDS.maxRound = 1;
    TIMING.cardLift = sec; TIMING.cardLiftStagger = 0; applyTuning();
    forceSpinType = 'pair';
    startSpin();
    var n = 0, from = -1, to = -1;
    while (n < 200000) {
      update(); n++;
      if (winCells) {
        if (from < 0) from = n;
        var top = true;
        winCells.forEach(function (c) { if (board[c][0].lift < 1) top = false; });
        if (top && to < 0) to = n;
      }
      if (currentState === STATE.IDLE && !inFG) break;
    }
    return (from >= 0 && to >= 0) ? to - from : -1;
  }
  var lfA = liftFrames(0.1), lfB = liftFrames(1.0);
  T('端對端：拉長抬起時長 → 抬到頂的幀數變多', lfA > 0 && lfB > lfA * 4, lfA + ' → ' + lfB);

  /* ===== 10d. 【得分相乘演繹】[§美術需求說明 F47/H47] 與【復原演繹】[H48] ===== */
  NOTE('10d. 得分相乘演繹');
  reset();

  // --- 位移幾何：靠攜完成時兩框真的碰在一起（只留 slamGap）---
  slamK = 0;
  var sh0 = slamShift();
  T('10d 未演繹時兩欄在原位', Math.abs(sh0.sdx) < 1e-9 && Math.abs(sh0.mdx) < 1e-9,
    sh0.sdx + '/' + sh0.mdx);
  slamK = 1;
  var sh1 = slamShift();
  var lRight = LAYOUT.scoreBox.x + sh1.sdx + LAYOUT.scoreBox.w;
  var rLeft  = LAYOUT.multBox.x + sh1.mdx;
  T('10d 靠攜後兩框間距 = slamGap', Math.abs((rLeft - lRight) - FX.slamGap) < 1e-6,
    'gap=' + (rLeft - lRight).toFixed(3) + ' 期望=' + FX.slamGap);
  T('10d 碰撞點落在兩框中線（蓋過×符號）',
    Math.abs((lRight + rLeft) / 2 - sh0.gapCx) < 1e-6,
    'hit=' + ((lRight + rLeft) / 2).toFixed(2) + ' ×符號=' + sh0.gapCx);
  T('10d 兩框靠攜方向相反（得分往右、倍數往左）', sh1.sdx > 0 && sh1.mdx < 0,
    sh1.sdx.toFixed(1) + '/' + sh1.mdx.toFixed(1));
  // 拖過佈局分頁也不能跑掉
  var keepX = LAYOUT.multBox.x;
  LAYOUT.multBox.x = keepX + 60;
  var sh2 = slamShift();
  T('10d 改佈局後碰撞點跟著走',
    Math.abs((LAYOUT.scoreBox.x + sh2.sdx + LAYOUT.scoreBox.w + LAYOUT.multBox.x + sh2.mdx) / 2 - sh2.gapCx) < 1e-6);
  LAYOUT.multBox.x = keepX;
  slamK = 0;

  // --- 端對端：真的走 startSpin/update，看演繹順序與碰撞事件 ---
  function slamRun(force) {
    reset(); ODDS.wToWild = 0; ODDS.maxRound = 1; forceSpinType = force || 'pair';
    var order = [], hitAt = -1, resAt = -1, restored = -1, n = 0, prev = -1;
    var maxShift = 0, resScore = 0, resBase = 0, resMult = 0;
    startSpin();
    while (n < 200000) {
      update(); n++;
      if (currentState !== prev) { order.push(currentState); prev = currentState; }
      if (slamHit && hitAt < 0) hitAt = n;
      if (slamResult && resAt < 0) {
        resAt = n; resScore = slamResult.score; resBase = slamResult.base; resMult = slamResult.mult;
      }
      maxShift = Math.max(maxShift, Math.abs(slamShift().sdx));
      if (hitAt > 0 && restored < 0 && slamK <= 1e-6
          && currentState !== STATE.MULT_SLAM && currentState !== STATE.PRE_HOLD) restored = n;
      if (currentState === STATE.IDLE && !inFG) break;
    }
    return { order: order, hitAt: hitAt, resAt: resAt, restored: restored, steps: n,
             maxShift: maxShift, resScore: resScore, resBase: resBase, resMult: resMult };
  }
  function idxOf(order, st) { return order.indexOf(st); }

  var sr = slamRun('pair');
  T('10d 端對端：走過 MULT_SLAM', idxOf(sr.order, STATE.MULT_SLAM) >= 0, sr.order.join('>'));
  T('10d 端對端：走過 SCORE_HOLD', idxOf(sr.order, STATE.SCORE_HOLD) >= 0);
  T('10d 順序：PRE_HOLD → MULT_SLAM',
    idxOf(sr.order, STATE.PRE_HOLD) >= 0 && idxOf(sr.order, STATE.MULT_SLAM) > idxOf(sr.order, STATE.PRE_HOLD));
  T('10d 順序：MULT_SLAM → POST_HOLD（演繹後、跑分前停留）',
    idxOf(sr.order, STATE.POST_HOLD) > idxOf(sr.order, STATE.MULT_SLAM));
  T('10d 順序：POST_HOLD → SCORE_RUN（停留完才跑分）[§層級 F5]',
    idxOf(sr.order, STATE.SCORE_RUN) > idxOf(sr.order, STATE.POST_HOLD));
  T('10d 順序：SCORE_RUN → SCORE_HOLD',
    idxOf(sr.order, STATE.SCORE_HOLD) > idxOf(sr.order, STATE.SCORE_RUN));
  T('10d 碰撞事件有發生', sr.hitAt > 0, 'frame=' + sr.hitAt);
  T('10d 盤面中央出現最終得分', sr.resAt > 0, 'frame=' + sr.resAt);
  T('10d 中央數字 = 得分 × 倍數', sr.resScore === Math.round(sr.resBase * sr.resMult),
    sr.resBase + ' × ' + sr.resMult + ' = ' + sr.resScore);
  T('10d 中央數字 = 本回合得分 roundWin', sr.resScore === roundWin, sr.resScore + ' vs ' + roundWin);
  T('10d 演繹期間兩欄真的有移動', sr.maxShift > 10, 'maxShift=' + sr.maxShift.toFixed(1));
  T('10d 【復原演繹】局末兩欄回到原位 [H48]', Math.abs(slamShift().sdx) < 1e-9 && slamK === 0,
    'slamK=' + slamK);
  T('10d 局末中央結果牌已清掉', slamResult === null);

  // --- 節奏接線：拉長相乘演繹→MULT_SLAM 幀數變多 ---
  function slamFrames(sec) {
    reset(); ODDS.wToWild = 0; ODDS.maxRound = 1; forceSpinType = 'pair';
    TIMING.multSlam = sec; applyTuning();
    var c = 0, n = 0;
    startSpin();
    while (n < 200000) {
      update(); n++;
      if (currentState === STATE.MULT_SLAM) c++;
      if (currentState === STATE.IDLE && !inFG) break;
    }
    TIMING.multSlam = DEFAULT_TIMING.multSlam; applyTuning();
    return c;
  }
  var msA = slamFrames(0.1), msB = slamFrames(2.0);
  T('10d 拉長「兩欄位碰撞時長」→ MULT_SLAM 幀數變多', msB > msA * 4, msA + ' → ' + msB);
  var srZero = (function () {
    reset(); ODDS.wToWild = 0; ODDS.maxRound = 1; forceSpinType = 'pair';
    TIMING.multSlam = 0; applyTuning();
    var hit = false, n = 0;
    startSpin();
    while (n < 200000) { update(); n++; if (slamHit) hit = true; if (currentState === STATE.IDLE && !inFG) break; }
    TIMING.multSlam = DEFAULT_TIMING.multSlam; applyTuning();
    return hit;
  })();
  T('10d 時長調成 0 也不會漏掉碰撞事件', srZero === true);

  // --- 跳過：兩個新狀態都要能被 skip 推完 ---
  reset(); ODDS.wToWild = 0; ODDS.maxRound = 1; forceSpinType = 'pair';
  startSpin();
  var skOk = true, sawSlam = false, n3 = 0;
  while (n3 < 200000) {
    update(); n3++;
    if (currentState === STATE.MULT_SLAM || currentState === STATE.SCORE_HOLD) {
      sawSlam = true;
      if (skipCurrent() !== true) skOk = false;
    }
    if (currentState === STATE.IDLE && !inFG) break;
  }
  T('10d MULT_SLAM / SCORE_HOLD 可以被跳過', sawSlam && skOk);
  reset();

  /* ===== 10e. 改色 + 盤面框燈條 + 起始倍數加倍撞擊（2026-08-27）===== */
  NOTE('10e. 改色與補做的演繹');
  reset();

  // --- 盤面外框燈條已移除（使用者 2026-08-28）：釘住它不會被誤加回來 ---
  T('10e 燈條的節奏參數已移除', !('lampFlash' in DEFAULT_TIMING) && !('lampFlash' in DEFAULT_TIMING_TURBO));
  T('10e 燈條的特效參數已移除',
    !('lampCount' in DEFAULT_FX) && !('lampGlow' in DEFAULT_FX) && !('lampIdle' in DEFAULT_FX));
  T('10e 節奏面板沒有燈條群組',
    TIMING_META.every(function (g) { return g.group.indexOf('燈條') < 0; }));
  T('10e 特效面板沒有燈條群組（FREE 計量條那組不算）',
    FX_META.every(function (g) { return g.group.indexOf('盤面框燈條') < 0; }));
  T('10e 燈條的繪製與觸發函式已移除',
    typeof window.drawFrameLamps === 'undefined' && typeof window.fireLamps === 'undefined');

  // --- 配色：倍數 = 紫（不是藍）、轉換 WILD = 彩色 ---
  T('10e 倍數色是紫的（非藍）', CAT_COLOR.mult === '#c084fc', CAT_COLOR.mult);
  T('10e 得分色仍是金的', CAT_COLOR.score === '#facc15', CAT_COLOR.score);
  var multTypes = FEAT_TYPES.filter(function (t) { return t.cat === 'mult'; });
  T('10e 兩種倍數卡都在 mult 類', multTypes.length === 2, multTypes.length);
  function isBluish(hex) {
    var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
    return b > r + 40 && g > r + 40;      // 藍：藍與綠都明顯高於紅；紫的紅分量高，不會命中
  }
  T('10e 沒有任何功能卡還是藍色',
    FEAT_TYPES.every(function (t) { return !isBluish(t.color); }),
    FEAT_TYPES.map(function (t) { return t.key + '=' + t.color; }).join(' '));
  T('10e 倍數卡底板是紫色系（非藍）', CAT_PLATE.mult.indexOf('64,22,110') >= 0, CAT_PLATE.mult);
  T('10e 轉換 WILD 走 special（底板由彩虹畫）',
    FEAT_TYPES[FEAT_IDX.toWild].cat === 'special' && CAT_PLATE.special === null);
  T('10e 彩虹至少 5 色', RAINBOW.length >= 5, RAINBOW.length);

  // --- 命中箭頭配色：得分卡 = 金、倍數卡 = 紫、兩者都有 = mix ---
  features = [
    { type: FEAT_IDX.addScore, tier: 0, value: 10, triggered: true, flash: 0 },
    { type: FEAT_IDX.addMul,   tier: 0, value: 5,  triggered: true, flash: 0 },
  ];
  // 顏色只算「已輪到」的卡，所以先把兩張都推進 featOrder 並套完
  featOrder = [0, 1]; featCursor = 1;
  cardFeatHits = [[0], [1], [0, 1], [], []];
  T('10e 命中得分卡 → 金箭頭', cardFeatCat(0) === 'score' && catPaint('score') === CAT_COLOR.score);
  T('10e 命中倍數卡 → 紫箭頭', cardFeatCat(1) === 'mult' && catPaint('mult') === CAT_COLOR.mult);
  T('10e 同時命中兩類 → mix', cardFeatCat(2) === 'mix');
  T('10e 沒命中就沒有類別', cardFeatCat(3) === null);
  featCursor = 0; currentState = STATE.FEAT_APPLY;
  T('10e 正在套用得分卡時，該牌箭頭轉金', cardFeatCat(2) === 'score', cardFeatCat(2));
  featCursor = 1;
  T('10e 正在套用倍數卡時，該牌箭頭轉紫', cardFeatCat(2) === 'mult', cardFeatCat(2));
  featCursor = 1; currentState = STATE.IDLE;
  var mixPaint = catPaint('mix', 0, 0, 10, 10);
  T('10e mix 回傳漸層物件（不是字串）', typeof mixPaint === 'object' && !!mixPaint.addColorStop);
  T('10e catGlow 三類都有值', !!catGlow('score') && !!catGlow('mult') && !!catGlow('mix'));

  // 盤面外框燈條的斷言在 2026-08-28 隨燈條一起移除（使用者決定拿掉這個物件）

  // --- 起始倍數加倍撞擊 [§美術 H12] ---
  function boostRun() {
    reset(); ODDS.wToWild = 0; ODDS.maxRound = 2; forceSpinType = 'five';
    var sawBoost = false, hit = false, maxK = 0, chev = 0, n = 0;
    startSpin();
    while (n < 200000) {
      update(); n++;
      if (currentState === STATE.MULT_BOOST) {
        sawBoost = true;
        maxK = Math.max(maxK, boostK);
        if (boostHit) hit = true;
        chev = Math.max(chev, boostChevrons.length);
      }
      if (currentState === STATE.IDLE && !inFG) break;
    }
    return { sawBoost: sawBoost, hit: hit, maxK: maxK, chev: chev, endK: boostK };
  }
  var br2 = boostRun();
  T('10e 五條 → 走過 MULT_BOOST', br2.sawBoost);
  T('10e 【起始倍數加倍演繹】牌組真的往上撞擊 [H12②]', br2.maxK > 0.5, 'maxK=' + br2.maxK.toFixed(3));
  T('10e 撞擊事件有發生', br2.hit);
  T('10e 撞擊噴出向上雙箭頭光效 [H12③]', br2.chev > 0, 'chevrons=' + br2.chev);
  T('10e 撞擊結束回到原先的位置 [H12④]', Math.abs(br2.endK) < 1e-9, 'endK=' + br2.endK);
  T('10e 起始倍數真的加倍了', startMult >= 2, 'startMult=' + startMult);
  reset();

  // --- 測試統計（RTP）面板預設關閉 ---
  T('10e 測試統計面板預設關閉', showStatsPanel === false, String(showStatsPanel));
  T('10e 側邊鈕初始沒有 active',
    document.getElementById('statsBtn').classList.contains('active') === false);
  reset();

  /* ===== 10f. 箭頭：只給得分牌 + 依功能卡由左至右依序亮起（2026-08-28）===== */
  NOTE('10f. 箭頭只給得分牌、依序亮起');
  reset();

  // --- 依序揭示：featCursor 前進到哪，箭頭就亮到哪 ---
  features = [
    { type: FEAT_IDX.addScore, tier: 0, value: 1, triggered: true, flash: 0 },   // 命中第 0 格
    { type: FEAT_IDX.addMul,   tier: 0, value: 2, triggered: true, flash: 0 },   // 命中第 2 格
    { type: FEAT_IDX.mulMul,   tier: 0, value: 2, triggered: true, flash: 0 },   // 命中第 4 格
  ];
  cardFeatHits = [[0], [], [1], [], [2]];
  featOrder = [0, 1, 2];
  featCursor = -1;
  T('10f 還沒開始套用（SHOWING_WIN）→ 一支箭頭都沒有',
    !cardFeatRevealed(0) && !cardFeatRevealed(2) && !cardFeatRevealed(4));
  featCursor = 0;
  T('10f 套到第 1 張 → 只有它命中的牌有箭頭',
    cardFeatRevealed(0) && !cardFeatRevealed(2) && !cardFeatRevealed(4));
  featCursor = 1;
  T('10f 套到第 2 張 → 前一支保持亮著，第二支跟著亮',
    cardFeatRevealed(0) && cardFeatRevealed(2) && !cardFeatRevealed(4));
  featCursor = 2;
  T('10f 套完三張 → 三支都亮',
    cardFeatRevealed(0) && cardFeatRevealed(2) && cardFeatRevealed(4));
  T('10f 沒命中任何卡的牌永遠沒箭頭', !cardFeatRevealed(1) && !cardFeatRevealed(3));
  featCursor = 3;   // finishFeatures 之後 featCursor 會等於 featOrder.length
  T('10f 套完之後（featCursor 已越界）箭頭仍保持亮著',
    cardFeatRevealed(0) && cardFeatRevealed(2) && cardFeatRevealed(4));
  featOrder = []; featCursor = -1;
  T('10f 沒有任何功能卡時不會亮箭頭', !cardFeatRevealed(0));
  reset();

  // --- 端對端：真的走 startSpin/update，箭頭數只增不減，且只出現在得分牌上 ---
  reset(); ODDS.wToWild = 0; ODDS.maxRound = 1; forceSpinType = 'pair';
  startSpin();
  var arrowSeq = [], badCell = -1, sawApply = false, n6 = 0, prevCount = 0, decreased = false;
  while (n6 < 200000) {
    update(); n6++;
    if (showFeatArrows() && winCells) {
      var cnt = 0;
      for (var c6 = 0; c6 < COLS; c6++) {
        if (cardFeatRevealed(c6)) {
          cnt++;
          if (!winCells.has(c6)) badCell = c6;          // 箭頭出現在非得分牌上 = 錯
        }
      }
      if (currentState === STATE.FEAT_APPLY) {
        sawApply = true;
        if (arrowSeq.length === 0 || arrowSeq[arrowSeq.length - 1] !== cnt) arrowSeq.push(cnt);
      }
      if (cnt < prevCount && currentState !== STATE.IDLE) decreased = true;
      prevCount = cnt;
    } else { prevCount = 0; }
    if (currentState === STATE.IDLE && !inFG) break;
  }
  T('10f 端對端：箭頭只出現在得分牌上', badCell < 0, 'badCell=' + badCell);
  T('10f 端對端：套用期間箭頭數只增不減', !decreased, arrowSeq.join('>'));
  T('10f 端對端：有走到 FEAT_APPLY', sawApply || arrowSeq.length === 0);
  reset();

  // --- 端對端：非得分牌不會讓功能卡生效（這條管得分，不只箭頭）---
  // 強開一對 + 只發「乘倍數」卡，統計「有卡觸發卻沒有任何得分牌對得上」的次數
  var mismatch = 0;
  for (var r6 = 0; r6 < 120; r6++) {
    reset(); ODDS.wToWild = 0; ODDS.maxRound = 1; forceSpinType = 'pair';
    startSpin();
    var g6 = 0;
    while (g6 < 200000) {
      update(); g6++;
      if (currentState === STATE.FEAT_APPLY || currentState === STATE.PRE_HOLD) {
        for (var fi = 0; fi < featOrder.length; fi++) {
          var okCell = false;
          for (var c7 = 0; c7 < COLS; c7++) {
            if (cardFeatHits[c7] && cardFeatHits[c7].indexOf(featOrder[fi]) >= 0) okCell = true;
          }
          if (!okCell) mismatch++;
        }
        break;
      }
      if (currentState === STATE.IDLE && !inFG) break;
    }
  }
  T('10f 端對端：每張被套用的功能卡都至少對上一張得分牌', mismatch === 0, 'mismatch=' + mismatch);
  reset();

  /* ===== 10g. AUTO/TURBO 兩組節奏 + 節奏表匯出的註冊表（2026-08-28）=====
     完整的匯出驗收在 tools/verify_rhythm.py（端對端產檔）＋ verify_rhythm_style.ps1（樣式）
     ＋ verify_rhythm_layout.py（版面遮蔽）三關；這裡只釘住最容易漂掉的註冊表一致性。 */
  NOTE('10g. 雙組節奏與節奏表註冊表');
  reset();
  var kAuto = Object.keys(DEFAULT_TIMING).sort().join(',');
  var kTurbo = Object.keys(DEFAULT_TIMING_TURBO).sort().join(',');
  T('10g AUTO / TURBO 兩組節奏的 key 完全一致', kAuto === kTurbo,
    'auto=' + Object.keys(DEFAULT_TIMING).length + ' turbo=' + Object.keys(DEFAULT_TIMING_TURBO).length);
  var mapped = RHYTHM_MAP.filter(function (m) { return m[0]; }).map(function (m) { return m[0]; });
  var missMap = Object.keys(DEFAULT_TIMING).filter(function (k) { return mapped.indexOf(k) < 0; });
  var strayMap = mapped.filter(function (k) { return !(k in DEFAULT_TIMING); });
  T('10g RHYTHM_MAP 涵蓋每一個 TIMING', missMap.length === 0, missMap.join(','));
  T('10g RHYTHM_MAP 沒有多餘 key', strayMap.length === 0, strayMap.join(','));
  T('10g RHYTHM_MAP 沒有重複的參數名',
    (function () { var n = {}, d = 0; RHYTHM_MAP.forEach(function (m) { if (n[m[1]]) d++; n[m[1]] = 1; }); return d === 0; })());
  var nanT = [];
  [['auto', DEFAULT_TIMING], ['turbo', DEFAULT_TIMING_TURBO]].forEach(function (p) {
    Object.keys(p[1]).forEach(function (k) { if (!isFinite(p[1][k])) nanT.push(p[0] + '.' + k); });
  });
  T('10g 兩組節奏都沒有 NaN', nanT.length === 0, nanT.join(','));
  T('10g SOP 表有這款的類型', !!RHYTHM_SOP && Object.keys(RHYTHM_SOP).length > 10, RHYTHM_TYPE);

  // 切換速度模式：TIMING 要重新指向那一組，且 applyTuning 算出的幀數跟著變
  setSpeedMode('auto');
  var fAuto = (function () { applyTuning(); return TF(TIMING.reelStart); })();
  T('10g AUTO 模式 TIMING 指向 TIMING_AUTO', TIMING === TIMING_AUTO);
  setSpeedMode('turbo');
  var fTurbo = TF(TIMING.reelStart);
  T('10g TURBO 模式 TIMING 指向 TIMING_TURBO', TIMING === TIMING_TURBO);
  T('10g 切到 TURBO 後衍生幀數真的變短', fTurbo < fAuto, fAuto + ' -> ' + fTurbo);
  // 改 TURBO 不能污染 AUTO（兩組必須是各自獨立的物件）
  TIMING_TURBO.reelStart = 0.11;
  T('10g 改 TURBO 不會動到 AUTO', TIMING_AUTO.reelStart === DEFAULT_TIMING.reelStart,
    TIMING_AUTO.reelStart);
  TIMING_TURBO.reelStart = DEFAULT_TIMING_TURBO.reelStart;
  setSpeedMode('auto');
  reset();

  /* ===== 10h. 甘特圖拖曳：拖中間=移動起點／拖右緣=只改時長（2026-08-28）=====
     這個 bug 只有真的派送 pointer 事件才抓得到——handle 是 bar 的子元素，
     pointerdown 會冒泡到 bar，於是拖右緣同時啟動了 resize 與 move 兩個拖曳。 */
  NOTE('10h. 甘特圖拖曳');
  reset();
  setTunePanelOpen(true);
  tuneTab = 'timing'; refreshTuneBody();
  var gRows = tuneBody.querySelectorAll('.gantt-row');
  T('10h 甘特圖有列可以拖', gRows.length > 0, gRows.length);
  var gKey = TIMING_META[0].items[0][0];
  var gRow = gRows[0];
  var gBar = gRow.querySelector('.gantt-bar');
  var gHandle = gRow.querySelector('.gantt-handle');
  T('10h 色條與右緣把手都在', !!gBar && !!gHandle);

  function pdown(el, x) {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x }));
  }
  function pmove(x) {
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x }));
  }
  function pup(x) {
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x }));
  }
  function dragOn(el, dx) {
    var s0 = TS(gKey), d0 = TIMING[gKey];
    pdown(el, 400); pmove(400 + dx); pup(400 + dx);
    return { ds: TS(gKey) - s0, dd: TIMING[gKey] - d0 };
  }

  // 拖右緣：時長要變、起點不能動（這條就是使用者回報的那個 bug）
  setTimingStartValue(gKey, 1.0);
  setTimingValue(gKey, 1.0, 0, 5);
  var rz = dragOn(gHandle, 160);
  T('10h 拖右緣：時長有變', Math.abs(rz.dd) > 1e-9, 'Δdur=' + rz.dd.toFixed(3));
  T('10h 拖右緣：起點完全不動（bug 修正）', Math.abs(rz.ds) < 1e-9, 'Δstart=' + rz.ds.toFixed(3));

  // 拖色條中間：起點要變、時長不能動
  setTimingStartValue(gKey, 1.0);
  setTimingValue(gKey, 1.0, 0, 5);
  var mv = dragOn(gBar, 160);
  T('10h 拖色條中間：起點有變', Math.abs(mv.ds) > 1e-9, 'Δstart=' + mv.ds.toFixed(3));
  T('10h 拖色條中間：時長完全不動', Math.abs(mv.dd) < 1e-9, 'Δdur=' + mv.dd.toFixed(3));

  // 游標語意：中間是手掌、右緣是左右箭頭
  T('10h 色條游標是手掌(grab)', getComputedStyle(gBar).cursor === 'grab', getComputedStyle(gBar).cursor);
  T('10h 右緣游標是左右箭頭(ew-resize)',
    getComputedStyle(gHandle).cursor === 'ew-resize', getComputedStyle(gHandle).cursor);
  T('10h 拖曳結束後沒有殘留全域游標', document.body.style.cursor === '', document.body.style.cursor);

  setTimingStartValue(gKey, DEFAULT_TIMING_START[gKey]);
  setTimingValue(gKey, DEFAULT_TIMING[gKey], 0, 5);
  setTunePanelOpen(false);
  reset();

  /* ===== 10c. 版面幾何（把只有肉眼看得到的重疊問題釘住）===== */
  NOTE('10c. 版面幾何');
  reset();
  var liftTop   = LAYOUT.grid.y - FX.cardLiftY - CARD_H * (FX.cardLiftScale - 1) / 2;
  var arrowTop  = liftTop - 10 - FX.arrowSize * 1.5 * 1.3;      // 1.3 = 加強箭頭的放大
  var featBot   = LAYOUT.featureRow.y + LAYOUT.featureRow.h;
  var barTop    = LAYOUT.bottomUI.y - 46;                       // 公版面板素材頂緣
  T('抬起後的牌不頂到功能列', liftTop > featBot,
    'cardTop=' + liftTop.toFixed(1) + ' featBottom=' + featBot);
  T('命中箭頭不頂到功能列', arrowTop > featBot,
    'arrowTop=' + arrowTop.toFixed(1) + ' featBottom=' + featBot);
  T('盤面不壓到公版面板', LAYOUT.grid.y + GRID_H < barTop,
    (LAYOUT.grid.y + GRID_H) + ' < ' + barTop);
  // 牌型資訊是兩行：主文字 26px（baseline middle）＋ 第二行 17px（中心 +26）
  var labelTop = LAYOUT.handLabel.y - 13;
  var labelBot = LAYOUT.handLabel.y + 26 + 9;
  T('牌型資訊在盤面下方、不壓到公版面板',
    labelTop >= LAYOUT.grid.y + GRID_H && labelBot < barTop,
    'label ' + labelTop + '~' + labelBot + ' gridBottom=' + (LAYOUT.grid.y + GRID_H) + ' barTop=' + barTop);
  T('FREE 燈條不與盤面重疊', LAYOUT.freeMeter.x >= LAYOUT.grid.x + GRID_W,
    LAYOUT.freeMeter.x + ' >= ' + (LAYOUT.grid.x + GRID_W));
  T('FG 局數欄不與盤面重疊', LAYOUT.fgCounter.x + LAYOUT.fgCounter.w <= LAYOUT.grid.x,
    (LAYOUT.fgCounter.x + LAYOUT.fgCounter.w) + ' <= ' + LAYOUT.grid.x);
  T('得分欄與倍數欄不重疊', LAYOUT.scoreBox.x + LAYOUT.scoreBox.w <= LAYOUT.multBox.x);
  T('得分欄／倍數欄不與功能列重疊',
    LAYOUT.scoreBox.y + LAYOUT.scoreBox.h <= LAYOUT.featureRow.y,
    (LAYOUT.scoreBox.y + LAYOUT.scoreBox.h) + ' <= ' + LAYOUT.featureRow.y);
  T('統計列的顯示開關不壓到得分欄', LAYOUT.statsBar.y + 102 <= LAYOUT.scoreBox.y,
    (LAYOUT.statsBar.y + 102) + ' <= ' + LAYOUT.scoreBox.y);
  T('盤面水平置中於畫面', Math.abs((LAYOUT.grid.x + GRID_W / 2) - W / 2) <= 2,
    'centre=' + (LAYOUT.grid.x + GRID_W / 2) + ' W/2=' + (W / 2));
  T('功能列與盤面同寬同起點',
    LAYOUT.featureRow.x === LAYOUT.grid.x && LAYOUT.featureRow.w === GRID_W,
    LAYOUT.featureRow.x + '/' + LAYOUT.featureRow.w + ' vs ' + LAYOUT.grid.x + '/' + GRID_W);
  T('牌是縱長的（撲克牌比例）', CARD_H > CARD_W && CARD_W / CARD_H > 0.6 && CARD_W / CARD_H < 0.8,
    CARD_W + 'x' + CARD_H + ' ratio=' + (CARD_W / CARD_H).toFixed(3));

  /* ===== 11. 起始倍數上限（[自設] 保護）===== */
  NOTE('11. 起始倍數上限');
  reset();
  ODDS.maxStartMult = 4;
  startMult = 4; currentState = STATE.MULT_BOOST; stateTimer = 0;
  update();
  T('起始倍數到上限就不再加倍', startMult === 4, 'startMult=' + startMult);
  startMult = 2; currentState = STATE.MULT_BOOST; stateTimer = 0;
  update();
  T('未達上限時正常加倍', startMult === 4, 'startMult=' + startMult);

  /* ===== 12. soak：連續跑不崩、不卡死，並診斷贏分分布 ===== */
  NOTE('12. soak');
  reset(); forceSpinType = null;
  var soakErr = null, stuck = 0, maxSteps = 0, SOAK = 300;
  var maxWin = 0, maxMult = 0, maxRoundSeen = 0, sumSteps = 0;
  var over1k = 0, over10k = 0;   // 單局贏分超過 1000×／10000× 押注的局數
  for (var s = 0; s < SOAK; s++) {
    try {
      var rr = playSpin(300000);
      sumSteps += rr.steps;
      if (rr.steps > maxSteps) maxSteps = rr.steps;
      if (rr.steps >= 300000) stuck++;
      if (spinWin > maxWin) maxWin = spinWin;
      if (startMult > maxMult) maxMult = startMult;
      if (roundIdx > maxRoundSeen) maxRoundSeen = roundIdx;
      var mx = spinWin / ODDS.bet;
      if (mx > 1000) over1k++;
      if (mx > 10000) over10k++;
    } catch (e) { soakErr = (e && e.stack) ? e.stack : String(e); break; }
  }
  T('soak ' + SOAK + ' 局無例外', soakErr === null, soakErr ? soakErr.split('\n')[0] : '');
  T('soak 無卡死', stuck === 0, 'stuck=' + stuck + ' maxSteps=' + maxSteps);
  T('soak 局數計到', stats.spins >= SOAK, stats.spins);
  T('單局贏分未失控（< 1e6 倍押注）', maxWin / ODDS.bet < 1e6,
    'maxWin=' + maxWin.toExponential(2) + ' = ' + Math.round(maxWin / ODDS.bet) + 'x bet');
  T('起始倍數受上限收斂', maxMult <= DEFAULT_ODDS.maxStartMult,
    'maxMult=' + maxMult + ' limit=' + DEFAULT_ODDS.maxStartMult);
  var rtp = stats.spins > 0 ? (totalScore / (stats.spins * ODDS.bet) * 100).toFixed(1) : '0';
  var hit = stats.spins > 0 ? (stats.hits / stats.spins * 100).toFixed(1) : '0';
  NOTE('soak 診斷：spins=' + stats.spins + ' RTP=' + rtp + '% HIT=' + hit + '%'
    + ' avgSteps=' + Math.round(sumSteps / SOAK) + ' maxSteps=' + maxSteps
    + ' maxRound=' + maxRoundSeen + ' maxMult=' + maxMult
    + ' maxWin=' + Math.round(maxWin / ODDS.bet) + 'x'
    + ' >1000x:' + over1k + '局 >10000x:' + over10k + '局');
  NOTE('（RTP 未校準：轉輪權重是 [自設]，正式數值由 SERVER 給。不可對企劃報告此數字）');

  LINES.push('');
  LINES.push('TOTAL ' + (PASSES + FAILS) + ' / PASS ' + PASSES + ' / FAIL ' + FAILS);
}

var t0 = Date.now();
try { run(); }
catch (e) { LINES.push('FATAL | ' + ((e && e.stack) ? e.stack : String(e))); FAILS++; }
LINES.push('elapsed=' + (Date.now() - t0) + 'ms');

var pre = document.createElement('pre');
pre.id = 'verifyOut';
pre.textContent = LINES.join('\n');
document.body.appendChild(pre);
