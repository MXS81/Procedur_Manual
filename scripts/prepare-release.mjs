import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const distPluginPath = path.join(rootDir, 'dist', 'plugin.json')

if (!fs.existsSync(distPluginPath)) {
  console.error('prepare-release: dist/plugin.json 不存在，请先执行 vite build')
  process.exit(1)
}

const plugin = JSON.parse(fs.readFileSync(distPluginPath, 'utf-8'))
delete plugin.development

fs.writeFileSync(distPluginPath, JSON.stringify(plugin, null, 2) + '\n', 'utf-8')
console.log('prepare-release: 已移除 dist/plugin.json 中的 development 配置')
