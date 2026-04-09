/**
 * Same-origin srcdoc iframes (offline HTML / CHM body): parent can access contentDocument and forwards
 * contextmenu here so ContextMenuHost (portal on parent body) opens with correct Window + coordinates.
 *
 * Cross-origin or sandboxed iframes (no same-origin access):
 * 1) postMessage ！ child runs a tiny script: on contextmenu, parent.postMessage({ type:'pm-ctx', x,y, hasSel }, '*');
 *    parent window listens and opens the same menu (must validate event.source === iframe.contentWindow).
 * 2) Build-time ！ inject <script src=".../context-menu-bridge-inject.js"> into every shipped HTML (or Vite plugin).
 * 3) Stop using iframe ！ fetch HTML and insert into shadow DOM / div (lose separate document, big refactor).
 * 4) Electron only ！ session.setPermissionRequestHandler + webPreferences + preload to inject without CORS.
 */

let subscriber = null

/** @param {(detail: { view: Window, target: EventTarget, menuX: number, menuY: number }) => void} fn */
export function subscribeContextMenuOpens (fn) {
  subscriber = fn
  return () => {
    subscriber = null
  }
}

export function emitContextMenuOpen (detail) {
  subscriber?.(detail)
}

/**
 * Attach contextmenu on iframe's document (same-origin only). Converts coords to parent viewport.
 * @returns {() => void} cleanup
 */
export function attachBundledIframeContextMenu (iframeEl) {
  if (!iframeEl) return () => {}

  const onIframeContextMenu = (e) => {
    if (e.target?.closest?.('.ctx-menu-host')) return
    e.preventDefault()
    e.stopPropagation()
    const r = iframeEl.getBoundingClientRect()
    const win = iframeEl.contentWindow
    if (!win) return
    emitContextMenuOpen({
      view: win,
      target: e.target,
      menuX: r.left + e.clientX,
      menuY: r.top + e.clientY
    })
  }

  let attachedDoc = null

  const bindDoc = () => {
    try {
      const doc = iframeEl.contentDocument
      if (!doc || attachedDoc === doc) return
      if (attachedDoc) {
        try {
          attachedDoc.removeEventListener('contextmenu', onIframeContextMenu, true)
        } catch { /* */ }
      }
      attachedDoc = doc
      doc.addEventListener('contextmenu', onIframeContextMenu, true)
    } catch {
      attachedDoc = null
    }
  }

  const onLoad = () => bindDoc()

  iframeEl.addEventListener('load', onLoad)
  bindDoc()

  return () => {
    iframeEl.removeEventListener('load', onLoad)
    try {
      if (attachedDoc) attachedDoc.removeEventListener('contextmenu', onIframeContextMenu, true)
    } catch { /* */ }
    attachedDoc = null
  }
}
