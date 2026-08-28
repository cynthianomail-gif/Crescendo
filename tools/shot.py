# -*- coding: utf-8 -*-
"""畫面驗證：每個場景從當前 index.html 重新產生一份測試檔，用 headless Chrome 截圖。"""
import io, os, re, subprocess, sys

SP = os.path.dirname(os.path.abspath(__file__))
PROJ = r"D:\demo\test"
SRC = os.path.join(PROJ, "index.html")
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROFILE = os.path.join(SP, "chromeprof")

HEAD = """
window.requestAnimationFrame = function () { return 0; };
function ID(r, s) { return r * 4 + s; }
function SETB(a) { for (var i = 0; i < 5; i++) board[i][0] = newCell(a[i]); }
function go() {
  if (!artReady) { setTimeout(go, 20); return; }
  try { SCENE(); } catch (e) {
    var p = document.createElement('pre'); p.id = 'shotErr';
    p.textContent = 'SCENE_ERROR: ' + (e.stack || e); document.body.appendChild(p);
  }
  // 截圖是靜態的：先把「得分牌抬起」的動畫推到目標狀態，並算出命中的功能卡
  try {
    if (winCells) {
      computeCardFeatHits();
      setLiftTargets();
      for (var i = 0; i < F_CARDLIFT + F_LIFTSTAG * 6 + 6; i++) updateLift();
    }
  } catch (e) {
    var r = document.createElement('pre'); r.id = 'shotErr';
    r.textContent = 'LIFT_ERROR: ' + (e.stack || e); document.body.appendChild(r);
  }
  try { draw(); } catch (e) {
    var q = document.createElement('pre'); q.id = 'shotErr';
    q.textContent = 'DRAW_ERROR: ' + (e.stack || e); document.body.appendChild(q);
  }
}
go();
"""

