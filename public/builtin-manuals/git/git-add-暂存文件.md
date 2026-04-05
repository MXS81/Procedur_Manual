## git add 暂存文件

`git add` 是 Git 中一个基础且关键的命令，主要用于将工作目录中修改或新增的文件添加到暂存区。

#### 基本语法

```bash
git add [options] <file>...
```

- `options`：可选参数，用于指定不同的添加行为。
- `<file>`：要添加到暂存区的文件或目录，可以指定多个文件，用空格分隔。

```bash
# 暂存所有
git add -A

# 暂存某个文件
git add ./README.md

# 暂存当前目录所有改动文件
git add .

# 暂存一系列文件
git add 1.txt 2.txt ...

# 暂存所有修改文件或删除文件，创建新的文件不会被暂存
git add -u
```

#### 注意事项

- `.gitignore 文件`：git add 命令会忽略 `.gitignore` 文件中指定的文件和目录，即使使用 `git add .` 或 `git add -A` 也不会添加这些被忽略的文件。
- `重复添加`：如果多次对同一个文件执行 `git add` 命令，只有最后一次添加的更改会被包含在提交中。
