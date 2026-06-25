/*
 * 题号:1.2  姓名:王培锴  学号:202500401033
 * 功能:小卡收集管理 — 录入卡片/缺卡重复/交换记录(邮费差价欠款)/花费汇总
 * 输入:菜单驱动。录入卡片:卡号 来源(1-4) 花费。交换:卡号 方向(0换出1换入) 邮费 差价 对方名
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_CARDS 200
#define MAX_EXCH 100
#define MAX_NAME 20

typedef struct {
    int id;
    int count;
    int source;    /* 1=自抽 2=交换 3=买谷 4=代拿 */
    int cost;      /* 单张花费 */
} Card;

typedef struct {
    int card_id;
    int dir;       /* 0=换出 1=换入 */
    int postage;
    int diff;      /* 差价（正=对方欠我） */
    char person[MAX_NAME];
} Exchange;

Card cards[MAX_CARDS];
int card_cnt = 0;
Exchange exchs[MAX_EXCH];
int exch_cnt = 0;
int total_set = 0;  /* 目标套组卡片总数 */

int find_card(int id) {
    for (int i = 0; i < card_cnt; i++)
        if (cards[i].id == id) return i;
    return -1;
}

void add_card(void) {
    int id, src, cst;
    printf("输入: 卡号 来源(1=自抽 2=交换 3=买谷 4=代拿) 花费\n> ");
    scanf("%d %d %d", &id, &src, &cst);
    int idx = find_card(id);
    if (idx >= 0) { cards[idx].count++; cards[idx].cost += cst; }
    else {
        cards[card_cnt].id = id; cards[card_cnt].count = 1;
        cards[card_cnt].source = src; cards[card_cnt].cost = cst;
        card_cnt++;
    }
    printf("已录入。\n");
}

void show_missing_dup(void) {
    printf("\n--- 重复卡 (count>=2) ---\n");
    int has_dup = 0;
    for (int i = 0; i < card_cnt; i++) {
        if (cards[i].count >= 2) {
            printf("  卡号%3d × %d\n", cards[i].id, cards[i].count);
            has_dup = 1;
        }
    }
    if (!has_dup) printf("  (无)\n");

    if (total_set > 0) {
        printf("\n--- 缺卡 ---\n");
        int miss = 0;
        for (int id = 1; id <= total_set; id++)
            if (find_card(id) < 0) { printf("  卡号%3d\n", id); miss = 1; }
        if (!miss) printf("  已集齐!\n");
    } else printf("\n(未设定目标套组，无法判断缺卡)\n");
}

void add_exchange(void) {
    int id, dir, post, diff; char name[MAX_NAME];
    printf("输入: 卡号 方向(0=换出 1=换入) 邮费 差价 对方名\n> ");
    scanf("%d %d %d %d %s", &id, &dir, &post, &diff, name);
    exchs[exch_cnt].card_id = id; exchs[exch_cnt].dir = dir;
    exchs[exch_cnt].postage = post; exchs[exch_cnt].diff = diff;
    strcpy(exchs[exch_cnt].person, name); exch_cnt++;
    printf("已记录。\n");
}

void show_summary(void) {
    int tc = 0, tp = 0, nd = 0;
    for (int i = 0; i < card_cnt; i++) tc += cards[i].cost;
    for (int i = 0; i < exch_cnt; i++) {
        tp += exchs[i].postage;
        nd += exchs[i].dir ? exchs[i].diff : -exchs[i].diff;
    }
    printf("\n-- 花费汇总 --\n");
    printf("购卡总花费:%d  邮费合计:%d\n", tc, tp);
    printf("净债权(正=别人欠我):%d\n", nd);
    printf("综合支出:%d\n", tc + tp - nd);
}

void show_exchanges(void) {
    printf("\n-- 交换记录 --\n");
    for (int i = 0; i < exch_cnt; i++) {
        int d = exchs[i].diff, abs_d = d > 0 ? d : -d;
        const char *debt = d > 0 ? (exchs[i].dir ? "我欠对方" : "对方欠我")
                                 : (exchs[i].dir ? "对方欠我" : "我欠对方");
        printf("%s 卡号%3d  %s  邮费%3d  差价%4d(%s)\n",
               exchs[i].dir ? "换入" : "换出", exchs[i].card_id,
               exchs[i].dir ? "<-" : "->", exchs[i].postage, abs_d, debt);
    }
    if (exch_cnt == 0) printf("  (无记录)\n");
}

void show_all(void) {
    printf("\n-- 已有卡片 --\n");
    const char *sn[] = {"", "自抽", "交换", "买谷", "代拿"};
    for (int i = 0; i < card_cnt; i++)
        printf("  卡号%3d × %d  来源:%s  花费:%d\n",
               cards[i].id, cards[i].count, sn[cards[i].source], cards[i].cost);
    if (card_cnt == 0) printf("  (无)\n");
    show_missing_dup(); show_exchanges();
}

void set_target(void) {
    printf("输入目标套组卡片总数: ");
    scanf("%d", &total_set);
    printf("已设定目标套组 1~%d。\n", total_set);
}

int main(void) {
    system("chcp 65001 > nul");
    printf("-- 小卡收集管理工具 --\n");
    int op;
    do {
        printf("\n1.录入卡片  2.缺卡/重复  3.记录交换  4.交换记录\n"
               "5.花费汇总  6.全部查看  7.设定目标  0.退出\n> ");
        scanf("%d", &op);
        switch (op) {
            case 1: add_card(); break;
            case 2: show_missing_dup(); break;
            case 3: add_exchange(); break;
            case 4: show_exchanges(); break;
            case 5: show_summary(); break;
            case 6: show_all(); break;
            case 7: set_target(); break;
            case 0: printf("再见。\n"); break;
            default: printf("无效选项。\n");
        }
    } while (op != 0);
    return 0;
}
