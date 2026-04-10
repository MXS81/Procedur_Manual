/**
 * 用户扩展「命令」类 Markdown 手册的固定输入格式解析与生成。
 * 与内置 command/*.md 结构一致：首行命令名、次行 ===、空行、简介、空行、正文。
 */

const CMD_PREFIXES = ['命令:', '命令：']
const SUM_PREFIXES = ['简介:', '简介：']

/**
 * @param {string} raw
 * @returns {{ ok: true, command: string, summary: string, body: string } | { ok: false, error: string }}
 */
export function parseUserMdCommandInput (raw) {
  const text = String(raw || '').replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  let i = 0
  let command = ''
  let summary = ''

  while (i < lines.length) {
    const t = lines[i].trim()
    if (!t) {
      i++
      continue
    }
    const cp = CMD_PREFIXES.find((p) => t.startsWith(p))
    if (cp) {
      command = t.slice(cp.length).trim()
      i++
      continue
    }
    const sp = SUM_PREFIXES.find((p) => t.startsWith(p))
    if (sp) {
      summary = t.slice(sp.length).trim()
      i++
      continue
    }
    break
  }

  while (i < lines.length && !lines[i].trim()) i++
  const body = lines.slice(i).join('\n').trim()

  if (!command) return { ok: false, error: '缺少「命令:」及其名称（第一块元数据）' }
  if (!summary) return { ok: false, error: '缺少「简介:」及一句话说明' }
  if (/[\\/:*?"<>|]/.test(command)) {
    return { ok: false, error: '命令名不能包含 \\ / : * ? " < > | 等符号' }
  }
  if (command.includes('..') || command === '.' || command === '..') {
    return { ok: false, error: '命令名无效' }
  }
  if (command.length > 200) return { ok: false, error: '命令名过长' }

  return { ok: true, command, summary, body }
}

/**
 * @param {{ command: string, summary: string, body: string }} p
 * @returns {string}
 */
export function buildCommandStyleMarkdown (p) {
  const body = (p.body && p.body.trim()) ? `${p.body.trim()}\n` : '## 说明\n\n（待补充）\n'
  return `${p.command}\n===\n\n${p.summary}\n\n${body}`
}

export const USER_MD_COMMAND_TEMPLATE =
  '命令: 示例命令名\n' +
  '简介: 一句话说明该命令做什么\n' +
  '\n' +
  '## 说明\n' +
  '\n' +
  '在此编写 Markdown 正文（可选）。\n'
