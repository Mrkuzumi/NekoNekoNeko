#include <stdio.h>
#include <math.h>
/*题目描述
本题要求实现一个判断素数的简单函数，并利用该函数验证哥德巴赫猜想：任何一个不小于6的偶数均可表示为两个奇素数之和。素数就是只能被1和自身整除的正整数。

输入两个正整数m和n（0<=m<=n<=100），将m和n之间的偶数表示成两个素数之和，输出时每行显示5组。要求定义并调用函数prime（m）判断m是否为素数，当m为素数时返回1，否则返回0。

输入
两个正整数m和n（0<=m<=n<=100）

输出
见样例

输入样例
89 100

输出样例1
90=7+83, 92=3+89, 94=5+89, 96=7+89, 98=19+79
100=3+97,*/

int prime(int m){
    if(m < 2){
        return 0;
    }
    for(int i=2; i<=sqrt(m); i++){
        if(m % i == 0){
            return 0;
        }
    }
    return 1;
}

int main(){
    int m, n;
    scanf("%d %d", &m, &n);
    int count = 0;
    for(int i=m; i<=n; i++){
        if(i % 2 == 0 && i >= 6){
            for(int j=2; j<=i/2; j++){
                if(prime(j) && prime(i-j)){
                    printf("%d=%d+%d", i, j, i-j);
                    count++;
                    if(count % 5 == 0){
                        printf("\n");
                    }else{
                        printf(", ");
                    }
                    break;
                }
            }
        }
    }
    return 0;
}
