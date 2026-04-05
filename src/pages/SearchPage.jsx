import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useManualContext } from '../store/ManualContext'
import { searchAcrossManuals, searchInManual } from '../modules/search/SearchService'
import {
  compileSearchMatcher,
  shouldUseMiniSearchDefault,
  defaultSearchModeOptions,
  snippetAroundMatch,
  splitTextByHighlightRegex
} from '../utils/searchModes'
import SearchInputWithModes from '../components/SearchInputWithModes'
import './SearchPage.css'

function highlightText (text, terms) {
  if (!text || !terms?.length) return text || ''
  const escaped = terms
    .filter(t => t.length > 0)
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (escaped.length === 0) return text
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(regex)
  return parts.map((part, i) =>
    i % 2 === 1
      ? <mark key={i} className="search-highlight">{part}</mark>
      : part
  )
}

function highlightByMatcher (text, matcher) {
  if (!text) return null
  if (!matcher?.ok || !matcher.highlightRe) return text
  return splitTextByHighlightRegex(text, matcher.highlightRe).map((seg, i) =>
    seg.match
      ? <mark key={i} className="search-highlight">{seg.v}</mark>
      : seg.v
  )
}

export default function SearchPage ({ initialQuery = '' }) {
  const { manuals, navigate } = useManualContext()
  const [query, setQuery] = useState(initialQuery)
  const [modeOpts, setModeOpts] = useState(() => defaultSearchModeOptions())
  const [results, setResults] = useState([])
  const [filter, setFilter] = useState('all')
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)
  const inputRef = useRef(null)
  const timer = useRef(null)

  const ready = manuals.filter(m => m.enabled && m.indexStatus === 'ready')

  const matcherForHighlight = useMemo(() => {
    if (!query.trim()) return null
    const m = compileSearchMatcher(query, modeOpts)
    return m.ok ? m : null
  }, [query, modeOpts])

  const doSearch = useCallback((q, f, opts) => {
    if (!q?.trim()) {
      setResults([])
      setSearchError('')
      return
    }
    const parsed = compileSearchMatcher(q, opts)
    if (!parsed.ok) {
      setSearchError(parsed.error)
      setResults([])
      return
    }
    setSearchError('')
    setSearching(true)
    try {
      let hits
      if (shouldUseMiniSearchDefault(opts)) {
        hits = f && f !== 'all'
          ? searchInManual(q, f)
          : searchAcrossManuals(q, ready)
      } else {
        hits = f && f !== 'all'
          ? searchInManual(q, f, opts)
          : searchAcrossManuals(q, ready, opts)
      }
      setResults(hits.slice(0, 50))
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [ready])

  useEffect(() => {
    inputRef.current?.focus()
    if (initialQuery) doSearch(initialQuery, filter, modeOpts)
  }, [])

  const runDebounced = (v, f, opts) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => doSearch(v, f, opts), 200)
  }

  const onInput = (e) => {
    const v = e.target.value
    setQuery(v)
    runDebounced(v, filter, modeOpts)
  }

  const onFilterChange = (e) => {
    const v = e.target.value
    setFilter(v)
    doSearch(query, v, modeOpts)
  }

  const onModesChange = (next) => {
    setModeOpts(next)
    doSearch(query, filter, next)
  }

  const clearQuery = () => {
    setQuery('')
    setResults([])
    setSearchError('')
  }

  const openResult = (r) => {
    const sp = r.sourcePath || ''
    navigate('reader', {
      manualId: r.manualId,
      sourcePath: sp,
      sourceType: /\.json$/i.test(sp) ? 'json'
        : /\.(md|markdown)$/i.test(sp) ? 'markdown'
        : /\.pdf$/i.test(sp) ? 'pdf'
        : /\.chm$/i.test(sp) ? 'chm'
        : 'html',
      anchor: r.anchor,
      title: r.title,
      searchQuery: query
    })
  }

  const useMini = shouldUseMiniSearchDefault(modeOpts)

  return (
    <div className="search-page">
      <div className="search-header">
        <button className="btn btn-ghost btn-back" onClick={() => navigate('library')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <SearchInputWithModes
          inputRef={inputRef}
          className="search-input-grow"
          inputClassName=""
          value={query}
          onChange={onInput}
          options={modeOpts}
          onOptionsChange={onModesChange}
          onClear={clearQuery}
          placeholder="搜索命令、函数、关键词…（右侧 Aa / ab / .* 为选项）"
        />
        <select className="search-filter" value={filter} onChange={onFilterChange}>
          <option value="all">全部手册</option>
          {ready.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      {searchError && <div className="search-regex-error">{searchError}</div>}

      <div className="search-body">
        {searching && <div className="search-status">搜索中...</div>}
        {!searching && query && !searchError && results.length === 0 && (
          <div className="search-status">未找到匹配结果</div>
        )}
        {results.map((r, i) => {
          const terms = r.terms || query.trim().split(/\s+/).filter(Boolean)
          const raw = r.content || r.summary || ''
          const snippet = matcherForHighlight
            ? snippetAroundMatch(raw, matcherForHighlight)
            : raw.substring(0, 160)

          return (
            <div key={r.id || i} className="result-item" onClick={() => openResult(r)}>
              <div className="result-title">
                {useMini
                  ? highlightText(r.title, terms)
                  : highlightByMatcher(r.title, matcherForHighlight)}
              </div>
              <div className="result-meta">
                <span className="result-manual">{r.manualName}</span>
                {r.type && <span className="result-type">{r.type}</span>}
              </div>
              {snippet && (
                <div className="result-snippet">
                  {useMini
                    ? highlightText(snippet, terms)
                    : highlightByMatcher(snippet, matcherForHighlight)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
