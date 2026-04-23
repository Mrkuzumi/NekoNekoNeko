/*任务描述
本关任务：形如2 
n
 −1的素数称为梅森数（Mersenne Number）。例如2 
2
 −1=3、2 
3
 −1=7都是梅森数。1722年，双目失明的瑞士数学大师欧拉证明了2 
31
 −1=2147483647是一个素数，堪称当时世界上“已知最大素数”的一个记录。

本题要求编写程序，对任一正整数n（>0），输出所有不超过2 
n
 −1的梅森数。

编程要求
根据提示，在右侧编辑器补充代码，计算梅森数。

测试说明
输入说明：
输入在一行中给出正整数 n（n<20）。

输出说明：
按从小到大的顺序输出所有不超过2 
n
 −1的梅森数，每行一个。如果完全没有，则输出“None”。

平台会对你编写的代码进行测试：

测试输入1：
6
预期输出1：
3
7
31

测试输入2：
1
预期输出2：
None

*/
#include <stdio.h>
#include <math.h>
int is_prime(int num) {
    if (num <= 1) return 0;
    for (int i = 2; i <= sqrt(num); i++) {
        if (num % i == 0) return 0;
    }
    return 1;
}
int main() {
    int n;
    scanf("%d", &n);
    int limit = pow(2, n) - 1;
    int found = 0;
    for (int i = 2; i <= limit; i++) {
        if (is_prime(i) && (i & (i + 1)) == 0) { // Check if i is a Mersenne prime
            printf("%d\n", i);
            found = 1;
        }
    }
    if (!found) {
        printf("None");
    }
    return 0;
}