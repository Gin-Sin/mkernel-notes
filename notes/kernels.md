---
title: "五类算子：按依赖方向选择调度"
order: 3
---

# 五类算子：按依赖方向选择调度

同一组[就绪、通信与资源机制](./mechanisms.md)，会因数据依赖方向而形成不同调度。先判断通信提供的是输入、搬走的是输出，还是与本轮计算读取同一份数据，再看各算子的实现差异。

| 依赖方向 | 对应算子 | 最先启动什么 | 下一步等待什么 |
|---|---|---|---|
| 通信供给输入 | AllGather + GEMM、MoE Dispatch + GEMM | 远端传输与本地已就绪计算 | 当前输出所需的输入 |
| 计算产生待归约输出 | GEMM + AllReduce、GEMM + ReduceScatter | 已完成输出的局部归约 | 同组贡献和远端部分和 |
| 本轮计算与传递可并行 | Ring Attention | 读取当前 KV 的计算与传输 | 下一轮需要的 KV |

本页依据[论文 §4，表 3](https://arxiv.org/html/2609.13585v1#S4)。TP 为张量并行，EP 为专家并行，SP 为序列并行。

## 1. 输入通信：先传远端，先算本地

### 1.1 AllGather + GEMM：优先处理可用输入

每个 rank 持有激活矩阵 $A$ 的一个分片（shard）。计算完整输出需要用到 $A$ 的全部行，而每个输出行块只依赖对应的 $A$ 行和本地 $B$，因此可以在所需输入到齐后开始计算。

<GatherGemmLayout />

图中 A 与 C 沿 M 轴对齐，B 与 C 沿本 rank 的输出列轴 $N_l$ 对齐。分块图据[论文 §3.1、§4](https://arxiv.org/html/2609.13585v1#S4)重新绘制，四段行与到达阶段用于教学。

mKernel 在 kernel 启动时就向 rail peer 提交输入 shard 的网络传输，同时处理本 GPU 的 shard。接着计算本节点其他 GPU 通过 NVLink 提供的 shard，最后消费远端 shard。接收 rail peer 在节点内广播数据，避免同一远端 shard 为节点内多个 GPU 重复跨网。

**Motivation：** 等待完整 AllGather 会让已经具备输入的 GEMM tile 一起等待。远端传输耗时更长，应尽早启动；同时先计算本地已就绪分片，为远端传输留出重叠时间。

**收益原理：** 本地 shard 的 GEMM 覆盖远端传输的一部分延迟，到达检查将等待范围缩小到当前工作需要的输入。实际可覆盖多少取决于本地可算工作量和远端传输速度。[论文 §3.1、§4、§5.2](https://arxiv.org/html/2609.13585v1#S5.SS2)

### 1.2 MoE Dispatch + GEMM：token 到达即可参与专家计算

与 AllGather 的规则行分片相比，MoE 输入按专家路由；计算是否能开始，要检查某个 token 的完整字节范围。

Dispatch 把 token 送往负责相应专家的 rank，然后执行专家 GEMM。节点内通过 TMA 拉取 peer token，跨节点先把 token buffer 传到 rail peer。计算按照就绪情况消费输入，不等待整次 dispatch 全部结束。

同一个 token 可能跨越两个网络 chunk。切换到达状态，观察完整 token 何时可读。

<TokenBoundary />

**Motivation：** 等完整 all-to-all 会延后所有专家计算，专家间的就绪时间差也难以利用。较小 token 若逐条提交网络请求，又会放大网络控制成本。

**收益原理：** 网络按较大 chunk 摊薄提交成本，计算按 token／tile 就绪推进，并结合 grouped expert computation。论文 EFA 的 3.1–4.5× 相对基线同时包含专家 GEMM 组织方式的差异，不能全部归因于通信重叠。[论文 §3.1、§5.3](https://arxiv.org/html/2609.13585v1#S5.SS3)

## 2. 输出通信：边产生结果，边归约

这两类算子都把多个 rank 的局部贡献相加，区别在于最终结果归谁。AllReduce 让每个 rank 获得完整结果，ReduceScatter 让各 rank 只保留自己的分片。

### 2.1 GEMM + AllReduce：最终结果复制到每个 rank

[主线案例](./index.md)已展示节点内归约、rail peer 交换和最终广播。这里的调度重点是：第一批局部结果完成后就能开始归约，后续 GEMM 与前面数据块的通信继续重叠。仍需分别检查本地归约完成和远端部分和到达，才能发布最终结果。

**Motivation 与收益：** 完整 GEMM 之后再执行 AllReduce，会让通信全部落在计算尾部。分层归约减少跨网数据量，局部就绪提前启动归约；计算结束后的资源能否继续帮助通信，则取决于采用的分配与调度策略。[论文 §3.1、§4](https://arxiv.org/html/2609.13585v1#S4)

### 2.2 GEMM + ReduceScatter：最终输出按 rank 分片

ReduceScatter 同样对局部贡献求和，但每个 rank 只保留最终输出的一部分。mKernel 的节点内路径通过 TMA atomic add 把贡献加入 owner 的 buffer，节点间交换相应部分和。最终输出按 rank 分片，因此不需要 AllReduce 那样让每个 rank 持有完整结果。[论文 §4，表 3](https://arxiv.org/html/2609.13585v1#S4)

**Motivation：** 计算和归约之间仍有整块输出等待；同时，最终分片归属提供了确定的通信目的地。

**收益原理：** 一个 tile 的局部贡献完成后，即可参与对应 owner 上的归约，与后续 GEMM 重叠。实际收益仍受归约开销、原子更新、SM 分配和填充／排空影响。论文主要在大问题上观察到收益，$M\ge16\mathrm{K}$ 时给出 1.02–1.27×，不能外推为所有小 shape 都更快。[论文 §5.2](https://arxiv.org/html/2609.13585v1#S5.SS2)

## 3. Ring Attention：计算当前 KV，同时传给下一张 GPU

<AttentionRing />

序列并行把序列分片到多张 GPU，本地 Q 需要依次与各 KV 分片交互。mKernel 在启动时尽早发出本地 KV 分片的跨节点传输；节点内通过 TMA 向下一张 GPU 传递 KV。[论文 §4、表 3](https://arxiv.org/html/2609.13585v1#S4)

**Motivation：** 每一步先通信再计算会累积等待；跨节点传输比本地转移更慢，应提前进入流水线。

**收益原理：** 同一份 KV 可同时供当前 attention 计算和向下一张 GPU 的传输使用，从而让两项工作重叠。接收端按所需数据检查就绪状态，减少等待完整 collective 的限制；下一轮仍需等待对应 KV 到达。attention 的数学计算量保持不变，改变的是计算与数据移动的调度关系。

论文在所测配置中观察到，短序列相对基线的收益通常更大，并将这一趋势联系到通信开销更难被计算摊薄。这里比较的是相对基线的总耗时改善，重叠窗口本身仍受每步计算量限制。与 MagiAttention 等系统的倍率范围和比较条件见[性能页](./evaluation.md)。[论文 §5.4](https://arxiv.org/html/2609.13585v1#S5.SS4)

## 4. 具体粒度与阅读入口

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

这三类依赖解释了为什么同一套机制不能照搬固定的 chunk 大小或 SM 比例。下一页[跟踪一个 AllReduce chunk](./code-walkthrough.md)，把输出归约这条路径落实到当前仓库中的具体代码；其他算子的入口集中在[源码索引](./implementation.md)。
