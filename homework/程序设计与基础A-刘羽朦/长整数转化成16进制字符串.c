#include <stdio.h>
#define MAXN 10

void f( long int x, char *p );

int main()
{
    long int x;
    char s[MAXN] = "";

    scanf("%ld", &x);
    f(x, s);
    printf("%s\n", s);

    return 0;
}

/* 你的代码将被嵌在这里 */

void f (long int x, char *p)//将长整数转化成16进制字符串
{
	//=======begin=======
    if (x < 0) {
        *p++ = '-';
        x = -x;
    }
    sprintf(p, "%lX", x);
    

   //========end========
 }
