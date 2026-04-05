import { useState, useEffect } from 'react'
import { useManualContext } from '../store/ManualContext'
import { createManual, detectSourceType, SOURCE_TYPES } from '../models'
import { buildManualIndex, clearIndexCache } from '../modules/search/SearchService'
import './ManualCreateDialog.css'

function parseKeywords (raw) {
  return String(raw || '').split(/[,，]/).map(k => k.trim()).filter(Boolean)
}

export default function ManualCreateDialog ({ onClose, initialPath = '', editManual = null }) {
  const { addManual, updateManual, notify } = useManualContext()
  const [name, setName] = useState('')
  const [keywords, setKeywords] = useState('')
  const [description, setDescription] = useState('')
  const [rootPath, setRootPath] = useState(initialPath)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [importHint, setImportHint] = useState('')

  useEffect(() => {
    if (editManual) {
      setName(editManual.name || '')
      setKeywords(Array.isArray(editManual.keywords) ? editManual.keywords.join(', ') : String(editManual.keywords || ''))
      setDescription(editManual.description || '')
      setRootPath(editManual.rootPath || '')
      setErrors({})
      setImportHint('')
      return
    }
    setName('')
    setKeywords('')
    setDescription('')
    setRootPath(initialPath || '')
    setErrors({})
    setImportHint('')
  }, [editManual, initialPath])

  const applyPickedPath = (picked) => {
    if (!picked) return
    setRootPath(picked)
    setImportHint('')
    if (!name) {
      const info = window.services.pathInfo(picked)
      setName(info.isDir ? pathBasename(picked) : info.name)
    }
    const info = window.services.pathInfo(picked)
    if (info.isDir) {
      try {
        const sug = window.services.suggestBundledHtmlEntry(picked)
        if (sug.entryFile) {
          setImportHint(`已识别为离线 HTML 文档包（入口 ${sug.entryFile}），将用安全阅读模式打开，避免中文乱码。`)
        }
      } catch { /* ignore */ }
    }
  }

  /** uTools 下 openFile 与 openDirectory 不可混在同一对话框，否则常只能选目录 */
  const browseFile = () => {
    const files = window.utools.showOpenDialog({
      title: '选择手册文件',
      properties: ['openFile'],
      filters: [
        { name: '手册', extensions: ['html', 'htm', 'md', 'markdown', 'json', 'pdf', 'chm'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    if (files?.[0]) applyPickedPath(files[0])
  }

  const browseFolder = () => {
    const files = window.utools.showOpenDialog({
      title: '选择手册文件夹（离线 HTML 文档包）',
      properties: ['openDirectory']
    })
    if (files?.[0]) applyPickedPath(files[0])
  }

  function pathBasename (p) {
    const s = p.replace(/[/\\]+$/, '')
    const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'))
    return i >= 0 ? s.slice(i + 1) : s
  }

  const validate = () => {
    const e = {}
    if (!name.trim()) e.name = '请输入名称'
    if (!keywords.trim()) e.keywords = '请输入关键词'
    if (!rootPath.trim()) e.rootPath = '请输入路径'
    else {
      const info = window.services.pathInfo(rootPath.trim())
      if (!info.exists) e.rootPath = '路径不存在'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const resolveSourceMeta = (trimmedPath) => {
    const info = window.services.pathInfo(trimmedPath)
    const st = info.isFile ? (detectSourceType(info.ext) || SOURCE_TYPES.HTML) : SOURCE_TYPES.MIXED
    let entryFile = null
    if (info.isDir) {
      try {
        const sug = window.services.suggestBundledHtmlEntry(trimmedPath)
        entryFile = sug.entryFile || null
      } catch { /* ignore */ }
    }
    return { sourceType: st, entryFile }
  }

  const saveEdit = async () => {
    if (!validate()) return
    setSaving(true)
    const trimmedPath = rootPath.trim()
    const kw = parseKeywords(keywords)
    const desc = description.trim()
    const pathChanged = trimmedPath !== (editManual.rootPath || '').trim()

    try {
      if (!pathChanged) {
        updateManual({
          id: editManual.id,
          name: name.trim(),
          keywords: kw,
          description: desc,
          rootPath: trimmedPath
        })
        notify('已保存手册信息', 'success')
        onClose()
        return
      }

      const { sourceType, entryFile } = resolveSourceMeta(trimmedPath)
      clearIndexCache(editManual.id)
      updateManual({
        id: editManual.id,
        name: name.trim(),
        keywords: kw,
        description: desc,
        rootPath: trimmedPath,
        sourceType,
        entryFile,
        indexStatus: 'building'
      })

      const manualForIndex = {
        ...editManual,
        name: name.trim(),
        keywords: kw,
        description: desc,
        rootPath: trimmedPath,
        sourceType,
        entryFile
      }
      try {
        const { docCount } = await buildManualIndex(manualForIndex)
        updateManual({
          id: editManual.id,
          indexStatus: 'ready',
          docCount,
          indexVersion: (editManual.indexVersion || 0) + 1
        })
        notify('路径已更新，索引重建完成，共 ' + docCount + ' 个条目', 'success')
      } catch (err) {
        updateManual({ id: editManual.id, indexStatus: 'error' })
        notify('索引构建失败: ' + err.message, 'error')
      }
      onClose()
    } catch (err) {
      notify('保存失败: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const saveCreate = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const trimmedPath = rootPath.trim()
      const { sourceType, entryFile } = resolveSourceMeta(trimmedPath)
      const manual = createManual({
        id: window.services.generateId(),
        name: name.trim(),
        keywords: parseKeywords(keywords),
        description: description.trim(),
        rootPath: trimmedPath,
        sourceType,
        entryFile
      })
      manual.indexStatus = 'building'
      addManual(manual)

      try {
        const { docCount } = await buildManualIndex(manual)
        updateManual({ id: manual.id, indexStatus: 'ready', docCount, indexVersion: 1 })
        notify('手册"' + manual.name + '"导入成功，索引了 ' + docCount + ' 个条目', 'success')
      } catch (err) {
        updateManual({ id: manual.id, indexStatus: 'error' })
        notify('索引构建失败: ' + err.message, 'error')
      }
      onClose()
    } catch (err) {
      notify('保存失败: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const save = () => (editManual ? saveEdit() : saveCreate())

  const isEdit = Boolean(editManual)

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-shell" onClick={e => e.stopPropagation()}>
      <div className="dialog">
        <div className="dialog-scroll">
        <h2 className="dialog-title">{isEdit ? '编辑手册' : '添加手册'}</h2>

        <div className="form-group">
          <label className="form-label">名称</label>
          <input className={'form-input' + (errors.name ? ' form-input-error' : '')}
            value={name} onChange={e => setName(e.target.value)}
            placeholder="如：Linux 命令手册" autoFocus />
          {errors.name && <span className="form-error">{errors.name}</span>}
        </div>

        <div className="form-group">
          <label className="form-label">关键词</label>
          <input className={'form-input' + (errors.keywords ? ' form-input-error' : '')}
            value={keywords} onChange={e => setKeywords(e.target.value)}
            placeholder="用逗号分隔，如：linux, shell, 命令" />
          <span className="form-hint">便于在 uTools 主输入框搜索</span>
          {errors.keywords && <span className="form-error">{errors.keywords}</span>}
        </div>

        <div className="form-group">
          <label className="form-label">说明</label>
          <textarea className="form-input form-textarea"
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder="手册的简要描述" rows={3} />
        </div>

        <div className="form-group">
          <label className="form-label">路径</label>
          <div className="form-row form-row-path">
            <input className={'form-input form-input-flex' + (errors.rootPath ? ' form-input-error' : '')}
              value={rootPath} onChange={e => { setRootPath(e.target.value); setImportHint('') }}
              placeholder="手册文件或文件夹的绝对路径（文件夹支持离线 HTML 文档包）" />
            <div className="form-browse-actions">
              <button className="btn btn-secondary" onClick={browseFile} type="button">选文件</button>
              <button className="btn btn-secondary" onClick={browseFolder} type="button">选文件夹</button>
            </div>
          </div>
          <span className="form-hint">单文件用「选文件」；多页离线 HTML 整包用「选文件夹」</span>
          {isEdit && <span className="form-hint" style={{ display: 'block', marginTop: 6 }}>若修改路径，保存后将自动重建搜索索引。</span>}
          {/\.pdf$/i.test(rootPath.trim()) && (
            <span className="form-hint" style={{ display: 'block', marginTop: 6 }}>
              PDF 会按页解析并建立全文索引（可能需数秒）。若解析失败，可安装 Poppler 并将 pdftotext 加入 PATH 作为兜底：
              {' '}
              <a href="https://github.com/oschwartz10612/poppler-windows/releases/" target="_blank" rel="noreferrer">poppler-windows 发布页</a>
            </span>
          )}
          {importHint && <span className="form-hint" style={{ display: 'block', marginTop: 6 }}>{importHint}</span>}
          {errors.rootPath && <span className="form-error">{errors.rootPath}</span>}
        </div>

        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>取消</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
        </div>
      </div>
      </div>
    </div>
  )
}
