# -*- coding: utf-8 -*-
"""每次從當前 index.html 重新產生測試檔再跑，避免測到舊快照。"""
import io, os, re, subprocess, sys

SP = os.path.dirname(os.path.abspath(__file__))
PROJ = r"D:\demo\test"
SRC = os.path.join(PROJ, "index.html")
OUT = os.path.join(PROJ, "_verify_crescendo.html")
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROFILE = os.path.join(SP, "chromeprof")

src = io.open(SRC, encoding="utf-8").read()
inj = io.open(os.path.join(SP, "verify_inject.js"), encoding="utf-8").read()
assert "</body>" in src, "no </body> in source"
# 不要硬編碼版本號（改了 APP_BUILD 就會擋住自己）。只確認有 APP_BUILD 並印出來，
# 再跟報告第一行的 BUILD= 對照，就知道測到的是不是這份源檔。
mb = re.search(r"const APP_BUILD = '([^']+)'", src)
assert mb, "APP_BUILD not found in source"
print("SOURCE_BUILD=" + mb.group(1))

doc = src.replace("</body>", "<script>\n" + inj + "\n</script>\n</body>", 1)
io.open(OUT, "w", encoding="utf-8", newline="\n").write(doc)
print("GENERATED %s (%d bytes) from index.html (%d bytes)" % (os.path.basename(OUT), len(doc), len(src)))

if not os.path.exists(CHROME):
    print("CHROME_NOT_FOUND: " + CHROME)
    sys.exit(2)

cmd = [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox",
       "--allow-file-access-from-files", "--user-data-dir=" + PROFILE,
       "--virtual-time-budget=25000", "--dump-dom", "file:///" + OUT.replace("\\", "/")]
p = subprocess.run(cmd, capture_output=True, timeout=300)
dom = p.stdout.decode("utf-8", "replace")
print("DOM_LEN=%d rc=%d" % (len(dom), p.returncode))

m = re.search(r'id="verifyOut">(.*?)</pre>', dom, re.S)
if not m:
    print("VERIFY_BLOCK_NOT_FOUND")
    err = p.stderr.decode("utf-8", "replace")
    print("STDERR_TAIL:\n" + err[-3000:])
    sys.exit(3)

txt = m.group(1)
for a, b in (("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&#39;", "'"), ("&amp;", "&")):
    txt = txt.replace(a, b)
rep = os.path.join(SP, "verify_report.txt")
io.open(rep, "w", encoding="utf-8", newline="\n").write(txt + "\n")
# 主控台是 cp950，印中文會 UnicodeEncodeError → 只印 ASCII 摘要，內容用 cat 讀檔
lines = txt.split("\n")
print("REPORT=" + rep)
print("LINES=%d PASS=%d FAIL=%d"
      % (len(lines),
         sum(1 for L in lines if L.startswith("PASS")),
         sum(1 for L in lines if L.startswith("FAIL") or L.startswith("FATAL"))))
