## git switch 切换创建分支

`git switch` 是 Git 2.23 版本引入的新命令，旨在简化分支切换操作，它是 `git checkout` 部分功能的替代，主要用于在不同分支之间进行切换，让操作更加清晰和安全。

#### 基本语法

```bash
git switch [options] <branch>
git switch [options] -c <new-branch> [start-point]
```

- `options`：可选参数，用于指定不同的操作行为。
- `<branch>`：要切换到的目标分支名称。
- `-c`：创建新分支并切换到该分支。
- `<new-branch>`：要创建的新分支名称。
- `start-point`：可选参数，指定新分支的起始提交点，默认是当前分支的最新提交。

#### 切换分支

```bash
# 切换到 develop 分支
git switch develop

# 切换到上一个分支
git switch -

# 强制切换到 develop 分支，并抛弃本地所有修改
git switch -f develop

# -t, 切换远端分支, 如果用了 git remote 添加一个新仓库就需要用 -t 进行切换
git switch -t upstream/main
```

#### 创建分支

```bash
# 创建分支并切换
git switch -c newBranch

# 强制创建分支
git switch -C newBranch

# 从前3次提交进行创建新的分支
git switch -c newBranch HEAD〜3

# 也可以从某个 commit hash 创建分支
git switch -c new-branch commit-hash

# --track 创建 dev 分支并与远程 code/dev 分支关联
git switch --track code/dev
```
