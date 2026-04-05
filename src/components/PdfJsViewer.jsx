import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
// legacy build includes Promise.withResolvers polyfill for older Chromium (e.g. uTools)
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import {
  compileSearchMatcher,
  defaultSearchModeOptions,
  snippetAroundMatch,
  splitTextByHighlightRegex
} from '../utils/searchModes'
import SearchInputWithModes from './SearchInputWithModes'
import {
  PDF_VIEWER_UI,
  pdfCappedHint,
  pdfPageLabel,
  pdfMatchCountLabel
} from '../utils/asciiUiStrings.js'
import './PdfJsViewer.css'

/** pdfjs-dist version matches package.json; worker from CDN (~1.3MB) */
const PDFJS_VER = '4.10.38'
GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}/legacy/build/pdf.worker.min.mjs`

/** Chinese PDFs need CMap from CDN */
const CMAP_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}/cmaps/`

const SEARCH_DEBOUNCE_MS = 380
const MAX_PDF_PAGES_TO_SEARCH = 1200
const MAX_PDF_SEARCH_RESULTS = 80
const ZOOM_MIN = 0.5
const ZOOM_MAX = 4
const ZOOM_STEP = 0.12
/** Debounce raster width so wheel bursts do not re-render every PDF page each tick */
const ZOOM_RENDER_DEBOUNCE_MS = 72

function useDebouncedValue (value, delayMs) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

function pageTextFromContent (textContent) {
  if (!textContent?.items?.length) return ''
  return textContent.items.map((it) => (it.str != null ? it.str : '')).join(' ')
}

function countMatchesInText (text, highlightRe) {
  if (!text || !highlightRe) return 0
  try {
    const flags = highlightRe.flags.includes('g') ? highlightRe.flags : highlightRe.flags + 'g'
    const re = new RegExp(highlightRe.source, flags)
    let n = 0
    let m
    while ((m = re.exec(text)) !== null) {
      n++
      if (m[0].length === 0) re.lastIndex++
    }
    return n
  } catch {
    return 0
  }
}

function highlightSnippet (snippet, highlightRe) {
  if (!snippet) return snippet
  if (!highlightRe) return snippet
  return splitTextByHighlightRegex(snippet, highlightRe).map((seg, i) =>
    seg.match
      ? <mark key={i} className="pdf-search-highlight">{seg.v}</mark>
      : seg.v
  )
}

async function searchPdfPages (pdfDoc, matcher, signal, onProgress) {
  if (!pdfDoc || !matcher?.ok) return { results: [], pagesScanned: 0, capped: false }
  const n = Math.min(pdfDoc.numPages, MAX_PDF_PAGES_TO_SEARCH)
  const capped = pdfDoc.numPages > MAX_PDF_PAGES_TO_SEARCH
  const results = []
  let lastScanned = 0
  for (let p = 1; p <= n; p++) {
    if (signal.aborted) break
    lastScanned = p
    if (p % 4 === 0) {
      await new Promise((r) => setTimeout(r, 0))
      onProgress?.(p, n)
    }
    if (results.length >= MAX_PDF_SEARCH_RESULTS) break
    try {
      const page = await pdfDoc.getPage(p)
      const tc = await page.getTextContent()
      const text = pageTextFromContent(tc)
      if (!text || !matcher.testBlob(text)) continue
      const matchCount = countMatchesInText(text, matcher.highlightRe)
      const rawSnippet = snippetAroundMatch(text, matcher, 180)
      results.push({
        pageNum: p,
        snippet: rawSnippet,
        matchCount: matchCount || 1
      })
    } catch { /* skip failed page */ }
  }
  onProgress?.(lastScanned || n, n)
  return { results, pagesScanned: lastScanned, capped }
}

/** Scroll inside scroll root (avoid wrong scrollIntoView ancestor) */
function scrollElementIntoScrollRoot (scrollRoot, targetEl, marginTop = 8) {
  if (!scrollRoot || !targetEl) return
  const rootRect = scrollRoot.getBoundingClientRect()
  const elRect = targetEl.getBoundingClientRect()
  const delta = elRect.top - rootRect.top + scrollRoot.scrollTop - marginTop
  scrollRoot.scrollTo({ top: Math.max(0, delta), behavior: 'smooth' })
}

