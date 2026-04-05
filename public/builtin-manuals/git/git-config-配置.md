## git config 配置

git config 是 Git 中用于配置各种参数的命令，它允许你对 Git 的行为和环境进行个性化设置。这些设置可以分为三个不同的级别：系统级、全局级和仓库级，不同级别设置的优先级不同，仓库级设置会覆盖全局级设置，而全局级设置又会覆盖系统级设置。

#### 基本语法

```bash
git config [--system | --global | --local] <name> <value>
```

- `--system`：指定系统级配置，对所有用户的所有仓库生效。配置文件通常位于 `/etc/gitconfig`（Linux 或 macOS）。
- `--global`：指定全局级配置，对当前用户的所有仓库生效。配置文件通常位于 `~/.gitconfig` 或 `~/.config/git/config`（Linux 或 macOS）。
- `--local`：指定仓库级配置，仅对当前仓库生效。配置文件位于当前仓库的 `.git/config` 目录下。
- 如果不指定以上任何选项，默认使用 `--local`。
- `<name>`：要配置的参数名称。
- `<value>`：要为参数设置的值。

```bash
# 查看全局配置列表
git config --global -l

# 查看当前仓库配置列表
git config --local -l

# 查看所有的配置以及它们所在的文件
git config --list --show-origin

# 查看已设置的全局用户名/邮箱
git config --global --get user.name
git config --global --get user.email

# 设置全局用户名/邮箱
git config --global user.name "xiejiahe"
git config --global user.email "example@example.com"

# 设置本地当前工作区仓库用户名/邮箱
git config --local user.name "xiejiahe"
git config --local user.email "example@example.com"

# 删除配置
git config --unset --global user.name
git config --unset --global user.email

# 修改默认文本编辑器，比如 nano
# 常用编辑器：emacs / nano / vim / vi
git config --global core.editor nano

# 将默认差异化分析工具设置为 vimdiff
git config --global merge.tool vimdiff

# 编辑当前仓库配置文件
git config -e  # 等价 vi .git/config

# 文件权限的变动也会视为改动, 可通过以下配置忽略文件权限变动
git config core.fileMode false

# 文件大小写设为敏感, git默认是忽略大小写
git config --global core.ignorecase false

# 配置 git pull 时默认拉取所有子模块内容
git config submodule.recurse true

# 记住提交账号密码, 下次操作可免账号密码
git config --global credential.helper store # 永久
git config --global credential.helper cache # 临时，默认15分钟
```

#### 命令别名配置

git 可以使用别名来简化一些复杂命令，类似 [alias](https://github.com/xjh22222228/linux-manual#alias) 命令。

```bash
# git st 等价于 git status
git config --global alias.st status

# 如果之前添加过，需要添加 --replace-all 进行覆盖
git config --global --replace-all alias.st status

# 执行外部命令, 只要在前面加 ! 即可
git config --global alias.st '!echo hello';
# 加 "!" 可以执行外部命令执行一段复杂的合并代码过程，例如：
git config --global alias.mg '!git checkout develop && git pull && git merge main && git checkout -';

# 删除 st 别名
git config --global --unset alias.st
```

#### 配置代理

```bash
# 设置
git config --global https.proxy  http://127.0.0.1:1087
git config --global http.proxy  http://127.0.0.1:1087

# 查看
git config --global --get http.proxy
git config --global --get https.proxy

# 取消代理
git config --global --unset http.proxy
git config --global --unset https.proxy
```
