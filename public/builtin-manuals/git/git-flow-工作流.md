## git flow 工作流

Git Flow 是一套基于 git 的工作流程，围绕项目的发布定义了严格的分支模型。`git flow` 只是简化了操作命令，不用 `git flow` 也可以，只要遵循流程手动操作即可。

`git flow` 不是内置命令，需要单独安装。

#### 初始化

每个仓库都必须初始化一次才能使用。

```bash
# 通常直接回车以完成默认设置
git flow init
```

#### 开发功能（feature）

开始开发一个新功能时，打一个 `feature` 分支进行独立开发。

```bash
# 开启新的功能分支, 建立后分支名为 feature/v1.1.0
git flow feature start v1.1.0

# 将分支推送到远程（团队协作时需要）
git flow feature publish v1.1.0

# 完成功能, 会将当前分支合并到 develop 然后删除 feature 分支
git flow feature finish v1.1.0
```

#### 打补丁（hotfix）

已上线功能有 BUG 需要修复时，hotfix 针对 `main` 分支打补丁。

```bash
# 开启一个补丁分支, 建立后分支名为 hotfix/fix_doc
git flow hotfix start fix_doc

# 推送到远程
git flow hotfix publish fix_doc

# 完成补丁, 将当前分支合并到 main 和 develop，然后删除分支
git flow hotfix finish fix_doc
```

#### 发布（release）

完成新需求后可以选择发布，发布后会有版本区分，方便日后查找。

```bash
# 建立一个发布版本, 分支名为 release/v1.1.0
git flow release start v1.1.0

# 推送到远程
git flow release publish v1.1.0

# 完成发布, 合并到 main 和 develop，打标签，删除分支
git flow release finish v1.1.0
```

#### 工作流程概要

- `main` 分支：稳定的生产版本
- `develop` 分支：最新的开发代码
- `feature/*`：新功能开发
- `hotfix/*`：紧急修复
- `release/*`：版本发布准备
