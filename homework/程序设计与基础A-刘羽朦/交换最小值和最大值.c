#include <stdio.h>

int main() {
    int n, a[10];
    scanf("%d", &n);
    for (int i = 0; i < n; i++) scanf("%d", &a[i]);

    // 找最小值和最大值的位置
    int min_i = 0, max_i = 0;
    for (int i = 1; i < n; i++) {
        if (a[i] < a[min_i]) min_i = i;
        if (a[i] > a[max_i]) max_i = i;
    }

    // 最小值与第一个数交换
    int t = a[0]; a[0] = a[min_i]; a[min_i] = t;
    // 如果最大值原本在位置0，被换走了，需要更新max_i
    if (max_i == 0) max_i = min_i;

    // 最大值与最后一个数交换
    t = a[n - 1]; a[n - 1] = a[max_i]; a[max_i] = t;

    for (int i = 0; i < n; i++) printf("%d ", a[i]);
    printf("\n");
    return 0;
}
