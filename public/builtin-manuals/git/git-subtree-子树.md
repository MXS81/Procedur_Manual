## git subtree 子树

如果你知道 `git submodule` 那就大概知道 `git subtree` 干嘛用了， 基本上是做同一件事，复用仓库或复用代码。

官方建议使用 `git subtree` 代替 `git submodule`。

`git subtree` 优势：

- 不会像子模块需要 `.gitmodules` 元数据文件管理
- 子仓库会当做普通目录, 其实是没有仓库概念的
- 支持较旧的 Git 版本（甚至比 v1.5.2 还要旧）。
- 简单工作流程的管理很容易。

`git subtree` 劣势：

- 命令过于复杂, 推送拉取都很麻烦
- 虽然用于替代子模块, 但使用率并没有子模块广泛
- 子仓库和主仓库混合在一起, 历史记录相当于有 2 个仓库的记录

`git subtree` 命令用法:

```bash
git subtree add   --prefix=<prefix> <commit>
git subtree add   --prefix=<prefix> <repository> <ref>
git subtree pull  --prefix=<prefix> <repository> <ref>
git subtree push  --prefix=<prefix> <repository> <ref>
git subtree merge --prefix=<prefix> <commit>
git subtree split --prefix=<prefix> [OPTIONS] [<commit>]
```

在操作 `git subtree` 时当前工作区必须清空，否则无法执行。

#### 添加子仓库

- `--prefix` 指定将子仓库存储位置
- `main` 是分支名称
- `--squash` 通常做法是不将子仓库整个历史记录存储在主仓库中，如果需要的话可以忽略整个参数

添加子仓库后, 会跟普通文件一样看待，可以进入 sub/common 目录执行 `git remote -v` 会发现没有仓库。

```bash
git subtree add --prefix=sub/common https://github.com/xjh22222228/git-manual.git main --squash
```

#### 更新子仓库

当远程子仓库有内容变更时，可以通过下面命令进行更新：

```bash
git subtree pull --prefix=sub/common https://github.com/xjh22222228/git-manual.git main --squash
```

#### 推送到子仓库

假如修改了子仓库里的内容，可以将修改这部分的内容推送到子仓库中

```bash
# 需要先在主仓库把子仓库的代码暂存
git add sub/common
git commit -m "子仓库修改"
# 然后推送
git subtree push --prefix=sub/common https://github.com/xjh22222228/git-manual.git main --squash
```

#### 切割

随着项目的迭代, 主仓库会提交过多, 会发现每次 `push` 时会非常慢，尤其在 `windows` 平台较为明显。

每次 `push` 到子仓库里头时会花费大量的时间来重新计算子仓库的提交。并且因为每次 `push` 都是重新计算的，所以本地仓库和远端仓库的提交总是不一样的，这会导致 git 无法解决可能的冲突。

当使用 `git split` 命令后，使用 `git subtree push`，git 只会计算 split 后的新提交。

```bash
git subtree split --prefix=sub/common --branch=main
```

#### 简化命令

通过以上实操，不难发现，`git subtree` 太长了，每次操作都要敲这么长的命令，谁能忍得住。

将子仓库添加为远程仓库：

```bash
# common 是仓库名字，可以随意定义
git remote add -f common https://github.com/xjh22222228/git-manual.git
```

要做其他 `git subtree` 命令时就不需要敲仓库地址了：

```bash
git subtree push --prefix=sub/common common main --squash
```

虽然省去了仓库地址，命令还是太长。

还有另一种解决方案，就是使用别名简化命令：

```bash
# 使用 shell alias（mac / linux）
alias gspush="git subtree push --prefix=sub/common https://github.com/xjh22222228/git-manual.git main --squash"

# 或使用 git 自带的别名命令
git config --global alias.sp 'subtree push --prefix=sub/common'
```
