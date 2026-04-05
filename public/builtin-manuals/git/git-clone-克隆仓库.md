## git clone 克隆仓库

`git clone` 用于从远程仓库克隆一个完整的仓库副本到本地，支持 HTTP/HTTPS 和 SSH 协议。

#### 基本语法

```bash
git clone [options] <repository> [<directory>]
```

- `options`：可选参数，用于指定克隆操作的一些额外设置。
- `<repository>`：必选参数，指定要克隆的远程仓库的地址。
- `<directory>`：可选参数，指定克隆到本地的目标目录名称。

#### 常用选项

- `--depth <depth>`：浅克隆，只克隆指定深度的提交历史，显著减少时间和空间。
- `--branch <branch>` 或 `-b <branch>`：指定要克隆的分支。
- `--single-branch`：只克隆指定分支的内容，不克隆其他分支。

```bash
# https 协议克隆
git clone https://github.com/user/repo.git

# SSH 协议克隆
git clone git@github.com:user/repo.git

# 克隆指定分支
git clone -b develop https://github.com/user/repo.git

# 完全只克隆指定分支
git clone -b develop --single-branch https://github.com/user/repo.git

# 指定克隆后的文件夹名称
git clone https://github.com/user/repo.git my-project

# 递归克隆，如果项目包含子模块就非常有用
git clone --recursive https://github.com/user/repo.git

# 浅克隆, 只保留最后一条提交记录, 通常用于减少克隆时间和项目大小
git clone --depth=1 https://github.com/user/repo.git

# 浅克隆同时克隆其他所有分支
git clone --depth=1 --no-single-branch https://github.com/user/repo.git

# 裸克隆, 没有工作区内容，一般用于复制仓库
git clone --bare https://github.com/user/repo.git

# 镜像克隆, 也是裸克隆, 区别于包含上游版本库注册
git clone --mirror https://github.com/user/repo.git
```

#### 克隆指定文件夹（稀疏检出）

有些仓库包含客户端、服务端等多个端的代码，只想克隆某个文件夹时，可以使用稀疏检出。

```bash
# 1、创建一个目录并进入
mkdir my-project && cd my-project

# 2、初始化仓库
git init

# 3、设置仓库地址
git remote add origin https://github.com/user/repo.git

# 4、开启稀疏检出功能
git config core.sparsecheckout true

# 5、将需要检出的目录路径写入追加进去
echo "src" >> .git/info/sparse-checkout

# 6、拉取内容
git pull origin main
```
