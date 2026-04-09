export const SOURCE_TYPES = {
  HTML: 'html',
  MARKDOWN: 'markdown',
  PDF: 'pdf',
  JSON: 'json',
  CHM: 'chm',
  MIXED: 'mixed'
}

export const INDEX_STATUS = {
  PENDING: 'pending',
  BUILDING: 'building',
  READY: 'ready',
  ERROR: 'error'
}

const EXT_MAP = {
  '.html': SOURCE_TYPES.HTML,
  '.htm': SOURCE_TYPES.HTML,
  '.md': SOURCE_TYPES.MARKDOWN,
  '.markdown': SOURCE_TYPES.MARKDOWN,
  '.pdf': SOURCE_TYPES.PDF,
  '.json': SOURCE_TYPES.JSON,
  '.chm': SOURCE_TYPES.CHM
}

export function detectSourceType (ext) {
  return EXT_MAP[ext?.toLowerCase()] || null
}

export function createManual ({
  id, name, keywords = [], description = '', rootPath,
  sourceType = 'html', enabled = true, searchEntryEnabled = true,
  entryFile = null
}) {
  return {
    id,
    name,
    keywords: Array.isArray(keywords)
      ? keywords
      : String(keywords).split(/[,，]/).map(k => k.trim()).filter(Boolean),
    description,
    rootPath,
    sourceType,
    enabled,
    searchEntryEnabled,
    entryFile: entryFile || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    indexStatus: INDEX_STATUS.PENDING,
    indexVersion: 0,
    docCount: 0
  }
}
