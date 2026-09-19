/**
 * 为原始目录分配稳定身份，过滤时保留身份和祖先路径。
 * @param {object[]} nodes 原始目录节点。
 * @param {string} prefix 父节点身份。
 * @returns {object[]} 带有稳定 id 的目录。
 */
export function identifyToc (nodes, prefix = 'r') {
  return nodes.map((node, i) => {
    const id = `${prefix}/${i}`
    return { ...node, id, children: identifyToc(node.children || [], id) }
  })
}


/** @param {object[]} nodes 目录。 @param {object} matcher 已编译规则。 @returns {object[]} 匹配目录。 */
export function filterToc (nodes, matcher) {
  return nodes.flatMap(node => {
    if (matcher.testBlob(node.name)) return [node]
    const children = filterToc(node.children, matcher)
    return children.length ? [{ ...node, children }] : []
  })
}


/**
 * 创建页面历史；每个历史项独立记录位置，同页重复访问不追加记录。
 * @returns {object} 历史状态和导航操作。
 */
export function createReadingHistory () {
  return {
    stack: [],
    idx: -1,
    capture (scroll) {
      if (this.idx >= 0) this.stack[this.idx].scroll = scroll
    },
    visit (page) {
      if (this.stack[this.idx]?.page === page) return this.stack[this.idx]
      this.stack = this.stack.slice(0, this.idx + 1)
      const entry = { page, scroll: null }
      this.stack.push(entry)
      this.idx = this.stack.length - 1
      return entry
    },
    move (delta) {
      this.idx += delta
      return this.stack[this.idx]
    }
  }
}


/**
 * 将正文文本映射为 DOM Range，使正则、多关键词定位与搜索使用同一规则。
 * 文本节点间插入空格、节点内合并空白，与后台 HTML 正文提取方式一致。
 * @param {Document} doc iframe 文档。
 * @param {object} matcher 已编译搜索规则。
 * @returns {Range[]} 按正文顺序排列的匹配范围。
 */
export function findDocumentRanges (doc, matcher) {
  const walker = doc.createTreeWalker(doc.body, 4)
  const segments = []
  let text = ''
  let node
  while ((node = walker.nextNode())) {
    if (node.parentElement.closest('script, style, noscript')) continue
    if (text && !text.endsWith(' ') && node.data && !/^\s/.test(node.data)) text += ' '
    // 按连续文本段记录偏移，不为正文中的每个字符创建对象。
    for (const match of node.data.matchAll(/\s+|\S+/g)) {
      const whitespace = /^\s/.test(match[0])
      if (whitespace && (!text || text.endsWith(' '))) continue
      const normalized = whitespace ? ' ' : match[0]
      segments.push({
        node,
        start: text.length,
        end: text.length + normalized.length,
        sourceStart: match.index,
        sourceEnd: match.index + match[0].length,
        whitespace
      })
      text += normalized
    }
  }
  text = text.trimEnd()
  if (!matcher.testBlob(text)) return []
  const ranges = []
  for (const match of text.matchAll(matcher.highlightRe)) {
    const start = match.index
    const end = start + match[0].length
    // 零宽正则没有可选择字符；创建折叠范围，仍可计数和定位。
    const first = locateTextPoint(segments, start, false)
    const last = match[0].length ? locateTextPoint(segments, end - 1, true) : first
    if (!first || !last) continue
    const range = doc.createRange()
    range.setStart(first.node, first.offset)
    if (end === start) range.collapse(true)
    else range.setEnd(last.node, last.offset)
    ranges.push(range)
  }
  return ranges
}


/** @param {object[]} segments 文本映射。 @param {number} index 字符位置。 @param {boolean} after 是否取字符末尾。 @returns {object|null} DOM 位置。 */
function locateTextPoint (segments, index, after) {
  let low = 0
  let high = segments.length
  // 二分查找避免每个匹配都重新遍历整页文本节点。
  while (low < high) {
    const mid = (low + high) >>> 1
    if (segments[mid].end <= index) low = mid + 1
    else high = mid
  }
  const segment = segments[Math.min(low, segments.length - 1)]
  if (!segment) return null
  let offset
  if (index >= segment.end) offset = segment.sourceEnd
  else if (index < segment.start) offset = segment.sourceStart
  else if (segment.whitespace) offset = after ? segment.sourceEnd : segment.sourceStart
  else offset = segment.sourceStart + index - segment.start + Number(after)
  return { node: segment.node, offset }
}


/** @param {Range} range 匹配范围。 @returns {void} 选中并滚动到匹配文本。 */
export function revealDocumentRange (range) {
  const selection = range.startContainer.ownerDocument.defaultView.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
  range.startContainer.parentElement.scrollIntoView({ block: 'center' })
}
