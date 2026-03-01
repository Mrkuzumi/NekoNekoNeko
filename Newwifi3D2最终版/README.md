# 已验证新路由3刷此固件并且进行脚本修改TTL可实现路由器上网
## 此固件为网上找到的别人编译好的，支持科学，多拨，广告屏蔽（我自己编译和云编译出来的固件总是出错）
### 刷机后使用PuTTY（或者其它软件） SSH连接192.168.1.1后粘贴以下脚本即可：
```bash

#开启IP转发
echo 1 > /proc/sys/net/ipv4/ip_forward
#开启NAT（伪装）
iptables -t nat -A POSTROUTING -o eth0.2 -j MASQUERADE
#设置TTL为128，伪装成单设备,我们学校是128，具体多少看你学校
iptables -t mangle -A POSTROUTING -o eth0.2 -j TTL --ttl-set 128
#保存规则到防火墙自启（重启不丢）
echo -e "echo 1 > /proc/sys/net/ipv4/ip_forward\niptables -t nat -A POSTROUTING -o eth0.2 -j MASQUERADE\niptables -t mangle -A POSTROUTING -o eth0.2 -j TTL --ttl-set 128" >> /etc/firewall.user
chmod +x /etc/firewall.user
/etc/init.d/firewall restart
```
## 执行完以上命令，路由器重启后可能会失效，然后再执行：
```bash
# 开启 IP 转发
echo 1 > /proc/sys/net/ipv4/ip_forward

# 开启 NAT 伪装（让其他设备能上网）
iptables -t nat -A POSTROUTING -o eth0.2 -j MASQUERADE

# 设置 TTL 为 128，防多设备检测
iptables -t mangle -A POSTROUTING -o eth0.2 -j TTL --ttl-set 128
#把规则写入 /etc/firewall.user，这样每次开机都会自动加载：
cat >> /etc/firewall.user << 'EOF'
echo 1 > /proc/sys/net/ipv4/ip_forward
iptables -t nat -A POSTROUTING -o eth0.2 -j MASQUERADE
iptables -t mangle -A POSTROUTING -o eth0.2 -j TTL --ttl-set 128
EOF

chmod +x /etc/firewall.user
/etc/init.d/firewall restart
```
## 祝你成功，别忘了在LuCI界面设置无线网络的名称密码以及是否开启SSID广播
> [!CAUTION]
>### 不过基本的上网是解决了，现在有一个问题就是无法访问我们学校的内网系统，目前还不知道怎么解决，解决了我会更新README的
## 整理By：Mika
### 2026.3.2 00:02
> [!TIP]
> ## <span style="color: #22c55e;">! 又报错了</span>
> <span style="color: #22c55e;">我知道，那你说怎么办呢</span>

> [!CAUTION]
> ## <span style="color: #ef4444;">我乱改一通，居然过了，嘿嘿嘿</span>

> [!CAUTION]
> ## <span style="color: #ef4444;">又要没完没了的STFW了？</span>
> <span style="color: #ef4444;">对</span>
