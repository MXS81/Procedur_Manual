/**
 * CHM 与「导入的离线 HTML 目录」共用：内链解析、path#锚 状态、iframe 内滚动。
 * 新增阅读器时不要手写 path.join(根, href) 或丢弃 #，须与 services.getChmPageSrcdoc 路径语义一致。
 *
 * 将 file: URL 转为相对离线文档根目录的路径（用于 srcdoc 内链拦截）
 */
export function fileUrlToRootRelativePath (fileUrl, rootDir) {
  try {
    const u = new URL(fileUrl)
    if (u.protocol !== 'file:') return null
    let p = u.pathname
    if (p.startsWith('/') && /^\/[a-zA-Z]:\//.test(p)) p = p.slice(1)
    p = decodeURIComponent(p).replace(/\\/g, '/')
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
 * CHM / 打包 HTML：在 srcdoc iframe 内不要用 document.baseURI（常为 about:srcdoc），
 * 用解压根目录 + 当前页相对路径解析 a[href]，并识别 mk:@MSITStore / ms-its 内部路径。
 */
export function resolveBundledNavigationTarget (rawHref, rootDirFs, currentPageRel) {
  if (!rawHref) return null
  const raw = rawHref.trim()
  if (raw.startsWith('javascript:') || raw.toLowerCase().startsWith('data:')) return null
  if (raw.startsWith('#')) return null

  let target = raw
  const lower = target.toLowerCase()
  if (lower.startsWith('mk:@msitstore:') || lower.startsWith('mk:@')) {
    const parts = target.split(/::\\?/i)
    if (parts.length >= 2) {
      target = parts[parts.length - 1].replace(/^[/\\]+/, '')
    }
  } else if (lower.startsWith('ms-its:')) {
    const idx = target.indexOf('::')
    if (idx !== -1) target = target.slice(idx + 2).replace(/^[/\\]+/, '')
  }

  const hashIdx = target.indexOf('#')
  const pathPart = hashIdx >= 0 ? target.slice(0, hashIdx) : target
  if (!pathPart) return null

  const root = rootDirFs.replace(/\\/g, '/').replace(/\/+$/, '')
  const rootUrl = /^[a-zA-Z]:/.test(root)
    ? 'file:///' + root + '/'
    : 'file:///' + root.replace(/^\//, '') + '/'

  const cur = (currentPageRel || '').replace(/\\/g, '/').split('#')[0]
  const curDir = cur.includes('/') ? cur.replace(/\/[^/]+$/, '') : ''
  const baseUrl = curDir ? rootUrl + curDir + '/' : rootUrl

  try {
    const abs = new URL(pathPart, baseUrl).href
    const rel = fileUrlToRootRelativePath(abs, rootDirFs)
    if (rel) return hashIdx >= 0 ? rel + target.slice(hashIdx) : rel
  } catch { /* fall through */ }

  try {
    const abs2 = new URL(pathPart, rootUrl).href
    const rel2 = fileUrlToRootRelativePath(abs2, rootDirFs)
    if (rel2) return hashIdx >= 0 ? rel2 + target.slice(hashIdx) : rel2
  } catch { /* */ }

  return null
}

/** 当前页状态：相对根路径 + 可选锚点（加载 HTML 只用 path，# 由 iframe 内滚动） */
export function splitBundledActive (raw) {
  const s = String(raw || '')
  const i = s.indexOf('#')
  if (i < 0) return { path: s, fragment: '' }
  return { path: s.slice(0, i), fragment: s.slice(i + 1) }
}

/** srcdoc iframe 内定位到 #fragment（id / a[name] / name） */
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
