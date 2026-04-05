import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 将 public 同步到 dist，跳过任意层级的 .git 目录（避免构建复制 pack 文件 EPERM） */
function copyPublicSkipGit (src, dest) {
  if (!fs.existsSync(src)) return
  const st = fs.statSync(src)
  if (!st.isDirectory()) {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
    return
  }
  fs.mkdirSync(dest, { recursive: true })
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.isDirectory() && ent.name === '.git') continue
    copyPublicSkipGit(path.join(src, ent.name), path.join(dest, ent.name))
  }
}

function copyPublicExcludeGitPlugin () {
  return {
    name: 'copy-public-exclude-git',
    apply: 'build',
    closeBundle () {
      copyPublicSkipGit(path.join(__dirname, 'public'), path.join(__dirname, 'dist'))
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), copyPublicExcludeGitPlugin()],
  base: './',
  build: {
    copyPublicDir: false,
    /** 避免多次构建后 dist/assets 堆积旧 hash 文件，误打进插件包 */
    emptyOutDir: true
  }
})
