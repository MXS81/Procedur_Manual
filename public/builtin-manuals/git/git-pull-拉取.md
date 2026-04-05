## git pull 拉取

`git pull` 拉取最新内容并合并。

#### 拉取远程分支最新内容

默认情况下拉取当前分支

```bash
# 如果出现冲突会自动合并
git pull
```

#### 拉取指定分支

```bash
# 远程分支名:本地分支名
git pull origin main:main
# 如果某个远程分支拉取并合并到当前分支后面可以省略
git pull origin main
```

#### 拉取指定工作目录

```bash
# 默认情况下拉取会在当前工作目录中，但如果想拉取指定工作目录，可以指定 `-C`
git -C /opt/work pull
```

#### 同步 Fork 仓库

当 Fork 别人仓库后，原仓库发生变化，可以通过以下操作合并到 Fork 仓库

```bash
# 1、添加原远程仓库：git remote add 自定义名字 远程仓库地址
git remote add upstream https://github.com/xjh22222228/git-manual.git

# 2、拉取远程最新分支内容
git fetch --depth=1 upstream main

# 3、远程最新内容合并到当前分支(允许合并不相关历史记录)
git merge upstream/main --allow-unrelated-histories

# 4、推送到远程
git push
```
