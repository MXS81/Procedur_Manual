## git bisect 二分查找

`git bisect` 基于二分查找算法, 用于定位引入 Bug 的 commit，主要 4 个命令。

此命令非常实用, 如果你的 Bug 不知道是哪个 commit 引起的，可以尝试此方法。

```bash
# 开始
git bisect start [终点] [起点] # 通过 git log 确定起点和终点
git bisect start HEAD 4d83cf

# 记录这次的commit是好的
git bisect good

# 记录这次的commit是坏的
git bisect bad

# 退出
git bisect reset
```

参考 [https://github.com/bradleyboy/bisectercise](https://github.com/bradleyboy/bisectercise)
