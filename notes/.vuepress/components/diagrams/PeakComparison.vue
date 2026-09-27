<script setup lang="ts">
const results = [
  { kernel: 'AllGather + GEMM', efa: 1.41, ib: 1.34 },
  { kernel: 'GEMM + AllReduce', efa: 1.53, ib: 1.72 },
  { kernel: 'Ring Attention', efa: 1.78, ib: 1.88 },
]
</script>
<template>
  <figure class="mk-figure peak-demo" aria-label="论文报告的三个算子相对未融合基线的最高加速比">
    <figcaption><strong>论文实测的最高加速比</strong><span>各自 shape 范围内的峰值</span></figcaption>
    <div class="mk-legend"><span><i style="--swatch: var(--mk-compute)"></i>AWS EFA</span><span><i style="--swatch: var(--mk-local)"></i>ConnectX-7</span><span>虚线 = 未融合基线 1×</span></div>
    <div v-for="item in results" :key="item.kernel" class="kernel-bars">
      <strong>{{ item.kernel }}</strong>
      <div v-for="backend in ['efa', 'ib'] as const" :key="backend" class="bar-row">
        <span>{{ backend === 'efa' ? 'EFA' : 'CX7' }}</span>
        <div class="track"><span class="base-line"></span><i :class="backend" :style="{width: `${item[backend] / 2 * 100}%`}"></i></div>
        <b>{{ item[backend].toFixed(2) }}×</b>
      </div>
    </div>
    <div class="bar-axis"><span>0</span><span>1×</span><span>2×</span></div>
    <p class="mk-note">来源：论文 §5.2、§5.4；两测试床均为 2×8 H200。不同峰值不一定来自相同 shape；图不表示平均值，也不表示整模型收益。MoE 与 ReduceScatter 的特殊口径保留在下表中。</p>
  </figure>
</template>
<style scoped>
.kernel-bars { margin-top: 1.1rem; }.kernel-bars > strong { font-size: .95rem; }.bar-row { display: grid; grid-template-columns: 35px 1fr 50px; align-items: center; gap: .6rem; margin-top: .45rem; font-size: .875rem; }.track { position: relative; height: 23px; background: var(--vp-c-bg-alt); }.track i { display: block; height: 100%; border-radius: 2px; }.efa { background: var(--mk-compute); }.ib { background: var(--mk-local); }.base-line { position: absolute; top: -3px; bottom: -3px; left: 50%; z-index: 1; border-left: 2px dashed var(--vp-c-text); opacity: .75; }.bar-axis { display: flex; justify-content: space-between; margin: .6rem 60px 0 45px; font-size: .8rem; color: var(--diagram-muted); }
</style>
