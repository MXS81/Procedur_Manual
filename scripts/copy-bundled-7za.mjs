/**
 * 从 npm 包 7zip-bin-win（及可选 7zip-bin）复制 7za 到 public/tools，供插件随包分发。
 * 7-Zip 主程序为 LGPL；见 public/tools/README-7ZIP.txt
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const destDir = path.join(root, 'public', 'tools')
const destExe = path.join(destDir, '7za.exe')

function copyLicense () {
  const lic = path.join(root, 'node_modules', '7zip-bin', 'LICENSE.txt')
  const out = path.join(destDir, 'LICENSE-7zip-bin.txt')
  try {
    if (fs.existsSync(lic)) fs.copyFileSync(lic, out)
  } catch { /* */ }
}

function main () {
  fs.mkdirSync(destDir, { recursive: true })

  let src = null
  if (process.platform === 'win32') {
    const winRoot = path.join(root, 'node_modules', '7zip-bin-win')
    const order = process.arch === 'ia32'
      ? ['ia32', 'x64']
      : process.arch === 'arm64'
        ? ['arm64', 'x64']
        : ['x64', 'ia32']
    for (const arch of order) {
      const p = path.join(winRoot, arch, '7za.exe')
      if (fs.existsSync(p)) {
        src = p
        break
      }
    }
  }

  if (!src) {
    console.warn(
      '[copy-bundled-7za] 未找到 7za.exe（当前平台 ' +
        process.platform +
        '/' +
        process.arch +
        '）。Windows 请执行: npm i -D 7zip-bin-win'
    )
    return
  }

  fs.copyFileSync(src, destExe)
  copyLicense()
  console.log('[copy-bundled-7za] 已写入', path.relative(root, destExe))
}

main()
