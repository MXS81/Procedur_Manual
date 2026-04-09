/**
 * UI strings as Unicode escapes only (ASCII source file).
 * Avoids mojibake when the repo is saved or built with a wrong code page on Windows.
 */

export const SEARCH_MATCHER_ERRORS = {
  emptyQuery: '\u8bf7\u8f93\u5165\u641c\u7d22\u5185\u5bb9',
  badRegex: '\u65e0\u6548\u7684\u6b63\u5219\u8868\u8fbe\u5f0f'
}

export const SEARCH_INPUT_TITLES = {
  clear: '\u6e05\u9664',
  matchCase: '\u533a\u5206\u5927\u5c0f\u5199',
  wholeWord: '\u5168\u5b57\u5339\u914d',
  useRegex: '\u4f7f\u7528\u6b63\u5219\u8868\u8fbe\u5f0f'
}

/** Custom context menu (uTools / Electron often disables native menu) */
export const CONTEXT_MENU_LABELS = {
  cut: '\u526a\u5207',
  copy: '\u590d\u5236',
  paste: '\u7c98\u8d34',
  selectAll: '\u5168\u9009'
}

/** PDF \u7d22\u5f15\uff08\u5168\u5e93\u641c\u7d22\uff09\u4f9d\u8d56 Poppler pdftotext */
export const PDF_INDEX_POPPLER_DOWNLOAD_URL =
  'https://github.com/oschwartz10612/poppler-windows/releases/'

export const PDF_INDEX_POPPLER_CARD_PREFIX =
  'PDF \u5168\u6587\u68c0\u7d22\u9700\u5b89\u88c5 Poppler\uff08pdftotext\uff09\u3002\u4e0b\u8f7d\uff1a'

export const PDF_INDEX_POPPLER_CARD_SUFFIX =
  ' \u89e3\u538b\u540e\u5c06\u5176\u4e2d Library/bin \u6216 bin \u52a0\u5165\u7528\u6237 PATH\uff0c\u5b8c\u5168\u9000\u51fa\u5e76\u91cd\u5f00 uTools\uff0c\u518d\u70b9\u300c\u7d22\u5f15\u300d\u91cd\u5efa\u3002'

export const PDF_INDEX_POPPLER_SCRIPT_HINT =
  '\u81ea\u52a8\u5316\uff1a\u5728\u63d2\u4ef6\u6839\u76ee\u5f55\u5bf9 install-poppler-windows.ps1 \u53f3\u952e\u300c\u4f7f\u7528 PowerShell \u8fd0\u884c\u300d\uff08\u6216\u7ec8\u7aef\u6267\u884c\uff1a powershell -ExecutionPolicy Bypass -File .\\install-poppler-windows.ps1 \uff09\uff0c\u811a\u672c\u4f1a\u4e0b\u8f7d\u5e76\u5199\u5165\u7528\u6237 PATH\u3002'

export const PDF_VIEWER_UI = {
  loading: '\u6b63\u5728\u52a0\u8f7d PDF\u2026',
  fullSearch: '\u5168\u6587\u641c\u7d22',
  closeEsc: '\u5173\u95ed\uff08Esc\uff09',
  closeSearch: '\u5173\u95ed\u641c\u7d22',
  placeholder: '\u5728 PDF \u5168\u6587\u4e2d\u641c\u7d22\u2026',
  searching: '\u6b63\u5728\u641c\u7d22\u2026',
  noMatch: '\u672a\u627e\u5230\u5339\u914d\u9875',
  fabTitle: '\u5168\u6587\u641c\u7d22',
  fabAria: '\u6253\u5f00\u5168\u6587\u641c\u7d22',
  zoomTitle:
    '\u5728 PDF \u533a\u57df\u6309\u4f4f Ctrl \u5e76\u6eda\u52a8\u9f20\u6807\u6eda\u8f6e\u53ef\u7f29\u653e'
}

export function pdfCappedHint (maxPages, numPages) {
  return (
    '\u4ec5\u641c\u7d22\u524d ' +
    maxPages +
    ' \u9875\uff08\u6587\u6863\u5171 ' +
    numPages +
    ' \u9875\uff09'
  )
}

export function pdfPageLabel (pageNum) {
  return '\u7b2c ' + pageNum + ' \u9875'
}

export function pdfMatchCountLabel (n) {
  return n + ' \u5904'
}

/** ManualCard: use code points so \u7d22 (\u7d + digit) is never misparsed in JSX/bundlers */
export const MAIN_SEARCH_TOGGLE_LABEL = String.fromCodePoint(0x4e3b, 0x641c, 0x7d22)

export const MAIN_SEARCH_TOGGLE_TITLE =
  'uTools ' +
  String.fromCodePoint(
    0x4e3b,
    0x641c,
    0x7d22,
    0x6846,
    0x5339,
    0x914d,
    0x672c,
    0x624b,
    0x518c,
    0x540d,
    0x4e0e,
    0x5173,
    0x952e,
    0x8bcd
  )