function PdfPageCanvas ({ pdfDoc, pageNum, width, scrollRootRef }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const cancelledRef = useRef(false)
  const renderGenRef = useRef(0)
  const widthRef = useRef(width)
  widthRef.current = width

  const runRender = useCallback(async (w) => {
    const canvas = canvasRef.current
    if (!canvas || !pdfDoc || w < 24 || cancelledRef.current) return
    const gen = ++renderGenRef.current
    try {
      const page = await pdfDoc.getPage(pageNum)
      if (cancelledRef.current || gen !== renderGenRef.current) return
      const base = page.getViewport({ scale: 1 })
      const scale = w / base.width
      const viewport = page.getViewport({ scale })
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d', { alpha: false })
      await page.render({ canvasContext: ctx, viewport }).promise
    } catch (e) {
      console.warn('pdf page render', pageNum, e)
    }
  }, [pdfDoc, pageNum])

  useEffect(() => {
    cancelledRef.current = false
    const el = wrapRef.current
    if (!el || !pdfDoc) return
    const root = scrollRootRef?.current ?? null

    const isNearViewport = () => {
      const er = el.getBoundingClientRect()
      const rr = root?.getBoundingClientRect?.()
      const top = rr?.top ?? 0
      const bottom = rr?.bottom ?? (typeof window !== 'undefined' ? window.innerHeight : 800)
      const margin = 420
      return er.bottom > top - margin && er.top < bottom + margin
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void runRender(widthRef.current)
      },
      { root, rootMargin: '400px 0px', threshold: 0.01 }
    )
    io.observe(el)
    if (isNearViewport()) void runRender(widthRef.current)

    return () => {
      cancelledRef.current = true
      renderGenRef.current++
      io.disconnect()
    }
  }, [pdfDoc, pageNum, scrollRootRef, runRender])

  useEffect(() => {
    if (!pdfDoc || width < 24) return
    const el = wrapRef.current
    if (!el) return
    const root = scrollRootRef?.current ?? null
    const er = el.getBoundingClientRect()
    const rr = root?.getBoundingClientRect?.()
    const top = rr?.top ?? 0
    const bottom = rr?.bottom ?? (typeof window !== 'undefined' ? window.innerHeight : 800)
    const margin = 420
    const near = er.bottom > top - margin && er.top < bottom + margin
    if (near) void runRender(width)
  }, [width, pdfDoc, runRender])

  return (
    <div ref={wrapRef} className="pdf-page-wrap" data-pdf-page={pageNum}>
      <canvas ref={canvasRef} className="pdf-page-canvas" />
    </div>
  )
}

function SearchIcon () {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  )
}

