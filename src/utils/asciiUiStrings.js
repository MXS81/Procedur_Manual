/**
 * UI 字符串（UTF-8 源文件，中文明文）。
 */

export const SEARCH_MATCHER_ERRORS = {
  emptyQuery: '请输入搜索内容',
  badRegex: '无效的正则表达式'
}

export const SEARCH_INPUT_TITLES = {
  clear: '清除',
  matchCase: '区分大小写',
  wholeWord: '全字匹配',
  useRegex: '使用正则表达式'
}

export const CONTEXT_MENU_LABELS = {
  cut: '剪切',
  copy: '复制',
  paste: '粘贴',
  selectAll: '全选'
}

export const PDF_VIEWER_UI = {
  loading: '正在加载 PDF…',
  fullSearch: '全文搜索',
  closeEsc: '关闭（Esc）',
  closeSearch: '关闭搜索',
  placeholder: '在 PDF 全文中搜索…',
  searching: '正在搜索…',
  noMatch: '未找到匹配页',
  fabTitle: '全文搜索',
  fabAria: '打开全文搜索',
  zoomTitle:
    '在 PDF 区域按住 Ctrl 并滚动鼠标滚轮可缩放'
}

export function pdfCappedHint (maxPages, numPages) {
  return (
    '仅搜索前 ' +
    maxPages +
    ' 页（文档共 ' +
    numPages +
    ' 页）'
  )
}

export function pdfPageLabel (pageNum) {
  return '第 ' + pageNum + ' 页'
}

export function pdfMatchCountLabel (n) {
  return n + ' 处'
}

export const MAIN_SEARCH_TOGGLE_LABEL = '主搜索'

export const MAIN_SEARCH_TOGGLE_TITLE = 'uTools主搜索框匹配本手册名与关键词'

/** 资源中心：Release 离线包 + 依赖（Poppler 等） */
export const RESOURCES_CENTER_UI = {
  openButton: '资源与依赖',
  title: '资源与依赖',
  close: '关闭',
  sectionReleases: '离线资源（GitHub Releases）',
  sectionReleasesHint:
    '仓库地址：https://github.com/MXS81/Procedur_Manual',
  sectionDeps: '依赖',
  sectionDepsHint:
    'PDF全文检索需 Poppler（pdftotext）。更多依赖将在后续版本补充。',
  colName: '名称',
  colStatus: '状态',
  colAction: '操作',
  statusDownloaded: '已下载',
  statusNotDownloaded: '未下载',
  saveSelection: '保存勾选',
  downloadSelected: '下载/重下载已勾选项',
  downloadOne: '下载',
  downloadAgain: '重新下载',
  downloading: '下载中…',
  saved: '已保存勾选',
  saveFailed: '保存失败：',
  downloadOk: '下载完成',
  downloadFail: '下载失败：',
  batchOk: '批量下载完成',
  nothingToDownload: '请先勾选至少一条远程资源',
  popplerTitle: 'Poppler（pdftotext）',
  popplerOk: '已检测到（当前进程可用）',
  popplerMissing: '未检测到（PDF 索引可能为空）',
  popplerInstall: '自动下载并配置用户 PATH',
  popplerInstalling: '正在安装…',
  popplerWinOnly: '仅支持 Windows。其他系统请手动安装 Poppler并加入 PATH。',
  popplerDone: '安装完成。请完全退出并重开 uTools 后再索引 PDF。',
  popplerFail: '安装失败：',
  depsMoreLater: '更多依赖：敬请期待',
  emptyCatalog: '暂无需要从 Releases 下载的内置条目。'
}
