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
        <div class="operands"><span class="q-block">Q{{ gpu }}</span><span class="pair-label">与</span><span class="kv-block" :class="{ tracked: kv(gpu) === 0 }" :data-kv="kv(gpu)">{{ kv(gpu) === 0 ? '◆ ' : '' }}KV{{ kv(gpu) }}</span></div>
        <span class="attention-label">本轮 Attention 输入</span>
      </div>
      <i v-if="step < 3" class="direction top" aria-hidden="true"></i><i v-if="step < 3" class="direction right" aria-hidden="true"></i><i v-if="step < 3" class="direction bottom" aria-hidden="true"></i><i v-if="step < 3" class="direction left" aria-hidden="true"></i>
    </div>
    <div class="mk-legend"><span><i style="--swatch: var(--mk-compute)"></i>Q 固定</span><span><i style="--swatch: var(--mk-local)"></i>KV 沿箭头传递</span><span>◆ 始终追踪 KV0</span></div>
    <div class="kv-journey" aria-label="同一份 KV0 按轮次经过的 GPU"><strong>◆ KV0</strong><template v-for="g in 4" :key="g"><span v-if="g > 1" aria-hidden="true">→</span><span class="journey-stop" :class="{ current: step === g - 1 }">G{{ g - 1 }}</span></template></div>
    <div class="coverage">
      <span>Q / KV</span><b v-for="col in 4" :key="col">{{ col - 1 }}</b>
      <template v-for="row in 4" :key="row"><b>{{ row - 1 }}</b><span v-for="col in 4" :key="col" class="coverage-cell" :class="{ done: seen(row - 1, col - 1), current: kv(row - 1) === col - 1 }">{{ kv(row - 1) === col - 1 ? '本轮' : seen(row - 1, col - 1) ? '✓' : '·' }}</span></template>
    </div>
    <div class="step-work" aria-label="GPU 0 当前轮次内可并行推进的工作">
      <span class="step-label">GPU 0 · 本轮读取同一份 KV</span>
      <div class="fork-source" :class="{ tracked: kv(0) === 0 }">KV{{ kv(0) }}</div>
      <div class="fork-branches" :class="{ terminal: step === 3 }">
        <div class="compute-work"><span>↓ 读取，与 Q0 计算</span><strong>Attention</strong></div>
        <div class="forward-work"><span>{{ step < 3 ? '↓ 同时读取，发送到' : '本轮结束后' }}</span><strong>{{ step < 3 ? 'GPU 1' : '全部分片已覆盖 ✓' }}</strong></div>
      </div>
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
.step-work { margin-top: 1rem; font-size: .875rem; }
.step-label { display: block; margin-bottom: .6rem; color: var(--diagram-muted); }
.fork-source { width: 76px; margin: 0 auto; padding: .35rem; border: 1px solid var(--mk-local); background: color-mix(in srgb, var(--mk-local) 12%, transparent); text-align: center; border-radius: 4px; position: relative; }
.fork-source::after { content: ''; position: absolute; top: 100%; left: 50%; height: 15px; border-left: 1px solid var(--mk-local); }
.fork-branches { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; padding-top: 15px; position: relative; }
.fork-branches::before { content: ''; position: absolute; top: 14px; left: 25%; width: 50%; border-top: 1px solid var(--mk-local); }
.fork-branches > div { display: grid; gap: .25rem; justify-items: center; padding: .5rem .35rem; text-align: center; }
.compute-work strong { color: var(--mk-compute); }.forward-work strong { color: var(--mk-local); }
.fork-branches.terminal::before { width: 25%; }.terminal .forward-work { border: 1px dashed var(--diagram-line); border-radius: 4px; }
.kv-journey { display: flex; align-items: center; gap: .4rem; font-size: .8rem; margin: .5rem 0 1rem; }
.kv-journey > strong { color: var(--mk-control); margin-right: auto; white-space: nowrap; }
.journey-stop { padding: .15rem .35rem; border: 1px dashed var(--diagram-line); border-radius: 3px; }
.journey-stop.current { color: var(--mk-control); border: 2px solid var(--mk-control); background: color-mix(in srgb, var(--mk-control) 10%, transparent); font-weight: 650; }
.q-block, .kv-block { padding: .7rem .1rem; border: 1px solid var(--mk-compute); border-radius: 5px; background: color-mix(in srgb, var(--mk-compute) 15%, transparent); }
.kv-block { border-color: var(--mk-local); background: color-mix(in srgb, var(--mk-local) 15%, transparent); }
.kv-block.tracked, .fork-source.tracked { border: 2px solid var(--mk-control); background: color-mix(in srgb, var(--mk-control) 15%, transparent); color: var(--mk-control); }
.direction { position: absolute; width: 24px; height: 0; border-top: 2px solid var(--mk-local); }
.direction::after { content: ''; position: absolute; right: -1px; top: -6px; border-block: 5px solid transparent; border-left: 7px solid var(--mk-local); }
.direction.top { left: calc(50% - 12px); top: 25%; }.direction.bottom { left: calc(50% - 12px); top: 75%; transform: rotate(180deg); }
.direction.right { left: calc(75% - 4px); top: 50%; transform: rotate(90deg); }.direction.left { left: calc(25% - 20px); top: 50%; transform: rotate(-90deg); }
@media(max-width: 600px) { .ring-card { padding: .65rem; }.operands { grid-template-columns: 1fr 12px 1fr; gap: 3px; }.q-block, .kv-block { padding-block: .55rem; font-size: .9rem; } }
.coverage { display: grid; grid-template-columns: 66px repeat(4, 1fr); gap: 4px; max-width: 400px; margin: .5rem auto; text-align: center; font-size: .875rem; align-items: center; }.coverage b { font-weight: 500; color: var(--diagram-muted); }.coverage-cell { height: 29px; line-height: 27px; border: 1px solid var(--diagram-line); border-radius: 3px; color: var(--diagram-muted); }.coverage-cell.done { background: color-mix(in srgb, var(--mk-local) 14%, transparent); color: var(--mk-local); border-color: var(--mk-local); }.coverage-cell.current { border: 2px solid var(--mk-compute); line-height: 25px; color: var(--mk-compute); }
</style>
