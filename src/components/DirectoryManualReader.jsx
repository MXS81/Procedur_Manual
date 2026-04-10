import { useMemo, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useManualContext } from '../store/ManualContext'
import {
  compileSearchMatcher,
  defaultSearchModeOptions,
  snippetAroundMatch,
  splitTextByHighlightRegex
} from '../utils/searchModes'
import { clampMenuPos } from '../utils/contextMenuCore.js'
import SearchInputWithModes from './SearchInputWithModes'
import AddUserMdCommandModal from './AddUserMdCommandModal'
import { DIR_MD_ADD_COMMAND_UI as UI } from '../utils/asciiUiStrings.js'
import './ContextMenuHost.css'
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
  const { manuals, navigate, notify } = useManualContext()
  const [keyword, setKeyword] = useState(initialKeyword || '')
  const [modeOpts, setModeOpts] = useState(() => defaultSearchModeOptions())
  const [addCmdOpen, setAddCmdOpen] = useState(false)
  const [scanTick, setScanTick] = useState(0)
  const [dirCmdCtx, setDirCmdCtx] = useState(null)

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
          rel: entry.path.slice(sourcePath.length).replace(/^[\\/]/, '').replace(/\\/g, '/'),
          title: entry.name.replace(/\.(md|markdown|json|pdf|html|htm|chm)$/i, ''),
          summary: isChm ? 'CHM 帮助文档' : (window.services.readFileSummary?.(entry.path, 80) || ''),
          searchText: isChm
            ? (entry.name + ' chm')
            : (window.services.readFileSearchText?.(entry.path, 1000) || '')
        }
      })
      .sort((a, b) => a.rel.localeCompare(b.rel))
  }, [sourcePath, scanTick])

  const userAddedRelSet = useMemo(() => {
    try {
      const rels = window.services.getUserAddedMarkdownCommandRels?.(manualId) || []
      return new Set(rels)
    } catch {
      return new Set()
    }
  }, [manualId, scanTick])

  useEffect(() => {
    if (!dirCmdCtx) return
    const dismiss = () => setDirCmdCtx(null)
    const onKey = (e) => {
      if (e.key === 'Escape') dismiss()
    }
    const onMd = (e) => {
      if (e.button !== 0) return
      if (e.target.closest?.('.dir-cmd-ctx-menu')) return
      dismiss()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onMd, true)
    document.addEventListener('scroll', dismiss, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onMd, true)
      document.removeEventListener('scroll', dismiss, true)
    }
  }, [dirCmdCtx])

  const runDeleteUserCmd = useCallback((file) => {
    if (!file || !sourcePath) return
    const msg =
      UI.deleteConfirmPrefix + '「' + file.name + '」' + UI.deleteConfirmSuffix
    if (!window.confirm(msg)) return
    try {
      if (typeof window.services?.deleteUserAddedMarkdownCommand !== 'function') {
        notify(UI.needService, 'error')
        return
      }
      window.services.deleteUserAddedMarkdownCommand(sourcePath, manualId, file.rel)
      notify(UI.deleteDone + '「' + file.name + '」', 'success')
      setDirCmdCtx(null)
      setScanTick((t) => t + 1)
    } catch (e) {
      notify(UI.deleteFail + (e.message || String(e)), 'error')
    }
  }, [manualId, notify, sourcePath])

  const canAddUserMdCommand = useMemo(() => {
    if (!sourcePath) return false
    if (files.length === 0) return true
    return files.some((f) => /\.(md|markdown)$/i.test(f.ext))
  }, [sourcePath, files])

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
            <div className="dir-search-row">
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
              {canAddUserMdCommand && (
                <button
                  type="button"
                  className="btn btn-secondary dir-add-md-btn"
                  title={UI.buttonTitle}
                  onClick={() => setAddCmdOpen(true)}
                >
                  {UI.buttonLabel}
                </button>
              )}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="reader-status">
              {files.length === 0 && !keyword.trim()
                ? '目录为空。可点击右侧「新增」添加第一条命令文档。'
                : keyword.trim() && compileErr
                  ? '搜索条件无效'
                  : '没有匹配的文档'}
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
                const isUserAddedMd =
                  /\.(md|markdown)$/i.test(file.ext || file.name) &&
                  userAddedRelSet.has(file.rel)
                return (
                  <button
                    key={file.path}
                    type="button"
                    className={'dir-reader-item' + (isUserAddedMd ? ' dir-reader-item-user-md' : '')}
                    title={isUserAddedMd ? '右键可删除此自建命令文档' : undefined}
                    onClick={() => openFile(file)}
                    onContextMenu={
                      isUserAddedMd
                        ? (e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            const p = clampMenuPos(e.clientX, e.clientY, 200, 52)
                            setDirCmdCtx({ x: p.x, y: p.y, file })
                          }
                        : undefined
                    }
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
      <AddUserMdCommandModal
        open={addCmdOpen}
        onClose={() => setAddCmdOpen(false)}
        sourcePath={sourcePath}
        manualId={manualId}
        notify={notify}
        onSaved={(commandName) => {
          setScanTick((t) => t + 1)
          if (commandName) setKeyword(String(commandName))
        }}
      />
      {dirCmdCtx && createPortal(
        <div
          className="ctx-menu-host dir-cmd-ctx-menu"
          style={{ left: dirCmdCtx.x, top: dirCmdCtx.y }}
          role="menu"
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            type="button"
            role="menuitem"
            className="ctx-menu-item ctx-menu-item-danger"
            onClick={() => runDeleteUserCmd(dirCmdCtx.file)}
          >
            {UI.deleteItem}
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
