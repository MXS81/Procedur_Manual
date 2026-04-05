const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const os = require('os')
const { pathToFileURL } = require('url')
const { execFileSync } = require('child_process')

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
  INDEX_PREFIX: 'pm_index_'
}

window.services = {

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

  /** 从 HTML 头部读取 meta http-equiv Content-Type 或 charset 声明 */
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
   * 按 HTML 声明编码读取文本（用于 CHM 内页等多编码场景）
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

  /** 供 pdf.js 等使用的原始 PDF 二进制 */
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
   * 检测是否为 PHP 分块 HTML 手册：若存在 chunklist 则不设 entryFile，由 IframeManualReader 用 Node 列表 + srcdoc 处理 GBK/UTF-8 等编码
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

    // 含 PHP chunk 目录时不在此设入口，由 Iframe 侧按 chunklist 解析
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
  },

  removeManuals (ids) {
    if (!Array.isArray(ids) || ids.length === 0) return
    const idSet = new Set(ids)
    const manuals = this.getAllManuals().filter(m => !idSet.has(m.id))
    this._saveAllManuals(manuals)
    for (const id of ids) {
      this.removeIndexData(id)
    }
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

    // Remove built-in manuals that were deleted from manifest.
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

    for (const entry of manifest) {
      const filePath = path.join(dir, entry.fileName)
      if (!fs.existsSync(filePath)) {
        if (existingMap.has(entry.id)) {
          this.removeManual(entry.id)
          removed++
        } else {
          skipped++
        }
        continue
      }

      const info = this.pathInfo(filePath)
      const sourceType = info.isDir ? 'mixed'
        : info.ext === '.chm' ? 'chm'
          : info.ext === '.pdf' ? 'pdf'
            : ['.md', '.markdown'].includes(info.ext) ? 'markdown'
              : info.ext === '.json' ? 'json'
                : 'html'

      const existingManual = existingMap.get(entry.id)
      if (existingManual) {
        const changed = existingManual.rootPath !== filePath
          || existingManual.sourceType !== sourceType
          || existingManual.name !== entry.name
          || existingManual.description !== (entry.description || '')
          || JSON.stringify(existingManual.keywords || []) !== JSON.stringify(entry.keywords || [])
          || (existingManual.entryFile || null) !== (entry.entryFile || null)

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
            docCount: 0
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
        indexStatus: 'none'
      })
      added++
    }

    return { added, skipped, removed }
  },

  // ========== Dynamic uTools Feature Registration ==========

  _FEATURE_PREFIX: 'manual-quick-',
  _FEATURES_KEY: 'pm_registered_features',

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
      const code = this._FEATURE_PREFIX + manual.id
      activeCodes.add(code)

      try {
        const cmds = [
          { type: 'over', label: manual.name }
        ]
        for (const kw of (manual.keywords || [])) {
          if (kw && kw !== manual.name) {
            cmds.push(kw)
          }
        }
        window.utools.setFeature({
          code,
          explain: manual.description || manual.name,
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
  // pdf-parse v2：PDFParse 使用不同 API；索引抽取优先 pdf-parse
  // 备选：将 Poppler 的 pdftotext 加入 PATH，见 https://github.com/oschwartz10612/poppler-windows/releases/

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

  _extractPdfTextPdftotextSync (filePath) {
    const args = ['-layout', '-enc', 'UTF-8', filePath, '-']
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
   * 抽取 PDF 文本块供索引；可选 onProgress(currentPage, totalPages)
   */
  async extractPdfIndexChunks (filePath, onProgress) {
    const { PDFParse } = require('pdf-parse')
    let parser = null
    try {
      try {
        const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
        PDFParse.setWorker(pathToFileURL(workerPath).href)
      } catch { /* worker 可选 */ }

      const buffer = fs.readFileSync(filePath)
      parser = new PDFParse({ data: buffer, verbosity: 0 })
      const result = await parser.getText()
      const pages = result.pages || []
      const total = pages.length
      const maxPages = Math.min(total, 600)
      const chunks = []

      for (let i = 0; i < maxPages; i++) {
        const pg = pages[i]
        const t = (pg && pg.text ? String(pg.text) : '').trim()
        if (t.length >= 12) {
          const lines = t.split(/\n/).map(l => l.trim()).filter(Boolean)
          const title = (lines[0] || ('第 ' + (pg.num || i + 1) + ' 页')).substring(0, 120)
          chunks.push({
            pageNum: pg.num != null ? pg.num : i + 1,
            title,
            text: t
          })
        }
        if (onProgress && (i % 3 === 0 || i === maxPages - 1)) {
          onProgress(Math.min(i + 1, maxPages), maxPages)
        }
      }

      if (!chunks.length && result.text && String(result.text).trim().length > 10) {
        chunks.push({
          pageNum: 1,
          title: path.basename(filePath, path.extname(filePath)),
          text: String(result.text).trim()
        })
      }

      return chunks
    } catch (e) {
      console.error('PDFParse failed:', e.message)
      const fallback = this._extractPdfTextPdftotextSync(filePath)
      if (!fallback) return []
      return [{
        pageNum: 1,
        title: path.basename(filePath, path.extname(filePath)),
        text: fallback
      }]
    } finally {
      if (parser) {
        try { await parser.destroy() } catch { /* ok */ }
      }
    }
  },

  async extractPdfText (filePath) {
    const chunks = await this.extractPdfIndexChunks(filePath, null)
    if (!chunks.length) return ''
    return chunks.map(c => c.text).join('\n\n')
  },

  /**
   * 小体积 PDF 以内联 base64 供 uTools/WebView 打开；过大则退回 file://（部分环境对 file:// 有限制）
   */
  getPdfViewerUrl (filePath) {
    const INLINE_MAX = 8 * 1024 * 1024
    try {
      if (!filePath || !fs.existsSync(filePath)) return { kind: 'error', message: '文件不存在' }
      const st = fs.statSync(filePath)
      if (!st.isFile()) return { kind: 'error', message: '不是文件' }
      if (st.size <= INLINE_MAX) {
        return { kind: 'inline-base64', base64: fs.readFileSync(filePath).toString('base64') }
      }
      return { kind: 'file', url: pathToFileURL(path.resolve(filePath)).href }
    } catch (e) {
      return { kind: 'error', message: e.message || String(e) }
    }
  },

  // ========== CHM Decompilation ==========
  // 打开/跳转 CHM 时一律走 _resolveChmFilePath（大小写、..、file://、目录/index、.hhc 实体解码）
  // 正文内链保留 # 锚点由 ChmReader 滚动；.hhc 里嵌套 </ul> 必须用 liStack 恢复父 <li>，否则三级以下目录错位

  /** 解压结果须含可读 HTML 或 .hhc，避免把「有文件但残缺」的缓存当成可用 */
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

  /** 插件内置：public/tools → dist/tools（构建时用 copy-bundled-7za.mjs 从 7zip-bin-win 复制） */
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

  /** 7-Zip：PM_SEVEN_ZIP → 内置 tools → 常见安装路径 + PATH（不少 CHM 仅 7z 能解，hh.exe 会失败） */
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

  /** 与 SearchService CHM_INDEX_MAX_HTML_FILES 一致：全文扫描与索引上限，避免万级 HTML 卡死 */
  _CHM_CONTENT_SCAN_MAX_FILES: 2000,

  decompileChm (chmPath) {
    if (!chmPath) {
      throw new Error('CHM 路径无效')
    }
    const resolvedChm = path.resolve(chmPath)
    let chmSize = 0
    try {
      if (!fs.existsSync(resolvedChm) || !fs.statSync(resolvedChm).isFile()) {
        throw new Error('CHM 文件不存在或无法访问')
      }
      chmSize = fs.statSync(resolvedChm).size
    } catch (e) {
      if (e.message && e.message.includes('CHM')) throw e
      throw new Error('CHM 文件不存在或无法访问')
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
    if (process.platform === 'win32' && /[^\u0000-\u007F]/.test(resolvedChm)) {
      workChmTemp = path.join(os.tmpdir(), 'pm_chm_in_' + hash + '.chm')
      try {
        fs.copyFileSync(resolvedChm, workChmTemp)
        workChm = workChmTemp
      } catch (e) {
        throw new Error('CHM \u65e0\u6cd5\u590d\u5236\u5230\u4e34\u65f6\u8def\u5f84\uff08\u975e ASCII \u8def\u5f84\u65f6\u9700 ASCII \u4e34\u65f6\u526f\u672c\uff09: ' + (e.message || String(e)))
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
      } catch { /* 7z 非零退出仍可能已解压 */ }
      return waitUsable(largeChm ? 48 : 20)
    }

    const runHh = () => {
      try {
        execFileSync(hhPath, ['-decompile', extractDir, workChm], {
          timeout: timeoutHh, windowsHide: true, stdio: 'ignore'
        })
      } catch { /* hh 常非零退出 */ }
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
        ? '\u5df2\u5c1d\u8bd5 7-Zip \u4e0e hh.exe\uff0c\u89e3\u538b\u7ed3\u679c\u4ecd\u65e0\u53ef\u8bfb\u9875\u9762\u3002\u8bf7\u786e\u8ba4 CHM \u672a\u635f\u574f\u3001\u975e\u52a0\u5bc6\u3002'
        : '\u672a\u627e\u5230 7-Zip \u53ef\u6267\u884c\u6587\u4ef6\uff08\u5185\u7f6e public/tools/7za.exe \u7f3a\u5931\u65f6\u8bf7\u91cd\u65b0\u6267\u884c npm run build \u6216 npm run bundle:7za\uff09\u3002\u4ea6\u53ef\u5b89\u88c5\u7cfb\u7edf\u7248 7-Zip \u6216\u8bbe\u7f6e\u73af\u5883\u53d8\u91cf PM_SEVEN_ZIP\u3002'

      throw new Error('CHM \u89e3\u538b\u5931\u8d25\uff1a' + hint)
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
   * CHM .hhc/.hhk 中 Local 可能是 file:///、相对路径、URL 编码或 mk:@MSITStore:/ms-its:
   * 返回统一相对路径（正斜杠）；锚点 # 之前已在调用方拆分
   */
  _normalizeChmLocal (local) {
    if (!local) return ''
    let s = String(local).trim().split('#')[0]
    try {
      s = decodeURIComponent(s.replace(/\+/g, ' '))
    } catch { /* 非法编码则保留原串 */ }

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

  /** .hhc/.hhk 中 PARAM 的 VALUE 内 &amp;、&quot; 等实体还原为字符 */
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

  /** 判断 filePath 是否在 extract 根之下（relative 不以 .. 开头且非绝对路径） */
  _chmFileWithinExtract (filePath, extractRootResolved) {
    const rel = path.relative(extractRootResolved, filePath)
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
  },

  /** candidate 是否落在 root 目录树内（含 root 自身） */
  _pathUnderChmRoot (candidate, root) {
    const r = path.resolve(root)
    const c = path.resolve(candidate)
    const rel = path.relative(r, c)
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
  },

  /**
   * 在 CHM 解压根内解析 Local（含 ../），大小写不敏感，末级可为目录并回退 index.html
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
    const pathOnly = String(relPosix || '').split('#')[0].trim()
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

  /** 将原始 Local 规范为相对 extract 的正斜杠路径（尽量解析到真实文件） */
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
   * 非 UTF-8 页：将外链 script/stylesheet 内联进 srcdoc，避免 GBK 页引用 .js/.css 乱码
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
    const inject = `<meta charset="utf-8"><base href="${safeBase}">`
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
   * 读取解压目录内 HTML（相对路径）；与 .chm 同级的散落 HTML 同样适用
   * 路径经 _resolveChmFilePath（..、目录、index）；勿对不可信路径直接 API 拼接 join
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
   * 打包离线 HTML 目录内页：与 CHM 共用解析与内联逻辑，见 getChmPageSrcdoc
   */
  getBundledHtmlPageSrcdoc (rootDir, relPath) {
    return this.getChmPageSrcdoc(rootDir, relPath)
  },

  /**
   * 与 searchModes.compileSearchMatcher 一致，用于 CHM/离线 HTML 正文搜索
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
    /** 遇 <ul> 压栈、</ul> 出栈；<li> 上一条 PARAM 归属当前项 */
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
