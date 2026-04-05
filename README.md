# 猿手册（uTools 插件）

本地技术手册阅读与检索：支持 Markdown、HTML、PDF、CHM、目录型文档等。

## 版权声明

**资料搜集自网络，若有侵权，联系删除。** 详细说明见仓库根目录 [`版权声明.md`](./版权声明.md)。

## 开发

```bash
npm install
npm run dev
```

## 构建（发布到 uTools）

```bash
npm run build
```

产物在 `dist/` 目录，用于打包为 uTools 插件。

## 技术栈

React、Vite、preload（Node）端文件与索引能力等；详见 `package.json`。
