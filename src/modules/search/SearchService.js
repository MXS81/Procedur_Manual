import MiniSearch from 'minisearch'
import { compileSearchMatcher, shouldUseMiniSearchDefault } from '../../utils/searchModes'

const SEARCH_FIELDS = ['title', 'keywords', 'content', 'summary']
const STORE_FIELDS = ['manualId', 'manualName', 'type', 'sourcePath', 'anchor', 'summary', 'title', 'content']

const MAX_CONTENT_LENGTH = 800
const MAX_DOCS_PER_FILE = 30

/** 大型 CHM（如 Python 全量文档）含数千 HTML，全量索引会撑爆 uTools 存储并长时间阻塞；与 preload 全文搜索上限对齐 */
const CHM_INDEX_MAX_HTML_FILES = 2000
const CHM_INDEX_MAX_FILE_BYTES = 600 * 1024

const indexCache = new Map()

const CJK_RANGE = '\u2E80-\u9FFF\uF900-\uFAFF'
const TOKEN_RE = new RegExp('[a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF_]+|[' + CJK_RANGE + ']', 'g')

function cjkTokenize (text) {
  if (typeof text !== 'string') return []
  const tokens = []
  TOKEN_RE.lastIndex = 0
  let m
  while ((m = TOKEN_RE.exec(text)) !== null) {
    tokens.push(m[0].toLowerCase())
  }
  return tokens
}

const MINISEARCH_OPTS = {
  fields: SEARCH_FIELDS,
  storeFields: STORE_FIELDS,
  tokenize: cjkTokenize,
  searchOptions: {
    boost: { title: 3, keywords: 2.5, summary: 1.5, content: 1 },
    fuzzy: 0.2,
    prefix: true,
    tokenize: cjkTokenize
  }
}

function newIndex () {
  return new MiniSearch(MINISEARCH_OPTS)
}

function extractDocumentsSync (filePath, ext, manualId, manualName, singleDocMode) {
  const docs = []
  const lo = ext.toLowerCase()

  let content
  try {
    content = (lo === '.html' || lo === '.htm')
      ? window.services.readTextFileChmAware(filePath)
      : window.services.readTextFile(filePath)
  } catch { return docs }

  if (lo === '.html' || lo === '.htm') {
    if (singleDocMode) {
      const text = window.services.extractTextFromHtml(content)
      if (text.length < 10) return docs

      const titleMatch = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
      const title = titleMatch
        ? window.services.extractTextFromHtml(titleMatch[1])
        : window.services.pathInfo(filePath).name

      docs.push({
        id: `${manualId}::${filePath}::0`,
        manualId, manualName,
        title,
        keywords: '',
        content: text.substring(0, MAX_CONTENT_LENGTH),
        summary: text.substring(0, 200),
        type: 'article',
        sourcePath: filePath,
        anchor: ''
      })
    } else {
      const sections = window.services.extractHtmlSections(content)
      const limit = Math.min(sections.length, MAX_DOCS_PER_FILE)
      for (let i = 0; i < limit; i++) {
        const s = sections[i]
        docs.push({
          id: `${manualId}::${filePath}::${i}`,
          manualId, manualName,
          title: s.title,
          keywords: '',
          content: s.contentText.substring(0, MAX_CONTENT_LENGTH),
          summary: s.contentText.substring(0, 200),
          type: 'section',
          sourcePath: filePath,
          anchor: s.anchor
        })
      }
    }
  } else if (lo === '.md' || lo === '.markdown') {
    const sections = window.services.extractMarkdownSections(content)
    if (singleDocMode) {
      const mainTitle = sections.length > 0 ? sections[0].title : window.services.pathInfo(filePath).name
      const fullText = sections.map(s => (s.title + ' ' + s.contentText)).join('\n')
      docs.push({
        id: `${manualId}::${filePath}::0`,
        manualId, manualName,
        title: mainTitle,
        keywords: '',
        content: fullText.substring(0, MAX_CONTENT_LENGTH),
        summary: fullText.substring(0, 200),
        type: 'article',
        sourcePath: filePath,
        anchor: ''
      })
    } else {
      const limit = Math.min(sections.length, MAX_DOCS_PER_FILE)
      for (let i = 0; i < limit; i++) {
        const s = sections[i]
        docs.push({
          id: `${manualId}::${filePath}::${i}`,
          manualId, manualName,
          title: s.title,
          keywords: '',
          content: s.contentText.substring(0, MAX_CONTENT_LENGTH),
          summary: s.contentText.substring(0, 200),
          type: 'section',
          sourcePath: filePath,
          anchor: s.anchor
        })
      }
    }
  } else if (lo === '.json') {
    window.services.parseJsonManual(content).forEach((entry, i) => {
      const kw = Array.isArray(entry.keywords) ? entry.keywords.join(' ') : (entry.keywords || '')
      docs.push({
        id: `${manualId}::${filePath}::${i}`,
        manualId, manualName,
        title: entry.title,
        keywords: kw,
        content: (entry.content || entry.description || '').substring(0, MAX_CONTENT_LENGTH),
        summary: (entry.description || entry.content || '').substring(0, 200),
        type: entry.type || 'article',
        sourcePath: filePath,
        anchor: ''
      })
    })
  }

  return docs
}

