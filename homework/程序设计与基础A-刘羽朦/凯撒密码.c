#include<stdio.h>
#include <string.h>
int main()//凯撒密码：为了防止信息被别人轻易窃取，需要把电码明文通过加密方式变换成为密文。输入一个以回车符为结束标志的字符串（少于80个字符），再输入一个整数offset，用凯撒密码将其加密后输出。恺撒密码是一种简单的替换加密技术，将明文中的所有字母都在字母表上偏移offset位后被替换成密文，当offset大于零时，表示向后偏移；当offset小于零时，表示向前偏移。
{
   //=======begin=======
    char str[81];
    int offset, i;
    fgets(str,81,stdin);
    str[strcspn(str, "\n")] = '\0'; // 去除换行符
    scanf("%d", &offset);
    for(i=0;i<strlen(str);i++){
        if(str[i]>='a' && str[i]<='z'){
            str[i] = (str[i]-'a'+offset+26)%26 + 'a';
        }
        else if(str[i]>='A' && str[i]<='Z'){
            str[i] = (str[i]-'A'+offset+26)%26 + 'A';
        }

    }

    printf("%s\n", str);
   //========end========
   return 0;
}