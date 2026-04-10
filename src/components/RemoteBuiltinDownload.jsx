import { useState, useRef, useCallback } from 'react'
import { useManualContext } from '../store/ManualContext'

function formatBytes (n) {
  if (n == null || !Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(2) + ' MB'
}

function phaseLabel (info) {
  if (!info) return ''
  if (info.phase === 'verify') {
    if (info.step === 'companion') return '正在校验索引文件…'
    if (info.step === 'zip') return '正在校验压缩包…'
    return '正在校验文件…'
  }
  if (info.phase === 'extract') return '正在解压（文件较多时可能需数分钟）…'
  if (info.phase === 'download') {
    if (info.step === 'mirror') return '主线路失败，正从 Gitee 备选地址下载…'
    if (info.step === 'companion') return '正在下载索引文件…'
    if (info.step === 'zip') return '正在下载压缩包…'
    return '正在下载…'
  }
  return ''
}

export default function RemoteBuiltinDownload ({ manual, onDone }) {
  const { refreshManuals, notify } = useManualContext()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [progress, setProgress] = useState(null)
  const rafRef = useRef(null)
  const latestProgressRef = useRef(null)

  const scheduleProgress = useCallback((info) => {
    if (info.phase === 'done') {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      latestProgressRef.current = null
      return
    }
    if (info.phase === 'verify' || info.phase === 'extract' || (info.phase === 'download' && info.step === 'mirror')) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      latestProgressRef.current = info
      setProgress(info)
      return
    }
    latestProgressRef.current = info
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const p = latestProgressRef.current
      if (p && p.phase === 'download') setProgress(p)
    })
  }, [])

  const start = async () => {
    const url = manual?.remoteDownloadUrl
    const dest = manual?.rootPath
    if (!url || !dest) return
    setBusy(true)
    setErr(null)
    setProgress(null)
    try {
      if (typeof window.services?.downloadRemoteBuiltinAsset !== 'function') {
        throw new Error('下载接口未就绪')
      }
      await window.services.downloadRemoteBuiltinAsset({
        url,
        urlMirror: manual.remoteDownloadMirrorUrl || undefined,
        destPath: dest,
        sha256: manual.remoteSha256 || undefined,
        archiveFormat: manual.remoteDownloadArchive || undefined,
        entryFile: manual.entryFile || undefined,
        companionUrl: manual.remoteDownloadChwUrl || undefined,
        companionUrlMirror: manual.remoteDownloadChwMirrorUrl || undefined,
        companionSha256: manual.remoteSha256Chw || undefined,
        onProgress: scheduleProgress
      })
      notify('下载完成', 'success')
      refreshManuals()
      onDone?.()
    } catch (e) {
      const msg = e?.message || String(e)
      setErr(msg)
      notify('下载失败: ' + msg, 'error')
    } finally {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      setProgress(null)
      setBusy(false)
    }
  }

  const pct =
    progress && progress.phase === 'download' && progress.total != null && progress.total > 0
      ? Math.min(100, Math.round((100 * (progress.loaded || 0)) / progress.total))
      : null

  return (
    <div className="remote-builtin-gate">
      <p className="remote-builtin-lead">
        {'本条目未打进插件包（减小体积）。请从发布页下载资源后再打开阅读。下载过程中可点击左上角返回；完成后在书库中再次打开即可阅读。'}
      </p>
      {manual?.remoteDownloadUrl && (
        <div className="remote-builtin-url-wrap">
          <code className="remote-builtin-url">{manual.remoteDownloadUrl}</code>
        </div>
      )}
      {progress && progress.phase !== 'done' && (
        <div className="remote-dl-progress-block" aria-live="polite">
          <div className="remote-dl-phase">{phaseLabel(progress)}</div>
          {(progress.phase === 'download' && progress.step !== 'mirror') && (
            <>
              <div className="remote-dl-track">
                {pct != null ? (
                  <div className="remote-dl-fill" style={{ width: pct + '%' }} />
                ) : (
                  <div className="remote-dl-indeterminate" />
                )}
              </div>
              <div className="remote-dl-bytes">
                {formatBytes(progress.loaded)}
                {progress.total != null ? ' / ' + formatBytes(progress.total) : '（未知总大小）'}
                {pct != null ? ' · ' + pct + '%' : ''}
              </div>
            </>
          )}
        </div>
      )}
      <button type="button" className="btn btn-primary remote-builtin-btn" disabled={busy} onClick={start}>
        {busy
          ? (manual?.remoteDownloadArchive === 'zip' ? '下载并解压中…' : '下载中…')
          : (manual?.remoteDownloadArchive === 'zip' ? '开始下载并解压' : '开始下载')}
      </button>
      {err && <div className="reader-status reader-error remote-builtin-err">{err}</div>}
    </div>
  )
}
