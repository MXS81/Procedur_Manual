## git submodule 子模块

`git submodule` 子模块的作用类似于包管理，类似 `npm`, 主要是复用仓库, 但比包管理使用起来更方便。

子模块可以不建立版本分支管理代码, 因为它是依赖主应用，所以建立版本分支可以从主应用去操作，那么一旦建立新的版本分支当前的所有内容都会被锁定在这个分支上，不管子模块仓库怎么修改。

#### 添加子模块

添加完子模块后会发现根目录下多了个 `.gitmodules` 元数据文件，主要是用于管理子模块。

```bash
git submodule add https://github.com/xjh22222228/git-manual.git # 默认添加到当前目录下
git submodule add https://github.com/xjh22222228/git-manual.git submodules/git-manual  # 添加到指定目录

# -b 指定需要添加仓库的某个分支
git submodule add -b develop https://github.com/xjh22222228/git-manual.git
```

#### 删除子模块

```bash
# 1、直接删除子模块目录
rm -rf submodule

# 2、编辑目录下的 .gitmodules 文件把需要删除的子模块删除掉

# 最后直接推送
git add -A
git commit -m "删除子模块"
git push
```

#### 克隆一个包含子模块的仓库

```bash
# --recursive 用于递归克隆，否则子模块目录是空的
git clone --recursive https://github.com/xjh22222228/git-manual.git

# 如果已经克隆了一个包含子模块的项目，但忘记了 --recursive， 可以使用此命令 初始化、抓取并检出任何嵌套的子模块
git submodule update --init --recursive
```

#### 修复子模块分支

当把一个包含子模块的仓库克隆下来后会发现子模块分支不对，可以使用下面命令纠正：

```bash
git submodule foreach -q --recursive 'git checkout $(git config -f $toplevel/.gitmodules submodule.$name.branch || echo main)'
```

#### 更新子模块代码

方法一：通常我们需要更新代码只需要执行 `git pull`, 这是比较笨的办法。

```bash
# 递归抓取子模块的所有更改，但不会更新子模块内容
git pull

# 这个时候需要进入子模块目录进行更新, 这样就完成了一个子模块更新，但是如果有很多子模块就比较麻烦了
cd git-manual && git pull
```

方法二：使用 `git submodule update` 更新子模块

```bash
# git 会尝试更新所有子模块, 如果只需要更新某个子模块只要在 --remote 后指定子模块名称
git submodule update --remote

# --recursive 会递归所有子模块, 包括子模块里的子模块
git submodule update --init --recursive
```

方法三：使用 `git pull` 更新, 这是一种新的更新模式，需要 >= 2.14

```bash
git pull --recurse-submodules
```

如果嫌麻烦每次 git pull 都需要手动添加 `--recurse-submodules`，可以配置默认行为：

```bash
git config submodule.recurse true
```
