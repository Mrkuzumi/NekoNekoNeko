/*题目描述
已知函数e^x可以展开为幂级数1+x+x^2/2!+x^3/3!+⋯+x^k/k!+⋯。现给定一个实数x，要求利用此幂级数部分和求e^x的近似值，求和一直继续到最后一项的绝对值小于0.00001。

提示：
绝对值用fabs

输入
输入在一行中给出一个实数x∈[0,5]。

输出
在一行中输出满足条件的幂级数部分和，保留小数点后四位。题目保证计算结果不超过双精度范围。

测试说明
平台会对你编写的代码进行测试：

测试输入：
1.2
预期输出：
3.3201*/
#include <stdio.h>
#include <math.h>
int main() {
    double x, sum = 1.0, term = 1.0;
    int k = 1;
    scanf("%lf", &x);
    while (fabs(term) >= 0.00001) {
        term *= x / k; // Calculate the next term in the series
        sum += term; // Add the term to the sum
        k++; // Move to the next term index
    }
    printf("%.4lf", sum);
    return 0;
}
