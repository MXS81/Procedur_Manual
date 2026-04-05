## git diff 比较文件内容差异

`git diff` 命令用于查看`工作区文件`内容与暂存区或远端之间的差异。

#### git diff

```bash
# 查看所有文件工作区与暂存区的差异
git diff

# 查看指定文件工作区与暂存区差异
git diff README.md

# 查看指定 commit 内容差异
git diff dce06bd

# 对比2个commit之间的差异
git diff e3848eb dce06bd

# 比较2个分支最新提交内容差异, develop分支与main分支, 如果没有差异返回空
git diff develop main

# 比较2个分支指定文件内容差异, develop 和 main READNE.md 文件差异
git diff develop main README.md README.md

# 查看工作区冲突文件差异
git diff --name-only --diff-filter=U

# 查看上一次修改了哪些文件
git diff --name-only HEAD~
git diff --name-only HEAD~~ # 前2次...
```
