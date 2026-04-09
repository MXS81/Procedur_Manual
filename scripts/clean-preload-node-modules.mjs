/**
 * public/preload 无 npm 依赖时不保留 node_modules（避免误提交/打进 dist 的 pdf-parse 等 ~90MB）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

function rmDirDeep (dir) {
  if (!dir || !fs.existsSync(dir)) return
  if (process.platform === 'win32') {
    try {
      execFileSync('cmd', ['/c', 'rd', '/s', '/q', dir], { windowsHide: true, stdio: 'ignore' })
    } catch { /* ignore */ }
    return
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 120 })
  } catch { /* ignore */ }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const preloadRoot = path.join(__dirname, '..', 'public', 'preload')
const pkgPath = path.join(preloadRoot, 'package.json')

if (!fs.existsSync(pkgPath)) process.exit(0)

let pkg
try {
  pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
} catch {
  process.exit(0)
}

const deps = pkg.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {}
if (Object.keys(deps).length > 0) process.exit(0)

const nm = path.join(preloadRoot, 'node_modules')
if (!fs.existsSync(nm)) process.exit(0)

rmDirDeep(nm)
if (!fs.existsSync(nm)) {
  console.log('[clean-preload-node-modules] removed', path.relative(path.join(__dirname, '..'), nm))
}
