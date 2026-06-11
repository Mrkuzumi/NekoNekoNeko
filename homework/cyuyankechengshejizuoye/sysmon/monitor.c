#include "monitor.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <sys/statvfs.h>

/* ===== 工具函数 ===== */
void printBanner(void) {
    printf("\n");
    printf("  ╔════════════════════════════════════╗\n");
    printf("  ║       Raspberry Pi SysMonitor      ║\n");
    printf("  ║      树莓派系统监控工具 v1.0        ║\n");
    printf("  ╚════════════════════════════════════╝\n");
    printf("\n");
}

void waitForEnter(void) {
    printf("\n按 Enter 键继续...");
    while (getchar() != '\n');
    getchar();
}

/* ===== 数据采集 ===== */
int collectSysInfo(SysInfo *info) {
    FILE *fp;
    char buf[256];
    time_t now = time(NULL);
    struct tm *tm = localtime(&now);
    strftime(info->timestamp, sizeof(info->timestamp),
             "%Y-%m-%d %H:%M:%S", tm);

    /* CPU 温度 */
    fp = fopen("/sys/class/thermal/thermal_zone0/temp", "r");
    if (fp) {
        int tempRaw;
        fscanf(fp, "%d", &tempRaw);
        info->cpuTemp = tempRaw / 1000.0f;
        fclose(fp);
    } else {
        info->cpuTemp = -1.0f;
    }

    /* 负载平均值 */
    fp = fopen("/proc/loadavg", "r");
    if (fp) {
        fscanf(fp, "%f %f %f", &info->loadAvg1,
               &info->loadAvg5, &info->loadAvg15);
        fclose(fp);
    }

    /* 内存信息 */
    info->memTotal = 0;
    info->memAvail = 0;
    fp = fopen("/proc/meminfo", "r");
    if (fp) {
        while (fgets(buf, sizeof(buf), fp)) {
            if (sscanf(buf, "MemTotal: %lu kB", &info->memTotal) == 1) continue;
            if (sscanf(buf, "MemAvailable: %lu kB", &info->memAvail) == 1) continue;
        }
        fclose(fp);
    }
    info->memUsed = info->memTotal - info->memAvail;
    info->memPercent = (info->memTotal > 0)
        ? (100.0f * info->memUsed / info->memTotal) : 0;

    /* 磁盘信息 (根目录) */
    struct statvfs svfs;
    if (statvfs("/", &svfs) == 0) {
        unsigned long blockSize = svfs.f_frsize / 1024; /* KB per block */
        info->diskTotal  = svfs.f_blocks * blockSize;
        info->diskAvail  = svfs.f_bfree  * blockSize;
        info->diskUsed   = info->diskTotal - info->diskAvail;
        info->diskPercent = (info->diskTotal > 0)
            ? (100.0f * info->diskUsed / info->diskTotal) : 0;
    } else {
        info->diskTotal = info->diskAvail = info->diskUsed = 0;
        info->diskPercent = 0;
    }

    /* 运行时间 */
    fp = fopen("/proc/uptime", "r");
    if (fp) {
        float up;
        fscanf(fp, "%f", &up);
        info->uptimeSecs = (long)up;
        fclose(fp);
    } else {
        info->uptimeSecs = 0;
    }

    return 0;
}

/* ===== 打印系统信息 ===== */
void printSysInfo(const SysInfo *info) {
    int days, hours, mins;
    days  = (int)(info->uptimeSecs / 86400);
    hours = (int)((info->uptimeSecs % 86400) / 3600);
    mins  = (int)((info->uptimeSecs % 3600) / 60);

    printf("  ┌──────────────────────────────────┐\n");
    printf("  │ 采样时间: %s         │\n", info->timestamp);
    printf("  ├──────────────────────────────────┤\n");
    printf("  │ [CPU]                           │\n");

    if (info->cpuTemp >= 0)
        printf("  │   温度:  %.1f°C", info->cpuTemp);
    else
        printf("  │   温度:  N/A");

    /* 温度条 */
    printf("  ");
    if (info->cpuTemp >= 0) printBar(info->cpuTemp / 80.0f * 100, 10, "#", ".");
    printf("\n");

    printf("  │   负载:  %.2f / %.2f / %.2f (1/5/15 min)\n",
           info->loadAvg1, info->loadAvg5, info->loadAvg15);
    printf("  ├──────────────────────────────────┤\n");
    printf("  │ [内存]                          │\n");
    printf("  │   总容量:  %lu MB\n",  info->memTotal / 1024);
    printf("  │   已使用:  %lu MB (%.1f%%)\n",
           info->memUsed / 1024, info->memPercent);
    printf("  │   可用:    %lu MB\n",  info->memAvail / 1024);
    printf("  │  "); printBar(info->memPercent, 20, "█", "░");
    printf("\n");
    printf("  ├──────────────────────────────────┤\n");
    printf("  │ [磁盘]                          │\n");
    printf("  │   总容量:  %lu MB\n",  info->diskTotal / 1024);
    printf("  │   已使用:  %lu MB (%.1f%%)\n",
           info->diskUsed / 1024, info->diskPercent);
    printf("  │   可用:    %lu MB\n",  info->diskAvail / 1024);
    printf("  │  "); printBar(info->diskPercent, 20, "█", "░");
    printf("\n");
    printf("  ├──────────────────────────────────┤\n");
    printf("  │ [运行时间]                      │\n");
    printf("  │   %d 天 %d 小时 %d 分钟\n", days, hours, mins);
    printf("  └──────────────────────────────────┘\n");
}

