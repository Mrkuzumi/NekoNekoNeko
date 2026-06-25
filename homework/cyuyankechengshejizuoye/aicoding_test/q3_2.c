/*
 * 题号:3.2  姓名:王培锴  学号:202500401033
 * 功能:自走棋阵容经营模拟器 — 回合制策略经营
 *       购买棋子/出售/升级人口/上阵/刷新商店/自动战斗/羁绊加成
 * 输入:命令驱动(见 show_help)，每回合管理阵容后输入 f 进入战斗
 * 输出:阵容状态、商店、金币、等级、羁绊、战斗过程、胜负记录
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <windows.h>

/* ANSI 颜色宏 */
#define CLR_RESET   "\033[0m"
#define CLR_CYAN    "\033[1;36m"
#define CLR_YELLOW  "\033[1;33m"
#define CLR_GREEN   "\033[1;32m"
#define CLR_RED     "\033[1;31m"
#define CLR_MAGENTA "\033[1;35m"
#define CLR_BLUE    "\033[1;34m"
#define CLR_WHITE   "\033[1;37m"
#define CLR_GRAY    "\033[90m"

#ifndef ENABLE_VIRTUAL_TERMINAL_PROCESSING
#define ENABLE_VIRTUAL_TERMINAL_PROCESSING 0x0004
#endif

