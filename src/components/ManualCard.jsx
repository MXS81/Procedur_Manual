import { useState } from 'react'
import { useManualContext } from '../store/ManualContext'
import { buildManualIndex, clearIndexCache } from '../modules/search/SearchService'
import { getSourceTypeLabel } from '../utils/helpers'
import { MAIN_SEARCH_TOGGLE_LABEL, MAIN_SEARCH_TOGGLE_TITLE } from '../utils/asciiUiStrings.js'
import './ManualCard.css'

const STATUS = {
  pending: { color: 'var(--color-warning)', label: '\u5f85\u7d22\u5f15' },
  building: { color: 'var(--color-primary)', label: '\u6784\u5efa\u4e2d' },
  ready: { color: 'var(--color-success)', label: '\u5c31\u7eea' },
  error: { color: 'var(--color-danger)', label: '\u5f02\u5e38' }
}

export default function ManualCard ({
  manual,
  manageMode = false,
  selected = false,
  onToggleSelect,
  onEdit
}) {
  const { updateManual, navigate, notify } = useManualContext()
  const [rebuilding, setRebuilding] = useState(false)
  const [progress, setProgress] = useState('')
  const st = STATUS[manual.indexStatus] || STATUS.pending

  const toggle = (field) => () => updateManual({ id: manual.id, [field]: !manual[field] })

  const handleRebuild = async () => {
    setRebuilding(true)
    setProgress('\u51c6\u5907\u4e2d...')
    updateManual({ id: manual.id, indexStatus: 'building' })
    try {
      clearIndexCache(manual.id)
      const { docCount } = await buildManualIndex(manual, (p) => {
        if (p.stage === 'decompress') setProgress('\u89e3\u538b\u6587\u4ef6...')
        else if (p.stage === 'index') {
          if (manual.sourceType === 'pdf') {
            setProgress(
              `\u89e3\u6790 PDF ${p.current}/${p.total} \u9875 (${p.docCount} \u6761)`
            )
          } else {
            setProgress(
              `\u7d22\u5f15 ${p.current}/${p.total} \u6587\u4ef6 (${p.docCount} \u6761)`
            )
          }
        } else if (p.stage === 'save') setProgress('\u4fdd\u5b58\u7d22\u5f15...')
      })
      updateManual({ id: manual.id, indexStatus: 'ready', docCount, indexVersion: (manual.indexVersion || 0) + 1 })
      notify('\u7d22\u5f15\u91cd\u5efa\u6210\u529f\uff0c\u5171 ' + docCount + ' \u6761', 'success')
    } catch (e) {
      updateManual({ id: manual.id, indexStatus: 'error' })
      notify('\u7d22\u5f15\u91cd\u5efa\u5931\u8d25: ' + e.message, 'error')
    } finally { setRebuilding(false); setProgress('') }
  }

  const handleOpen = () => {
    navigate('reader', {
      manualId: manual.id,
      sourcePath: manual.rootPath,
      sourceType: manual.sourceType
    })
  }

  const handleMainClick = () => {
    if (manageMode) onToggleSelect?.()
    else handleOpen()
  }

  return (
    <div className={'card' + (manual.enabled ? '' : ' card-disabled') + (manageMode && selected ? ' card-selected' : '')}>
      <div className="card-main" onClick={handleMainClick}>
        {manageMode && (
          <input
            type="checkbox"
            className="card-select-checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.()}
            onClick={e => e.stopPropagation()}
          />
        )}
        <div className="card-icon">{getSourceTypeLabel(manual.sourceType)[0]}</div>
        <div className="card-body">
          <div className="card-name">{manual.name}</div>
          {manual.description && <div className="card-desc">{manual.description}</div>}
          <div className="card-meta">
            <span className="card-type-badge">{getSourceTypeLabel(manual.sourceType)}</span>
            {manual.keywords?.map(k => <span key={k} className="card-kw">{k}</span>)}
            <span className="card-status" style={{ color: st.color }}>
              {st.label}{manual.docCount > 0 ? ' (' + manual.docCount + ')' : ''}
            </span>
          </div>
        </div>
      </div>

      <div className="card-actions">
        <label className="card-toggle" title={'\u542f\u7528/\u505c\u7528\u624b\u518c'}>
          <input type="checkbox" checked={manual.enabled} onChange={toggle('enabled')} />
          <span>{'\u542f\u7528'}</span>
        </label>
        <label className="card-toggle" title={MAIN_SEARCH_TOGGLE_TITLE}>
          <input
            type="checkbox"
            checked={manual.searchEntryEnabled !== false}
            onChange={() =>
              updateManual({
                id: manual.id,
                searchEntryEnabled: manual.searchEntryEnabled === false
              })}
          />
          <span>{MAIN_SEARCH_TOGGLE_LABEL}</span>
        </label>
        <button className="btn btn-small btn-ghost" onClick={handleRebuild} disabled={rebuilding}>
          {rebuilding ? (progress || '...') : '\u7d22\u5f15'}
        </button>
        {onEdit && !manageMode && (
          <button className="btn btn-small btn-ghost" onClick={() => onEdit(manual)}>
            {'\u7f16\u8f91'}
          </button>
        )}
      </div>
    </div>
  )
}
