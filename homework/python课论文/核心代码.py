# KNN模型构建核心代码 
from sklearn.neighbors import KNeighborsClassifier 
from sklearn.model_selection import cross_val_score # 创建KNN分类器 knn = KNeighborsClassifier(n_neighbors=5, metric='euclidean') # 使用交叉验证选择最优K值 
k_values = range(1, 21) 
cv_scores = [] 
for k in k_values: 
knn = KNeighborsClassifier(n_neighbors=k) 
scores = cross_val_score(knn, X_train, y_train, cv=5, scoring='accuracy') 
cv_scores.append(scores.mean()) # 选择最优K值 
optimal_k = k_values[cv_scores.index(max(cv_scores))] 
print(f"最优K值: {optimal_k}, 交叉验证准确率: {max(cv_scores):.3f}")