/** \u8d44\u6e90\u4e2d\u5fc3\uff1aRelease \u79bb\u7ebf\u5305 + \u4f9d\u8d56\uff08Poppler \u7b49\uff09 */
export const RESOURCES_CENTER_UI = {
  openButton: '\u8d44\u6e90\u4e0e\u4f9d\u8d56',
  title: '\u8d44\u6e90\u4e0e\u4f9d\u8d56',
  close: '\u5173\u95ed',
  sectionReleases: '\u79bb\u7ebf\u8d44\u6e90\uff08GitHub Releases\uff09',
  sectionReleasesHint:
    '\u9996\u6b21\u9ed8\u8ba4\u5168\u90e8\u4e0d\u52fe\u9009\u3002\u52fe\u9009\u5e76\u300c\u4fdd\u5b58\u52fe\u9009\u300d\u540e\uff0c\u5df2\u4e0b\u8f7d\u5b8c\u7684\u8fdc\u7a0b\u6761\u76ee\u4f1a\u51fa\u73b0\u5728\u624b\u518c\u5217\u8868\uff1b\u672a\u52fe\u9009\u6216\u672a\u4e0b\u8f7d\u7684\u4e0d\u5360\u4f4d\u3002\u5df2\u4e0b\u8f7d\u9879\u53ef\u70b9\u300c\u91cd\u65b0\u4e0b\u8f7d\u300d\u3002',
  sectionDeps: '\u4f9d\u8d56',
  sectionDepsHint:
    'PDF \u5168\u6587\u68c0\u7d22\u9700 Poppler\uff08pdftotext\uff09\u3002\u66f4\u591a\u4f9d\u8d56\u5c06\u5728\u540e\u7eed\u7248\u672c\u8865\u5145\u3002',
  colName: '\u540d\u79f0',
  colStatus: '\u72b6\u6001',
  colAction: '\u64cd\u4f5c',
  statusDownloaded: '\u5df2\u4e0b\u8f7d',
  statusNotDownloaded: '\u672a\u4e0b\u8f7d',
  saveSelection: '\u4fdd\u5b58\u52fe\u9009',
  downloadSelected: '\u4e0b\u8f7d/\u91cd\u4e0b\u8f7d\u5df2\u52fe\u9009\u9879',
  downloadOne: '\u4e0b\u8f7d',
  downloadAgain: '\u91cd\u65b0\u4e0b\u8f7d',
  downloading: '\u4e0b\u8f7d\u4e2d\u2026',
  saved: '\u5df2\u4fdd\u5b58\u52fe\u9009',
  saveFailed: '\u4fdd\u5b58\u5931\u8d25\uff1a',
  downloadOk: '\u4e0b\u8f7d\u5b8c\u6210',
  downloadFail: '\u4e0b\u8f7d\u5931\u8d25\uff1a',
  batchOk: '\u6279\u91cf\u4e0b\u8f7d\u5b8c\u6210',
  nothingToDownload: '\u8bf7\u5148\u52fe\u9009\u81f3\u5c11\u4e00\u6761\u8fdc\u7a0b\u8d44\u6e90',
  popplerTitle: 'Poppler\uff08pdftotext\uff09',
  popplerOk: '\u5df2\u68c0\u6d4b\u5230\uff08\u5f53\u524d\u8fdb\u7a0b\u53ef\u7528\uff09',
  popplerMissing: '\u672a\u68c0\u6d4b\u5230\uff08PDF \u7d22\u5f15\u53ef\u80fd\u4e3a\u7a7a\uff09',
  popplerInstall: '\u81ea\u52a8\u4e0b\u8f7d\u5e76\u914d\u7f6e\u7528\u6237 PATH',
  popplerInstalling: '\u6b63\u5728\u5b89\u88c5\u2026',
  popplerWinOnly: '\u4ec5\u652f\u6301 Windows\u3002\u5176\u4ed6\u7cfb\u7edf\u8bf7\u624b\u52a8\u5b89\u88c5 Poppler\u5e76\u52a0\u5165 PATH\u3002',
  popplerDone: '\u5b89\u88c5\u5b8c\u6210\u3002\u8bf7\u5b8c\u5168\u9000\u51fa\u5e76\u91cd\u5f00 uTools \u540e\u518d\u7d22\u5f15 PDF\u3002',
  popplerFail: '\u5b89\u88c5\u5931\u8d25\uff1a',
  depsMoreLater: '\u66f4\u591a\u4f9d\u8d56\uff1a\u656c\u8bf7\u671f\u5f85',
  emptyCatalog: '\u6682\u65e0\u9700\u8981\u4ece Releases \u4e0b\u8f7d\u7684\u5185\u7f6e\u6761\u76ee\u3002'
}