SCENES = [
    ("01_idle", """
function SCENE() {
  currentState = STATE.IDLE;
  features = [
    { type: FEAT_IDX.addScore, tier: 3,  value: 25, triggered: false, flash: 0 },
    { type: FEAT_IDX.addMul,   tier: 14, value: 5,  triggered: false, flash: 0 },
    { type: FEAT_IDX.toWild,   tier: 17, value: 0,  triggered: false, flash: 0 },
  ];
  freeCount = 1; startMult = 1; displayScore = 0; spinWin = 0;
  SETB([ID(6,0), ID(2,1), ID(10,2), ID(0,3), ID(8,1)]);
  for (var c = 0; c < 5; c++) colStopped[c] = true;
}
"""),
    ("02_win_royal", """
function SCENE() {
  SETB([ID(12,0), ID(11,0), WILD_ID, ID(9,0), ID(8,0)]);
  for (var c = 0; c < 5; c++) { colStopped[c] = true; board[c][0].locked = true; }
  features = [
    { type: FEAT_IDX.addScore, tier: 12, value: 25, triggered: true,  flash: 0.8 },
    { type: FEAT_IDX.mulMul,   tier: 0,  value: 3,  triggered: false, flash: 0 },
    { type: FEAT_IDX.addMul,   tier: 17, value: 10, triggered: true,  flash: 0 },
    { type: FEAT_IDX.mulScore, tier: 12, value: 2,  triggered: true,  flash: 0 },
  ];
  handResult = classifyHand(boardIds());
  winCells = new Set(handResult.cells);
  handLabelText = handResult.name; handLabelKind = 'hand';
  payUnits = 15 + 25; curMult = 8 * 10;
  winTier = 3; startMult = 8;
  displayScore = ODDS.bet * payUnits; spinWin = displayScore;
  freeCount = 2;
  currentState = STATE.SHOWING_WIN; stateTimer = 5;
  floatTexts = [{ x: GRID_X + GRID_W / 2, y: GRID_Y + GRID_H / 2, t: 4, life: 90,
                  text: '+' + fmtScore(320000), big: true }];
  winCells.forEach(function (c) {
    var cx = GRID_X + c * CARD_W + CARD_W / 2, cy = GRID_Y + CARD_H / 2;
    for (var i = 0; i < 14; i++) {
      var a = Math.random() * 6.28, sp = 2 + Math.random() * 5;
      particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.08,
        life: 8, maxLife: 40, size: 3 + Math.random() * 11, color: '#facc15' });
    }
  });
}
"""),
    ("03_draw_hint", """
function SCENE() {
  SETB([ID(0,0), ID(3,0), ID(6,0), ID(10,0), ID(7,1)]);
  for (var c = 0; c < 5; c++) colStopped[c] = true;
  features = [
    { type: FEAT_IDX.mulScore, tier: 15, value: 3, triggered: false, flash: 0 },
    { type: FEAT_IDX.addScore, tier: 9,  value: 1, triggered: false, flash: 0 },
  ];
  drawInfo = findDraw(boardIds());
  handLabelText = (drawInfo.kind === 'flush' ? 'FLUSH' : 'STRAIGHT') + ' DRAW';
  handLabelKind = 'draw';
  freeCount = 2; startMult = 2; displayScore = 4500; spinWin = 4500;
  currentState = STATE.DRAW_HINT; stateTimer = 20;
}
"""),
    ("04_fg", """
function SCENE() {
  inFG = true; isSFG = false; fgLeft = 3; fgWin = 1875400;
  features = [
    { type: FEAT_IDX.addScore, tier: 4,  value: 10, triggered: true,  flash: 0 },
    { type: FEAT_IDX.mulScore, tier: 16, value: 2,  triggered: false, flash: 0 },
    { type: FEAT_IDX.addMul,   tier: 12, value: 25, triggered: true,  flash: 0.6 },
    { type: FEAT_IDX.mulMul,   tier: 15, value: 3,  triggered: true,  flash: 0 },
    { type: FEAT_IDX.toWild,   tier: 2,  value: 0,  triggered: false, flash: 0 },
  ];
  featOrder = [0, 2, 3]; featCursor = 1;
  startMult = 16; freeCount = 0;
  displayScore = 248000; spinWin = 248000; curMult = 16;
  SETB([ID(4,2), ID(4,1), ID(4,3), ID(12,0), WILD_ID]);
  for (var c = 0; c < 5; c++) colStopped[c] = true;
  handResult = classifyHand(boardIds());
  winCells = new Set(handResult.cells);
  handLabelText = handResult.name; handLabelKind = 'hand';
  winTier = 3;
  // FEAT_APPLY：正在套用第 3 張卡（加倍數 A），A♠ 的箭頭會加強
  currentState = STATE.FEAT_APPLY; stateTimer = 8;
}
"""),
    ("05_epic_win", """
function SCENE() {
  SETB([ID(4,2), ID(4,1), ID(4,3), ID(4,0), WILD_ID]);
  for (var c = 0; c < 5; c++) colStopped[c] = true;
  features = rollFeatures(5);
  startMult = 64; spinWin = 41200000; displayScore = spinWin;
  bigWinLabel = 'EPIC WIN';
  currentState = STATE.BIGWIN; stateTimer = 14;
}
"""),
    ("06_force_menu", """
function SCENE() {
  currentState = STATE.IDLE;
  features = rollFeatures(2);
  freeCount = 0; displayScore = 0;
  SETB([ID(6,0), ID(2,1), ID(10,2), ID(0,3), ID(8,1)]);
  for (var c = 0; c < 5; c++) colStopped[c] = true;
  forceSpinType = 'royal';
  showForceMenu = true;
}
"""),
    ("07_tune_timing", """
function SCENE() {
  currentState = STATE.IDLE;
  features = rollFeatures(4);
  freeCount = 2; displayScore = 0;
  SETB([ID(12,0), ID(11,1), WILD_ID, ID(9,2), ID(8,3)]);
  for (var c = 0; c < 5; c++) colStopped[c] = true;
  tuneTab = 'timing';
  setTunePanelOpen(true);
}
"""),
    ("08_tune_layout", """
function SCENE() {
  currentState = STATE.IDLE;
  features = rollFeatures(5);
  freeCount = 1; displayScore = 0;
  SETB([ID(12,0), ID(11,1), WILD_ID, ID(9,2), ID(8,3)]);
  for (var c = 0; c < 5; c++) colStopped[c] = true;
  tuneTab = 'layout';
  setTunePanelOpen(true);
}
"""),
    ("09_slam_approach", """
function SCENE() {
  SETB([ID(4,2), ID(4,1), ID(4,3), ID(12,0), WILD_ID]);
  for (var c = 0; c < 5; c++) { colStopped[c] = true; board[c][0].locked = true; }
  features = [
    { type: FEAT_IDX.addScore, tier: 4,  value: 10, triggered: true, flash: 0 },
    { type: FEAT_IDX.mulScore, tier: 4,  value: 2,  triggered: true, flash: 0 },
    { type: FEAT_IDX.addMul,   tier: 12, value: 5,  triggered: true, flash: 0 },
    { type: FEAT_IDX.mulMul,   tier: 4,  value: 3,  triggered: true, flash: 0 },
  ];
  featOrder = [0, 1, 2, 3]; featCursor = 3;
  handResult = classifyHand(boardIds());
  winCells = new Set(handResult.cells);
  handLabelText = handResult.name; handLabelKind = 'hand';
  startMult = 4; payUnits = (handResult.pay + 10) * 2; curMult = (4 + 5) * 3;
  roundWin = Math.round(scoreNow() * curMult);
  winTier = tierOf(roundWin);
  spinWin = roundWin; displayScore = 0; scoreFrom = 0;
  freeCount = 2;

  // 【得分相乘演繹】靠攏中：兩欄往中間衝，中間的「×」還看得到
  currentState = STATE.MULT_SLAM; stateTimer = 12;
  slamK = 0.45; slamHit = false;
}
"""),
    ("10_slam_hit", """
function SCENE() {
  SETB([ID(4,2), ID(4,1), ID(4,3), ID(12,0), WILD_ID]);
  for (var c = 0; c < 5; c++) { colStopped[c] = true; board[c][0].locked = true; }
  features = [
    { type: FEAT_IDX.addScore, tier: 4,  value: 10, triggered: true, flash: 0 },
    { type: FEAT_IDX.mulScore, tier: 4,  value: 2,  triggered: true, flash: 0 },
    { type: FEAT_IDX.addMul,   tier: 12, value: 5,  triggered: true, flash: 0 },
    { type: FEAT_IDX.mulMul,   tier: 4,  value: 3,  triggered: true, flash: 0 },
  ];
  featOrder = [0, 1, 2, 3]; featCursor = 3;
  handResult = classifyHand(boardIds());
  winCells = new Set(handResult.cells);
  handLabelText = handResult.name; handLabelKind = 'hand';
  startMult = 4; payUnits = (handResult.pay + 10) * 2; curMult = (4 + 5) * 3;
  roundWin = Math.round(scoreNow() * curMult);
  winTier = tierOf(roundWin);
  spinWin = roundWin; displayScore = 0; scoreFrom = 0;
  freeCount = 2;

  // 相撞瞬間：蓋過「×」符號、輪廓光往外擴、盤面中央彈出最終得分
  currentState = STATE.MULT_SLAM; stateTimer = 22;
  slamK = 0.97; slamHit = true;
  shakeAmp = 0;                       // 截圖要穩，震動不入鏡（實機有）
  slamRings = [{ t: 7, life: 25 }];
  slamResult = { t: 8, score: roundWin, base: Math.round(scoreNow()), mult: curMult };
}
"""),
    ("11_slam_scorerun", """
function SCENE() {
  SETB([ID(4,2), ID(4,1), ID(4,3), ID(12,0), WILD_ID]);
  for (var c = 0; c < 5; c++) { colStopped[c] = true; board[c][0].locked = true; }
  features = [
    { type: FEAT_IDX.addScore, tier: 4,  value: 10, triggered: true, flash: 0 },
    { type: FEAT_IDX.mulScore, tier: 4,  value: 2,  triggered: true, flash: 0 },
    { type: FEAT_IDX.addMul,   tier: 12, value: 5,  triggered: true, flash: 0 },
    { type: FEAT_IDX.mulMul,   tier: 4,  value: 3,  triggered: true, flash: 0 },
  ];
  featOrder = [0, 1, 2, 3]; featCursor = 3;
  handResult = classifyHand(boardIds());
  winCells = new Set(handResult.cells);
  handLabelText = handResult.name; handLabelKind = 'hand';
  startMult = 4; payUnits = (handResult.pay + 10) * 2; curMult = (4 + 5) * 3;
  roundWin = Math.round(scoreNow() * curMult);
  winTier = tierOf(roundWin);
  spinWin = roundWin; displayScore = 0; scoreFrom = 0;
  freeCount = 2;

  // 跑分中：兩欄保持貼合，中央結果牌回到 1.0 倍
  currentState = STATE.SCORE_RUN; stateTimer = 30;
  displayScore = spinWin * 0.6;
  slamK = 1; slamHit = true;
  slamResult = { t: 40, score: roundWin, base: Math.round(scoreNow()), mult: curMult };
}
"""),
    ("12_boost_slam", """
function SCENE() {
  SETB([ID(4,2), ID(4,1), ID(4,3), ID(4,0), WILD_ID]);
  for (var c = 0; c < 5; c++) { colStopped[c] = true; board[c][0].locked = true; }
  features = rollFeatures(5);
  handResult = classifyHand(boardIds());
  winCells = new Set(handResult.cells);
  handLabelText = handResult.name; handLabelKind = 'hand';
  startMult = 4; winTier = 3; spinWin = 500000; displayScore = spinWin;
  freeCount = 2;
  // 【起始倍數加倍演繹】撞擊瞬間
  currentState = STATE.MULT_BOOST; stateTimer = Math.round(F_MULTBOOST * 0.58);
  boostK = 1; boostHit = true; shakeAmp = 0;
  boostChevrons = [];
  for (var i = 0; i < 18; i++) {
    boostChevrons.push({
      x: GRID_X + (i % 5) * CARD_W + CARD_W / 2 + ((i * 37) % 100 - 50) * 1.2,
      y: GRID_Y + CARD_H * (0.2 + ((i * 53) % 100) / 140),
      t: 4 + (i % 9), life: 30, s: FX.arrowSize * (0.5 + ((i * 29) % 50) / 100),
    });
  }
  fireLamps('#a855f7'); lampFlash.t = 3;
}
"""),
    ("13_feat_colors", """
function SCENE() {
  // 8S 8H 8D = 三條8（得分牌 0,1,2）；QS 是 ♠ 但不得分 → 不該有箭頭
  SETB([ID(6,0), ID(6,1), ID(6,2), ID(10,0), ID(8,3)]);
  for (var c = 0; c < 5; c++) { colStopped[c] = true; }
  features = [
    { type: FEAT_IDX.addScore, tier: 13, value: 25, triggered: true,  flash: 0 },  // S -> cell0 金
    { type: FEAT_IDX.addMul,   tier: 14, value: 10, triggered: true,  flash: 0 },  // H -> cell1 紫
    { type: FEAT_IDX.mulMul,   tier: 15, value: 3,  triggered: true,  flash: 0 },  // D -> cell2 紫
    { type: FEAT_IDX.toWild,   tier: 17, value: 0,  triggered: false, flash: 0 },
  ];
  handResult = classifyHand(boardIds());
  winCells = new Set(handResult.cells);
  handLabelText = handResult.name; handLabelKind = 'hand';
  startMult = 2; freeCount = 1;
  displayScore = 12000; spinWin = 12000;
  handResult.cells.forEach(function (c) { board[c][0].locked = true; });
  computeRound();
  // 套用到最後一張 → 箭頭都亮了，顏色依命中的卡別
  currentState = STATE.FEAT_APPLY; stateTimer = 8;
  featCursor = featOrder.length - 1;
}
"""),
    ("14_arrow_seq_a", """
function SCENE() {
  SETB([ID(2,2), ID(3,2), WILD_ID, ID(12,1), ID(12,3)]);
  for (var c = 0; c < 5; c++) { colStopped[c] = true; }
  features = [
    { type: FEAT_IDX.mulScore, tier: 14, value: 2, triggered: true, flash: 0 },
    { type: FEAT_IDX.mulMul,   tier: 15, value: 2, triggered: true, flash: 0 },
  ];
  handResult = classifyHand(boardIds());
  winCells = new Set(handResult.cells);
  handResult.cells.forEach(function (c) { board[c][0].locked = true; });
  handLabelText = handResult.name; handLabelKind = 'hand';
  computeRound();
  startMult = 1; freeCount = 0; displayScore = 0; spinWin = 0;

  currentState = STATE.SHOWING_WIN; stateTimer = 5;
  featCursor = -1;
}
"""),
    ("15_arrow_seq_b", """
function SCENE() {
  SETB([ID(2,2), ID(3,2), WILD_ID, ID(12,1), ID(12,3)]);
  for (var c = 0; c < 5; c++) { colStopped[c] = true; }
  features = [
    { type: FEAT_IDX.mulScore, tier: 14, value: 2, triggered: true, flash: 0 },
    { type: FEAT_IDX.mulMul,   tier: 15, value: 2, triggered: true, flash: 0 },
  ];
  handResult = classifyHand(boardIds());
  winCells = new Set(handResult.cells);
  handResult.cells.forEach(function (c) { board[c][0].locked = true; });
  handLabelText = handResult.name; handLabelKind = 'hand';
  computeRound();
  startMult = 1; freeCount = 0; displayScore = 0; spinWin = 0;

  currentState = STATE.FEAT_APPLY; stateTimer = 8;
  featCursor = 0;
}
"""),
    ("16_arrow_seq_c", """
function SCENE() {
  SETB([ID(2,2), ID(3,2), WILD_ID, ID(12,1), ID(12,3)]);
  for (var c = 0; c < 5; c++) { colStopped[c] = true; }
  features = [
    { type: FEAT_IDX.mulScore, tier: 14, value: 2, triggered: true, flash: 0 },
    { type: FEAT_IDX.mulMul,   tier: 15, value: 2, triggered: true, flash: 0 },
  ];
  handResult = classifyHand(boardIds());
  winCells = new Set(handResult.cells);
  handResult.cells.forEach(function (c) { board[c][0].locked = true; });
  handLabelText = handResult.name; handLabelKind = 'hand';
  computeRound();
  startMult = 1; freeCount = 0; displayScore = 0; spinWin = 0;

  currentState = STATE.FEAT_APPLY; stateTimer = 8;
  featCursor = featOrder.length - 1;
}
"""),
]

src = io.open(SRC, encoding="utf-8").read()
mb = re.search(r"const APP_BUILD = '([^']+)'", src)
assert mb, "APP_BUILD not found in index.html"
print("SOURCE_BUILD=" + mb.group(1))
if not os.path.exists(CHROME):
    print("CHROME_NOT_FOUND")
    sys.exit(2)

for name, scene in SCENES:
    doc = src.replace("</body>", "<script>\n" + scene + HEAD + "\n</script>\n</body>", 1)
    html = os.path.join(PROJ, "_shot_%s.html" % name)
    png = os.path.join(PROJ, "_shot_%s.png" % name)
    io.open(html, "w", encoding="utf-8", newline="\n").write(doc)
    cmd = [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
           "--allow-file-access-from-files", "--user-data-dir=" + PROFILE,
           "--window-size=1280,760", "--virtual-time-budget=6000",
           "--screenshot=" + png, "file:///" + html.replace("\\", "/")]
    p = subprocess.run(cmd, capture_output=True, timeout=180)
    size = os.path.getsize(png) if os.path.exists(png) else 0
    print("%-16s rc=%d png=%d bytes" % (name, p.returncode, size))
