const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const os = require('os')
const http = require('http')
const https = require('https')
const { pathToFileURL } = require('url')
const { Transform } = require('stream')
const { execFileSync, spawn } = require('child_process')

const CHARSET_MAP = {
  'gb2312': 'gbk', 'gb_2312': 'gbk', 'gbk': 'gbk', 'gb18030': 'gb18030',
  'big5': 'big5', 'big5-hkscs': 'big5',
  'euc-kr': 'euc-kr', 'euc-jp': 'euc-jp',
  'shift_jis': 'shift_jis', 'shift-jis': 'shift_jis', 'sjis': 'shift_jis',
  'iso-8859-1': 'iso-8859-1', 'latin1': 'iso-8859-1', 'latin-1': 'iso-8859-1',
  'windows-1252': 'windows-1252', 'cp1252': 'windows-1252',
  'windows-1251': 'windows-1251', 'cp1251': 'windows-1251',
  'utf-8': 'utf-8', 'utf8': 'utf-8', 'ascii': 'utf-8', 'us-ascii': 'utf-8'
}

const STORAGE_KEYS = {
  MANUALS: 'pm_manuals',
  SETTINGS: 'pm_settings',
  INDEX_PREFIX: 'pm_index_',
  /** string[] ids with downloadUrl user wants in library when files exist */
  REMOTE_BUILTIN_ENABLED: 'pm_remote_builtin_enabled_ids',
  /** + manualId → JSON string[] relative paths (posix) of user-added .md via「新增」 */
  USER_ADDED_MD_PREFIX: 'pm_user_md_cmds_'
}

/** 资源中心「离线资源」列表暂时隐藏的 manifest id（恢复展示时从此 Set 删除） */
const RESOURCE_CENTER_CATALOG_HIDDEN_IDS = new Set(['builtin-php'])

