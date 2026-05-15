#include <stdio.h>

int main()
{
    int m, n;
    printf("Input m, n:");
    if (scanf("%d,%d", &m, &n) != 2)
        return 0;

    printf("Input %d*%d array:\n", m, n);
    int a[10][10];
    int max, row = 0, col = 0;

    for (int i = 0; i < m; i++)
    {
        for (int j = 0; j < n; j++)
        {
            scanf("%d", &a[i][j]);
            // 初始化 max 为第一个元素
            if (i == 0 && j == 0)
            {
                max = a[i][j];
                row = i;
                col = j;
            }
            else if (a[i][j] > max)
            {
                max = a[i][j];
                row = i;
                col = j;
            }
        }
    }

    // 注意：输出格式要求 "max=%d, row=%d, col=%d"
    // 题目样例输出 row=2, col=4 对应 100 在 5*5 矩阵的第2行第4列（下标从1开始计？）
    // 检查样例：100 在 (1,3) 下标位置。如果输出 2, 4，说明行列号是从 1 开始计的。
    printf("max=%d, row=%d, col=%d\n", max, row + 1, col + 1);

    return 0;
}
