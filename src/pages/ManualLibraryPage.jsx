import { useState, useEffect, useCallback } from 'react'
import { useManualContext } from '../store/ManualContext'
import ManualCard from '../components/ManualCard'
import ManualCreateDialog from '../components/ManualCreateDialog'
import ResourcesCenterModal from '../components/ResourcesCenterModal'
import { clearIndexCache } from '../modules/search/SearchService'
import { RESOURCES_CENTER_UI } from '../utils/asciiUiStrings.js'
import './ManualLibraryPage.css'

export default function ManualLibraryPage ({ importFilePath }) {
  const { manuals, navigate, removeManuals, notify } = useManualContext()
  const [showResources, setShowResources] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [initPath, setInitPath] = useState('')
  const [editingManual, setEditingManual] = useState(null)
  const [manageMode, setManageMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])

  useEffect(() => {
    if (importFilePath) {
      setInitPath(importFilePath)
      setShowCreate(true)
      setEditingManual(null)
    }
  }, [importFilePath])

  const handleCloseCreate = () => {
    setShowCreate(false)
    setInitPath('')
  }

  const handleOpenCreate = () => {
    setEditingManual(null)
    setShowCreate(true)
  }

  const handleEdit = useCallback((m) => {
    setShowCreate(false)
    setInitPath('')
    setEditingManual(m)
  }, [])

  const handleCloseEdit = () => setEditingManual(null)

  const exitManageMode = () => {
    setManageMode(false)
    setSelectedIds([])
  }

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }, [])

  const selectAll = () => setSelectedIds(manuals.map(m => m.id))
  const selectNone = () => setSelectedIds([])

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) {
      notify('璇峰厛鍕鹃€夎鍒犻櫎鐨勬墜鍐�', 'info')
      return
    }
    const toDelete = manuals.filter(m => selectedIds.includes(m.id))
    const label = toDelete.length <= 3
      ? toDelete.map(m => '"' + m.name + '"').join('銆�')
      : toDelete.length + ' 鏈墜鍐�'
    if (!window.confirm('纭畾鍒犻櫎 ' + label + ' 鍚楋紵\n锛堜笉浼氬垹闄ょ鐩樹笂鐨勫師濮嬫枃浠讹級')) return
    for (const id of selectedIds) {
      clearIndexCache(id)
    }
    removeManuals(selectedIds)
    notify('宸插垹闄� ' + selectedIds.length + ' 鏈墜鍐�')
    exitManageMode()
  }

  return (
    <div className="library-page">
      <header className="library-header">
        <h1 className="library-title">绋嬪簭鍛樻墜鍐�</h1>
        <div className="library-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setShowResources(true)}>
            {RESOURCES_CENTER_UI.openButton}
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('search')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
            鎼滅储
          </button>
          {manuals.length > 0 && (
            <button
              className={'btn ' + (manageMode ? 'btn-primary' : 'btn-secondary')}
              onClick={() => (manageMode ? exitManageMode() : setManageMode(true))}
            >
              {manageMode ? '瀹屾垚' : '绠＄悊'}
            </button>
          )}
          <button className="btn btn-primary" onClick={handleOpenCreate}>
            + 娣诲姞鎵嬪唽
          </button>
        </div>
      </header>

      {manageMode && manuals.length > 0 && (
        <div className="library-batch-bar">
          <span className="library-batch-count">宸查€� {selectedIds.length} / {manuals.length}</span>
          <div className="library-batch-actions">
            <button type="button" className="btn btn-small btn-secondary" onClick={selectAll}>鍏ㄩ€�</button>
            <button type="button" className="btn btn-small btn-secondary" onClick={selectNone}>鍙栨秷鍏ㄩ€�</button>
            <button type="button" className="btn btn-small btn-ghost btn-danger-text" onClick={handleBatchDelete}>
              鍒犻櫎鎵€閫�
            </button>
          </div>
        </div>
      )}

      {manuals.length === 0 ? (
        <div className="library-empty">
          <svg className="empty-icon" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            <line x1="12" y1="8" x2="12" y2="14"/>
            <line x1="9" y1="11" x2="15" y2="11"/>
          </svg>
          <p className="empty-text">鏆傛棤鎵嬪唽</p>
          <p className="empty-hint">鐐瑰嚮 "娣诲姞鎵嬪唽" 瀵煎叆浣犵殑绗竴鏈墜鍐�</p>
        </div>
      ) : (
        <div className="manual-list">
          {manuals.map(m => (
            <ManualCard
              key={m.id}
              manual={m}
              manageMode={manageMode}
              selected={selectedIds.includes(m.id)}
              onToggleSelect={() => toggleSelect(m.id)}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}

      {showCreate && !editingManual && (
        <ManualCreateDialog onClose={handleCloseCreate} initialPath={initPath} />
      )}
      {editingManual && (
        <ManualCreateDialog editManual={editingManual} onClose={handleCloseEdit} />
      )}
      {showResources && (
        <ResourcesCenterModal onClose={() => setShowResources(false)} />
      )}
    </div>
  )
}
