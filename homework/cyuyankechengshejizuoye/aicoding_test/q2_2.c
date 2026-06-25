/*
 * 题号: 2.2
 * 姓名: 王培锴  学号: 202500401033
 * 功能: 欧姆定律实验记录 — 筛选有效记录，统计达标/不达标，求最小误差
 * 输入: 第一行 n R limit，接下来 n 行每行 U I flag
 * 输出: 三行 — 有效/达标/不达标数；电压电流总和；最小误差记录编号及误差
 */

#include <stdio.h>
#include <stdlib.h>

int main(void) {
    int n, R, limit;
    scanf("%d %d %d", &n, &R, &limit);

    int valid = 0, pass = 0, fail = 0;
    long long sumU = 0, sumI = 0;
    int min_error = -1, min_index = -1;

    for (int i = 1; i <= n; i++) {
        int U, I, flag;
        scanf("%d %d %d", &U, &I, &flag);

        if (U <= 0 || I <= 0 || flag != 0)
            continue;  /* 无效记录 */

        valid++;
        sumU += U;
        sumI += I;

        int error = abs(U - R * I);

        if (error <= limit)
            pass++;
        else
            fail++;

        if (min_index == -1 || error < min_error) {
            min_error = error;
            min_index = i;
        }
    }

    printf("%d %d %d\n", valid, pass, fail);
    printf("%I64d %I64d\n", sumU, sumI);
    if (valid == 0)
        printf("-1 0\n");
    else
        printf("%d %d\n", min_index, min_error);

    return 0;
}
