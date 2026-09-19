import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

import { identifyToc, filterToc, createReadingHistory } from '../src/utils/chmReader.js'
import { compileSearchMatcher } from '../src/utils/searchModes.js'

const require = createRequire(import.meta.url)
const services = require('../public/preload/services.js')
const { createChmSession } = require('../public/preload/chm-session.js')

const toc = identifyToc([
  { name: 'discard', children: [] },
  { name: 'parent', children: [{ name: 'needle', local: 'a.html' }] }
])
const filtered = filterToc(toc, compileSearchMatcher('needle'))
assert.equal(filtered[0].id, 'r/1')
assert.equal(filtered[0].children[0].id, 'r/1/0')

const history = createReadingHistory()
history.visit('a.html')
history.capture({ x: 0, y: 410 })
history.visit('a.html#topic')
history.capture({ x: 0, y: 820 })
history.visit('b.html')
assert.deepEqual(history.move(-1), { page: 'a.html#topic', scroll: { x: 0, y: 820 } })
assert.equal(history.move(-1).scroll.y, 410)
history.visit('a.html')
assert.equal(history.stack.length, 3, '重复选择不添加历史，也不丢失前进记录')
history.visit('c.html')
assert.equal(history.stack.length, 2, '新分支截断前进记录')

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-reader-test-'))
const chmPath = path.join(fixture, 'fixture.chm')
fs.writeFileSync(chmPath, 'test cached archive')
const extractDir = path.join(os.tmpdir(), 'pm_chm_' + services._chmCacheKey(chmPath))
fs.mkdirSync(extractDir)
const session = createChmSession()

try {
  // 超过旧的 2000 页和 512KB 限制，最相关页排在扫描顺序末尾。
  for (let i = 0; i < 2101; i++) {
    fs.writeFileSync(path.join(extractDir, String(i).padStart(4, '0') + '.html'), '<html><body>needle</body></html>')
  }
  fs.writeFileSync(path.join(extractDir, 'zz-best.html'), '<html><body>' + 'needle '.repeat(100) + 'LARGE_SENTINEL ' + 'x'.repeat(600 * 1024) + '</body></html>')
  fs.writeFileSync(path.join(extractDir, 'modes.html'), '<html><body>Foo bar food</body></html>')
  const info = await session.request('load', { chmPath })
  assert.equal(info.extractDir, extractDir)

  const query = async (term, options = {}) => {
    const { patterns, highlightRe } = compileSearchMatcher(term, options)
    return session.request('search', { patterns, highlightRe })
  }
  const ranked = await query('needle')
  assert.equal(ranked.total, 2102)
  assert.equal(ranked.scanned, 2103)
  assert.equal(ranked.results.length, 80)
  assert.equal(ranked.results[0].local, 'zz-best.html')
  assert.equal(ranked.results[0].matchCount, 100)
  assert.equal((await query('LARGE_SENTINEL')).total, 1)
  assert.equal((await query('Foo bar', { matchCase: true })).total, 1)
  assert.equal((await query('foo', { matchCase: true, wholeWord: true })).total, 0)
  assert.equal((await query('Foo|bar', { useRegex: true })).results[0].matchCount, 3)
  assert.equal((await query('(?=Foo)', { useRegex: true })).total, 1)
  fs.writeFileSync(path.join(extractDir, 'modes.html'), '<body>changed</body>')
  assert.equal((await query('Foo bar')).total, 1, '后续查询复用会话正文缓存')
  const html = await session.request('page', { page: '0000.html' })
  assert.ok(html.includes('<base href='))
  assert.ok(!html.includes('pm-nav'), '不注入被 sandbox 禁用的导航脚本')
  const closingSession = createChmSession()
  const loading = closingSession.request('load', { chmPath })
  closingSession.dispose()
  await assert.rejects(loading, /会话已结束/, '退出阅读器时结束未完成的加载')
  console.log('test-chm-reader: 目录身份、历史位置、完整搜索、排序、匹配模式、缓存、页面读取通过')
} finally {
  session.dispose()
  // 两个清理目标均是本测试创建的临时目录，不接受外部路径。
  for (const target of [fixture, extractDir]) {
    assert.equal(path.dirname(path.resolve(target)), path.resolve(os.tmpdir()))
    fs.rmSync(target, { recursive: true, force: true })
  }
}
