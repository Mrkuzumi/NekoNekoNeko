/*
 * 题号:3.1  姓名:王培锴  学号:202500401033
 * 功能:个人健康小记录 — 步数目标/睡眠评价/饮水记录/久坐提醒/心情自评
 * 输入:菜单驱动数字选项，数据保存至 health_data.txt
 * 输出:各项健康数据统计与评价
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

/* ---------- 数据结构 ---------- */
typedef struct {
    int step_goal;        /* 每日步数目标 */
    int step_actual;      /* 今日实际步数 */
    int sleep_h, sleep_m; /* 入睡时间 (24h制) */
    int wake_h, wake_m;   /* 起床时间 */
    int sleep_recorded;   /* 是否已记录睡眠 */
    int water_ml;         /* 今日饮水 ml */
    int mood;             /* 今日心情 1-5，0=未评 */
    int sit_interval;     /* 久坐提醒间隔(分钟) */
} Health;

Health h;

/* ---------- 文件读写 ---------- */
void save_data(void) {
    FILE *f = fopen("health_data.txt", "w");
    if (!f) return;
    fprintf(f, "%d %d %d %d %d %d %d %d %d %d\n",
            h.step_goal, h.step_actual,
            h.sleep_h, h.sleep_m, h.wake_h, h.wake_m, h.sleep_recorded,
            h.water_ml, h.mood, h.sit_interval);
    fclose(f);
}

void load_data(void) {
    FILE *f = fopen("health_data.txt", "r");
    if (!f) {
        h.step_goal = 8000; h.step_actual = 0;
        h.sleep_h = 23; h.sleep_m = 0;
        h.wake_h = 7; h.wake_m = 0;
        h.sleep_recorded = 0; h.water_ml = 0;
        h.mood = 0; h.sit_interval = 60;
        return;
    }
    fscanf(f, "%d %d %d %d %d %d %d %d %d %d",
           &h.step_goal, &h.step_actual,
           &h.sleep_h, &h.sleep_m, &h.wake_h, &h.wake_m, &h.sleep_recorded,
           &h.water_ml, &h.mood, &h.sit_interval);
    fclose(f);
}

/* ---------- 功能函数 ---------- */
void step_mgr(void) {
    int op;
    printf("\n-- 步数管理 --\n1.查看  2.设定目标  3.录入步数\n> ");
    scanf("%d", &op);
    if (op == 1) {
        printf("今日步数: %d / %d (%.0f%%)\n",
               h.step_actual, h.step_goal,
               100.0 * h.step_actual / h.step_goal);
        if (h.step_actual >= h.step_goal) printf("已达标!\n");
        else printf("还差 %d 步\n", h.step_goal - h.step_actual);
    } else if (op == 2) {
        printf("新目标: "); scanf("%d", &h.step_goal);
        printf("已更新。\n");
    } else if (op == 3) {
        int add;
        printf("本次步数: "); scanf("%d", &add);
        if (add < 0) { printf("无效。\n"); return; }
        h.step_actual += add;
        printf("已记录，今日累计 %d 步。\n", h.step_actual);
    }
}

void sleep_mgr(void) {
    printf("\n-- 睡眠记录 --\n");
    printf("入睡时间(时 分): ");
    scanf("%d %d", &h.sleep_h, &h.sleep_m);
    printf("起床时间(时 分): ");
    scanf("%d %d", &h.wake_h, &h.wake_m);
    h.sleep_recorded = 1;

    /* 计算睡眠时长(分钟) */
    int bed_min = h.sleep_h * 60 + h.sleep_m;
    int wake_min = h.wake_h * 60 + h.wake_m;
    if (wake_min <= bed_min) wake_min += 1440; /* 跨天 */
    int dur = wake_min - bed_min; /* 分钟 */
    int dur_h = dur / 60, dur_m = dur % 60;

    printf("睡眠时长: %d 小时 %d 分钟 — ", dur_h, dur_m);
    if (dur < 360)       printf("不足，请注意休息。\n");
    else if (dur <= 540) printf("正常，继续保持。\n");
    else                 printf("过量，可能影响精力。\n");
}

