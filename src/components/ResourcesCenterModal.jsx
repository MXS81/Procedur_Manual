import { useState, useEffect, useCallback } from 'react'
import { useManualContext } from '../store/ManualContext'
import { RESOURCES_CENTER_UI } from '../utils/asciiUiStrings.js'
import './ResourcesCenterModal.css'

export default function ResourcesCenterModal ({ onClose }) {
  const { refreshManuals, notify } = useManualContext()
  const [catalog, setCatalog] = useState([])
  const [selected, setSelected] = useState(() => new Set())
  const [popplerOk, setPopplerOk] = useState(false)
  const [isWin, setIsWin] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [batchBusy, setBatchBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [popplerBusy, setPopplerBusy] = useState(false)

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

  const toggleRow = (id) => {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const ensureRemoteEnabled = (id) => {
    if (typeof window.services?.getRemoteBuiltinEnabledIds !== 'function') return
    const cur = new Set(window.services.getRemoteBuiltinEnabledIds())
    if (!cur.has(id)) {
      cur.add(id)
      window.services.setRemoteBuiltinEnabledIds([...cur])
    }
  }

  const handleSaveSelection = () => {
    setSaveBusy(true)
    try {
      if (typeof window.services?.setRemoteBuiltinEnabledIds !== 'function') {
        throw new Error('setRemoteBuiltinEnabledIds missing')
      }
      window.services.setRemoteBuiltinEnabledIds([...selected])
      refreshManuals()
      reloadCatalog()
      notify(RESOURCES_CENTER_UI.saved, 'success')
    } catch (e) {
      notify(RESOURCES_CENTER_UI.saveFailed + (e?.message || String(e)), 'error')
    } finally {
      setSaveBusy(false)
    }
  }

  const handleDownloadOne = async (id) => {
    if (typeof window.services?.downloadRemoteBuiltinById !== 'function') {
      notify(RESOURCES_CENTER_UI.downloadFail + 'downloadRemoteBuiltinById', 'error')
      return
    }
    setBusyId(id)
    try {
      ensureRemoteEnabled(id)
      await window.services.downloadRemoteBuiltinById(id)
      notify(RESOURCES_CENTER_UI.downloadOk, 'success')
      window.services.initBuiltinManuals()
      refreshManuals()
      reloadCatalog()
    } catch (e) {
      notify(RESOURCES_CENTER_UI.downloadFail + (e?.message || String(e)), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleDownloadSelected = async () => {
    const ids = catalog.filter((c) => selected.has(c.id)).map((c) => c.id)
    if (ids.length === 0) {
      notify(RESOURCES_CENTER_UI.nothingToDownload, 'info')
      return
    }
    if (typeof window.services?.downloadRemoteBuiltinById !== 'function') return
    setBatchBusy(true)
    try {
      for (const id of ids) {
        setBusyId(id)
        ensureRemoteEnabled(id)
        await window.services.downloadRemoteBuiltinById(id)
      }
      notify(RESOURCES_CENTER_UI.batchOk, 'success')
      window.services.initBuiltinManuals()
      refreshManuals()
      reloadCatalog()
    } catch (e) {
      notify(RESOURCES_CENTER_UI.downloadFail + (e?.message || String(e)), 'error')
    } finally {
      setBusyId(null)
      setBatchBusy(false)
    }
  }

  const handleInstallPoppler = async () => {
    if (typeof window.services?.installPopplerWindows !== 'function') return
    setPopplerBusy(true)
    try {
      await window.services.installPopplerWindows()
      notify(RESOURCES_CENTER_UI.popplerDone, 'success')
      setPopplerOk(
        typeof window.services.isPopplerPdftotextAvailable === 'function'
          ? window.services.isPopplerPdftotextAvailable()
          : false
      )
    } catch (e) {
      notify(RESOURCES_CENTER_UI.popplerFail + (e?.message || String(e)), 'error')
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
                    className="btn btn-secondary btn-small"
                    disabled={saveBusy}
                    onClick={handleSaveSelection}
                  >
                    {RESOURCES_CENTER_UI.saveSelection}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    disabled={batchBusy || saveBusy}
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
                        <th>{RESOURCES_CENTER_UI.colStatus}</th>
                        <th>{RESOURCES_CENTER_UI.colAction}</th>
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
                              />
                            </td>
                            <td>
                              <div className="resources-name">{row.name}</div>
                              {row.description ? (
                                <div className="resources-desc">{row.description}</div>
                              ) : null}
                            </td>
                            <td>
                              <span
                                className={
                                  'resources-badge ' +
                                  (row.downloaded ? 'resources-badge-ok' : 'resources-badge-pending')
                                }
                              >
                                {row.downloaded
                                  ? RESOURCES_CENTER_UI.statusDownloaded
                                  : RESOURCES_CENTER_UI.statusNotDownloaded}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-secondary btn-small"
                                disabled={rowBusy || batchBusy}
                                onClick={() => handleDownloadOne(row.id)}
                              >
                                {rowBusy
                                  ? RESOURCES_CENTER_UI.downloading
                                  : row.downloaded
                                    ? RESOURCES_CENTER_UI.downloadAgain
                                    : RESOURCES_CENTER_UI.downloadOne}
                              </button>
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

          <section className="resources-section resources-section-deps">
            <h3 className="resources-section-title">{RESOURCES_CENTER_UI.sectionDeps}</h3>
            <p className="resources-section-hint">{RESOURCES_CENTER_UI.sectionDepsHint}</p>
            <div className="resources-dep-card">
              <div className="resources-dep-head">
                <span className="resources-dep-name">{RESOURCES_CENTER_UI.popplerTitle}</span>
                <span
                  className={
                    'resources-badge ' + (popplerOk ? 'resources-badge-ok' : 'resources-badge-pending')
                  }
                >
                  {popplerOk ? RESOURCES_CENTER_UI.popplerOk : RESOURCES_CENTER_UI.popplerMissing}
                </span>
              </div>
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
