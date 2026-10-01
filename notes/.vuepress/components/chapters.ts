export const chapters = [
  { id: "01", path: "/", label: "建立主线", title: "从一次 AllReduce 出发", detail: "先少传，再早传：看懂优化如何配合。", tag: "THE IDEA" },
  { id: "02", path: "/mechanisms.html", label: "协同机制", title: "让流水线持续推进", detail: "粒度、通知与 SM 分工的取舍。", tag: "THE MECHANISM" },
  { id: "03", path: "/code-walkthrough.html", label: "源码导读", title: "跟着同一块数据读代码", detail: "把前两章的就绪条件落实到缓冲区与 flag。", tag: "THE CODE" },
  { id: "04", path: "/kernels.html", label: "五类算子", title: "依赖变了，调度如何变", detail: "用 AllReduce 的判断方法理解输入收集与 KV 交换。", tag: "THE PATTERNS" },
  { id: "05", path: "/evaluation.html", label: "性能与边界", title: "收益在什么条件下成立", detail: "核对测试床、基线与性能口径。", tag: "THE EVIDENCE" },
  { id: "06", path: "/implementation.html", label: "源码索引", title: "回到实现，核对证据", detail: "定位论文机制对应的源码入口。", tag: "THE SOURCES" },
] as const
