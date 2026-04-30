#include <stdio.h>

long long GCD(long long a, long long b) {
    while (b != 0) {
        long long t = b;
        b = a % b;
        a = t;
    }
    return a;
}

long long LCM(long long a, long long b) {
    return a / GCD(a, b) * b;
}

int main(void) {
    long long a, b;
    scanf("%lld %lld", &a, &b);

    if (a <= 0 || b <= 0) {
        printf("Input Error\n");
        return 0;
    }

    printf("%lld %lld\n", GCD(a, b), LCM(a, b));
    return 0;
}
