import { useState, useEffect, useRef, useCallback, useMemo, memo, createContext, useContext, useSyncExternalStore } from 'react'
import {
  resolveBundledNavigationTarget,
  splitBundledActive,
  scrollBundledIframeToFragment
} from '../utils/bundledDocNav'
import { attachBundledIframeContextMenu } from '../utils/contextMenuBridge.js'
import { compileSearchMatcher, defaultSearchModeOptions, splitTextByHighlightRegex } from '../utils/searchModes'
import SearchInputWithModes from './SearchInputWithModes'
import './ChmReader.css'

const TocStoreCtx = createContext(null)

// ---------- TocItem ----------
const TocItem = memo(function TocItem ({ node, depth = 0, pathKey = 'r' }) {
  const store = useContext(TocStoreCtx)

  const isActive = useSyncExternalStore(
    store.subscribe,
    () => !!(node.local && store.getActivePath() === node.local)
  )

  const expandSignal = useSyncExternalStore(
    store.subscribe,
    () => {
      const target = store.getExpandTarget()
      if (!target) return 0
      if (target === pathKey || target.startsWith(pathKey + '/')) return store.getExpandGen()
      return 0
    }
  )

  const initiallyOpen = depth < 2
  const [expanded, setExpanded] = useState(initiallyOpen)
  const [childrenEverShown, setChildrenEverShown] = useState(initiallyOpen)
  const hasChildren = node.children && node.children.length > 0
  const labelRef = useRef(null)
  const lastExpandRef = useRef(0)

  useEffect(() => {
    if (expandSignal > 0 && expandSignal !== lastExpandRef.current && hasChildren) {
      lastExpandRef.current = expandSignal
      setChildrenEverShown(true)
      setExpanded(true)
    }
  }, [expandSignal, hasChildren])

  useEffect(() => {
    if (isActive && labelRef.current) {
      const t = setTimeout(() => {
        labelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }, 120)
      return () => clearTimeout(t)
    }
  }, [isActive])

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
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMainActivate() }
  }, [onMainActivate])

  const mainInteractive = !!(node.local || hasChildren)

  return (
    <li className='chm-toc-item'>
      <div
        ref={labelRef}
        className={'chm-toc-label' + (isActive ? ' active' : '')}
        style={{ paddingLeft: 12 + depth * 16 }}
        title={node.name}
      >
        {hasChildren
          ? (
            <button type='button'
              className={'chm-toc-arrow-btn' + (expanded ? ' expanded' : '')}
              aria-expanded={expanded}
              aria-label={expanded ? '折叠' : '展开'}
              onClick={toggleExpand}>
              <span className='chm-toc-arrow' aria-hidden>&#9654;</span>
            </button>
            )
          : <span className='chm-toc-dot' aria-hidden />}
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
            <TocItem key={pathKey + '/' + i} pathKey={pathKey + '/' + i}
              node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}, (prev, next) => prev.node === next.node && prev.depth === next.depth && prev.pathKey === next.pathKey)

// ---------- helpers ----------
function highlightSnippet (snippet, highlightRe) {
  if (!snippet || !highlightRe) return snippet
  return splitTextByHighlightRegex(snippet, highlightRe).map((seg, i) =>
    seg.match ? <mark key={i} className="search-highlight">{seg.v}</mark> : seg.v
  )
}

