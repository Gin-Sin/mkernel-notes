# mKernel 论文知识笔记

中文解读 [mKernel: Fast Multi-GPU, Multi-Node Fused Kernels](https://arxiv.org/abs/2609.13585v1)，逐项解释优化设计、motivation、收益机制、实现证据与性能边界。

- 在线阅读：https://Gin-Sin.github.io/mkernel-notes/
- [设计与收益原理](notes/index.md)
- [五类算子的依赖与调度](notes/kernels.md)
- [性能结果与适用边界](notes/evaluation.md)
- [固定版本源码核对](notes/implementation.md)

包含分层通信图、依赖图、公式和可交互 SM 资源分配示例。性能数字来自论文 v1，未在此仓库复跑 GPU benchmark。源码核对固定于 uccl-project/mKernel commit `31b6b0f97e7bbc966fcb6179607131e76cae6f20`。

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
