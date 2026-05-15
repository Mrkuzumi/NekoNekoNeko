# 这是一篇关于Windows如何使用claude code平台接入底层模型Deepseek的教程（其他模型方法类似，请查看其官方文档）


# 步骤①：设定代理

## 如果没有让终端走到代理则终端无法解析安装脚本

### 在终端输入：

```bash
$env:HTTP_PROXY="http://127.0.0.1:7890"
$env:HTTPS_PROXY="http://127.0.0.1:7890"
```

>[!CAUTION]
>## 注意7890这个端口要看你的clash开放的端口是多少，一般默认为7890
>

[查看clash端口](./pic/pic1.png)

## 打开TUN模式

### 在终端输入claude code的官方安装脚本：
```bash
irm https://claude.ai/install.ps1 | iex
```
以开始安装

## 但凡出现终端大片爆红错误的，都是网络代理的问题，换一换节点。

# 步骤②：在官方脚本installed successful之后
你会看到有一行灰色的小字：
```
Setup notes:
Native installation exists but C:\Users\你的用户名\.local\bin is notin your PATH. Add it by opening: System Properties Environment Variables Edit User PATH New Add the path above. Then restart your terminal.
```

[需要添加环境变量](./pic/pic2.png)

## 然后你需要去到系统环境变量，找到Path,双击打开后新建一个变量，并且将灰色字段的**C:\Users\你的用户名\.local\bin**粘贴进去。有了这一步，你才能够在任意文件夹的位置输入claude启动。

[添加教程](./pic/hjbl.png)

# 步骤③：小破解（也算不上）
## 去到你的%User%目录下，会有一个 **.claude.json**的文件，在最后一个 **true**之后加一个英文逗号，然后新起一行，输入：
```json

"hasCompletedOnboarding":true 
```
[添加破解](./pic/pic3.png)

然后你就可以绕过claude官方登录认证了

# 步骤④：接入Deepseek API

## 在你的需要工作的项目文件夹空白处右键，点击在终端中打开，输入：

```bash
$env:ANTHROPIC_BASE_URL="https://api.deepseek.com/anthropic"
$env:ANTHROPIC_AUTH_TOKEN="把这里替换为你的APIkey，引号要保留"
$env:ANTHROPIC_MODEL="deepseek-v4-pro[1m]"
$env:ANTHROPIC_DEFAULT_OPUS_MODEL="deepseek-v4-pro[1m]"
$env:ANTHROPIC_DEFAULT_SONNET_MODEL="deepseek-v4-pro[1m]"
$env:ANTHROPIC_DEFAULT_HAIKU_MODEL="deepseek-v4-flash"
$env:CLAUDE_CODE_SUBAGENT_MODEL="deepseek-v4-flash"
$env:CLAUDE_CODE_EFFORT_LEVEL="max"
```
注意将第2行相应位置替换为你的Deepseek申请到的API密钥。

## 注：这个设置的是临时环境变量，也许你换一个项目文件夹在终端打开之后就需要重新再输入以上字段

## 也许你可以在与Path同等级的地方新建以上变量，如图一样的效果，查询ai以获得一键添加的bash代码

[永久环境变量的效果](./pic/pic4.png)

然后基本就配置完毕了，输入
```bash
claude
```
唤醒小螃蟹，注意检查是否成功接入deepseek

[底层模型是ds](./pic/pic5.png)

可询问它是什么模型，或让它写一个printf hello world的程序。然后去ds的官网查看用量信息

[用量信息](./pic/pic6.png)

# Tips：
在同一项目文件夹下，输入
```bash
claude --continue
```
能够继续上次的对话
 