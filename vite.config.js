import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Windows: deep trees sometimes survive fs.rmSync; use cmd rd /s /q */
function rmDirDeep (dir) {
  if (!dir || !fs.existsSync(dir)) return
  if (process.platform === 'win32') {
    try {
      execFileSync('cmd', ['/c', 'rd', '/s', '/q', dir], { windowsHide: true, stdio: 'ignore' })
    } catch { /* ignore rd exit code */ }
    return
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 12, retryDelay: 120 })
  } catch { /* ignore */ }
}

/**
 * Default release build is slim: skip large builtin-manuals assets (CHM/PDF).
 * Full package: PM_RELEASE_SLIM=0 (npm run build:full).
 */
const releaseSlim = process.env.PM_RELEASE_SLIM !== '0'

/** preload 仅 services.js（无 npm 依赖）；绝不把 preload/node_modules 打进包（曾为 pdf-parse ~90MB） */
function shouldSkipPreloadNodeModules (relPosix) {
  const n = String(relPosix || '').replace(/\\/g, '/')
  return n === 'preload/node_modules' || n.startsWith('preload/node_modules/')
}

/** 瘦身构建：不拷贝 CHM/PDF，以及整棵 php-chunked-xhtml（远程 zip 提供） */
function shouldSkipSlimBuiltinPath (relPosix) {
  const n = String(relPosix || '').replace(/\\/g, '/')
  if (n !== 'builtin-manuals' && !n.startsWith('builtin-manuals/')) return false
  if (n === 'builtin-manuals/php-chunked-xhtml' || n.startsWith('builtin-manuals/php-chunked-xhtml/')) {
    return true
  }
  const base = path.posix.basename(n).toLowerCase()
  return base.endsWith('.chm') || base.endsWith('.pdf')
}

/** Copy public -> dist; skip .git; optional slim skip for CHM/PDF under builtin-manuals */
function copyPublicSkipGit (src, dest, relFromPublic = '') {
  if (!fs.existsSync(src)) return
  const st = fs.statSync(src)
  const rel = relFromPublic.replace(/\\/g, '/')
  if (shouldSkipPreloadNodeModules(rel)) return

  if (!st.isDirectory()) {
    if (releaseSlim && shouldSkipSlimBuiltinPath(rel)) return
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
    return
  }

  if (releaseSlim && shouldSkipSlimBuiltinPath(rel)) return

  fs.mkdirSync(dest, { recursive: true })
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.isDirectory() && ent.name === '.git') continue
    const childRel = rel ? `${rel}/${ent.name}` : ent.name
    copyPublicSkipGit(path.join(src, ent.name), path.join(dest, ent.name), childRel)
  }
}

function copyPublicExcludeGitPlugin () {
  return {
    name: 'copy-public-exclude-git',
    apply: 'build',
    closeBundle () {
      const distRoot = path.join(__dirname, 'dist')
      const destBuiltin = path.join(distRoot, 'builtin-manuals')
      rmDirDeep(destBuiltin)
      copyPublicSkipGit(path.join(__dirname, 'public'), distRoot, '')
      rmDirDeep(path.join(distRoot, 'preload', 'node_modules'))
      if (releaseSlim) {
        console.log('[vite] PM_RELEASE_SLIM: omitted builtin-manuals *.chm / *.pdf / php-chunked-xhtml from dist (use build:full for complete assets)')
      }
    }
  }
}

/** Remove source maps and precompressed siblings so plugin package stays clean */
function stripDistDebugArtifacts (dir) {
  if (!fs.existsSync(dir)) return
  let removed = 0
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name)
      if (ent.isDirectory()) {
        walk(p)
        continue
      }
      const lower = ent.name.toLowerCase()
      let drop = false
      if (lower.endsWith('.map')) drop = true
      if (/\.(js|mjs|css)\.gz$/i.test(lower)) drop = true
      if (/\.(js|mjs|css)\.br$/i.test(lower)) drop = true
      if (drop) {
        try {
          fs.unlinkSync(p)
          removed++
        } catch { /* ignore */ }
      }
    }
  }
  walk(dir)
  if (removed) console.log('[vite] removed', removed, 'debug / precompress artifact(s) from dist')
}

function stripDistDebugArtifactsPlugin () {
  return {
    name: 'strip-dist-debug-artifacts',
    apply: 'build',
    enforce: 'post',
    closeBundle () {
      stripDistDebugArtifacts(path.join(__dirname, 'dist'))
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), copyPublicExcludeGitPlugin(), stripDistDebugArtifactsPlugin()],
  base: './',
  build: {
    copyPublicDir: false,
    emptyOutDir: true,
    sourcemap: false
  }
})
