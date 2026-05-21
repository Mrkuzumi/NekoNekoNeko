#include<stdio.h>
#include <string.h>
int main()
{
   //=======begin=======
    int n, i;
    char str[81], longest[81];

    scanf("%d", &n);
    getchar(); // 吸收换行符

    fgets(str, 81, stdin);
    str[strcspn(str, "\n")] = '\0'; // 去除换行符
    strcpy(longest, str);

    for (i = 1; i < n; i++) {
        fgets(str, 81, stdin);
        str[strcspn(str, "\n")] = '\0';
        if (strlen(str) > strlen(longest)) {
            strcpy(longest, str);
        }
    }

    printf("The longest is: %s\n", longest);
   //========end========
   return 0;
}