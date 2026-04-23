/*任务描述
本关任务：
某人去市场买菜，应当找零x元y角，结果卖家错给了y元x角。他用去了n元m角后才发觉有错，于是清点了余额尚有2x元2y角。请编写一个程序，计算原本应当找的零钱是多少？

输入格式
在一行中按格式n.m输入两个小于10的整数。

输出格式
在一行中按格式x.y输出原本应当找的零钱。如果无解，则输出No Solution。

测试说明
平台会对你编写的代码进行测试：

测试输入：`
0.7
预期输出：
3.8

测试输入：`
1.2
预期输出：
No Solution*/
#include <stdio.h>
int main() {
    int n, m, x, y;
    scanf("%d.%d", &n, &m);
    for (x = 0; x < 10; x++) {
        for (y = 0; y < 10; y++) {
            if ((10 * y + x) - (10 * n + m) == (20 * x + 2 * y)) {
                printf("%d.%d", x, y);
                return 0;
            }
        }
    }
    printf("No Solution");
    return 0;
}