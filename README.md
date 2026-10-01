# mKernel 论文知识笔记

中文解读 [mKernel: Fast Multi-GPU, Multi-Node Fused Kernels](https://arxiv.org/abs/2609.13585v1)，逐项解释优化设计、motivation、收益机制、实现证据与性能边界。

- 在线阅读：https://Gin-Sin.github.io/mkernel-notes/
- [主线：从一次 AllReduce 理解 mKernel](notes/index.md)
- [协同机制：把就绪、通信与资源接起来](notes/mechanisms.md)
- [五类算子：按依赖方向选择调度](notes/kernels.md)
- [源码导读：跟踪一个 AllReduce chunk](notes/code-walkthrough.md)
- [性能结果与适用边界](notes/evaluation.md)
- [源码索引与复现边界](notes/implementation.md)

按“完整案例 → 协同机制 → 算子差异 → 源码追踪 → 性能证据”阅读。11 张示意图分别呈现时间重叠、数据归属、矩阵分块、粒度衔接、资源分配、通信路径、token 边界、KV 交换、性能结果，以及新增的 AllReduce 缓冲区／就绪状态与 48 字节命令发布。配图区分论文数据与教学示意，精确参数与推导可按需展开。性能数字来自论文 v1，未在此仓库复跑 GPU benchmark。源码核对固定于 uccl-project/mKernel commit `31b6b0f97e7bbc966fcb6179607131e76cae6f20`。

[配图参考与本轮审阅](reviews/visual-reference-review-2026-09-29.md)记录了 CUTLASS、PagedAttention、FlashAttention-2、OSTEP 与 C4 的参考图，以及 11 张图的保留依据、修改和验证。

[网站设计与体验自检](reviews/site-design-review-2026-10-01.md)记录了研究刊物布局、原创首页交互、八项设计检查与响应式验证。

## 本地使用

基于 [vuepress-notes-template](https://github.com/0xkoa1a/vuepress-notes-template)，保留其搜索、KaTeX、Mermaid、暗色模式、文章目录和单页导出能力。需要 Node 22.18.0、pnpm 11.19.0。

```bash
pnpm install --frozen-lockfile
make preview
```

验证与构建：

```bash
make check
pnpm run typecheck
pnpm test
pnpm run docs:build
pnpm run export:smoke
git diff --check
```

首次运行浏览器回归前安装 Chromium：`pnpm exec playwright install --with-deps --no-shell chromium`。单页导出示例：`make export PAGE=index.md`。验证后使用 `make clean` 清理 `_site` 与 VuePress 缓存。

## 发布

推送 `main` 后 GitHub Actions 执行内容、类型、单元测试、构建及离线导出回归，再发布到 GitHub Pages。Pages Source 为 GitHub Actions；项目 base 根据 `GITHUB_REPOSITORY` 自动生成。

## 来源与署名

论文作者：Ziming Mao、Yihan Zhang、Shawn Wei Chew、Shuang Ma、Costin Raiciu、Yang Zhou、Scott Shenker、Ion Stoica。论文以 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 发布；本仓库为中文转述，图示重新绘制，推导和示例明确标注。官方实现采用 MIT 许可，本仓库通过固定版本链接引用实现，没有复制 CUDA 实现源码。

用户提供的模板路径写作 `vuepass-template`；实际使用本地 `vuepress-notes-template`。模板自带的写作指引、构建与测试设施予以保留。
