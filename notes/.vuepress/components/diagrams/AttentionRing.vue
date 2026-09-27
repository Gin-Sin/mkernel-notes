<script setup lang="ts">
import { ref } from 'vue'
const step = ref(1)
const displayOrder = [0, 1, 3, 2]
function kv(gpu: number) { return (gpu - step.value + 4) % 4 }
function seen(gpu: number, key: number) { return Array.from({length: step.value}, (_, i) => (gpu - i + 4) % 4).includes(key) }
</script>
<template>
  <figure class="mk-figure ring-demo" aria-label="Q 留在原 GPU，KV 沿逻辑环移动的分步示意">
    <figcaption><strong>Q 留在原地，KV 轮流经过</strong><span>4 GPU 的逻辑环示意</span></figcaption>
    <div class="mk-toolbar"><button :disabled="step === 0" @click="step--">上一轮</button><strong>第 {{ step + 1 }} / 4 轮</strong><button :disabled="step === 3" @click="step++">下一轮</button><button @click="step = 0">重置</button></div>
    <div class="ring-cards" role="group" :aria-label="`第 ${step + 1} 轮的 KV 位置`">
      <div v-for="gpu in displayOrder" :key="gpu" class="ring-card" :class="{ focus: gpu === 0 }">
        <strong>GPU {{ gpu }}</strong>
        <div class="operands"><span class="q-block">Q{{ gpu }}</span><span class="pair-label">与</span><span class="kv-block">KV{{ kv(gpu) }}</span></div>
        <span class="attention-label">本轮 Attention 输入</span>
      </div>
      <i v-if="step < 3" class="direction top" aria-hidden="true"></i><i v-if="step < 3" class="direction right" aria-hidden="true"></i><i v-if="step < 3" class="direction bottom" aria-hidden="true"></i><i v-if="step < 3" class="direction left" aria-hidden="true"></i>
    </div>
    <div class="mk-legend"><span><i style="--swatch: var(--mk-compute)"></i>Q 固定</span><span><i style="--swatch: var(--mk-local)"></i>KV 沿箭头传递</span></div>
    <div class="coverage">
      <span>Q / KV</span><b v-for="col in 4" :key="col">{{ col - 1 }}</b>
      <template v-for="row in 4" :key="row"><b>{{ row - 1 }}</b><span v-for="col in 4" :key="col" class="coverage-cell" :class="{ done: seen(row - 1, col - 1), current: kv(row - 1) === col - 1 }">{{ kv(row - 1) === col - 1 ? '本轮' : seen(row - 1, col - 1) ? '✓' : '·' }}</span></template>
    </div>
    <div class="step-work" aria-label="GPU 0 当前轮次内可并行推进的工作">
      <span class="step-label">GPU 0 · 同一轮</span>
      <div class="compute-work"><span>Attention</span><strong>Q0 与 KV{{ kv(0) }}</strong></div>
      <div class="forward-work" :class="{ terminal: step === 3 }"><span>{{ step < 3 ? '可同时传递' : '本轮结束后' }}</span><strong>{{ step < 3 ? `KV${kv(0)} → GPU 1` : '全部分片已覆盖 ✓' }}</strong></div>
    </div>
    <div class="mk-readout" aria-live="polite"><template v-if="step < 3">Attention 读取当前 KV{{ kv(0) }}，传输也可读取同一份数据；下轮仍需等 KV{{ (kv(0) + 3) % 4 }} 到达。</template><template v-else>本轮结束后，Q0 已覆盖全部 4 个 KV 分片，图中的循环在此结束。</template></div>
    <p class="mk-note">逻辑环与分片配对示意，省略 softmax 累积和节点内／跨节点层级；每轮不一定跨网。</p>
  </figure>
</template>
<style scoped>
.ring-cards { display: grid; grid-template-columns: 1fr 1fr; column-gap: 32px; row-gap: 60px; position: relative; padding: .4rem 0; }
.ring-card { padding: .9rem; border: 1px solid var(--diagram-line); border-radius: 8px; background: var(--vp-c-bg-alt); }
.ring-card.focus { border-color: var(--mk-compute); }.ring-card strong { font-size: .95rem; }
.operands { display: grid; grid-template-columns: 1fr 18px 1fr; align-items: center; gap: 6px; margin-top: .7rem; text-align: center; }
.pair-label { font-size: .8rem; color: var(--diagram-muted); }.attention-label { display: block; margin-top: .35rem; text-align: center; font-size: .75rem; color: var(--diagram-muted); }
.step-work { display: grid; grid-template-columns: 110px 1fr; gap: .5rem; margin-top: 1rem; font-size: .875rem; }.step-label { grid-row: span 2; display: grid; align-items: center; border-right: 2px solid var(--diagram-line); }.step-work > div { display: flex; flex-wrap: wrap; gap: .25rem .8rem; padding: .45rem .65rem; border: 1px solid var(--mk-compute); background: color-mix(in srgb, var(--mk-compute) 8%, transparent); }.step-work .forward-work { border-color: var(--mk-local); background: color-mix(in srgb, var(--mk-local) 8%, transparent); }.step-work .terminal { border-style: dashed; background: transparent; }
.q-block, .kv-block { padding: .7rem .1rem; border: 1px solid var(--mk-compute); border-radius: 5px; background: color-mix(in srgb, var(--mk-compute) 15%, transparent); }
.kv-block { border-color: var(--mk-local); background: color-mix(in srgb, var(--mk-local) 15%, transparent); }
.direction { position: absolute; width: 24px; height: 0; border-top: 2px solid var(--mk-local); }
.direction::after { content: ''; position: absolute; right: -1px; top: -6px; border-block: 5px solid transparent; border-left: 7px solid var(--mk-local); }
.direction.top { left: calc(50% - 12px); top: 25%; }.direction.bottom { left: calc(50% - 12px); top: 75%; transform: rotate(180deg); }
.direction.right { left: calc(75% - 4px); top: 50%; transform: rotate(90deg); }.direction.left { left: calc(25% - 20px); top: 50%; transform: rotate(-90deg); }
@media(max-width: 600px) { .ring-card { padding: .65rem; }.operands { grid-template-columns: 1fr 12px 1fr; gap: 3px; }.q-block, .kv-block { padding-block: .55rem; font-size: .9rem; } }
.coverage { display: grid; grid-template-columns: 66px repeat(4, 1fr); gap: 4px; max-width: 400px; margin: .5rem auto; text-align: center; font-size: .875rem; align-items: center; }.coverage b { font-weight: 500; color: var(--diagram-muted); }.coverage-cell { height: 29px; line-height: 27px; border: 1px solid var(--diagram-line); border-radius: 3px; color: var(--diagram-muted); }.coverage-cell.done { background: color-mix(in srgb, var(--mk-local) 14%, transparent); color: var(--mk-local); border-color: var(--mk-local); }.coverage-cell.current { border: 2px solid var(--mk-compute); line-height: 25px; color: var(--mk-compute); }
</style>
