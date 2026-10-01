<script setup lang="ts">
import { computed, ref, useId } from 'vue'
const uid = useId()
const computeWork = ref(5)
const commWork = ref(70)
const fixedComm = ref(8)
const saturated = ref(false)
const slots = 32
const adaptive = computed(() => {
  const total = computeWork.value + commWork.value
  if (!total || !commWork.value) return 0
  if (!computeWork.value) return slots
  return Math.max(1, Math.min(slots - 1, Math.round(slots * commWork.value / total)))
})
function duration(work: number, count: number) { return work ? work / count : 0 }
const options = computed(() => [
  { label: '手动固定分配', comm: fixedComm.value },
  { label: '比例目标（线性估计）', comm: adaptive.value },
].map(p => ({...p, computeTime: duration(computeWork.value, slots - p.comm), commTime: duration(commWork.value, saturated.value ? Math.min(p.comm, 8) : p.comm)})))
const maxTime = computed(() => Math.max(1, ...options.value.flatMap(p => [p.computeTime, p.commTime])))
function preset(c: number, n: number) { computeWork.value = c; commWork.value = n; fixedComm.value = 8 }
function setCapacity(limited: boolean) { saturated.value = limited; preset(limited ? 75 : 5, limited ? 25 : 70) }
</script>
<template>
  <figure class="mk-figure sm-demo" aria-label="手动分配与线性比例目标在两种通信吞吐假设下的比较">
    <figcaption><strong>多给通信一些 block，总会更快吗？</strong><span>资源取舍模型 · 任意单位 · 非实测</span></figcaption>
    <div class="mk-toolbar" role="group" aria-label="选择通信吞吐假设">
      <button :aria-pressed="!saturated" @click="setCapacity(false)">吞吐随 block 线性增长</button>
      <button :aria-pressed="saturated" @click="setCapacity(true)">8 个通信 block 后饱和</button>
    </div>
    <div class="mk-toolbar" role="group" aria-label="选择剩余工作场景">
      <button @click="preset(75, 25)" :aria-pressed="computeWork === 75 && commWork === 25">计算较多</button>
      <button @click="preset(50, 50)" :aria-pressed="computeWork === 50 && commWork === 50">工作相当</button>
      <button @click="preset(5, 70)" :aria-pressed="computeWork === 5 && commWork === 70">通信尾部</button>
      <button @click="preset(0, 70)" :aria-pressed="computeWork === 0 && commWork === 70">计算已完成</button>
    </div>
    <div class="mk-two work-controls">
      <label :for="`${uid}-compute`">计算剩余工作：{{ computeWork }}<input :id="`${uid}-compute`" v-model.number="computeWork" type="range" min="0" max="100" /></label>
      <label :for="`${uid}-comm`">通信剩余工作：{{ commWork }}<input :id="`${uid}-comm`" v-model.number="commWork" type="range" min="0" max="100" /></label>
    </div>
    <label class="allocation-control" :for="`${uid}-allocation`">手动通信分配：<strong>{{ fixedComm }} / 32 blocks</strong><input :id="`${uid}-allocation`" v-model.number="fixedComm" type="range" min="1" max="31" /></label>
    <div class="mk-two">
      <div v-for="panel in options" :key="panel.label" class="mk-panel">
        <strong>{{ panel.label }}</strong>
        <div class="sm-grid" role="img" :aria-label="`${slots - panel.comm} 个计算 block，${panel.comm} 个通信 block`">
          <span v-for="block in slots" :key="block" :class="{ comm: block > slots - panel.comm, idle: block > slots - panel.comm ? !commWork : !computeWork }"></span>
        </div>
        <div class="slot-count"><span>计算 {{ slots - panel.comm }}</span><span>通信 {{ panel.comm }}</span></div>
        <div class="duration-row"><span>计算</span><div><i :style="{ width: `${panel.computeTime / maxTime * 100}%` }"></i></div><b>{{ panel.computeTime.toFixed(2) }}</b></div>
        <div class="duration-row network"><span>通信</span><div><i :style="{ width: `${panel.commTime / maxTime * 100}%` }"></i></div><b>{{ panel.commTime.toFixed(2) }}</b></div>
        <div class="finish-time">两项都完成：<strong>{{ Math.max(panel.computeTime, panel.commTime).toFixed(2) }}</strong> 单位</div>
      </div>
    </div>
    <div class="mk-legend"><span><i style="--swatch: var(--mk-compute)"></i>计算 block</span><span><i style="--swatch: var(--mk-network)"></i>通信 block</span><span><i style="--swatch: var(--diagram-line)"></i>已无任务的 block</span></div>
    <div class="mk-readout" aria-live="polite">线性估计目标：<strong>{{ adaptive }} / 32 blocks</strong>。{{ !computeWork && !commWork ? '两类任务都已完成。' : saturated ? '通信吞吐上限不变时，超过 8 个通信 block 不再缩短网络用时，却会减少计算资源。' : !computeWork ? `计算结束后，手动分配中的 ${slots - fixedComm} 个计算 block 闲置；可把它们交给剩余通信。` : !commWork ? '通信已完成，32 个 block 都可用于剩余计算。' : '两侧条形共用尺度。改变手动分配，观察计算与通信谁更晚完成。' }}</div>
    <p class="mk-note">32 格代表可分配 block，并非真实 SM 数。计算时间 = 工作量 ÷ 计算 block 数；通信时间 = 工作量 ÷ 有效通信 block 数。饱和场景把有效通信 block 上限假设为 8。比例目标只演示论文式 (2) 的固定成本比例估计，不模拟实际控制器的成本更新；忽略依赖与切换成本。</p>
  </figure>
</template>
<style scoped>
.work-controls { margin-bottom: 1rem; font-size: .9rem; }
.allocation-control { display: block; margin-bottom: 1.1rem; font-size: .9rem; }
.sm-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 5px; }
.sm-grid span { aspect-ratio: 1.1; max-height: 33px; border: 1px solid var(--mk-compute); border-radius: 4px; background: color-mix(in srgb, var(--mk-compute) 25%, transparent); }
.sm-grid span.comm { border-color: var(--mk-network); background: color-mix(in srgb, var(--mk-network) 25%, transparent); }
.sm-grid span.idle { border-style: dashed; border-color: var(--diagram-line); background: var(--vp-c-bg-alt); }
.slot-count { display: flex; justify-content: space-between; margin: .5rem 0 1rem; font-size: .875rem; }.slot-count span:first-child { color: var(--mk-compute); }.slot-count span:last-child { color: var(--mk-network); }
.duration-row { display: grid; grid-template-columns: 30px 1fr 38px; align-items: center; gap: 5px; font-size: .8rem; margin: .5rem 0; }
.duration-row > div { height: 12px; background: var(--vp-c-bg-alt); }.duration-row i { display: block; height: 100%; background: var(--mk-compute); border-radius: 2px; }.duration-row.network i { background: var(--mk-network); }.duration-row b { text-align: right; font-weight: 400; }
.finish-time { margin-top: .75rem; font-size: .875rem; }.finish-time strong { font-size: 1.15rem; }
</style>
