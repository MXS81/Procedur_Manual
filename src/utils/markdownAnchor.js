/**
 * 与 preload `extractMarkdownSections` 中标题锚点规则保持一致（用于 marked 输出 id）。
 */
export function anchorIdFromMarkdownHeading (title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '')
}
