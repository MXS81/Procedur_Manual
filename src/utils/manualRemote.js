/**
 * 内置手册配置了 remoteDownloadUrl 且本地 rootPath 尚未下载完成；
 * 若配置了 remoteDownloadChwUrl（CHM 配套 .chw），则 .chw 缺失也视为未完成。
 */
export function isRemoteBuiltinPending (manual) {
  if (!manual?.remoteDownloadUrl || !manual?.rootPath) return false
  try {
    const pi = window.services?.pathInfo?.(manual.rootPath)
    if (!pi?.exists) return true
    if (manual.remoteDownloadChwUrl && /\.chm$/i.test(manual.rootPath)) {
      const chwPath = manual.rootPath.replace(/\.chm$/i, '.chw')
      const cw = window.services?.pathInfo?.(chwPath)
      if (!cw?.exists) return true
    }
    return false
  } catch {
    return true
  }
}
