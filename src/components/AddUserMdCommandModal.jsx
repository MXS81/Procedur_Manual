import { useState, useEffect, useCallback } from 'react'
import { DIR_MD_ADD_COMMAND_UI as UI } from '../utils/asciiUiStrings.js'
import {
  parseUserMdCommandInput,
  buildCommandStyleMarkdown,
  USER_MD_COMMAND_TEMPLATE
} from '../utils/userMdCommandFormat.js'
import './AddUserMdCommandModal.css'

export default function AddUserMdCommandModal ({
  open,
  onClose,
  sourcePath,
  manualId,
  notify,
  onSaved
}) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setDraft(USER_MD_COMMAND_TEMPLATE)
  }, [open])

  const close = useCallback(() => {
    if (!busy) onClose()
  }, [busy, onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const handleSave = () => {
    const parsed = parseUserMdCommandInput(draft)
    if (!parsed.ok) {
      notify(UI.parseError + parsed.error, 'error')
      return
    }
    if (typeof window.services?.saveNewMarkdownInManualDir !== 'function') {
      notify(UI.needService, 'error')
      return
    }
    const md = buildCommandStyleMarkdown(parsed)
    setBusy(true)
    try {
      window.services.saveNewMarkdownInManualDir(sourcePath, parsed.command, md, manualId)
      notify(
        UI.successSaved + '「' + parsed.command + '.md」' + UI.successTail,
        'success'
      )
      onSaved?.(parsed.command)
      onClose()
    } catch (e) {
      notify(UI.saveError + (e.message || String(e)), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="add-md-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-md-modal-title"
      onClick={close}
    >
      <div className="add-md-modal" onClick={(e) => e.stopPropagation()}>
        <div className="add-md-modal-head">
          <h2 id="add-md-modal-title" className="add-md-modal-title">{UI.modalTitle}</h2>
          <button type="button" className="btn btn-ghost add-md-modal-x" onClick={close} disabled={busy} aria-label={UI.cancel}>
            &times;
          </button>
        </div>
        <p className="add-md-modal-hint">{UI.formatHint}</p>
        <textarea
          className="add-md-modal-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={busy}
          spellCheck={false}
        />
        <div className="add-md-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={close} disabled={busy}>{UI.cancel}</button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={busy}>
            {busy ? UI.saving : UI.save}
          </button>
        </div>
      </div>
    </div>
  )
}