export default function PdfJsViewer ({ data, initialSearch = '' }) {
  const [pdfDoc, setPdfDoc] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [err, setErr] = useState(null)
  const [loadingDoc, setLoadingDoc] = useState(true)
  const containerRef = useRef(null)
  const pdfViewportWrapRef = useRef(null)
  const pagesScrollRef = useRef(null)
  const [baseContentWidth, setBaseContentWidth] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [searchPanelOpen, setSearchPanelOpen] = useState(() => Boolean(String(initialSearch || '').trim()))

  const [searchTerm, setSearchTerm] = useState(initialSearch || '')
  const [searchModeOpts, setSearchModeOpts] = useState(() => defaultSearchModeOptions())
  const [contentResults, setContentResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchMeta, setSearchMeta] = useState({ pagesScanned: 0, capped: false })
  const [activeResultPage, setActiveResultPage] = useState(null)
  const searchTimerRef = useRef(null)
  const searchAbortRef = useRef(null)

  useEffect(() => {
    if (initialSearch) setSearchTerm(initialSearch)
  }, [initialSearch])

  useEffect(() => {
    if (String(initialSearch || '').trim()) setSearchPanelOpen(true)
  }, [initialSearch])

  useEffect(() => {
    if (!searchPanelOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') setSearchPanelOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchPanelOpen])

  const searchCompile = useMemo(
    () => compileSearchMatcher(searchTerm, searchModeOpts),
    [searchTerm, searchModeOpts]
  )

  const debouncedZoom = useDebouncedValue(zoom, ZOOM_RENDER_DEBOUNCE_MS)
  const renderWidth = useMemo(
    () =>
      baseContentWidth > 0 ? Math.max(48, Math.round(baseContentWidth * debouncedZoom)) : 0,
    [baseContentWidth, debouncedZoom]
  )

  const scrollToPdfPage = useCallback((pageNum) => {
    const root = pagesScrollRef.current
    if (!root || !pageNum) return
    const wrap = root.querySelector(`[data-pdf-page="${pageNum}"]`)
    if (!wrap) return
    requestAnimationFrame(() => {
      scrollElementIntoScrollRoot(pagesScrollRef.current, wrap, 8)
    })
  }, [])

  useEffect(() => {
    const el = pagesScrollRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      const inner = w > 48 ? w - 32 : Math.max(320, (typeof window !== 'undefined' ? window.innerWidth : 800) - 64)
      setBaseContentWidth(inner)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [pdfDoc, numPages, loadingDoc, err, searchPanelOpen])

  useEffect(() => {
    const el = pdfViewportWrapRef.current
    if (!el) return
    const onWheel = (e) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      e.preventDefault()
      e.stopPropagation()
      const dy = e.deltaY
      setZoom((z) => {
        const next = dy > 0 ? z - ZOOM_STEP : z + ZOOM_STEP
        const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 100) / 100))
        return clamped
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => el.removeEventListener('wheel', onWheel, { capture: true })
  }, [pdfDoc, numPages, loadingDoc, err])

  useEffect(() => {
    if (!data?.byteLength) {
      setPdfDoc(null)
      setNumPages(0)
      setLoadingDoc(false)
      return
    }
    let destroyed = false
    let loadingTask = null
    let doc = null

    setLoadingDoc(true)
    setErr(null)
    setPdfDoc(null)
    setNumPages(0)

    try {
      loadingTask = getDocument({
        data: data.slice(0),
        cMapUrl: CMAP_URL,
        cMapPacked: true
      })
      loadingTask.promise
        .then(async (d) => {
          if (destroyed) {
            await d.destroy().catch(() => {})
            return
          }
          doc = d
          setPdfDoc(d)
          setNumPages(d.numPages)
          setLoadingDoc(false)
        })
        .catch((e) => {
          if (!destroyed) {
            setErr(e.message || String(e))
            setLoadingDoc(false)
          }
        })
    } catch (e) {
      setErr(e.message || String(e))
      setLoadingDoc(false)
    }

    return () => {
      destroyed = true
      try {
        loadingTask?.destroy()
      } catch { /* ignore */ }
      if (doc) {
        doc.destroy().catch(() => {})
      }
    }
  }, [data])

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchAbortRef.current?.abort()

    if (!pdfDoc || loadingDoc || err) {
      setContentResults([])
      setSearchMeta({ pagesScanned: 0, capped: false })
      setActiveResultPage(null)
      setSearching(false)
      return
    }

    const q = searchTerm.trim()
    if (!q || !searchCompile.ok) {
      setContentResults([])
      setSearchMeta({ pagesScanned: 0, capped: false })
      setActiveResultPage(null)
      setSearching(false)
      return
    }

    setSearching(true)
    searchTimerRef.current = setTimeout(() => {
      const ac = new AbortController()
      searchAbortRef.current = ac
      void (async () => {
        try {
          const { results, pagesScanned, capped } = await searchPdfPages(
            pdfDoc,
            searchCompile,
            ac.signal,
            () => {}
          )
          if (!ac.signal.aborted) {
            setContentResults(results)
            setSearchMeta({ pagesScanned, capped })
          }
        } finally {
          if (!ac.signal.aborted) setSearching(false)
        }
      })()
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      searchAbortRef.current?.abort()
    }
  }, [pdfDoc, loadingDoc, err, searchTerm, searchCompile])

  const Ui = PDF_VIEWER_UI

  return (
    <div ref={containerRef} className="pdf-js-root pdf-js-mount">
      {loadingDoc && <div className="reader-status">{Ui.loading}</div>}
      {err && <div className="reader-status reader-error">{err}</div>}
      {!loadingDoc && !err && pdfDoc && numPages > 0 && (
        <div className="pdf-js-row">
          {searchPanelOpen && (
            <aside className="pdf-search-sidebar" aria-label={Ui.fullSearch}>
              <div className="pdf-search-sidebar-head">
                <span className="pdf-search-sidebar-title">{Ui.fullSearch}</span>
                <button
                  type="button"
                  className="pdf-search-close"
                  onClick={() => setSearchPanelOpen(false)}
                  title={Ui.closeEsc}
                  aria-label={Ui.closeSearch}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="pdf-search-sidebar-body">
                <SearchInputWithModes
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  options={searchModeOpts}
                  onOptionsChange={setSearchModeOpts}
                  placeholder={Ui.placeholder}
                  className="pdf-search-inner"
                  inputClassName="pdf-search-field"
                />
                {!searchCompile.ok && searchTerm.trim() && (
                  <div className="pdf-search-err">{searchCompile.error}</div>
                )}
                {searching && <div className="pdf-search-status">{Ui.searching}</div>}
                {!searching && searchTerm.trim() && searchCompile.ok && contentResults.length === 0 && (
                  <div className="pdf-search-status muted">{Ui.noMatch}</div>
                )}
                {searchMeta.capped && searchTerm.trim() && searchCompile.ok && (
                  <div className="pdf-search-hint">
                    {pdfCappedHint(MAX_PDF_PAGES_TO_SEARCH, numPages)}
                  </div>
                )}
                {contentResults.length > 0 && (
                  <div className="pdf-search-results-panel">
                    <div className="pdf-search-results-title">
                      {'\u5171 ' + contentResults.length + ' \u6761'}
                      {searchMeta.pagesScanned > 0 && (
                        <span className="pdf-search-results-sub">
                          {' \u5df2\u626b ' + searchMeta.pagesScanned + ' \u9875'}
                        </span>
                      )}
                    </div>
                    <ul className="pdf-search-results-list">
                      {contentResults.map((r) => (
                        <li key={r.pageNum}>
                          <button
                            type="button"
                            className={
                              'pdf-search-hit' + (activeResultPage === r.pageNum ? ' active' : '')
                            }
                            onClick={() => {
                              setActiveResultPage(r.pageNum)
                              scrollToPdfPage(r.pageNum)
                            }}
                          >
                            <span className="pdf-search-hit-page">{pdfPageLabel(r.pageNum)}</span>
                            <span className="pdf-search-hit-count">{pdfMatchCountLabel(r.matchCount)}</span>
                            <span className="pdf-search-hit-snippet">
                              {highlightSnippet(r.snippet, searchCompile.highlightRe)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </aside>
          )}
          <div ref={pdfViewportWrapRef} className="pdf-viewport-wrap">
            {!searchPanelOpen && (
              <button
                type="button"
                className="pdf-search-fab"
                onClick={() => setSearchPanelOpen(true)}
                title={Ui.fabTitle}
                aria-label={Ui.fabAria}
              >
                <SearchIcon />
              </button>
            )}
            <div className="pdf-zoom-hint" title={Ui.zoomTitle}>
              {Math.round(zoom * 100)}%
            </div>
            <div ref={pagesScrollRef} className="pdf-pages-scroll">
              <div className="pdf-pages">
                {renderWidth > 0 &&
                  Array.from({ length: numPages }, (_, i) => (
                    <PdfPageCanvas
                      key={i + 1}
                      pdfDoc={pdfDoc}
                      pageNum={i + 1}
                      width={renderWidth}
                      scrollRootRef={pagesScrollRef}
                    />
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
