import matplotlib.pyplot as plt
# 设置中文字体为黑体
plt.rcParams['font.sans-serif'] = ['SimHei'] 
# 解决坐标轴负号显示为方块的问题
plt.rcParams['axes.unicode_minus'] = False

def draw_flowchart():
    fig, ax = plt.subplots(figsize=(10, 6))
    steps = [
        "原始数据集 (150样本)",
        "缺失值检查与处理",
        "标签编码 (Species -> 0,1,2)",
        "Z-score 特征标准化",
        "数据集划分 (训练集:测试集 = 8:2)",
        "模型准备就绪"
    ]
    
    y_pos = range(len(steps), 0, -1)
    for i, text in enumerate(steps):
        # 画方框
        ax.text(0.5, y_pos[i], text, ha='center', va='center', 
                bbox=dict(boxstyle="round,pad=0.5", fc="lightblue", ec="steelblue"))
        # 画箭头
        if i < len(steps) - 1:
            ax.annotate('', xy=(0.5, y_pos[i+1]+0.3), xytext=(0.5, y_pos[i]-0.3),
                        arrowprops=dict(arrowstyle='->', lw=1.5, color='gray'))

    ax.set_xlim(0, 1)
    ax.set_ylim(0.5, len(steps) + 0.5)
    ax.axis('off')
    plt.title("图6: 数据预处理与特征工程流程图", fontsize=14)
    plt.savefig('fig6_workflow.png')
    plt.show()

draw_flowchart()
