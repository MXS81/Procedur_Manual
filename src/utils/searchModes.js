/**
 * Search modes: case / whole word / regex (VS Code-like).
 */

import { SEARCH_MATCHER_ERRORS } from './asciiUiStrings.js'

export const defaultSearchModeOptions = () => ({
  matchCase: false,
  wholeWord: false,
  useRegex: false
})

/** When no advanced option is on, use default tokenization / fuzzy behavior */
export function shouldUseMiniSearchDefault (options = {}) {
  return !options.useRegex && !options.matchCase && !options.wholeWord
}

/**
 * @param {string} query
 * @param {{ matchCase?: boolean, wholeWord?: boolean, useRegex?: boolean }} options
 * @returns {{ ok: true, testBlob: (s: string) => boolean, highlightRe: RegExp, findFirst: (s: string) => { index: number, length: number } | null } | { ok: false, error: string }}
 */
export function compileSearchMatcher (query, options = {}) {
  const q = query?.trim()
  if (!q) return { ok: false, error: SEARCH_MATCHER_ERRORS.emptyQuery }

  const matchCase = !!options.matchCase
  const wholeWord = !!options.wholeWord
  const useRegex = !!options.useRegex
  const iflags = matchCase ? '' : 'i'
  const gflags = matchCase ? 'g' : 'gi'

  if (useRegex) {
    try {
      const reTest = new RegExp(q, iflags)
      const reHighlight = new RegExp(q, gflags)
      return {
        ok: true,
        testBlob: (s) => {
          reTest.lastIndex = 0
          return reTest.test(s || '')
        },
        highlightRe: reHighlight,
        findFirst: (text) => {
          const t = text || ''
          reTest.lastIndex = 0
          const m = reTest.exec(t)
          if (!m) return null
          return { index: m.index, length: m[0].length }
        }
      }
    } catch (e) {
      return { ok: false, error: e.message || SEARCH_MATCHER_ERRORS.badRegex }
    }
  }

  const terms = q.split(/\s+/).filter(Boolean)
  const termRes = terms.map((term) => {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const body = wholeWord ? `\\b${esc}\\b` : esc
    return { reTest: new RegExp(body, iflags), body }
  })

  let highlightRe
  try {
    const parts = termRes.map((t) => t.body)
    highlightRe = new RegExp(`(${parts.join('|')})`, gflags)
  } catch {
    highlightRe = /$^/g
  }

  return {
    ok: true,
    testBlob: (s) => {
      const str = s || ''
      return termRes.every(({ reTest }) => {
        reTest.lastIndex = 0
        return reTest.test(str)
      })
    },
    highlightRe,
    findFirst: (text) => {
      const t = text || ''
      let best = null
      for (const { reTest } of termRes) {
        reTest.lastIndex = 0
        const m = reTest.exec(t)
        if (m && (best === null || m.index < best.index)) {
          best = { index: m.index, length: m[0].length }
        }
      }
      return best
    }
  }
}

/** Split text by highlight regex for JSX <mark> mapping */
export function splitTextByHighlightRegex (text, highlightRe) {
  if (!text) return []
  if (!highlightRe) return [{ match: false, v: text }]
  let re
  try {
    const f = highlightRe.flags.includes('g') ? highlightRe.flags : highlightRe.flags + 'g'
    re = new RegExp(highlightRe.source, f)
  } catch {
    return [{ match: false, v: text }]
  }
  const out = []
  let last = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ match: false, v: text.slice(last, m.index) })
    out.push({ match: true, v: m[0] })
    last = m.index + m[0].length
    if (m[0].length === 0) re.lastIndex++
  }
  if (last < text.length) out.push({ match: false, v: text.slice(last) })
  return out.length ? out : [{ match: false, v: text }]
}

export function snippetAroundMatch (text, matcher, maxLen = 160) {
  if (!text || !matcher?.ok || !matcher.findFirst) return text ? text.substring(0, maxLen) : ''
  const m = matcher.findFirst(text)
  if (!m) return text.substring(0, maxLen)
  const start = Math.max(0, m.index - 50)
  const end = Math.min(text.length, start + maxLen)
  let snippet = text.substring(start, end)
  if (start > 0) snippet = '...' + snippet
  if (end < text.length) snippet += '...'
  return snippet
}