void water_mgr(void) {
    int op;
    printf("\n-- 饮水记录 --\n1.查看  2.记录饮水\n> ");
    scanf("%d", &op);
    if (op == 1) {
        printf("今日饮水: %d ml / 建议 2000 ml (%.0f%%)\n",
               h.water_ml, 100.0 * h.water_ml / 2000);
    } else if (op == 2) {
        int add;
        printf("本次饮水量(ml): "); scanf("%d", &add);
        if (add < 0) { printf("无效。\n"); return; }
        h.water_ml += add;
        printf("已记录，今日累计 %d ml。\n", h.water_ml);
    }
}

void sit_remind(void) {
    int op;
    printf("\n-- 久坐提醒 --\n1.查看设置  2.修改间隔  3.开始计时\n> ");
    scanf("%d", &op);
    if (op == 1) {
        printf("提醒间隔: %d 分钟\n", h.sit_interval);
    } else if (op == 2) {
        printf("新间隔(分钟): "); scanf("%d", &h.sit_interval);
        printf("已更新。\n");
    } else if (op == 3) {
        printf("计时开始(%d分钟)，久坐 %d 分钟后将提醒。\n按回车模拟时间流逝...\n",
               h.sit_interval, h.sit_interval);
        getchar(); getchar();
        time_t start = time(NULL);
        printf("计时中... (按回车触发提醒)\n"); getchar();
        int elapsed = (int)(time(NULL) - start);
        if (elapsed >= h.sit_interval * 60)
            printf("⚠ 已久坐 %d 秒，请起身活动!\n", elapsed);
        else
            printf("用时 %d 秒，未到提醒时间。\n", elapsed);
    }
}

void mood_diary(void) {
    int op;
    printf("\n-- 心情日记 --\n1.查看今日  2.记录心情(1-5)\n> ");
    scanf("%d", &op);
    if (op == 1) {
        if (h.mood == 0) printf("今日尚未记录心情。\n");
        else {
            const char *desc[] = {"", "很差", "较差", "一般", "较好", "很好"};
            printf("今日心情: %d 分 (%s)\n", h.mood, desc[h.mood]);
        }
    } else if (op == 2) {
        int m;
        printf("心情评分(1=很差 ~ 5=很好): ");
        scanf("%d", &m);
        if (m < 1 || m > 5) { printf("无效。\n"); return; }
        h.mood = m;
        printf("已记录。\n");
    }
}

void daily_summary(void) {
    printf("\n-- 今日概览 --\n");
    printf("步数: %d / %d (%.0f%%)\n",
           h.step_actual, h.step_goal,
           h.step_actual > 0 ? 100.0 * h.step_actual / h.step_goal : 0.0);
    if (h.sleep_recorded) {
        int bed = h.sleep_h * 60 + h.sleep_m;
        int wake = h.wake_h * 60 + h.wake_m;
        if (wake <= bed) wake += 1440;
        printf("睡眠: %d小时%d分钟\n", (wake - bed) / 60, (wake - bed) % 60);
    } else printf("睡眠: 未记录\n");
    printf("饮水: %d ml (%d%%)\n", h.water_ml, h.water_ml * 100 / 2000);
    printf("心情: %s\n", h.mood ? (const char *[])
          {"", "😞", "😕", "😐", "🙂", "😊"}[h.mood] : "未记录");
}

void show_menu(void) {
    printf("\n-- 个人健康小记录 --\n");
    printf("1.步数管理  2.睡眠记录  3.饮水记录\n");
    printf("4.久坐提醒  5.心情日记  6.今日概览\n");
    printf("0.退出(自动保存)\n> ");
}

/* ---------- 主程序 ---------- */
int main(void) {
    system("chcp 65001 > nul");
    load_data();
    int op;
    do {
        show_menu();
        scanf("%d", &op);
        switch (op) {
            case 1: step_mgr(); break;
            case 2: sleep_mgr(); break;
            case 3: water_mgr(); break;
            case 4: sit_remind(); break;
            case 5: mood_diary(); break;
            case 6: daily_summary(); break;
            case 0: save_data(); printf("已保存，再见。\n"); break;
            default: printf("无效选项。\n");
        }
    } while (op != 0);
    return 0;
}
