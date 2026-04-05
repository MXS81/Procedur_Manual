## git cherry-pick 转移提交

`git cherry-pick` 是 Git 里一个非常实用的命令，其作用是把指定的提交应用到当前分支。常用于同步部分提交或将某个分支的修复应用到其他分支。

#### 基本用法

- `--edit|-e`：在应用提交之前，允许你编辑提交信息。
- `--no-commit`：应用提交但不自动创建新的提交，这样你可以在之后手动提交。
- `--signoff`：在提交信息中添加你的签名，表示你对提交负责。

```bash
# 单个提交
git cherry-pick <commit-hash>

# 多个连续提交（起始提交不包含在内）
git cherry-pick <start-commit-hash>..<end-commit-hash>

# 多个不连续提交
git cherry-pick <commit-hash-1> <commit-hash-2> <commit-hash-3>

# 可以是一个 commit_id 或者是分支名（分支名则取最后一次提交）
git cherry-pick <commit_id>|branch_name

# 支持转移多个提交, 会产生多个提交记录
git cherry-pick <commit_id1> <commit_id2>

# 保留原有作者信息进行提交
git cherry-pick -x <commit_id>

# 重新编辑提交信息, 否则会应用之前的commit消息
git cherry-pick -e <commit_id>

# 断开当前操作回到初始状态
git cherry-pick --abort

# 当发生冲突时解决冲突后使用 git add 加入到暂存区然后执行下面命令继续执行
git cherry-pick --continue
```
