import { useMemo, useState, useEffect } from 'react'
import { useManualContext } from '../store/ManualContext'
import {
  compileSearchMatcher,
  defaultSearchModeOptions,
  snippetAroundMatch,
  splitTextByHighlightRegex
} from '../utils/searchModes'
import SearchInputWithModes from './SearchInputWithModes'
import './DirectoryManualReader.css'

function detectTypeByPath (filePath) {
  if (/\.(md|markdown)$/i.test(filePath)) return 'markdown'
  if (/\.json$/i.test(filePath)) return 'json'
  if (/\.pdf$/i.test(filePath)) return 'pdf'
  if (/\.chm$/i.test(filePath)) return 'chm'
  return 'html'
}

function highlightByMatcher (text, matcher) {
  if (!text) return text
  if (!matcher?.ok || !matcher.highlightRe) return text
  return splitTextByHighlightRegex(text, matcher.highlightRe).map((seg, i) =>
    seg.match
      ? <mark key={i} className="search-highlight">{seg.v}</mark>
      : seg.v
  )
}

export default function DirectoryManualReader ({ manualId, sourcePath, title, searchQuery, initialKeyword }) {
  const { manuals, navigate } = useManualContext()
  const [keyword, setKeyword] = useState(initialKeyword || '')
  const [modeOpts, setModeOpts] = useState(() => defaultSearchModeOptions())

  useEffect(() => {
    if (initialKeyword !== undefined && initialKeyword !== null) {
      setKeyword(String(initialKeyword))
    }
  }, [initialKeyword])

  const manual = manuals.find(m => m.id === manualId)

  const matcher = useMemo(() => {
    if (!keyword.trim()) return null
    return compileSearchMatcher(keyword, modeOpts)
  }, [keyword, modeOpts])

  const files = useMemo(() => {
    if (!sourcePath) return []
    const entries = window.services.scanDir(sourcePath, [
      '.md', '.markdown', '.json', '.pdf', '.html', '.htm', '.chm'
    ])
    return entries
      .map(entry => {
        const isChm = entry.ext.toLowerCase() === '.chm'
        return {
          ...entry,
          rel: entry.path.slice(sourcePath.length).replace(/^[\\/]/, ''),
          title: entry.name.replace(/\.(md|markdown|json|pdf|html|htm|chm)$/i, ''),
          summary: isChm ? 'CHM 帮助文档' : (window.services.readFileSummary?.(entry.path, 80) || ''),
          searchText: isChm
            ? (entry.name + ' chm')
            : (window.services.readFileSearchText?.(entry.path, 1000) || '')
        }
      })
      .sort((a, b) => a.rel.localeCompare(b.rel))
  }, [sourcePath])

  const filtered = useMemo(() => {
    if (!keyword.trim()) return files
    if (!matcher || !matcher.ok) return []
    return files.filter(file => {
      const hay = file.title + ' ' + file.summary + ' ' + file.searchText
      return matcher.testBlob(hay)
    })
  }, [files, keyword, matcher])

  const openFile = (file) => {
    const kw = keyword.trim()
    navigate('reader', {
      manualId,
      sourcePath: file.path,
      sourceType: detectTypeByPath(file.path),
      title: file.title,
      searchQuery,
      parentDir: sourcePath,
      parentTitle: title,
      dirListKeyword: kw || undefined,
      scrollHighlight: kw || undefined,
      scrollHighlightOpts: kw ? modeOpts : undefined
    })
  }

  const goBack = () => {
    if (searchQuery) navigate('search', { query: searchQuery })
    else navigate('library')
  }

  const compileErr = keyword.trim() && matcher && !matcher.ok ? matcher.error : ''

  return (
    <div className="reader-page">
      <div className="reader-header">
        <button className="btn btn-ghost btn-back" onClick={goBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div className="reader-info">
          {manual && <span className="reader-manual-name">{manual.name}</span>}
          {title && <span className="reader-sep">/</span>}
          {title && <span className="reader-title">{title}</span>}
        </div>
      </div>

      <div className="reader-body">
        <div className="dir-reader">
          <div className="dir-reader-header">
            <div className="dir-reader-summary">共 {files.length} 个文档</div>
            {compileErr && <div className="dir-search-err">{compileErr}</div>}
            <SearchInputWithModes
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              options={modeOpts}
              onOptionsChange={setModeOpts}
              onClear={() => setKeyword('')}
              placeholder="搜索文件名或内容…"
              className="dir-search-wrap"
              inputClassName="dir-pm-field"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="reader-status">
              {keyword.trim() && compileErr ? '搜索条件无效' : '没有匹配的文档'}
            </div>
          ) : (
            <div className="dir-reader-list">
              {filtered.map(file => {
                const hasKeyword = keyword.trim().length > 0 && matcher?.ok
                const hay = file.searchText || file.summary || ''
                const contextSnippet = hasKeyword
                  ? snippetAroundMatch(hay, matcher)
                  : ''
                const displaySummary = contextSnippet || file.summary || ''
                return (
                  <button
                    key={file.path}
                    className="dir-reader-item"
                    onClick={() => openFile(file)}
                  >
                    <span className="dir-reader-name">
                      {hasKeyword ? highlightByMatcher(file.title, matcher) : file.title}
                    </span>
                    {displaySummary && (
                      <span className="dir-reader-summary">
                        {hasKeyword ? highlightByMatcher(displaySummary, matcher) : displaySummary}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
