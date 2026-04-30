/*任务描述
题目描述:两个不同的自然数A和B，如果整数A的全部因子(包括1，不包括A本身)之和等于B；且整数B的全部因子(包括1，不包括B本身)之和等于A，则将整数A和B称为亲密数。求给定区间内所有的亲密数。

编程要求
请仔细阅读右侧代码，结合相关知识，在Begin-End区域内进行代码补充。
输入
两个整数，表示一个闭区间。
输出
闭区间以内的全部亲密数(输出格式：(A,B)，不加换行，不加分隔符号)
一对亲密数只输出一次，小的在前。
如果区间内没有亲密数，输出-1.

测试说明
样例输入：
1 3000
样例输出：
(220,284)(1184,1210)(2620,2924)*/
#include<stdio.h>
int sum_of_factors(int n){
    int sum = 0;
    for(int i=1; i<n; i++){
        if(n % i == 0){
            sum += i;
        }
    }
    return sum;
}
int main(){
    int m, n;
    scanf("%d %d", &m, &n);
    int found = 0;
    for(int i=m; i<=n; i++){
        int sum_i = sum_of_factors(i);
        if(sum_i > i && sum_i <= n && sum_of_factors(sum_i) == i){
            printf("(%d,%d)", i, sum_i);
            found = 1;
        }
    }
    if(!found){
        printf("-1");
    }
    return 0;
}