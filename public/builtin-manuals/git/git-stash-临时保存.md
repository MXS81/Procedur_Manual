## git stash 临时保存

`git stash`是 Git 里一个实用的命令，它可以把当前工作目录里还没提交的修改（包含暂存区和非暂存区的修改）保存起来，让工作目录回到上一次提交时的干净状态。

应用场景：假设当前分支某些功能做到一半了, 突然需要切换到其他分支修改 Bug, 但是又不想提交（因为切换分支必须清理当前工作区，否则无法切换），这个时候 `git stash` 应用场景就来了。

```bash
# 保存当前修改工作区内容
git stash

# 保存时添加注释, 推荐使用此命令
git stash save "修改了#28 Bug"

# 保存包含没有被git追踪的文件
git stash -u

# 查看当前保存列表
git stash list

# 恢复修改工作区内容, 会从 git stash list 移除掉
git stash pop # 恢复最近一次保存内容到工作区, 默认会把暂存区的改动恢复到工作区
git stash pop stash@{1} # 恢复指定 id， 通过 git stash list 可查到
git stash pop --index # 恢复最近一次保存内容到工作区, 但如果是暂存区的内容同样恢复到暂存区

# 与 pop 命令一致, 唯一不同的是不会移除保存列表
git stash apply

# 清空所有保存
git stash clear

# 清空指定 stash id, 如果 drop 后面不指定id清除最近的一次
git stash drop stash@{0}
git stash drop  # 清除最近一次

# 查看已保存的修改文件内容
git stash show -p stash@{0}
```
