/**
 * CHM and imported offline HTML dirs: resolve <a href>, path + #hash, iframe scroll.
 * After changing logic run: npm run test:nav (add cases in scripts/test-bundled-doc-nav.mjs).
 * Match path semantics with services.getChmPageSrcdoc; do not drop # or join root+href ad hoc.
 *
 * Map file: URLs under rootDir (for srcdoc link interception vs main-process resolve).
 */
function safeDecodeUriPath (p) {
  if (!p) return p
  try {
    return decodeURIComponent(p)
  } catch {
    return p
  }
}

export function fileUrlToRootRelativePath (fileUrl, rootDir) {
  try {
    const u = new URL(fileUrl)
    if (u.protocol !== 'file:') return null
    let p = u.pathname
    if (p.startsWith('/') && /^\/[a-zA-Z]:\//.test(p)) p = p.slice(1)
    p = safeDecodeUriPath(p).replace(/\\/g, '/')
    let ex = rootDir.replace(/\\/g, '/')
    if (!ex.endsWith('/')) ex += '/'
    const low = p.toLowerCase()
    const exLow = ex.toLowerCase()
    if (!low.startsWith(exLow)) return null
    const rel = p.slice(ex.length).replace(/^\//, '')
    return rel || null
  } catch {
    return null
  }
}

/**
 * Resolve navigation target for CHM / bundled HTML shown in srcdoc iframe.
 * Do not use document.baseURI (often about:srcdoc). Use extract root + current page rel path.
 * Handles mk:@MSITStore / ms-its internal paths.
 */
export function resolveBundledNavigationTarget (rawHref, rootDirFs, currentPageRel) {
  if (!rawHref) return null
  const raw = rawHref.trim()
  if (raw.startsWith('javascript:') || raw.toLowerCase().startsWith('data:')) return null

  // Hash-only: default navigation breaks in srcdoc (blank); many docs use #section (e.g. Python).
  if (raw.startsWith('#')) {
    const base = splitBundledActive(currentPageRel || '').path
    if (!base) return null
    if (raw === '#') return base
    return base + raw
  }

  // Leading / or \ = root of archive, not relative to current HTML directory (hh.exe behavior).
  let resolveFromArchiveRoot = false

  let target = raw
  const lower = target.toLowerCase()
  if (lower.startsWith('mk:@msitstore:') || lower.startsWith('mk:@')) {
    const parts = target.split(/::\\?/i)
    if (parts.length >= 2) {
      const inner = parts[parts.length - 1]
      resolveFromArchiveRoot = /^[/\\]/.test(inner.trimStart())
      target = inner.replace(/^[/\\]+/, '')
    }
  } else if (lower.startsWith('ms-its:')) {
    const idx = target.indexOf('::')
    if (idx !== -1) {
      const inner = target.slice(idx + 2)
      resolveFromArchiveRoot = /^[/\\]/.test(inner.trimStart())
      target = inner.replace(/^[/\\]+/, '')
    }
  } else if (lower.startsWith('file:')) {
    const rel = fileUrlToRootRelativePath(target, rootDirFs)
    if (rel) return rel
    try {
      const u = new URL(target)
      let p = u.pathname || ''
      if (p.startsWith('/') && /^\/[a-zA-Z]:\//.test(p)) p = p.slice(1)
      p = safeDecodeUriPath(p).replace(/\\/g, '/')
      target = p.replace(/^[/\\]+/, '')
    } catch {
      target = target.replace(/^file:\/+/i, '').replace(/^[/\\]+/, '')
    }
  }

  if (!resolveFromArchiveRoot && /^[/\\]/.test(target.trimStart())) {
    resolveFromArchiveRoot = true
  }
  target = target.replace(/^[/\\]+/, '')

  const hashIdx = target.indexOf('#')
  const preHash = hashIdx >= 0 ? target.slice(0, hashIdx) : target
  const fragSuffix = hashIdx >= 0 ? target.slice(hashIdx) : ''
  const qIdx = preHash.indexOf('?')
  const pathPart = (qIdx >= 0 ? preHash.slice(0, qIdx) : preHash)
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
  if (!pathPart) return null

  const root = rootDirFs.replace(/\\/g, '/').replace(/\/+$/, '')
  const rootUrl = /^[a-zA-Z]:/.test(root)
    ? 'file:///' + root + '/'
    : 'file:///' + root.replace(/^\//, '') + '/'

  const cur = (currentPageRel || '').replace(/\\/g, '/').split('#')[0]
  const curDir = cur.includes('/') ? cur.replace(/\/[^/]+$/, '') : ''
  const baseUrl = resolveFromArchiveRoot
    ? rootUrl
    : (curDir ? rootUrl + curDir + '/' : rootUrl)

  try {
    const abs = new URL(pathPart, baseUrl).href
    const rel = fileUrlToRootRelativePath(abs, rootDirFs)
    if (rel) return fragSuffix ? rel + fragSuffix : rel
  } catch { /* fall through */ }

  try {
    const abs2 = new URL(pathPart, rootUrl).href
    const rel2 = fileUrlToRootRelativePath(abs2, rootDirFs)
    if (rel2) return fragSuffix ? rel2 + fragSuffix : rel2
  } catch { /* */ }

  return null
}

/**
 * Split "path#fragment" for active page state: load HTML by path; scroll iframe using fragment.
 */
export function splitBundledActive (raw) {
  const s = String(raw || '')
  const i = s.indexOf('#')
  if (i < 0) return { path: s, fragment: '' }
  return { path: s.slice(0, i), fragment: s.slice(i + 1) }
}

/** Scroll srcdoc iframe document to #fragment: try id, a[name], getElementsByName. */
export function scrollBundledIframeToFragment (doc, fragment) {
  if (!doc || !fragment) return
  const id = decodeURIComponent(fragment).replace(/\+/g, ' ')
  try {
    const byId = doc.getElementById(id)
    if (byId) {
      byId.scrollIntoView({ block: 'start', behavior: 'instant' })
      return
    }
  } catch { /* invalid id */ }
  try {
    const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"')
    const byName = doc.querySelector(`a[name="${esc}"]`)
    if (byName) {
      byName.scrollIntoView({ block: 'start', behavior: 'instant' })
      return
    }
  } catch { /* */ }
  const named = doc.getElementsByName && doc.getElementsByName(id)
  if (named && named[0]) named[0].scrollIntoView({ block: 'start', behavior: 'instant' })
}