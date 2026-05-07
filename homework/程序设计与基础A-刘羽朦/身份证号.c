#include <stdio.h>
#include <string.h>

int main() {
    char s[100];
    scanf("%s", s);

    int len = strlen(s);
    if (len != 18) {
        printf("no\n");
        return 0;
    }

    for (int i = 0; i < 17; i++) {
        if (s[i] < '0' || s[i] > '9') {
            printf("no\n");
            return 0;
        }
    }

    if (!((s[17] >= '0' && s[17] <= '9') || s[17] == 'X')) {
        printf("no\n");
        return 0;
    }

    printf("yes\n");
    return 0;
}
