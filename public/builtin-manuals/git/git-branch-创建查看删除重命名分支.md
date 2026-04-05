## git branch 创建查看删除重命名分支

`git branch` 是 Git 中用于管理分支的核心命令

#### 基本语法

```bash
git branch [options] [branch-name] [start-point]
```

#### 查看分支

```bash
# 查看所有分支
git branch -a

# 查看本地分支
git branch

# 查看远端分支
git branch -r

# 查看本地分支所关联的远程分支
git branch -vv

# 查看本地 main 分支创建时间
git reflog show --date=iso main

# 搜索分支, 借助 grep 命令來搜索, 包含关键字 dev
git branch -a | grep dev

# 查看哪些分支已经合并到当前分支
# 该命令会列出已经将其更改合并到当前分支的所有分支。通常，这些分支可以安全地删除。
git branch --merged

# 查看哪些分支还未合并到当前分支
git branch --no-merged
```

#### 创建分支

```bash
# 创建分支
git branch new-feature

# 从指定 commit 创建分支
git branch new-feature commit-hash

# 强制创建分支
git branch -f main

# 创建孤立分支，没有历史记录
git checkout --orphan new-feature
```

#### 删除分支

```bash
# 删除本地已合并的main分支
git branch -d main

# 强制删除本地分支
git branch -D branch-to-delete
```

#### 重命名分支

```bash
# 重命名分支
git branch -m old-branch-name new-branch-name
```

#### 给分支添加备注

有时候分支过多很难通过分支名去判断这个分支做了什么。

```bash
# 命令
$ git config branch.{branch_name}.description 备注内容

# 给 hotfix/tip 分支添加备注信息
$ git config branch.hotfix/tip.description 修复细节
```
