<script setup lang="ts">
import { computed, ref, useId } from 'vue'
const uid = useId()
const share = ref(30)
const operatorSpeedup = 1.72
const remaining = computed(() => 100 - share.value + share.value / operatorSpeedup)
const speedup = computed(() => 100 / remaining.value)
</script>

<template>
  <figure class="mk-figure model-speedup" aria-label="由算子占比推导端到端加速的 Amdahl 教学模型">
    <figcaption><strong>算子快了 1.72×，整段任务快多少？</strong><span>Amdahl 推导 · 非模型实测</span></figcaption>
    <label :for="`${uid}-share`">优化前，该算子占总时间：<strong>{{ share }}%</strong></label>
    <input :id="`${uid}-share`" v-model.number="share" type="range" min="0" max="100" step="5" />
    <div class="time-comparison" role="img" :aria-label="`优化前总时间 100，优化后 ${remaining.toFixed(1)}；其余部分 ${100 - share} 保持不变`">
      <div class="time-label"><span>优化前</span><strong>100</strong></div>
      <div class="time-track"><span class="unaffected" :style="{ width: `${100 - share}%` }" /><span class="affected" :style="{ width: `${share}%` }" /></div>
      <div class="time-label"><span>优化后</span><strong>{{ remaining.toFixed(1) }}</strong></div>
      <div class="time-track"><span class="unaffected" :style="{ width: `${100 - share}%` }" /><span class="affected" :style="{ width: `${share / operatorSpeedup}%` }" /><span class="saved" :style="{ width: `${100 - remaining}%` }" /></div>
    </div>
    <div class="mk-legend"><span><i style="--swatch: color-mix(in srgb, var(--diagram-muted) 23%, var(--vp-c-bg))" />其余部分不变</span><span><i style="--swatch: var(--mk-compute)" />被优化算子</span><span><i style="--swatch: repeating-linear-gradient(135deg, transparent, transparent 4px, var(--diagram-line) 4px, var(--diagram-line) 5px)" />节省时间</span></div>
    <div class="model-result" aria-live="polite"><span>端到端加速</span><strong>{{ speedup.toFixed(2) }}<small>×</small></strong><span>总时间减少 {{ (100 - remaining).toFixed(1) }}%</span></div>
    <p class="mk-note">基线总时间归一化为 100。只把蓝色部分除以 1.72，其余部分保持不变。假设该算子确实达到这一倍率，且可按时间占比相加；不模拟并发与系统开销。1.72× 来自论文的算子峰值，不能保证在你的模型配置中复现。</p>
  </figure>
</template>

<style scoped>
.model-speedup > label { font-size: .9rem; }
.time-comparison { margin: 1rem 0; }.time-label { display: flex; justify-content: space-between; font-size: .9rem; margin: .7rem 0 .35rem; }
.time-track { display: flex; height: 34px; overflow: hidden; border-radius: 3px; outline: 1px solid var(--diagram-line); }
.unaffected { background: color-mix(in srgb, var(--diagram-muted) 23%, var(--vp-c-bg)); }
.affected { background: var(--mk-compute); }
.saved { background: repeating-linear-gradient(135deg, transparent, transparent 4px, var(--diagram-line) 4px, var(--diagram-line) 5px); }
.model-result { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: .6rem; padding-top: .8rem; border-top: 1px solid var(--diagram-line); font-size: .9rem; }
.model-result strong { font-size: 2rem; color: var(--mk-compute); font-variant-numeric: tabular-nums; }.model-result small { font-size: 1.1rem; }
</style>
