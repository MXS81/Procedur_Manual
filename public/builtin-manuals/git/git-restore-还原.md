## git restore 还原

`git restore`是 Git 2.23 版本引入的一个命令，主要用于恢复工作区文件和暂存区的状态。

是为了分离 `git checkout` / `git reset` 职责。

```bash
# 撤销工作区文件修改, 不包括新建文件
git restore README.md # 一个文件
git restore README.md README2.md # 多个文件
git restore . # 当前全部文件

# 从暂存区回到工作区
git restore --staged README.md
```