window.services = {

  /** manifestId → AbortController，用于资源中心暂停下载 */
  _builtinDlAbortById: new Map(),

  pauseRemoteBuiltinDownload (manifestId) {
    const c = this._builtinDlAbortById.get(manifestId)
    if (c) {
      try { c.abort() } catch { /* */ }
    }
  },

  _makeDownloadPausedError () {
    const e = new Error('已暂停')
    e.code = 'PM_PAUSED'
    return e
  },

  // ========== Encoding Detection ==========

  _isBufferValidUtf8 (buffer) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buffer)
      return true
    } catch {
      return false
    }
  },

  _gbkPairCount (sample) {
    let n = 0
    for (let i = 0; i < sample.length - 1; i++) {
      const b = sample[i]
      if (b >= 0x81 && b <= 0xFE) {
        const b2 = sample[i + 1]
        if (b2 >= 0x40 && b2 <= 0xFE && b2 !== 0x7F) { n++; i++ }
      }
    }
    return n
  },

  _detectEncoding (buffer, filePath) {
    if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) return 'utf-8'
    if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) return 'utf-16le'
    if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) return 'utf-16be'

    const ext = path.extname(filePath).toLowerCase()
    const headLen = Math.min(4096, buffer.length)
    const head = buffer.slice(0, headLen).toString('latin1')

    const htmlExts = ['.html', '.htm', '.xhtml', '.shtml', '.hhc', '.hhk']
    if (htmlExts.includes(ext)) {
      const m = head.match(/charset\s*=\s*["']?\s*([^\s"';>]+)/i)
      if (m) {
        const raw = m[1].toLowerCase().replace(/^["']|["']$/g, '')
        const mapped = CHARSET_MAP[raw] || raw
        if (mapped === 'utf-8') {
          if (this._isBufferValidUtf8(buffer)) return 'utf-8'
          const sample = buffer.subarray(0, headLen)
          if (/[\x81-\xfe][\x40-\xfe]/.test(head) || this._gbkPairCount(sample) > 2) return 'gbk'
          if (/[\x80-\xff]/.test(head)) return 'gbk'
          return 'utf-8'
        }
        return mapped
      }

      if (/[\x80-\xff]/.test(head)) {
        const sample = buffer.slice(0, headLen)
        let gbkPairs = 0
        for (let i = 0; i < sample.length - 1; i++) {
          const b = sample[i]
          if (b >= 0x81 && b <= 0xFE) {
            const b2 = sample[i + 1]
            if (b2 >= 0x40 && b2 <= 0xFE && b2 !== 0x7F) { gbkPairs++; i++ }
          }
        }
        if (gbkPairs > 2) return 'gbk'
      }
    }

    if (htmlExts.includes(ext) && buffer.length > 0) {
      if (!this._isBufferValidUtf8(buffer)) {
        const scan = buffer.subarray(0, Math.min(65536, buffer.length))
        if (this._gbkPairCount(scan) > 2 || /[\x81-\xfe][\x40-\xfe]/.test(scan.toString('latin1'))) {
          return 'gbk'
        }
      }
    }

    return 'utf-8'
  },

  _isPathInsideDir (filePath, dirPath) {
    const f = path.resolve(filePath)
    const d = path.resolve(dirPath)
    if (process.platform === 'win32') {
      const fl = f.toLowerCase()
      const dl = d.toLowerCase()
      return fl === dl || fl.startsWith(dl + path.sep)
    }
    return f === d || f.startsWith(d + path.sep)
  },

  // ========== File System ==========

  readTextFile (filePath, forceEncoding) {
    const buffer = fs.readFileSync(filePath)
    const encoding = forceEncoding || this._detectEncoding(buffer, filePath)
    if (encoding === 'utf-8') {
      try {
        let str = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
        if (str.charCodeAt(0) === 0xFEFF) str = str.slice(1)
        return str
      } catch {
        for (const enc of ['gbk', 'gb18030', 'big5']) {
          try {
            return new TextDecoder(enc).decode(buffer)
          } catch { /* next */ }
        }
        return new TextDecoder('utf-8').decode(buffer)
      }
    }
    try {
      const decoder = new TextDecoder(encoding)
      return decoder.decode(buffer)
    } catch {
      for (const enc of ['gbk', 'gb18030', 'utf-8']) {
        try {
          return new TextDecoder(enc).decode(buffer)
        } catch { /* next */ }
      }
      return buffer.toString('latin1')
    }
  },

  /**
   * 在已有手册目录下新建 UTF-8 的 .md 文件（用户扩展命令文档等）。
   * @param {string} rootDir 手册根目录（绝对路径）
   * @param {string} baseName 不含扩展名的文件名（已与展示用命令名一致）
   * @param {string} utf8Content 完整 Markdown 正文
   * @returns {{ path: string, fileName: string }}
   */
  _normManualRel (rel) {
    return String(rel || '').replace(/\\/g, '/').replace(/^\/+/g, '').trim()
  },

  _userAddedMdStorageKey (manualId) {
    return STORAGE_KEYS.USER_ADDED_MD_PREFIX + String(manualId || '')
  },

  getUserAddedMarkdownCommandRels (manualId) {
    if (!window.utools?.dbStorage) return []
    try {
      const raw = window.utools.dbStorage.getItem(this._userAddedMdStorageKey(manualId))
      const arr = raw ? JSON.parse(raw) : []
      if (!Array.isArray(arr)) return []
      return arr.map((r) => this._normManualRel(r)).filter(Boolean)
    } catch {
      return []
    }
  },

  registerUserAddedMarkdownCommand (manualId, relPath) {
    if (!window.utools?.dbStorage) return
    const id = String(manualId || '').trim()
    const rel = this._normManualRel(relPath)
    if (!id || !rel) return
    const key = this._userAddedMdStorageKey(id)
    const list = this.getUserAddedMarkdownCommandRels(id)
    if (!list.includes(rel)) {
      list.push(rel)
      window.utools.dbStorage.setItem(key, JSON.stringify(list))
    }
  },

  unregisterUserAddedMarkdownCommand (manualId, relPath) {
    if (!window.utools?.dbStorage) return
    const id = String(manualId || '').trim()
    const rel = this._normManualRel(relPath)
    if (!id) return
    const key = this._userAddedMdStorageKey(id)
    const next = this.getUserAddedMarkdownCommandRels(id).filter((x) => x !== rel)
    window.utools.dbStorage.setItem(key, JSON.stringify(next))
  },

  isUserAddedMarkdownCommand (manualId, relPath) {
    const rel = this._normManualRel(relPath)
    return this.getUserAddedMarkdownCommandRels(manualId).includes(rel)
  },

  /**
   * 仅删除通过「新增」登记过的 .md（见 registerUserAddedMarkdownCommand）。
   */
  deleteUserAddedMarkdownCommand (rootDir, manualId, relPath) {
    if (!this.isUserAddedMarkdownCommand(manualId, relPath)) {
      throw new Error('只能删除通过本页「新增」添加的命令文档')
    }
    const root = path.resolve(String(rootDir || '').trim())
    if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      throw new Error('手册目录不存在或无效')
    }
    const rel = this._normManualRel(relPath)
    if (!rel || rel.includes('..')) throw new Error('无效路径')
    const segments = rel.split('/').filter(Boolean)
    const target = path.resolve(path.join(root, ...segments))
    if (!this._isPathInsideDir(target, root)) throw new Error('路径非法')
    if (fs.existsSync(target)) fs.unlinkSync(target)
    this.unregisterUserAddedMarkdownCommand(manualId, relPath)
    return { ok: true }
  },

  saveNewMarkdownInManualDir (rootDir, baseName, utf8Content, manualId) {
    const root = path.resolve(String(rootDir || '').trim())
    if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      throw new Error('手册目录不存在或无效')
    }
    let base = String(baseName || '').trim()
    base = base.replace(/[\\/:*?"<>|]/g, '-').replace(/^\.+/, '').trim()
    if (!base || base === '.' || base === '..') throw new Error('无效的文件名')
    if (base.length > 200) throw new Error('文件名过长')
    const target = path.join(root, base + '.md')
    const resolved = path.resolve(target)
    if (!this._isPathInsideDir(resolved, root)) throw new Error('路径超出手册目录')
    if (fs.existsSync(resolved)) throw new Error('已存在同名文件: ' + base + '.md')
    fs.writeFileSync(resolved, String(utf8Content), { encoding: 'utf-8' })
    if (manualId && window.utools?.dbStorage) {
      this.registerUserAddedMarkdownCommand(manualId, base + '.md')
    }
    return { path: resolved, fileName: base + '.md' }
  },

  /** ??? HTML ??????????????? meta http-equiv Content-Type ??? charset ??????? */
  _parseHtmlDeclaredCharset (buffer) {
    const headLen = Math.min(32768, buffer.length)
    const head = buffer.subarray(0, headLen).toString('latin1')
    let m = head.match(
      /<meta[^>]+http-equiv\s*=\s*["']?\s*content-type["']?[^>]+content\s*=\s*["']([^"']+)["']/i
    )
    if (m) {
      const cm = m[1].match(/charset\s*=\s*([^"';\s]+)/i)
      if (cm) return cm[1].trim()
    }
    m = head.match(/<meta[^>]+charset\s*=\s*["']?([^"'>\s/]+)/i)
    if (m) return m[1].trim()
    return null
  },

  _decoderLabelForDeclaredCharset (raw) {
    if (!raw) return null
    const key = String(raw).toLowerCase().trim().replace(/^["']|["']$/g, '')
    return CHARSET_MAP[key] || key
  },

  /**
   * ??? HTML ??????????????????????????????????? CHM ?????????????????????????????
   */
  readTextFileChmAware (filePath) {
    const buffer = fs.readFileSync(filePath)
    const declared = this._parseHtmlDeclaredCharset(buffer)
    const label = this._decoderLabelForDeclaredCharset(declared)
    if (label && label !== 'utf-8' && label !== 'utf-16le' && label !== 'utf-16be') {
      try {
        return new TextDecoder(label).decode(buffer)
      } catch { /* fall through */ }
    }
    return this.readTextFile(filePath)
  },

  readBinaryAsBase64 (filePath) {
    return fs.readFileSync(filePath).toString('base64')
  },

  /** ??? pdf.js ???????????????????? PDF ????????? */
  readBinaryAsUint8 (filePath) {
    const buf = fs.readFileSync(filePath)
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  },

  pathInfo (filePath) {
    try {
      const stat = fs.statSync(filePath)
      const parsed = path.parse(filePath)
      return {
        exists: true,
        isFile: stat.isFile(),
        isDir: stat.isDirectory(),
        ext: parsed.ext.toLowerCase(),
        name: parsed.name,
        baseName: parsed.base,
        dir: parsed.dir,
        size: stat.size
      }
    } catch {
      return { exists: false, isFile: false, isDir: false, ext: '', name: '', baseName: '', dir: '', size: 0 }
    }
  },

  _isSkippableLine (trimmed) {
    if (!trimmed) return true
    if (/^#{1,6}\s/.test(trimmed)) return true
    if (/^[-*_]{3,}$/.test(trimmed)) return true
    if (/^```/.test(trimmed)) return true
    if (/^!\[/.test(trimmed)) return true
    if (/^\|.*\|$/.test(trimmed)) return true
    if (/^<[a-z/]/.test(trimmed)) return true
    if (/^\[/.test(trimmed)) return true
    return false
  },

  readFileSummary (filePath, maxLen = 120) {
    try {
      const text = this.readTextFile(filePath)
      const lines = text.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (this._isSkippableLine(trimmed)) continue
        const clean = trimmed.replace(/[`*_~\[\]()!]/g, '').replace(/^\s*[-+>]\s*/, '').trim()
        if (clean.length > 0) return clean.length > maxLen ? clean.substring(0, maxLen) + '...' : clean
      }
      return ''
    } catch { return '' }
  },

  readFileSearchText (filePath, maxLen = 1000) {
    try {
      const text = this.readTextFile(filePath)
      const lines = text.split('\n')
      const parts = []
      let inCodeBlock = false
      let len = 0
      for (const line of lines) {
        const trimmed = line.trim()
        if (/^```/.test(trimmed)) { inCodeBlock = !inCodeBlock; continue }
        if (inCodeBlock) {
          const code = trimmed.replace(/^#\s*/, '').trim()
          if (code.length > 0) {
            parts.push(code)
            len += code.length
          }
        } else {
          if (/^!\[/.test(trimmed)) continue
          if (/^<[a-z/]/.test(trimmed)) continue
          const clean = trimmed.replace(/[`*_~\[\]()!#|]/g, ' ').replace(/\s+/g, ' ').trim()
          if (clean.length > 0) {
            parts.push(clean)
            len += clean.length
          }
        }
        if (len > maxLen) break
      }
      return parts.join(' ')
    } catch { return '' }
  },

  _SCAN_SKIP_DIRS: new Set([
    'node_modules', '.git', '.svn', '.hg', '__pycache__', '.idea', '.vscode',
    'vendor', 'bower_components', 'dist', 'build', '.next', 'target'
  ]),

  scanDir (dirPath, extensions = [], options = {}) {
    const results = []
    const exts = extensions.map(e => e.toLowerCase())
    const maxFiles = typeof options.maxFiles === 'number' ? options.maxFiles : Infinity
    const skipDirs = this._SCAN_SKIP_DIRS

    const walk = (dir) => {
      if (results.length >= maxFiles) return
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (results.length >= maxFiles) return
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            if (skipDirs.has(entry.name)) continue
            walk(fullPath)
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase()
            if (exts.length === 0 || exts.includes(ext)) {
              results.push({ name: entry.name, path: fullPath, ext })
            }
          }
        }
      } catch {
        // skip inaccessible directories
      }
    }

    walk(dirPath)
    return results
  },

  /**
   * ??????????????? PHP ?????? HTML ??????????????????? chunklist ????????? entryFile?????? IframeManualReader ??? Node ??????? + srcdoc ??????? GBK/UTF-8 ?????????
   */
  suggestBundledHtmlEntry (dirPath) {
    if (!dirPath || !fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      return { entryFile: null }
    }
    const candidates = ['index.html', 'index.htm', 'manual.html', 'manual.htm', 'toc.html', 'default.html']
    let entry = null
    for (const name of candidates) {
      const p = path.join(dirPath, name)
      try {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
          entry = name
          break
        }
      } catch { /* skip */ }
    }
    if (!entry) return { entryFile: null }

    const capped = this.scanDir(dirPath, ['.html', '.htm'], { maxFiles: 320 })
    const htmlCount = capped.length

    let hasChunkToc = false
    try {
      const snippet = this.readTextFile(path.join(dirPath, entry)).slice(0, 96000)
      hasChunkToc = /chunklist[^"'>]*chunklist_set|chunklist_set|class\s*=\s*["'][^"']*chunklist/i.test(snippet)
    } catch { /* skip */ }

    // ??? PHP chunk ??????????????????????????????????? Iframe ??????? chunklist ???????
    if (hasChunkToc) {
      return { entryFile: entry, reason: 'chunk-toc', htmlCount }
    }
    return { entryFile: null, htmlCount }
  },

  generateId () {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
    })
  },

  resolvePath (...segments) {
    return path.resolve(...segments)
  },

  // ========== Manual Storage ==========

  getAllManuals () {
    const data = window.utools.dbStorage.getItem(STORAGE_KEYS.MANUALS)
    return data ? JSON.parse(data) : []
  },

  _saveAllManuals (manuals) {
    window.utools.dbStorage.setItem(STORAGE_KEYS.MANUALS, JSON.stringify(manuals))
  },

  saveManual (manual) {
    const manuals = this.getAllManuals()
    const idx = manuals.findIndex(m => m.id === manual.id)
    if (idx >= 0) {
      manuals[idx] = { ...manuals[idx], ...manual, updatedAt: Date.now() }
    } else {
      manual.createdAt = manual.createdAt || Date.now()
      manual.updatedAt = Date.now()
      manuals.push(manual)
    }
    this._saveAllManuals(manuals)
    return manual
  },

  removeManual (id) {
    const manuals = this.getAllManuals().filter(m => m.id !== id)
    this._saveAllManuals(manuals)
    this.removeIndexData(id)
    this._disableRemoteBuiltinIds([id])
  },

  removeManuals (ids) {
    if (!Array.isArray(ids) || ids.length === 0) return
    const idSet = new Set(ids)
    const manuals = this.getAllManuals().filter(m => !idSet.has(m.id))
    this._saveAllManuals(manuals)
    for (const id of ids) {
      this.removeIndexData(id)
    }
    this._disableRemoteBuiltinIds(ids)
  },

  _disableRemoteBuiltinIds (ids) {
    try {
      if (!window.utools || !window.utools.dbStorage) return
      const raw = window.utools.dbStorage.getItem(STORAGE_KEYS.REMOTE_BUILTIN_ENABLED)
      if (!raw) return
      const o = JSON.parse(raw)
      const arr = Array.isArray(o.ids) ? o.ids : []
      const removeSet = new Set(ids.map(String))
      const filtered = arr.filter(id => !removeSet.has(String(id)))
      if (filtered.length !== arr.length) {
        window.utools.dbStorage.setItem(
          STORAGE_KEYS.REMOTE_BUILTIN_ENABLED,
          JSON.stringify({ v: 1, ids: filtered })
        )
      }
    } catch { /* ignore */ }
  },

  // ========== Index Storage (chunked to stay under uTools 1MB/doc limit) ==========

  _CHUNK_CHARS: 200 * 1024,
  _INDEX_VERSION: 2,

  saveIndexData (manualId, data) {
    this.removeIndexData(manualId)

    const chunkSize = this._CHUNK_CHARS
    const totalChunks = Math.ceil(data.length / chunkSize) || 1

    for (let i = 0; i < totalChunks; i++) {
      window.utools.dbStorage.setItem(
        STORAGE_KEYS.INDEX_PREFIX + manualId + '_chunk_' + i,
        data.substring(i * chunkSize, (i + 1) * chunkSize)
      )
    }
    window.utools.dbStorage.setItem(
      STORAGE_KEYS.INDEX_PREFIX + manualId + '_meta',
      JSON.stringify({ chunks: totalChunks, size: data.length, ver: this._INDEX_VERSION })
    )
  },

  loadIndexData (manualId) {
    const metaRaw = window.utools.dbStorage.getItem(STORAGE_KEYS.INDEX_PREFIX + manualId + '_meta')
    if (!metaRaw) {
      const legacy = window.utools.dbStorage.getItem(STORAGE_KEYS.INDEX_PREFIX + manualId)
      if (legacy) {
        this.removeIndexData(manualId)
        return null
      }
      return null
    }

    const meta = JSON.parse(metaRaw)
    if (meta.ver !== this._INDEX_VERSION) {
      this.removeIndexData(manualId)
      return null
    }

    const parts = []
    for (let i = 0; i < meta.chunks; i++) {
      const chunk = window.utools.dbStorage.getItem(STORAGE_KEYS.INDEX_PREFIX + manualId + '_chunk_' + i)
      if (chunk == null) return null
      parts.push(chunk)
    }
    return parts.join('')
  },

  removeIndexData (manualId) {
    const metaRaw = window.utools.dbStorage.getItem(STORAGE_KEYS.INDEX_PREFIX + manualId + '_meta')
    if (metaRaw) {
      try {
        const meta = JSON.parse(metaRaw)
        for (let i = 0; i < meta.chunks; i++) {
          window.utools.dbStorage.removeItem(STORAGE_KEYS.INDEX_PREFIX + manualId + '_chunk_' + i)
        }
      } catch { /* ok */ }
      window.utools.dbStorage.removeItem(STORAGE_KEYS.INDEX_PREFIX + manualId + '_meta')
    }
    window.utools.dbStorage.removeItem(STORAGE_KEYS.INDEX_PREFIX + manualId)
  },

  // ========== Built-in Manuals ==========

  getBuiltinManualsDir () {
    const prodDir = path.join(__dirname, '..', 'builtin-manuals')
    if (fs.existsSync(prodDir)) return prodDir

    const devDir = path.join(__dirname, '..', 'public', 'builtin-manuals')
    if (fs.existsSync(devDir)) return devDir

    return null
  },

  _getUtoolsUserData () {
    try {
      if (window.utools && typeof window.utools.getPath === 'function') {
        return window.utools.getPath('userData')
      }
    } catch { /* */ }
    return null
  },

  /** Large built-ins from manifest `downloadUrl` are stored here (GitHub Releases, OSS, etc.) */
  getBuiltinRemoteCacheRoot () {
    const ud = this._getUtoolsUserData()
    const base = ud
      ? path.join(ud, 'procedur-manual-remote-builtins')
      : path.join(os.homedir(), '.procedur-manual-remote-builtins')
    try {
      fs.mkdirSync(base, { recursive: true })
    } catch { /* */ }
    return base
  },

  _inferBuiltinSourceTypeFromEntry (entry, filePath) {
    if (filePath && fs.existsSync(filePath)) {
      const info = this.pathInfo(filePath)
      if (info.isDir) return 'mixed'
      const ext = info.ext
      return ext === '.chm' ? 'chm'
        : ext === '.pdf' ? 'pdf'
          : ['.md', '.markdown'].includes(ext) ? 'markdown'
            : ext === '.json' ? 'json'
              : 'html'
    }
    const ext = path.extname(entry.fileName || '').toLowerCase()
    if (ext === '.chm') return 'chm'
    if (ext === '.pdf') return 'pdf'
    if (['.md', '.markdown'].includes(ext)) return 'markdown'
    if (ext === '.json') return 'json'
    if (!ext && entry.fileName && !/[\\/]/.test(entry.fileName)) return 'mixed'
    if (/[\\/]/.test(entry.fileName || '')) return 'mixed'
    return 'html'
  },

  /**
   * @param {(info: { loaded: number, total: number|null }) => void} [onProgress] throttled ~120ms
   * @param {{ signal?: AbortSignal, resume?: boolean }} [httpOpts] resume：断点续传（Range）；暂停时不删除 .part
   */
  _downloadHttpToFileImpl (urlString, destPath, redirectLeft, onProgress, httpOpts) {
    const opts = httpOpts || {}
    const signal = opts.signal
    const part = destPath + '.part'
    fs.mkdirSync(path.dirname(destPath), { recursive: true })

    let startByte = 0
    const allowResume = opts.resume !== false
    try {
      if (allowResume && fs.existsSync(part)) {
        startByte = fs.statSync(part).size
      } else {
        try { if (fs.existsSync(part)) fs.unlinkSync(part) } catch { /* */ }
        startByte = 0
      }
    } catch {
      startByte = 0
    }

    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        return reject(this._makeDownloadPausedError())
      }

      let u
      try {
        u = new URL(urlString)
      } catch {
        return reject(new Error('Invalid URL'))
      }
      const lib = u.protocol === 'https:' ? https : http

      const headers = {
        'User-Agent': 'Mozilla/5.0 (compatible; ProcedurManual-uTools/1.0; +https://github.com/MXS81/Procedur_Manual)'
      }
      if (startByte > 0) {
        headers.Range = 'bytes=' + startByte + '-'
      }

      let req
      const cleanupAbort = () => {
        try { signal?.removeEventListener('abort', onAbort) } catch { /* */ }
      }
      const onAbort = () => {
        try { req.destroy() } catch { /* */ }
      }
      signal?.addEventListener('abort', onAbort)

      req = lib.get(urlString, { headers }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectLeft <= 0) {
            cleanupAbort()
            res.resume()
            return reject(new Error('Too many redirects'))
          }
          let next = res.headers.location
          if (!/^https?:/i.test(next)) {
            try {
              next = new URL(next, urlString).href
            } catch {
              cleanupAbort()
              res.resume()
              return reject(new Error('Bad redirect URL'))
            }
          }
          res.resume()
          cleanupAbort()
          return resolve(this._downloadHttpToFileImpl(next, destPath, redirectLeft - 1, onProgress, httpOpts))
        }

        if (startByte > 0 && res.statusCode === 200) {
          res.resume()
          cleanupAbort()
          return resolve(
            this._downloadHttpToFileImpl(urlString, destPath, redirectLeft, onProgress, {
              ...opts,
              resume: false
            })
          )
        }

        if (res.statusCode !== 200 && res.statusCode !== 206) {
          cleanupAbort()
          res.resume()
          return reject(new Error('HTTP ' + res.statusCode))
        }

        let total = 0
        if (res.statusCode === 206) {
          const cr = res.headers['content-range']
          const m = cr && String(cr).match(/bytes\s+\d+-\d+\/(\d+)/i)
          if (m) {
            total = parseInt(m[1], 10)
          }
        } else {
          const cl = res.headers['content-length']
          if (cl != null) {
            const n = parseInt(String(cl), 10)
            if (Number.isFinite(n) && n > 0) total = n
          }
        }

        let innerLoaded = 0
        let lastReport = 0
        const fireProgress = (force) => {
          if (typeof onProgress !== 'function') return
          const now = Date.now()
          const curLoaded = startByte + innerLoaded
          if (!force && now - lastReport < 120 && (total <= 0 || curLoaded < total)) return
          lastReport = now
          try {
            onProgress({ loaded: curLoaded, total: total > 0 ? total : null })
          } catch { /* */ }
        }

        const counter = new Transform({
          transform (chunk, enc, cb) {
            innerLoaded += chunk.length
            fireProgress(false)
            cb(null, chunk)
          }
        })

        const writeFlags = startByte > 0 ? 'a' : 'w'
        const out = fs.createWriteStream(part, { flags: writeFlags })

        const onFail = (err) => {
          cleanupAbort()
          try { out.close() } catch { /* */ }
          if (signal?.aborted) {
            return reject(this._makeDownloadPausedError())
          }
          try { if (fs.existsSync(part)) fs.unlinkSync(part) } catch { /* */ }
          reject(err)
        }

        res.on('error', onFail)
        counter.on('error', onFail)
        out.on('error', onFail)
        out.on('finish', () => {
          try {
            fireProgress(true)
            fs.renameSync(part, destPath)
            cleanupAbort()
            resolve()
          } catch (e) {
            onFail(e)
          }
        })
        res.pipe(counter).pipe(out)
      })

      req.on('error', (e) => {
        cleanupAbort()
        if (signal?.aborted) {
          return reject(this._makeDownloadPausedError())
        }
        try { if (fs.existsSync(part)) fs.unlinkSync(part) } catch { /* */ }
        reject(e)
      })
      req.setTimeout(900000, () => {
        req.destroy()
        cleanupAbort()
        try { if (fs.existsSync(part)) fs.unlinkSync(part) } catch { /* */ }
        reject(new Error('Download timeout'))
      })
    })
  },

  /**
   * 先 primaryUrl，失败且 mirrorUrl 合法时再试镜像（如 Gitee）。
   */
  async _downloadHttpWithOptionalMirror (primaryUrl, mirrorUrl, destPath, redirectLeft, onProgress, progressOpts) {
    const part = destPath + '.part'
    const primary = String(primaryUrl || '').trim()
    const mirror = String(mirrorUrl || '').trim()
    const signal = progressOpts && progressOpts.signal
    const httpOpts = { signal, resume: true }
    const run = async (u) => {
      await this._downloadHttpToFileImpl(u, destPath, redirectLeft, onProgress, httpOpts)
    }
    try {
      await run(primary)
    } catch (e) {
      if (e && e.code === 'PM_PAUSED') throw e
      if (!mirror || !/^https?:\/\//i.test(mirror)) throw e
      try { if (fs.existsSync(part)) fs.unlinkSync(part) } catch { /* */ }
      this._emitRemoteDlProgress(progressOpts, {
        phase: 'download',
        step: 'mirror',
        loaded: 0,
        total: null
      })
      await new Promise((r) => setImmediate(r))
      await run(mirror)
    }
  },

  _emitRemoteDlProgress (opts, info) {
    const fn = opts && opts.onProgress
    if (typeof fn !== 'function') return
    try {
      fn(info)
    } catch { /* */ }
  },

  _run7zExtractAsync (sevenZip, args, timeoutMs) {
    return new Promise((resolve, reject) => {
      const child = spawn(sevenZip, args, {
        windowsHide: true,
        stdio: 'ignore'
      })
      const tid = setTimeout(() => {
        try { child.kill('SIGTERM') } catch { /* */ }
        reject(new Error('Extract timeout'))
      }, timeoutMs || 900000)
      child.on('error', (e) => {
        clearTimeout(tid)
        reject(e)
      })
      child.on('close', (code) => {
        clearTimeout(tid)
        if (code === 0) resolve()
        else reject(new Error('7-Zip exit ' + code))
      })
    })
  },

  /**
   * Download remote asset (e.g. from GitHub Releases) to manual.rootPath.
   * onProgress?: (info: { phase: string, step?: string, loaded?: number, total?: number|null }) => void
   * @param {{ url: string, urlMirror?: string, destPath: string, sha256?: string, archiveFormat?: string, entryFile?: string|null, companionUrl?: string, companionUrlMirror?: string, companionSha256?: string, onProgress?: function, signal?: AbortSignal }} opts
   */
  async downloadRemoteBuiltinAsset (opts) {
    const fmt = opts && String(opts.archiveFormat || '').trim().toLowerCase()
    if (fmt === 'zip') {
      return this._downloadRemoteBuiltinZip(opts)
    }
    const byteProgress = (step) => {
      if (typeof opts.onProgress !== 'function') return null
      return ({ loaded, total }) => {
        try {
          opts.onProgress({ phase: 'download', step, loaded, total })
        } catch { /* */ }
      }
    }
    const url = opts && String(opts.url || '').trim()
    const urlMirror = opts && String(opts.urlMirror || '').trim()
    let destPath = opts && String(opts.destPath || '').trim()
    if (!url || !destPath) throw new Error('url and destPath required')
    if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) URLs are supported')
    destPath = path.resolve(destPath)

    const mainShaOk = () => {
      if (!opts.sha256 || !String(opts.sha256).trim()) return true
      const expected = String(opts.sha256).trim().toLowerCase()
      const buf = fs.readFileSync(destPath)
      const h = crypto.createHash('sha256').update(buf).digest('hex')
      return h === expected
    }

    let needMain = !fs.existsSync(destPath)
    if (!needMain && opts.sha256 && String(opts.sha256).trim() && !mainShaOk()) {
      try { fs.unlinkSync(destPath) } catch { /* */ }
      needMain = true
    }

    try {
      if (needMain) {
        await this._downloadHttpWithOptionalMirror(
          url,
          urlMirror,
          destPath,
          12,
          byteProgress('main'),
          opts
        )
      }
    } catch (e) {
      if (e && e.code === 'PM_PAUSED') throw e
      const part = destPath + '.part'
      try { if (fs.existsSync(part)) fs.unlinkSync(part) } catch { /* */ }
      throw e
    }
    if (opts.sha256 && String(opts.sha256).trim()) {
      this._emitRemoteDlProgress(opts, { phase: 'verify', step: 'main' })
      await new Promise((r) => setImmediate(r))
      const expected = String(opts.sha256).trim().toLowerCase()
      const buf = fs.readFileSync(destPath)
      const h = crypto.createHash('sha256').update(buf).digest('hex')
      if (h !== expected) {
        try { fs.unlinkSync(destPath) } catch { /* */ }
        throw new Error('SHA256 mismatch')
      }
    }
    const companionUrl = opts && String(opts.companionUrl || '').trim()
    const companionUrlMirror = opts && String(opts.companionUrlMirror || '').trim()
    if (companionUrl) {
      if (!/^https?:\/\//i.test(companionUrl)) throw new Error('Invalid companion URL')
      const ext = path.extname(destPath).toLowerCase()
      const companionDest = ext === '.chm'
        ? path.join(path.dirname(destPath), path.basename(destPath, ext) + '.chw')
        : path.join(path.dirname(destPath), path.basename(destPath) + '.companion')
      const cpart = companionDest + '.part'

      const companionShaOk = () => {
        if (!opts.companionSha256 || !String(opts.companionSha256).trim()) return true
        const expected = String(opts.companionSha256).trim().toLowerCase()
        const buf = fs.readFileSync(companionDest)
        const h = crypto.createHash('sha256').update(buf).digest('hex')
        return h === expected
      }

      let needCompanion = !fs.existsSync(companionDest)
      if (!needCompanion && opts.companionSha256 && String(opts.companionSha256).trim() && !companionShaOk()) {
        try { fs.unlinkSync(companionDest) } catch { /* */ }
        needCompanion = true
      }

      try {
        if (needCompanion) {
          await this._downloadHttpWithOptionalMirror(
            companionUrl,
            companionUrlMirror,
            companionDest,
            12,
            byteProgress('companion'),
            opts
          )
        }
      } catch (e) {
        if (e && e.code === 'PM_PAUSED') throw e
        try { if (fs.existsSync(cpart)) fs.unlinkSync(cpart) } catch { /* */ }
        throw e
      }
      if (opts.companionSha256 && String(opts.companionSha256).trim()) {
        this._emitRemoteDlProgress(opts, { phase: 'verify', step: 'companion' })
        await new Promise((r) => setImmediate(r))
        const expected = String(opts.companionSha256).trim().toLowerCase()
        const buf = fs.readFileSync(companionDest)
        const h = crypto.createHash('sha256').update(buf).digest('hex')
        if (h !== expected) {
          try { fs.unlinkSync(companionDest) } catch { /* */ }
          throw new Error('Companion SHA256 mismatch')
        }
      }
    }
    this._emitRemoteDlProgress(opts, { phase: 'done' })
    return { path: destPath, size: fs.statSync(destPath).size }
  },

  /**
   * Download a .zip (e.g. php-chunked-xhtml tree) and extract so destPath is the manual root folder.
   * Zip must contain a top-level folder matching path.basename(destPath) (e.g. php-chunked-xhtml/).
   */
  async _downloadRemoteBuiltinZip (opts) {
    const url = opts && String(opts.url || '').trim()
    const urlMirror = opts && String(opts.urlMirror || '').trim()
    let destPath = opts && String(opts.destPath || '').trim()
    if (!url || !destPath) throw new Error('url and destPath required')
    if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) URLs are supported')
    destPath = path.resolve(destPath)
    const parentDir = path.dirname(destPath)
    const sevenZip = this._find7zExe()
    if (!sevenZip) {
      throw new Error(
        '未找到 7-Zip（内置 tools/7za.exe 或 PM_SEVEN_ZIP / 系统 7-Zip），无法解压远程 ZIP'
      )
    }
    const byteProgress = (step) => {
      if (typeof opts.onProgress !== 'function') return null
      return ({ loaded, total }) => {
        try {
          opts.onProgress({ phase: 'download', step, loaded, total })
        } catch { /* */ }
      }
    }
    fs.mkdirSync(parentDir, { recursive: true })
    const zipPath = path.join(parentDir, '_pm_remote_zip_dl')
    try {
      await this._downloadHttpWithOptionalMirror(
        url,
        urlMirror,
        zipPath,
        12,
        byteProgress('zip'),
        opts
      )
    } catch (e) {
      if (e && e.code === 'PM_PAUSED') throw e
      try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath) } catch { /* */ }
      throw e
    }
    if (opts.sha256 && String(opts.sha256).trim()) {
      this._emitRemoteDlProgress(opts, { phase: 'verify', step: 'zip' })
      await new Promise((r) => setImmediate(r))
      const expected = String(opts.sha256).trim().toLowerCase()
      const buf = fs.readFileSync(zipPath)
      const h = crypto.createHash('sha256').update(buf).digest('hex')
      if (h !== expected) {
        try { fs.unlinkSync(zipPath) } catch { /* */ }
        throw new Error('SHA256 mismatch')
      }
    }
    try {
      try {
        if (fs.existsSync(destPath)) {
          fs.rmSync(destPath, { recursive: true, force: true })
        }
      } catch { /* */ }
      fs.mkdirSync(parentDir, { recursive: true })
      const outResolved = path.resolve(parentDir)
      const outSwitch = /\s/.test(outResolved)
        ? '-o"' + outResolved.replace(/"/g, '') + '"'
        : '-o' + outResolved
      this._emitRemoteDlProgress(opts, { phase: 'extract' })
      await this._run7zExtractAsync(sevenZip, ['x', zipPath, outSwitch, '-y', '-bb0'], 900000)
    } catch (e) {
      try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath) } catch { /* */ }
      throw e
    }
    try { fs.unlinkSync(zipPath) } catch { /* */ }
    let ok = false
    try {
      const st = fs.statSync(destPath)
      ok = st.isDirectory()
    } catch { /* */ }
    if (!ok) {
      throw new Error(
        '解压后未找到目录: ' + destPath +
          '。请确认 ZIP 内顶层为文件夹「' +
          path.basename(destPath) + '」且与 manifest 的 fileName 一致。'
      )
    }
    const entryRel = opts.entryFile && String(opts.entryFile).trim()
    if (entryRel) {
      const entryFull = path.join(destPath, entryRel.replace(/\//g, path.sep))
      if (!fs.existsSync(entryFull)) {
        throw new Error(
          '解压成功但缺少入口文件: ' + entryRel
        )
      }
    }
    this._emitRemoteDlProgress(opts, { phase: 'done' })
    return { path: destPath, size: 0 }
  },

  initBuiltinManuals () {
    const dir = this.getBuiltinManualsDir()
    if (!dir) return { added: 0, skipped: 0 }

    const manifestPath = path.join(dir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) return { added: 0, skipped: 0 }

    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    } catch { return { added: 0, skipped: 0 } }

    if (!Array.isArray(manifest)) return { added: 0, skipped: 0 }

    const manifestIds = new Set(manifest.map(entry => entry.id))
    const existing = this.getAllManuals()
    let removed = 0

    for (const manual of existing) {
      if (manual.builtin && !manifestIds.has(manual.id)) {
        this.removeManual(manual.id)
        removed++
      }
    }

    const existingAfterCleanup = this.getAllManuals()
    const existingMap = new Map(existingAfterCleanup.map(m => [m.id, m]))
    let added = 0
    let skipped = 0
    const cacheRoot = this.getBuiltinRemoteCacheRoot()
    const remoteEnabled = this._getRemoteBuiltinEnabledIdSet(manifest)

    for (const entry of manifest) {
      const remoteDownloadUrl = entry.downloadUrl && String(entry.downloadUrl).trim()
        ? String(entry.downloadUrl).trim()
        : null
      const remoteSha256 = remoteDownloadUrl && entry.sha256 && String(entry.sha256).trim()
        ? String(entry.sha256).trim().toLowerCase()
        : null
      const remoteDownloadArchive = remoteDownloadUrl && entry.downloadArchive
        && String(entry.downloadArchive).trim().toLowerCase() === 'zip'
        ? 'zip'
        : null
      const remoteDownloadChwUrl = remoteDownloadUrl && entry.downloadUrlChw
        && String(entry.downloadUrlChw).trim()
        ? String(entry.downloadUrlChw).trim()
        : null
      const remoteSha256Chw = remoteDownloadChwUrl && entry.sha256Chw && String(entry.sha256Chw).trim()
        ? String(entry.sha256Chw).trim().toLowerCase()
        : null
      const remoteDownloadMirrorUrl = remoteDownloadUrl && entry.downloadUrlMirror
        && String(entry.downloadUrlMirror).trim()
        ? String(entry.downloadUrlMirror).trim()
        : null
      const remoteDownloadChwMirrorUrl = remoteDownloadChwUrl && entry.downloadUrlChwMirror
        && String(entry.downloadUrlChwMirror).trim()
        ? String(entry.downloadUrlChwMirror).trim()
        : null

      const bundlePath = path.join(dir, entry.fileName)
      const relSafe = String(entry.fileName || '').replace(/^[\\/]+/, '')
      const cachePath = path.join(cacheRoot, entry.id, relSafe)

      let filePath
      if (remoteDownloadUrl) {
        filePath = fs.existsSync(bundlePath) ? bundlePath : cachePath
      } else {
        filePath = bundlePath
      }

      const exists = fs.existsSync(filePath)

      if (!exists && !remoteDownloadUrl) {
        if (existingMap.has(entry.id)) {
          this.removeManual(entry.id)
          removed++
        } else {
          skipped++
        }
        continue
      }

      if (remoteDownloadUrl && !remoteEnabled.has(entry.id)) {
        if (existingMap.has(entry.id)) {
          this.removeManual(entry.id)
          removed++
        }
        continue
      }

      if (remoteDownloadUrl && !exists) {
        if (existingMap.has(entry.id)) {
          this.removeManual(entry.id)
          removed++
        }
        continue
      }

      const sourceType = this._inferBuiltinSourceTypeFromEntry(entry, exists ? filePath : null)

      const patchRemote = {
        remoteDownloadUrl: remoteDownloadUrl || null,
        remoteSha256: remoteSha256 || null,
        remoteDownloadArchive: remoteDownloadArchive || null,
        remoteDownloadChwUrl: remoteDownloadChwUrl || null,
        remoteSha256Chw: remoteSha256Chw || null,
        remoteDownloadMirrorUrl: remoteDownloadMirrorUrl || null,
        remoteDownloadChwMirrorUrl: remoteDownloadChwMirrorUrl || null
      }

      const existingManual = existingMap.get(entry.id)
      if (existingManual) {
        const changed = existingManual.rootPath !== filePath
          || existingManual.sourceType !== sourceType
          || existingManual.name !== entry.name
          || existingManual.description !== (entry.description || '')
          || JSON.stringify(existingManual.keywords || []) !== JSON.stringify(entry.keywords || [])
          || (existingManual.entryFile || null) !== (entry.entryFile || null)
          || (existingManual.remoteDownloadUrl || null) !== (remoteDownloadUrl || null)
          || (existingManual.remoteSha256 || null) !== (remoteSha256 || null)
          || (existingManual.remoteDownloadArchive || null) !== (remoteDownloadArchive || null)
          || (existingManual.remoteDownloadChwUrl || null) !== (remoteDownloadChwUrl || null)
          || (existingManual.remoteSha256Chw || null) !== (remoteSha256Chw || null)
          || (existingManual.remoteDownloadMirrorUrl || null) !== (remoteDownloadMirrorUrl || null)
          || (existingManual.remoteDownloadChwMirrorUrl || null) !== (remoteDownloadChwMirrorUrl || null)

        if (changed) {
          this.saveManual({
            ...existingManual,
            name: entry.name,
            description: entry.description || '',
            keywords: entry.keywords || [],
            rootPath: filePath,
            sourceType,
            entryFile: entry.entryFile || null,
            builtin: true,
            indexStatus: 'none',
            docCount: 0,
            searchEntryEnabled: existingManual.searchEntryEnabled === undefined
              ? true
              : existingManual.searchEntryEnabled,
            ...patchRemote
          })
          this.removeIndexData(entry.id)
        } else {
          skipped++
        }
        continue
      }

      this.saveManual({
        id: entry.id,
        name: entry.name,
        description: entry.description || '',
        keywords: entry.keywords || [],
        rootPath: filePath,
        sourceType,
        entryFile: entry.entryFile || null,
        enabled: true,
        builtin: true,
        searchEntryEnabled: true,
        indexStatus: 'none',
        ...patchRemote
      })
      added++
    }

    return { added, skipped, removed }
  },

  _getAllRemoteManifestIds (manifest) {
    const s = new Set()
    if (!Array.isArray(manifest)) return s
    for (const e of manifest) {
      const u = e && e.downloadUrl && String(e.downloadUrl).trim()
      if (u) s.add(e.id)
    }
    return s
  },

  /**
   * First run (no storage): all remote manifest ids enabled (backward compatible).
   * Later: only stored ids that still exist in manifest.
   */
  _getRemoteBuiltinEnabledIdSet (manifest) {
    const allRemote = this._getAllRemoteManifestIds(manifest)
    try {
      if (!window.utools || !window.utools.dbStorage) return new Set()
      const raw = window.utools.dbStorage.getItem(STORAGE_KEYS.REMOTE_BUILTIN_ENABLED)
      if (!raw) {
        window.utools.dbStorage.setItem(
          STORAGE_KEYS.REMOTE_BUILTIN_ENABLED,
          JSON.stringify({ v: 1, ids: [] })
        )
        return new Set()
      }
      const o = JSON.parse(raw)
      const arr = Array.isArray(o.ids) ? o.ids.map(String) : []
      return new Set(arr.filter(id => allRemote.has(id)))
    } catch {
      return new Set()
    }
  },

  getRemoteBuiltinEnabledIds () {
    const dir = this.getBuiltinManualsDir()
    if (!dir) return []
    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8'))
    } catch { return [] }
    return [...this._getRemoteBuiltinEnabledIdSet(manifest)]
  },

  setRemoteBuiltinEnabledIds (ids) {
    if (!window.utools || !window.utools.dbStorage) return
    const dir = this.getBuiltinManualsDir()
    const allowed = new Set()
    if (dir) {
      try {
        const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8'))
        if (Array.isArray(m)) {
          for (const e of m) {
            if (e.downloadUrl && String(e.downloadUrl).trim()) allowed.add(e.id)
          }
        }
      } catch { /* */ }
    }
    const clean = [...new Set((ids || []).map(String).filter(id => allowed.has(id)))]
    window.utools.dbStorage.setItem(
      STORAGE_KEYS.REMOTE_BUILTIN_ENABLED,
      JSON.stringify({ v: 1, ids: clean })
    )
  },

  getBuiltinRemoteResourceCatalog () {
    const dir = this.getBuiltinManualsDir()
    if (!dir) return []
    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8'))
    } catch { return [] }
    if (!Array.isArray(manifest)) return []
    const enabled = this._getRemoteBuiltinEnabledIdSet(manifest)
    const cacheRoot = this.getBuiltinRemoteCacheRoot()
    const out = []
    for (const entry of manifest) {
      if (RESOURCE_CENTER_CATALOG_HIDDEN_IDS.has(entry.id)) continue
      const url = entry.downloadUrl && String(entry.downloadUrl).trim()
        ? String(entry.downloadUrl).trim()
        : ''
      if (!url) continue
      const relSafe = String(entry.fileName || '').replace(/^[\\/]+/, '')
      const bundlePath = path.join(dir, entry.fileName)
      const cachePath = path.join(cacheRoot, entry.id, relSafe)
      const filePath = fs.existsSync(bundlePath) ? bundlePath : cachePath
      const exists = fs.existsSync(filePath)
      let chwOk = true
      if (exists && entry.downloadUrlChw && String(entry.downloadUrlChw).trim()
        && /\.chm$/i.test(entry.fileName || '')) {
        const chwPath = path.join(
          path.dirname(filePath),
          path.basename(filePath, path.extname(filePath)) + '.chw'
        )
        chwOk = fs.existsSync(chwPath)
      }
      const downloaded = exists && chwOk
      out.push({
        id: entry.id,
        name: entry.name || entry.id,
        description: entry.description || '',
        enabled: enabled.has(entry.id),
        downloaded,
        downloadUrl: url,
        downloadArchive:
          entry.downloadArchive && String(entry.downloadArchive).trim().toLowerCase() === 'zip'
            ? 'zip'
            : null,
        hasCompanionChw: !!(entry.downloadUrlChw && String(entry.downloadUrlChw).trim())
      })
    }
    return out
  },

  /**
   * 强制重下前清理缓存目录中的主文件、.part、CHM 配套 .chw、ZIP 临时包与解压目录。
   */
  _clearRemoteBuiltinCacheArtifacts (cachePath, archiveFormat, hasCompanionChw) {
    const resolved = path.resolve(String(cachePath || ''))
    if (!resolved) return
    const parentDir = path.dirname(resolved)
    const zipBase = path.join(parentDir, '_pm_remote_zip_dl')
    try {
      if (fs.existsSync(zipBase + '.part')) fs.unlinkSync(zipBase + '.part')
    } catch { /* */ }
    try {
      if (fs.existsSync(zipBase)) fs.unlinkSync(zipBase)
    } catch { /* */ }
    if (archiveFormat === 'zip') {
      try {
        if (fs.existsSync(resolved)) {
          fs.rmSync(resolved, { recursive: true, force: true })
        }
      } catch { /* */ }
      return
    }
    const ext = path.extname(resolved).toLowerCase()
    if (ext === '.chm' && hasCompanionChw) {
      const chw = path.join(
        path.dirname(resolved),
        path.basename(resolved, ext) + '.chw'
      )
      try {
        if (fs.existsSync(chw + '.part')) fs.unlinkSync(chw + '.part')
      } catch { /* */ }
      try {
        if (fs.existsSync(chw)) fs.unlinkSync(chw)
      } catch { /* */ }
    }
    try {
      if (fs.existsSync(resolved + '.part')) fs.unlinkSync(resolved + '.part')
    } catch { /* */ }
    try {
      if (fs.existsSync(resolved)) fs.unlinkSync(resolved)
    } catch { /* */ }
  },

  /**
   * @param {string} manifestId
   * @param {{ force?: boolean, onProgress?: function }} [userOpts] force：忽略已存在且校验通过的文件并重下
   */
  async downloadRemoteBuiltinById (manifestId, userOpts) {
    const dir = this.getBuiltinManualsDir()
    if (!dir) throw new Error('builtin dir missing')
    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8'))
    } catch {
      throw new Error('manifest read failed')
    }
    if (!Array.isArray(manifest)) throw new Error('bad manifest')
    const entry = manifest.find(e => e.id === manifestId)
    if (!entry) throw new Error('unknown manual id')
    const url = entry.downloadUrl && String(entry.downloadUrl).trim()
      ? String(entry.downloadUrl).trim()
      : ''
    if (!url) throw new Error('not a remote release item')
    const relSafe = String(entry.fileName || '').replace(/^[\\/]+/, '')
    const cacheRoot = this.getBuiltinRemoteCacheRoot()
    const cachePath = path.join(cacheRoot, entry.id, relSafe)
    const bundlePath = path.join(dir, entry.fileName)
    if (fs.existsSync(bundlePath)) {
      return { path: bundlePath, bundled: true }
    }

    const uo = userOpts && typeof userOpts === 'object' ? userOpts : {}
    const onProgress = typeof uo.onProgress === 'function' ? uo.onProgress : undefined
    const force = !!uo.force

    if (this._builtinDlAbortById.has(manifestId)) {
      const e = new Error('已在下载中')
      e.code = 'PM_BUSY'
      throw e
    }

    const controller = new AbortController()
    this._builtinDlAbortById.set(manifestId, controller)

    const sha256 = entry.sha256 && String(entry.sha256).trim()
      ? String(entry.sha256).trim().toLowerCase()
      : undefined
    const archiveFormat =
      entry.downloadArchive && String(entry.downloadArchive).trim().toLowerCase() === 'zip'
        ? 'zip'
        : undefined
    const companionUrl = entry.downloadUrlChw && String(entry.downloadUrlChw).trim()
      ? String(entry.downloadUrlChw).trim()
      : undefined
    const companionSha256 = companionUrl && entry.sha256Chw && String(entry.sha256Chw).trim()
      ? String(entry.sha256Chw).trim().toLowerCase()
      : undefined
    const urlMirror = entry.downloadUrlMirror && String(entry.downloadUrlMirror).trim()
      ? String(entry.downloadUrlMirror).trim()
      : undefined
    const companionUrlMirror = companionUrl && entry.downloadUrlChwMirror && String(entry.downloadUrlChwMirror).trim()
      ? String(entry.downloadUrlChwMirror).trim()
      : undefined
    const hasCompanionChw = !!(
      companionUrl && /\.chm$/i.test(String(entry.fileName || ''))
    )

    try {
      if (force) {
        this._clearRemoteBuiltinCacheArtifacts(cachePath, archiveFormat, hasCompanionChw)
      }
      fs.mkdirSync(path.dirname(cachePath), { recursive: true })
      await this.downloadRemoteBuiltinAsset({
        url,
        urlMirror,
        destPath: cachePath,
        sha256,
        archiveFormat,
        entryFile: entry.entryFile || undefined,
        companionUrl,
        companionUrlMirror,
        companionSha256,
        onProgress,
        signal: controller.signal
      })
      return { path: cachePath, bundled: false }
    } finally {
      this._builtinDlAbortById.delete(manifestId)
    }
  },

  _httpsGetJson (urlString, redirectLeft = 10) {
    return new Promise((resolve, reject) => {
      let u
      try {
        u = new URL(urlString)
      } catch {
        return reject(new Error('Invalid URL'))
      }
      const lib = u.protocol === 'https:' ? https : http
      const req = lib.get(
        urlString,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'ProcedurManual-uTools/1.0 (+https://github.com/MXS81/Procedur_Manual)'
          }
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            if (redirectLeft <= 0) {
              res.resume()
              return reject(new Error('Too many redirects'))
            }
            let next = res.headers.location
            if (!/^https?:/i.test(next)) {
              try {
                next = new URL(next, urlString).href
              } catch {
                res.resume()
                return reject(new Error('Bad redirect URL'))
              }
            }
            res.resume()
            return resolve(this._httpsGetJson(next, redirectLeft - 1))
          }
          if (res.statusCode !== 200) {
            res.resume()
            return reject(new Error('HTTP ' + res.statusCode))
          }
          const chunks = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
            } catch (e) {
              reject(e)
            }
          })
        }
      )
      req.on('error', reject)
      req.setTimeout(120000, () => {
        req.destroy()
        reject(new Error('Request timeout'))
      })
    })
  },

  _findFileNamedRecursive (startDir, baseNameLower) {
    const stack = [startDir]
    while (stack.length) {
      const d = stack.pop()
      let names
      try {
        names = fs.readdirSync(d)
      } catch {
        continue
      }
      for (const n of names) {
        if (n.startsWith('.')) continue
        const p = path.join(d, n)
        let st
        try {
          st = fs.statSync(p)
        } catch {
          continue
        }
        if (st.isDirectory()) stack.push(p)
        else if (n.toLowerCase() === baseNameLower) return p
      }
    }
    return null
  },

  _copyDirRecursive (src, dest) {
    fs.mkdirSync(dest, { recursive: true })
    for (const n of fs.readdirSync(src)) {
      const s = path.join(src, n)
      const d = path.join(dest, n)
      const st = fs.statSync(s)
      if (st.isDirectory()) this._copyDirRecursive(s, d)
      else fs.copyFileSync(s, d)
    }
  },

  _appendUserPathWin32 (binPath) {
    const p = String(binPath || '')
    const b64 = Buffer.from(p, 'utf8').toString('base64')
    const ps = [
      '$ErrorActionPreference = "Stop"',
      `$b = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("${b64}"))`,
      '$cur = [Environment]::GetEnvironmentVariable("Path", "User")',
      '$norm = { param($x) if (-not $x) { return "" }; ($x -replace "\\\\$","").TrimEnd([char]92) }',
      '$bn = & $norm $b',
      '$parts = @()',
      'if ($cur) { $parts = $cur -split ";" | ForEach-Object { & $norm $_ } | Where-Object { $_ } }',
      '$already = $parts | Where-Object { $_ -ieq $bn }',
      'if (-not $already) { $np = if ($cur) { $cur + ";" + $b } else { $b }; [Environment]::SetEnvironmentVariable("Path", $np, "User") }'
    ].join('; ')
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
      windowsHide: true,
      timeout: 60000,
      encoding: 'utf8'
    })
  },

  /**
   * Windows: download oschwartz10612/poppler-windows latest Release-*.zip, install under
   * %LOCALAPPDATA%\\Programs\\Poppler, append User PATH (Library\\bin).
   */
  async installPopplerWindows () {
    if (process.platform !== 'win32') {
      throw new Error('Poppler auto-install is Windows-only')
    }
    const sevenZip = this._find7zExe()
    if (!sevenZip) {
      throw new Error(
        '7-Zip not found (bundled tools/7za or PM_SEVEN_ZIP / system 7-Zip required)'
      )
    }
    const repo = 'oschwartz10612/poppler-windows'
    const rel = await this._httpsGetJson('https://api.github.com/repos/' + repo + '/releases/latest')
    const assets = rel.assets || []
    const asset = assets.find((a) => a && a.name && /^Release-.+\.zip$/i.test(a.name))
    if (!asset || !asset.browser_download_url) {
      throw new Error('No Release-*.zip asset on latest release')
    }
    const zip = path.join(os.tmpdir(), asset.name)
    await this._downloadHttpToFileImpl(asset.browser_download_url, zip, 12)
    const extractTmp = path.join(os.tmpdir(), 'pm-poppler-' + crypto.randomBytes(8).toString('hex'))
    fs.mkdirSync(extractTmp, { recursive: true })
    try {
      const outSw = /\s/.test(extractTmp)
        ? '-o"' + extractTmp.replace(/"/g, '') + '"'
        : '-o' + extractTmp
      execFileSync(sevenZip, ['x', zip, outSw, '-y', '-bb0'], {
        timeout: 900000,
        windowsHide: true,
        stdio: 'ignore'
      })
    } finally {
      try {
        fs.unlinkSync(zip)
      } catch { /* */ }
    }
    let inner = null
    try {
      const subs = fs
        .readdirSync(extractTmp)
        .map((n) => path.join(extractTmp, n))
        .filter((p) => {
          try {
            return fs.statSync(p).isDirectory()
          } catch {
            return false
          }
        })
      inner = subs.find((p) => !path.basename(p).startsWith('.')) || subs[0] || null
    } catch { /* */ }
    if (!inner) {
      try {
        fs.rmSync(extractTmp, { recursive: true, force: true })
      } catch { /* */ }
      throw new Error('No folder after unzip')
    }
    const probe = this._findFileNamedRecursive(inner, 'pdftotext.exe')
    if (!probe) {
      try {
        fs.rmSync(extractTmp, { recursive: true, force: true })
      } catch { /* */ }
      throw new Error('pdftotext.exe not found in archive')
    }
    const la = process.env.LOCALAPPDATA || ''
    const installRoot = path.join(la, 'Programs', 'Poppler')
    const parent = path.dirname(installRoot)
    try {
      fs.mkdirSync(parent, { recursive: true })
    } catch { /* */ }
    try {
      if (fs.existsSync(installRoot)) fs.rmSync(installRoot, { recursive: true, force: true })
    } catch { /* */ }
    fs.mkdirSync(installRoot, { recursive: true })
    for (const n of fs.readdirSync(inner)) {
      const s = path.join(inner, n)
      const d = path.join(installRoot, n)
      const st = fs.statSync(s)
      if (st.isDirectory()) this._copyDirRecursive(s, d)
      else fs.copyFileSync(s, d)
    }
    try {
      fs.rmSync(extractTmp, { recursive: true, force: true })
    } catch { /* */ }
    const binPath = path.join(installRoot, 'Library', 'bin')
    const exe = path.join(binPath, 'pdftotext.exe')
    if (!fs.existsSync(exe)) {
      throw new Error('Expected ' + exe + ' missing after install')
    }
    this._appendUserPathWin32(binPath)
    return { binPath, exe }
  },

  getRuntimePlatform () {
    return process.platform
  },

  /** True if pdftotext runs (PATH or LOCALAPPDATA\\Programs\\poppler*). */
  isPopplerPdftotextAvailable () {
    const maxBuffer = 4 * 1024 * 1024
    for (const bin of this._pdftotextCandidateBins()) {
      try {
        execFileSync(bin, ['-v'], {
          encoding: 'utf8',
          maxBuffer,
          windowsHide: true,
          timeout: 12000,
          stdio: ['ignore', 'pipe', 'pipe']
        })
        return true
      } catch { /* try next */ }
    }
    return false
  },

  // ========== Dynamic uTools Feature Registration ==========

  _FEATURE_PREFIX: 'manual-quick-',
  _FEATURES_KEY: 'pm_registered_features',

  /**
   * uTools main search matches string cmds; { type:'over', label } alone is often not enough for the name.
   * "???" card toggle: only manuals with searchEntryEnabled !== false get setFeature (false = opt-out).
   */
  _mainSearchEntryOn (manual) {
    return manual.searchEntryEnabled !== false
  },

  _buildManualFeatureCmds (manual) {
    const label = (manual.name || '').trim() || '手册'
    const cmds = [{ type: 'over', label }]
    const seen = new Set()
    const pushStr = (s) => {
      const t = String(s || '').trim()
      if (!t || seen.has(t)) return
      seen.add(t)
      cmds.push(t)
    }
    pushStr(manual.name)
    for (const kw of manual.keywords || []) {
      pushStr(kw)
    }
    return cmds
  },

  syncManualFeatures () {
    if (!window.utools) return

    const manuals = this.getAllManuals()
    const prevCodes = (() => {
      try {
        const raw = window.utools.dbStorage.getItem(this._FEATURES_KEY)
        return raw ? JSON.parse(raw) : []
      } catch { return [] }
    })()

    const activeCodes = new Set()

    for (const manual of manuals) {
      if (!manual.enabled) continue
      if (!this._mainSearchEntryOn(manual)) continue

      const code = this._FEATURE_PREFIX + manual.id
      activeCodes.add(code)

      try {
        const cmds = this._buildManualFeatureCmds(manual)
        window.utools.setFeature({
          code,
          explain: manual.description || manual.name || '',
          cmds
        })
      } catch (e) {
        console.warn('setFeature failed for', code, e.message)
      }
    }

    for (const code of prevCodes) {
      if (!activeCodes.has(code)) {
        try { window.utools.removeFeature(code) } catch {}
      }
    }

    window.utools.dbStorage.setItem(
      this._FEATURES_KEY,
      JSON.stringify([...activeCodes])
    )
  },

  // ========== Settings ==========

  getSettings () {
    const data = window.utools.dbStorage.getItem(STORAGE_KEYS.SETTINGS)
    return data ? JSON.parse(data) : {}
  },

  saveSettings (settings) {
    window.utools.dbStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings))
  },

  // ========== PDF Extraction ==========
  // Indexing uses Poppler pdftotext only (no bundled pdf-parse/pdfjs ~90MB).
  // https://github.com/oschwartz10612/poppler-windows/releases/

  _pdftotextCandidateBins () {
    const out = ['pdftotext', 'pdftotext.exe']
    const la = process.env.LOCALAPPDATA || ''
    const pf = process.env.ProgramFiles || ''
    const pfx86 = process.env['ProgramFiles(x86)'] || ''
    const tryDir = (dir) => {
      if (!dir) return
      const exe = path.join(dir, 'pdftotext.exe')
      if (fs.existsSync(exe)) out.push(exe)
    }
    try {
      const popplerRoot = path.join(la, 'Programs')
      if (fs.existsSync(popplerRoot)) {
        for (const name of fs.readdirSync(popplerRoot)) {
          if (/^poppler/i.test(name)) {
            tryDir(path.join(popplerRoot, name, 'Library', 'bin'))
            tryDir(path.join(popplerRoot, name, 'bin'))
          }
        }
      }
    } catch { /* ignore */ }
    tryDir(path.join(pf, 'poppler', 'bin'))
    tryDir(path.join(pfx86, 'poppler', 'bin'))
    return [...new Set(out)]
  },

  _extractPdfTextPdftotextSync (filePath, opts) {
    const useLayout = !opts || opts.layout !== false
    const args = useLayout
      ? ['-layout', '-enc', 'UTF-8', filePath, '-']
      : ['-enc', 'UTF-8', filePath, '-']
    const maxBuffer = 80 * 1024 * 1024
    for (const bin of this._pdftotextCandidateBins()) {
      try {
        const text = execFileSync(bin, args, {
          encoding: 'utf8',
          maxBuffer,
          windowsHide: true,
          timeout: 180000
        })
        if (text && String(text).trim().length > 20) return String(text)
      } catch { /* try next */ }
    }
    return ''
  },

  /**
   * PDF text chunks for index (Poppler pdftotext). Page breaks: form-feed in output (no -layout); fallback -layout = single doc.
   */
  async extractPdfIndexChunks (filePath, onProgress) {
    let raw = this._extractPdfTextPdftotextSync(filePath, { layout: false })
    if (!raw || String(raw).trim().length < 12) {
      raw = this._extractPdfTextPdftotextSync(filePath, { layout: true })
    }
    if (!raw || String(raw).trim().length < 12) return []

    const baseTitle = path.basename(filePath, path.extname(filePath))
    const text = String(raw).trim()
    const parts = text.split(/\f+/).map((s) => s.trim()).filter((s) => s.length >= 8)

    if (parts.length <= 1) {
      if (onProgress) onProgress(1, 1)
      return [{ pageNum: 1, title: baseTitle, text }]
    }

    const maxPages = Math.min(parts.length, 600)
    const chunks = []
    for (let i = 0; i < maxPages; i++) {
      const t = parts[i]
      const lines = t.split(/\n/).map((l) => l.trim()).filter(Boolean)
      const title = (lines[0] || ('第 ' + (i + 1) + ' 页')).substring(0, 120)
      chunks.push({ pageNum: i + 1, title, text: t })
      if (onProgress && (i % 3 === 0 || i === maxPages - 1)) {
        onProgress(Math.min(i + 1, maxPages), maxPages)
      }
    }
    return chunks
  },

  async extractPdfText (filePath) {
    const chunks = await this.extractPdfIndexChunks(filePath, null)
    if (!chunks.length) return ''
    return chunks.map(c => c.text).join('\n\n')
  },

  /**
   * ??????????? PDF ????????? base64 ??? uTools/WebView ?????????????????????????? file://???????????????????? file:// ?????????????
   */
  getPdfViewerUrl (filePath) {
    const INLINE_MAX = 8 * 1024 * 1024
    try {
      if (!filePath || !fs.existsSync(filePath)) return { kind: 'error', message: '???????????????' }
      const st = fs.statSync(filePath)
      if (!st.isFile()) return { kind: 'error', message: '????????????' }
      if (st.size <= INLINE_MAX) {
        return { kind: 'inline-base64', base64: fs.readFileSync(filePath).toString('base64') }
      }
      return { kind: 'file', url: pathToFileURL(path.resolve(filePath)).href }
    } catch (e) {
      return { kind: 'error', message: e.message || String(e) }
    }
  },

  // ========== CHM Decompilation ==========
  // ??????/??????? CHM ????????????? _resolveChmFilePath?????????????????..???file://?????????/index???.hhc ????????????????
  // ??????????????????? # ?????????? ChmReader ??????????.hhc ?????????? </ul> ?????????? liStack ?????????? <li>???????????????????????????????????

  /** ?????????????????????????? HTML ??? .hhc??????????????????????????????????????????????????????????? */
  _chmExtractLooksUsable (extractDir) {
    try {
      const extGroups = [['.html', '.htm'], ['.xhtml', '.shtml']]
      for (const exts of extGroups) {
        const html = this.scanDir(extractDir, exts, { maxFiles: 4 })
        if (html.length > 0) return true
      }
      return !!this._findChmCompanionFile(extractDir, /\.hhc$/i, 4)
    } catch {
      return false
    }
  },

  _findHhExe () {
    if (process.platform !== 'win32') return 'hh.exe'
    const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows'
    const full = path.join(root, 'hh.exe')
    try {
      if (fs.existsSync(full)) return full
    } catch { /* */ }
    return 'hh.exe'
  },

  /** ???????????????public/tools ??? dist/tools??????????????? copy-bundled-7za.mjs ??? 7zip-bin-win ?????????? */
  _bundled7zExePath () {
    try {
      const toolDir = path.join(__dirname, '..', 'tools')
      const sevenZa = path.join(toolDir, '7za.exe')
      if (fs.existsSync(sevenZa)) return sevenZa
      const z7 = path.join(toolDir, '7z.exe')
      const dll = path.join(toolDir, '7z.dll')
      if (fs.existsSync(z7) && fs.existsSync(dll)) return z7
    } catch { /* */ }
    return null
  },

  /** 7-Zip???PM_SEVEN_ZIP ??? ?????? tools ??? ???????????????????? + PATH?????????? CHM ??? 7z ??????????hh.exe ????????????? */
  _find7zExe () {
    const env7 = process.env.PM_SEVEN_ZIP
    try {
      if (env7 && fs.existsSync(env7)) return env7
    } catch { /* */ }
    const bundled = this._bundled7zExePath()
    if (bundled) return bundled
    const candidates = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', '7-Zip', '7z.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', '7-Zip', '7z.exe'),
      path.join(process.env.ProgramW6432 || 'C:\\Program Files', '7-Zip', '7z.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', '7-Zip', '7z.exe')
    ]
    for (const p of candidates) {
      try {
        if (p && fs.existsSync(p)) return p
      } catch { /* */ }
    }
    const pat = process.env.PATH || ''
    for (const dir of pat.split(path.delimiter)) {
      const t = (dir || '').trim()
      if (!t) continue
      const exe = path.join(t, '7z.exe')
      try {
        if (fs.existsSync(exe)) return exe
      } catch { /* */ }
    }
    return null
  },

  _syncSleep (ms) {
    try {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
    } catch {
      const end = Date.now() + ms
      while (Date.now() < end) { /* busy wait fallback */ }
    }
  },

  _hasFiles (dir) {
    try { return fs.readdirSync(dir).length > 0 } catch { return false }
  },

  _chmRmExtractDir (extractDir) {
    try { fs.rmSync(extractDir, { recursive: true, force: true }) } catch { /* */ }
  },

  /** ??? SearchService CHM_INDEX_MAX_HTML_FILES ??????????????????????????????????????????????????????? HTML ?????? */
  _CHM_CONTENT_SCAN_MAX_FILES: 2000,

  decompileChm (chmPath) {
    if (!chmPath) {
      throw new Error('CHM ?????????????')
    }
    const resolvedChm = path.resolve(chmPath)
    let chmSize = 0
    try {
      if (!fs.existsSync(resolvedChm) || !fs.statSync(resolvedChm).isFile()) {
        throw new Error('CHM ????????????????????????????????')
      }
      chmSize = fs.statSync(resolvedChm).size
    } catch (e) {
      if (e.message && e.message.includes('CHM')) throw e
      throw new Error('CHM ????????????????????????????????')
    }

    const hash = crypto.createHash('md5').update(resolvedChm).digest('hex').substring(0, 12)
    const extractDir = path.join(os.tmpdir(), 'pm_chm_' + hash)

    if (fs.existsSync(extractDir)) {
      if (this._hasFiles(extractDir) && this._chmExtractLooksUsable(extractDir)) {
        return extractDir
      }
      this._chmRmExtractDir(extractDir)
    }
    fs.mkdirSync(extractDir, { recursive: true })

    let workChm = resolvedChm
    let workChmTemp = null
    if (process.platform === 'win32' && /[^ -]/.test(resolvedChm)) {
      workChmTemp = path.join(os.tmpdir(), 'pm_chm_in_' + hash + '.chm')
      try {
        fs.copyFileSync(resolvedChm, workChmTemp)
        workChm = workChmTemp
      } catch (e) {
        throw new Error('CHM 无法复制到临时路径（非 ASCII 路径时需 ASCII 临时副本）: ' + (e.message || String(e)))
      }
    }

    const hhPath = this._findHhExe()
    const sevenZip = this._find7zExe()
    const outSwitch = /\s/.test(extractDir)
      ? '-o"' + extractDir.replace(/"/g, '') + '"'
      : '-o' + extractDir

    const largeChm = chmSize > 18 * 1024 * 1024
    const timeout7z = largeChm ? 900000 : 300000
    const timeoutHh = largeChm ? 600000 : 180000

    const waitUsable = (maxWait) => {
      for (let i = 0; i < maxWait; i++) {
        if (this._hasFiles(extractDir) && this._chmExtractLooksUsable(extractDir)) return true
        this._syncSleep(350)
      }
      return this._chmExtractLooksUsable(extractDir)
    }

    const run7z = () => {
      if (!sevenZip) return false
      try {
        execFileSync(sevenZip, ['x', workChm, outSwitch, '-y', '-bb0'], {
          timeout: timeout7z, windowsHide: true, stdio: 'ignore'
        })
      } catch { /* 7z ??????????????????????????????????? */ }
      return waitUsable(largeChm ? 48 : 20)
    }

    const runHh = () => {
      try {
        execFileSync(hhPath, ['-decompile', extractDir, workChm], {
          timeout: timeoutHh, windowsHide: true, stdio: 'ignore'
        })
      } catch { /* hh ?????????????????? */ }
      return waitUsable(largeChm ? 56 : 24)
    }

    try {
      if (run7z()) return extractDir
      this._chmRmExtractDir(extractDir)
      fs.mkdirSync(extractDir, { recursive: true })

      if (runHh()) return extractDir

      if (sevenZip) {
        this._chmRmExtractDir(extractDir)
        fs.mkdirSync(extractDir, { recursive: true })
        if (run7z()) return extractDir
      }

      this._chmRmExtractDir(extractDir)

      const hint = sevenZip
        ? '已尝试 7-Zip 与 hh.exe，解压结果仍无可读页面。请确认 CHM 未损坏、非加密。'
        : '未找到 7-Zip 可执行文件（内置 public/tools/7za.exe 缺失时请重新执行 npm run build 或 npm run bundle:7za）。亦可安装系统版 7-Zip 或设置环境变量 PM_SEVEN_ZIP。'

      throw new Error('CHM 解压失败：' + hint)
    } finally {
      if (workChmTemp) {
        try { fs.unlinkSync(workChmTemp) } catch { /* */ }
      }
    }
  },

  _findChmCompanionFile (extractDir, extRegex, maxDepth = 6) {
    const skip = this._SCAN_SKIP_DIRS
    const walk = (dir, depth) => {
      if (depth > maxDepth) return null
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const e of entries) {
          const full = path.join(dir, e.name)
          if (e.isDirectory()) {
            if (skip.has(e.name)) continue
            const hit = walk(full, depth + 1)
            if (hit) return hit
          } else if (extRegex.test(e.name)) {
            return full
          }
        }
      } catch { /* skip */ }
      return null
    }
    return walk(extractDir, 0)
  },

  /**
   * CHM .hhc/.hhk ??? Local ????????? file:///???????????????????URL ????????? mk:@MSITStore:/ms-its:
   * ?????????????????????????????????????????????????? # ???????????????????????????????
   */
  _normalizeChmLocal (local) {
    if (!local) return ''
    let s = String(local).trim().split('#')[0]
    try {
      s = decodeURIComponent(s.replace(/\+/g, ' '))
    } catch { /* ???????????????????????????? */ }

    const lower = s.toLowerCase()
    if (lower.startsWith('file:')) {
      try {
        const u = new URL(s)
        let p = u.pathname || ''
        if (/^\/[a-zA-Z]:\//.test(p)) p = p.slice(1)
        s = decodeURIComponent(p).replace(/\//g, path.sep)
      } catch {
        s = s.replace(/^file:\/+[^/]*/i, '').replace(/^\/+/, '')
        s = s.replace(/\//g, path.sep)
      }
    }

    if (lower.startsWith('mk:@msitstore:') || lower.startsWith('mk:@')) {
      const parts = s.split(/::\\?/i)
      if (parts.length >= 2) s = parts[parts.length - 1].replace(/^[/\\]+/, '')
    } else if (lower.startsWith('ms-its:')) {
      const idx = s.indexOf('::')
      if (idx !== -1) s = s.slice(idx + 2).replace(/^[/\\]+/, '')
    }
    return s.replace(/\\/g, '/')
  },

  /** .hhc/.hhk ??? PARAM ??? VALUE ??? &amp;???&quot; ???????????????????????? */
  _unescapeHhcAttr (s) {
    if (s == null || s === '') return ''
    return String(s)
      .replace(/&#x([0-9a-f]+);/gi, (full, h) => {
        const n = parseInt(h, 16)
        return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : full
      })
      .replace(/&#([0-9]{1,7});/g, (full, d) => {
        const n = parseInt(d, 10)
        return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : full
      })
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
  },

  /** ??????? filePath ????????? extract ????????????relative ?????? .. ?????????????????????????????? */
  _chmFileWithinExtract (filePath, extractRootResolved) {
    const rel = path.relative(extractRootResolved, filePath)
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
  },

  /** candidate ????????????? root ?????????????????? root ????????? */
  _pathUnderChmRoot (candidate, root) {
    const r = path.resolve(root)
    const c = path.resolve(candidate)
    const rel = path.relative(r, c)
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
  },

  /**
   * ??? CHM ???????????????????? Local?????? ../?????????????????????????????????????????????????????????? index.html
   */
  _resolveChmPathSmart (root, relPosix) {
    const parts = relPosix.split(/[/\\]+/).filter(p => p && p !== '.')
    let current = root
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i]
      if (seg === '..') {
        const parent = path.dirname(current)
        if (!this._pathUnderChmRoot(parent, root)) return null
        current = parent
        continue
      }
      const isLast = i === parts.length - 1
      let entries
      try {
        entries = fs.readdirSync(current, { withFileTypes: true })
      } catch {
        return null
      }
      const found = entries.find(e => {
        if (e.name.toLowerCase() !== seg.toLowerCase()) return false
        return isLast ? e.isFile() : e.isDirectory()
      })
      if (!found) {
        if (isLast) {
          const asDir = entries.find(
            e => e.isDirectory() && e.name.toLowerCase() === seg.toLowerCase()
          )
          if (asDir) {
            const sub = path.join(current, asDir.name)
            for (const idx of ['index.html', 'index.htm', 'INDEX.HTML', 'default.html']) {
              const p = path.join(sub, idx)
              try {
                if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
              } catch { /* */ }
            }
          }
        }
        return null
      }
      current = path.join(current, found.name)
    }
    return current
  },

  _resolveChmFilePath (extractDir, relPosix) {
    const root = path.resolve(extractDir)
    let pathOnly = String(relPosix || '').split('#')[0].trim()
    const qm = pathOnly.indexOf('?')
    if (qm >= 0) pathOnly = pathOnly.slice(0, qm).trim()
    if (!pathOnly) return null
    const relOs = pathOnly.replace(/\//g, path.sep)
    const quick = path.resolve(root, relOs)
    try {
      if (
        this._chmFileWithinExtract(quick, root) &&
        fs.existsSync(quick) &&
        fs.statSync(quick).isFile()
      ) {
        return quick
      }
    } catch { /* */ }

    const relNorm = pathOnly.replace(/\\/g, '/')
    let smart
    try {
      smart = this._resolveChmPathSmart(root, relNorm)
    } catch {
      smart = null
    }
    if (
      smart &&
      this._chmFileWithinExtract(smart, root) &&
      fs.existsSync(smart) &&
      fs.statSync(smart).isFile()
    ) {
      return smart
    }
    return null
  },

  /** ??????????? Local ???????????????? extract ???????????????????????????????????????????????????????? */
  _canonicalizeChmLocal (extractDir, rawLocal) {
    const norm = this._normalizeChmLocal(rawLocal)
    if (!norm) return ''
    const root = path.resolve(extractDir)
    let rel = norm

    const normOs = norm.replace(/\//g, path.sep)
    if (path.isAbsolute(normOs)) {
      try {
        const abs = path.resolve(normOs)
        const r = path.relative(root, abs)
        if (!r.startsWith('..') && !path.isAbsolute(r)) rel = r.replace(/\\/g, '/')
      } catch { /* keep rel */ }
    }

    const hit = this._resolveChmFilePath(extractDir, rel)
    if (hit) return path.relative(root, hit).replace(/\\/g, '/')
    return rel
  },

  _finalizeChmTocLocals (nodes, extractDir) {
    if (!nodes || !nodes.length) return
    const visit = (arr) => {
      for (const n of arr) {
        if (n.local) n.local = this._canonicalizeChmLocal(extractDir, n.local)
        if (n.children && n.children.length) visit(n.children)
      }
    }
    visit(nodes)
  },

  _firstTocLocal (nodes) {
    if (!nodes || !nodes.length) return ''
    for (const n of nodes) {
      const loc = n.local && String(n.local).trim()
      if (loc) return loc
      const c = this._firstTocLocal(n.children)
      if (c) return c
    }
    return ''
  },

  /**
   * ???? UTF-8 ??????????????????? script/stylesheet ????????? srcdoc?????????? GBK ?????????? .js/.css ??????
   */
  _inlineChmExternalAssets (html, extractDir, pageDirPosix, decoderLabel) {
    if (!decoderLabel || decoderLabel === 'utf-8') return html
    const pageDir = pageDirPosix ? pageDirPosix.replace(/\//g, path.sep) : ''
    const baseRes = path.resolve(extractDir)
    const basePrefix = baseRes.endsWith(path.sep) ? baseRes : baseRes + path.sep

    const resolveUnderExtract = (relSrc) => {
      if (!relSrc || /^\s*(https?:|javascript:|data:)/i.test(relSrc)) return null
      const rel = relSrc.replace(/\//g, path.sep)
      const full = path.normalize(path.join(extractDir, pageDir, rel))
      if (full !== baseRes && !full.startsWith(basePrefix)) return null
      try {
        if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null
      } catch { return null }
      return full
    }

    const readSub = (full) => {
      try {
        const b = fs.readFileSync(full)
        try {
          return new TextDecoder(decoderLabel).decode(b)
        } catch {
          return this.readTextFile(full)
        }
      } catch {
        return null
      }
    }

    let out = html
    out = out.replace(/<script\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>\s*<\/script>/gi, (fullTag, q, src) => {
      const p = resolveUnderExtract(src.trim())
      if (!p) return fullTag
      const inner = readSub(p)
      if (inner == null) return fullTag
      const safe = inner.replace(/<\/script>/gi, '<\\/script>')
      const openMatch = fullTag.match(/^<script\b[^>]*>/i)
      const open = openMatch ? openMatch[0] : '<script>'
      const innerAttrs = open.replace(/^<script\b/i, '').replace(/>$/i, '')
      const stripped = innerAttrs
        .replace(/\ssrc\s*=\s*(["'])[^"']*\1/gi, '')
        .replace(/\scharset\s*=\s*(["'])[^"']*\1/gi, '')
      return '<script' + stripped + '>\n' + safe + '\n</script>'
    })

    out = out.replace(/<link\b[^>]*>/gi, (fullTag) => {
      if (!/\brel\s*=\s*["']stylesheet["']/i.test(fullTag)) return fullTag
      const hm = fullTag.match(/\bhref\s*=\s*(["'])([^"']+)\1/i)
      if (!hm) return fullTag
      const href = hm[2].trim()
      if (/^\s*https?:/i.test(href)) return fullTag
      const p = resolveUnderExtract(href)
      if (!p || !/\.css$/i.test(p)) return fullTag
      const css = readSub(p)
      if (css == null) return fullTag
      const safeCss = css.replace(/<\/style>/gi, '<\\/style>')
      return '<style type="text/css">\n' + safeCss + '\n</style>'
    })

    return out
  },

  getChmInfo (chmPath) {
    const extractDir = this.decompileChm(chmPath)

    const hhcPath = this._findChmCompanionFile(extractDir, /\.hhc$/i)
    let toc = []
    if (hhcPath) {
      toc = this._parseHhc(hhcPath)
      this._finalizeChmTocLocals(toc, extractDir)
    }

    const hhkPath = this._findChmCompanionFile(extractDir, /\.hhk$/i)
    let indexEntries = []
    if (hhkPath) {
      indexEntries = this._parseHhk(hhkPath)
      for (const entry of indexEntries) {
        if (entry.local) entry.local = this._canonicalizeChmLocal(extractDir, entry.local)
      }
    }

    let defaultPage = this._firstTocLocal(toc)
    const capped = this.scanDir(extractDir, ['.html', '.htm'], { maxFiles: 800 })
    const fileCountApprox = capped.length >= 800 ? 800 : capped.length
    if (!defaultPage) {
      const pick = capped.find(f => /index\.html?$/i.test(f.name))
        || capped.find(f => /main\.html?$/i.test(f.name))
        || capped[0]
      if (pick) {
        defaultPage = pick.path.slice(extractDir.length).replace(/^[\\/]/, '').replace(/\\/g, '/')
      }
    }

    return { extractDir, toc, indexEntries, defaultPage, fileCount: fileCountApprox }
  },

  _injectChmViewBase (html, baseHref) {
    const safeBase = baseHref.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    const navGuard = `<script>(function(){` +
      `document.addEventListener("click",function(e){` +
      `var t=e.target;while(t&&t!==document&&(!t.tagName||t.tagName!=="A"))t=t.parentElement;` +
      `if(!t||!t.getAttribute)return;var h=t.getAttribute("href");` +
      `if(!h)return;var s=h.replace(/^\\s+/,"");` +
      `if(s.lastIndexOf("javascript:",0)===0||s.lastIndexOf("mailto:",0)===0||s.lastIndexOf("tel:",0)===0)return;` +
      `e.preventDefault();e.stopImmediatePropagation();` +
      `try{window.parent.postMessage({type:"pm-nav",href:h},"*")}catch(x){}` +
      `},true);})()</script>`
    const inject = `<meta charset="utf-8"><base href="${safeBase}">${navGuard}`
    const headMatch = html.match(/<head[^>]*>/i)
    if (headMatch) {
      const i = headMatch.index + headMatch[0].length
      return html.slice(0, i) + inject + html.slice(i)
    }
    const htmlMatch = html.match(/<html[^>]*>/i)
    if (htmlMatch) {
      const i = htmlMatch.index + htmlMatch[0].length
      return html.slice(0, i) + `<head>${inject}</head>` + html.slice(i)
    }
    return `<!DOCTYPE html><html><head>${inject}</head><body>` + html + '</body></html>'
  },

  /**
   * ?????????????????????? HTML????????????????????????? .chm ???????????????? HTML ???????????????
   * ?????????? _resolveChmFilePath???..????????????index?????????????????????????????????? API ?????? join
   */
  getChmPageSrcdoc (extractDir, relPath) {
    if (!relPath || !extractDir) return ''
    const pathOnly = String(relPath).split('#')[0].trim().replace(/\\/g, '/')
    const resolved = this._resolveChmFilePath(extractDir, pathOnly)
    if (!resolved) return ''

    const baseResolved = path.resolve(extractDir)
    const relFromRoot = path.relative(baseResolved, resolved).replace(/\\/g, '/')

    const buffer = fs.readFileSync(resolved)
    const declared = this._parseHtmlDeclaredCharset(buffer)
    let decoderLabel = this._decoderLabelForDeclaredCharset(declared)
    if (!decoderLabel) decoderLabel = this._detectEncoding(buffer, resolved)

    let str
    try {
      if (decoderLabel === 'utf-8' || decoderLabel === 'utf-16le' || decoderLabel === 'utf-16be') {
        str = this.readTextFile(resolved)
      } else {
        str = new TextDecoder(decoderLabel).decode(buffer)
      }
    } catch {
      str = this.readTextFile(resolved)
    }

    str = str.replace(/<meta\b[^>]*\bhttp-equiv\s*=\s*["']?\s*refresh\s*["']?[^>]*>/gi, '')

    const pageDirPosix = path.dirname(relFromRoot).split(path.sep).join('/')
    if (decoderLabel && decoderLabel !== 'utf-8') {
      str = this._inlineChmExternalAssets(str, extractDir, pageDirPosix, decoderLabel)
    }

    let baseRoot = 'file:///' + baseResolved.replace(/\\/g, '/')
    if (!baseRoot.endsWith('/')) baseRoot += '/'
    const dirRel = path.dirname(relFromRoot)
    const baseHref = (dirRel && dirRel !== '.')
      ? baseRoot + dirRel.split(path.sep).join('/') + '/'
      : baseRoot
    return this._injectChmViewBase(str, baseHref)
  },

  /**
   * ???????????? HTML ??????????????????? CHM ????????????????????????????????????? getChmPageSrcdoc
   */
  getBundledHtmlPageSrcdoc (rootDir, relPath) {
    return this.getChmPageSrcdoc(rootDir, relPath)
  },

  /**
   * ??? searchModes.compileSearchMatcher ???????????????? CHM/?????? HTML ????????????
   * opts: { matchCase?, wholeWord?, useRegex? }
   */
  _contentSearchFind (text, keyword, opts = {}) {
    const q = keyword?.trim()
    if (!q || !text) return null
    const matchCase = !!opts.matchCase
    const wholeWord = !!opts.wholeWord
    const useRegex = !!opts.useRegex
    const iflags = matchCase ? '' : 'i'
    const gflags = matchCase ? 'g' : 'gi'

    if (useRegex) {
      try {
        const reFind = new RegExp(q, iflags)
        const reCount = new RegExp(q, gflags)
        reFind.lastIndex = 0
        const m = reFind.exec(text)
        if (!m) return null
        let count = 0
        let x
        reCount.lastIndex = 0
        while ((x = reCount.exec(text)) !== null) {
          count++
          if (x[0].length === 0) reCount.lastIndex++
        }
        return { index: m.index, termLen: m[0].length, matchCount: count }
      } catch {
        return null
      }
    }

    const terms = q.split(/\s+/).filter(Boolean)
    const res = terms.map((term) => {
      const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const body = wholeWord ? `\\b${esc}\\b` : esc
      return new RegExp(body, iflags)
    })
    for (const re of res) {
      re.lastIndex = 0
      if (!re.test(text)) return null
    }
    let bestIdx = -1
    let bestLen = 0
    for (const re of res) {
      re.lastIndex = 0
      const m = re.exec(text)
      if (m && (bestIdx === -1 || m.index < bestIdx)) {
        bestIdx = m.index
        bestLen = m[0].length
      }
    }
    const esc0 = terms[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const body0 = wholeWord ? `\\b${esc0}\\b` : esc0
    const reCount0 = new RegExp(body0, gflags)
    let count = 0
    let p
    reCount0.lastIndex = 0
    while ((p = reCount0.exec(text)) !== null) {
      count++
      if (p[0].length === 0) reCount0.lastIndex++
    }
    return { index: bestIdx, termLen: bestLen, matchCount: count }
  },

  searchChmContent (extractDir, keyword, opts = {}) {
    if (!keyword || !keyword.trim()) return []
    const maxResults = typeof opts.maxResults === 'number' ? opts.maxResults : 80
    const htmlFiles = this.scanDir(extractDir, ['.html', '.htm'], {
      maxFiles: this._CHM_CONTENT_SCAN_MAX_FILES
    })
    const results = []

    for (const file of htmlFiles) {
      if (results.length >= maxResults) break
      try {
        const st = fs.statSync(file.path)
        if (st.size > 512 * 1024) continue
        const raw = this.readTextFileChmAware(file.path)
        const text = this.extractTextFromHtml(raw)
        const hit = this._contentSearchFind(text, keyword, opts)
        if (!hit) continue

        const snippetStart = Math.max(0, hit.index - 40)
        const snippetEnd = Math.min(text.length, hit.index + hit.termLen + 80)
        const snippet = (snippetStart > 0 ? '...' : '')
          + text.substring(snippetStart, snippetEnd)
          + (snippetEnd < text.length ? '...' : '')

        const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
        const pageTitle = titleMatch
          ? this.extractTextFromHtml(titleMatch[1])
          : file.name

        const relPath = file.path.replace(extractDir, '').replace(/^[\\/]/, '').replace(/\\/g, '/')

        results.push({ local: relPath, title: pageTitle, snippet, matchCount: hit.matchCount })
      } catch { /* skip unreadable */ }
    }

    results.sort((a, b) => b.matchCount - a.matchCount)
    return results
  },

  searchDirContent (dirPath, keyword, maxResults, opts = {}) {
    if (!keyword || !keyword.trim()) return []
    const limit = maxResults || 50
    const htmlFiles = this.scanDir(dirPath, ['.html', '.htm'])
    const results = []
    const MAX_FILE_SIZE = 512 * 1024

    for (const file of htmlFiles) {
      if (results.length >= limit) break
      try {
        const stat = fs.statSync(file.path)
        if (stat.size > MAX_FILE_SIZE) continue

        const raw = this.readTextFile(file.path)
        const text = this.extractTextFromHtml(raw)
        const hit = this._contentSearchFind(text, keyword, opts)
        if (!hit) continue

        const snippetStart = Math.max(0, hit.index - 40)
        const snippetEnd = Math.min(text.length, hit.index + hit.termLen + 80)
        const snippet = (snippetStart > 0 ? '...' : '')
          + text.substring(snippetStart, snippetEnd)
          + (snippetEnd < text.length ? '...' : '')

        const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
        const pageTitle = titleMatch
          ? this.extractTextFromHtml(titleMatch[1])
          : file.name

        const relPath = file.path.replace(dirPath, '').replace(/^[\\/]/, '').replace(/\\/g, '/')

        results.push({ local: relPath, title: pageTitle, snippet, matchCount: hit.matchCount })
      } catch { /* skip */ }
    }

    results.sort((a, b) => b.matchCount - a.matchCount)
    return results
  },

  _parseHhc (filePath) {
    const content = this.readTextFile(filePath)
    return this._parseHhcSitemap(content)
  },

  _parseHhk (filePath) {
    const content = this.readTextFile(filePath)
    const entries = []
    const objRegex = /<OBJECT[^>]*>[\s\S]*?<\/OBJECT>/gi
    let m
    while ((m = objRegex.exec(content)) !== null) {
      const block = m[0]
      const name = this._paramValue(block, 'Name')
      const local = this._paramValue(block, 'Local')
      if (name && local) entries.push({ name, local: this._normalizeChmLocal(local) })
    }
    return entries
  },

  _paramValue (objectBlock, paramName) {
    const esc = paramName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(
      '<PARAM\\s+NAME=["\']' + esc + '["\']\\s+VALUE=["\']([^"\']*)["\']',
      'i'
    )
    const m = objectBlock.match(re)
    if (m) return this._unescapeHhcAttr(m[1])
    const re2 = new RegExp(
      '<PARAM\\s+VALUE=["\']([^"\']*)["\']\\s+NAME=["\']' + esc + '["\']',
      'i'
    )
    const m2 = objectBlock.match(re2)
    return m2 ? this._unescapeHhcAttr(m2[1]) : ''
  },

  _parseHhcSitemap (html) {
    const items = []
    const stack = [items]
    /** ???? <ul> ?????????</ul> ?????????<li> ????????? PARAM ???????????????? */
    const liStack = []

    const tokens = html.replace(/\r\n?/g, '\n').split(/(<\/?(?:UL|LI|OBJECT|PARAM)[^>]*>)/gi)

    let currentItem = null

    for (const tok of tokens) {
      const t = tok.trim()
      if (!t) continue
      const lower = t.toLowerCase()

      if (lower.startsWith('<ul')) {
        if (currentItem) {
          currentItem.children = currentItem.children || []
          liStack.push(currentItem)
          stack.push(currentItem.children)
        }
      } else if (lower.startsWith('</ul')) {
        if (stack.length > 1) {
          stack.pop()
          currentItem = liStack.pop() || null
        } else {
          currentItem = null
        }
      } else if (lower.startsWith('<li')) {
        currentItem = { name: '', local: '', children: [] }
        stack[stack.length - 1].push(currentItem)
      } else if (lower.startsWith('<param')) {
        if (currentItem) {
          const nameMatch = t.match(/NAME\s*=\s*"([^"]*)"|NAME\s*=\s*'([^']*)'/i)
          const valueMatch = t.match(/VALUE\s*=\s*"([^"]*)"|VALUE\s*=\s*'([^']*)'/i)
          const pnRaw = (nameMatch && (nameMatch[1] || nameMatch[2])) || ''
          let pvRaw = (valueMatch && (valueMatch[1] || valueMatch[2])) || ''
          const pn = pnRaw.toLowerCase()
          pvRaw = this._unescapeHhcAttr(pvRaw)
          if (pn === 'name') currentItem.name = pvRaw
          else if (pn === 'local') currentItem.local = pvRaw
        }
      }
    }

    const self = this
    const clean = (arr) => arr.filter(n => n.name || n.local || (n.children && n.children.length > 0))
      .map(n => {
        const result = {
          name: n.name,
          local: self._normalizeChmLocal(n.local)
        }
        if (n.children && n.children.length > 0) result.children = clean(n.children)
        return result
      })

    return clean(items)
  },

  clearChmCache (chmPath) {
    if (chmPath) {
      const hash = crypto.createHash('md5').update(chmPath).digest('hex').substring(0, 12)
      const extractDir = path.join(os.tmpdir(), 'pm_chm_' + hash)
      try { fs.rmSync(extractDir, { recursive: true, force: true }) } catch { /* ok */ }
      return
    }
    try {
      const tmpDir = os.tmpdir()
      const entries = fs.readdirSync(tmpDir)
      for (const e of entries) {
        if (e.startsWith('pm_chm_')) {
          try { fs.rmSync(path.join(tmpDir, e), { recursive: true, force: true }) } catch { /* ok */ }
        }
      }
    } catch { /* ok */ }
  },

  // ========== Content Extraction ==========

  extractTextFromHtml (html) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
        try { return String.fromCodePoint(parseInt(hex, 16)) } catch { return '' }
      })
      .replace(/&#(\d+);/g, (_, dec) => {
        try { return String.fromCodePoint(parseInt(dec, 10)) } catch { return '' }
      })
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
  },

  extractHtmlSections (html) {
    const sections = []
    const headingRegex = /<(h[1-6])[^>]*(?:\s+id=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/\1>/gi
    const matches = []
    let m
    while ((m = headingRegex.exec(html)) !== null) {
      matches.push({
        index: m.index,
        level: parseInt(m[1][1]),
        anchor: m[2] || '',
        title: this.extractTextFromHtml(m[3])
      })
    }

    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index
      const end = i + 1 < matches.length ? matches[i + 1].index : html.length
      const chunk = html.substring(start, end)
      sections.push({
        title: matches[i].title,
        level: matches[i].level,
        anchor: matches[i].anchor,
        contentText: this.extractTextFromHtml(chunk),
        contentHtml: chunk
      })
    }

    if (sections.length === 0 && html.trim()) {
      sections.push({
        title: 'Content',
        level: 1,
        anchor: '',
        contentText: this.extractTextFromHtml(html),
        contentHtml: html
      })
    }
    return sections
  },

  extractMarkdownSections (md) {
    const sections = []
    const lines = md.split('\n')
    let cur = null

    for (const line of lines) {
      const hm = line.match(/^(#{1,6})\s+(.+)$/)
      if (hm) {
        if (cur) { cur.contentText = cur.contentText.trim(); sections.push(cur) }
        cur = {
          title: hm[2].trim(),
          level: hm[1].length,
          anchor: hm[2].trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, ''),
          contentText: '',
          contentMd: ''
        }
      } else {
        if (!cur) {
          cur = { title: 'Introduction', level: 1, anchor: '', contentText: '', contentMd: '' }
        }
        cur.contentText += line + '\n'
        cur.contentMd += line + '\n'
      }
    }
    if (cur) { cur.contentText = cur.contentText.trim(); sections.push(cur) }
    return sections
  },

  parseJsonManual (jsonContent) {
    try {
      const data = JSON.parse(jsonContent)
      const normalize = (item, i) => ({
        title: item.title || item.name || item.command || item.function || `Entry ${i + 1}`,
        keywords: item.keywords || item.tags || [],
        description: item.description || item.summary || item.explain || '',
        content: item.content || item.body || item.detail || item.usage || '',
        type: item.type || 'article'
      })
      if (Array.isArray(data)) return data.map(normalize)
      const arr = data.entries || data.items || data.commands || data.functions || data.docs
      if (Array.isArray(arr)) return arr.map(normalize)
      return [normalize(data, 0)]
    } catch {
      return []
    }
  }
}

try {
  window.services.initBuiltinManuals()
  window.services.syncManualFeatures()
} catch (e) {
  console.warn('preload auto-init:', e.message)
}
