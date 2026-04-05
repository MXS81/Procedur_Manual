## git merge 合并

`git merge`是 Git 里用于将分支的修改合并到当前分支的命令。

`feature/v1.0.0` 分支代码合并到 `develop`

```bash
git checkout develop
git merge feature/v1.0.0
```

将上一个分支代码合并到当前分支

```bash
git merge -
```

以安静模式合并, 把 develop 分支合并到当前分支并不输出任何信息

```bash
git merge develop -q
```

合并不编辑信息, 跳过交互

```bash
git merge develop --no-edit
```

合并分支后不进行提交

```bash
git merge develop --no-commit
```

退出合并，恢复到合并之前的状态

```bash
git merge --abort
```

合并某个分支指定文件或目录, 需要注意的是这会直接覆盖现有文件，而不是本质上的合并。

```bash
# 将dev分支的 src/utils/http.js src/utils/load.js 2个文件合并到当前分支下
git checkout dev src/utils/http.js src/utils/load.js
```

允许合并不相关的历史记录，如果在克隆使用了 `--depth` 参数会导致合并的时候会发生较大冲突，`allow-unrelated-histories` 参数可以有效的解决这个问题

```bash
git merge develop --allow-unrelated-histories
```

合并提交指定自定义的提交信息

```bash
git merge develop -m "Merge develop branch into main"
```
