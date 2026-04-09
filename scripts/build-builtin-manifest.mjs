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

const PM_RELEASE_BASE = (process.env.PM_RELEASE_BASE || '').trim()
  || 'https://github.com/MXS81/Procedur_Manual/releases/download/manuals/'

const IGNORE_TOP = new Set(['manifest.json', '.git', '.DS_Store', 'Thumbs.db'])

/**
 * @type {Map<string, {
 *   downloadUrl: string,
 *   sha256?: string,
 *   downloadArchive?: 'zip',
 *   downloadUrlChw?: string,
 *   sha256Chw?: string
 * }>}
 */
const REMOTE_BY_ID = new Map([
  ['builtin-cpp', { downloadUrl: PM_RELEASE_BASE + 'cppreference-zh_CN.chm' }],
  ['builtin-mysql8', { downloadUrl: PM_RELEASE_BASE + 'MYSQL8.0.chm' }],
  ['builtin-python-313-core-ref-v110', {
    downloadUrl: PM_RELEASE_BASE + 'Python.3.13.x.v1.10.chm',
    downloadUrlChw: PM_RELEASE_BASE + 'Python.3.13.x.v1.10.chw'
  }],
  ['builtin-qt-help-zh-full', { downloadUrl: PM_RELEASE_BASE + 'QT.chm' }],
  ['builtin-php', {
    downloadUrl: PM_RELEASE_BASE + 'php-chunked-xhtml.zip',
    downloadArchive: 'zip'
  }]
])

