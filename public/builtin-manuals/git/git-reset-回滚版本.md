## git reset 回滚版本

回滚版本有 2 种方法：

- `git reset` - 会改变提交历史。当使用 git reset 移动 HEAD 指针后，被跳过的提交在没有其他引用的情况下，最终可能会被 Git 的垃圾回收机制清理掉，从而从提交历史中消失。
- `git revert` - 不会删除任何原有的提交，而是在提交历史中新增一个反向操作的提交。提交历史的连续性得以保留，所有原有的提交仍然存在于历史记录中。

`git reset` 命令用法：

```bash
# --hard 丢弃工作区和暂存区，回到当前提交
git reset --hard

# 回滚上一个版本
git reset --hard HEAD^

# 回滚上两个版本
git reset --hard HEAD^^

# 回滚到指定 commit_id ， 通过 git log 查看
git reset --hard 'commit id'

# 回滚到前一次修改，默认--mixed，重置暂存区，工作区不变
git reset HEAD~1

# --soft 保留之前的暂存区和工作区
git reset --soft HEAD^
```

`git revert` 命令用法：

```bash
# 回滚上一次提交版本
git revert HEAD^

# 回滚指定commit
git revert 8efef3d37

# --no-edit 回滚并跳过编辑消息
git revert HEAD^ --no-edit

# 断开当前操作，还原初始状态
git revert --abort

```