async function extractPdfDocuments (filePath, manualId, manualName, onPageProgress) {
  const docs = []
  const chunks = await window.services.extractPdfIndexChunks(filePath, onPageProgress)
  if (!chunks.length) return docs

  chunks.forEach((c, i) => {
    const text = c.text || ''
    const head = (c.title || '').trim() || ('第 ' + c.pageNum + ' 页')
    const title = ('第 ' + c.pageNum + ' 页 · ' + head).substring(0, 140)
    docs.push({
      id: `${manualId}::${filePath}::${i}`,
      manualId, manualName,
      title,
      keywords: '',
      content: text.substring(0, MAX_CONTENT_LENGTH),
      summary: text.substring(0, 200),
      type: 'section',
      sourcePath: filePath,
      anchor: 'page-' + c.pageNum
    })
  })
  return docs
}

function yieldToUI () {
  return new Promise(resolve => setTimeout(resolve, 0))
}

export function buildManualIndex (manual, onProgress) {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        const { id, name, rootPath } = manual
        const info = window.services.pathInfo(rootPath)
        if (!info.exists) throw new Error('路径不存在: ' + rootPath)

        const documents = []
        const supportedExts = ['.html', '.htm', '.md', '.markdown', '.json', '.pdf']
        const report = (stage, current, total) => {
          if (onProgress) onProgress({ stage, current, total, docCount: documents.length })
        }

        if (info.isFile && info.ext.toLowerCase() === '.chm') {
          report('decompress', 0, 1)
          const extractDir = window.services.decompileChm(rootPath)
          const files = window.services.scanDir(extractDir, ['.html', '.htm'], {
            maxFiles: CHM_INDEX_MAX_HTML_FILES
          })
          const isLarge = files.length > 100

          for (let i = 0; i < files.length; i++) {
            try {
              const pi = window.services.pathInfo(files[i].path)
              if (pi.exists && pi.size > CHM_INDEX_MAX_FILE_BYTES) continue
              documents.push(...extractDocumentsSync(files[i].path, files[i].ext, id, name, isLarge))
            } catch { /* skip */ }
            if (i % 50 === 0) {
              report('index', i, files.length)
              await yieldToUI()
            }
          }
        } else if (info.isFile) {
          report('index', 0, 1)
          if (info.ext.toLowerCase() === '.pdf') {
            const pdfDocs = await extractPdfDocuments(rootPath, id, name, (cur, tot) => {
              report('index', cur, Math.max(tot, 1))
            })
            documents.push(...pdfDocs)
          } else {
            documents.push(...extractDocumentsSync(rootPath, info.ext, id, name, false))
          }
        } else if (info.isDir) {
          const allExts = [...supportedExts, '.chm']
          const files = window.services.scanDir(rootPath, allExts)

          for (let i = 0; i < files.length; i++) {
            try {
              if (files[i].ext.toLowerCase() === '.chm') {
                const extractDir = window.services.decompileChm(files[i].path)
                const htmlFiles = window.services.scanDir(extractDir, ['.html', '.htm'], {
                  maxFiles: CHM_INDEX_MAX_HTML_FILES
                })
                const isLarge = htmlFiles.length > 100
                for (const hf of htmlFiles) {
                  try {
                    const pi = window.services.pathInfo(hf.path)
                    if (pi.exists && pi.size > CHM_INDEX_MAX_FILE_BYTES) continue
                    documents.push(...extractDocumentsSync(hf.path, hf.ext, id, name, isLarge))
                  } catch { /* skip */ }
                }
              } else if (files[i].ext.toLowerCase() === '.pdf') {
                const pdfDocs = await extractPdfDocuments(files[i].path, id, name, (cur, tot) => {
                  report('index', cur, Math.max(tot, 1))
                })
                documents.push(...pdfDocs)
              } else {
                documents.push(...extractDocumentsSync(files[i].path, files[i].ext, id, name, true))
              }
            } catch { /* skip */ }
            if (i % 20 === 0) {
              report('index', i, files.length)
              await yieldToUI()
            }
          }
        }

        report('save', 0, 1)
        await yieldToUI()

        const index = newIndex()
        index.addAll(documents)
        window.services.saveIndexData(id, JSON.stringify(index))
        indexCache.set(id, index)
        resolve({ docCount: documents.length })
      } catch (err) {
        reject(err)
      }
    }, 0)
  })
}

