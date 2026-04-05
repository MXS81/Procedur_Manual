## git show 查看历史提交信息

可以通过 `git show` 命令查看历史提交信息。

```bash
# 不指定参数默认查看最新一条信息
git show

# 指定 commit_id 查看
git show d68a1ef

# 也可以指定 commit_id 查看指定文件提交信息
git show d68a1ef README.md

# 只指定文件名查看最后一次提交包含此文件的提交信息
git show README.md

# 指定分支名查看最后一次提交信息
git show feature/dev
```
