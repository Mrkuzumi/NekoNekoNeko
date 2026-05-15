#include <stdio.h>

int main()
{
    int m, n;
    scanf("%d %d", &m, &n);

    for (int i = 0; i < m; i++)
    {
        int sum = 0; // 每行开始前重置为0
        for (int j = 0; j < n; j++)
        {
            int num;
            scanf("%d", &num); // 读入当前行的第j个元素
            sum += num;        // 累加
        }
        printf("%d\n", sum); // 输出该行之和
    }

    return 0;
}
