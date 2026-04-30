#include <stdio.h>

// 判断 n³ 的末尾是否等于 n 本身
int IsSpecialCube(int n) {
    int digits = 1, t = n;
    while (t >= 10) {
        t /= 10;
        digits *= 10;
    }
    return (n * n * n) % (digits * 10) == n;
}

int main() {
    int t;
    scanf("%d", &t);
    while (t--) {
        int a, b;
        scanf("%d %d", &a, &b);
        int count = 0;
        for (int i = a; i <= b; i++) {
            if (IsSpecialCube(i)) {
                if (count > 0) printf(" ");
                printf("%d", i);
                count++;
            }
        }
        if (count == 0) {
            printf("0\n");
        } else {
            printf("\n%d\n", count);
        }
    }
    return 0;
}
