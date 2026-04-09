import { useState } from 'react'
import { useManualContext } from '../store/ManualContext'

export default function RemoteBuiltinDownload ({ manual, onDone }) {
  const { refreshManuals, notify } = useManualContext()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const start = async () => {
    const url = manual?.remoteDownloadUrl
    const dest = manual?.rootPath
    if (!url || !dest) return
    setBusy(true)
    setErr(null)
    try {
      if (typeof window.services?.downloadRemoteBuiltinAsset !== 'function') {
        throw new Error('\u4e0b\u8f7d\u63a5\u53e3\u672a\u5c31\u7eea')
      }
      await window.services.downloadRemoteBuiltinAsset({
        url,
        destPath: dest,
        sha256: manual.remoteSha256 || undefined,
        archiveFormat: manual.remoteDownloadArchive || undefined,
        entryFile: manual.entryFile || undefined,
        companionUrl: manual.remoteDownloadChwUrl || undefined,
        companionSha256: manual.remoteSha256Chw || undefined
      })
      notify('\u4e0b\u8f7d\u5b8c\u6210', 'success')
      refreshManuals()
      onDone?.()
    } catch (e) {
      const msg = e?.message || String(e)
      setErr(msg)
      notify('\u4e0b\u8f7d\u5931\u8d25: ' + msg, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="remote-builtin-gate">
      <p className="remote-builtin-lead">
        {'\u672c\u6761\u76ee\u672a\u6253\u8fdb\u63d2\u4ef6\u5305\uff08\u51cf\u5c0f\u4f53\u79ef\uff09\u3002\u8bf7\u4ece\u53d1\u5e03\u9875\u4e0b\u8f7d\u8d44\u6e90\u540e\u518d\u6253\u5f00\u9605\u8bfb\u3002'}
      </p>
      {manual?.remoteDownloadUrl && (
        <div className="remote-builtin-url-wrap">
          <code className="remote-builtin-url">{manual.remoteDownloadUrl}</code>
        </div>
      )}
      <button type="button" className="btn btn-primary remote-builtin-btn" disabled={busy} onClick={start}>
        {busy
          ? (manual?.remoteDownloadArchive === 'zip' ? '\u4e0b\u8f7d\u5e76\u89e3\u538b\u4e2d\u2026' : '\u4e0b\u8f7d\u4e2d\u2026')
          : (manual?.remoteDownloadArchive === 'zip' ? '\u5f00\u59cb\u4e0b\u8f7d\u5e76\u89e3\u538b' : '\u5f00\u59cb\u4e0b\u8f7d')}
      </button>
      {err && <div className="reader-status reader-error remote-builtin-err">{err}</div>}
    </div>
  )
}
