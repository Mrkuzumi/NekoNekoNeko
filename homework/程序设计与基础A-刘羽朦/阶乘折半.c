/*任务描述
给定一个数字n，令x=n!，然后反复进行如下操作：

若x为偶数，则将x折半（x=x/2）
若x为奇数，则操作结束
在操作结束时，试求一共折半了多少次。

输入
一个数字n。（0<n<=100）

输出
折半的次数。

输入样例
5

输出样例
3*/
#include <stdio.h>
int main() {
    int n, count = 0;
    scanf("%d", &n);
    unsigned long long x = 1;
    for (int i = 1; i <= n; i++) {
        x *= i; // Calculate n!
    }
    while (x % 2 == 0) { // Check if x is even
        x /= 2; // Fold in half
        count++; // Increment count
    }
    printf("%d", count);
    return 0;
}