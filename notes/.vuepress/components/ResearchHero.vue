<script setup lang="ts">
import { ref } from "vue"
import { RouteLink } from "vuepress/client"
import { chapters } from "./chapters"

const stage = ref(1)
const stages = [
  { label: "计算", name: "GEMM", color: "var(--diagram-primary)", description: "GEMM 逐块产出每张 GPU 的局部贡献。", block: "局部贡献", mark: "C" },
  { label: "节点内归约", name: "NVLINK", color: "var(--diagram-success)", description: "同一输出块的贡献先在节点内汇合，形成部分和。", block: "节点内部分和", mark: "L" },
  { label: "跨节点交换", name: "NETWORK", color: "var(--diagram-warning)", description: "就绪的部分和进入网络，与另一节点交换。", block: "交换部分和", mark: "L ↔ R" },
] as const
</script>

<template>
  <section class="research-hero site-container" aria-label="mKernel：计算与通信的协同设计">
    <div class="hero-topline"><span><i /> GPU SYSTEMS / FIELD NOTES</span><span>论文 v1 · 源码 31b6b0f</span></div>
    <div class="hero-composition">
      <div class="hero-copy">
        <p class="hero-wordmark" aria-label="mKernel">mKernel<span>.</span></p>
        <p class="hero-thesis">少传数据，<br>少等整批完成。</p>
        <p class="hero-description">一块输出已经算完，为什么还不能发？<br>沿一次 AllReduce 追踪数据与等待，<br>理解 mKernel 的设计、实现与收益边界。</p>
        <a href="#content" class="hero-cta">开始阅读 <span aria-hidden="true">↘</span></a>
        <a class="hero-paper" href="https://arxiv.org/abs/2609.13585v1">阅读原论文 ↗</a>
      </div>
      <div class="hero-experiment" :style="{ '--stage-color': stages[stage].color }">
        <div class="experiment-caption"><span>01 / 数据就绪，下一阶段接手</span><span class="experiment-plus" aria-hidden="true">+</span></div>
        <svg class="pipeline-sculpture" viewBox="0 0 540 390" role="img" :aria-label="`三个阶段的概念示意，当前关注${stages[stage].label}。同一输出块先计算，再节点内归约，再跨节点交换。`">
          <g class="sculpture-guides" fill="none"><path d="M75 68v264M275 17v362M468 80v285M43 329l205 100 250-119" /><path d="m76 76 195 93 194-96M77 174l194 92 194-93M77 272l194 92 194-93" /></g>
          <g v-for="(item, layer) in stages" :key="item.name" :class="['sculpture-layer', { 'is-active': stage === layer }]" :style="{ '--layer-color': item.color }">
            <g :transform="`translate(78 ${28 + layer * 112})`">
              <path class="tray-depth" d="m0 53 192 63 192-63v9l-192 63L0 62Z" />
              <path class="tray-face" d="M0 53 192 -10 384 53 192 116Z" />
              <g transform="translate(192 -3) matrix(1 .33 -1 .33 0 0)">
                <rect v-for="cell in 16" :key="cell" :x="((cell - 1) % 4) * 42" :y="Math.floor((cell - 1) / 4) * 42" width="35" height="35" rx="2" :class="['sculpture-tile', { 'tracked-tile': cell === 6 }]" />
              </g>
              <text x="192" y="43" class="sculpture-block" text-anchor="middle">{{ item.mark }}</text>
            </g>
            <g :transform="`translate(10 ${59 + layer * 112})`"><text class="layer-index">0{{ layer + 1 }}</text><path class="label-leader" d="M21-4H56" /></g>
            <text x="484" :y="81 + layer * 112" class="layer-short-label" text-anchor="middle">{{ ['计算', '归约', '交换'][layer] }}</text>
          </g>
          <path class="sculpture-thread" d="M270 64v112m0 0v112" fill="none" />
          <circle class="sculpture-cursor" cx="270" :cy="64 + stage * 112" r="14" />

        </svg>
        <p class="sculpture-footnote">局部贡献 C → 节点内部分和 L → 与远端 R 交换</p>
        <div class="experiment-controls" role="group" aria-label="选择关注的阶段"><button v-for="(item, i) in stages" :key="item.name" :aria-pressed="stage === i" @click="stage = i"><span>0{{ i + 1 }}</span>{{ item.label }}</button></div>
        <div class="experiment-readout" aria-live="polite"><span class="readout-dot" /><p>{{ stages[stage].description }}</p></div>
        <span class="experiment-disclaimer">概念示意 · 网格不表示实际 tile 数或耗时</span>
      </div>
    </div>
    <nav class="reading-path" aria-label="推荐阅读路径">
      <a href="#content"><span class="path-number">01</span><span><small>先看完整过程</small><strong>建立主线</strong></span><span class="path-arrow" aria-hidden="true">↘</span></a>
      <RouteLink :to="chapters[1].path"><span class="path-number">02</span><span><small>再拆解实现条件</small><strong>理解协同机制</strong></span><span class="path-arrow" aria-hidden="true">↗</span></RouteLink>
      <RouteLink :to="chapters[2].path"><span class="path-number">03</span><span><small>沿同一块数据核对</small><strong>走进源码</strong></span><span class="path-arrow" aria-hidden="true">↗</span></RouteLink>
    </nav>
  </section>
</template>
