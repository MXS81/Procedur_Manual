## git remote 管理仓库

`git remote` 是 Git 里用于管理远程仓库的命令，借助它可以对远程仓库进行查看、添加、删除、重命名等操作。

#### 基本语法

```bash
git remote [options] [command] [args]
```

- `options`：可选参数，用于指定命令的一些额外设置。
- `command`：指定要执行的操作命令。
- `args`：执行命令所需的参数。

```bash
# 查看远程仓库服务器, 一般打印 origin , 这是 Git 给你克隆的仓库服务器的默认名字
# 一般只会显示 origin , 除非你有多个远程仓库地址
git remote

# 指定-v, 查看当前远程仓库地址
git remote -v

# 添加远程仓库地址 example 是自定义名字
# 添加完后可以通过 git remote 就能看到 example
git remote add example https://github.com/xjh22222228/git-manual.git

# 查看指定远程仓库信息
git remote show example

# 重命名远程仓库
git remote rename oldName newName # git remote rename example simple

# 移除远程仓库
git remote remove example

# 修改远程仓库地址，从HTTPS更改为SSH
git remote set-url origin git@github.com:xjh22222228/git-manual.git

# 后续的推送可以指定仓库名字
git push example

# 更新远程仓库的信息
git remote update
```
