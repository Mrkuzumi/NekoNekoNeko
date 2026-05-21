#include<stdio.h>
#include<string.h>
int main(void)
{
    /*********Begin*********/
    char str[3][81], temp[81];
    int i, j;
    for (i = 0; i < 3; i++) {
        scanf("%s", str[i]);
    }
    for (i = 0; i < 2; i++) {
        for (j = 0; j < 2 - i; j++) {
            if (strcmp(str[j], str[j + 1]) > 0) {
                strcpy(temp, str[j]);
                strcpy(str[j], str[j + 1]);
                strcpy(str[j + 1], temp);
            }
        }
    }
    for (i = 0; i < 3; i++) {
        printf("%s\n", str[i]);
    }
    /*********End**********/
    return 0;
}