// ---------- ChmReader ----------
export default function ChmReader ({ chmPath, onBack, manualName, initialSearch }) {
  const [chmInfo, setChmInfo] = useState(null)
  const [activePage, setActivePage] = useState('')
  const [iframeDoc, setIframeDoc] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [searchTerm, setSearchTerm] = useState(initialSearch || '')
  const [searchModeOpts, setSearchModeOpts] = useState(() => defaultSearchModeOptions())
  const [searchMode, setSearchMode] = useState(initialSearch ? 'content' : 'toc')
  const [contentResults, setContentResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [pageSearchOpen, setPageSearchOpen] = useState(false)
  const [pageSearchTerm, setPageSearchTerm] = useState('')
  const [pageMatchCount, setPageMatchCount] = useState(0)
  const iframeRef = useRef(null)
  const searchTimerRef = useRef(null)
  const pageSearchRef = useRef(null)
  const sidebarRef = useRef(null)
  const pendingFindRef = useRef(null)

  // ---- History ----
  const historyRef = useRef({ stack: [], idx: -1 })
  const [historyVer, setHistoryVer] = useState(0)

  const navigateTo = useCallback((page, fromHistory = false) => {
    setActivePage(page)
    if (!fromHistory) {
      const h = historyRef.current
      h.stack = h.stack.slice(0, h.idx + 1)
      h.stack.push(page)
      h.idx = h.stack.length - 1
    }
    setHistoryVer(v => v + 1)
  }, [])

  const goBack = useCallback(() => {
    const h = historyRef.current
    if (h.idx <= 0) return
    h.idx--
    navigateTo(h.stack[h.idx], true)
  }, [navigateTo])

  const goForward = useCallback(() => {
    const h = historyRef.current
    if (h.idx >= h.stack.length - 1) return
    h.idx++
    navigateTo(h.stack[h.idx], true)
  }, [navigateTo])

  const handleSelectPage = useCallback((localPath) => { navigateTo(localPath) }, [navigateTo])

  void historyVer
  const canGoBack = historyRef.current.idx > 0
  const canGoForward = historyRef.current.idx < historyRef.current.stack.length - 1

  // ---- Load CHM ----
  useEffect(() => {
    try {
      const info = window.services.getChmInfo(chmPath)
      setChmInfo(info)
      if (info.defaultPage) navigateTo(info.defaultPage)
      setLoading(false)
    } catch (e) {
      setError('CHM 加载失败: ' + e.message)
      setLoading(false)
    }
  }, [chmPath, navigateTo])

  const { path: activePath, fragment: activeFragment } = useMemo(
    () => splitBundledActive(activePage), [activePage])

  // ---- TocStore ----
  const activePathRef = useRef('')
  const selectRef = useRef(handleSelectPage)
  const listenersRef = useRef(new Set())
  const expandTargetRef = useRef(null)
  const expandGenRef = useRef(0)
  activePathRef.current = activePath
  selectRef.current = handleSelectPage

  const tocStore = useMemo(() => ({
    subscribe (cb) { listenersRef.current.add(cb); return () => listenersRef.current.delete(cb) },
    getActivePath () { return activePathRef.current },
    select (p) { selectRef.current(p) },
    getExpandTarget () { return expandTargetRef.current },
    getExpandGen () { return expandGenRef.current }
  }), [])

  // ---- localToPathKey map ----
  const localToPathKey = useMemo(() => {
    if (!chmInfo?.toc) return new Map()
    const map = new Map()
    const walk = (nodes, prefix) => {
      nodes.forEach((node, i) => {
        const key = prefix + '/' + i
        if (node.local) map.set(node.local, key)
        if (node.children) walk(node.children, key)
      })
    }
    walk(chmInfo.toc, 'r')
    return map
  }, [chmInfo])

  // ---- TOC sync ----
  const prevActiveRef = useRef(activePath)
  useEffect(() => {
    if (prevActiveRef.current !== activePath) {
      prevActiveRef.current = activePath
      const pk = localToPathKey.get(activePath)
      if (pk) {
        expandGenRef.current++
        expandTargetRef.current = pk
      }
      listenersRef.current.forEach(cb => cb())
    }
  }, [activePath, localToPathKey])

  // ---- Load page ----
  useEffect(() => {
    if (!chmInfo?.extractDir || !activePath) { setIframeDoc(''); return }
    try {
      const html = window.services.getChmPageSrcdoc(chmInfo.extractDir, activePath)
      setIframeDoc(html || '')
    } catch { setIframeDoc('') }
  }, [chmInfo, activePath])

  // ---- Navigation via postMessage from injected nav-guard script ----
  useEffect(() => {
    if (!chmInfo) return
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
      const rel = resolveBundledNavigationTarget(href, chmInfo.extractDir, activePathRef.current)
      if (rel) {
        activePathRef.current = splitBundledActive(rel).path
        navigateTo(rel)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [chmInfo, navigateTo])

  // ---- Iframe pending find on load ----
  useEffect(() => {
    if (!iframeDoc || !chmInfo) return
    const el = iframeRef.current
    if (!el) return
    const onLoad = () => {
      const term = pendingFindRef.current
      if (term) {
        pendingFindRef.current = null
        try {
          const win = el.contentWindow
          if (win) { win.getSelection()?.removeAllRanges(); win.find(term, false, false, true) }
        } catch {}
      }
    }
    el.addEventListener('load', onLoad)
    return () => el.removeEventListener('load', onLoad)
  }, [iframeDoc, chmInfo])

  // ---- Fragment scroll ----
  useEffect(() => {
    const el = iframeRef.current
    if (!el || !iframeDoc) return
    const run = () => { try { const d = el.contentDocument; if (d) scrollBundledIframeToFragment(d, activeFragment) } catch {} }
    run()
    el.addEventListener('load', run)
    return () => el.removeEventListener('load', run)
  }, [iframeDoc, activeFragment])

  useEffect(() => {
    const el = iframeRef.current
    if (!el || !iframeDoc) return
    return attachBundledIframeContextMenu(el)
  }, [iframeDoc, activePath])

  // ---- Sidebar resize (preview line during drag, commit on mouseup) ----
  const onResizeStart = useCallback((e) => {
    if (e.button !== 0) return
    e.preventDefault()
    const sidebar = sidebarRef.current
    if (!sidebar) return
    const mainRect = sidebar.parentElement?.getBoundingClientRect()
    if (!mainRect) return
    const startX = e.clientX
    const startW = sidebar.offsetWidth
    const iframe = iframeRef.current
    let nextW = startW
    const guide = document.createElement('div')
    guide.className = 'chm-resize-guide'
    guide.style.top = mainRect.top + 'px'
    guide.style.height = mainRect.height + 'px'
    guide.style.left = (mainRect.left + startW) + 'px'
    document.body.appendChild(guide)

    const finish = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('blur', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (iframe) iframe.style.pointerEvents = ''
      guide.remove()
      setSidebarWidth(nextW)
    }
    const onMove = (ev) => {
      if (ev.buttons === 0) { finish(); return }
      nextW = Math.max(180, Math.min(window.innerWidth * 0.5, startW + ev.clientX - startX))
      guide.style.left = (mainRect.left + nextW) + 'px'
    }
    const onUp = () => finish()

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    if (iframe) iframe.style.pointerEvents = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('blur', onUp)
  }, [])

  // ---- Page search ----
  const togglePageSearch = useCallback(() => {
    setPageSearchOpen(v => { if (!v) setTimeout(() => pageSearchRef.current?.focus(), 60); return !v })
  }, [])

  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); togglePageSearch() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [togglePageSearch])

  const findInPage = useCallback((forward = true) => {
    try {
      const win = iframeRef.current?.contentWindow
      if (!win || !pageSearchTerm) return
      win.find(pageSearchTerm, false, !forward, true)
    } catch {}
  }, [pageSearchTerm])

  useEffect(() => {
    if (!pageSearchOpen || !pageSearchTerm) { setPageMatchCount(0); return }
    const t = setTimeout(() => {
      try {
        const doc = iframeRef.current?.contentDocument
        if (!doc?.body) { setPageMatchCount(0); return }
        const text = doc.body.textContent || ''
        const escaped = pageSearchTerm.replace(/[.*+?^{}()|[\]\\$]/g, '\\$&')
        const m = text.match(new RegExp(escaped, 'gi'))
        setPageMatchCount(m ? m.length : 0)
        const win = iframeRef.current?.contentWindow
        if (win) { try { win.getSelection()?.removeAllRanges() } catch {}; win.find(pageSearchTerm, false, false, true) }
      } catch { setPageMatchCount(0) }
    }, 200)
    return () => clearTimeout(t)
  }, [pageSearchTerm, pageSearchOpen, iframeDoc])

  // ---- Sidebar search ----
  const searchCompile = useMemo(() => {
    if (!searchTerm.trim()) return { ok: true, highlightRe: null }
    return compileSearchMatcher(searchTerm, searchModeOpts)
  }, [searchTerm, searchModeOpts])

  const contentHighlightRe = searchCompile.ok ? searchCompile.highlightRe : null

  useEffect(() => {
    if (searchMode !== 'content' || !searchTerm.trim() || !chmInfo || !searchCompile.ok) { setContentResults([]); return }
    setSearching(true)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      try { setContentResults(window.services.searchChmContent(chmInfo.extractDir, searchTerm, searchModeOpts)) }
      catch { setContentResults([]) }
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

  const filteredIndex = useMemo(() => {
    if (!chmInfo?.indexEntries?.length) return []
    if (searchMode !== 'index' || !searchTerm.trim()) return chmInfo.indexEntries
    const m = compileSearchMatcher(searchTerm, searchModeOpts)
    if (!m.ok) return []
    return chmInfo.indexEntries.filter(e => e.name && m.testBlob(e.name))
  }, [chmInfo, searchTerm, searchMode, searchModeOpts])

  const hasTocOutline = (chmInfo?.toc?.length ?? 0) > 0
  const hasIndex = (chmInfo?.indexEntries?.length ?? 0) > 0

  // ---- Render ----
  if (loading) return <div className="chm-reader"><div className="chm-status">{'加载中…'}</div></div>
  if (error) return <div className="chm-reader"><div className="chm-status chm-error">{error}</div></div>

  const searchPlaceholder = searchMode === 'toc'
    ? '搜索目录…'
    : searchMode === 'index'
      ? '搜索索引…'
      : '搜索页面内容…'

  return (
    <div className="chm-reader">
      <div className="chm-toolbar">
        <button className="btn btn-ghost btn-back" onClick={onBack} title="返回">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <button className={'btn btn-ghost chm-nav-btn' + (canGoBack ? '' : ' disabled')} onClick={goBack} disabled={!canGoBack} title="后退">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <button className={'btn btn-ghost chm-nav-btn' + (canGoForward ? '' : ' disabled')} onClick={goForward} disabled={!canGoForward} title="前进">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
        <span className="chm-title">{manualName || 'CHM 手册'}</span>
        <button className={'btn btn-ghost chm-page-search-btn' + (pageSearchOpen ? ' active' : '')} onClick={togglePageSearch} title="页内搜索 (Ctrl+F)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>
        <button
          className={'btn btn-ghost chm-sidebar-toggle' + (sidebarVisible ? ' active' : '')}
          onClick={() => setSidebarVisible(v => !v)}
          title={sidebarVisible ? '隐藏侧栏' : '显示侧栏'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>
          </svg>
        </button>
      </div>

      <div className="chm-main">
        {sidebarVisible && (
          <div className="chm-sidebar" ref={sidebarRef} style={{ width: sidebarWidth }}>
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
                placeholder={searchPlaceholder}
                className="chm-search-inner"
                inputClassName="chm-pm-field"
              />
            </div>

            <div className="chm-tabs">
              <button className={'chm-tab' + (searchMode === 'toc' ? ' active' : '')}
                onClick={() => setSearchMode('toc')}>{'目录'}</button>
              {hasIndex && (
                <button className={'chm-tab' + (searchMode === 'index' ? ' active' : '')}
                  onClick={() => setSearchMode('index')}>{'索引'}</button>
              )}
              <button className={'chm-tab' + (searchMode === 'content' ? ' active' : '')}
                onClick={() => setSearchMode('content')}>{'全文搜索'}</button>
            </div>

            <div className="chm-toc-container">
              {searchMode === 'toc' ? (
                !hasTocOutline ? (
                  <div className="chm-toc-empty chm-toc-nooutline">
                    <p className="chm-toc-nooutline-title">{'格式不支持目录生成'}</p>
                    <p className="chm-toc-muted">{'此 CHM 解压后无标准 .hhc 目录，应用无法生成侧栏目录。请使用「全文搜索」浏览；正文仍从默认页打开。'}</p>
                  </div>
                ) : filteredToc.length > 0 ? (
                  <TocStoreCtx.Provider value={tocStore}>
                    <ul className="chm-toc-root">
                      {filteredToc.map((node, i) => (
                        <TocItem key={'r/' + i} pathKey={'r/' + i} node={node} depth={0} />
                      ))}
                    </ul>
                  </TocStoreCtx.Provider>
                ) : searchTerm && searchCompile.ok ? (
                  <div className="chm-toc-empty">{'目录中未找到匹配项'}</div>
                ) : searchTerm ? (
                  <div className="chm-toc-empty">{'搜索条件无效'}</div>
                ) : (
                  <div className="chm-toc-empty">{'无目录信息'}</div>
                )

              ) : searchMode === 'index' ? (
                filteredIndex.length > 0 ? (
                  <ul className="chm-index-list">
                    {filteredIndex.map((entry, i) => (
                      <li key={i}
                        className={'chm-index-item' + (activePath === entry.local ? ' active' : '')}
                        onClick={() => handleSelectPage(entry.local)}
                        title={entry.name}>
                        {entry.name}
                      </li>
                    ))}
                  </ul>
                ) : searchTerm && searchCompile.ok ? (
                  <div className="chm-toc-empty">{'索引中未找到匹配项'}</div>
                ) : (
                  <div className="chm-toc-empty">{'无索引信息'}</div>
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
                      <li key={i}
                        className={'chm-search-result' + (activePath === r.local ? ' active' : '')}
                        onClick={() => { pendingFindRef.current = searchTerm; handleSelectPage(r.local) }}>
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

        {sidebarVisible && <div className="chm-resize-handle" onMouseDown={onResizeStart} />}

        <div className="chm-content">
          {pageSearchOpen && (
            <div className="chm-page-search-bar">
              <input ref={pageSearchRef} className="chm-page-search-input"
                value={pageSearchTerm}
                onChange={e => setPageSearchTerm(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') findInPage(!e.shiftKey)
                  if (e.key === 'Escape') { setPageSearchOpen(false); setPageSearchTerm('') }
                }}
                placeholder={'搜索关键词…'} />
              {pageSearchTerm && (
                <span className="chm-page-search-count">
                  {pageMatchCount > 0 ? pageMatchCount + ' 处匹配' : '无匹配'}
                </span>
              )}
              <button className="chm-ps-btn" onClick={() => findInPage(false)} title={'上一个'}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg>
              </button>
              <button className="chm-ps-btn" onClick={() => findInPage(true)} title={'下一个'}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <button className="chm-ps-btn" onClick={() => { setPageSearchOpen(false); setPageSearchTerm('') }} title={'关闭'}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          )}

          {iframeDoc ? (
            <iframe key={activePath} ref={iframeRef} srcDoc={iframeDoc} className="chm-iframe" title="CHM Content" />
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
      result.push({ ...node, children: nameMatch ? (node.children || []) : childMatches })
    }
  }
  return result
}
