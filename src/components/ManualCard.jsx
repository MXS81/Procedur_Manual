import { useState } from 'react'
import { useManualContext } from '../store/ManualContext'
import { buildManualIndex, clearIndexCache } from '../modules/search/SearchService'
import { getSourceTypeLabel } from '../utils/helpers'
import { isRemoteBuiltinPending } from '../utils/manualRemote'
import {
  MAIN_SEARCH_TOGGLE_LABEL,
  MAIN_SEARCH_TOGGLE_TITLE
} from '../utils/asciiUiStrings.js'
import './ManualCard.css'

const STATUS = {
  pending: { color: 'var(--color-warning)', label: '待索引' },
  building: { color: 'var(--color-primary)', label: '构建中' },
  ready: { color: 'var(--color-success)', label: '就绪' },
  error: { color: 'var(--color-danger)', label: '异常' }
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
  const remotePending = isRemoteBuiltinPending(manual)

  const toggle = (field) => () => updateManual({ id: manual.id, [field]: !manual[field] })

  const handleRebuild = async () => {
    if (remotePending) return
    setRebuilding(true)
    setProgress('准备中...')
    updateManual({ id: manual.id, indexStatus: 'building' })
    try {
      clearIndexCache(manual.id)
      const { docCount } = await buildManualIndex(manual, (p) => {
        if (p.stage === 'decompress') setProgress('解压文件...')
        else if (p.stage === 'index') {
          if (manual.sourceType === 'pdf') {
            setProgress(
              `解析 PDF ${p.current}/${p.total} 页 (${p.docCount} 条)`
            )
          } else {
            setProgress(
              `索引 ${p.current}/${p.total} 文件 (${p.docCount} 条)`
            )
          }
        } else if (p.stage === 'save') setProgress('保存索引...')
      })
      updateManual({ id: manual.id, indexStatus: 'ready', docCount, indexVersion: (manual.indexVersion || 0) + 1 })
      notify('索引重建成功，共 ' + docCount + ' 条', 'success')
    } catch (e) {
      updateManual({ id: manual.id, indexStatus: 'error' })
      notify('索引重建失败: ' + e.message, 'error')
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
          <div className="card-name-row">
            <div className="card-name">{manual.name}</div>
            {remotePending && (
              <span className="card-remote-badge" title={'需先下载资源文件'}>
                {'需下载'}
              </span>
            )}
          </div>
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
        <label className="card-toggle" title={'启用/停用手册'}>
          <input type="checkbox" checked={manual.enabled} onChange={toggle('enabled')} />
          <span>{'启用'}</span>
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
        <button
          className="btn btn-small btn-ghost"
          onClick={handleRebuild}
          disabled={rebuilding || remotePending}
          title={remotePending ? '请先在阅读页下载资源后再索引' : undefined}
        >
          {rebuilding ? (progress || '...') : '索引'}
        </button>
        {onEdit && !manageMode && (
          <button className="btn btn-small btn-ghost" onClick={() => onEdit(manual)}>
            {'编辑'}
          </button>
        )}
      </div>
    </div>
  )
}
