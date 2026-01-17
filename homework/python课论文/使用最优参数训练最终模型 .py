# 使用最优参数训练最终模型 
final_knn = KNeighborsClassifier(n_neighbors=optimal_k, metric='euclidean') 
final_knn.fit(X_train, y_train) # 在测试集上进行预测 
y_pred = final_knn.predict(X_test) 
