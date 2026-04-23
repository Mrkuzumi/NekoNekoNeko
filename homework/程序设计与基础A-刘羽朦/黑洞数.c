/*任务描述
本关任务：黑洞数也称为陷阱数，又称“Kaprekar问题”，是一类具有奇特转换特性的数。

任何一个各位数字不全相同的三位数，经有限次“重排求差”操作，总会得到495。最后所得的495即为三位黑洞数。所谓“重排求差”操作即组成该数的数字重排后的最大数减去重排后的最小数。（6174为四位黑洞数。）
例如，对三位数207：

第1次重排求差得：720 - 27 ＝ 693；
第2次重排求差得：963 - 369 ＝ 594；
第3次重排求差得：954 - 459 ＝ 495；
以后会停留在495这一黑洞数。如果三位数的3个数字全相同，一次转换后即为0。
任意输入一个三位数，编程给出重排求差的过程。

编程要求
根据提示，在右侧编辑器补充代码，计算并输出黑洞数的全过程。

测试说明
输入说明：
输入在一行中给出一个三位数。
输出说明：
按照以下格式输出重排求差的过程：
序号: 数字重排后的最大数 - 重排后的最小数 = 差值
序号从1开始，直到495出现在等号右边为止。

平台会对你编写的代码进行测试：

测试输入：
123
预期输出：

1: 321 - 123 = 198
2: 981 - 189 = 792
3: 972 - 279 = 693
4: 963 - 369 = 594
5: 954 - 459 = 495*/
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
void sort_digits(int num, int *max, int *min) {
    char str[4];
    sprintf(str, "%03d", num); // Convert number to string with leading zeros
    char temp;
    // Sort digits in descending order for max
    for (int i = 0; i < 3; i++) {
        for (int j = i + 1; j < 3; j++) {
            if (str[i] < str[j]) {
                temp = str[i];
                str[i] = str[j];
                str[j] = temp;
            }
        }
    }
    *max = atoi(str); // Convert back to integer
    // Sort digits in ascending order for min
    for (int i = 0; i < 3; i++) {
        for (int j = i + 1; j < 3; j++) {
            if (str[i] > str[j]) {
                temp = str[i];
                str[i] = str[j];
                str[j] = temp;
            }
        }
    }
    *min = atoi(str); // Convert back to integer
}
int main() {
    int num;
    scanf("%d", &num);
    int count = 1;
    while (num != 495 && num != 0) {
        int max, min;
        sort_digits(num, &max, &min);
        int diff = max - min;
        printf("%d: %03d - %03d = %03d\n", count, max, min, diff);
        num = diff;
        count++;
    }
    return 0;
}