---
title: "实现核对与源码阅读入口"
order: 4
---

# 实现核对与源码阅读入口

本页核对 [uccl-project/mKernel](https://github.com/uccl-project/mKernel) 的公开实现，固定版本为 **31b6b0f97e7bbc966fcb6179607131e76cae6f20**，采集于 2026-09-27。固定链接避免后续源码变化使论文解释失去定位。

核对方式是阅读源码、参数和控制流程；没有编译或运行这些 CUDA／RDMA kernel。正文的实验数字仍取自[论文 v1](https://arxiv.org/abs/2609.13585v1)，不能把当前仓库当成论文实验的精确 artifact。

## 1. 从就绪发布追到远端消费

| 机制 | 固定版本入口 | 实际核对到的内容 |
|---|---|---|
| 48 字节命令 | [types.h](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/comm/internode/types.h#L14-L56) | `TransferCmd` 大小由 static assertion 约束；offset、长度、目的地、tile 标识等字段按 8 字节字组织 |
| 先写命令内容，再写命令头 | [d2h_fifo.cuh](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/comm/internode/d2h_fifo.cuh#L45-L95) | GPU 领取 ring slot，满队列时检查 tail；先写命令内容，再写命令头（header）以发布该命令 |
| Host 消费记录 | [d2h_fifo.cuh](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/comm/internode/d2h_fifo.cuh#L200-L229) | acquire 读取命令类型，复制记录，清空 slot 供复用 |
| CX7 批量提交 | [proxy.h](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/comm/internode/proxy.h#L806) | 最多 8 条命令；存在 partial batch；数据与通知使用对应 RDMA write |
| EFA 完成通知 | [proxy_efa.h](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/comm/internode/proxy_efa.h#L1-L19) | 默认 `write_imm` 路径处理接收完成后发布 mapped arrival flag；另有其他可选模式 |
| 完成事件处理 | [proxy_efa.h](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/comm/internode/proxy_efa.h#L1040-L1075) | 处理 `RECV_RDMA_WITH_IMM`，从 immediate 解出到达信息，再更新通知 |
| Epoch 到达状态 | [arrival.cuh](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/comm/internode/arrival.cuh) | flag 使用 epoch；包含不同分配与等待辅助函数 |

推荐按“计算结果发布 → chunk 计数 → D2H 命令 → proxy 提交 → 远端完成 → GPU 消费”顺序阅读。这样可以核对每一次放行的前提，而不只是看到某个 flag 就认定数据已经安全可用。

### Memory ordering 不能只看注释

当前 `d2h_fifo.cuh` 的顶部注释提到 system-scope store，但实际 push 路径调用的是 `release_store_gpu`；源码附近注释解释了这一优化选择。笔记只将其记录为**这个 commit 的实现事实**，不把它泛化为任意 CPU／GPU 映射内存上都充分的正确性证明。[对应实际调用](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/comm/internode/d2h_fifo.cuh#L75-L95)

同样，EFA 源码同时存在 `write_imm` 和 `remote_flag` 模式；论文表 2 明确讨论的是基于 completion 的 EFA 变体。不能因为仓库还有一条 data→flag 路径，就据此宣称 EFA 的独立 write 具有 IB RC 的顺序保证。

## 2. 算子代码中的具体对应

| 算子／机制 | 阅读入口 | 可核对的实现选择 |
|---|---|---|
| GEMM + AllReduce chunk | [gemm_ar.cuh](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/operators/gemm_ar/gemm_ar.cuh#L170-L186) | 默认 4 tiles、目标 256 KiB；可由参数覆盖；最后不足一个 chunk 时需处理边界 |
| AllReduce 状态交接 | [gemm_ar.cuh](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/operators/gemm_ar/gemm_ar.cuh#L251-L354) | 计算完成、本地归约完成、远端到达等计数和 ready queue；避免只用一个笼统完成位 |
| AllGather + GEMM | [ag_gemm.cuh](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/operators/ag_gemm/ag_gemm.cuh) | 原始融合路径与通信资源配置；同目录还有 warp-specialized 变体 |
| GEMM + ReduceScatter | [gemm_rs.cuh](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/operators/gemm_rs/gemm_rs.cuh) | GEMM 与输出归约／分片的调度实现 |
| MoE Dispatch + GEMM | [dispatch_gemm.cuh](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/operators/dispatch_gemm/dispatch_gemm.cuh#L73-L77) | `CHUNK_BYTES = 512 * 1024`，明确为 512 KiB |
| Ring Attention | [ring_attention.cuh](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/operators/ring_attention/ring_attention.cuh) | attention 与 KV 交换的融合路径 |
| 构建与环境 | [Makefile](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/Makefile)、[README](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/README.md) | CX7／EFA 后端选择、默认 Hopper 构建和依赖 |

这些入口支持“代码中存在对应组织”，不意味着本笔记已经验证每个分支的正确性、性能或硬件兼容性。

## 3. 当前源码与论文版本的差异

公开仓库持续开发。所核对 commit 的 README 和目录还包含 **MoE Dispatch + FFN + Combine**、Blackwell kernel 路径以及额外通信变体。论文 v1 的主表和评估覆盖的是[五类 kernel](./kernels.md)，因此本笔记没有把这些新增路径计入论文的五项算子贡献，也没有把 H200 实测倍率迁移给 Blackwell。

对于论文式 (2) 的 GPU 进度控制器，本次核对的主路径中没有定位到足以与论文实验一一对应的完整实现。`ag_gemm.cuh` 中按 $M$ 大小限制通信 SM 的 host 侧逻辑，以及 EFA proxy 的 adaptive batch／post-poll 控制，都不能仅凭“adaptive”命名当成论文的 **kernel 内 SM 角色控制器**。[AG GEMM 配置逻辑](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/operators/ag_gemm/ag_gemm.cuh#L400-L435)、[EFA proxy 控制状态](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/comm/internode/proxy_efa.h#L487-L499)

因此，本笔记将 SM 控制器的机制与实验标为**论文陈述**；队列、chunk 和 proxy 的路径标为**源码核对**。若要严格复现自适应结果，还需确定论文对应的实验版本、完整控制器及测试配置。

## 4. 进一步复现时应记录什么

读代码能核对控制流，性能复现还需要记录版本、GPU／NIC／拓扑、编译目标、网络后端、shape 与 dtype、通信 SM、chunk 大小和 warm-up／计时方法。两端 kernel 的数据正确性、慢 rank 时间和全部基线也应使用同一口径。

对具体优化归因，应分别比较是否启用分层通信、tile 就绪、batch 和 SM 动态调整，并检查改变开关是否同时改变了计算实现。否则，即使整体更快，也无法判断每项机制单独贡献多少。

现有运行入口可从 [bench/run.sh](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/bench/run.sh) 和各算子 benchmark 阅读；本次知识笔记交付只做网站与内容验证。
