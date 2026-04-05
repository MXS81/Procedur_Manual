## 清空commit历史

清空 `commit` 有 2 种方法。

1、第一种方法原理是通过新建新的分支，假设要清空 commit 分支是 `develop`

```bash
# 1、新建一个新分支
git checkout --orphan new_branch
# 2、暂存所有文件并提交
git add -A && git commit -m "First commit"
# 3、删除本地 develop 分支
git branch -D develop
# 4、再将 new_branch 分支重命名为 develop
git branch -m develop
# 5、强制将 develop 分支推送到远程
git push -f origin develop
```

2、第二种方法通过更新 `引用`, 假设要重设 `main` 分支

```bash
# 通过 git log 找到第一个 commit_id
git update-ref refs/heads/main 9c3a31e68aa63641c7377f549edc01095a44c079

# 接着可以提交
git add .
git commit -m "第一个提交"
git push -f # 注意一定要强制推送
```
