import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CONTEXT_MENU_LABELS } from '../utils/asciiUiStrings.js'
import {
  getEditableTarget,
  getSelectedTextInField,
  documentSelectionTextInView,
  computeContextMenuFlags,
  clampMenuPos,
  setNativeValueAndNotify
} from '../utils/contextMenuCore.js'
import { subscribeContextMenuOpens } from '../utils/contextMenuBridge.js'
import './ContextMenuHost.css'

const L = CONTEXT_MENU_LABELS

export default function ContextMenuHost () {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [flags, setFlags] = useState({
    canCopy: false,
    canCut: false,
    canPaste: false,
    canSelectAll: true
  })
  const targetRef = useRef(null)
  const viewRef = useRef(typeof window !== 'undefined' ? window : null)

  const close = useCallback(() => setOpen(false), [])

  const openMenu = useCallback((detail) => {
    targetRef.current = detail.target
    viewRef.current = detail.view
    setFlags(computeContextMenuFlags(detail.target, detail.view))
    setPos(clampMenuPos(detail.menuX, detail.menuY))
    setOpen(true)
  }, [])

  useEffect(() => {
    const unsubBridge = subscribeContextMenuOpens(openMenu)
    const onContextMenu = (e) => {
      const t = e.target
      if (t?.closest?.('.ctx-menu-host')) return
      e.preventDefault()
      e.stopPropagation()
      openMenu({
        view: window,
        target: t,
        menuX: e.clientX,
        menuY: e.clientY
      })
    }
    const dismiss = () => setOpen(false)
    document.addEventListener('contextmenu', onContextMenu, true)
    window.addEventListener('blur', dismiss)
    document.addEventListener('scroll', dismiss, true)
    return () => {
      unsubBridge()
      document.removeEventListener('contextmenu', onContextMenu, true)
      window.removeEventListener('blur', dismiss)
      document.removeEventListener('scroll', dismiss, true)
    }
  }, [openMenu])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const doCopy = useCallback(async () => {
    const view = viewRef.current
    const t = targetRef.current
    if (!view) {
      close()
      return
    }
    const field = getEditableTarget(t)
    try {
      if (field) {
        field.focus()
        const selText = getSelectedTextInField(field, view)
        if (selText) {
          await navigator.clipboard.writeText(selText)
          close()
          return
        }
      }
      const doc = documentSelectionTextInView(view)
      if (doc) await navigator.clipboard.writeText(doc)
      else view.document.execCommand('copy')
    } catch {
      try {
        view.document.execCommand('copy')
      } catch { /* */ }
    }
    close()
  }, [close])

  const doCut = useCallback(async () => {
    const view = viewRef.current
    const field = getEditableTarget(targetRef.current)
    if (!view || !field || field.readOnly || field.disabled) {
      close()
      return
    }
    field.focus()
    try {
      if (field.isContentEditable) {
        view.document.execCommand('cut')
      } else if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') {
        const a = field.selectionStart ?? 0
        const b = field.selectionEnd ?? 0
        if (a === b) {
          close()
          return
        }
        const lo = Math.min(a, b)
        const hi = Math.max(a, b)
        const slice = field.value.slice(lo, hi)
        await navigator.clipboard.writeText(slice)
        const next = field.value.slice(0, lo) + field.value.slice(hi)
        setNativeValueAndNotify(field, next)
        field.selectionStart = field.selectionEnd = lo
      }
    } catch {
      try {
        view.document.execCommand('cut')
      } catch { /* */ }
    }
    close()
  }, [close])

  const doPaste = useCallback(async () => {
    const view = viewRef.current
    const field = getEditableTarget(targetRef.current)
    if (!view || !field || field.readOnly || field.disabled) {
      close()
      return
    }
    field.focus()
    try {
      const text = await navigator.clipboard.readText()
      if (field.isContentEditable) {
        view.document.execCommand('insertText', false, text)
      } else if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') {
        const a = field.selectionStart ?? 0
        const b = field.selectionEnd ?? 0
        const lo = Math.min(a, b)
        const hi = Math.max(a, b)
        const next = field.value.slice(0, lo) + text + field.value.slice(hi)
        setNativeValueAndNotify(field, next)
        const caret = lo + text.length
        field.selectionStart = field.selectionEnd = caret
      }
    } catch {
      try {
        view.document.execCommand('paste')
      } catch { /* */ }
    }
    close()
  }, [close])

  const doSelectAll = useCallback(() => {
    const view = viewRef.current
    const field = getEditableTarget(targetRef.current)
    if (!view) {
      close()
      return
    }
    if (field) {
      field.focus()
      if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') {
        field.select()
      } else if (field.isContentEditable) {
        const r = view.document.createRange()
        r.selectNodeContents(field)
        const s = view.getSelection()
        s.removeAllRanges()
        s.addRange(r)
      }
    } else {
      try {
        view.document.execCommand('selectAll')
      } catch { /* */ }
    }
    close()
  }, [close])

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e) => {
      if (e.button !== 0) return
      if (e.target.closest?.('.ctx-menu-host')) return
      close()
    }
    setTimeout(() => document.addEventListener('mousedown', onMouseDown, true), 0)
    return () => document.removeEventListener('mousedown', onMouseDown, true)
  }, [open, close])

  if (!open) return null

  const menu = (
    <div
      className="ctx-menu-host"
      style={{ left: pos.x, top: pos.y }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        className="ctx-menu-item"
        disabled={!flags.canCut}
        onClick={() => !flags.canCut || doCut()}
      >
        {L.cut}
      </button>
      <button
        type="button"
        role="menuitem"
        className="ctx-menu-item"
        disabled={!flags.canCopy}
        onClick={() => !flags.canCopy || doCopy()}
      >
        {L.copy}
      </button>
      <button
        type="button"
        role="menuitem"
        className="ctx-menu-item"
        disabled={!flags.canPaste}
        onClick={() => !flags.canPaste || doPaste()}
      >
        {L.paste}
      </button>
      <div className="ctx-menu-sep" role="separator" />
      <button type="button" role="menuitem" className="ctx-menu-item" onClick={doSelectAll}>
        {L.selectAll}
      </button>
    </div>
  )

  return createPortal(menu, document.body)
}
