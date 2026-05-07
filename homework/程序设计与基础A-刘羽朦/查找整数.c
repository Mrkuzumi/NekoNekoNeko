#include <stdio.h>

int main() {
    int n, a[1000], x;
    scanf("%d", &n);
    for (int i = 0; i < n; i++) scanf("%d", &a[i]);
    scanf("%d", &x);

    for (int i = 0; i < n; i++) {
        if (a[i] == x) {
            printf("%d\n", i + 1);
            return 0;
        }
    }
    printf("-1\n");
    return 0;
}
