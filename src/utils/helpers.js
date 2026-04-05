export function formatFileSize (bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

export function formatDate (ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  })
}

export function truncateText (text, max = 200) {
  if (!text || text.length <= max) return text || ''
  return text.substring(0, max) + '...'
}

export function getSourceTypeLabel (type) {
  const map = { html: 'HTML', markdown: 'Markdown', pdf: 'PDF', json: 'JSON', mixed: 'Mixed' }
  return map[type] || type
}

export function escapeHtml (text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
