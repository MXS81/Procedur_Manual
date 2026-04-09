/**
 * Clipboard / selection helpers parameterized by a target Window (main page or iframe.contentWindow).
 */

export function getEditableTarget (el) {
  if (!el || typeof el.closest !== 'function') return null
  const n = el.closest('input, textarea, [contenteditable="true"]')
  if (!n) return null
  if (n.isContentEditable) return n
  if (n.tagName === 'TEXTAREA') return n
  if (n.tagName === 'INPUT') {
    const skip = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'hidden', 'range', 'color', 'image'])
    if (skip.has((n.type || 'text').toLowerCase())) return null
    return n
  }
  return null
}

export function fieldHasSelectionInView (field, view) {
  if (!field || !view) return false
  if (field.isContentEditable) {
    const sel = view.getSelection()
    if (!sel || sel.rangeCount === 0) return false
    const r = sel.getRangeAt(0)
    if (r.collapsed) return false
    const n = r.commonAncestorContainer
    const el = n.nodeType === 1 ? n : n.parentElement
    return !!(el && field.contains(el))
  }
  if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') {
    return field.selectionStart != null && field.selectionEnd != null && field.selectionStart !== field.selectionEnd
  }
  return false
}

export function getSelectedTextInField (field, view) {
  if (!field || !view) return ''
  if (field.isContentEditable) {
    if (!fieldHasSelectionInView(field, view)) return ''
    return view.getSelection()?.toString() || ''
  }
  if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') {
    const a = field.selectionStart ?? 0
    const b = field.selectionEnd ?? 0
    return field.value.slice(Math.min(a, b), Math.max(a, b))
  }
  return ''
}

export function documentSelectionTextInView (view) {
  try {
    return view.getSelection()?.toString() || ''
  } catch {
    return ''
  }
}

export function setNativeValueAndNotify (field, value) {
  const proto =
    field.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype
  const desc = Object.getOwnPropertyDescriptor(proto, 'value')
  if (desc?.set) desc.set.call(field, value)
  else field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
}

export function computeContextMenuFlags (target, view) {
  const field = getEditableTarget(target)
  const docHas = documentSelectionTextInView(view).length > 0
  const inFieldSel = field ? getSelectedTextInField(field, view).length > 0 : false
  const canCopy = docHas || inFieldSel

  let canPaste = false
  if (field && !field.disabled) {
    if (field.isContentEditable && field.getAttribute('contenteditable') !== 'false') {
      canPaste = true
    } else if ((field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') && !field.readOnly) {
      canPaste = true
    }
  }

  let canCut = false
  if (field && !field.disabled && fieldHasSelectionInView(field, view)) {
    if (field.isContentEditable && field.getAttribute('contenteditable') !== 'false') {
      canCut = true
    } else if ((field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') && !field.readOnly) {
      canCut = true
    }
  }

  return { canCopy, canCut, canPaste, canSelectAll: true }
}

export function clampMenuPos (x, y, w = 168, h = 168) {
  let nx = x
  let ny = y
  if (nx + w > window.innerWidth - 4) nx = window.innerWidth - w - 4
  if (ny + h > window.innerHeight - 4) ny = window.innerHeight - h - 4
  return { x: Math.max(4, nx), y: Math.max(4, ny) }
}
