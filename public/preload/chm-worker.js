const path = require('path')

const services = require('./services.js')

let corpus = null
let extractDir = null

/**
 * 首次搜索提取全部 HTML 正文，后续查询复用；不按文件数和文件大小截断。
 * @returns {{pages: object[], skipped: number}}
 */
function getCorpus () {
  if (corpus) return corpus
  const pages = []
  let skipped = 0
  for (const file of services.scanDir(extractDir, ['.html', '.htm'])) {
    try {
      const raw = services.readTextFileChmAware(file.path)
      const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
      pages.push({
        local: path.relative(extractDir, file.path).replace(/\\/g, '/'),
        title: title ? services.extractTextFromHtml(title[1]) : file.name,
        text: services.extractTextFromHtml(raw)
      })
    } catch {
      skipped++
    }
  }
  corpus = { pages, skipped }
  return corpus
}


/**
 * 使用前端编译好的规则搜索所有页面，再排序截取展示结果。
 * @param {{patterns: RegExp[], highlightRe: RegExp, maxResults?: number}} query
 * @returns {{results: object[], total: number, scanned: number, skipped: number}}
 */
function search ({ patterns, highlightRe, maxResults = 80 }) {
  const { pages, skipped } = getCorpus()
  const results = []
  for (const page of pages) {
    if (!patterns.every(re => re.test(page.text))) continue
    let first
    let matchCount = 0
    for (const match of page.text.matchAll(highlightRe)) {
      if (!first) first = match
      matchCount++
    }
    const start = Math.max(0, first.index - 40)
    const end = Math.min(page.text.length, first.index + first[0].length + 80)
    results.push({
      local: page.local,
      title: page.title,
      snippet: (start ? '...' : '') + page.text.slice(start, end) + (end < page.text.length ? '...' : ''),
      matchCount
    })
  }
  results.sort((a, b) => b.matchCount - a.matchCount || a.local.localeCompare(b.local))
  return { results: results.slice(0, maxResults), total: results.length, scanned: pages.length, skipped }
}


// 独立进程串行处理消息，解压、正文读取与检索均不占用渲染线程。
process.on('message', ({ id, method, args }) => {
  try {
    let result
    switch (method) {
      case 'load':
        result = services.getChmInfo(args.chmPath)
        extractDir = result.extractDir
        corpus = null
        break
      case 'page':
        result = services.getChmPageSrcdoc(extractDir, args.page)
        break
      case 'search':
        result = search(args)
        break
      default:
        throw new Error('未知 CHM 操作: ' + method)
    }
    process.send({ id, result })
  } catch (error) {
    process.send({ id, error: error.message })
  }
})


// 插件窗口关闭时 IPC 断开，随之结束后台进程，释放会话缓存。
process.on('disconnect', () => process.exit(0))
