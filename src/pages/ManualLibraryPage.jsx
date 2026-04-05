import { useState, useEffect, useCallback } from 'react'
import { useManualContext } from '../store/ManualContext'
import ManualCard from '../components/ManualCard'
import ManualCreateDialog from '../components/ManualCreateDialog'
import { clearIndexCache } from '../modules/search/SearchService'
import './ManualLibraryPage.css'

export default function ManualLibraryPage ({ importFilePath }) {
  const { manuals, navigate, removeManuals, notify } = useManualContext()
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
      notify('请先勾选要删除的手册', 'info')
      return
    }
    const toDelete = manuals.filter(m => selectedIds.includes(m.id))
    const label = toDelete.length <= 3
      ? toDelete.map(m => '"' + m.name + '"').join('、')
      : toDelete.length + ' 本手册'
    if (!window.confirm('确定删除 ' + label + ' 吗？\n（不会删除磁盘上的原始文件）')) return
    for (const id of selectedIds) {
      clearIndexCache(id)
    }
    removeManuals(selectedIds)
    notify('已删除 ' + selectedIds.length + ' 本手册')
    exitManageMode()
  }

  return (
    <div className="library-page">
      <header className="library-header">
        <h1 className="library-title">程序员手册</h1>
        <div className="library-actions">
          <button className="btn btn-secondary" onClick={() => navigate('search')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
            搜索
          </button>
          {manuals.length > 0 && (
            <button
              className={'btn ' + (manageMode ? 'btn-primary' : 'btn-secondary')}
              onClick={() => (manageMode ? exitManageMode() : setManageMode(true))}
            >
              {manageMode ? '完成' : '管理'}
            </button>
          )}
          <button className="btn btn-primary" onClick={handleOpenCreate}>
            + 添加手册
          </button>
        </div>
      </header>

      {manageMode && manuals.length > 0 && (
        <div className="library-batch-bar">
          <span className="library-batch-count">已选 {selectedIds.length} / {manuals.length}</span>
          <div className="library-batch-actions">
            <button type="button" className="btn btn-small btn-secondary" onClick={selectAll}>全选</button>
            <button type="button" className="btn btn-small btn-secondary" onClick={selectNone}>取消全选</button>
            <button type="button" className="btn btn-small btn-ghost btn-danger-text" onClick={handleBatchDelete}>
              删除所选
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
          <p className="empty-text">暂无手册</p>
          <p className="empty-hint">点击 "添加手册" 导入你的第一本手册</p>
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
    </div>
  )
}
