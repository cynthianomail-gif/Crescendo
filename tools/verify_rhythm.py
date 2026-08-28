# -*- coding: utf-8 -*-
"""驗證 Crescendo demo 的「匯出節奏表」：面板改值 → 匯出的三個分頁跟著變。
（複製自 slot-demo-from-gdd skill 的 verify-rhythm-export.py，換成 Crescendo 的節奏 key）

用法:
    python verify-rhythm-export.py <demo 的 index.html> [輸出目錄]

做四件事：
  1. 從「當前的」源檔重新產生測試檔（不重跑舊快照——重跑舊快照是踩過的坑）
  2. headless Chrome 跑起來，走面板真正呼叫的 setTimingValue() 改值
  3. 斷言工具參數表／甘特圖／範本三張都拿到面板的新值，並驗 localStorage 往返
  4. 把匯出的 .xlsx 落檔，供樣式比對（verify-rhythm-style.ps1）

輸出的每一條 PASS/FAIL 都印出實際值，FAIL 時 exit code 非 0。
"""
import io, os, re, sys, base64, shutil, subprocess

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

INJECT = u"""
<pre id="VERIFY_OUT">PENDING</pre>
<script>
(function () {
  var log = [];
  function ok(name, cond, detail) {
    log.push((cond ? 'PASS  ' : 'FAIL  ') + name + (detail === undefined ? '' : '  [' + detail + ']'));
  }
  function done(txt) { document.getElementById('VERIFY_OUT').textContent = txt; }
  function toolRow(sh, paramName) {
    var rows = Object.keys(sh.rows);
    for (var i = 0; i < rows.length; i++) {
      var row = sh.rows[rows[i]];
      if (row[1] && row[1].v === paramName) return { auto: row[4].v, turbo: row[5].v };
    }
    return null;
  }
  function ganttHas(sh, text) {
    var rows = Object.keys(sh.rows);
    for (var i = 0; i < rows.length; i++) {
      var row = sh.rows[rows[i]];
      for (var c in row) if (row[c].v && String(row[c].v).indexOf(text) >= 0) return true;
    }
    return false;
  }
  try {
    log.push('BUILD=' + APP_BUILD);

    // --- 結構：三份註冊表的 key 要對得起來 ---
    var ka = Object.keys(DEFAULT_TIMING).sort().join(',');
    var kt = Object.keys(DEFAULT_TIMING_TURBO).sort().join(',');
    ok('DEFAULT_TIMING / DEFAULT_TIMING_TURBO key 一致', ka === kt);
    // m[0] === '#' 是分組標題列（工具參數表本來就有『結算得分／得分層級／功能卡…』這種標題）
    var mapped = RHYTHM_MAP.filter(function (m) { return m[0] && m[0] !== '#'; })
                           .map(function (m) { return m[0]; });
    var missing = Object.keys(DEFAULT_TIMING).filter(function (k) { return mapped.indexOf(k) < 0; });
    var stray = mapped.filter(function (k) { return !(k in DEFAULT_TIMING); });
    ok('RHYTHM_MAP 涵蓋每個 TIMING', missing.length === 0, 'missing=' + missing.join(','));
    ok('RHYTHM_MAP 無多餘 key', stray.length === 0, 'stray=' + stray.join(','));
    var noStart = Object.keys(DEFAULT_TIMING).filter(function (k) { return !(k in DEFAULT_TIMING_START); });
    ok('每個 TIMING 都有甘特圖起點', noStart.length === 0, 'missing=' + noStart.join(','));
    var nan = [];
    [['auto', DEFAULT_TIMING], ['turbo', DEFAULT_TIMING_TURBO]].forEach(function (p) {
      Object.keys(p[1]).forEach(function (k) { if (!isFinite(p[1][k])) nan.push(p[0] + '.' + k); });
    });
    ok('沒有 NaN 節奏值', nan.length === 0, nan.join(','));

    // --- 主線：面板改值 → 匯出跟著變 ---
    // 一律走面板實際呼叫的 setTimingValue()，不要直接塞 TIMING（那會繞過真正的路徑）
    setSpeedMode('auto');
    setTimingValue('reelStart', 1.23, 0, 5);
    setTimingValue('multSlam', 2.34, 0, 5);
    ok('AUTO 改值寫進 TIMING_AUTO', TIMING_AUTO.reelStart === 1.23, TIMING_AUTO.reelStart);
    ok('AUTO 改值沒污染 TURBO', TIMING_TURBO.reelStart === DEFAULT_TIMING_TURBO.reelStart,
       TIMING_TURBO.reelStart);

    setSpeedMode('turbo');
    setTimingValue('reelStart', 0.31, 0, 5);
    ok('TURBO 改值寫進 TIMING_TURBO', TIMING_TURBO.reelStart === 0.31, TIMING_TURBO.reelStart);
    ok('TURBO 改值沒回頭改 AUTO', TIMING_AUTO.reelStart === 1.23, TIMING_AUTO.reelStart);
    setSpeedMode('auto');

    var shTool = sheetToolParams();
    var r = toolRow(shTool, '滾輪啟動');
    ok('工具參數表 AUTO 欄 = 面板值 1.23', r && r.auto === 1.23, r && r.auto);
    ok('工具參數表 TURBO 欄 = 面板值 0.31', r && r.turbo === 0.31, r && r.turbo);
    var r2 = toolRow(shTool, '得分相乘演繹');
    ok('工具參數表跟得上第二個改動 2.34', r2 && r2.auto === 2.34, r2 && r2.auto);

    var shG = sheetGantt();
    ok('甘特圖出現 滾輪滾動(1.23s)', ganttHas(shG, '滾輪滾動(1.23s)'));
    ok('甘特圖出現 得分相乘演繹(2.34s)', ganttHas(shG, '得分相乘演繹(2.34s)'));
    ok('甘特圖出現 TURBO 的 滾輪滾動(0.31s)', ganttHas(shG, '滾輪滾動(0.31s)'));

    var shF = sheetTemplate();
    var foundFb = false;
    Object.keys(shF.rows).forEach(function (rk) {
      var row = shF.rows[rk];
      if (row[5] && row[5].v === '滾輪轉動時間' && row[7] && row[7].v === 1.23) foundFb = true;
    });
    ok('範本的實測欄 = 面板值 1.23', foundFb);

    // --- 保存往返 ---
    ok('saveTuning 成功', saveTuning() === true);
    TIMING_AUTO.reelStart = 9; TIMING_TURBO.reelStart = 9;
    loadTuning();
    ok('載回後 AUTO 值還原 1.23', TIMING_AUTO.reelStart === 1.23, TIMING_AUTO.reelStart);
    ok('載回後 TURBO 值還原 0.31', TIMING_TURBO.reelStart === 0.31, TIMING_TURBO.reelStart);

    localStorage.setItem(TUNE_KEY, JSON.stringify({
      version: TUNE_VERSION - 1, timing: { reelStart: 4.44 } }));
    TIMING_AUTO = Object.assign({}, DEFAULT_TIMING);
    TIMING_TURBO = Object.assign({}, DEFAULT_TIMING_TURBO);
    setSpeedMode('auto');
    loadTuning();
    ok('舊版保存值被作廢，沒蓋掉新預設',
       TIMING_AUTO.reelStart === DEFAULT_TIMING.reelStart, TIMING_AUTO.reelStart);

    // --- 用預設值產一份檔，供樣式比對 ---
    localStorage.removeItem(TUNE_KEY);
    TIMING_AUTO = Object.assign({}, DEFAULT_TIMING);
    TIMING_TURBO = Object.assign({}, DEFAULT_TIMING_TURBO);
    setSpeedMode('auto');
    var sheets = [sheetGantt(), sheetToolParams(), sheetTemplate(), sheetSop(), sheetChecklist()];
    log.push('SHEETS=' + sheets.map(function (s) { return s.name; }).join('|'));
    var blob = buildXlsx(sheets);
    log.push('BLOB_BYTES=' + blob.size);
    var fr = new FileReader();
    fr.onload = function () {
      done(log.join('\\n') + '\\nXLSXB64_START\\n' + fr.result.split(',')[1] + '\\nXLSXB64_END');
    };
    fr.onerror = function () { done(log.join('\\n') + '\\nFILEREADER_ERROR'); };
    fr.readAsDataURL(blob);
  } catch (e) {
    done(log.join('\\n') + '\\nEXCEPTION: ' + e.message + '\\n' + e.stack);
  }
})();
</script>
</body>"""


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    src_path = os.path.abspath(sys.argv[1])
    out_dir = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.dirname(src_path)
    if not os.path.isdir(out_dir):
        os.makedirs(out_dir)

    # 1. 每次都從當前源檔重新產生測試檔
    src = io.open(src_path, encoding="utf-8").read()
    if src.count(u"</body>") != 1:
        print("FAIL: 源檔的 </body> 不唯一，無法注入測試腳本")
        return 1
    test_html = os.path.join(out_dir, "_verify_rhythm.html")
    io.open(test_html, "w", encoding="utf-8", newline="").write(src.replace(u"</body>", INJECT))

    # 2. headless Chrome
    profile = os.path.join(out_dir, "_verify_profile")
    if os.path.isdir(profile):
        shutil.rmtree(profile, ignore_errors=True)
    if not os.path.exists(CHROME):
        print("FAIL: 找不到 Chrome：" + CHROME)
        return 1
    dom = subprocess.run([
        CHROME, "--headless=new", "--disable-gpu", "--no-first-run",
        "--allow-file-access-from-files", "--user-data-dir=" + profile,
        "--virtual-time-budget=12000", "--dump-dom", test_html,
    ], capture_output=True, timeout=180).stdout.decode("utf-8", "replace")

    m = re.search(r'id="VERIFY_OUT">(.*?)</pre>', dom, re.S)
    if not m:
        print("FAIL: 測試腳本沒有輸出（頁面可能整個沒跑起來）")
        return 1
    body = m.group(1)
    head, _, rest = body.partition("XLSXB64_START")
    print(head.strip())

    # 3. 落檔
    b64, _, _ = rest.partition("XLSXB64_END")
    b64 = b64.strip()
    if b64:
        xlsx = os.path.join(out_dir, "verify_rhythm.xlsx")
        open(xlsx, "wb").write(base64.b64decode(b64))
        print("\n匯出的檔案: %s (%d bytes)" % (xlsx, os.path.getsize(xlsx)))
        print("接著跑 verify-rhythm-style.ps1 驗樣式。")

    n_fail = len([l for l in head.splitlines() if l.strip().startswith("FAIL")])
    print("\nRESULT: fail=%d" % n_fail)
    return 1 if (n_fail or not b64) else 0


if __name__ == "__main__":
    sys.exit(main())
