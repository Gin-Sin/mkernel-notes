---
title: "协同机制：把就绪、通信与资源接起来"
order: 2
---

# 协同机制：把就绪、通信与资源接起来

[主线案例](./index.md)已经减少了跨网字节，也把整次 GEMM 的等待缩小到局部数据。现在沿同一份输出继续检查：它可能已经算完，却还没凑齐一条网络消息；消息可能已提交，却还不能被对端读取；数据可能可读，却没有足够的 block 处理。下面按这几个等待点展开实现条件。主机代理（CPU proxy）负责提交请求，实际数据仍由 NIC 在 GPU 内存之间传输。

## 1. 什么时候能发：tile、chunk 与 batch

本地计算与搬运按 tile 推进，网络按 chunk（消息块）传输，proxy 则将多条命令组成一个提交 batch（批次）。一个 tile 完成不一定凑齐一个 chunk；批量提交也保留各 chunk 独立的数据传输与完成通知。图中**格子是 tile，外框是 chunk，小记录的分组是一次 proxy 提交**。

默认已有 7 个 tile 完成，每 4 个组成一条消息：1 个 chunk 可发，另有 3 个 tile 等待。保持完成数量不变，把 chunk 改成 1 tile，就会有 7 条消息可发；但传完整批 16 tiles 的消息数也从 4 条变为 16 条。提前放行与消息开销的取舍在同一张图里发生。

<ChunkReadiness />

AllReduce 用 chunk 内计数汇总 tile 进度，最后一个完成的 tile 发布 ready。proxy 最多把同连接的 8 条就绪命令一并提交，并允许不足 8 条的批次，避免尾部为了凑满 batch 而继续等待。[论文 §3.1、§3.3](https://arxiv.org/html/2609.13585v1#S3.SS3)

大 chunk 可以摊薄每条消息的固定成本，但会推迟首次传输；batch 则减少提交调用次数。接收端还要检查当前计算所需数据覆盖的全部 chunk，见 [token 跨边界图](./kernels.md#_1-2-moe-dispatch-gemm-token-到达即可参与专家计算)。

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

## 2. 谁来提交：GPU 产生命令，proxy 驱动 NIC

凑齐 chunk 后，还需要有人把请求交给 NIC。待传输数据（payload）保存在 GPU 内存中；发送 block 将传输命令写入页锁定主机内存。proxy 通过 libibverbs 提交请求，NIC 直接读取已注册的 GPU 缓冲区。切换下面的后端时，先看控制请求经过谁，再看 payload 经过谁：使用 CPU 提交并不意味着数据经过 CPU 复制。

<TransportPaths />

GPU 先写入 48 字节命令的内容，再写命令头以发布该命令。队列可用槽位（credit）与未完成请求数量的上限共同限制提交速度，形成背压。当网络需要的数据布局与计算布局不同时，可使用 GPU 暂存缓冲区（staging buffer）。[论文 §3.3](https://arxiv.org/html/2609.13585v1#S3.SS3)

在相同 CX7 kernel 的比较中，IBGDA 额外收益很小。论文解释是 proxy 提交能与计算重叠并批量化，而 IBGDA 每个 chunk 的 system-scoped GPU fence 和 doorbell 也有成本。小消息、强延迟敏感或 CPU proxy 受限时需要重新测量；proxy 路径本身仍使用 GPUDirect RDMA。[论文 §3.3，图 4](https://arxiv.org/html/2609.13585v1#S3.SS3)

## 3. 对端何时能用：到达通知与内存可见性

**生产完成、请求已提交、远端可安全消费，是三个不同的时刻。** 提前计算需要最后一种保证。

| 路径 | 何时发布到达通知 | 必要条件 |
|---|---|---|
| InfiniBand RC | 同连接先写 payload，再写 flag | 适用的写入顺序与 GPU 内存可见性 |
| EFA SRD 完成路径 | write with immediate；接收 proxy 在完成事件后发布 flag | 完成事件关联 payload，immediate 标识 chunk，正确处理 GPU 可见性 |
| 跨次 kernel 执行 | 使用带 epoch 的 ready／arrival flag | 区分本次与旧通知，配合 buffer 复用及在途请求生命周期 |

SRD 不保证独立 write 有序，因此这里的接收 proxy 根据完成事件发布到达通知。传输完成与 GPU 能看到完整数据也是两个条件；正确性要求检查从数据写入到下游读取的完整 happens-before 关系，涉及 fence、flag 与 epoch 的配合。这些保证让常驻 kernel 可以按局部数据就绪情况推进，减少逐 chunk 全局同步。[论文 §2.3、§3.3、§4](https://arxiv.org/html/2609.13585v1#S3.SS3)

数据已经可用，还需要有 block 处理它。下一节把注意力从数据条件转到执行资源。

## 4. 谁来推进：SM 分工与资源取舍

mKernel 将计算和通信交给不同的 thread block。计算 block 执行 GEMM 时，通信 block 可以检查数据就绪状态、搬运节点内数据并推进网络请求。调整两类 block 的数量，就能改变资源分配，同时保留计算 block 原有的 warp 布局。论文中的 SM 分工通过 block 角色实现：固定配置按 block 索引分配角色，自适应模式允许在任务边界切换。[论文 §3.2](https://arxiv.org/html/2609.13585v1#S3.SS2)

从资源取舍看，这种分工适合**通信需要持续推进，同时还有独立计算可做**的场景。通信 block 太少会阻塞输入或积累输出尾部，太多会挤占 GEMM。收益成立需要减少的等待足以抵消计算资源减少和同步带来的成本；当 NIC 已经饱和时，继续增加通信资源可能只会拖慢 GEMM。这是结合[论文资源模型](https://arxiv.org/html/2609.13585v1#S2.SS2)得到的适用条件。

下图先显示通信尾部：计算所剩很少，固定分配可能让计算 block 先闲下来。再切到“8 个通信 block 后饱和”，将手动通信分配从 8 拉到 24。在这个假设场景中，通信时间不变，计算时间却从 3.125 增到 9.375，完成时间由计算拖长。**分工有用的前提，是被释放的等待大于新增的计算损失。**

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

## 5. 把机制用到自己的算子

先识别依赖方向：通信供给输入时，尽早传远端数据、先算已到达的 tile；计算产生输出时，尽早归约和发送已完成 tile。再检查下列限制。

1. **慢链路上的重复字节**：能否先在节点内归约或复制？
2. **最早数据被哪个边界挡住**：整次 collective、producer kernel、chunk，还是接收 readiness？
3. **payload 与控制提交哪个更慢**：前者看字节与带宽，后者看消息、batch、队列与 proxy。
4. **资源增配是否缩短关键路径**：同时计算 GEMM 变慢、网络饱和与尾部缩短的影响。
5. **重叠能否覆盖新增成本**：小 shape、短流水线、低算术强度及同步开销都可能限制收益。

这些是设计推导。论文主要验证五类分布式算子；完整模型训练、在线 serving 和更大集群的收益仍需独立验证。

现在已经知道该检查哪些等待点。下一页保持 AllReduce 案例不变，在[源码导读](./code-walkthrough.md)中把它们对应到具体计数器、缓冲区与分支；随后再将这套判断用到其他算子。
