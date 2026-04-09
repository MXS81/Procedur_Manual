import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  resolveBundledNavigationTarget,
  splitBundledActive,
  scrollBundledIframeToFragment
} from '../utils/bundledDocNav'
import { attachBundledIframeContextMenu } from '../utils/contextMenuBridge.js'
import { compileSearchMatcher, defaultSearchModeOptions, splitTextByHighlightRegex } from '../utils/searchModes'
import SearchInputWithModes from './SearchInputWithModes'
import './IframeManualReader.css'

function TocItem ({ node, activePath, onSelect, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth < 1)
  const hasChildren = node.children && node.children.length > 0
  const isActive = node.local && activePath === node.local

  const handleClick = () => {
    if (node.local) onSelect(node.local)
    if (hasChildren) setExpanded(v => !v)
  }

  return (
    <li className="ifr-toc-item">
      <div
        className={'ifr-toc-label' + (isActive ? ' active' : '')}
        style={{ paddingLeft: 12 + depth * 16 }}
        onClick={handleClick}
        title={node.name}
      >
        {hasChildren && (
          <span className={'ifr-toc-arrow' + (expanded ? ' expanded' : '')}>&#9654;</span>
        )}
        {!hasChildren && <span className="ifr-toc-dot" />}
        <span className="ifr-toc-text">{node.name}</span>
      </div>
      {hasChildren && expanded && (
        <ul className="ifr-toc-children">
          {node.children.map((child, i) => (
            <TocItem
              key={i}
              node={child}
              activePath={activePath}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function highlightSnippet (snippet, highlightRe) {
  if (!snippet) return snippet
  if (!highlightRe) return snippet
  return splitTextByHighlightRegex(snippet, highlightRe).map((seg, i) =>
    seg.match
      ? <mark key={i} className="search-highlight">{seg.v}</mark>
      : seg.v
  )
}

function parseTocFromHtml (html) {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const mainList = doc.querySelector('ul.chunklist.chunklist_set')
    if (!mainList) return []
    return parseUl(mainList)
  } catch {
    return []
  }
}

function parseUl (ul) {
  const items = []
  for (const li of ul.children) {
    if (li.tagName !== 'LI') continue
    const link = li.querySelector(':scope > a')
    if (!link) continue

    const href = link.getAttribute('href')
    const title = link.textContent.trim()

    let desc = ''
    let nd = link.nextSibling
    while (nd) {
      if (nd.nodeType === 3) desc += nd.textContent
      else if (nd.tagName === 'UL') break
      nd = nd.nextSibling
    }
    desc = desc.replace(/^\s*—\s*/, '').trim()

    const childUl = li.querySelector(':scope > ul.chunklist')
    const children = childUl ? parseUl(childUl) : []

    items.push({
      name: desc ? `${title} �? ${desc}` : title,
      local: href,
      children
    })
  }
  return items
}

function filterToc (nodes, term, modeOpts) {
  const m = compileSearchMatcher(term, modeOpts)
  if (!m.ok) return []
  const result = []
  for (const node of nodes) {
    const nameMatch = node.name && m.testBlob(node.name)
    const childMatches = node.children ? filterToc(node.children, term, modeOpts) : []
    if (nameMatch || childMatches.length > 0) {
      result.push({
        ...node,
        children: nameMatch ? (node.children || []) : childMatches
      })
    }
  }
  return result
}

/** chunklist 解析失败或结构非 PHP 手册时，用目录下 HTML 列表作为可点击目�? */
function buildFlatHtmlToc (sourcePath) {
  try {
    const files = window.services.scanDir(sourcePath, ['.html', '.htm'], { maxFiles: 800 })
    return files
      .map(f => {
        const rel = f.path.slice(sourcePath.length).replace(/^[\\/]/, '').replace(/\\/g, '/')
        return {
          name: f.name.replace(/\.(html|htm)$/i, ''),
          local: rel,
          children: []
        }
      })
      .sort((a, b) => a.local.localeCompare(b.local, undefined, { sensitivity: 'base' }))
  } catch {
    return []
  }
}

export default function IframeManualReader ({ sourcePath, onBack, manualName, entryFile }) {
  const [toc, setToc] = useState([])
  const [activePage, setActivePage] = useState('')
  const [iframeDoc, setIframeDoc] = useState('')
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchModeOpts, setSearchModeOpts] = useState(() => defaultSearchModeOptions())
  const [searchMode, setSearchMode] = useState('toc')
  const [contentResults, setContentResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const iframeRef = useRef(null)
  const searchTimerRef = useRef(null)

  const { path: activePath, fragment: activeFragment } = useMemo(
    () => splitBundledActive(activePage),
    [activePage]
  )

  useEffect(() => {
    try {
      const sep = sourcePath.includes('/') ? '/' : '\\'
      const tocCandidates = [...new Set([
        entryFile,
        'index.html',
        'index.htm',
        'manual.html',
        'manual.htm'
      ].filter(Boolean))]
      let parsed = []
      for (const f of tocCandidates) {
        try {
          const html = window.services.readTextFile(sourcePath + sep + f)
          parsed = parseTocFromHtml(html)
          if (parsed.length > 0) break
        } catch { /* try next */ }
      }
      if (parsed.length === 0) {
        parsed = buildFlatHtmlToc(sourcePath)
      }
      setToc(parsed)

      const entryNorm = (entryFile || '').replace(/\\/g, '/')
      if (parsed.length > 0) {
        const byEntry = entryNorm && parsed.some(n => n.local === entryNorm)
        const firstLocal = parsed.find(n => n.local)?.local
        setActivePage(byEntry ? entryNorm : (firstLocal || entryNorm || 'index.html'))
      } else {
        setActivePage(entryFile || 'index.html')
      }
    } catch (e) {
      console.warn('Failed to parse TOC:', e)
      setActivePage(entryFile || 'index.html')
    }
    setLoading(false)
  }, [sourcePath, entryFile])

  useEffect(() => {
    if (!sourcePath || !activePath) {
      setIframeDoc('')
      return
    }
    try {
      const html = window.services.getBundledHtmlPageSrcdoc(sourcePath, activePath)
      setIframeDoc(html || '')
    } catch {
      setIframeDoc('')
    }
  }, [sourcePath, activePath])

  const activePathRef = useRef('')
  activePathRef.current = activePath

  const handleSelectPage = useCallback((localPath) => {
    setActivePage(localPath)
  }, [])

  // ---- Navigation via postMessage from injected nav-guard script ----
  useEffect(() => {
    if (!sourcePath) return
    const handler = (e) => {
      if (!e.data || e.data.type !== 'pm-nav') return
      if (e.source !== iframeRef.current?.contentWindow) return
      const href = e.data.href
      if (!href) return
      const trimmed = String(href).trim()
      if (/^https?:/i.test(trimmed)) {
        try { window.utools ? window.utools.shellOpenExternal(trimmed) : window.open(trimmed, '_blank') } catch { /* */ }
        return
      }
      const rel = resolveBundledNavigationTarget(href, sourcePath, activePathRef.current)
      if (rel) {
        activePathRef.current = splitBundledActive(rel).path
        setActivePage(rel)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [sourcePath])

  useEffect(() => {
    const el = iframeRef.current
    if (!el || !iframeDoc) return
    return attachBundledIframeContextMenu(el)
  }, [iframeDoc, activePath])

  useEffect(() => {
    const el = iframeRef.current
    if (!el || !iframeDoc) return
    const run = () => {
      try {
        const doc = el.contentDocument
        if (doc) scrollBundledIframeToFragment(doc, activeFragment)
      } catch { /* */ }
    }
    run()
    el.addEventListener('load', run)
    return () => el.removeEventListener('load', run)
  }, [iframeDoc, activeFragment])

  const searchCompile = useMemo(() => {
    if (!searchTerm.trim()) return { ok: true, highlightRe: null }
    return compileSearchMatcher(searchTerm, searchModeOpts)
  }, [searchTerm, searchModeOpts])

  const contentHighlightRe = searchCompile.ok ? searchCompile.highlightRe : null

  useEffect(() => {
    if (searchMode !== 'content' || !searchTerm.trim() || !sourcePath || !searchCompile.ok) {
      setContentResults([])
      return
    }
    setSearching(true)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      try {
        const results = window.services.searchDirContent(sourcePath, searchTerm, 50, searchModeOpts)
        setContentResults(results)
      } catch {
        setContentResults([])
      }
      setSearching(false)
    }, 400)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchTerm, searchMode, sourcePath, searchModeOpts, searchCompile.ok])

  const filteredToc = useMemo(() => {
    if (!searchTerm.trim() || searchMode !== 'toc') return toc
    if (!searchCompile.ok) return []
    return filterToc(toc, searchTerm, searchModeOpts)
  }, [toc, searchTerm, searchMode, searchModeOpts, searchCompile.ok])

  if (loading) return <div className="ifr-reader"><div className="ifr-status">加载�?...</div></div>

  return (
    <div className="ifr-reader">
      <div className="ifr-toolbar">
        <button className="btn btn-ghost btn-back" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="ifr-title">{manualName || '手册'}</span>
        <button
          className={'btn btn-ghost ifr-sidebar-toggle' + (sidebarVisible ? ' active' : '')}
          onClick={() => setSidebarVisible(v => !v)}
          title={sidebarVisible ? '隐藏目录' : '显示目录'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
          </svg>
        </button>
      </div>

      <div className="ifr-main">
        {sidebarVisible && (
          <div className="ifr-sidebar">
            <div className="ifr-search-box">
              {!searchCompile.ok && searchTerm.trim() && (
                <div className="ifr-search-err">{searchCompile.error}</div>
              )}
              <SearchInputWithModes
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                options={searchModeOpts}
                onOptionsChange={setSearchModeOpts}
                onClear={() => setSearchTerm('')}
                placeholder={searchMode === 'toc' ? '搜索目录�?' : '搜索页面内容�?'}
                className="ifr-search-inner"
                inputClassName="ifr-pm-field"
              />
            </div>

            <div className="ifr-tabs">
              <button
                className={'ifr-tab' + (searchMode === 'toc' ? ' active' : '')}
                onClick={() => setSearchMode('toc')}
              >目录</button>
              <button
                className={'ifr-tab' + (searchMode === 'content' ? ' active' : '')}
                onClick={() => setSearchMode('content')}
              >全文搜索</button>
            </div>

            <div className="ifr-toc-container">
              {searchMode === 'toc' ? (
                filteredToc.length > 0 ? (
                  <ul className="ifr-toc-root">
                    {filteredToc.map((node, i) => (
                      <TocItem
                        key={i}
                        node={node}
                        activePath={activePath}
                        onSelect={handleSelectPage}
                      />
                    ))}
                  </ul>
                ) : searchTerm && searchCompile.ok ? (
                  <div className="ifr-toc-empty">目录中未找到匹配�?</div>
                ) : searchTerm ? (
                  <div className="ifr-toc-empty">搜索条件无效</div>
                ) : (
                  <div className="ifr-toc-empty">无目录信�?</div>
                )
              ) : (
                !searchTerm.trim() ? (
                  <div className="ifr-toc-empty">输入关键词搜索所有页面内�?</div>
                ) : !searchCompile.ok ? (
                  <div className="ifr-toc-empty">修正搜索条件</div>
                ) : searching ? (
                  <div className="ifr-toc-empty">搜索�?...</div>
                ) : contentResults.length > 0 ? (
                  <ul className="ifr-search-results">
                    {contentResults.map((r, i) => (
                      <li
                        key={i}
                        className={'ifr-search-result' + (activePath === r.local ? ' active' : '')}
                        onClick={() => handleSelectPage(r.local)}
                      >
                        <div className="ifr-result-title">
                          {r.title}
                          <span className="ifr-result-count">{r.matchCount} 处匹�?</span>
                        </div>
                        <div className="ifr-result-snippet">
                          {highlightSnippet(r.snippet, contentHighlightRe)}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="ifr-toc-empty">未找到匹配内�?</div>
                )
              )}
            </div>
          </div>
        )}

        <div className="ifr-content">
          {iframeDoc ? (
            <iframe
              key={activePath}
              ref={iframeRef}
              srcDoc={iframeDoc}
              className="ifr-iframe"
              title={manualName || '手册'}
            />
          ) : activePath ? (
            <div className="ifr-status">无法加载页面</div>
          ) : (
            <div className="ifr-status">请从左侧目录选择页面</div>
          )}
        </div>
      </div>
    </div>
  )
}
