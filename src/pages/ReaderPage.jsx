import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useManualContext } from '../store/ManualContext'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import python from 'highlight.js/lib/languages/python'
import cpp from 'highlight.js/lib/languages/cpp'
import java from 'highlight.js/lib/languages/java'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import sql from 'highlight.js/lib/languages/sql'
import matlab from 'highlight.js/lib/languages/matlab'
import 'highlight.js/styles/atom-one-dark.css'
import { escapeHtml } from '../utils/helpers'
import ChmReader from '../components/ChmReader'
import DirectoryManualReader from '../components/DirectoryManualReader'
import IframeManualReader from '../components/IframeManualReader'
import RemoteBuiltinDownload from '../components/RemoteBuiltinDownload'
import { isRemoteBuiltinPending } from '../utils/manualRemote'
import './ReaderPage.css'

const PdfJsViewer = lazy(() => import('../components/PdfJsViewer'))

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('java', java)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('matlab', matlab)

function normalizeUint8 (v) {
  if (!v) return null
  if (v instanceof Uint8Array) return v.byteLength ? v : null
  if (Array.isArray(v)) return new Uint8Array(v)
  if (typeof v.byteLength === 'number' && v.buffer) {
    return new Uint8Array(v.buffer, v.byteOffset || 0, v.byteLength)
  }
  return null
}

