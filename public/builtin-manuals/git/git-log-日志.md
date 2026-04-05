## git log 日志

执行 `git log` 命令，会显示当前分支从最近到最早的所有提交记录，每条记录包含提交哈希、作者、日期以及提交说明。

```bash
# 查看完整历史提交记录
git log

# 查看前N次提交记录 commit message
git log -2

# 查看前N次提交记录，包括diff
git log -p -2

# 从 commit 进行搜索, 可以指定 -i 忽略大小写
git log -i --grep="fix: #28"

# 从工作目录搜索包含 alert(1) 这段代码何时引入
git log -S "alert(1)"

# 查看指定作者历史记录
git log --author=xjh22222228

# 查看某个文件的历史提交记录
git log README.md

# 只显示合并日志
git log --merges

# 将每条提交记录显示为一行，仅包含提交哈希的前几位和提交说明，便于快速查看
git log --oneline

# 以图形查看日志记录
git log --graph --oneline

# 以倒序查看历史记录
git log --reverse

# --since 和 --until：显示指定时间范围内的提交记录
git log --since="2025-03-01" --until="2025-03-25"
```

#### 格式化日志

在使用 `git log` 命令时可以携带 `--pretty=format` 用来格式化日志。

**常用格式如下：**

| 参数 | 描述                                                                   |
| ---- | ---------------------------------------------------------------------- |
| %H   | 完整 commit hash                                                       |
| %h   | 简写 commit hash 一般是前 7 位                                         |
| %T   | 完整 hash 树                                                           |
| %t   | 简写 hash 树                                                           |
| %an  | 作者名称                                                               |
| %ae  | 作者邮箱                                                               |
| %ad  | 作者日期, RFC2822 风格：`Thu Jul 2 20:42:20 2020 +0800`                |
| %ar  | 作者日期, 相对时间：`2 days ago`                                       |
| %ai  | 作者日期, ISO 8601-like 风格： `2020-07-02 20:42:20 +0800`             |
| %aI  | 作者日期, ISO 8601 风格： `2020-07-02T20:42:20+08:00`                  |
| %cn  | 提交者名称                                                             |
| %ce  | 提交者邮箱                                                             |
| %cd  | 提交者日期，RFC2822 风格：`Thu Jul 2 20:42:20 2020 +0800`              |
| %cr  | 提交者日期，相对时间：`2 days ago`                                     |
| %ci  | 提交者日期，ISO 8601-like 风格： `2020-07-02 20:42:20 +0800`           |
| %cI  | 提交者日期，ISO 8601 风格： `2020-07-02T20:42:20+08:00`                |
| %d   | 引用名称： (HEAD -> main, origin/main, origin/HEAD)                    |
| %D   | 引用名称，不带 `()` 和 换行符： HEAD -> main, origin/main, origin/HEAD |
| %e   | 编码方式                                                               |
| %B   | 原始提交内容                                                           |
| %C   | 自定义颜色                                                             |

例子：

```bash
git log -n 1 --pretty=format:"%an" # xjh22222228

git log -n 1 --pretty=format:"%ae" # xjh22222228@gmail.com

git log -n 1 --pretty=format:"%d" #  (HEAD -> main, origin/main, origin/HEAD)

# 自定义输出颜色, %C后面跟着颜色名
git log --pretty=format:"%Cgreen 作者：%an"
```
