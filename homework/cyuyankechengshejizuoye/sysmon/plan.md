# 树莓派系统监控工具 — 规划方案

## 项目概述
开发一个基于 C 语言的命令行系统监控工具，运行于树莓派 4B（ARM64 Linux），通过读取 Linux procfs/sysfs 虚拟文件系统获取 CPU 温度、负载、内存、磁盘和运行时间等信息，提供菜单式交互和日志保存功能。

---

## 一、需求分析

### 1.1 功能需求
| 功能 | 优先级 | 说明 |
|------|--------|------|
| 系统信息采集 | P0 | 读取 CPU 温度、负载、内存、磁盘、运行时间 |
| 菜单交互 | P0 | 循环菜单，支持 0-5 选择 |
| 完整状态显示 | P0 | 格式化输出全部信息 + ASCII 进度条 |
| 快速概览 | P1 | 一行浓缩显示 |
| 实时监控 | P1 | 每2秒采样，共15次，自动保存日志 |
| 历史记录 | P1 | 从文件读取最近10条记录并展示 |
| 告警检测 | P2 | CPU>75°C / 内存>90% / 磁盘>85% 时报警 |
| 日志持久化 | P0 | 每次采样追加到 data/monitor.log |

### 1.2 技术约束
- 语言：C11 标准
- 平台：ARM64 Linux (Raspberry Pi OS)
- 构建：Makefile + GCC
- 数据来源：/proc 和 /sys 虚拟文件系统
- 界面：纯命令行，无图形依赖

---

## 二、文件结构

```
sysmon/
├── main.c          # 入口，菜单循环
├── monitor.h       # 结构体定义 + 函数声明
├── monitor.c       # 采集 / 显示 / 日志 / 告警实现
├── Makefile        # 编译脚本
├── data/
│   └── monitor.log  # 运行日志（自动生成）
├── sysmon           # 编译产物
├── 实验报告.docx    # 课程设计报告
└── AI对话记录.md    # AI 协作记录
```

---

## 三、模块设计

### 3.1 主控模块 (main.c)
- 显示 Banner
- while(1) 循环 + 菜单打印
- switch-case 调度各功能
- scanf 输入 + 非法输入处理

### 3.2 系统信息采集模块 (monitor.c)
- `collectSysInfo()` — 核心采集函数
  - CPU温度: `/sys/class/thermal/thermal_zone0/temp`
  - 负载: `/proc/loadavg`
  - 内存: `/proc/meminfo` (逐行匹配)
  - 磁盘: `statvfs()` 系统调用
  - 运行时间: `/proc/uptime`

### 3.3 显示模块 (monitor.c)
- `printSysInfo()` — 完整带进度条
- `printBrief()` — 一行概览
- `printBar()` — ASCII 进度条

### 3.4 日志模块 (monitor.c)
- `saveLog()` — 追加写入
- `loadLogs()` — 读取到数组
- 格式：`timestamp|cpuTemp|load|memPct|diskPct|memUsedKB|diskUsedKB`

### 3.5 告警模块 (monitor.c)
- `checkAlerts()` — 阈值比较，拼接告警信息

---

## 四、数据流

```
用户输入 (0-5)
    ↓
主菜单 switch-case
    ↓
采集数据 ──→ collectSysInfo()
    ↓
显示/告警/日志 ──→ printSysInfo() / checkAlerts() / saveLog()
    ↓
返回菜单 (while 循环)
    ↓
输入 0 → 退出
```

---

## 五、开发计划

| 阶段 | 任务 | 预计时间 |
|------|------|----------|
| 1 | 需求分析和模块设计 | 1 天 |
| 2 | 编写结构体和函数声明 (monitor.h) | 0.5 天 |
| 3 | 实现采集函数 collectSysInfo() | 1 天 |
| 4 | 实现主菜单和调度逻辑 (main.c) | 0.5 天 |
| 5 | 实现显示函数和进度条 | 0.5 天 |
| 6 | 实现日志读写 | 0.5 天 |
| 7 | 实现告警检测 | 0.5 天 |
| 8 | 编译调试和测试 | 1 天 |
| 9 | 撰写实验报告和整理记录 | 1 天 |

---

## 六、风险与应对

| 风险 | 概率 | 应对 |
|------|------|------|
| /proc 文件格式在不同内核版本差异 | 低 | 使用通用字段名，做 NULL 保护 |
| 进度条 Unicode 字符编译警告 | 中 | 改用 const char* 字符串传递 |
| 文件写入权限问题 | 低 | 在 data/ 目录下操作，走相对路径 |
| scanf 输入缓冲区残留 | 中 | 每次读取后清空 stdin |

---

## 七、验收标准

1. ✅ 能显示完整的系统状态信息
2. ✅ 非法输入不崩溃，有合理提示
3. ✅ 实时监控模式能持续采样并自动停止
4. ✅ 历史记录能正确读写
5. ✅ 超阈值时能触发告警
6. ✅ make clean && make 零警告编译
7. ✅ 所有 .c / .h 文件按功能拆分
