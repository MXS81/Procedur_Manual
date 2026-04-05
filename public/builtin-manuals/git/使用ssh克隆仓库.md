## 使用 SSH 克隆仓库

使用 SSH 克隆仓库需要先在电脑生成 SSH 公钥和密钥，以下是生成步骤：

1. 进入到 ssh

```bash
cd ~/.ssh
```

2. 替换为您的 GitHub 电子邮件地址

```bash
# -t ed25519: 使用 Ed25519 算法（更现代且安全）。
# -C: 添加注释，通常是你的邮箱，与GitHub邮箱没有关系
ssh-keygen -t ed25519 -C "your_email@example.com"

# 按提示操作，可以直接回车，默认会生成 ~/.ssh/id_ed25519，你可以修改名称作为管理
```

3. 查看公钥并添加到 GitHub 账号

[https://github.com/settings/keys](https://github.com/settings/keys)

```bash
# 输出类似于 ssh-ed25519 AAAAC3Nza... your_email@example.com，复制整个内容。
cat ~/.ssh/id_ed25519.pub
```

4. 添加 SSH 密钥

```bash
ssh-add ~/.ssh/id_ed25519
```

5. 测试连接

```bash
# 输出以下信息说明 ssh 连接成功
# Hi xxxxx! You've successfully authenticated, but GitHub does not provide shell access.
ssh -T git@github.com
```

#### 管理多个 GitHub 账号

如果你有多个 GitHub 账号，需要额外的配置 `ssh config`

修改 `~/.ssh/config`

```bash
vim ~/.ssh/config
```

```bash
# Host 是自定义名称，通常用 GitHub 账号命名
# 账号1
Host user1
  HostName github.com
  User git
  # 修改你的密钥文件路径
  IdentityFile ~/.ssh/id_ed25519

# 账号2
Host user2
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_2
```

使用自定义名称测试连接

```bash
ssh -T git@user1
```

克隆仓库

```bash
#             Host:用户/仓库
git clone git@user1:admin/demo.git
```
