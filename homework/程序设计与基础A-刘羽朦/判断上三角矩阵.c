#include <stdio.h>

int main()
{
    int T, n;
    scanf("%d", &T);
    while(T--){
        scanf("%d", &n);
        int a[n][n];
        for(int i=0; i<n; i++){
            for(int j=0; j<n; j++){
                scanf("%d", &a[i][j]);
            }
        }
        int is = 1;
        for(int i=0; i<n; i++){
            for(int j=0; j<n; j++){
                if(i>j && a[i][j] != 0){
                    is = 0;
                    break;
                }
            }

        }
        if(is) printf("YES\n");
        else printf("NO\n");
    }
    return 0;
}
