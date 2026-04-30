#include <stdio.h>
#include <math.h>

int prime(int p) {
    if (p < 2) return 0;
    for (int i = 2; i <= sqrt(p); i++) {
        if (p % i == 0) return 0;
    }
    return 1;
}

int prime_sum(int m, int n) {
    int sum = 0;
    for (int i = m; i <= n; i++) {
        if (prime(i)) sum += i;
    }
    return sum;
}

int main() {
    int m, n;
    scanf("%d %d", &m, &n);

    printf("Sum of ( ");
    for (int i = m; i <= n; i++) {
        if (prime(i)) printf("%d ", i);
    }
    printf(") = %d\n", prime_sum(m, n));

    return 0;
}
