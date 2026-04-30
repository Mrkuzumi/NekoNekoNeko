#include <stdio.h>
/*任务描述
对于一个已知的矩形，判断输入的点是否包含在该矩形内。
点的坐标（x,y）用结构体来描述。矩形可以用对角线上的两个点来定义（左下角点和右上角点）。
已知矩形的左下角点为（1,1），右上角点为（5,5）。

要求编写一个函数判断点是否在矩形内，如果在内则返回1，否则返回-1；主函数调用该判断函数，如果返回 1 则输出 in ，返回 -1 则输出 out。

编程要求
根据提示，在右侧编辑器补充代码，判断并输出点在矩形内部还是外部。

测试说明
输入说明：
第一行输入点的个数 n；
后面n+1行输入每个点的坐标，用空格隔开。

输出说明：
输出在矩形内部in，还是外部out。

平台会对你编写的代码进行测试：

测试输入：
3
1 1
5 5
5 10
预期输出：
in
in
out

*/


typedef struct{
    double x,y;    
}box;

int is_in_box(box b){
    scanf("%lf %lf", &b.x, &b.y);
    if(b.x >= 1 && b.x <= 5 && b.y >= 1 && b.y <= 5){
        return 1;
    }else{
        return -1;
}
}
int main(){
    int n;
    scanf("%d", &n);
    box b;
    for(int i=0;i<n;i++){
        if( is_in_box(b) == 1){
            printf("in\n");
        }else{
            printf("out\n");
        }
    
}
return 0;
}

















