/**
 * Generate public/builtin-manuals/manifest.json:
 * 1) Scan public/builtin-manuals for dirs / .chm / .pdf (matches disk layout).
 * 2) Merge metadata from STATIC_CATALOG by fileName; unknown paths get auto ids.
 * 3) Append REMOTE_BY_ID-only rows when file absent locally (Release download).
 *
 * UTF-8 output. Run: node scripts/build-builtin-manifest.mjs
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const builtinRoot = path.join(__dirname, '..', 'public', 'builtin-manuals')
const outPath = path.join(builtinRoot, 'manifest.json')

/** 主下载源（默认 GitHub Releases） */
const PM_RELEASE_BASE = (process.env.PM_RELEASE_BASE || '').trim()
  || 'https://github.com/MXS81/Procedur_Manual/releases/download/manuals/'

/** 备选源（默认 Gitee Releases，国内更易连通）；设为空字符串可禁用 */
const PM_RELEASE_MIRROR_BASE = (process.env.PM_RELEASE_MIRROR_BASE !== undefined
  ? String(process.env.PM_RELEASE_MIRROR_BASE).trim()
  : 'https://gitee.com/mxs801/Procedur_Manual/releases/download/manuals/')

const IGNORE_TOP = new Set(['manifest.json', '.git', '.DS_Store', 'Thumbs.db'])

/**
 * @type {Map<string, {
 *   downloadUrl: string,
 *   downloadUrlMirror?: string,
 *   sha256?: string,
 *   downloadArchive?: 'zip',
 *   downloadUrlChw?: string,
 *   downloadUrlChwMirror?: string,
 *   sha256Chw?: string
 * }>}
 */
const REMOTE_BY_ID = new Map([
  ['builtin-cpp', {
    downloadUrl: PM_RELEASE_BASE + 'cppreference-zh_CN.chm',
    ...(PM_RELEASE_MIRROR_BASE
      ? { downloadUrlMirror: PM_RELEASE_MIRROR_BASE + 'cppreference-zh_CN.chm' }
      : {})
  }],
  ['builtin-mysql8', {
    downloadUrl: PM_RELEASE_BASE + 'MYSQL8.0.chm',
    ...(PM_RELEASE_MIRROR_BASE
      ? { downloadUrlMirror: PM_RELEASE_MIRROR_BASE + 'MYSQL8.0.chm' }
      : {})
  }],
  ['builtin-python-313-core-ref-v110', {
    downloadUrl: PM_RELEASE_BASE + 'Python.3.13.x.v1.10.chm',
    downloadUrlChw: PM_RELEASE_BASE + 'Python.3.13.x.v1.10.chw',
    ...(PM_RELEASE_MIRROR_BASE
      ? {
          downloadUrlMirror: PM_RELEASE_MIRROR_BASE + 'Python.3.13.x.v1.10.chm',
          downloadUrlChwMirror: PM_RELEASE_MIRROR_BASE + 'Python.3.13.x.v1.10.chw'
        }
      : {})
  }],
  ['builtin-qt-help-zh-full', {
    downloadUrl: PM_RELEASE_BASE + 'QT.chm',
    ...(PM_RELEASE_MIRROR_BASE
      ? { downloadUrlMirror: PM_RELEASE_MIRROR_BASE + 'QT.chm' }
      : {})
  }],
  ['builtin-php', {
    downloadUrl: PM_RELEASE_BASE + 'php-chunked-xhtml.zip',
    downloadArchive: 'zip',
    ...(PM_RELEASE_MIRROR_BASE
      ? { downloadUrlMirror: PM_RELEASE_MIRROR_BASE + 'php-chunked-xhtml.zip' }
      : {})
  }],
  ['builtin-js-ms-manual', {
    downloadUrl: PM_RELEASE_BASE + 'Microsoft_JS.chm',
    ...(PM_RELEASE_MIRROR_BASE
      ? { downloadUrlMirror: PM_RELEASE_MIRROR_BASE + 'Microsoft_JS.chm' }
      : {})
  }],
  ['builtin-js-lang-zh-chm', {
    downloadUrl: PM_RELEASE_BASE + 'JS_zh.chm',
    ...(PM_RELEASE_MIRROR_BASE
      ? { downloadUrlMirror: PM_RELEASE_MIRROR_BASE + 'JS_zh.chm' }
      : {})
  }],
  ['builtin-js-core-ref-zh', {
    downloadUrl: PM_RELEASE_BASE + 'JS_core.chm',
    ...(PM_RELEASE_MIRROR_BASE
      ? { downloadUrlMirror: PM_RELEASE_MIRROR_BASE + 'JS_core.chm' }
      : {})
  }]
])

