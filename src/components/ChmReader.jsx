import { useState, useEffect, useRef, useCallback, useMemo, memo, createContext, useContext, useSyncExternalStore } from 'react'
import {
  resolveBundledNavigationTarget,
  splitBundledActive,
  scrollBundledIframeToFragment
} from '../utils/bundledDocNav'
import { compileSearchMatcher, defaultSearchModeOptions, splitTextByHighlightRegex } from '../utils/searchModes'
import SearchInputWithModes from './SearchInputWithModes'
import './ChmReader.css'

const TocStoreContext = createContext(null)

const TocItem = memo(function TocItem ({ node, depth = 0, pathKey = 'r' }) {
  const store = useContext(TocStoreContext)
  const isActive = useSyncExternalStore(
    store.subscribe,
    () => !!(node.local && store.getActivePath() === node.local)
  )

  const initiallyOpen = depth < 2
  const [expanded, setExpanded] = useState(initiallyOpen)
  const [childrenEverShown, setChildrenEverShown] = useState(initiallyOpen)
  const hasChildren = node.children && node.children.length > 0

  const toggleExpand = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!hasChildren) return
    setChildrenEverShown(true)
    setExpanded(v => !v)
  }, [hasChildren])

  const onMainActivate = useCallback(() => {
    if (node.local) store.select(node.local)
    if (hasChildren) {
      setChildrenEverShown(true)
      setExpanded(v => !v)
    }
  }, [hasChildren, node.local, store])

  const onMainKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onMainActivate()
    }
  }, [onMainActivate])

  const mainInteractive = !!(node.local || hasChildren)

  return (
    <li className='chm-toc-item'>
      <div
        className={'chm-toc-label' + (isActive ? ' active' : '')}
        style={{ paddingLeft: 12 + depth * 16 }}
        title={node.name}
      >
        {hasChildren
          ? (
            <button
              type='button'
              className={'chm-toc-arrow-btn' + (expanded ? ' expanded' : '')}
              aria-expanded={expanded}
              aria-label={expanded ? '折叠' : '展开'}
              onClick={toggleExpand}
            >
              <span className='chm-toc-arrow' aria-hidden>&#9654;</span>
            </button>
            )
          : (
            <span className='chm-toc-dot' aria-hidden />
            )}
        <span
          role={mainInteractive ? 'button' : undefined}
          tabIndex={mainInteractive ? 0 : undefined}
          className={'chm-toc-text' + (mainInteractive ? ' chm-toc-text-action' : '')}
          onClick={onMainActivate}
          onKeyDown={onMainKeyDown}
        >
          {node.name}
        </span>
      </div>
      {hasChildren && childrenEverShown && (
        <ul className={'chm-toc-children' + (expanded ? '' : ' chm-toc-children--collapsed')}>
          {node.children.map((child, i) => (
            <TocItem
              key={pathKey + '/' + i}
              pathKey={pathKey + '/' + i}
              node={child}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  )
}, (prev, next) =>
  prev.node === next.node &&
  prev.depth === next.depth &&
  prev.pathKey === next.pathKey
)

function highlightSnippet (snippet, highlightRe) {
  if (!snippet) return snippet
  if (!highlightRe) return snippet
  return splitTextByHighlightRegex(snippet, highlightRe).map((seg, i) =>
    seg.match
      ? <mark key={i} className="search-highlight">{seg.v}</mark>
      : seg.v
  )
}

export default function ChmReader ({ chmPath, onBack, manualName, initialSearch }) {
  const [chmInfo, setChmInfo] = useState(null)
  const [activePage, setActivePage] = useState('')
  const [iframeDoc, setIframeDoc] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [searchTerm, setSearchTerm] = useState(initialSearch || '')
  const [searchModeOpts, setSearchModeOpts] = useState(() => defaultSearchModeOptions())
  const [searchMode, setSearchMode] = useState(initialSearch ? 'content' : 'toc')
  const [contentResults, setContentResults] = useState([])
  const [searching, setSearching] = useState(false)
  const iframeRef = useRef(null)
  const searchTimerRef = useRef(null)

  useEffect(() => {
    try {
      const info = window.services.getChmInfo(chmPath)
      setChmInfo(info)
      if (info.defaultPage) setActivePage(info.defaultPage)
      setLoading(false)
    } catch (e) {
      setError('CHM 加载失败: ' + e.message)
      setLoading(false)
    }
  }, [chmPath])

  const { path: activePath, fragment: activeFragment } = useMemo(
    () => splitBundledActive(activePage),
    [activePage]
  )

  const handleSelectPage = useCallback((localPath) => {
    setActivePage(localPath)
  }, [])

  // TocStore: avoids passing activePath/onSelect as props to every TocItem
  const activePathRef = useRef('')
  const selectRef = useRef(handleSelectPage)
  const listenersRef = useRef(new Set())
  activePathRef.current = activePath
  selectRef.current = handleSelectPage

  const tocStore = useMemo(() => ({
    subscribe (cb) {
      listenersRef.current.add(cb)
      return () => listenersRef.current.delete(cb)
    },
    getActivePath () { return activePathRef.current },
    select (p) { selectRef.current(p) }
  }), [])

  const prevActiveRef = useRef(activePath)
  useEffect(() => {
    if (prevActiveRef.current !== activePath) {
      prevActiveRef.current = activePath
      listenersRef.current.forEach(cb => cb())
    }
  }, [activePath])

  useEffect(() => {
    if (!chmInfo?.extractDir || !activePath) {
      setIframeDoc('')
      return
    }
    try {
      const html = window.services.getChmPageSrcdoc(chmInfo.extractDir, activePath)
      setIframeDoc(html || '')
    } catch {
      setIframeDoc('')
    }
  }, [chmInfo, activePath])

  useEffect(() => {
    if (!iframeDoc || !chmInfo) return
    const el = iframeRef.current
    if (!el) return

    const onLoad = () => {
      let cleanup = null
      try {
        const doc = el.contentDocument
        if (!doc) return
        const click = (e) => {
          const a = e.target.closest && e.target.closest('a[href]')
          if (!a) return
          const raw = a.getAttribute('href')
          if (!raw) return
          const rel = resolveBundledNavigationTarget(raw, chmInfo.extractDir, activePath)
          if (rel) {
            e.preventDefault()
            e.stopPropagation()
            setActivePage(rel)
          }
        }
        doc.addEventListener('click', click, true)
        cleanup = () => doc.removeEventListener('click', click, true)
      } catch { /* cross-origin guard */ }
      el._pmChmCleanup = cleanup
    }

    el.addEventListener('load', onLoad)
    return () => {
      el.removeEventListener('load', onLoad)
      if (el._pmChmCleanup) {
        el._pmChmCleanup()
        delete el._pmChmCleanup
      }
    }
  }, [iframeDoc, chmInfo, activePath])

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
    if (searchMode !== 'content' || !searchTerm.trim() || !chmInfo || !searchCompile.ok) {
      setContentResults([])
      return
    }
    setSearching(true)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      try {
        const results = window.services.searchChmContent(chmInfo.extractDir, searchTerm, searchModeOpts)
        setContentResults(results)
      } catch {
        setContentResults([])
      }
      setSearching(false)
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchTerm, searchMode, chmInfo, searchModeOpts, searchCompile.ok])

  const filteredToc = useMemo(() => {
    if (!chmInfo?.toc) return []
    if (!searchTerm.trim() || searchMode !== 'toc') return chmInfo.toc
    if (!searchCompile.ok) return []
    return filterToc(chmInfo.toc, searchTerm, searchModeOpts)
  }, [chmInfo, searchTerm, searchMode, searchModeOpts, searchCompile.ok])

  const hasTocOutline = (chmInfo?.toc?.length ?? 0) > 0

  if (loading) return <div className="chm-reader"><div className="chm-status">{'加载中…'}</div></div>
  if (error) return <div className="chm-reader"><div className="chm-status chm-error">{error}</div></div>

  return (
    <div className="chm-reader">
      <div className="chm-toolbar">
        <button className="btn btn-ghost btn-back" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="chm-title">{manualName || 'CHM 手册'}</span>
        <button
          className={'btn btn-ghost chm-sidebar-toggle' + (sidebarVisible ? ' active' : '')}
          onClick={() => setSidebarVisible(v => !v)}
          title={sidebarVisible ? '隐藏目录' : '显示目录'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
          </svg>
        </button>
      </div>

      <div className="chm-main">
        {sidebarVisible && (
          <div className="chm-sidebar">
            <div className="chm-search-box">
              {!searchCompile.ok && searchTerm.trim() && (
                <div className="chm-search-err">{searchCompile.error}</div>
              )}
              <SearchInputWithModes
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                options={searchModeOpts}
                onOptionsChange={setSearchModeOpts}
                onClear={() => setSearchTerm('')}
                placeholder={searchMode === 'toc' ? '搜索目录…' : '搜索页面内容…'}
                className="chm-search-inner"
                inputClassName="chm-pm-field"
              />
            </div>

            <div className="chm-tabs">
              <button
                className={'chm-tab' + (searchMode === 'toc' ? ' active' : '')}
                onClick={() => setSearchMode('toc')}
              >{'目录'}</button>
              <button
                className={'chm-tab' + (searchMode === 'content' ? ' active' : '')}
                onClick={() => setSearchMode('content')}
              >{'全文搜索'}</button>
            </div>

            <div className="chm-toc-container">
              {searchMode === 'toc' ? (
                !hasTocOutline ? (
                  <div className="chm-toc-empty chm-toc-nooutline">
                    <p className="chm-toc-nooutline-title">{'格式不支持目录生成'}</p>
                    <p className="chm-toc-muted">{'此 CHM 解压后无标准 .hhc 目录，应用无法生成侧栏目录。请使用「全文搜索」浏览；正文仍从默认页打开。'}</p>
                  </div>
                ) : filteredToc.length > 0 ? (
                  <TocStoreContext.Provider value={tocStore}>
                    <ul className="chm-toc-root">
                      {filteredToc.map((node, i) => (
                        <TocItem
                          key={'r/' + i}
                          pathKey={'r/' + i}
                          node={node}
                          depth={0}
                        />
                      ))}
                    </ul>
                  </TocStoreContext.Provider>
                ) : searchTerm && searchCompile.ok ? (
                  <div className="chm-toc-empty">{'目录中未找到匹配项'}</div>
                ) : searchTerm ? (
                  <div className="chm-toc-empty">{'搜索条件无效'}</div>
                ) : (
                  <div className="chm-toc-empty">{'无目录信息'}</div>
                )
              ) : (
                !searchTerm.trim() ? (
                  <div className="chm-toc-empty">{'输入关键词搜索所有页面内容'}</div>
                ) : !searchCompile.ok ? (
                  <div className="chm-toc-empty">{'修正搜索条件'}</div>
                ) : searching ? (
                  <div className="chm-toc-empty">{'搜索中…'}</div>
                ) : contentResults.length > 0 ? (
                  <ul className="chm-search-results">
                    {contentResults.map((r, i) => (
                      <li
                        key={i}
                        className={'chm-search-result' + (activePath === r.local ? ' active' : '')}
                        onClick={() => handleSelectPage(r.local)}
                      >
                        <div className="chm-result-title">
                          {r.title}
                          <span className="chm-result-count">{r.matchCount} {'处匹配'}</span>
                        </div>
                        <div className="chm-result-snippet">
                          {highlightSnippet(r.snippet, contentHighlightRe)}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="chm-toc-empty">{'未找到匹配内容'}</div>
                )
              )}
            </div>
          </div>
        )}

        <div className="chm-content">
          {iframeDoc ? (
            <iframe
              key={activePath}
              ref={iframeRef}
              srcDoc={iframeDoc}
              className="chm-iframe"
              title="CHM Content"
            />
          ) : activePath ? (
            <div className="chm-status">{'无法加载页面'}</div>
          ) : (
            <div className="chm-status">{'请从左侧选择页面或使用全文搜索'}</div>
          )}
        </div>
      </div>
    </div>
  )
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
