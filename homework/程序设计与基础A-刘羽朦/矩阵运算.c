#include <stdio.h>

int main()
{
    int n;
    scanf("%d", &n);
    int a[10][10]; // 假设 n 不超过 10
    int sum = 0;

    for (int i = 0; i < n; i++)
    {
        for (int j = 0; j < n; j++)
        {
            scanf("%d", &a[i][j]);
        }
    }

    for (int i = 0; i < n; i++)
    {
        for (int j = 0; j < n; j++)
        {
            // 排除最后一行、最后一列和副对角线
            if (i != n - 1 && j != n - 1 && i + j != n - 1)
            {
                sum += a[i][j];
            }
        }
    }

    printf("%d\n", sum);
    return 0;
}