void printBrief(const SysInfo *info) {
    if (info->cpuTemp >= 0)
        printf("CPU: %.1f°C | 内存: %.1f%% | 磁盘: %.1f%% | 负载: %.2f\n",
               info->cpuTemp, info->memPercent,
               info->diskPercent, info->loadAvg1);
    else
        printf("CPU: N/A | 内存: %.1f%% | 磁盘: %.1f%% | 负载: %.2f\n",
               info->memPercent, info->diskPercent, info->loadAvg1);
}

/* ===== 进度条 ===== */
void printBar(float percent, int width, const char *filled, const char *empty) {
    int fill = (int)(percent * width / 100.0f);
    if (fill > width) fill = width;
    if (fill < 0) fill = 0;

    printf("[");
    for (int i = 0; i < width; i++) {
        printf("%s", i < fill ? filled : empty);
    }
    printf("] %3.0f%%", percent);
}

/* ===== 告警检测 ===== */
int checkAlerts(const SysInfo *info, char *alertMsg, int maxLen) {
    int count = 0;
    alertMsg[0] = '\0';
    char buf[128];

    if (info->cpuTemp > 75.0f) {
        snprintf(buf, sizeof(buf), "[!] CPU 温度过高: %.1f°C\n", info->cpuTemp);
        strncat(alertMsg, buf, maxLen - strlen(alertMsg) - 1);
        count++;
    }
    if (info->memPercent > 90.0f) {
        snprintf(buf, sizeof(buf), "[!] 内存使用率过高: %.1f%%\n", info->memPercent);
        strncat(alertMsg, buf, maxLen - strlen(alertMsg) - 1);
        count++;
    }
    if (info->diskPercent > 85.0f) {
        snprintf(buf, sizeof(buf), "[!] 磁盘使用率过高: %.1f%%\n", info->diskPercent);
        strncat(alertMsg, buf, maxLen - strlen(alertMsg) - 1);
        count++;
    }
    return count;
}

/* ===== 日志管理 ===== */
int saveLog(const LogEntry *entry) {
    FILE *fp = fopen(LOG_FILE, "a");
    if (!fp) return -1;

    fprintf(fp, "%s|%.1f|%.2f|%.1f|%.1f|%lu|%lu\n",
            entry->info.timestamp,
            entry->info.cpuTemp,
            entry->info.loadAvg1,
            entry->info.memPercent,
            entry->info.diskPercent,
            entry->info.memUsed / 1024,
            entry->info.diskUsed / 1024);
    fclose(fp);
    return 0;
}

int loadLogs(LogEntry *entries, int maxCount) {
    FILE *fp = fopen(LOG_FILE, "r");
    if (!fp) return 0;

    int count = 0;
    char line[256];
    while (fgets(line, sizeof(line), fp) && count < maxCount) {
        LogEntry *e = &entries[count];
        sscanf(line, "%63[^|]|%f|%f|%f|%f|%lu|%lu",
               e->info.timestamp,
               &e->info.cpuTemp,
               &e->info.loadAvg1,
               &e->info.memPercent,
               &e->info.diskPercent,
               &e->info.memUsed,
               &e->info.diskUsed);
        count++;
    }
    fclose(fp);
    return count;
}

void printLogHistory(LogEntry *entries, int count) {
    if (count == 0) {
        printf("  暂无历史记录。\n");
        return;
    }
    printf("\n  ┌────┬─────────────────────┬───────┬───────┬───────┬───────┐\n");
    printf("  │ #  │ 时间                │ CPU°C │ 内存%% │ 磁盘%% │ 负载  │\n");
    printf("  ├────┼─────────────────────┼───────┼───────┼───────┼───────┤\n");
    for (int i = count - 1; i >= 0 && i >= count - 10; i--) {
        LogEntry *e = &entries[i];
        printf("  │ %2d │ %s │ %5.1f │ %5.1f │ %5.1f │ %5.2f │\n",
               count - i,
               e->info.timestamp,
               e->info.cpuTemp,
               e->info.memPercent,
               e->info.diskPercent,
               e->info.loadAvg1);
    }
    printf("  └────┴─────────────────────┴───────┴───────┴───────┴───────┘\n");
    printf("  (显示最近 10 条记录，共 %d 条)\n", count);
}
