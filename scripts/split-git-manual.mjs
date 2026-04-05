import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const srcFile = path.join(rootDir, 'public', 'builtin-manuals', 'git.md')
const outDir = path.join(rootDir, 'public', 'builtin-manuals', 'git')

const raw = fs.readFileSync(srcFile, 'utf-8')
const lines = raw.split('\n')

let startIdx = -1
for (let i = 0; i < lines.length; i++) {
  if (/^## /.test(lines[i])) { startIdx = i; break }
}
if (startIdx < 0) { console.error('No ## heading found'); process.exit(1) }

const sections = []
let cur = null
for (let i = startIdx; i < lines.length; i++) {
  const m = lines[i].match(/^## (.+)/)
  if (m) {
    if (cur) sections.push(cur)
    cur = { title: m[1].trim(), lines: [lines[i]] }
  } else if (cur) {
    cur.lines.push(lines[i])
  }
}
if (cur) sections.push(cur)

function toFileName (title) {
  let name = title
    .replace(/[\/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .toLowerCase()
  if (name.length > 60) name = name.substring(0, 60)
  name = name.replace(/-+$/g, '')
  return name + '.md'
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

let count = 0
for (const sec of sections) {
  let content = sec.lines.join('\n').trimEnd() + '\n'
  const fileName = toFileName(sec.title)
  fs.writeFileSync(path.join(outDir, fileName), content, 'utf-8')
  count++
  console.log(`  ${fileName}  (${sec.title})`)
}
console.log(`\nDone: ${count} files written to ${outDir}`)