void enable_vt(void) {
    HANDLE h = GetStdHandle(STD_OUTPUT_HANDLE);
    DWORD mode = 0;
    GetConsoleMode(h, &mode);
    SetConsoleMode(h, mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
}

/* 常量定义 */
#define MAX_SHOP    5
#define MAX_BENCH   8
#define MAX_BOARD   8
#define MAX_CHESS_T 8
#define NAME_LEN    16

/* 阵营枚举 */
#define FAC_HUMAN   0
#define FAC_ELF     1
#define FAC_SHADOW  2
#define FAC_DRAGON  3
#define FAC_COUNT   4

/* 职业枚举 */
#define CLS_WARRIOR  0
#define CLS_ARCHER   1
#define CLS_MAGE     2
#define CLS_TANK     3
#define CLS_ASSASSIN 4
#define CLS_COUNT    5

/* 棋子模板 */
typedef struct {
    char name[NAME_LEN];
    int cost;        /* 购买费用 */
    int faction;     /* 阵营 */
    int cls;         /* 职业 */
    int atk;         /* 基础攻击 */
    int hp;          /* 基础生命 */
} ChessTemplate;

/* 棋子实例 */
typedef struct {
    int tid;         /* 模板 ID, -1 表示空 */
    int star;        /* 星级 1/2/3 */
    int atk, hp;     /* 当前属性(含羁绊加成) */
    int item;        /* 装备 ATK 加成 */
} ChessInst;

/* 玩家状态 */
typedef struct {
    int gold;        /* 金币 */
    int level;       /* 人口上限 = level */
    int hp;          /* 生命值 */
    int wins;        /* 累计胜场 */
    int losses;      /* 累计败场 */
    int win_streak;  /* 当前连胜 */
    int lose_streak; /* 当前连败 */
    int round;       /* 当前回合 */
    ChessInst bench[MAX_BENCH];  /* 备战区 */
    ChessInst board[MAX_BOARD];  /* 战斗区 */
    ChessInst shop[MAX_SHOP];    /* 商店 */
} Player;

/* 全局数据 */
ChessTemplate pool[MAX_CHESS_T];
int pool_cnt = 0;
Player p;
const char *fac_name[FAC_COUNT] = {"人族", "精灵", "暗影", "龙族"};
const char *cls_name[CLS_COUNT] = {"战士", "射手", "法师", "坦克", "刺客"};

/* 棋子池初始化 */
void init_pool(void) {
    /* 名称, 费用, 阵营, 职业, ATK, HP */
    ChessTemplate tmp[] = {
        {"剑士",   1, FAC_HUMAN,  CLS_WARRIOR,  50, 500},
        {"弓手",   2, FAC_ELF,    CLS_ARCHER,   70, 350},
        {"法师",   3, FAC_ELF,    CLS_MAGE,     90, 300},
        {"骑士",   3, FAC_HUMAN,  CLS_TANK,     40, 800},
        {"刺客",   3, FAC_SHADOW, CLS_ASSASSIN, 100,250},
        {"圣骑士", 4, FAC_HUMAN,  CLS_TANK,     55, 950},
        {"龙骑士", 5, FAC_DRAGON, CLS_TANK,     65,1100},
        {"影刃",   4, FAC_SHADOW, CLS_ASSASSIN, 120,280},
    };
    pool_cnt = 8;
    memcpy(pool, tmp, sizeof(tmp));
}

/* 棋子实例操作 */
ChessInst make_chess(int tid) {
    ChessInst c;
    c.tid = tid; c.star = 1; c.item = 0;
    c.atk = pool[tid].atk; c.hp = pool[tid].hp;
    return c;
}

int is_empty(ChessInst *c) { return c->tid < 0; }

/* 寻找备战区第一个空位 */
int bench_slot(void) {
    for (int i = 0; i < MAX_BENCH; i++)
        if (p.bench[i].tid < 0) return i;
    return -1;
}

/* 统计上阵棋子数 */
int board_count(void) {
    int n = 0;
    for (int i = 0; i < MAX_BOARD; i++)
        if (p.board[i].tid >= 0) n++;
    return n;
}

/* 在备战区找相同棋子(用于合成) */
int bench_find_same(int tid, int star) {
    for (int i = 0; i < MAX_BENCH; i++)
        if (p.bench[i].tid == tid && p.bench[i].star == star) return i;
    return -1;
}

/* 尝试合成: 在备战区检查是否有3个同tid同star的棋子 */
void try_merge(int tid, int star) {
    int cnt = 0, idx[3];
    for (int i = 0; i < MAX_BENCH && cnt < 3; i++)
        if (p.bench[i].tid == tid && p.bench[i].star == star)
            idx[cnt++] = i;
    if (cnt < 3) return;
    /* 合成: 删除2个, 第1个升星 */
    int base = idx[0];
    p.bench[base].star = star + 1;
    p.bench[base].atk = pool[tid].atk * (star + 1);
    p.bench[base].hp = pool[tid].hp * (star + 1);
    p.bench[idx[1]].tid = -1;
    p.bench[idx[2]].tid = -1;
    printf(CLR_YELLOW ">>> %s 升为 %d 星!" CLR_RESET "\n", pool[tid].name, star + 1);
}

/* 羁绊计算 */
typedef struct {
    int fac_cnt[FAC_COUNT];   /* 各阵营上阵数 */
    int cls_cnt[CLS_COUNT];   /* 各职业上阵数 */
} Synergy;

void calc_synergy(Synergy *s) {
    memset(s, 0, sizeof(Synergy));
    for (int i = 0; i < MAX_BOARD; i++) {
        if (p.board[i].tid < 0) continue;
        int t = p.board[i].tid;
        s->fac_cnt[pool[t].faction]++;
        s->cls_cnt[pool[t].cls]++;
    }
}

/* 对board上棋子应用羁绊加成(重置后重新计算) */
void apply_synergy(void) {
    /* 先恢复基础属性 */
    for (int i = 0; i < MAX_BOARD; i++) {
        if (p.board[i].tid < 0) continue;
        int t = p.board[i].tid;
        int mult = p.board[i].star;
        p.board[i].atk = pool[t].atk * mult + p.board[i].item;
        p.board[i].hp = pool[t].hp * mult;
    }
    Synergy s; calc_synergy(&s);

    /* 人族(2+): 所有人族 +100 HP */
    if (s.fac_cnt[FAC_HUMAN] >= 2)
        for (int i = 0; i < MAX_BOARD; i++)
            if (p.board[i].tid >= 0 && pool[p.board[i].tid].faction == FAC_HUMAN)
                p.board[i].hp += 100;

    /* 精灵(2+): 所有精灵 +20% ATK */
    if (s.fac_cnt[FAC_ELF] >= 2)
        for (int i = 0; i < MAX_BOARD; i++)
            if (p.board[i].tid >= 0 && pool[p.board[i].tid].faction == FAC_ELF)
                p.board[i].atk = p.board[i].atk * 6 / 5;

    /* 暗影(2+): 所有暗影 +30 ATK */
    if (s.fac_cnt[FAC_SHADOW] >= 2)
        for (int i = 0; i < MAX_BOARD; i++)
            if (p.board[i].tid >= 0 && pool[p.board[i].tid].faction == FAC_SHADOW)
                p.board[i].atk += 30;

    /* 龙族(1+): 龙族 +200 HP */
    if (s.fac_cnt[FAC_DRAGON] >= 1)
        for (int i = 0; i < MAX_BOARD; i++)
            if (p.board[i].tid >= 0 && pool[p.board[i].tid].faction == FAC_DRAGON)
                p.board[i].hp += 200;

    /* 战士(2+): 所有战士 +30 ATK */
    if (s.cls_cnt[CLS_WARRIOR] >= 2)
        for (int i = 0; i < MAX_BOARD; i++)
            if (p.board[i].tid >= 0 && pool[p.board[i].tid].cls == CLS_WARRIOR)
                p.board[i].atk += 30;

    /* 射手(2+): 所有射手 +25 ATK */
    if (s.cls_cnt[CLS_ARCHER] >= 2)
        for (int i = 0; i < MAX_BOARD; i++)
            if (p.board[i].tid >= 0 && pool[p.board[i].tid].cls == CLS_ARCHER)
                p.board[i].atk += 25;

    /* 法师(2+): 所有法师 +40 ATK */
    if (s.cls_cnt[CLS_MAGE] >= 2)
        for (int i = 0; i < MAX_BOARD; i++)
            if (p.board[i].tid >= 0 && pool[p.board[i].tid].cls == CLS_MAGE)
                p.board[i].atk += 40;

    /* 坦克(2+): 所有坦克 +300 HP */
    if (s.cls_cnt[CLS_TANK] >= 2)
        for (int i = 0; i < MAX_BOARD; i++)
            if (p.board[i].tid >= 0 && pool[p.board[i].tid].cls == CLS_TANK)
                p.board[i].hp += 300;

    /* 刺客(2+): 刺客暴击率 +30% → 简化为 ATK+35 */
    if (s.cls_cnt[CLS_ASSASSIN] >= 2)
        for (int i = 0; i < MAX_BOARD; i++)
            if (p.board[i].tid >= 0 && pool[p.board[i].tid].cls == CLS_ASSASSIN)
                p.board[i].atk += 35;
}

/* 商店系统 */
void refresh_shop(void) {
    for (int i = 0; i < MAX_SHOP; i++) {
        /* 按等级概率随机: 低级棋子概率更高 */
        int r = rand() % 100;
        int tid;
        if (p.level <= 3) {
            if (r < 60) tid = rand() % 3;       /* 1-2 费 60% */
            else if (r < 90) tid = 3 + rand() % 2; /* 3 费 30% */
            else tid = 5 + rand() % 2;           /* 4-5 费 10% */
        } else if (p.level <= 6) {
            if (r < 35) tid = rand() % 3;
            else if (r < 70) tid = 3 + rand() % 2;
            else if (r < 95) tid = 5 + rand() % 2;
            else tid = 7;                        /* 5 费 */
        } else {
            if (r < 20) tid = rand() % 3;
            else if (r < 50) tid = 3 + rand() % 2;
            else if (r < 80) tid = 5 + rand() % 2;
            else tid = 7;
        }
        if (tid >= pool_cnt) tid = pool_cnt - 1;
        p.shop[i] = make_chess(tid);
    }
}

int buy_chess(int slot) {
    if (slot < 0 || slot >= MAX_SHOP || p.shop[slot].tid < 0) {
        printf("无效的商店栏位。\n"); return 0;
    }
    int cost = pool[p.shop[slot].tid].cost;
    if (p.gold < cost) { printf("金币不足! 需要 %d。\n", cost); return 0; }
    int bs = bench_slot();
    if (bs < 0) { printf("备战区已满!\n"); return 0; }
    p.gold -= cost;
    p.bench[bs] = p.shop[slot];
    p.shop[slot].tid = -1;
    printf("购买了 %s。\n", pool[p.bench[bs].tid].name);
    try_merge(p.bench[bs].tid, p.bench[bs].star);
    return 1;
}

void sell_chess(char where, int idx) {
    ChessInst *arr = (where == 'b') ? p.bench : p.board;
    int max_i = (where == 'b') ? MAX_BENCH : MAX_BOARD;
    if (idx < 0 || idx >= max_i || arr[idx].tid < 0) {
        printf("无效选择。\n"); return;
    }
    int t = arr[idx].tid;
    int refund = pool[t].cost * arr[idx].star / 2;
    if (refund < 1) refund = 1;
    p.gold += refund;
    printf("出售 %s(%d星) 获得 %d 金币。\n", pool[t].name, arr[idx].star, refund);
    arr[idx].tid = -1; arr[idx].star = 0;
}

/* 上阵/下阵 */
void deploy(int bench_idx, int board_idx) {
    if (bench_idx < 0 || bench_idx >= MAX_BENCH || p.bench[bench_idx].tid < 0) {
        printf("备战区无此棋子。\n"); return;
    }
    if (board_idx < 0 || board_idx >= MAX_BOARD) {
        printf("无效的棋盘位置。\n"); return;
    }
    if (board_count() >= p.level) {
        printf("人口已满(%d)!\n", p.level); return;
    }
    if (p.board[board_idx].tid >= 0) {
        printf("该位置已有棋子，请先下阵。\n"); return;
    }
    p.board[board_idx] = p.bench[bench_idx];
    p.bench[bench_idx].tid = -1;
    printf("上阵 %s 到位置 %d。\n", pool[p.board[board_idx].tid].name, board_idx + 1);
    apply_synergy();
}

void retrieve(int board_idx) {
    if (board_idx < 0 || board_idx >= MAX_BOARD || p.board[board_idx].tid < 0) {
        printf("该位置无棋子。\n"); return;
    }
    int bs = bench_slot();
    if (bs < 0) { printf("备战区已满!\n"); return; }
    p.bench[bs] = p.board[board_idx];
    p.board[board_idx].tid = -1;
    printf("%s 已下阵到备战区。\n", pool[p.bench[bs].tid].name);
    apply_synergy();
}

/* 升级人口 */
void level_up(void) {
    if (p.level >= 8) { printf("已达最高等级。\n"); return; }
    int cost = (p.level - 1) * 4 + 4; /* Lv2→4, Lv3→8, Lv4→12 ... */
    if (p.gold < cost) { printf("金币不足! 需要 %d。\n", cost); return; }
    p.gold -= cost; p.level++;
    printf("升级! 人口上限 → %d。\n", p.level);
}

/* 战斗系统 */
/* 生成 AI 对手队伍 */
void gen_ai_team(ChessInst ai_board[MAX_BOARD], int *ai_count) {
    int budget = p.round * 3 + 5 + rand() % 5;
    *ai_count = 0;
    memset(ai_board, -1, MAX_BOARD * sizeof(ChessInst));
    int ai_lv = p.round / 4 + 1; if (ai_lv > 7) ai_lv = 7;
    while (budget > 0 && *ai_count < ai_lv) {
        int tid = rand() % pool_cnt;
        int cost = pool[tid].cost;
        if (cost > budget) continue;
        ai_board[*ai_count] = make_chess(tid);
        /* 后期 AI 有概率带 2 星棋子 */
        if (p.round > 5 && rand() % 3 == 0 && budget >= cost) {
            ai_board[*ai_count].star = 2;
            ai_board[*ai_count].atk = pool[tid].atk * 2;
            ai_board[*ai_count].hp = pool[tid].hp * 2;
        }
        budget -= cost;
        (*ai_count)++;
    }
}

/* 显示战斗过程 */
void show_battle_line(ChessInst *atk, ChessInst *def, int a_idx, int d_idx,
                       int dmg, int killed, int is_my_atk) {
    const char *atk_side = is_my_atk ? CLR_GREEN "我方" CLR_RESET : CLR_RED "AI" CLR_RESET;
    const char *def_side = is_my_atk ? CLR_RED "AI" CLR_RESET : CLR_GREEN "我方" CLR_RESET;
    printf("  %s[%d] %s(%d★) → " CLR_YELLOW "%d 伤害" CLR_RESET,
           atk_side, a_idx, pool[atk->tid].name, atk->star, dmg);
    if (killed)
        printf("，" CLR_RED "击杀" CLR_RESET " %s[%d]\n", def_side, d_idx);
    else
        printf("，%s[%d] " CLR_GREEN "剩余 %d HP" CLR_RESET "\n", def_side, d_idx, def->hp);
}

/* 战斗主函数: 返回 1=我方胜 0=败 */
int do_battle(void) {
    apply_synergy();
    /* 复制我方阵容 */
    ChessInst my[MAX_BOARD], ai[MAX_BOARD];
    int my_cnt = 0, ai_cnt = 0;
    for (int i = 0; i < MAX_BOARD; i++) {
        if (p.board[i].tid >= 0) my[my_cnt++] = p.board[i];
        my[i].tid = -1; /* 清理后续 */
    }
    gen_ai_team(ai, &ai_cnt);

    printf(CLR_CYAN "\n========== 第 %d 回合 战斗开始 ==========" CLR_RESET "\n", p.round);
    printf("  " CLR_GREEN "我方 %d 棋子" CLR_RESET "  VS  " CLR_RED "AI %d 棋子" CLR_RESET "\n", my_cnt, ai_cnt);
    printf(CLR_GRAY "  --- AI 阵容 ---" CLR_RESET "\n");
    for (int i = 0; i < ai_cnt; i++)
        printf("  %s(%d★) ATK:%d HP:%d\n",
               pool[ai[i].tid].name, ai[i].star, ai[i].atk, ai[i].hp);

    int mi = 0, ai_i = 0; /* 双方当前攻击者索引(交替攻击) */
    int turn = 0;         /* 0=我方回合 1=AI回合 */
    while (my_cnt > 0 && ai_cnt > 0 && turn < 200) { /* 200回合上限防死循环 */
        if (turn % 2 == 0) {
            /* 我方攻击 */
            if (mi >= my_cnt) { mi = 0; continue; }
            int dmg = my[mi].atk;
            /* 刺客 20% 暴击 */
            if (pool[my[mi].tid].cls == CLS_ASSASSIN && rand() % 100 < 20)
                dmg *= 2;
            ai[ai_i].hp -= dmg;
            int killed = (ai[ai_i].hp <= 0);
            show_battle_line(&my[mi], &ai[ai_i], mi, ai_i, dmg, killed, 1);
            if (killed) {
                for (int j = ai_i; j < ai_cnt - 1; j++) ai[j] = ai[j + 1];
                ai_cnt--;
            } else ai_i++;
            mi++; if (ai_i >= ai_cnt) ai_i = 0;
        } else {
            /* AI 攻击 */
            if (ai_i >= ai_cnt) { ai_i = 0; continue; }
            int dmg = ai[ai_i].atk;
            if (pool[ai[ai_i].tid].cls == CLS_ASSASSIN && rand() % 100 < 20)
                dmg *= 2;
            my[mi].hp -= dmg;
            int killed = (my[mi].hp <= 0);
            show_battle_line(&ai[ai_i], &my[mi], ai_i, mi, dmg, killed, 0);
            if (killed) {
                for (int j = mi; j < my_cnt - 1; j++) my[j] = my[j + 1];
                my_cnt--;
            } else mi++;
            ai_i++; if (mi >= my_cnt) mi = 0;
        }
        turn++;
    }
    if (turn >= 200) { printf("战斗超时! 判平局。\n"); return 1; }
    int win = (my_cnt > 0);
    printf(CLR_CYAN "----------------------------------------" CLR_RESET "\n");
    printf("战斗结束: %s%s" CLR_RESET "! (剩余: 我方%d AI%d)\n",
           win ? CLR_GREEN : CLR_RED, win ? "胜利" : "失败", my_cnt, ai_cnt);
    printf(CLR_CYAN "========================================\n" CLR_RESET);
    return win;
}

/* 回合结算 */
void round_end(int win) {
    if (win) {
        p.wins++; p.win_streak++; p.lose_streak = 0;
    } else {
        p.losses++; p.lose_streak++; p.win_streak = 0;
        int dmg = 2 + p.round / 3;
        p.hp -= dmg;
        printf(CLR_RED "你受到了 %d 点伤害。剩余 HP: %d" CLR_RESET "\n", dmg, p.hp);
    }
    /* 收入计算 */
    int income = 5; /* 基础 */
    int interest = p.gold / 10;
    if (interest > 5) interest = 5;
    income += interest;
    if (p.win_streak >= 6) income += 3;
    else if (p.win_streak >= 4) income += 2;
    else if (p.win_streak >= 2) income += 1;
    if (p.lose_streak >= 6) income += 3;
    else if (p.lose_streak >= 4) income += 2;
    else if (p.lose_streak >= 2) income += 1;
    p.gold += income;
    printf(CLR_YELLOW "收入: +%d" CLR_RESET " (基础5 利息%d 连胜/连败%d) → " CLR_YELLOW "金币: %d" CLR_RESET "\n",
           income, interest,
           income - 5 - interest, p.gold);
}

/* 显示函数 */
void show_status(void) {
    printf(CLR_CYAN "\n========== 第 %d 回合 ==========" CLR_RESET "\n", p.round);
    printf("  " CLR_YELLOW "金币:%d" CLR_RESET "  |  等级:%d  |  人口:" CLR_WHITE "%d/%d" CLR_RESET,
           p.gold, p.level, board_count(), p.level);
    printf("  |  HP: %s%d" CLR_RESET,
           p.hp <= 30 ? CLR_RED : p.hp <= 60 ? CLR_YELLOW : CLR_GREEN, p.hp);
    printf("  |  战绩:" CLR_GREEN "%d胜" CLR_RESET "/" CLR_RED "%d负" CLR_RESET, p.wins, p.losses);
    if (p.win_streak >= 2) printf("  " CLR_GREEN "连胜%d" CLR_RESET, p.win_streak);
    if (p.lose_streak >= 2) printf("  " CLR_RED "连败%d" CLR_RESET, p.lose_streak);
    printf("\n");
}

void show_shop(void) {
    printf(CLR_CYAN "\n┌─ 商店 " CLR_YELLOW "(r=刷新 2金)" CLR_CYAN " ───────────────┐" CLR_RESET "\n");
    for (int i = 0; i < MAX_SHOP; i++) {
        if (p.shop[i].tid < 0) {
            printf("  " CLR_GRAY "[%d] (已购买)" CLR_RESET "\n", i + 1);
            continue;
        }
        int t = p.shop[i].tid;
        const char *cost_color = pool[t].cost <= 2 ? CLR_GREEN :
                                  pool[t].cost <= 3 ? CLR_YELLOW :
                                  pool[t].cost <= 4 ? CLR_MAGENTA : CLR_RED;
        printf("  " CLR_BLUE "[%d]" CLR_RESET " " CLR_WHITE "%s" CLR_RESET
               "  %s%d费" CLR_RESET "  %s/%s  ATK:%d HP:%d\n",
               i + 1, pool[t].name, cost_color, pool[t].cost,
               fac_name[pool[t].faction], cls_name[pool[t].cls],
               pool[t].atk, pool[t].hp);
    }
    printf(CLR_CYAN "└──────────────────────────────┘" CLR_RESET "\n");
}

void show_bench(void) {
    printf(CLR_CYAN "\n┌─ 备战区 ──────────────────────┐" CLR_RESET "\n");
    int empty = 1;
    for (int i = 0; i < MAX_BENCH; i++) {
        if (p.bench[i].tid < 0) continue;
        empty = 0;
        int t = p.bench[i].tid;
        const char *star_color = p.bench[i].star >= 3 ? CLR_RED :
                                  p.bench[i].star >= 2 ? CLR_YELLOW : CLR_WHITE;
        printf("  " CLR_BLUE "[%d]" CLR_RESET " %s%s" CLR_RESET "  %s%d★" CLR_RESET
               "  ATK:%d HP:%d  %s/%s\n",
               i + 1, CLR_WHITE, pool[t].name, star_color, p.bench[i].star,
               pool[t].atk * p.bench[i].star,
               pool[t].hp * p.bench[i].star,
               fac_name[pool[t].faction], cls_name[pool[t].cls]);
    }
    if (empty) printf("  " CLR_GRAY "(空)" CLR_RESET "\n");
    printf(CLR_CYAN "└──────────────────────────────┘" CLR_RESET "\n");
}

void show_board_syn(void) {
    printf(CLR_CYAN "\n┌─ 上阵阵容 ────────────────────┐" CLR_RESET "\n");
    int empty = 1;
    for (int i = 0; i < MAX_BOARD; i++) {
        if (p.board[i].tid < 0) continue;
        empty = 0;
        int t = p.board[i].tid;
        const char *star_color = p.board[i].star >= 3 ? CLR_RED :
                                  p.board[i].star >= 2 ? CLR_YELLOW : CLR_WHITE;
        printf("  " CLR_BLUE "[%d]" CLR_RESET " %s%s" CLR_RESET "  %s%d★" CLR_RESET
               "  ATK:" CLR_RED "%d" CLR_RESET " HP:" CLR_GREEN "%d" CLR_RESET
               "  %s/%s\n",
               i + 1, CLR_WHITE, pool[t].name, star_color, p.board[i].star,
               p.board[i].atk, p.board[i].hp,
               fac_name[pool[t].faction], cls_name[pool[t].cls]);
    }
    if (empty) { printf("  " CLR_GRAY "(无上阵棋子)" CLR_RESET "\n"); }
    printf(CLR_CYAN "└──────────────────────────────┘" CLR_RESET "\n");
    if (empty) return;
    /* 显示激活羁绊 */
    Synergy s; calc_synergy(&s);
    printf(CLR_MAGENTA "\n  ◆ 激活羁绊 " CLR_RESET);
    int any = 0;
    int fac_thr[FAC_COUNT] = {2, 2, 2, 1};
    int cls_thr[CLS_COUNT] = {2, 1, 2, 2, 2};
    for (int i = 0; i < FAC_COUNT; i++)
        if (s.fac_cnt[i] >= fac_thr[i]) {
            printf(CLR_GREEN "%s(%d/%d) " CLR_RESET, fac_name[i], s.fac_cnt[i], fac_thr[i]);
            any = 1;
        }
    for (int i = 0; i < CLS_COUNT; i++)
        if (s.cls_cnt[i] >= cls_thr[i]) {
            printf(CLR_GREEN "%s(%d/%d) " CLR_RESET, cls_name[i], s.cls_cnt[i], cls_thr[i]);
            any = 1;
        }
    if (!any) printf(CLR_GRAY "(无)" CLR_RESET);
    printf("\n");
}

void show_help(void) {
    printf(CLR_CYAN "\n┌─ 命令帮助 ────────────────────┐" CLR_RESET "\n");
    printf("  " CLR_YELLOW "b <栏位>" CLR_RESET "   购买商店棋子 (1-%d)\n", MAX_SHOP);
    printf("  " CLR_YELLOW "r" CLR_RESET "          刷新商店 " CLR_GRAY "(花费 2 金)" CLR_RESET "\n");
    printf("  " CLR_YELLOW "sb <编号>" CLR_RESET "  出售备战区棋子\n");
    printf("  " CLR_YELLOW "so <编号>" CLR_RESET "  出售上阵棋子\n");
    printf("  " CLR_YELLOW "d <备> <棋>" CLR_RESET " 上阵 (备战区→棋盘)\n");
    printf("  " CLR_YELLOW "u <编号>" CLR_RESET "   下阵 (棋盘→备战区)\n");
    printf("  " CLR_YELLOW "l" CLR_RESET "          升级人口\n");
    printf("  " CLR_YELLOW "f" CLR_RESET "          开始战斗\n");
    printf("  " CLR_YELLOW "q" CLR_RESET "          退出游戏\n");
    printf("  " CLR_YELLOW "h" CLR_RESET "          显示此帮助\n");
    printf(CLR_CYAN "└──────────────────────────────┘" CLR_RESET "\n");
}

/* 初始化 */
void init_game(void) {
    memset(&p, 0, sizeof(p));
    p.gold = 10; p.level = 3; p.hp = 100; p.round = 1;
    p.win_streak = 0; p.lose_streak = 0;
    for (int i = 0; i < MAX_BENCH; i++) p.bench[i].tid = -1;
    for (int i = 0; i < MAX_BOARD; i++) p.board[i].tid = -1;
    for (int i = 0; i < MAX_SHOP; i++) p.shop[i].tid = -1;
    init_pool();
    refresh_shop();
}

/* 游戏结束判断 */
int is_game_over(void) {
    if (p.hp <= 0) {
        printf(CLR_RED "\n========== 游戏结束 ==========" CLR_RESET "\n");
        printf("你的 HP 归零了。共存活 %d 回合。\n", p.round);
        printf("战绩: " CLR_GREEN "%d 胜" CLR_RESET " " CLR_RED "%d 负" CLR_RESET "\n", p.wins, p.losses);
        return 1;
    }
    return 0;
}

/* 主循环 */
int main(void) {
    system("chcp 65001 > nul");
    enable_vt();
    srand((unsigned)time(NULL));
    init_game();
    printf(CLR_CYAN "╔══════════════════════════════════╗" CLR_RESET "\n");
    printf(CLR_CYAN "║" CLR_RESET "  " CLR_YELLOW "自走棋阵容经营模拟器" CLR_RESET "  " CLR_CYAN "║" CLR_RESET "\n");
    printf(CLR_CYAN "║" CLR_RESET "  组建你的阵容，击败 AI 对手!  " CLR_CYAN "║" CLR_RESET "\n");
    printf(CLR_CYAN "╚══════════════════════════════════╝" CLR_RESET "\n");
    show_help();

    char cmd[32];
    int a1, a2;

    while (1) {
        if (is_game_over()) break;
        show_status();
        show_shop();
        show_bench();
        show_board_syn();

        printf(CLR_CYAN "\n命令" CLR_RESET "(h=帮助) > ");
        if (scanf("%s", cmd) != 1) break;

        if (strcmp(cmd, "q") == 0) {
            printf("再见! 最终战绩: %d胜 %d负 (存活%d回合)\n",
                   p.wins, p.losses, p.round);
            break;
        }
        if (strcmp(cmd, "h") == 0) { show_help(); continue; }
        if (strcmp(cmd, "f") == 0) {
            if (board_count() == 0) {
                printf("请先上阵至少一个棋子!\n"); continue;
            }
            int win = do_battle();
            round_end(win);
            if (is_game_over()) break;
            p.round++;
            refresh_shop();
            continue;
        }
        if (strcmp(cmd, "r") == 0) {
            if (p.gold < 2) { printf("金币不足!\n"); continue; }
            p.gold -= 2;
            refresh_shop();
            printf("商店已刷新。\n");
            continue;
        }
        if (strcmp(cmd, "l") == 0) { level_up(); continue; }
        if (strcmp(cmd, "b") == 0) {
            if (scanf("%d", &a1) != 1) { printf("用法: b <栏位>\n"); continue; }
            buy_chess(a1 - 1);
            continue;
        }
        if (strcmp(cmd, "sb") == 0) {
            if (scanf("%d", &a1) != 1) { printf("用法: sb <编号>\n"); continue; }
            sell_chess('b', a1 - 1);
            continue;
        }
        if (strcmp(cmd, "so") == 0) {
            if (scanf("%d", &a1) != 1) { printf("用法: so <编号>\n"); continue; }
            sell_chess('o', a1 - 1);
            apply_synergy();
            continue;
        }
        if (strcmp(cmd, "d") == 0) {
            if (scanf("%d %d", &a1, &a2) != 2)
            { printf("用法: d <备战编号> <棋盘位置>\n"); continue; }
            deploy(a1 - 1, a2 - 1);
            continue;
        }
        if (strcmp(cmd, "u") == 0) {
            if (scanf("%d", &a1) != 1) { printf("用法: u <棋盘位置>\n"); continue; }
            retrieve(a1 - 1);
            continue;
        }
        printf("未知命令。输入 h 查看帮助。\n");
    }
    return 0;
}
