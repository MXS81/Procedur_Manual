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