/** Full row templates; fileName keys must match disk / Release layout. */
const STATIC_CATALOG = [
  {
    id: 'builtin-linux-command',
    name: 'Linux 命令手册',
    description: '基于本地 Markdown 命令文档整理的 Linux 命令手册',
    keywords: ['linux', '命令', 'shell', 'bash', 'terminal', 'cd', 'grep', 'ls'],
    fileName: 'command',
    version: '1.0'
  },
  {
    id: 'builtin-html-css',
    name: 'HTML / CSS 参考手册',
    description: 'HTML 标签与 CSS 属性完整参考',
    keywords: ['html', 'css', '网页', '前端', '标签', '样式'],
    fileName: 'html-css-reference.chm',
    version: '1.0'
  },
  {
    id: 'builtin-javascript',
    name: 'JavaScript 参考手册',
    description: 'JavaScript 语言核心、DOM、BOM 参考',
    keywords: ['javascript', 'js', '前端', 'es6', 'dom', 'node'],
    fileName: 'javascript-reference.chm',
    version: '1.0'
  },
  {
    id: 'builtin-python',
    name: 'Python 参考手册',
    description: 'Python 标准库与语言参考',
    keywords: ['python', 'py', '标准库', 'pip'],
    fileName: 'python-reference.chm',
    version: '1.0'
  },
  {
    id: 'builtin-python-313-core-ref-v110',
    name: 'Python 3.13.x 核心参考与实例手册',
    description: 'Python 3.13.x 语言核心与实例参考（CHM，含完整目录与全文搜索）',
    keywords: ['python', 'py', '3.13', '核心', '实例', '标准库', 'pip', 'typing'],
    fileName: 'Python 3.13.x 核心参考与实例手册 v1.10.chm',
    version: '1.10'
  },
  {
    id: 'builtin-cpp',
    name: 'C/C++ 参考手册',
    description: 'C/C++ 标准库函数与语言参考',
    keywords: ['c', 'c++', 'cpp', 'stl', '标准库'],
    fileName: 'cppreference-zh_CN.chm',
    version: '1.0'
  },
  {
    id: 'builtin-java',
    name: 'Java 参考手册',
    description: 'Java SE API 参考手册',
    keywords: ['java', 'jdk', 'api', 'spring'],
    fileName: 'java-reference.chm',
    version: '1.0'
  },
  {
    id: 'builtin-matlab',
    name: 'MATLAB 参考手册',
    description: 'MATLAB 函数与工具箱参考',
    keywords: ['matlab', '矩阵', '数值计算', 'simulink'],
    fileName: 'matlab-reference.chm',
    version: '1.0'
  },
  {
    id: 'builtin-sql',
    name: 'SQL 参考手册',
    description: 'SQL 语法与数据库操作参考',
    keywords: ['sql', 'mysql', '数据库', '查询', 'postgresql'],
    fileName: 'sql-reference.chm',
    version: '1.0'
  },
  {
    id: 'builtin-mysql8',
    name: 'MySQL 8.0 中文参考手册',
    description: 'MySQL 8.0 官方中文文档，安装、SQL、存储引擎、复制、安全与运维等完整参考',
    keywords: ['mysql', 'mysql8', '数据库', 'innodb', 'sql', '查询', '索引', '复制', '备份'],
    fileName: 'MYSQL8.0中文参考手册.chm',
    version: '1.0'
  },
  {
    id: 'builtin-git',
    name: 'Git 参考手册',
    description: 'Git 常用命令参考手册，涵盖 config、clone、commit、push、pull、branch、merge、rebase、stash、tag 等',
    keywords: ['git', '版本控制', 'github', '分支', '合并', 'commit', 'push', 'pull', 'clone', 'rebase'],
    fileName: 'git',
    version: '2.0'
  },
  {
    id: 'builtin-php',
    name: 'PHP 参考手册',
    description: 'PHP 官方中文文档，函数、类、语言语法完整参考',
    keywords: ['php', '函数', 'array', 'string', 'mysql', 'pdo', 'json', '正则'],
    fileName: 'php-chunked-xhtml',
    entryFile: 'index.html',
    version: '1.0'
  },
  {
    id: 'builtin-js-core-ref-zh',
    name: 'JavaScript 核心参考手册',
    description:
      'JavaScript 核心语法与 API 参考（CHM）。请在资源中心下载；无 .hhc 时不生成侧栏目录，请用全文搜索。',
    keywords: ['javascript', 'js', '核心', '参考', 'ecma', '语法'],
    fileName: 'JS_core.chm',
    version: '1.0'
  },
  {
    id: 'builtin-js-ms-manual',
    name: '微软 JavaScript 手册',
    description:
      '微软 JavaScript / JScript 脚本手册（CHM）。请在资源中心下载；无 .hhc 时不生成侧栏目录，请用全文搜索。',
    keywords: ['javascript', 'js', '微软', 'jscript', '脚本', 'ie'],
    fileName: 'Microsoft_JS.chm',
    version: '1.0'
  },
  {
    id: 'builtin-js-lang-zh-chm',
    name: 'JavaScript 语言中文参考手册',
    description:
      'JavaScript 语言中文参考（CHM）。请在资源中心下载；无 .hhc 时不生成侧栏目录，请用全文搜索。',
    keywords: ['javascript', 'js', '中文', '参考', '语言', 'ecma'],
    fileName: 'JS_zh.chm',
    version: '1.0'
  },
  {
    id: 'builtin-vim-manual-zh-72',
    name: 'Vim 手册中文版 7.2',
    description: 'Vim 编辑器中文帮助文档 7.2（内置 CHM；无 .hhc 时请用全文搜索）',
    keywords: ['vim', 'vi', '编辑器', '帮助', '命令', '7.2', '中文版'],
    fileName: 'Vim手册中文版7.2.chm',
    version: '7.2'
  },
  {
    id: 'builtin-qt-help-zh-full',
    name: 'Qt 中文帮助文档（完整版）',
    description: 'Qt 框架官方中文帮助（CHM，含类库、信号槽、QML 等参考）',
    keywords: [
      'qt', 'qt5', 'qt6', 'qml', 'qwidget', 'signals', 'slots', 'c++', 'gui',
      '信号', '槽', '界面', '帮助'
    ],
    fileName: 'QT中文帮助文档完整版.chm',
    version: '1.0'
  },
  {
    id: 'builtin-vue-official-pdf-zh',
    name: 'Vue.js 官方离线文档（PDF）',
    description: 'Vue.js 官方文档中文离线版（PDF）。PDF 全文检索需 Poppler（pdftotext）；资源与依赖内可安装或重启 uTools 后点「索引」。',
    keywords: ['vue', 'vue3', 'vue2', '前端', '框架', '组合式', '选项式', 'cli', 'router', 'vuex'],
    fileName: 'VueJS官方离线文档(搬运版).pdf',
    version: '1.0'
  }
]

