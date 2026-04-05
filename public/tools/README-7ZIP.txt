本目录下的 7za.exe 由 scripts/copy-bundled-7za.mjs 从 npm 包 7zip-bin-win 复制，仅在 Windows 构建时生成；用于随猿手册插件分发、解压 CHM。

非 Windows 平台当前不复制内置 7za，CHM 仍依赖系统工具或 hh.exe（若后续需要可再扩展 7zip-bin 的 linux/mac 资源）。

7-Zip 主程序遵循 GNU LGPL + unRAR 等许可限制，详见同目录 LICENSE-7zip-bin.txt（若存在）及官方说明：
https://www.7-zip.org/

源码与官方发行包：
https://www.7-zip.org/download.html

勿单独删除 7za.exe；重新生成请运行：node scripts/copy-bundled-7za.mjs
