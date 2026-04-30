#include <stdio.h>
/*任务描述
不变初心数是指这样一种特别的数，它分别乘 2、3、4、5、6、7、8、9 时，所得乘积各位数之和却不变。例如 18 就是这样的数：18 的 2 倍是 36，3+6=9；18 的 3 倍是 54，5+4=9；…… 18 的 9 倍是 162，1+6+2=9。对于 18 而言，9 就是它的初心。

本关任务：补全右边的代码，判断任一个给定的数是否有不变的初心。

输入格式
输入在第一行中给出一个正整数 N（≤ 100）。随后 N 行，每行给出一个不超过10 
5
 的正整数。

输出格式
对每个给定的数字，如果它有不变的初心，就在一行中输出它的初心；否则输出 NO。

测试说明
平台会对你编写的代码进行测试：

测试输入：
4
18
256
99
120

预期输出：
9
NO
18
NO*/
int sum_of_digits(int n){
    int sum = 0;
    while(n > 0){
        sum += n % 10;
        n /= 10;
    }
    return sum;
}

int main(){
    int N;
    scanf("%d", &N);
    for(int i=0; i<N; i++){
        int num;
        scanf("%d", &num);
        int initial = sum_of_digits(num);
        int is_constant = 1;
        for(int j=2; j<=9; j++){
            if(sum_of_digits(num * j) != initial){
                is_constant = 0;
                break;
            }
        }
        if(is_constant){
            printf("%d\n", initial);
        }else{
            printf("NO\n");
        }
    }
    return 0;
}