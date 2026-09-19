const path = require('path')
const { fork } = require('child_process')

/**
 * 创建阅读器专属后台进程；关闭时释放进程及手册正文缓存。
 * @returns {{request: (method: string, args: object) => Promise<any>, dispose: () => void}}
 */
function createChmSession () {
  // uTools preload 位于 Electron 渲染进程，不能直接创建 Node Worker。
  // 使用宿主自带的 Node 运行时启动独立进程，不要求用户安装 Node。
  const worker = fork(path.join(__dirname, 'chm-worker.js'), [], {
    execArgv: [],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    serialization: 'advanced'
  })
  const pending = new Map()
  let sequence = 0

  const rejectPending = (error) => {
    for (const task of pending.values()) task.reject(error)
    pending.clear()
  }
  worker.on('message', ({ id, result, error }) => {
    const task = pending.get(id)
    pending.delete(id)
    if (error) task.reject(new Error(error))
    else task.resolve(result)
  })
  worker.on('error', rejectPending)
  worker.on('exit', () => rejectPending(new Error('CHM 阅读会话已结束')))

  return {
    request (method, args = {}) {
      const id = ++sequence
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        worker.send({ id, method, args })
      })
    },
    dispose () {
      worker.removeAllListeners('message')
      rejectPending(new Error('CHM 阅读会话已结束'))
      worker.kill()
    }
  }
}


module.exports = { createChmSession }