/** preload PDF file as Uint8Array (base64 decoded). */
function readPdfFileAsUint8 (filePath) {
  try {
    if (typeof window.services.readBinaryAsUint8 === 'function') {
      const u = normalizeUint8(window.services.readBinaryAsUint8(filePath))
      if (u?.byteLength) return u
    }
  } catch { /* fall through */ }
  const b64 = window.services.readBinaryAsBase64(filePath)
  const bin = atob(String(b64).replace(/\s/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export default function ReaderPage ({ manualId, sourcePath, sourceType, anchor, title, searchQuery, quickSearch, parentDir, parentTitle }) {
  const { manuals, navigate } = useManualContext()
  const [html, setHtml] = useState('')
  const [pdfBytes, setPdfBytes] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const ref = useRef(null)

  const manual = manuals.find(m => m.id === manualId)

  const resolvedPath = sourcePath || manual?.rootPath
  const resolvedType = sourceType || manual?.sourceType

  const pathInfo = resolvedPath ? window.services?.pathInfo?.(resolvedPath) : null
  const detectedType = resolvedType
    || (pathInfo?.isDir ? 'mixed'
      : /\.(md|markdown)$/i.test(resolvedPath || '') ? 'markdown'
        : /\.json$/i.test(resolvedPath || '') ? 'json'
        : /\.pdf$/i.test(resolvedPath || '') ? 'pdf'
        : /\.chm$/i.test(resolvedPath || '') ? 'chm'
        : 'html')

  const goBack = () => {
    if (searchQuery) navigate('search', { query: searchQuery })
    else if (parentDir) navigate('reader', { manualId, sourcePath: parentDir, sourceType: 'mixed', title: parentTitle })
    else navigate('library')
  }

  const renderRemoteBuiltinGate = () => (
    <div className="reader-page">
      <div className="reader-header">
        <button className="btn btn-ghost btn-back" onClick={goBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div className="reader-info">
          {manual && <span className="reader-manual-name">{manual.name}</span>}
        </div>
      </div>
      <div className="reader-body">
        <RemoteBuiltinDownload manual={manual} />
      </div>
    </div>
  )

  useEffect(() => {
    if (detectedType === 'chm' || detectedType === 'mixed') return
    setPdfBytes(null)
    setHtml('')
    if (!resolvedPath) { setError('未指定文件路径'); setLoading(false); return () => {} }
    try {
      const info = window.services.pathInfo(resolvedPath)
      if (!info.exists && manual?.remoteDownloadUrl) {
        setError(null)
        setLoading(false)
        return () => {}
      }
      if (!info.exists) { setError('文件不存在: ' + resolvedPath); setLoading(false); return () => {} }

      if (detectedType === 'pdf') {
        try {
          const bytes = readPdfFileAsUint8(resolvedPath)
          if (bytes?.byteLength) setPdfBytes(bytes)
          else setError('PDF 文件为空')
        } catch (e2) {
          setError('无法加载 PDF: ' + e2.message)
        }
        setLoading(false)
        return
      }

      const raw = window.services.readTextFile(resolvedPath)

      if (detectedType === 'markdown') {
        setHtml(DOMPurify.sanitize(marked.parse(raw)))
      } else if (detectedType === 'json') {
        try {
          setHtml('<pre><code class="language-json">' + escapeHtml(JSON.stringify(JSON.parse(raw), null, 2)) + '</code></pre>')
        } catch {
          setHtml('<pre><code>' + escapeHtml(raw) + '</code></pre>')
        }
      } else {
        setHtml(DOMPurify.sanitize(raw, { ADD_TAGS: ['style'], ADD_ATTR: ['target', 'rel'] }))
      }
      setLoading(false)
    } catch (e) {
      setError('加载失败: ' + e.message); setLoading(false)
    }
  }, [resolvedPath, detectedType, manual?.remoteDownloadUrl, manual?.id])

  useEffect(() => {
    if (detectedType === 'chm' || detectedType === 'mixed') return
    if (loading || !ref.current) return
    ref.current.querySelectorAll('pre code').forEach(block => {
      if (!block.dataset.highlighted) hljs.highlightElement(block)
    })
    if (anchor) {
      const el = ref.current.querySelector('#' + CSS.escape(anchor))
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [loading, html, anchor, detectedType])

  if (detectedType === 'chm' && resolvedPath) {
    if (isRemoteBuiltinPending(manual)) {
      return renderRemoteBuiltinGate()
    }
    return (
      <ChmReader
        chmPath={resolvedPath}
        onBack={goBack}
        manualName={manual?.name || title || 'CHM 手册'}
        initialSearch={quickSearch}
      />
    )
  }

  if (detectedType === 'mixed' && resolvedPath && manual?.entryFile) {
    if (isRemoteBuiltinPending(manual)) {
      return renderRemoteBuiltinGate()
    }
    return (
      <IframeManualReader
        sourcePath={resolvedPath}
        onBack={goBack}
        manualName={manual.name}
        entryFile={manual.entryFile}
      />
    )
  }

  if (detectedType === 'mixed' && resolvedPath) {
    if (isRemoteBuiltinPending(manual)) {
      return renderRemoteBuiltinGate()
    }
    return (
      <DirectoryManualReader
        manualId={manualId}
        sourcePath={resolvedPath}
        title={title || '目录'}
        searchQuery={searchQuery}
        initialKeyword={quickSearch}
      />
    )
  }

  const remotePdfGate = detectedType === 'pdf' && resolvedPath && isRemoteBuiltinPending(manual)

  return (
    <div className="reader-page">
      <div className="reader-header">
        <button className="btn btn-ghost btn-back" onClick={goBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div className="reader-info">
          {manual && <span className="reader-manual-name">{manual.name}</span>}
          {parentTitle && <span className="reader-sep">/</span>}
          {parentTitle && <span className="reader-manual-name">{parentTitle}</span>}
          {title && <span className="reader-sep">/</span>}
          {title && <span className="reader-title">{title}</span>}
        </div>
      </div>
      <div className={'reader-body' + (pdfBytes?.byteLength ? ' reader-body-pdf' : '')} ref={ref}>
        {remotePdfGate && <RemoteBuiltinDownload manual={manual} />}
        {!remotePdfGate && loading && <div className="reader-status">{'加载中…'}</div>}
        {!remotePdfGate && error && <div className="reader-status reader-error">{error}</div>}
        {!remotePdfGate && !loading && !error && pdfBytes?.byteLength > 0 && (
          <Suspense fallback={<div className="reader-status">{'正在加载 PDF 查看器…'}</div>}>
            <PdfJsViewer
              data={pdfBytes}
              initialSearch={quickSearch || searchQuery || ''}
            />
          </Suspense>
        )}
        {!remotePdfGate && !loading && !error && !pdfBytes?.byteLength && (
          <div className="doc-content" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </div>
  )
}
