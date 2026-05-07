#include <stdio.h>

int main() {
    int n, a[11], x;
    scanf("%d", &n);
    for (int i = 0; i < n; i++) scanf("%d", &a[i]);
    scanf("%d", &x);

    // 找到插入位置
    int pos = n;
    for (int i = 0; i < n; i++) {
        if (a[i] > x) { pos = i; break; }
    }

    // 后移
    for (int i = n; i > pos; i--) a[i] = a[i - 1];
    a[pos] = x;

    for (int i = 0; i <= n; i++) printf("%d ", a[i]);
    printf("\n");
    return 0;
}
