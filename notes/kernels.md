---
title: "五类算子的依赖与调度"
order: 2
---

# 五类算子的依赖与调度

五类 kernel 复用同一组通信机制，但决定调度顺序的是**数据依赖方向**。通信供给输入时，先启动远端传输，再算已就绪数据；计算产生输出时，局部结果一旦完成就进入归约／发送；Ring Attention 则在一步内重叠当前 KV 的计算与向下游的传递。

本页以[论文 §4，表 3](https://arxiv.org/html/2609.13585v1#S4)为准。TP 为张量并行，EP 为专家并行，SP 为序列并行。

## 路径总览

<details>
<summary>五类算子的路径与粒度对照</summary>

| 算子 | 依赖 | 节点内路径 | 跨节点路径 | 论文列出的粒度 |
|---|---|---|---|---|
| AllGather + GEMM（TP） | 通信 → 计算 | shard multicast broadcast | 每个 shard 向目标节点发送一次；超过两节点时 ring forwarding | 128 行 |
| GEMM + ReduceScatter（TP） | 计算 → 通信 | TMA atomic add 到 owner buffer | 交换各节点部分和 | 2–32 个 tile |
| GEMM + AllReduce（TP） | 计算 → 通信 | NVSwitch 归约，结果 multicast | 每 GPU 交换输出的 1/8 | 4 个 tile，256 KiB |
| MoE Dispatch + GEMM（EP） | 通信 → 计算 | TMA 从 peer 拉取 token | token buffer 传到 rail peer | 表中列 16 tokens；512 KB，正文网络单位为 512 KiB |
| Ring Attention（SP） | 每一步内可独立推进 | TMA 将 KV 写到下一张 GPU | KV slice 向目标节点发送一次 | 128 行 KV tile |

这些参数属于论文实现的实例，不能当作所有 GPU 和 shape 的最优值。Dispatch 的 token 粒度与网络 chunk 大小是两种粒度，不能把“16 tokens”和“512 KiB”当成普遍等价关系。

</details>

## 1. AllGather + GEMM：优先处理可用输入

每个 rank 持有激活矩阵 $A$ 的一个 shard。GEMM 需要完整 $A$，但不需要等所有行到齐后才开始计算已经具备输入的输出行块。

mKernel 在 kernel 启动时就向 rail peer 提交输入 shard 的网络传输，同时处理本 GPU 的 shard。接着计算本节点其他 GPU 通过 NVLink 提供的 shard，最后消费远端 shard。接收 rail peer 在节点内广播数据，避免同一远端 shard 为节点内多个 GPU 重复跨网。

**Motivation：** AllGather 的整体完成条件比单个 GEMM tile 的输入条件更强，会引入多余等待。远端数据最慢，应最早传输；本地数据最快，应先提供有效计算。

**收益原理：** 本地 shard 的 GEMM 覆盖远端传输的一部分延迟，到达检查将等待范围缩小到当前工作需要的输入。实际可覆盖多少取决于本地可算工作量和远端传输速度。[论文 §3.1、§4、§5.2](https://arxiv.org/html/2609.13585v1#S5.SS2)

## 2. GEMM + AllReduce：归约、交换与广播持续推进

TP 中多个 rank 计算同一输出的不同部分贡献，AllReduce 要把所有贡献求和并将完整结果交给每个 rank。[设计页的分层流程](./index.md#_3-分层通信-把重复操作留在节点内)解释了 owner 与 rail peer 的关系。

从一个 tile 看，依赖依次是：GEMM 产出本地贡献 → NVSwitch 聚合节点内贡献 → 所属 chunk 就绪 → 交换远端部分和 → 本地与远端相加 → 广播最终结果。不同 tile 可以处于不同阶段。

**Motivation：** 完整 GEMM 之后再执行 AllReduce，会让归约及网络时间全部落在尾部；每 GPU 都直接跨节点发送完整局部输出又会制造重复流量。

**收益原理：** 分层归约减少跨网字节，细粒度就绪让归约从 GEMM 的早期输出开始，自适应模式还可以把计算结束后的资源转去清理通信尾部。最后一点的实验支持仅来自单节点。[论文 §3.1、§4、§5.5](https://arxiv.org/html/2609.13585v1#S5.SS5)

## 3. GEMM + ReduceScatter：按最终 owner 推进

ReduceScatter 同样对局部贡献求和，但每个 rank 只保留最终输出的一部分。mKernel 的节点内路径通过 TMA atomic add 把贡献加入 owner 的 buffer，节点间交换相应部分和。最终输出按 rank 分片，因此不需要 AllReduce 那样让每个 rank 持有完整结果。[论文 §4，表 3](https://arxiv.org/html/2609.13585v1#S4)

**Motivation：** 计算和归约之间仍有整块输出等待；同时，最终分片归属提供了确定的通信目的地。

**收益原理：** 一个 tile 产生后就能推进向 owner 的归约，重叠后续 GEMM。它仍受归约开销、原子更新、SM 分配和填充／排空影响。论文主要在大问题上观察到收益，$M\ge16\mathrm{K}$ 时给出 1.02–1.27×，不能外推为所有小 shape 都更快。[论文 §5.2](https://arxiv.org/html/2609.13585v1#S5.SS2)

## 4. MoE Dispatch + GEMM：token 到达即可参与专家计算

Dispatch 把 token 送往负责相应专家的 rank，然后执行专家 GEMM。节点内通过 TMA 拉取 peer token，跨节点先把 token buffer 传到 rail peer。计算按照就绪情况消费输入，不等待整次 dispatch 全部结束。

同一个 token 可能跨越两个网络 chunk。切换到达状态，观察完整 token 何时可读。

<TokenBoundary />

**Motivation：** 等完整 all-to-all 会延后所有专家计算，专家间的就绪时间差也难以利用。较小 token 若逐条提交网络请求，又会放大网络控制成本。

**收益原理：** 网络按较大 chunk 摊薄提交成本，计算按 token／tile 就绪推进，并结合 grouped expert computation。论文 EFA 的 3.1–4.5× 相对基线同时包含专家 GEMM 组织方式的差异，不能全部归因于通信重叠。[论文 §3.1、§5.3](https://arxiv.org/html/2609.13585v1#S5.SS3)

## 5. Ring Attention：计算当前 KV，同时推进后续可用性

<AttentionRing />

序列并行把序列分片到多张 GPU。本地 Q 需要依次与各 KV 分片交互。mKernel 在启动时把本地 KV slice 的跨节点传输尽早发出；节点内通过 TMA 向下一 GPU 传 KV。每一步中，对当前可用 KV 的 attention 计算与 KV 传递可以重叠，下一步仍需等待所需数据真正到达。[论文 §4、表 3](https://arxiv.org/html/2609.13585v1#S4)

**Motivation：** 每一步先通信再计算会累积等待；跨节点传输比本地转移更慢，应提前进入流水线。

**收益原理：** 让 attention 计算覆盖 KV 交换延迟，细化接收就绪依赖，减少外部 collective 边界。短序列每步计算较少，通信更难被摊薄，论文中相对收益通常更大。[论文 §5.4](https://arxiv.org/html/2609.13585v1#S5.SS4)

这不意味着 attention 的数学计算量被降低；主要变化是相同计算与数据移动的调度关系。与 MagiAttention 等系统的倍率也只对应论文选取的实现、shape 和配置，具体范围见[性能页](./evaluation.md)。

## 共同机制与算子特有选择

Tile readiness、网络 chunk、proxy 提交和 transport completion 是共同机制。不同算子的变化集中在数据所有权、输入可用顺序、局部归约／复制方式，以及哪一种剩余工作会造成尾部。

因此，迁移设计时先画依赖图，再决定通信粒度和资源分配；直接复用另一个算子的 SM 比例或 chunk 数，无法保证原有收益成立。源码中对应的实现位置见[实现核对](./implementation.md)。
