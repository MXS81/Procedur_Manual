## git rebase 变基

`git rebase` 命令有 2 个比较实用的功能：将多个 commit 记录合并为一条，以及代替 `git merge` 合并代码使历史记录更清晰。

#### 合并多个 commit 记录

要注意保证当前工作区没内容再操作。

1、指定需要操作的记录，这时候会进入交互式命令

```bash
# start起点必填， end 可选，默认当前分支 HEAD 所指向的 commit
git rebase -i <start> <end>

git rebase -i HEAD~5 # 操作最近前5条提交记录
git rebase -i e88835de # 或者以 commit_id 进行操作
```

| 参数      | 描述                                                            |
| --------- | --------------------------------------------------------------- |
| p, pick   | 保留当前 commit，默认                                           |
| r, reword | 保留当前 commit，但编辑提交消息                                 |
| e, edit   | 保留当前 commit，但停止修改                                     |
| s, squash | 保留当前 commit，但融入上一次提交                               |
| b, break  | 在这里停止（稍后使用 `git rebase --continue` 继续重新设置基准） |
| d, drop   | 删除当前 commit                                                 |

2、除了第一条后面全部改成 `s` 或 `squash`

3、按 `:wq` 退出交互式，接着进入另一个交互式来编辑 commit 消息，如果不需要修改之前的 commit 消息则直接退出

4、强制推送到远端

```bash
git push -u -f origin main
```

#### 合并分支代码

用 `git rebase` 代替 `git merge` 进行合并，可以使历史记录更清晰——`git rebase` 生成的是一条直线，而 `git merge` 则会有交叉的合并记录。

```bash
# 1、先切换到 main 分支
git switch main

# 2、dev 分支合并到当前 main 分支
git rebase dev

# 没有冲突情况, 直接推送
git push

# 发生冲突情况，先解决完冲突 => 暂存 => 继续 => 强推
git add -A
git rebase --continue # 继续
git push -f # 强制推送
```

#### 中断 rebase 操作

```bash
# 如果操作一半不想继续使用 rebase 命令则可以中断此次操作
git rebase --abort
```
