#include <stdio.h>

int main() {
    int n1, n2, a[20], b[20], c[40], cnt = 0;

    scanf("%d", &n1);
    for (int i = 0; i < n1; i++) scanf("%d", &a[i]);

    scanf("%d", &n2);
    for (int i = 0; i < n2; i++) scanf("%d", &b[i]);

    // 找出 a 中有但 b 中没有的元素
    for (int i = 0; i < n1; i++) {
        int found = 0;
        for (int j = 0; j < n2; j++)
            if (a[i] == b[j]) { found = 1; break; }
        if (!found) c[cnt++] = a[i];
    }

    // 找出 b 中有但 a 中没有的元素
    for (int i = 0; i < n2; i++) {
        int found = 0;
        for (int j = 0; j < n1; j++)
            if (b[i] == a[j]) { found = 1; break; }
        if (!found) c[cnt++] = b[i];
    }

    // 去重并按序输出
    int first = 1;
    for (int i = 0; i < cnt; i++) {
        int dup = 0;
        for (int k = 0; k < i; k++)
            if (c[i] == c[k]) { dup = 1; break; }
        if (!dup) {
            if (!first) printf(" ");
            printf("%d", c[i]);
            first = 0;
        }
    }
    printf("\n");
    return 0;
}
