# 配图参考与示意图复查：2026-09-29

对 `5ae4bad2e1ef56df2988f88636b3294360640087` 中的 11 张示意图重新审阅，依据 vuepass 的 `diagram-review` 与 `clear-writing-and-visuals`，先搜索并查看代表性参考图，再检查实际页面、交互与相邻正文。本轮优化 6 张，保留 5 张。

## 网上参考及采用的方法

参考来自官方教程、原论文和作者资料。查看了图像本身，包括 PagedAttention 的动画画面和论文／教材的 PDF 页面。以下来源用于学习表达方法；笔记中的图形与交互按 mKernel 材料重新绘制，参数和性能结论仍依据 mKernel 的论文或固定版本源码。

| 参考 | 具体看的图 | 对本笔记有用的表达方法 |
|---|---|---|
| [NVIDIA：CUTLASS — Fast Linear Algebra in CUDA C++](https://developer.nvidia.com/blog/cutlass-linear-algebra-cuda/) | Figure 1 的 GEMM 层级、Figure 8 的软件流水线 | 用明确的局部边界连接全貌与放大图；在并行泳道之间把依赖线连到具体操作，而非只画处理顺序。用于补足时间线的依赖，以及 token 放大范围的对应关系 |
| [vLLM：PagedAttention 官方介绍](https://vllm.ai/blog/2023-06-20-vllm) | KV block 分布图，以及 logical blocks → block table → physical blocks 的生成动画 | 同一对象在不同表示中保留可追踪的标识。用于 chunk 与提交命令的一一对应，也用于在环上追踪同一份 KV |
| [FlashAttention-2 原论文](https://tridao.me/publications/flash2/flash2.pdf#page=9) | Figure 3：两种 warp 工作划分 | 让共享、分块和对应关系直接体现为空间布局。保留现有 A/B/C 轴对齐图，并把源码图中同一个 tile 的本地部分和、远端部分和与最终结果逐列对齐 |
| [OSTEP：Paging — Introduction](https://pages.cs.wisc.edu/~remzi/OSTEP/vm-paging.pdf#page=2) | Figure 18.1、18.2：地址空间与物理内存中的页框 | 明确范围与格子的单位，用占用／空闲和编号表达状态。用于核查资源网格、字节边界图和命令字段图是否存在数量或范围歧义 |
| [C4：Container diagram](https://c4model.com/diagrams/container)、[层级说明](https://c4model.com/diagrams) | 系统边界、内部对象与外部依赖的示例 | 每张图明确视角与边界，局部展开能回到整体。用于检查通信路径的节点边界，以及首页部分和与源码缓冲区之间的概念衔接 |

选择这些参考的依据是它们能具体解释分块、映射、并行、地址范围和系统边界。配图是否有效仍按当前读者问题判断，不以名气或视觉风格直接替代审阅。

## 逐图审阅与处理

| 图 | 实际阅读问题或保留依据 | 修改与复查 |
|---|---|---|
| [执行时间线](../notes/.vuepress/components/diagrams/PipelineTimeline.vue) | 三组同尺度条形能比较总耗时，但 tile 1 为什么停在某处仍需读者自行推导；计算后的尾部没有明确区域 | 添加连接 tile 1 实际端点的依赖箭头、等待同组数据的斜线区和计算结束后的尾部底色。切换 2／3／6 tiles，等待与尾部随调度变化；教学成本模型保持不变 |
| [分层归约](../notes/.vuepress/components/diagrams/HierarchyTiles.vue) | 8 份贡献、节点内和、跨网交换和副本数量已经可见；首页 A/B 部分和与源码 L/R 的命名不同 | 将节点内部分和统一为 L/R，最终和为 Σ = L + R；展开布局与交换提示同步更新，保持原有数量与所有权关系 |
| [Tile / chunk / batch](../notes/.vuepress/components/diagrams/ChunkReadiness.vue) | 小格和外框表达了粒度，但网络块与下方命令的对应依赖读者计数 | 给 chunk 与命令使用相同 C0、C1 等编号；点击块后同时突出对应命令，未齐的块明确显示尚无命令。验证粒度变化、零就绪、边界就绪及不足 8 条的批次 |
| [通信路径](../notes/.vuepress/components/diagrams/TransportPaths.vue) | 节点边界、CPU／GPU 提交职责、控制虚线与 payload 实线清楚；手机已有独立布局 | 保留。检查两种后端的标题、路径与窄屏显示，继续保留线宽不表示字节比例的限定 |
| [SM 资源分配](../notes/.vuepress/components/diagrams/SmAllocationDemo.vue) | 同一 32 格全集、两种角色和共用尺度的耗时条已经表达资源取舍 | 保留。验证计算完成与两类工作均为零时的闲置格子，继续标明线性模型、block 单位与未建模的吞吐饱和 |
| [AllGather + GEMM](../notes/.vuepress/components/diagrams/GatherGemmLayout.vue) | A/C 的 M 段对齐，B/C 的输出列范围对齐；输入可用与输出可计算同步 | 保留。检查四个输入阶段及 A/C 行边界，继续区分“可计算”和“已经计算完” |
| [Token 边界](../notes/.vuepress/components/diagrams/TokenBoundary.vue) | 两个比例图本身正确，但原连接线没有指向上图中真正被放大的 64 KiB 范围 | 在 1024 KiB 总览上标出 480–544 KiB 窗口，以两条连接线展开到下图，并标明横向放大 16 倍。保持 token 504–520 KiB 的位置和两半就绪条件 |
| [Ring Attention](../notes/.vuepress/components/diagrams/AttentionRing.vue) | KV 标签会移动，但样式相同，不易追踪同一份 KV；本轮计算和传递的共享输入主要依靠文字 | 用 ◆ 与稳定的强调色追踪 KV0，增加逐轮所在 GPU 的位置条；将 GPU 0 的当前 KV 画成一份数据分出两条读取关系。最后一轮撤去传递分支，配对矩阵继续记录覆盖范围 |
| [AllReduce chunk 源码图](../notes/.vuepress/components/diagrams/AllReduceChunkTrace.vue) | C_local、C_recv 与 C_final 分散呈现，读者需要自行对应同一个 tile；原交互只演示本地先完成 | 逐列对齐 L₀/R₀/Σ₀ 等逻辑 tile，明确读取左侧同一 C_local；加入两种就绪顺序，分别演示 local=1/remote=0 与 local=0/remote=1 均需等待，两者到齐后仍要执行最终归约 |
| [48 字节命令发布](../notes/.vuepress/components/diagrams/CommandPublication.vue) | 六个等宽 8 B 字、头部状态与 CPU 读取状态能够解释“内容已写好仍未发布” | 保留。验证空槽、内容写入、命令头发布及 CPU 复制后旧字段仍保留的四个状态；控制记录与 GPU payload 继续区分 |
| [峰值性能比较](../notes/.vuepress/components/diagrams/PeakComparison.vue) | 共用 0–2× 刻度和 1× 基线，精确值与测试床限定齐全 | 保留。核对 6 个数值与移动端显示，继续保留峰值、shape 范围及非整模型收益的限定 |

## 语义边界

新依赖线解释的是 tile 1 等待同组数据的条件；尾部表示图中 24 μs 计算结束后尚未完成的工作，不是新增测量。两种 AllReduce 就绪顺序依据既有源码中同时检查两个 flag 的条件，均属于所选静态分支的合法示例；未将“数据到齐”改写成“归约已执行”。Ring 图继续省略 softmax 累积与物理网络层级。参考资料中的优化或参数未迁移为 mKernel 的实现结论。

## 验证

- 内容检查、TypeScript/Vue 类型检查、8 项现有单元测试、生产构建及 `git diff --check` 通过。
- 六页在 1600／390 像素的浅色与深色模式、320 像素浅色模式下完成浏览器检查；43 个站内锚点有效，未发现页面横向溢出、公式错误或运行时异常。
- 浏览器核验时间线箭头与对应任务的实际几何端点、三种 chunk 粒度的命令映射、token 放大窗口的比例、四轮 KV0 位置、两种 AllReduce 顺序的十个阶段组合，以及其他图的相关边界状态。新增顺序按钮和阶段操作可通过键盘使用。
- 查看修改前后的实际截图，复查桌面与手机中的连线、标识、空缺状态、输入输出对齐及浅／深色可读性。
- 首页、协同机制、五类算子和源码导读均导出为自包含 HTML；通过 `file://` 在 1600／390 像素下打开，主要交互可用，未产生 HTTP 请求或页面运行时错误。

这里只报告笔记与图示的验证；没有新增 CUDA／RDMA 运行结果或性能测量。