const KNOWN_BY_FILE = new Map(STATIC_CATALOG.map((e) => [e.fileName, e]))
/** 旧版内置路径仍指向同一 manifest 条目，避免本地残留文件被扫成 auto id */
const CATALOG_BY_ID = new Map(STATIC_CATALOG.map((e) => [e.id, e]))
for (const [legacyRel, legacyId] of [
  ['JS参考手册集合/JavaScript核心参考手册.chm', 'builtin-js-core-ref-zh'],
  ['JS参考手册集合/微软JavaScript手册js.chm', 'builtin-js-ms-manual'],
  ['JS参考手册集合/JavaScript语言中文参考手册.chm', 'builtin-js-lang-zh-chm']
]) {
  const meta = CATALOG_BY_ID.get(legacyId)
  if (meta) KNOWN_BY_FILE.set(legacyRel, meta)
}

function toPosixRel (root, absPath) {
  return path.relative(root, absPath).split(path.sep).join('/')
}

function walkFiles (dir, acc) {
  let dirents
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const d of dirents) {
    const p = path.join(dir, d.name)
    if (d.isDirectory()) walkFiles(p, acc)
    else acc.push(p)
  }
  return acc
}

function dirTreeHasMd (dir) {
  let dirents
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return false
  }
  for (const d of dirents) {
    const p = path.join(dir, d.name)
    if (d.isDirectory()) {
      if (dirTreeHasMd(p)) return true
    } else if (/\.md$/i.test(d.name)) {
      return true
    }
  }
  return false
}