function getIndex (manualId) {
  if (indexCache.has(manualId)) return indexCache.get(manualId)
  const raw = window.services.loadIndexData(manualId)
  if (!raw) return null
  const idx = MiniSearch.loadJSON(raw, MINISEARCH_OPTS)
  indexCache.set(manualId, idx)
  return idx
}

export function clearIndexCache (manualId) {
  if (manualId) { indexCache.delete(manualId) } else { indexCache.clear() }
}

function searchIndexWithMatcher (idx, matcher) {
  return idx.search(MiniSearch.wildcard, {
    filter: (result) => {
      const blob = [
        result.title,
        result.keywords,
        result.content,
        result.summary
      ].filter(Boolean).join('\n')
      return matcher.testBlob(blob)
    }
  })
}

/** modeOpts: { matchCase?, wholeWord?, useRegex? } — 任一为真则走通配过滤，否则走 MiniSearch 分词 */
export function searchAcrossManuals (query, manuals, modeOpts = {}) {
  if (!query?.trim()) return []
  if (!shouldUseMiniSearchDefault(modeOpts)) {
    const m = compileSearchMatcher(query, modeOpts)
    if (!m.ok) return []
    const results = []
    for (const manual of manuals) {
      if (!manual.enabled || manual.indexStatus !== 'ready') continue
      try {
        const idx = getIndex(manual.id)
        if (!idx) continue
        results.push(...searchIndexWithMatcher(idx, m))
      } catch { /* skip */ }
    }
    return results
  }
  const results = []
  for (const manual of manuals) {
    if (!manual.enabled || manual.indexStatus !== 'ready') continue
    try {
      const idx = getIndex(manual.id)
      if (!idx) continue
      results.push(...idx.search(query))
    } catch { /* skip */ }
  }
  results.sort((a, b) => b.score - a.score)
  return results
}

export function searchInManual (query, manualId, modeOpts = {}) {
  if (!query?.trim()) return []
  if (!shouldUseMiniSearchDefault(modeOpts)) {
    const m = compileSearchMatcher(query, modeOpts)
    if (!m.ok) return []
    try {
      const idx = getIndex(manualId)
      if (!idx) return []
      return searchIndexWithMatcher(idx, m)
    } catch {
      return []
    }
  }
  try {
    const idx = getIndex(manualId)
    if (!idx) return []
    return idx.search(query)
  } catch {
    return []
  }
}
