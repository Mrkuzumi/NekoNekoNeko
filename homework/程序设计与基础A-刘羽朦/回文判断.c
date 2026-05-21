#include<stdio.h>
#include<string.h>
int isPalindrome(char s[]);
int main()
{
    int t,c;
    char s[100];
    scanf("%d",&t);
    while(t--)
    {
        scanf("%s",s);
        if(isPalindrome(s))
            printf("Yes\n");
        else
            printf("No\n");
        }
        return 0;
}
int isPalindrome(char s[])
{
    //======begin======
    int len = strlen(s);
    int i;
    for (i = 0; i < len / 2; i++) {
        if (s[i] != s[len - 1 - i])
            return 0;
    }
    return 1;
    //=======end=======
    
}