function dirHtmlManualLike (dir) {
  const idx = path.join(dir, 'index.html')
  try {
    if (fs.existsSync(idx) && fs.statSync(idx).isFile()) return true
  } catch { /* */ }
  const all = []
  walkFiles(dir, all)
  let htmlN = 0
  for (const f of all) {
    if (/\.(html|htm)$/i.test(f)) {
      htmlN++
      if (htmlN >= 8) return true
    }
  }
  return false
}

function listChmPdfUnder (dir) {
  const all = []
  walkFiles(dir, all)
  return all.filter((f) => /\.(chm|pdf)$/i.test(f))
}

/**
 * @returns {string[]} fileName relative to builtinRoot (posix)
 */
function discoverFromDisk (root) {
  if (!fs.existsSync(root)) return []
  const out = []
  const seen = new Set()
  const push = (rel) => {
    const n = rel.replace(/^[\\/]+/, '')
    if (!seen.has(n)) {
      seen.add(n)
      out.push(n)
    }
  }

  let top
  try {
    top = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return []
  }

  for (const ent of top) {
    if (IGNORE_TOP.has(ent.name)) continue
    const full = path.join(root, ent.name)
    if (ent.isFile()) {
      if (/\.(chm|pdf)$/i.test(ent.name)) push(ent.name)
      continue
    }
    if (!ent.isDirectory()) continue

    const hasMd = dirTreeHasMd(full)
    const assets = listChmPdfUnder(full)
    if (assets.length > 0 && !hasMd) {
      for (const abs of assets) push(toPosixRel(root, abs))
    } else if (hasMd || ent.name === 'php-chunked-xhtml' || dirHtmlManualLike(full)) {
      push(ent.name)
    }
  }
  return out
}

function buildAutoEntry (fileName) {
  const base = path.basename(fileName).replace(/\.[^.]+$/, '') || fileName
  const id =
    'builtin-auto-' +
    crypto.createHash('md5').update(fileName).digest('hex').slice(0, 12)
  const parts = base.split(/[\s._\-\/]+/).filter(Boolean)
  const kw = parts.slice(0, 8)
  if (kw.length === 0) kw.push('docs')
  return {
    id,
    name: base,
    description:
      '本地内置资源（自动扫描）: ' + fileName,
    keywords: kw,
    fileName,
    version: '1.0'
  }
}

function existsUnderRoot (root, fileName) {
  const p = path.join(root, ...fileName.split('/'))
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}

function buildManifest () {
  const discovered = discoverFromDisk(builtinRoot)
  const seen = new Set()
  const rows = []

  for (const fileName of discovered) {
    if (!existsUnderRoot(builtinRoot, fileName)) continue
    const known = KNOWN_BY_FILE.get(fileName)
    if (known) {
      rows.push({ ...known })
    } else {
      rows.push(buildAutoEntry(fileName))
    }
    seen.add(fileName)
  }

  for (const stub of STATIC_CATALOG) {
    if (seen.has(stub.fileName)) continue
    if (REMOTE_BY_ID.has(stub.id)) {
      rows.push({ ...stub })
    }
  }

  for (const entry of rows) {
    const r = REMOTE_BY_ID.get(entry.id)
    if (r) {
      entry.downloadUrl = r.downloadUrl
      if (r.downloadUrlMirror) entry.downloadUrlMirror = r.downloadUrlMirror
      if (r.sha256) entry.sha256 = r.sha256
      if (r.downloadArchive) entry.downloadArchive = r.downloadArchive
      if (r.downloadUrlChw) entry.downloadUrlChw = r.downloadUrlChw
      if (r.downloadUrlChwMirror) entry.downloadUrlChwMirror = r.downloadUrlChwMirror
      if (r.sha256Chw) entry.sha256Chw = r.sha256Chw
    }
  }

  rows.sort((a, b) =>
    String(a.fileName).localeCompare(String(b.fileName), 'zh-Hans-CN', { sensitivity: 'base' })
  )

  return rows
}

const BUILTIN_MANUALS = buildManifest()
const text = JSON.stringify(BUILTIN_MANUALS, null, 2) + '\n'
fs.writeFileSync(outPath, text, 'utf8')
console.log('[build-builtin-manifest] wrote', outPath, 'entries:', BUILTIN_MANUALS.length)
