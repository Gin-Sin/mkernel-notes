---
title: "主线：从一次 AllReduce 理解 mKernel"
order: 1
---

# 主线：从一次 AllReduce 理解 mKernel

mKernel 是一组多 GPU、跨节点融合算子。它把**计算、节点内通信、跨节点通信接入同一条按局部数据就绪推进的流水线**：先在节点内减少需要跨网发送的数据，再让已完成的数据块尽早进入下一阶段。通信粒度、通知协议和 SM 分工共同决定这条流水线能否持续运行。

先用 GEMM + AllReduce 看完整过程，再读[协同机制](./mechanisms.md)、[五类算子的调度差异](./kernels.md)和[源码导读](./code-walkthrough.md)。论文结果与实现版本分别在[性能与边界](./evaluation.md)、[源码索引](./implementation.md)中核对。

## 1. 一次 GEMM + AllReduce 要完成什么

张量并行中，每张 GPU 先计算同一输出的部分贡献，AllReduce 再将所有贡献求和，使每张 GPU 都得到完整结果。mKernel 在这条路径上协调三个阶段：GEMM 产出局部贡献、节点内聚合、跨节点交换并合成最终结果。[论文 §4，表 3](https://arxiv.org/html/2609.13585v1#S4)

若等完整 GEMM 结束后才通信，早已产生的局部输出也会一起等待。若各 GPU 直接把完整局部输出跨网发送，又会给慢链路增加负担。因此，这个案例需要同时解决**跨网传多少**和**什么时候开始传**。

论文测试床中，每 GPU 单方向 NVLink 带宽为 **450 GB/s**，网络为 **50 GB/s**。后者来自 400 Gb/s ÷ 8；这里的 NVLink 数字采用单方向口径。这样的带宽差决定了：先利用快的节点内通信聚合，再使用较慢的网络。[论文 §2](https://arxiv.org/html/2609.13585v1#S2)

## 2. 先减少跨网数据：节点内归约，节点间交换

GEMM + AllReduce 需要把所有 GPU 的局部输出求和。设完整输出大小为 **D 字节**，将它等分为 8 组。每个节点的 GPU i 负责第 i 组的归约与跨节点交换，称为该组的 **owner**。下图追踪其中一组；展开详细布局后，可按行 = GPU、列 = 输出组检查数据归属。

<HierarchyTiles />

节点内先用带宽更高的 NVSwitch 聚合贡献，较慢的网络便只需传输每组的节点内部分和。8 个 owner 分摊跨节点传输，分别与另一节点中同编号的 GPU（**rail peer**）交换自己负责的部分和，再把最终结果广播给本节点所有 GPU。[论文 §3.1、表 3](https://arxiv.org/html/2609.13585v1#S3.SS1)

与具体 NCCL 算法相比能减少多少传输，还取决于该算法的数据路径；NCCL 也可能采用分层 collective。

<details>
<summary>求和关系与数据量推导</summary>

两节点、每节点 8 GPU 的完整结果为

$$
C=\sum_{n=0}^{1}\sum_{g=0}^{7}C_{n,g},\qquad L_n=\sum_{g=0}^{7}C_{n,g}.
$$

将 $L_n$ 等分给 8 个 owner 后，每 GPU 发送约 $D/8$，每节点发送 $8\times D/8=D$。作为对照，假设 8 张 GPU 各自向另一节点发送完整的局部输出，则每节点会发送 $8D$。这个示例展示了先在节点内归约如何减少跨节点发送的数据量。

</details>

## 3. 再提前启动：让不同数据块处于不同阶段

GEMM 按 tile（计算块）产出结果。双流流水线可以在一个数据块计算完成后启动其通信，但仍需等待生成该块的 kernel 结束。mKernel 在 kernel 内发布局部数据的就绪状态，使后续阶段可以处理已满足依赖的工作。[论文 §1，图 1](https://arxiv.org/html/2609.13585v1#S1)

<PipelineTimeline />

**同一块数据仍需先计算、再本地归约、再参与跨节点交换；不同块可以同时处于不同阶段。** 图中应比较的是第一块数据何时开始通信，以及最后还剩多少工作。最细的 tile 放行仅用于解释依赖；实际网络消息可以包含多个 tile。

mKernel 使用一次启动后持续处理多项任务的常驻 kernel（persistent kernel）。计算与通信由不同的 block 负责，通过就绪标记交接工作，从而在 kernel 内协调三个阶段。[论文 §3，图 2](https://arxiv.org/html/2609.13585v1#S3)

## 4. 为什么这些设计要配合使用

分层归约减少通信工作量，局部就绪缩短等待。要把这两个变化变成总耗时收益，还需让消息提交、远端通知和 GPU 资源分配跟上数据产生速度。

| 设计改变了什么 | 仍需解决的问题 | 配合的机制 |
|---|---|---|
| 节点内先归约，跨网只传部分和 | 结果若仍等完整 GEMM，通信依旧拖在尾部 | 按局部数据就绪推进 |
| 更早放行数据块 | 每块过小会放大消息和提交成本 | tile、网络 chunk、提交 batch 分开选择 |
| GPU 在计算过程中发起请求 | CPU、NIC 与接收 GPU 各有不同的完成时刻 | 主机代理提交，按传输语义发布到达通知 |
| 不同角色并行执行 | 通信 block 太少会积压，太多会挤占计算 | SM 分工，并按剩余工作调整资源 |

这些机制作用于同一条关键路径，收益不能直接相加。最慢阶段决定稳态推进速度，启动、排空、同步与资源竞争还会留下开销。自适应 SM 分配的实验支持限定在单节点 8×H100；跨节点整体结果不能单独证明每项机制的贡献。[论文 §2–3、§5.5](https://arxiv.org/html/2609.13585v1#S5.SS5)

## 5. 从这个案例读到实现与证据

[协同机制](./mechanisms.md)沿“块何时可发 → 谁提交 → 对端何时可用 → 谁负责推进”的顺序解释实现条件。[五类算子](./kernels.md)再比较输入通信、输出归约与环形交换的不同依赖。[源码导读](./code-walkthrough.md)回到本页的 AllReduce 案例，跟踪一个 chunk 的缓冲区和就绪标记。

论文在选定的多节点算子测试中报告 GEMM + AllReduce 最高 **1.72×**、Ring Attention 最高 **1.88×**。这些是相对指定未融合基线、在被测输入中的峰值；各测试床的完整口径和基线差异见[性能与边界](./evaluation.md)。

## 资料与署名

- 论文：[mKernel v1，2026-09-11](https://arxiv.org/abs/2609.13585v1)，Ziming Mao、Yihan Zhang、Shawn Wei Chew、Shuang Ma、Costin Raiciu、Yang Zhou、Scott Shenker、Ion Stoica；[PDF](https://arxiv.org/pdf/2609.13585v1)。论文以 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 发布。本笔记为中文转述，图示重新绘制，教学模型与推导均另行标明。
- 作者材料：[博客](https://uccl-project.github.io/posts/mkernel/)、[官方源码](https://github.com/uccl-project/mKernel)。源码核对固定在 [31b6b0f](https://github.com/uccl-project/mKernel/tree/31b6b0f97e7bbc966fcb6179607131e76cae6f20)，论文结论以 v1 为准。
- 页面结构与图示指引参考 [vuepress-notes-template](https://github.com/0xkoa1a/vuepress-notes-template)。笔记整理于 2026-09-27，完成网站构建与页面检查，未复跑论文 GPU 实验。
