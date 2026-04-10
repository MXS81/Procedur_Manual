import { useState, useEffect, useCallback, useRef } from 'react'
import { useManualContext } from '../store/ManualContext'
import { RESOURCES_CENTER_UI } from '../utils/asciiUiStrings.js'
import './ResourcesCenterModal.css'

const RING_R = 15
const RING_C = 2 * Math.PI * RING_R

function ResourceDownloadRing ({
  rowId,
  downloaded,
  busy,
  batchBusy,
  busyId,
  progress,
  onActivate
}) {
  const otherBusy = busyId !== null && busyId !== rowId
  const disabled = otherBusy || (batchBusy && busyId !== rowId)
  const p = busy && progress && progress.id === rowId ? progress : null
  let ratio = 0
  if (!busy && downloaded) {
    ratio = 1
  } else if (p) {
    if (p.total > 0) {
      ratio = Math.min(1, p.loaded / p.total)
    } else if (p.loaded > 0) {
      ratio = 0.15
    }
  }
  const dashOffset = RING_C * (1 - ratio)
  const label = busy
    ? RESOURCES_CENTER_UI.ariaPause
    : downloaded
      ? RESOURCES_CENTER_UI.ariaRedownload
      : RESOURCES_CENTER_UI.ariaDownload

  return (
    <button
      type="button"
      className={
        'resources-dl-ring' +
        (busy ? ' resources-dl-ring-busy' : '') +
        (downloaded && !busy ? ' resources-dl-ring-downloaded' : '') +
        (busy && ratio >= 1 ? ' resources-dl-ring-complete' : '')
      }
      disabled={disabled}
      aria-label={label}
      onClick={() => onActivate(rowId)}
    >
      <svg className="resources-dl-ring-svg" viewBox="0 0 36 36" aria-hidden>
        <circle className="resources-dl-ring-track" cx="18" cy="18" r={RING_R} />
        <circle
          className="resources-dl-ring-progress"
          cx="18"
          cy="18"
          r={RING_R}
          strokeDasharray={RING_C}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 18 18)"
        />
      </svg>
      <span className="resources-dl-ring-icon" aria-hidden>
        {busy ? (
          <svg viewBox="0 0 24 24" width="13" height="13">
            <rect x="5" y="5" width="4" height="14" rx="1" fill="currentColor" />
            <rect x="15" y="5" width="4" height="14" rx="1" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path
              fill="currentColor"
              d="M11 4h2v10.17l2.59-2.58L17 13l-5 5-5-5 1.41-1.41L11 14.17V4zm-6 16h14v2H5v-2z"
            />
          </svg>
        )}
      </span>
    </button>
  )
}

