# Git个人仓库项目管理常用指令（适配Word复制）

# 一、基础配置（首次使用必做）

### 配置用户名（全局生效）

git config --global user.name "你的用户名"

### 配置邮箱（全局生效）

git config --global user.email "你的邮箱@xxx.com"

### 查看配置信息

git config --list

# 二、仓库初始化与克隆

### 初始化本地仓库

git init （在当前目录生成.git文件夹，初始化新仓库）

### 克隆远程仓库到本地（常用）

git clone <仓库地址>

示例：git clone https://github.com/你的用户名/你的仓库名.git

# 三、日常开发核心操作（高频使用）

## （一）状态查看

1. 查看工作区文件状态（最常用）

git status

2. 简洁版状态（仅显示变更文件名）

git status -s

## （二）文件暂存（git add）

1. 暂存指定文件

git add 文件名

示例：git add README.md

2. 暂存所有修改/新增文件（推荐日常使用）

git add .

3. 暂存已跟踪文件的修改（不含新增文件）

git add -u

## （三）提交变更（git commit）

1. 提交暂存区文件（附带说明，必填）

git commit -m "提交说明：如 修复登录按钮样式问题"

2. 跳过暂存区，直接提交已跟踪文件修改（快捷方式）

git commit -am "提交说明"

3. 修改最后一次提交（补全信息、添加漏提文件）

git commit --amend

## （四）版本回溯/撤销

1. 撤销工作区指定文件修改（恢复至最近提交状态）

git checkout -- 文件名

示例：git checkout -- index.html

2. 撤销暂存区文件（退回工作区）

git reset HEAD 文件名

示例：git reset HEAD app.js

3. 回退至指定版本（保留工作区修改，仅撤销提交）

git reset --soft <版本号前几位>

示例：git reset --soft a1b2c3

4. 强制回退至指定版本（清空工作区和暂存区，谨慎使用）

git reset --hard <版本号前几位>

# 四、分支管理（个人项目常用）

1. 查看所有分支（* 标记当前分支）

git branch

2. 创建新分支

git branch 分支名

示例：git branch feature/login

3. 切换到指定分支

git checkout 分支名

示例：git checkout feature/login

4. 创建并切换到新分支（快捷方式，最常用）

git checkout -b 分支名

示例：git checkout -b bugfix/avatar

5. 删除本地分支（分支已合并后使用）

git branch -d 分支名

# 五、远程仓库交互

1. 查看远程仓库信息

git remote -v

2. 拉取远程仓库最新代码（合并到当前分支）

git pull

3. 推送本地代码到远程仓库

git push

首次推送新分支：git push -u origin 分支名

# 六、版本历史查看

1. 查看提交历史（按时间倒序）

git log

2. 简洁版日志（一行显示，易读）

git log --oneline

3. 图形化分支历史（推荐）

git log --graph --oneline --all

# 七、核心使用流程总结

日常开发核心流程：git status（查看状态）→ git add .（暂存）→ git commit -m "说明"（提交）→ git push（推送远程）

版本回退原则：优先使用git reset --soft（保留修改），git reset --hard会清空工作区，务必谨慎操作

分支管理建议：个人项目用分支区分功能/修复（如feature/xxx、bugfix/xxx），避免直接在主分支（main/master）开发
> （注：文档部分内容可能由 AI 生成）