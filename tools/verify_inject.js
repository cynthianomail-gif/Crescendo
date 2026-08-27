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
    TIMING = Object.assign({}, DEFAULT_TIMING);
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
               STATE.BIGWIN, STATE.FG_ENTER, STATE.FG_END];
    features = rollFeatures(5);
    handLabelText = 'FLUSH DRAW'; handLabelKind = 'draw';
    drawInfo = { cell: 2, kind: 'flush', needs: [1, 2, 3] };
    winCells = new Set([0, 1]);
    wildBeams = [{ c: 1, t: 4 }];
    freeCount = 2;
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