export default function ResourcesCenterModal ({ onClose }) {
  const { refreshManuals } = useManualContext()
  const [catalog, setCatalog] = useState([])
  const [selected, setSelected] = useState(() => new Set())
  const [popplerOk, setPopplerOk] = useState(false)
  const [isWin, setIsWin] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [batchBusy, setBatchBusy] = useState(false)
  const [popplerBusy, setPopplerBusy] = useState(false)
  const [dlProgress, setDlProgress] = useState(null)
  const [inlineMsg, setInlineMsg] = useState(null)
  const inlineMsgTimerRef = useRef(null)

  const showModalMessage = useCallback((text, kind = 'info') => {
    if (inlineMsgTimerRef.current) {
      clearTimeout(inlineMsgTimerRef.current)
      inlineMsgTimerRef.current = null
    }
    setInlineMsg({ text, kind })
    inlineMsgTimerRef.current = setTimeout(() => {
      setInlineMsg(null)
      inlineMsgTimerRef.current = null
    }, 4800)
  }, [])

  useEffect(() => {
    return () => {
      if (inlineMsgTimerRef.current) clearTimeout(inlineMsgTimerRef.current)
    }
  }, [])

  const reloadCatalog = useCallback(() => {
    const list = typeof window.services?.getBuiltinRemoteResourceCatalog === 'function'
      ? window.services.getBuiltinRemoteResourceCatalog()
      : []
    setCatalog(Array.isArray(list) ? list : [])
    const enabledIds = list.filter((i) => i.enabled).map((i) => i.id)
    setSelected(new Set(enabledIds))
    setPopplerOk(
      typeof window.services?.isPopplerPdftotextAvailable === 'function'
        ? window.services.isPopplerPdftotextAvailable()
        : false
    )
    setIsWin(
      typeof window.services?.getRuntimePlatform === 'function'
        ? window.services.getRuntimePlatform() === 'win32'
        : false
    )
  }, [])

  useEffect(() => {
    reloadCatalog()
  }, [reloadCatalog])

  const persistSelection = useCallback(
    (nextSet) => {
      if (typeof window.services?.setRemoteBuiltinEnabledIds !== 'function') {
        throw new Error('setRemoteBuiltinEnabledIds missing')
      }
      window.services.setRemoteBuiltinEnabledIds([...nextSet])
      refreshManuals()
      reloadCatalog()
    },
    [refreshManuals, reloadCatalog]
  )

  const toggleRow = (id) => {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      queueMicrotask(() => {
        try {
          persistSelection(n)
        } catch (e) {
          showModalMessage(RESOURCES_CENTER_UI.persistFail + (e?.message || String(e)), 'error')
          reloadCatalog()
        }
      })
      return n
    })
  }

  const ensureRemoteEnabled = useCallback(
    (id) => {
      if (typeof window.services?.getRemoteBuiltinEnabledIds !== 'function') return
      const cur = new Set(window.services.getRemoteBuiltinEnabledIds())
      if (!cur.has(id)) {
        cur.add(id)
        try {
          persistSelection(cur)
        } catch (e) {
          showModalMessage(RESOURCES_CENTER_UI.persistFail + (e?.message || String(e)), 'error')
        }
      }
    },
    [persistSelection, showModalMessage]
  )

  const runDownload = useCallback(
    async (id, force) => {
      if (typeof window.services?.downloadRemoteBuiltinById !== 'function') {
        showModalMessage(RESOURCES_CENTER_UI.downloadFail + 'downloadRemoteBuiltinById', 'error')
        return
      }
      setBusyId(id)
      setDlProgress({ id, loaded: 0, total: null })
      try {
        ensureRemoteEnabled(id)
        await window.services.downloadRemoteBuiltinById(id, {
          force: !!force,
          onProgress: (info) => {
            if (info?.phase === 'done') {
              setDlProgress({ id, loaded: 1, total: 1 })
              return
            }
            if (info?.phase === 'download' && typeof info.loaded === 'number') {
              setDlProgress({
                id,
                loaded: info.loaded,
                total: info.total != null ? info.total : null
              })
            }
          }
        })
        showModalMessage(RESOURCES_CENTER_UI.downloadOk, 'success')
        window.services.initBuiltinManuals()
        refreshManuals()
        reloadCatalog()
      } catch (e) {
        if (e && e.code === 'PM_PAUSED') {
          showModalMessage(RESOURCES_CENTER_UI.downloadPaused, 'info')
        } else if (e && e.code !== 'PM_BUSY') {
          showModalMessage(RESOURCES_CENTER_UI.downloadFail + (e?.message || String(e)), 'error')
        }
      } finally {
        setBusyId(null)
        setDlProgress(null)
      }
    },
    [ensureRemoteEnabled, refreshManuals, reloadCatalog, showModalMessage]
  )

  const handleRingActivate = (id) => {
    if (busyId === id) {
      if (typeof window.services?.pauseRemoteBuiltinDownload === 'function') {
        window.services.pauseRemoteBuiltinDownload(id)
      }
      return
    }
    const row = catalog.find((r) => r.id === id)
    runDownload(id, !!row?.downloaded)
  }

  const handleDownloadSelected = async () => {
    const ids = catalog.filter((c) => selected.has(c.id)).map((c) => c.id)
    if (ids.length === 0) {
      showModalMessage(RESOURCES_CENTER_UI.nothingToDownload, 'info')
      return
    }
    if (typeof window.services?.downloadRemoteBuiltinById !== 'function') return
    setBatchBusy(true)
    let batchStopped = false
    try {
      for (const id of ids) {
        const row = catalog.find((c) => c.id === id)
        setBusyId(id)
        setDlProgress({ id, loaded: 0, total: null })
        try {
          ensureRemoteEnabled(id)
          await window.services.downloadRemoteBuiltinById(id, {
            force: !!row?.downloaded,
            onProgress: (info) => {
              if (info?.phase === 'done') {
                setDlProgress({ id, loaded: 1, total: 1 })
                return
              }
              if (info?.phase === 'download' && typeof info.loaded === 'number') {
                setDlProgress({
                  id,
                  loaded: info.loaded,
                  total: info.total != null ? info.total : null
                })
              }
            }
          })
        } catch (e) {
          if (e && e.code === 'PM_PAUSED') {
            showModalMessage(RESOURCES_CENTER_UI.downloadPaused, 'info')
            batchStopped = true
            break
          }
          if (e && e.code !== 'PM_BUSY') {
            showModalMessage(RESOURCES_CENTER_UI.downloadFail + (e?.message || String(e)), 'error')
            batchStopped = true
            break
          }
        }
      }
      if (!batchStopped) {
        showModalMessage(RESOURCES_CENTER_UI.batchOk, 'success')
      }
      window.services.initBuiltinManuals()
      refreshManuals()
      reloadCatalog()
    } finally {
      setBusyId(null)
      setDlProgress(null)
      setBatchBusy(false)
    }
  }

  const handleInstallPoppler = async () => {
    if (typeof window.services?.installPopplerWindows !== 'function') return
    setPopplerBusy(true)
    try {
      await window.services.installPopplerWindows()
      showModalMessage(RESOURCES_CENTER_UI.popplerDone, 'success')
      setPopplerOk(
        typeof window.services.isPopplerPdftotextAvailable === 'function'
          ? window.services.isPopplerPdftotextAvailable()
          : false
      )
    } catch (e) {
      showModalMessage(RESOURCES_CENTER_UI.popplerFail + (e?.message || String(e)), 'error')
    } finally {
      setPopplerBusy(false)
    }
  }

  return (
    <div className="resources-overlay" role="presentation" onClick={onClose}>
      <div
        className="resources-modal"
        role="dialog"
        aria-labelledby="resources-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="resources-modal-header">
          <h2 id="resources-modal-title" className="resources-modal-title">
            {RESOURCES_CENTER_UI.title}
          </h2>
          <button type="button" className="btn btn-ghost resources-close" onClick={onClose}>
            {RESOURCES_CENTER_UI.close}
          </button>
        </header>

        {inlineMsg ? (
          <div
            className={'resources-inline-msg resources-inline-msg-' + inlineMsg.kind}
            role="status"
            aria-live="polite"
          >
            {inlineMsg.text}
          </div>
        ) : null}

        <div className="resources-body">
          <section className="resources-section">
            <h3 className="resources-section-title">{RESOURCES_CENTER_UI.sectionReleases}</h3>
            <p className="resources-section-hint">{RESOURCES_CENTER_UI.sectionReleasesHint}</p>
            {catalog.length === 0 ? (
              <p className="resources-empty">{RESOURCES_CENTER_UI.emptyCatalog}</p>
            ) : (
              <>
                <div className="resources-toolbar">
                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    disabled={batchBusy}
                    onClick={handleDownloadSelected}
                  >
                    {RESOURCES_CENTER_UI.downloadSelected}
                  </button>
                </div>
                <div className="resources-table-wrap">
                  <table className="resources-table">
                    <thead>
                      <tr>
                        <th className="resources-th-check" aria-label="select" />
                        <th>{RESOURCES_CENTER_UI.colName}</th>
                        <th className="resources-th-action">{RESOURCES_CENTER_UI.colAction}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catalog.map((row) => {
                        const rowBusy = busyId === row.id
                        return (
                          <tr key={row.id}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selected.has(row.id)}
                                onChange={() => toggleRow(row.id)}
                                disabled={batchBusy}
                              />
                            </td>
                            <td>
                              <div className="resources-name">{row.name}</div>
                              {row.description ? (
                                <div className="resources-desc">{row.description}</div>
                              ) : null}
                            </td>
                            <td className="resources-td-action">
                              <ResourceDownloadRing
                                rowId={row.id}
                                downloaded={row.downloaded}
                                busy={rowBusy}
                                batchBusy={batchBusy}
                                busyId={busyId}
                                progress={dlProgress}
                                onActivate={handleRingActivate}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section className="resources-section resources-section-plugins">
            <h3 className="resources-section-title">{RESOURCES_CENTER_UI.sectionPlugins}</h3>
            <p className="resources-section-hint">{RESOURCES_CENTER_UI.sectionPluginsHint}</p>
            <div className="resources-dep-card">
              <div className="resources-dep-name">{RESOURCES_CENTER_UI.popplerTitle}</div>
              <p className="resources-dep-line">
                {popplerOk ? RESOURCES_CENTER_UI.popplerOk : RESOURCES_CENTER_UI.popplerMissing}
              </p>
              {isWin ? (
                <button
                  type="button"
                  className="btn btn-primary btn-small resources-dep-btn"
                  disabled={popplerBusy}
                  onClick={handleInstallPoppler}
                >
                  {popplerBusy ? RESOURCES_CENTER_UI.popplerInstalling : RESOURCES_CENTER_UI.popplerInstall}
                </button>
              ) : (
                <p className="resources-dep-note">{RESOURCES_CENTER_UI.popplerWinOnly}</p>
              )}
            </div>
            <p className="resources-deps-footer">{RESOURCES_CENTER_UI.depsMoreLater}</p>
          </section>
        </div>
      </div>
    </div>
  )
}
