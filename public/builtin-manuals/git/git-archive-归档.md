## git archive 归档

创建一个归档文件，可以理解为将当前项目压缩为一个文件。会忽略掉 `.git` 目录。

但与 `zip` / `tar` 等压缩不同，`git archive` 支持将某个分支或 commit 进行归档。

**参数**

| 参数     | 描述                                                                                |
| -------- | ----------------------------------------------------------------------------------- |
| --format | 可选，指定格式，默认 tar, 支持 tar 和 zip，如果不填会根据 --output 后缀格式进行推断 |
| --output | 输出到指定目录                                                                      |

```bash
# 归档 main 分支 并打包在当前目录下 output.tar.gz
git archive --output "./output.tar.gz" main

# 归档指定commit
git archive --output "./output.tar.gz" d485a8ba9d2bcb5

# 归档为 zip, 无需指定 --format， 因为会根据文件后缀进行推断
git archive --output "./output.zip" main

# 归档一个或多个目录, 而不是归档整个项目
git archive --output "./output.zip" main src tests
```
