/**
 * CHM / 离线 HTML 内链解析回归：与 srcdoc + postMessage 导航约定一致。
 * 运行：npm run test:nav
 */
import assert from 'node:assert/strict'
import { fileUrlToRootRelativePath, resolveBundledNavigationTarget, splitBundledActive } from '../src/utils/bundledDocNav.js'

const root = 'C:/pm_chm_extract'
const deep = 'manual/chapter/sub/page.html'

function eq (got, want, label) {
  assert.equal(got, want, `${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
}

// --- splitBundledActive ---
{
  const s = splitBundledActive('lib/os.html#stdlib-list')
  eq(s.path, 'lib/os.html', 'split path')
  eq(s.fragment, 'stdlib-list', 'split fragment')
}

// --- fileUrlToRootRelativePath (Windows 风格) ---
{
  const u = 'file:///C:/pm_chm_extract/lib/os.html'
  eq(fileUrlToRootRelativePath(u, root), 'lib/os.html', 'file URL -> rel')
}

// --- 根相对：深层页面上不应拼到子目录下 ---
eq(
  resolveBundledNavigationTarget('/help/topics.html', root, deep),
  'help/topics.html',
  'root-absolute /path'
)

// --- 目录相对 ---
eq(
  resolveBundledNavigationTarget('sibling.html', root, deep),
  'manual/chapter/sub/sibling.html',
  'relative sibling'
)

// --- 纯 # 锚点（Python 等文档常见；须避免 srcdoc 默认导航白屏）---
eq(
  resolveBundledNavigationTarget('#stdlib-list', root, 'library/functions.html'),
  'library/functions.html#stdlib-list',
  'hash-only href'
)
eq(
  resolveBundledNavigationTarget('#', root, 'library/functions.html'),
  'library/functions.html',
  'hash-only #'
)

// --- 带片段的相对路径 ---
{
  const r = resolveBundledNavigationTarget('other.htm#x', root, deep)
  assert.ok(r.endsWith('#x'), 'relative with fragment')
  assert.ok(r.includes('other.htm'), 'relative with fragment path')
}

// --- javascript: 忽略 ---
assert.equal(resolveBundledNavigationTarget('javascript:void(0)', root, deep), null, 'javascript')

console.log('test-bundled-doc-nav: ok')
