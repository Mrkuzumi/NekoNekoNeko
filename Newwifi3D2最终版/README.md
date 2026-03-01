# 已验证新路由3刷此固件并且进行脚本修改TTL可实现路由器上网
## 此固件为网上找到的别人编译好的，我自己编译总是出错
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
## 祝你成功，别忘了在LuCI界面设置无线网络的名称密码以及是否开启SSID广播
## 整理By：Mika
### 2026.3.2 00:02