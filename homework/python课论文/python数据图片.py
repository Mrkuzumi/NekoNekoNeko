import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.neighbors import KNeighborsClassifier
from sklearn.metrics import confusion_matrix, ConfusionMatrixDisplay, classification_report

# 1. 环境配置
plt.rcParams['font.sans-serif'] = ['SimHei']  # 解决中文显示
plt.rcParams['axes.unicode_minus'] = False
sns.set_theme(style="whitegrid", font='SimHei')

# 2. 加载数据 [cite: 2, 7]
iris = load_iris()
df = pd.DataFrame(iris.data, columns=['花萼长度', '花萼宽度', '花瓣长度', '花瓣宽度'])
df['species'] = [iris.target_names[i] for i in iris.target]

# 3. 模拟实验流程（用于生成图7和图8） [cite: 2, 3]
X = iris.data
y = iris.target
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42) # 8:2划分 [cite: 3, 31]
scaler = StandardScaler()
X_train_std = scaler.fit_transform(X_train)
X_test_std = scaler.transform(X_test)
knn = KNeighborsClassifier(n_neighbors=5) # 选定K=5 [cite: 3, 40]
knn.fit(X_train_std, y_train)
y_pred = knn.predict(X_test_std)

print("正在生成图片，请稍候...")

# --- 绘图开始 ---

# 图2: 特征分布直方图 [cite: 15, 16]
df.iloc[:, 0:4].hist(bins=20, figsize=(10, 8), color='skyblue', edgecolor='black')
plt.suptitle("图2: 鸢尾花特征分布直方图")
plt.savefig('fig2_histograms.png')
plt.close()

# 图3: 散点图矩阵 [cite: 17, 18]
pair_plot = sns.pairplot(df, hue='species', markers=["o", "s", "D"])
pair_plot.fig.suptitle("图3: 鸢尾花特征与类别关系散点图矩阵", y=1.02)
plt.savefig('fig3_pairplot.png')
plt.close()

# 图4: 特征相关性热力图 [cite: 19, 20]
plt.figure(figsize=(8, 6))
sns.heatmap(df.iloc[:, 0:4].corr(), annot=True, cmap='coolwarm', fmt=".2f")
plt.title("图4: 鸢尾花特征相关性热力图")
plt.savefig('fig4_heatmap.png')
plt.close()

# 图5: 特征箱线图 [cite: 21, 22]
plt.figure(figsize=(12, 8))
df_melted = df.melt(id_vars='species', var_name='特征', value_name='数值')
sns.boxplot(x='特征', y='数值', hue='species', data=df_melted)
plt.title("图5: 三类鸢尾花各特征箱线图")
plt.savefig('fig5_boxplots.png')
plt.close()

# 图7: 混淆矩阵热力图 [cite: 49, 50]
plt.figure(figsize=(8, 6))
cm = confusion_matrix(y_test, y_pred)
disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=iris.target_names)
disp.plot(cmap='Blues', ax=plt.gca())
plt.title("图7: KNN模型在测试集上的混淆矩阵")
plt.savefig('fig7_confusion_matrix.png')
plt.close()

# 图8: 分类性能柱状图 [cite: 55, 56]
report = classification_report(y_test, y_pred, target_names=iris.target_names, output_dict=True)
report_df = pd.DataFrame(report).iloc[:-1, :3].T 
report_df.plot(kind='bar', figsize=(10, 6))
plt.title("图8: KNN模型各类别分类性能柱状图")
plt.ylabel("得分")
plt.xticks(rotation=0)
plt.savefig('fig8_metrics_bar.png')
plt.close()

print("所有图片已生成并保存在当前文件夹下！")
