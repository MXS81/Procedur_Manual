## git status 文件状态

`git status`是 Git 中一个非常基础且常用的命令，它用于显示工作目录和暂存区的状态。通过该命令，你可以了解到哪些文件被修改、哪些文件被添加到暂存区、哪些文件被删除等信息。

```bash
# 完整查看文件状态
git status

# 以短格式给出输出
git status -s

# 忽略子模块
git status --ignore-submodules

# 显示已忽略的文件
git status --ignored
```
