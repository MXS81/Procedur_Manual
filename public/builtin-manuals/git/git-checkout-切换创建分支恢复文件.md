## git checkout 切换创建分支恢复文件

`git checkout` 是 Git 里一个极为常用的命令，它主要用于在不同分支间切换、恢复文件以及创建新分支并切换到该分支。

#### 基本语法

```bash
git checkout [options] <branch>
git checkout [options] -- <file>
```

- `options`：可选参数，用来指定不同的操作行为。
- `<branch>`：要切换到的分支名称。
- `<file>`：要恢复的文件名称。

#### 切换分支

```bash
# 切换分支
git checkout <branch>

# 切换上一个分支
git checkout -
```

在克隆时使用 `--depth=1` 切换其他分支，比如切换 dev 分支：

```bash
git clone --depth=1 https://github.com/xjh22222228/git-manual.git

# 切换 dev 分支
git remote set-branches origin 'dev'
git fetch --depth=1 origin dev
git checkout dev
```

#### 创建分支

```bash
# 创建本地 develop 分支并切换
git checkout -b develop

# 根据 commit hash 创建新的分支
git checkout -b new-branch commit-hash

# 创建远程分支, 实际上创建本地分支然后推送到远端
git checkout -b develop
git push origin develop

# 创建一个空的分支, 不继承父分支，历史记录是空的，一般至少需要执行4步
git checkout --orphan develop
git rm -rf .  # 这一步可选，如果你真的想创建一个没有任何文件的分支
git add -A && git commit -m "提交" # 添加并提交，否则分支是隐藏的 （执行这一步之前需要注意当前工作区必须保留一个文件，否则无法提交）
git push --set-upstream origin develop # 推送到远程
```

#### 恢复文件到上一次提交的状态

```bash
# -- 后跟着文件名称， 表示恢复该文件到上一次提交的状态
git checkout -- file.txt
```
