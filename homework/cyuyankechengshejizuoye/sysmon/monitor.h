#ifndef MONITOR_H
#define MONITOR_H

#define MAX_LOG_ENTRIES 100
#define LOG_FILE "data/monitor.log"

/* 系统信息结构体 */
typedef struct {
    float cpuTemp;          /* CPU 温度 (°C) */
    float loadAvg1;         /* 1分钟负载 */
    float loadAvg5;         /* 5分钟负载 */
    float loadAvg15;        /* 15分钟负载 */
    unsigned long memTotal; /* 总内存 (KB) */
    unsigned long memAvail; /* 可用内存 (KB) */
    unsigned long memUsed;  /* 已用内存 (KB) */
    float memPercent;       /* 内存使用率 (%) */
    unsigned long diskTotal;/* 总磁盘 (KB) */
    unsigned long diskAvail;/* 可用磁盘 (KB) */
    unsigned long diskUsed; /* 已用磁盘 (KB) */
    float diskPercent;      /* 磁盘使用率 (%) */
    long uptimeSecs;        /* 运行时间 (秒) */
    char timestamp[64];     /* 采样时间 */
} SysInfo;

/* 日志条目 */
typedef struct {
    SysInfo info;
    int hasAlert;
    char alertMsg[256];
} LogEntry;

/* 函数声明 */
void printBanner(void);
int  collectSysInfo(SysInfo *info);
void printSysInfo(const SysInfo *info);
void printBrief(const SysInfo *info);
int  checkAlerts(const SysInfo *info, char *alertMsg, int maxLen);
int  saveLog(const LogEntry *entry);
int  loadLogs(LogEntry *entries, int maxCount);
void printLogHistory(LogEntry *entries, int count);
void printBar(float percent, int width, const char *filled, const char *empty);
void waitForEnter(void);

#endif /* MONITOR_H */
