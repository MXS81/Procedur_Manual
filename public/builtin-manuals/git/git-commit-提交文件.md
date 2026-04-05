## git commit 提交文件

`git commit` 是 Git 中用于将暂存区的内容永久保存到本地仓库历史记录中的关键命令。通过提交，你可以记录项目在某个特定时间点的状态，同时添加描述性的信息，方便后续查看和理解每次更改的目的。

#### 基本语法

```bash
git commit [options] [-m <message>]
```

- `options`：可选参数，用于指定不同的提交行为。
- `-m <message>`：用于提供本次提交的简短描述信息，`<message>` 是具体的描述内容。

```bash
# -m 提交的描述信息
git commit -m "changes log"

# 当提交信息较为复杂，需要多行描述可以不适用 -m 参数，Git会默认打开文本编辑器让你输入提交信息
git commit

# 只提交某个文件
git commit README.md -m "message"

# 提交并显示diff变化
git commit -v

# 允许提交空消息，通常必须指定 -m 参数
git commit --allow-empty-message

# 重写上一次提交信息，确保当前工作区没有改动
git commit --amend -m "新的提交信息"

# 跳过验证, 如果使用了类似 husky 工具。
git commit --no-verify -m "message"
```

#### 修改提交日期

执行 `git commit` 时 `git` 会采用当前默认时间，但有时候想修改提交日期可以使用 `--date` 参数。

格式：`git commit --date="月 日 时间 年 +0800" -m "init"`

例子：`git commit --date="Mar 7 21:05:20 2021 +0800" -m "init"`

**月份简写如下：**

| 月份简写 | 描述   |
| -------- | ------ |
| Jan      | 一月   |
| Feb      | 二月   |
| Mar      | 三月   |
| Apr      | 四月   |
| May      | 五月   |
| Jun      | 六月   |
| Jul      | 七月   |
| Aug      | 八月   |
| Sep      | 九月   |
| Oct      | 十月   |
| Nov      | 十一月 |
| Dec      | 十二月 |
