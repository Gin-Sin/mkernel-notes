<script setup lang="ts">
import { computed, ref, useId } from 'vue'
const uid = useId()
const computeWork = ref(75)
const commWork = ref(25)
const slots = 100
const share = computed(() => slots * commWork.value / (computeWork.value + commWork.value))
const computeShare = computed(() => slots - share.value)
const balancedTime = computed(() => (computeWork.value + commWork.value) / slots)
function preset(compute: number, comm: number) {
  computeWork.value = compute
  commWork.value = comm
}
</script>

<template>
  <figure class="sm-demo" aria-label="按剩余工作量调整计算与通信资源的示意">
    <figcaption><strong>剩余工作变化时，通信份额怎样变化？</strong><span>公式演示 · 任意单位 · 非性能实测</span></figcaption>
    <div class="presets" role="group" aria-label="选择剩余工作场景">
      <button type="button" @click="preset(75, 25)">计算工作较多</button>
      <button type="button" @click="preset(50, 50)">剩余工作相当</button>
      <button type="button" @click="preset(10, 70)">通信尾部</button>
    </div>
    <div class="controls">
      <label :for="`${uid}-compute`">计算剩余工作 RₚCₚ：<output>{{ computeWork }}</output>
        <input :id="`${uid}-compute`" v-model.number="computeWork" type="range" min="1" max="100" />
      </label>
      <label :for="`${uid}-comm`">通信剩余工作 RₛCₛ：<output>{{ commWork }}</output>
        <input :id="`${uid}-comm`" v-model.number="commWork" type="range" min="1" max="100" />
      </label>
    </div>
    <div class="allocation" aria-hidden="true">
      <span class="compute" :style="{ width: `${computeShare}%` }"></span>
      <span class="communication" :style="{ width: `${share}%` }"></span>
    </div>
    <div class="readout" aria-live="polite" aria-atomic="true">
      <span class="compute-key">计算 {{ computeShare.toFixed(1) }}%</span>
      <span class="comm-key">通信 {{ share.toFixed(1) }}%</span>
      <span>理想均衡完成时间：{{ balancedTime.toFixed(2) }} 单位</span>
    </div>
    <p>假设 B = 100、资源可连续划分、任务成本已知。通信份额 = 通信剩余工作 ÷ 总剩余工作。通信任务变少时，目标份额会随之降低。</p>
  </figure>
</template>

<style scoped>
.sm-demo { margin: 1.5rem 0; padding: 1.4rem; border: 1px solid var(--diagram-line); border-radius: 10px; background: var(--vp-c-bg-alt); }
figcaption { display: flex; flex-direction: column; gap: .4rem; margin-bottom: 1rem; }
figcaption span, .sm-demo p { color: var(--diagram-muted); font-size: .9rem; }
.presets { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: 1.3rem; }
button { font: inherit; font-size: .9rem; padding: .45rem .75rem; border: 1px solid var(--diagram-line); border-radius: 6px; background: var(--vp-c-bg); color: var(--vp-c-text); cursor: pointer; }
button:hover { border-color: var(--diagram-primary); }
button:focus-visible, input:focus-visible { outline: 2px solid var(--diagram-primary); outline-offset: 3px; }
.controls { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2rem; }
label { display: block; font-size: .95rem; }
input { display: block; width: 100%; margin: .9rem 0 1.2rem; accent-color: var(--diagram-primary); }
.allocation { display: flex; height: 28px; overflow: hidden; border-radius: 5px; }
.compute { background: var(--diagram-primary); }
.communication { background: var(--diagram-warning); }
.readout { display: flex; flex-wrap: wrap; gap: .7rem 1.3rem; margin-top: .75rem; font-size: .95rem; }
.compute-key { color: var(--diagram-primary); font-weight: 600; }
.comm-key { color: var(--diagram-warning); font-weight: 600; }
.sm-demo p { margin-bottom: 0; }
@media (max-width: 600px) { .controls { grid-template-columns: 1fr; gap: 0; } .sm-demo { padding: 1rem; } }
</style>
