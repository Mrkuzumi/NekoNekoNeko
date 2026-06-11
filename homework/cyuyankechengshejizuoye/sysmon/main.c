#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include "monitor.h"

void printMenu(void) {
    printf("\n");
    printf("  ╔════════════════════════════════════╗\n");
    printf("  ║           功能菜单                 ║\n");
    printf("  ╠════════════════════════════════════╣\n");
    printf("  ║  1. 查看完整系统状态              ║\n");
    printf("  ║  2. 快速概览 (一行)               ║\n");
    printf("  ║  3. 实时监控 (每2秒刷新)          ║\n");
    printf("  ║  4. 查看监控历史                  ║\n");
    printf("  ║  5. 检测告警                      ║\n");
    printf("  ║  0. 退出                          ║\n");
    printf("  ╚════════════════════════════════════╝\n");
    printf("  请选择: ");
}

int main(void) {
    int choice;
    SysInfo info;
    LogEntry entries[MAX_LOG_ENTRIES];
    LogEntry currentEntry;
    int alertCount;

    printBanner();

    while (1) {
        printMenu();
        if (scanf("%d", &choice) != 1) {
            /* 非法输入处理 */
            while (getchar() != '\n');
            printf("  输入无效，请输入 0-5 之间的数字。\n");
            continue;
        }

        switch (choice) {
            case 1:
                /* 完整系统状态 */
                collectSysInfo(&info);
                printSysInfo(&info);
                waitForEnter();
                break;

            case 2:
                /* 快速概览 */
                collectSysInfo(&info);
                printf("  ── 系统概览 ──\n  ");
                printBrief(&info);
                waitForEnter();
                break;

            case 3:
                /* 实时监控 */
                printf("  实时监控启动 (按 Ctrl+C 返回菜单)\n");
                for (int i = 0; i < 15; i++) {
                    collectSysInfo(&info);
                    printf("  [%s] ", info.timestamp);
                    printBrief(&info);

                    /* 保存到日志 */
                    currentEntry.info = info;
                    currentEntry.hasAlert = 0;
                    saveLog(&currentEntry);

                    sleep(2);
                }
                printf("  实时监控结束 (15 次采样完成)\n");
                break;

            case 4:
                /* 历史记录 */
                int logCount = loadLogs(entries, MAX_LOG_ENTRIES);
                printLogHistory(entries, logCount);
                waitForEnter();
                break;

            case 5:
                /* 告警检测 */
                collectSysInfo(&info);
                printSysInfo(&info);
                char alertMsg[256];
                alertCount = checkAlerts(&info, alertMsg, sizeof(alertMsg));
                if (alertCount > 0) {
                    printf("  ⚠ 发现 %d 项告警:\n", alertCount);
                    printf("%s", alertMsg);
                } else {
                    printf("  ✅ 系统运行正常，无告警。\n");
                }
                /* 保存带告警标记的日志 */
                currentEntry.info = info;
                currentEntry.hasAlert = alertCount > 0 ? 1 : 0;
                snprintf(currentEntry.alertMsg,
                        sizeof(currentEntry.alertMsg), "%s",
                        alertCount > 0 ? alertMsg : "正常");
                saveLog(&currentEntry);
                waitForEnter();
                break;

            case 0:
                printf("\n  感谢使用树莓派系统监控工具！\n");
                printf("  再见！\n\n");
                return 0;

            default:
                printf("  无效选项，请输入 0-5 之间的数字。\n");
                break;
        }
    }

    return 0;
}
