## git push 推送远端

`git push` 是 Git 中用于将本地仓库的提交推送到远程仓库的命令。当你在本地完成了一系列的代码修改、添加和提交操作后，就可以使用 `git push` 把这些更改同步到远程仓库。

#### 基本语法

```bash
git push [options] [<repository> [<refspec>...]]
```

- `options`：可选参数，用于指定推送操作的一些额外设置。
- `<repository>`：可选参数，指定要推送的远程仓库的名称，默认是 origin。
- `<refspec>`：可选参数，用于指定本地分支和远程分支的映射关系，格式为 `[+]<src>:<dst>`。

```bash
# 默认推送当前分支
# 等价于 git push origin, 实际上推送到一个叫 origin 默认仓库名字
git push

# 设置上游分支并推送
#  使用 -u 或 --set-upstream 选项，在推送的同时将本地分支与远程分支关联起来。之后，再进行该分支的推送或拉取操作时，就可以直接使用 git push 或 git pull，无需再指定远程仓库和分支名称
git push -u origin main

# 本地分支推送到远程分支， 本地分支:远程分支
git push origin <branchName>:<branchName>

# 强制推送, --force 缩写
git push -f

# 删除远程分支
git push origin :old-feature
git push origin --delete old-feature # 或者
```