/** Full row templates; fileName keys must match disk / Release layout. */
const STATIC_CATALOG = [
  {
    id: 'builtin-linux-command',
    name: 'Linux \u547d\u4ee4\u624b\u518c',
    description: '\u57fa\u4e8e\u672c\u5730 Markdown \u547d\u4ee4\u6587\u6863\u6574\u7406\u7684 Linux \u547d\u4ee4\u624b\u518c',
    keywords: ['linux', '\u547d\u4ee4', 'shell', 'bash', 'terminal', 'cd', 'grep', 'ls'],
    fileName: 'command',
    version: '1.0'
  },
  {
    id: 'builtin-html-css',
    name: 'HTML / CSS \u53c2\u8003\u624b\u518c',
    description: 'HTML \u6807\u7b7e\u4e0e CSS \u5c5e\u6027\u5b8c\u6574\u53c2\u8003',
    keywords: ['html', 'css', '\u7f51\u9875', '\u524d\u7aef', '\u6807\u7b7e', '\u6837\u5f0f'],
    fileName: 'html-css-reference.chm',
    version: '1.0'
  },
  {
    id: 'builtin-javascript',
    name: 'JavaScript \u53c2\u8003\u624b\u518c',
    description: 'JavaScript \u8bed\u8a00\u6838\u5fc3\u3001DOM\u3001BOM \u53c2\u8003',
    keywords: ['javascript', 'js', '\u524d\u7aef', 'es6', 'dom', 'node'],
    fileName: 'javascript-reference.chm',
    version: '1.0'
  },
  {
    id: 'builtin-python',
    name: 'Python \u53c2\u8003\u624b\u518c',
    description: 'Python \u6807\u51c6\u5e93\u4e0e\u8bed\u8a00\u53c2\u8003',
    keywords: ['python', 'py', '\u6807\u51c6\u5e93', 'pip'],
    fileName: 'python-reference.chm',
    version: '1.0'
  },
  {
    id: 'builtin-python-313-core-ref-v110',
    name: 'Python 3.13.x \u6838\u5fc3\u53c2\u8003\u4e0e\u5b9e\u4f8b\u624b\u518c',
    description: 'Python 3.13.x \u8bed\u8a00\u6838\u5fc3\u4e0e\u5b9e\u4f8b\u53c2\u8003\uff08CHM\uff0c\u542b\u5b8c\u6574\u76ee\u5f55\u4e0e\u5168\u6587\u641c\u7d22\uff09',
    keywords: ['python', 'py', '3.13', '\u6838\u5fc3', '\u5b9e\u4f8b', '\u6807\u51c6\u5e93', 'pip', 'typing'],
    fileName: 'Python 3.13.x \u6838\u5fc3\u53c2\u8003\u4e0e\u5b9e\u4f8b\u624b\u518c v1.10.chm',
    version: '1.10'
  },
  {
    id: 'builtin-cpp',
    name: 'C/C++ \u53c2\u8003\u624b\u518c',
    description: 'C/C++ \u6807\u51c6\u5e93\u51fd\u6570\u4e0e\u8bed\u8a00\u53c2\u8003',
    keywords: ['c', 'c++', 'cpp', 'stl', '\u6807\u51c6\u5e93'],
    fileName: 'cppreference-zh_CN.chm',
    version: '1.0'
  },
  {
    id: 'builtin-java',
    name: 'Java \u53c2\u8003\u624b\u518c',
    description: 'Java SE API \u53c2\u8003\u624b\u518c',
    keywords: ['java', 'jdk', 'api', 'spring'],
    fileName: 'java-reference.chm',
    version: '1.0'
  },
  {
    id: 'builtin-matlab',
    name: 'MATLAB \u53c2\u8003\u624b\u518c',
    description: 'MATLAB \u51fd\u6570\u4e0e\u5de5\u5177\u7bb1\u53c2\u8003',
    keywords: ['matlab', '\u77e9\u9635', '\u6570\u503c\u8ba1\u7b97', 'simulink'],
    fileName: 'matlab-reference.chm',
    version: '1.0'
  },
  {
    id: 'builtin-sql',
    name: 'SQL \u53c2\u8003\u624b\u518c',
    description: 'SQL \u8bed\u6cd5\u4e0e\u6570\u636e\u5e93\u64cd\u4f5c\u53c2\u8003',
    keywords: ['sql', 'mysql', '\u6570\u636e\u5e93', '\u67e5\u8be2', 'postgresql'],
    fileName: 'sql-reference.chm',
    version: '1.0'
  },
  {
    id: 'builtin-mysql8',
    name: 'MySQL 8.0 \u4e2d\u6587\u53c2\u8003\u624b\u518c',
    description: 'MySQL 8.0 \u5b98\u65b9\u4e2d\u6587\u6587\u6863\uff0c\u5b89\u88c5\u3001SQL\u3001\u5b58\u50a8\u5f15\u64ce\u3001\u590d\u5236\u3001\u5b89\u5168\u4e0e\u8fd0\u7ef4\u7b49\u5b8c\u6574\u53c2\u8003',
    keywords: ['mysql', 'mysql8', '\u6570\u636e\u5e93', 'innodb', 'sql', '\u67e5\u8be2', '\u7d22\u5f15', '\u590d\u5236', '\u5907\u4efd'],
    fileName: 'MYSQL8.0\u4e2d\u6587\u53c2\u8003\u624b\u518c.chm',
    version: '1.0'
  },
  {
    id: 'builtin-git',
    name: 'Git \u53c2\u8003\u624b\u518c',
    description: 'Git \u5e38\u7528\u547d\u4ee4\u53c2\u8003\u624b\u518c\uff0c\u6db5\u76d6 config\u3001clone\u3001commit\u3001push\u3001pull\u3001branch\u3001merge\u3001rebase\u3001stash\u3001tag \u7b49',
    keywords: ['git', '\u7248\u672c\u63a7\u5236', 'github', '\u5206\u652f', '\u5408\u5e76', 'commit', 'push', 'pull', 'clone', 'rebase'],
    fileName: 'git',
    version: '2.0'
  },
  {
    id: 'builtin-php',
    name: 'PHP \u53c2\u8003\u624b\u518c',
    description: 'PHP \u5b98\u65b9\u4e2d\u6587\u6587\u6863\uff0c\u51fd\u6570\u3001\u7c7b\u3001\u8bed\u8a00\u8bed\u6cd5\u5b8c\u6574\u53c2\u8003',
    keywords: ['php', '\u51fd\u6570', 'array', 'string', 'mysql', 'pdo', 'json', '\u6b63\u5219'],
    fileName: 'php-chunked-xhtml',
    entryFile: 'index.html',
    version: '1.0'
  },
  {
    id: 'builtin-js-core-ref-zh',
    name: 'JavaScript \u6838\u5fc3\u53c2\u8003\u624b\u518c',
    description: 'JavaScript \u6838\u5fc3\u8bed\u6cd5\u4e0e API \u53c2\u8003\uff08\u5185\u7f6e CHM\uff1b\u65e0 .hhc \u65f6\u4e0d\u751f\u6210\u4fa7\u680f\u76ee\u5f55\uff0c\u8bf7\u7528\u5168\u6587\u641c\u7d22\uff09',
    keywords: ['javascript', 'js', '\u6838\u5fc3', '\u53c2\u8003', 'ecma', '\u8bed\u6cd5'],
    fileName: 'JS\u53c2\u8003\u624b\u518c\u96c6\u5408/JavaScript\u6838\u5fc3\u53c2\u8003\u624b\u518c.chm',
    version: '1.0'
  },
  {
    id: 'builtin-js-ms-manual',
    name: '\u5fae\u8f6f JavaScript \u624b\u518c',
    description: '\u5fae\u8f6f JavaScript / JScript \u811a\u672c\u624b\u518c\uff08\u5185\u7f6e CHM\uff1b\u65e0 .hhc \u65f6\u4e0d\u751f\u6210\u4fa7\u680f\u76ee\u5f55\uff0c\u8bf7\u7528\u5168\u6587\u641c\u7d22\uff09',
    keywords: ['javascript', 'js', '\u5fae\u8f6f', 'jscript', '\u811a\u672c', 'ie'],
    fileName: 'JS\u53c2\u8003\u624b\u518c\u96c6\u5408/\u5fae\u8f6fJavaScript\u624b\u518cjs.chm',
    version: '1.0'
  },
  {
    id: 'builtin-js-lang-zh-chm',
    name: 'JavaScript \u8bed\u8a00\u4e2d\u6587\u53c2\u8003\u624b\u518c',
    description: 'JavaScript \u8bed\u8a00\u4e2d\u6587\u53c2\u8003\uff08\u5185\u7f6e CHM\uff1b\u65e0 .hhc \u65f6\u4e0d\u751f\u6210\u4fa7\u680f\u76ee\u5f55\uff0c\u8bf7\u7528\u5168\u6587\u641c\u7d22\uff09',
    keywords: ['javascript', 'js', '\u4e2d\u6587', '\u53c2\u8003', '\u8bed\u8a00', 'ecma'],
    fileName: 'JS\u53c2\u8003\u624b\u518c\u96c6\u5408/JavaScript\u8bed\u8a00\u4e2d\u6587\u53c2\u8003\u624b\u518c.chm',
    version: '1.0'
  },
  {
    id: 'builtin-vim-manual-zh-72',
    name: 'Vim \u624b\u518c\u4e2d\u6587\u7248 7.2',
    description: 'Vim \u7f16\u8f91\u5668\u4e2d\u6587\u5e2e\u52a9\u6587\u6863 7.2\uff08\u5185\u7f6e CHM\uff1b\u65e0 .hhc \u65f6\u8bf7\u7528\u5168\u6587\u641c\u7d22\uff09',
    keywords: ['vim', 'vi', '\u7f16\u8f91\u5668', '\u5e2e\u52a9', '\u547d\u4ee4', '7.2', '\u4e2d\u6587\u7248'],
    fileName: 'Vim\u624b\u518c\u4e2d\u6587\u72487.2.chm',
    version: '7.2'
  },
  {
    id: 'builtin-qt-help-zh-full',
    name: 'Qt \u4e2d\u6587\u5e2e\u52a9\u6587\u6863\uff08\u5b8c\u6574\u7248\uff09',
    description: 'Qt \u6846\u67b6\u5b98\u65b9\u4e2d\u6587\u5e2e\u52a9\uff08CHM\uff0c\u542b\u7c7b\u5e93\u3001\u4fe1\u53f7\u69fd\u3001QML \u7b49\u53c2\u8003\uff09',
    keywords: [
      'qt', 'qt5', 'qt6', 'qml', 'qwidget', 'signals', 'slots', 'c++', 'gui',
      '\u4fe1\u53f7', '\u69fd', '\u754c\u9762', '\u5e2e\u52a9'
    ],
    fileName: 'QT\u4e2d\u6587\u5e2e\u52a9\u6587\u6863\u5b8c\u6574\u7248.chm',
    version: '1.0'
  },
  {
    id: 'builtin-vue-official-pdf-zh',
    name: 'Vue.js \u5b98\u65b9\u79bb\u7ebf\u6587\u6863\uff08PDF\uff09',
    description: 'Vue.js \u5b98\u65b9\u6587\u6863\u4e2d\u6587\u79bb\u7ebf\u7248\uff08PDF\uff09\u3002PDF \u5168\u6587\u68c0\u7d22\u9700 Poppler\uff08pdftotext\uff09\uff1b\u8d44\u6e90\u4e0e\u4f9d\u8d56\u5185\u53ef\u5b89\u88c5\u6216\u91cd\u542f uTools \u540e\u70b9\u300c\u7d22\u5f15\u300d\u3002',
    keywords: ['vue', 'vue3', 'vue2', '\u524d\u7aef', '\u6846\u67b6', '\u7ec4\u5408\u5f0f', '\u9009\u9879\u5f0f', 'cli', 'router', 'vuex'],
    fileName: 'VueJS\u5b98\u65b9\u79bb\u7ebf\u6587\u6863(\u642c\u8fd0\u7248).pdf',
    version: '1.0'
  }
]

const KNOWN_BY_FILE = new Map(STATIC_CATALOG.map((e) => [e.fileName, e]))

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
      '\u672c\u5730\u5185\u7f6e\u8d44\u6e90\uff08\u81ea\u52a8\u626b\u63cf\uff09: ' + fileName,
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
      if (r.sha256) entry.sha256 = r.sha256
      if (r.downloadArchive) entry.downloadArchive = r.downloadArchive
      if (r.downloadUrlChw) entry.downloadUrlChw = r.downloadUrlChw
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
