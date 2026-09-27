# 示意图 Review：2026-09-27

按 `vuepress-notes-template` 中的 `diagram-review` 与更新后的 `clear-writing-and-visuals` 审阅原有 8 张图，修正 6 张，保留 2 张，并新增 1 张轴对齐的 GEMM 分块图。检查对象包括相邻正文、组件源码、实际页面、交互状态和离线导出。

## 主要发现与处理

| 位置 | 阅读问题或保留依据 | 处理与复查结果 |
|---|---|---|
| [AllGather + GEMM](../notes/.vuepress/components/diagrams/GatherGemmLayout.vue) | 原先只有文字，读者无法直接对应“哪段 A 可用”与“哪段 C 可计算” | 新增 A/B/C 轴对齐图；A 与 C 同一 M 段对齐，B 与 C 的 Nₗ 范围对齐。4 个到达阶段同步更新输入和输出；下方比较完整 AllGather 与局部放行的可计算范围 |
| [分层归约](../notes/.vuepress/components/diagrams/HierarchyTiles.vue) | 默认只显示归约后的 owner，对“8 份变 1 份”的认识依赖文字；跨网箭头在其他阶段仍显示 | 主图直接呈现 8 份不同贡献、节点内和、rail peer 交换及最终和的 8 份副本；完整 GPU × 输出组矩阵按需展开，阶段图仅在交换时显示跨网箭头 |
| [通信路径](../notes/.vuepress/components/diagrams/TransportPaths.vue) | 手机默认视图被横向裁切，看不到远端 GPU，无法一眼追踪完整 payload 路径 | 窄屏改用上下节点布局，两种后端都能同时看到本地 GPU、CPU、两个 NIC 和远端 GPU；控制路径与 payload 路径保持区分 |
| [Token 边界](../notes/.vuepress/components/diagrams/TokenBoundary.vue) | 两块都未到达时仍显示“等待另一部分”，暗示已有一半可用 | 标题改成通用完成条件；分别验证等待两个 chunk、等待 chunk 0、等待 chunk 1 和完整可消费四种状态 |
| [Ring Attention](../notes/.vuepress/components/diagrams/AttentionRing.vue) | “Q × KV”容易被理解成普通矩阵乘；同轮计算与传递只在说明中出现 | 标为本轮 Attention 的两组输入；并列显示当前计算与同一 KV 的传递。最后一轮撤去传递箭头并显示覆盖完成，保留配对矩阵 |
| [执行时间线](../notes/.vuepress/components/diagrams/PipelineTimeline.vue) | 同尺度比较已有效，但手机隐藏 tile 编号后不易追踪同一 tile 的依赖 | 给三个阶段中的 tile 1 加粗框；仍能看到首发位置与尾部差异，保留教学成本与模型假设 |
| [资源分配](../notes/.vuepress/components/diagrams/SmAllocationDemo.vue) | 网格与条形已表达资源竞争，但通信为零时的说明仍谈“两类工作尾部” | 补充通信已完成时的说明，调整取整后时间关系的表述；验证两类工作均为零、仅通信剩余及仅计算剩余 |
| [Tile / chunk / batch](../notes/.vuepress/components/diagrams/ChunkReadiness.vue) | 小格、chunk 边框与命令组分别编码三种粒度，默认状态能看到 3 个已完成 tile 等待同组数据 | 保留；验证 7→8 的 chunk 边界、空输入、1/4/8 tile 分组及不足 8 条的提交批次 |
| [性能条形图](../notes/.vuepress/components/diagrams/PeakComparison.vue) | 条形共用 0–2× 刻度，1× 基准、测试床和峰值口径可见 | 保留；检查 6 条数据、刻度与小屏可读性，继续保留“不同峰值可能来自不同 shape”的限定 |

## 新图的事实边界

AllGather + GEMM 图依据[论文 v1 §3.1、§4](https://arxiv.org/html/2609.13585v1#S4)中的输入可用性调度重新绘制。为便于阅读，将拓扑缩为 2 节点 × 2 GPU、A 分为 4 段等大的逻辑行；这不是论文测试床规模或具体 MMA 布局。填色表示具备计算条件，不表示输出已完成，也不提供实测耗时。

分层归约图中的 D/8 保持两节点交换阶段、每 GPU 发送量的口径，不能据此推导相对 NCCL 的固定加速比。时间线和资源分配图仍标明教学模型及其忽略的开销。此次未复跑论文 GPU 实验。

## 验证

- `make check`、类型检查、8 项现有单元测试及带 `/mkernel-notes/` base 的生产构建通过。
- 9 张图在 1600 和 390 像素、浅色和深色模式下截图检查；320、390、1600 像素下的交互与页面宽度检查通过。
- 新图检查 A/C 行边界与 B/C 列边界对齐；键盘切换阶段后，输入、输出和比较条同步更新。
- 生产页面的 35 个站内锚点核验通过；相关图示状态无 JavaScript 运行时错误。
- 首页与算子页分别导出为自包含 HTML，通过 `file://` 打开后检查新增和修改的交互，无网络请求与运行时错误。

结论：上述范围内的图形表达、状态一致性和实际呈现验收通过。
