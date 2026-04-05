## git reflog 日志

`git reflog` 命令，它会展示本地仓库引用的更新历史，每条记录包含引用的哈希值、操作名称、提交信息以及时间等内容。

- 显示 HEAD（或指定引用）在过去一段时间内的所有移动记录。
- 包括提交、分支切换、重置、变基等操作，即使这些提交不再属于任何分支。
- 面向引用变更，记录操作历史，适合救急和调试。

如果你执行 `git reset --hard` 或删除分支，某些提交会变得 `“不可达”`，`git log` 不会显示。

```bash
# 每条提交记录以一行的形式输出日志
git reflog

# 恢复丢失提交，通过 git reflog 找回 commit_id
git reflog
git reset --hard commit_id

# 指定显示的记录数量。例如，显示最近的 5 条记录
git reflog -n 5

# 以相对时间（如 “2 days ago”）显示记录的日期
git reflog --relative-date

# 按照不同的日期格式显示记录。例如，以 iso 格式显示日期
git reflog --date=iso
```

#### 注意事项

- 记录的是本地仓库的操作历史，不会随着代码一起推送到远程仓库。
- 记录默认会保留 90 天（对于可达对象）或 30 天（对于不可达对象），但这个时间可以通过配置项 `gc.reflogExpire` 和 `gc.reflogExpireUnreachable` 进行调整。
