---
title: "源码导读：跟踪一个 AllReduce chunk"
order: 4
---

# 源码导读：跟踪一个 AllReduce chunk

前面解释了 mKernel 的设计。本页回到[主线中的 GEMM + AllReduce](./index.md)，跟踪一组数据从计算完成、节点内归约，到发送、接收和最终发布。读完应能回答：**数据在哪个缓冲区、谁在处理它、下一个阶段具体等哪个条件。**

依据本地仓库 `/kl_infra_infer_alg/xianjianwen/mKernel` 的固定版本 [31b6b0f](https://github.com/uccl-project/mKernel/tree/31b6b0f97e7bbc966fcb6179607131e76cae6f20)。下面核对的是源码控制流，未运行 CUDA／RDMA 实验；该版本持续演进后的实现选择，与论文 v1 的机制说明分别标注。

## 1. 跟踪一组输出的完整旅程

本页选 **Hopper GEMM + AllReduce、两节点、每节点 8 GPU、host proxy** 路径。示例取输出 **M = 4096、N = 2048**，使用默认 4-tile chunk，不启用专门的接收进度 block 或提前远端累加。每个 GPU 负责 512 行，包含 4 个行块、每行块 2 个 chunk，共 8 个 chunk，因此会进入小规模静态归属的最终归约分支。这个形状用于沿代码计算索引，不是新增性能测量。

追踪节点 0 的 GPU 2 所负责的第一个 chunk：输出行 **1024–1151**、列 **0–1023**。每个逻辑输出 tile 为 128 × 256 个 BF16 元素，即 64 KiB；四个相邻列 tile 组成 256 KiB 的完整 chunk。每个节点先归约这组输出的 8 份贡献，再由两个节点的 GPU 2 交换部分和。[尺寸与 chunk 默认值](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/operators/gemm_ar/gemm_ar.cuh#L170-L211)

<AllReduceChunkTrace />

图中有三个不同的交接点：**本节点所有 GPU 算完这个 chunk、owner 完成本地归约、远端部分和可用**。切换“本地先好／远端先到”，可看到任意一份部分和单独就绪时，最终归约都要等待；两份到齐后，才具备执行条件。右侧按列对齐同一个 tile 的 L、R 与最终结果。下面按这些交接点进入代码。

<details>
<summary>把图中的范围对应到源码索引</summary>

每节点 8 张 GPU 将 M 轴等分；GPU 2 的起始行为 2 × 512 = 1024。一个行块有 128 行，所以对应全局 `row_idx = 8`，owner 内部 `rb_in_slice = 0`。N = 2048 对应 8 个列 tile，每 4 个组成一个 chunk。

| 标识 | 示例值 | 为什么不同 |
|---|---|---|
| 计算端 `flat_chunk` | 8 × 2 + 0 = **16** | 计算覆盖整个输出矩阵，按全局行块编号 |
| owner 的 `chunk_id` | 0 × 2 + 0 = **0** | 归约只负责该 GPU 的行切片，按切片内部编号 |
| 发送的 `pack_first_tile` | 0 × 8 + 0 = **0** | staging 按 owner 内部的 tile 顺序存放 |

它们指向同一组输出，编号所属的范围不同。对应计算端的[索引与信号](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/src/gemm_ar.cu#L140-L153)、归约端的[切片索引](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/src/gemm_ar.cu#L359-L371)及发送端的[打包偏移](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/src/gemm_ar.cu#L507-L534)。

</details>

## 2. 从图中的阶段找到代码入口

源码可以从 [`fused_kernel`](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/src/gemm_ar.cu#L1344-L1358) 进入。它按 block 索引连续划分初始角色；该文件的函数名虽然带 `_sm`，实际分支条件使用的是 `blockIdx.x`。

| 角色 | 当前路径做什么 | 函数入口 |
|---|---|---|
| 计算 | 产生各个输出 tile，并发布 chunk 的本地计算完成信号 | `fused_comp_sm` |
| 节点内归约 | 读取本节点 8 份贡献，得到本节点部分和 | `fused_intra_ar_sm` |
| 跨节点发送 | 等待本地部分和就绪，将传输命令推入 FIFO | `fused_inter_send_sm` |
| 接收与最终归约 | 处理到达记录，等待两份部分和，写入最终结果 | `fused_inter_reduce_and_publish_sm` |

每张 GPU 的主 kernel 固定启动 132 个 block；各角色数量由 host 侧 [`gemm_ar_compute_role_split`](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/operators/gemm_ar/gemm_ar.cuh#L1060-L1099) 计算。若显式配置接收进度 block，dispatcher 还会分出 `fused_inter_recv_progress_sm`；本页选择的路径由归约 block 同时处理接收进度。[配置与启动](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/src/gemm_ar.cu#L1410-L1418)

## 3. 两次局部完成：先等贡献，再等归约

计算 block 将输出写入本 GPU 的 `C`，并对 `comp_chunk_tiles_done` 计数。一个 chunk 的最后一个 tile 完成后，该 GPU 才向负责该输出切片的 owner 发出信号。节点内归约 block 等待 **8 张 GPU 对这个 chunk 都发出信号**，然后逐 tile 执行 NVSwitch 归约。[计算端发布](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/src/gemm_ar.cu#L123-L154)、[归约端等待](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/src/gemm_ar.cu#L352-L395)

这说明当前路径虽然按 tile 计算，**节点内归约的放行信号也已按 chunk 合并**。它减少了就绪通知的频率，代价是同一 chunk 中先完成的 tile 需要等齐其他 tile。主线时间图中的最细 tile 放行用于解释原理，具体实现的边界应以这里的条件为准。

归约函数 `gemm_ar_pipelined_rs_tile` 将同一个本地部分和同时写到两处：`C_local` 保留输出矩阵布局，`staging_buf` 将各 tile 连续存放，供 NIC 读取。当前 sender 直接使用 staging 的偏移提交命令；这条路径在归约时已经写好了发送布局。[归约中的两次写入](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/src/gemm_ar.cu#L282-L345)

每完成一个归约 tile，`intra_chunk_tiles_done` 加一。最后一个 tile 完成后，owner 发布 `local_done_flag`，发送 block 才能提交这个 chunk。由此区分了“8 份输入已到齐”和“这 8 份输入的和已经写好”。[本地归约完成发布](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/src/gemm_ar.cu#L397-L425)

## 4. 从 GPU 缓冲区到 48 字节控制命令

发送 block 等待 `local_done_flag`，再填入 `TransferCmd` 的目标、位置和长度。当前代码的 `kCoalesceK` 为 1，因此一次命令对应一个 chunk；完整 chunk 的 `bytes` 为 256 KiB，`src_view = 0` 选择 staging，`row_count` 在此调用中携带 **4 个 tile** 的到达范围。行末不足 4 个 tile 时，长度按实际数量计算。[等待与命令构造](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/src/gemm_ar.cu#L466-L566)

`gemm_ar_post_send_cmd` 将命令路由到对应的 D2H FIFO。GPU 在 FIFO 中申请槽位，写入后 40 字节，最后发布包含 `cmd_type` 的前 8 字节；CPU 的 `poll` 先检查类型，再复制完整记录。[FIFO 路由](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/operators/gemm_ar/gemm_ar.cuh#L380-L391)、[GPU push](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/comm/internode/d2h_fifo.cuh#L56-L97)、[CPU poll](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/comm/internode/d2h_fifo.cuh#L204-L227)

<CommandPublication />

命令头承担“这条记录已发布”的标志，内容中保存数据位置与长度。CPU 复制命令后清空槽位的类型字段；proxy 还会推进 tail 归还队列额度。**命令被取走只表示控制记录交给了 proxy，远端数据是否可用仍由完成通知决定。** CX7 proxy 可将最多 8 条同 QP 的命令链接到一次 `ibv_post_send`，并处理完成队列与背压。[proxy 提交循环](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/comm/internode/proxy.h#L806-L817)、[tail 推进](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/comm/internode/proxy.h#L1207-L1209)

源码中的 `push` 实际调用 `release_store_gpu`，CPU 侧使用 acquire 读取。这是固定版本的实现选择；该发布顺序图不构成对任意 CPU／GPU 映射内存的正确性证明。内存排序与 EFA 变体的核对边界见[源码索引](./implementation.md#memory-ordering-不能只看注释)。

## 5. 远端到了，还要与本地部分和汇合

接收端读到 arrival queue 中的有效记录后，解出起始 tile 和覆盖数量，更新该 chunk 的远端节点位图。所需远端贡献齐备后，才发布 `remote_arrived_flag`。两节点例子只需等待一个远端节点；多节点路径会等待相应 peer 集合。[到达记录解码与发布](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/operators/gemm_ar/gemm_ar.cuh#L687-L739)

小规模静态归约分支同时检查 **`local_done_flag == 1` 与 `remote_arrived_flag != 0`**。满足后读取 `C_local` 和 `C_recv`，求和并通过组播写入 `C_final`。本地先完成、远端先完成都可以；只看命令入队数或只看一个 flag，都不足以判断最终结果可用。[两个完成条件与最终发布](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/src/gemm_ar.cu#L1124-L1180)

这里的 arrival queue 记录携带工作范围；跨次执行还需重置通知状态并协调下一轮。当前路径把 arrival flag 重置安排在迭代末屏障之前，防止本轮清理覆盖已提前到达的下一轮通知。[迭代边界处理](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/src/gemm_ar.cu#L1359-L1376)

## 6. 带着这条路径看其他分支

同一仓库中的分支选择会改变谁处理接收、谁领取归约任务，以及是否需要额外收尾 kernel。先明确条件，再解释作用，可以避免把某个 helper 或注释当成所有配置都执行的路径。

| 条件 | 固定版本实际选择 | 阅读含义 |
|---|---|---|
| 未启用专门接收队列，owner 总 chunk 数 ≤ 64 | 静态分配最终归约任务 | 本页 8-chunk 示例走此分支；其他角色结束后调用共享归约入口，也会按身份检查直接返回 |
| 未启用专门接收队列，总 chunk 数 ≥ 512 | 工作窃取归约 | 用另一种任务分配方式处理到达顺序和负载差异 |
| 接收进度 block 数 > 0，且 ready queue 开关非零 | 分支支持接收进度与归约消费分离 | 当前 host 初始化将该开关设为 0；存在分支不代表默认启用 |
| owner 总 chunk 数 > 16 | 主 kernel 后另启动 epilogue | 当前实现的整次调用可能包含额外收尾 launch |

分支依据分别是 [`shared_reduce_my_slice`](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/src/gemm_ar.cu#L1198-L1240)、[静态分支的角色检查](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/src/gemm_ar.cu#L1042-L1057)和 [host 的 epilogue 选择](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/operators/gemm_ar/gemm_ar.cuh#L1458-L1478)。中间规模和可选配置需按对应分支继续阅读；ready queue 的初始值见 [make_globals](https://github.com/uccl-project/mKernel/blob/31b6b0f97e7bbc966fcb6179607131e76cae6f20/include/operators/gemm_ar/gemm_ar.cuh#L1317)。

dispatcher 在计算、节点内归约和发送角色结束后，也调用共享归约入口，但本页的静态归属分支会让这些 block 直接返回；工作窃取分支也限制为专门的归约 block。仅看到共享函数调用，还不足以认定它们实际接管了通信工作，更不足以对应论文式 (2) 的进度／成本控制器。源码能确认本页的数据和状态交接；实际耗时改善仍应回到[性能证据](./evaluation.md)，并使用匹配版本与配置的实验检验。
