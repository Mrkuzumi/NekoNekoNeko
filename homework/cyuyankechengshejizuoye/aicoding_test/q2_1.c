/*
 * 题号: 2.1
 * 姓名: 王培锴  学号: 202500401033
 * 功能: 小球弹跳实验模拟 — 计算落地次数与总路程
 * 输入: 一行三个正整数 h p q (p < q)
 * 输出: 两个整数 — 落地次数 总路程(厘米)
 */

#include <stdio.h>

int main(void) {
    int h, p, q;
    scanf("%d %d %d", &h, &p, &q);

    int landings = 0;
    int total = 0;
    int cur = h;

    while (1) {
        landings++;
        total += cur;                    /* 下落 */
        int rebound = (cur * p) / q;     /* 整数除法，自动向下取整 */
        if (rebound == 0) break;
        total += rebound;                /* 反弹上升 */
        cur = rebound;                   /* 下一次下落起点 */
    }

    printf("%d %d", landings, total);
    return 0;
}
