# 驗證 Crescendo 匯出的節奏組工作表，樣式是否對得上節奏組公版。
# 複製自 slot-demo-from-gdd skill 的 verify-rhythm-style.ps1，只改了跟本遊戲節奏值有關的座標。
#
# 用法:
#   powershell -File verify-rhythm-style.ps1 <verify_rhythm.xlsx 的路徑>
#
# 期望值一律是「實檔在 Excel 裡讀回來的顯示值」，不是 XML 原始值——
# 兩者不同（XML width="35.625" 在 Excel 顯示 35；ht="20.1" 顯示 20），
# 拿 XML 值當期望值會誤判成不符。規格出處：references/rhythm-sheet-format.md
#
# openpyxl 驗不了合併格的樣式（非左上角的格會被讀成 MergedCell，fill 一律回預設值），
# 所以這一關一定要用 Excel COM。

param([Parameter(Mandatory = $true)][string]$Path)

if (-not (Test-Path $Path)) { Write-Output ("找不到檔案: " + $Path); exit 1 }
$Path = (Resolve-Path $Path).Path

function HexOf($v) {
  $i = [int]$v
  "{0:X2}{1:X2}{2:X2}" -f ($i -band 0xFF), (($i -shr 8) -band 0xFF), (($i -shr 16) -band 0xFF)
}
$pass = 0; $fail = 0
function Check($label, $got, $want) {
  if ("$got" -eq "$want") { $script:pass++; Write-Output ("  PASS  " + $label.PadRight(38) + " = " + $got) }
  else { $script:fail++; Write-Output ("  FAIL  " + $label.PadRight(38) + " got=" + $got + "  want=" + $want) }
}

$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false
try {
  $wb = $xl.Workbooks.Open($Path, $false, $true)
  Check "分頁數" $wb.Sheets.Count 5

  $g = $wb.Worksheets.Item("節奏表")
  Write-Output ""
  Write-Output "=== 節奏表：字型（微軟正黑體；只有 10/12 兩種字級、黑/紅兩種字色）==="
  Check "B1 字型"         $g.Range("B1").Font.Name "微軟正黑體"
  Check "B1 字級"         $g.Range("B1").Font.Size 12
  Check "B1 字色(紅)"     (HexOf $g.Range("B1").Font.Color) "FF0000"
  Check "B5 停輪規則字級"  $g.Range("B5").Font.Size 12
  Check "B5 停輪規則字色"  (HexOf $g.Range("B5").Font.Color) "000000"
  Check "B6 情境名字級"    $g.Range("B6").Font.Size 12
  Check "B6 情境名粗體"    $g.Range("B6").Font.Bold "True"
  Check "B7 得分流程粗體"  $g.Range("B7").Font.Bold "True"
  Check "B7 得分流程字級"  $g.Range("B7").Font.Size 10
  Check "B9 甘特條字級"    $g.Range("B9").Font.Size 10

  Write-Output ""
  Write-Output "=== 節奏表：填色（Excel 權威 RGB）==="
  Check "A6 情境標記(橘)"  (HexOf $g.Range("A6").Interior.Color) "E97132"
  Check "B6 情境名列"      (HexOf $g.Range("B6").Interior.Color) "61CBF3"
  Check "B8 刻度列"        (HexOf $g.Range("B8").Interior.Color) "C0E6F5"
  Check "B9 滾輪滾動"      (HexOf $g.Range("B9").Interior.Color) "FFD5EA"

  Write-Output ""
  Write-Output "=== 節奏表：框線與版面 ==="
  Check "刻度數字格右緣色"  (HexOf $g.Range("L8").Borders.Item(10).Color) "000000"
  Check "刻度數字格靠右"    $g.Range("L8").HorizontalAlignment (-4152)
  Check "甘特條無框線"      $g.Range("C9").Borders.Item(7).LineStyle (-4142)
  # 事件標記「第1輪停輪」的欄位 = RCOL(reelStart)。Crescendo 的 reelStart = 0.7s（節奏組工作表 AUTO 欄）
  # 每小格 0.1 秒、B 欄起算 → 欄號 = 2 + reelStart*10；改了 reelStart 就要同步改下面三行
  # → 第 12 欄 = L（骨架的預設值落在 H，換遊戲這個座標本來就會變）。
  Check "事件標記文字"      $g.Range("I10").Text "第1輪停輪"
  Check "事件標記左框色"    (HexOf $g.Range("I10").Borders.Item(7).Color) "FF0000"
  Check "事件標記左框粗細"  $g.Range("I10").Borders.Item(7).Weight (-4138)
  Check "欄寬"             $g.Columns("B").ColumnWidth 2.75
  Check "列高"             $g.Rows(9).RowHeight 21

  Write-Output ""
  Write-Output "=== 工具參數表 ==="
  $t = $wb.Worksheets.Item("工具參數表")
  Check "A1 字型"    $t.Range("A1").Font.Name "微軟正黑體"
  Check "A1 字級"    $t.Range("A1").Font.Size 12
  Check "A1 非粗體"  $t.Range("A1").Font.Bold "False"
  Check "A1 框線色"  (HexOf $t.Range("A1").Borders.Item(7).Color) "D9D9D9"
  Check "A欄寬"      $t.Columns("A").ColumnWidth 35
  Check "C欄寬"      $t.Columns("C").ColumnWidth 67.38
  Check "列高"       $t.Rows(2).RowHeight 16.5

  Write-Output ""
  Write-Output "=== 範本 ==="
  $f = $null
  foreach ($ws in $wb.Worksheets) { if ($ws.Name -like "*範本") { $f = $ws } }
  if ($null -eq $f) { Write-Output "  FAIL  找不到範本分頁"; $fail++ }
  else {
    Check "B3 表頭底"   (HexOf $f.Range("B3").Interior.Color) "C0E6F5"
    Check "B4 分組列底" (HexOf $f.Range("B4").Interior.Color) "83CCEB"
    Check "C5 待填格底" (HexOf $f.Range("C5").Interior.Color) "DAE9F8"
    Check "B5 框線色"   (HexOf $f.Range("B5").Borders.Item(7).Color) "D0D0D0"
    Check "B欄寬"       $f.Columns("B").ColumnWidth 15
    Check "列高"        $f.Rows(5).RowHeight 20
    Check "字級"        $f.Range("B5").Font.Size 12
  }

  $wb.Close($false)
  Write-Output ""
  Write-Output ("RESULT: pass=" + $pass + "  fail=" + $fail)
} catch {
  Write-Output ("EXCEPTION: " + $_.Exception.Message)
  $fail++
} finally {
  $xl.Quit()
}
if ($fail -gt 0) { exit 1 } else { exit 0 }
