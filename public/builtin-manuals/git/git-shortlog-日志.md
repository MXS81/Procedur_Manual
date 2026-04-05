## git shortlog 日志

`git shortlog` 命令，它会按照作者对提交进行分组，并统计每个作者的提交数量，同时显示每个作者的最新提交信息。

```bash
# 默认以贡献者分组进行输出
git shortlog

# 列出提交者代码贡献数量, 打印作者和贡献数量
git shortlog -sn

# 以提交贡献数量排序并打印出message
git shortlog -n

# 采用邮箱格式化的方式进行查看贡献度
git shortlog -e
```
