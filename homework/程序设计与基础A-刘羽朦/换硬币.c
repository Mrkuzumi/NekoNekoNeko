/*任务描述
本关任务：将一笔零钱换成5分、2分和1分的硬币，要求每种硬币至少有一枚，有几种不同的换法？

编程要求
根据提示，在右侧编辑器补充代码，计算并输出。

测试说明
输入说明：
输入在一行中给出待换的零钱数额x∈(8,100)。

输出说明：
要求按 5分、2分 和 1分 硬币的数量依次从大到小的顺序，输出各种换法。每行输出一种换法，格式为：“fen5:5分硬币数量, fen2:2分硬币数量, fen1:1分硬币数量, total:硬币总数量”。最后一行输出“count = 换法个数”。

平台会对你编写的代码进行测试：

测试输入：
13
预期输出：

fen5:2, fen2:1, fen1:1, total:4
fen5:1, fen2:3, fen1:2, total:6
fen5:1, fen2:2, fen1:4, total:7
fen5:1, fen2:1, fen1:6, total:8
count = 4
*/
#include <stdio.h>
int main() {
    int x, count = 0;
    scanf("%d", &x);
    for (int five = x / 5; five >= 1; five--) {
        for (int two = (x - five * 5) / 2; two >= 1; two--) {
            int one = x - five * 5 - two * 2;
            if (one >= 1) {
                printf("fen5:%d, fen2:%d, fen1:%d, total:%d\n", five, two, one, five + two + one);
                count++;
            }
        }
    }
    printf("count = %d", count);
    return 0;
}