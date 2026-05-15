#include <stdio.h>
/*任务描述
本关任务：所谓“螺旋方阵”，是指对任意给定的N，将1到N×N的数字从左上角第1个格子开始，按顺时针螺旋方向顺序填入N×N的方阵里。本题要求构造这样的螺旋方阵。

编程要求
根据提示，在右侧编辑器补充代码，构造螺旋方阵。

测试说明
输入说明：
输入在一行中给出一个正整数N（<10）。

输出说明：
输出N×N的螺旋方阵。每行N个数字，每个数字占3位。

平台会对你编写的代码进行测试：

测试输入1：
3
预期输出1：

  1  2  3
  8  9  4
  7  6  5

测试输入2：
5
预期输出2：

  1  2  3  4  5
 16 17 18 19  6
 15 24 25 20  7
 14 23 22 21  8
 13 12 11 10  9*/
int main()
{
    int N;
    scanf("%d", &N);
    int a[N][N];
    int num = 1;
    int top = 0, bottom = N - 1, left = 0, right = N - 1;
    while (num <= N * N) {
        for (int i = left; i <= right; i++) {
            a[top][i] = num++;
        }
        top++;
        for (int i = top; i <= bottom; i++) {
            a[i][right] = num++;
        }
        right--;
        for (int i = right; i >= left; i--) {
            a[bottom][i] = num++;
        }
        bottom--;
        for (int i = bottom; i >= top; i--) {
            a[i][left] = num++;
        }
        left++;
    }
    for (int i = 0; i < N; i++) {
        for (int j = 0; j < N; j++) {
            printf("%3d", a[i][j]);
        }
        printf("\n");
    }
    return 0;
}
