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

/** 目录型 Markdown 手册：用户新增命令条目 */
export const DIR_MD_ADD_COMMAND_UI = {
  buttonTitle: '按固定格式新增一条命令文档（.md）',
  buttonLabel: '新增',
  modalTitle: '新增命令文档',
  formatHint:
    '请先写两行元数据，空一行后再写正文（Markdown）。将保存为「命令名.md」。',
  cancel: '取消',
  save: '保存',
  saving: '保存中…',
  successSaved: '已保存',
  successTail: '。若需参与全文搜索，请在手册卡片上重建索引。',
  parseError: '格式有误：',
  saveError: '保存失败：',
  needService: '当前环境无法写入文件',
  deleteItem: '删除命令文档',
  deleteConfirmPrefix: '确定删除',
  deleteConfirmSuffix: '？此操作不可恢复。',
  deleteDone: '已删除',
  deleteFail: '删除失败：',
  deleteForbidden: '只能删除通过本页「新增」添加的文档'
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
  openButton: '资源与插件',
  title: '资源中心',
  close: '关闭',
  sectionReleases: '离线资源（GitHub Releases）',
  sectionReleasesHint:
    '仓库地址：https://github.com/MXS81/Procedur_Manual',
  sectionPlugins: '插件与其它',
  sectionPluginsHint:
    'PDF 全文检索需 Poppler（pdftotext）。',
  colName: '名称',
  colAction: '下载',
  downloadSelected: '下载已勾选项',
  downloadOk: '下载完成',
  downloadFail: '下载失败：',
  downloadPaused: '下载已暂停',
  persistFail: '勾选保存失败：',
  batchOk: '批量下载完成',
  nothingToDownload: '请先勾选至少一条远程资源',
  ariaDownload: '下载到本地',
  ariaPause: '暂停下载',
  ariaRedownload: '重新下载',
  popplerTitle: 'Poppler（pdftotext）',
  popplerOk: '当前进程已检测到 pdftotext，PDF 索引可用。',
  popplerMissing: '未检测到 Poppler，PDF 索引可能为空。',
  popplerInstall: '自动下载并配置用户 PATH',
  popplerInstalling: '正在安装…',
  popplerWinOnly: '仅支持 Windows。其他系统请手动安装 Poppler 并加入 PATH。',
  popplerDone: '安装完成。请完全退出并重开 uTools 后再索引 PDF。',
  popplerFail: '安装失败：',
  depsMoreLater: '更多插件：敬请期待',
  emptyCatalog: '暂无需要从 Releases 下载的内置条目。'
}
