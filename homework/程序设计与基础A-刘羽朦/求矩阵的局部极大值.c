#include <stdio.h>

int main()
{
    int M, N;
    if (scanf("%d %d", &M, &N) != 2)
        return 0;

    int a[20][20];
    for (int i = 0; i < M; i++)
    {
        for (int j = 0; j < N; j++)
        {
            scanf("%d", &a[i][j]);
        }
    }

    int found = 0; // 记录是否找到了极大值

    // 遍历非边界元素：从第 1 行到第 M-2 行，第 1 列到第 N-2 列
    for (int i = 1; i < M - 1; i++)
    {
        for (int j = 1; j < N - 1; j++)
        {
            // 判断是否大于上下左右
            if (a[i][j] > a[i - 1][j] &&
                a[i][j] > a[i + 1][j] &&
                a[i][j] > a[i][j - 1] &&
                a[i][j] > a[i][j + 1])
            {

                printf("%d %d %d\n", a[i][j], i + 1, j + 1);
                found = 1;
            }
        }
    }

    if (!found)
    {
        printf("None %d %d\n", M, N);
    }

    return 0;
}
