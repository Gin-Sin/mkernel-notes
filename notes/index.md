---
title: "mKernel：优化设计与收益原理"
order: 1
---

# mKernel：优化设计与收益原理

mKernel 让**计算、节点内通信、跨节点通信按局部数据的就绪状态持续推进**，通过分层归约减少跨节点传输的数据量，并按剩余工作调整计算与通信资源。下面先看等待发生在哪里，再解释各项设计如何减少等待、需要付出什么代价。

依据：[mKernel v1](https://arxiv.org/html/2609.13585v1)，2026-09-11。另见[五类算子](./kernels.md)、[性能与边界](./evaluation.md)、[实现核对](./implementation.md)。

<PipelineTimeline />

## 1. 它解决的等待发生在哪里

GEMM 的第一个 tile（计算块）可能早已完成，下游却仍在等整次 GEMM 结束。双流流水线可以在一个数据块计算完成后启动其通信，但仍需等待生成该块的 kernel 结束。mKernel 在 kernel 内发布局部数据的就绪状态，使下游无需等待整个计算 kernel 结束，即可处理已满足依赖的工作。[论文 §1，图 1](https://arxiv.org/html/2609.13585v1#S1)

跨节点还多出两种不对称：论文测试床中，NVLink 为 **450 GB/s**，网络为 **50 GB/s**，均按每 GPU、单方向计算；节点内可以细粒度访问其他 GPU 的内存，RDMA 则需要完整的消息请求和完成通知。因此，优化需要同时处理**数据就绪后的等待、重复的跨节点传输、消息成本和资源竞争**。[论文 §2.1–2.3](https://arxiv.org/html/2609.13585v1#S2)

<details>
<summary>逐项设计、动机与实现方式</summary>

| 设计 | 动机：限制在哪里 | 实现方式 | 收益与代价 |
|---|---|---|---|
| 三阶段 tile 级融合 | kernel 边界延迟释放数据 | 常驻 kernel；计算、本地通信、发送、接收角色 | 重叠不同块的工作；增加轮询与同步 |
| 分层归约与广播 | 网络带宽约为 NVLink 的 1/9 | 本地归约、rail peer 交换、本地广播 | 减少慢链路重复字节；受拓扑和布局约束 |
| tile、chunk、batch 分离 | 小消息固定成本高，大消息启动晚 | chunk 内计数；最后一个 tile 发布 ready；批量提交 | 分别控制首发时刻和提交成本 |
| SM 分工与自适应分配 | 通信与 GEMM 争用 SM | 进度与计时计数；任务边界切换角色 | 减少资源错配和尾部空闲；可能拖慢计算 |
| GPU 发起、主机代理提交 | 直接驱动 NIC 的要求与逐 chunk 开销 | 48 B 命令；libibverbs；最多 8 条批量提交 | 提交与计算重叠；依赖主机代理持续推进 |
| 按 transport 语义通知 | 无序 write、旧 flag 影响正确性 | IB 的 data→flag；EFA 完成事件；epoch | 在局部数据安全可用时放行计算 |

400 Gb/s ÷ 8 = 50 GB/s。这里的 450 GB/s 是 NVLink 单方向口径，不能与双方向 900 GB/s 混比。表中机制来自论文 §2–4。

</details>

## 2. 把整块依赖变成持续推进的流水线

mKernel 使用一次启动后持续处理多项任务的**常驻 kernel（persistent kernel）**。计算 block 产出 tile，通信 block 负责本地搬运、网络请求或远端接收；各阶段通过就绪标记（readiness）通知下游，所需数据已可使用。主机代理（CPU proxy）提交网络请求，NIC 直接读写 GPU 内存中的待传输数据（payload）。**同一个 tile 仍有先后依赖，不同 tile 可以同时处在不同阶段**。[论文 §3，图 2](https://arxiv.org/html/2609.13585v1#S3)

最慢的阶段决定稳态速度，填充、排空和同步仍会留下开销。分层通信减少需要发送的数据量；局部就绪信息使下游更早获得工作；SM 分配决定各阶段推进速度。总耗时取决于这些变化如何共同影响关键路径。

<details>
<summary>性能近似：为什么通信 SM 不是越多越好</summary>

论文给出的近似关系为：

$$
T_{\mathrm{fused}}\approx
\max\left(
T_{\mathrm{compute}}\frac{S}{S-S_c},
T_{\mathrm{NVLink}},
T_{\mathrm{network}}
\right)+T_{\mathrm{fill/drain}}+T_{\mathrm{sync}}.
$$

$S$ 为全部 SM 数，$S_c$ 为通信 SM 数；$T_{\mathrm{compute}}$ 是全 SM 计算耗时。这里假设计算吞吐近似随计算 SM 数线性变化，两项通信时间也随分配变化。[论文 §2.2，式 (1)](https://arxiv.org/html/2609.13585v1#S2.SS2)

当通信资源不足，增加 $S_c$ 可以减少等待；当 NIC 已饱和，继续增加 $S_c$ 可能只会拖慢 GEMM。实际收益还取决于流水线长度、同步与内存争用，首页示意时间线没有包含这些因素。

</details>

## 3. 分层通信：把重复操作留在节点内

GEMM + AllReduce 需要把所有 GPU 的局部输出求和。设完整输出大小为 **D 字节**，将它等分为 8 组。每个节点的 GPU i 负责第 i 组的归约与跨节点交换，称为该组的 **owner**。下图追踪其中一组；展开详细布局后，可按行 = GPU、列 = 输出组检查数据归属。

<HierarchyTiles />

节点内先用带宽更高的 NVSwitch 聚合贡献，较慢的网络便只需传输每组的节点内部分和。owner 与另一节点中同编号的 GPU（**rail peer**）交换自己负责的分片，分摊跨节点传输。各数据块独立推进：早期 chunk 传输时，后面的 tile 仍可继续计算与本地归约。[论文 §3.1、表 3](https://arxiv.org/html/2609.13585v1#S3.SS1)

与具体 NCCL 算法相比能减少多少传输，还取决于该算法的数据路径；NCCL 也可能采用分层 collective。

<details>
<summary>求和关系、数据量推导与 AllGather 的对应设计</summary>

两节点、每节点 8 GPU 的完整结果为

$$
C=\sum_{n=0}^{1}\sum_{g=0}^{7}C_{n,g},\qquad L_n=\sum_{g=0}^{7}C_{n,g}.
$$

将 $L_n$ 等分给 8 个 owner 后，每 GPU 发送约 $D/8$，每节点发送 $8\times D/8=D$。作为对照，假设 8 张 GPU 各自向另一节点发送完整的局部输出，则每节点会发送 $8D$。这个示例展示了先在节点内归约如何减少跨节点发送的数据量。

AllGather + GEMM 采用对称思路：同一个 shard 向每个目标节点发送一次，由接收 rail peer 在本节点广播。计算顺序优先使用本 GPU shard，再用本节点其他 shard，最后消费远端 shard，让本地计算覆盖远端传输。[论文 §3.1、§4](https://arxiv.org/html/2609.13585v1#S4)

</details>

## 4. 三种粒度分开控制

本地计算与搬运按 tile 推进，网络按 chunk（消息块）传输，proxy 则将多条命令组成一个提交 batch（批次）。一个 tile 完成不一定凑齐一个 chunk；批量提交也保留各 chunk 独立的数据传输与完成通知。图中**格子是 tile，外框是 chunk，小记录的分组是一次 proxy 提交**。

<ChunkReadiness />

AllReduce 用 chunk 内计数汇总 tile 进度，最后一个完成的 tile 发布 ready。proxy 最多把同连接的 8 条就绪命令一并提交，并允许不足 8 条的批次，避免尾部为了凑满 batch 而继续等待。[论文 §3.1、§3.3](https://arxiv.org/html/2609.13585v1#S3.SS3)

大 chunk 可以摊薄每条消息的固定成本，但会推迟首次传输；batch 则减少提交调用次数。接收端还要检查当前计算所需数据覆盖的全部 chunk，见 [token 跨边界图](./kernels.md#_4-moe-dispatch-gemm-token-到达即可参与专家计算)。

<details>
<summary>精确粒度与消息成本模型</summary>

| 粒度 | 就绪／提交条件 | 论文示例 | 主要权衡 |
|---|---|---|---|
| Tile | 本 tile 的计算／本地操作完成 | 局部输出块 | 计算和本地访存组织 |
| Network chunk | 覆盖的 tile 全部完成 | AllReduce：4 tiles / 256 KiB | 消息数量与首发／尾部等待 |
| Submission batch | 仅收集同连接的就绪命令；可在有界收集窗口结束时提交不足 8 条的批次 | 同连接最多 8 条 | 提交成本与凑批等待 |

设总量为 $D$、chunk 为 $q$、每条消息固定开销为 $\alpha$、带宽为 $\beta$，串行服务的粗略成本为

$$
T_{\mathrm{transfer}}(q)\approx\left\lceil\frac{D}{q}\right\rceil\alpha+\frac{D}{\beta}.
$$

这个推导只解释小消息的固定成本，没有模拟真实并发。实际还包含数据就绪、依赖、争用和排空。Dispatch 的网络 chunk 为 512 KiB，跨 chunk 的 token 需要检查每个相交 chunk；只检查起始 chunk 不足以安全消费完整 token。[论文 §3.1](https://arxiv.org/html/2609.13585v1#S3.SS1)

</details>

## 5. SM 分工与自适应资源分配

mKernel 将计算和通信交给不同的 thread block。计算 block 执行 GEMM 时，通信 block 可以检查数据就绪状态、搬运节点内数据并推进网络请求。调整两类 block 的数量，就能改变资源分配，同时保留计算 block 原有的 warp 布局。论文中的 SM 分工通过 block 角色实现：固定配置按 block 索引分配角色，自适应模式允许在任务边界切换。[论文 §3.2](https://arxiv.org/html/2609.13585v1#S3.SS2)

从资源取舍看，这种分工适合**通信需要持续推进，同时还有独立计算可做**的场景。通信 block 太少会阻塞输入或积累输出尾部，太多会挤占 GEMM。收益成立需要减少的等待足以抵消计算资源减少和同步带来的成本；当 NIC 已经饱和时，继续增加通信资源可能只会拖慢 GEMM。这是结合[论文资源模型](https://arxiv.org/html/2609.13585v1#S2.SS2)得到的适用条件。

下图比较固定分配与按剩余工作调整的分配，可以观察哪些 block 闲置、哪些任务仍在等待。

<SmAllocationDemo />

控制器根据剩余任务和估计成本发布目标分配，block 在 tile／message 等任务边界切换角色。计算末期资源可以转向通信；通信供给输入时，等待输入的计算 block 还可以临时协助通信。[论文 §3.2、§5.5](https://arxiv.org/html/2609.13585v1#S3.SS2)

论文对自适应模式的实测限定在**单节点 8×H100**，不能把多节点 benchmark 的收益归因于已验证的多节点自适应控制。

<details>
<summary>分配公式与静态扫描证据</summary>

设共有 $B$ 个可分配 block，通信占 $n_s$ 个。剩余计算与通信任务数分别为 $R_p,R_s$，平均任务成本分别为 $C_p,C_s$。用剩余完成时间相等来求目标：

$$
\frac{R_pC_p}{B-n_s}=\frac{R_sC_s}{n_s}
\quad\Rightarrow\quad
n_s^*=B\frac{R_sC_s}{R_pC_p+R_sC_s}.
$$

block 用 cycle counter 估计任务成本。当前目标不等于瞬时实际分配：在执行的任务需要先完成，整数分配、依赖、最小资源和非线性吞吐也会影响效果。[论文 §3.2，式 (2)](https://arxiv.org/html/2609.13585v1#S3.SS2)

单节点扫描的最佳通信配置跨越 2–64 SM，最差 AllReduce 配置延迟约为最佳的 25 倍；这是配置敏感性，不是跨系统加速比。21 个配置的自适应归一化延迟口径见[性能页](./evaluation.md#_4-自适应-sm-接近最佳固定分配的成本)。

</details>

## 6. GPU 发起通信，CPU proxy 提交请求

待传输数据保存在 GPU 内存中；发送 block 将传输命令写入页锁定主机内存。proxy 通过 libibverbs 提交请求，NIC 直接读取已注册的 GPU 缓冲区。切换下面的后端，可以比较 CPU 与 GPU 提交请求时的控制路径。

<TransportPaths />

GPU 先写入 48 字节命令的内容，再写命令头以发布该命令。队列可用槽位（credit）与未完成请求数量的上限共同限制提交速度，形成背压。当网络需要的数据布局与计算布局不同时，可使用 GPU 暂存缓冲区（staging buffer）。[论文 §3.3](https://arxiv.org/html/2609.13585v1#S3.SS3)

在相同 CX7 kernel 的比较中，IBGDA 额外收益很小。论文解释是 proxy 提交能与计算重叠并批量化，而 IBGDA 每个 chunk 的 system-scoped GPU fence 和 doorbell 也有成本。小消息、强延迟敏感或 CPU proxy 受限时需要重新测量；proxy 路径本身仍使用 GPUDirect RDMA。[论文 §3.3，图 4](https://arxiv.org/html/2609.13585v1#S3.SS3)

## 7. readiness 的正确性决定能否安全提前消费

**生产完成、请求已提交、远端可安全消费，是三个不同的时刻。** 提前计算需要最后一种保证。

| 路径 | 何时发布到达通知 | 必要条件 |
|---|---|---|
| InfiniBand RC | 同连接先写 payload，再写 flag | 适用的写入顺序与 GPU 内存可见性 |
| EFA SRD 完成路径 | write with immediate；接收 proxy 在完成事件后发布 flag | 完成事件关联 payload，immediate 标识 chunk，正确处理 GPU 可见性 |
| 跨次 kernel 执行 | 使用带 epoch 的 ready／arrival flag | 区分本次与旧通知，配合 buffer 复用及在途请求生命周期 |

SRD 不保证独立 write 有序，因此这里的接收 proxy 根据完成事件发布到达通知。传输完成与 GPU 能看到完整数据也是两个条件；正确性要求检查从数据写入到下游读取的完整 happens-before 关系，涉及 fence、flag 与 epoch 的配合。这些保证让常驻 kernel 可以按局部数据就绪情况推进，减少逐 chunk 全局同步。[论文 §2.3、§3.3、§4](https://arxiv.org/html/2609.13585v1#S3.SS3)

## 8. 用到自己的 kernel 时怎么判断

先识别依赖方向：通信供给输入时，尽早传远端数据、先算已到达的 tile；计算产生输出时，尽早归约和发送已完成 tile。再检查下列限制。

1. **慢链路上的重复字节**：能否先在节点内归约或复制？
2. **最早数据被哪个边界挡住**：整次 collective、producer kernel、chunk，还是接收 readiness？
3. **payload 与控制提交哪个更慢**：前者看字节与带宽，后者看消息、batch、队列与 proxy。
4. **资源增配是否缩短关键路径**：同时计算 GEMM 变慢、网络饱和与尾部缩短的影响。
5. **重叠能否覆盖新增成本**：小 shape、短流水线、低算术强度及同步开销都可能限制收益。

这些是设计推导。论文主要验证五类分布式算子；完整模型训练、在线 serving 和更大集群的收益仍需独立验证。

## 资料与署名

- 论文：[mKernel v1，2026-09-11](https://arxiv.org/abs/2609.13585v1)，Ziming Mao、Yihan Zhang、Shawn Wei Chew、Shuang Ma、Costin Raiciu、Yang Zhou、Scott Shenker、Ion Stoica；[PDF](https://arxiv.org/pdf/2609.13585v1)。论文以 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 发布。本笔记为中文转述，图示重新绘制，教学模型与推导均另行标明。
- 作者材料：[博客](https://uccl-project.github.io/posts/mkernel/)、[官方源码](https://github.com/uccl-project/mKernel)。源码核对固定在 [31b6b0f](https://github.com/uccl-project/mKernel/tree/31b6b0f97e7bbc966fcb6179607131e76cae6f20)，论文结论以 v1 为准。
- 页面结构与图示指引参考 [vuepress-notes-template](https://github.com/0xkoa1a/vuepress-notes-template)。笔记整理于 2026-09-27，完成网站构建与页面检查，未复跑论文 GPU 实验。
