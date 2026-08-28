# -*- coding: utf-8 -*-
"""第三關：版面遮蔽掃描（rhythm-sheet-format.md「驗收這份匯出」第 3 點）。

掃全部分頁，找兩種只有目視才會發現、但目視又看不完的問題：
  1. 有文字、但落在合併區內且不是左上角 → 那個字在 Excel 裡看不見
  2. 同一列的合併區互相重疊 → Excel 開檔會報「檔案損毀」

用法: python verify_rhythm_layout.py <xlsx>

直接讀 xl/worksheets/sheetN.xml，不經 openpyxl——openpyxl 讀合併格的樣式會失真。
"""
import re
import sys
import zipfile

CELL_RE = re.compile(r'<c r="([A-Z]+)(\d+)"([^>]*?)(?:/>|>(.*?)</c>)', re.S)
MERGE_RE = re.compile(r'<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/>')
TEXT_RE = re.compile(r'<t[^>]*>(.*?)</t>', re.S)


def col_num(s):
    n = 0
    for ch in s:
        n = n * 26 + (ord(ch) - 64)
    return n


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    path = sys.argv[1]
    z = zipfile.ZipFile(path)

    names = {}
    wb = z.read('xl/workbook.xml').decode('utf-8')
    for i, m in enumerate(re.finditer(r'<sheet name="([^"]+)"', wb)):
        names[i + 1] = m.group(1)

    total_hidden = 0
    total_overlap = 0
    sheets = sorted(n for n in z.namelist() if n.startswith('xl/worksheets/sheet'))
    for sn in sheets:
        idx = int(re.search(r'sheet(\d+)\.xml', sn).group(1))
        label = names.get(idx, sn)
        xml = z.read(sn).decode('utf-8')

        merges = []
        for m in MERGE_RE.finditer(xml):
            merges.append((int(m.group(2)), col_num(m.group(1)),
                           int(m.group(4)), col_num(m.group(3))))

        # 1) 被合併區蓋住的文字
        hidden = []
        for m in CELL_RE.finditer(xml):
            col, row, body = col_num(m.group(1)), int(m.group(2)), m.group(4)
            if not body:
                continue
            t = TEXT_RE.search(body)
            if not t or not t.group(1).strip():
                continue
            for (r1, c1, r2, c2) in merges:
                if r1 <= row <= r2 and c1 <= col <= c2 and not (row == r1 and col == c1):
                    hidden.append('%s%d=%s' % (m.group(1), row, t.group(1)[:24]))
                    break

        # 2) 同一列的合併區互相重疊
        by_row = {}
        for (r1, c1, r2, c2) in merges:
            if r1 != r2:
                continue
            by_row.setdefault(r1, []).append((c1, c2))
        overlap = []
        for r, spans in by_row.items():
            spans.sort()
            for i in range(len(spans) - 1):
                if spans[i][1] >= spans[i + 1][0]:
                    overlap.append('r%d %s vs %s' % (r, spans[i], spans[i + 1]))

        total_hidden += len(hidden)
        total_overlap += len(overlap)
        print('[%s] merges=%d  被蓋住的文字=%d  合併區重疊=%d'
              % (label, len(merges), len(hidden), len(overlap)))
        for h in hidden[:8]:
            print('    HIDDEN ' + h)
        for o in overlap[:8]:
            print('    OVERLAP ' + o)

    print('')
    print('RESULT: hidden=%d overlap=%d' % (total_hidden, total_overlap))
    return 1 if (total_hidden or total_overlap) else 0


if __name__ == '__main__':
    sys.exit(main())
