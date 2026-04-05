## git blame 最后修改信息

`git blame` 是 Git 里一个极为实用的命令，其主要功能是逐行查看文件内容的最后修改信息，包括最后修改该内容的提交哈希、作者、日期以及提交信息。

#### 基本语法

```bash
git blame <文件名>
```

```bash
# 查看 README.md 文件的修改信息，他会以每行修改信息展示
git blame README.md

# 查看文件的指定的行数修改信息
git blame -L 11,12 README.md
git blame -L 11 README.md   # 查看第11行以后

# 显示完整的 hash 值
git blame -l README.md

# 显示修改的行数
git blame -n README.md

# 显示作者邮箱
git blame -e README.md

# 对参数进行一个组合查询
git blame -enl -L 11 README.md

# -w 忽略空格更改
git blame -w README.md

# 以更易读的格式显示时间戳
git blame -c README.md
```
