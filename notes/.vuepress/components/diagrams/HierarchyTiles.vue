<script setup lang="ts">
import { computed, ref } from 'vue'
const stage = ref(1)
const selected = ref(2)
const steps = ['局部输出', '节点内归约', '交换并相加', '节点内广播']
const descriptions = [
  '每张 GPU 都有 8 组输出的局部贡献。沿同一列看：这是同一组输出的 8 份贡献。',
  '每列归约到一个 owner：GPU i 负责第 i 组输出。高亮列的 8 份贡献已合成 1 份节点内部分和。',
  '同编号 owner 交换部分和，各自加上远端贡献。高亮的输出组只在这对 rail peer 之间交换。',
  'owner 将最终和广播回节点内 8 张 GPU。每张 GPU 重新拥有全部 8 组完整输出。',
]
const stateLabel = computed(() => ['局部贡献', '节点内部分和', '跨节点最终和', '完整输出'][stage.value])
function hasValue(row: number, col: number) { return stage.value === 0 || stage.value === 3 || row === col }
function value(node: number) { return stage.value === 0 ? (node ? 'b' : 'a') : stage.value === 1 ? (node ? 'R' : 'L') : 'Σ' }
</script>
<template>
  <figure class="mk-figure hierarchy-demo" aria-label="两个节点上 GPU 与输出分片的数据布局">
    <figcaption><strong>8 份局部贡献，怎样只跨网发送 1 份？</strong><span>2 节点 × 8 GPU · 布局示意</span></figcaption>
    <div class="mk-toolbar" role="group" aria-label="选择要追踪的输出组"><span>追踪输出组</span><button v-for="col in 8" :key="col" :aria-pressed="selected === col - 1" @click="selected = col - 1">{{ col - 1 }}</button></div>
    <div class="reduction-trace" :aria-label="`输出组 ${selected} 在两个节点内归约、跨节点交换再广播`" role="group">
      <template v-for="node in [0, 1]" :key="node">
        <div class="trace-contributions" :style="{ gridColumn: node ? 3 : 1 }">
          <strong>节点 {{ node }}</strong>
          <span class="trace-label">GPU 0–7 的贡献</span>
          <div class="contribution-chips"><span v-for="gpu in 8" :key="gpu">{{ node ? 'b' : 'a' }}{{ gpu - 1 }}</span></div>
        </div>
        <div class="trace-reduce" :style="{ gridColumn: node ? 3 : 1 }"><span>↓</span> NVSwitch 归约</div>
        <div class="trace-owner" :style="{ gridColumn: node ? 3 : 1 }"><strong>{{ node ? 'R' : 'L' }}</strong><span>节点内部分和</span><small>owner · GPU {{ selected }}</small></div>
        <div class="trace-combine" :style="{ gridColumn: node ? 3 : 1 }"><span>↓ 加上远端部分和</span><strong>Σ = L + R</strong></div>
        <div class="trace-broadcast" :style="{ gridColumn: node ? 3 : 1 }"><span class="trace-label">↓ NVSwitch 广播</span><div class="contribution-chips"><span v-for="gpu in 8" :key="gpu">Σ</span></div><span class="trace-label">GPU 0–7 各得一份</span></div>
      </template>
      <div class="trace-exchange"><span>跨网</span><b>⇄</b></div>
    </div>
    <div class="traffic">
      <span>D：完整输出字节数 · 每节点共发送 D</span>
      <div class="partitioned"><span v-for="i in 8" :key="i" :class="{ chosen: selected === i - 1 }">{{ i - 1 }}</span></div>
      <span>高亮组：GPU {{ selected }} 与远端同编号 GPU 交换 D/8</span>
    </div>
    <details class="layout-detail">
    <summary>展开逐阶段的完整 GPU × 输出组布局</summary>
    <div class="mk-toolbar" role="group" aria-label="选择 AllReduce 阶段">
      <button v-for="(name, i) in steps" :key="name" :aria-pressed="stage === i" @click="stage = i">{{ i + 1 }}. {{ name }}</button>
    </div>
    <div class="mk-two node-pair">
      <div v-for="node in [0, 1]" :key="node" class="node-board">
        <div class="node-title"><strong>节点 {{ node }}</strong><span>{{ stateLabel }}</span></div>
        <div class="matrix" role="group" :aria-label="`节点 ${node}：行是 GPU，列是输出组，当前${stateLabel}`">
          <span class="corner">GPU / 组</span>
          <button v-for="col in 8" :key="`c${col}`" class="col-head" :aria-label="`高亮输出组 ${col - 1}`" :aria-pressed="selected === col - 1" @click="selected = col - 1">{{ col - 1 }}</button>
          <template v-for="row in 8" :key="row">
            <span class="row-label" :class="{ owner: stage > 0 && selected === row - 1 }">{{ row - 1 }}</span>
            <span v-for="col in 8" :key="col" class="matrix-cell" :class="{ occupied: hasValue(row - 1, col - 1), selected: selected === col - 1, local: stage === 1, complete: stage >= 2 }">{{ hasValue(row - 1, col - 1) ? value(node) : '·' }}</span>
          </template>
        </div>
      </div>
    </div>
    <div v-if="stage === 2" class="exchange active"><span>GPU {{ selected }} · 节点 0</span><strong>L ⇄ R</strong><span>GPU {{ selected }} · 节点 1</span></div>
    <div class="mk-readout" aria-live="polite">{{ descriptions[stage] }}</div>
    <p class="mk-note">a / b：单 GPU 贡献；L / R：节点内和；Σ = L + R，与源码图一致。空格省略非 owner 的存储状态，不表示清空 buffer；逻辑分组不代表实际地址连续。</p>
    </details>
    <p class="mk-note">D/8 为两节点交换阶段的每 GPU 发送量；各组可独立推进。</p>
  </figure>
</template>
<style scoped>
.reduction-trace { display: grid; grid-template-columns: minmax(0, 1fr) 48px minmax(0, 1fr); margin-bottom: 1.1rem; }
.trace-contributions { grid-row: 1; }.trace-contributions > strong { display: block; margin-bottom: .2rem; }
.trace-label { display: block; color: var(--diagram-muted); font-size: .8rem; margin: .35rem 0; }
.contribution-chips { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 3px; }
.contribution-chips > span { display: grid; place-items: center; border: 1px solid var(--mk-compute); background: color-mix(in srgb, var(--mk-compute) 12%, transparent); color: var(--mk-compute); min-height: 28px; font-size: .8rem; border-radius: 3px; }
.trace-reduce { grid-row: 2; padding: .5rem 0; font-size: .85rem; color: var(--mk-local); text-align: center; }.trace-reduce > span { font-size: 1.3rem; }
.trace-owner { grid-row: 3; padding: .5rem; border: 2px solid var(--mk-local); border-radius: 6px; display: grid; justify-items: center; background: color-mix(in srgb, var(--mk-local) 9%, transparent); }.trace-owner > strong { font-size: 1.4rem; color: var(--mk-local); }.trace-owner > span, .trace-owner > small { font-size: .8rem; }
.trace-exchange { grid-column: 2; grid-row: 3; align-self: center; text-align: center; color: var(--mk-network); font-size: .75rem; }.trace-exchange b { display: block; font-size: 1.6rem; }
.trace-combine { grid-row: 4; display: grid; justify-items: center; gap: .3rem; padding: .55rem 0; }.trace-combine span { font-size: .8rem; color: var(--diagram-muted); }.trace-combine strong { color: var(--mk-network); font-size: 1rem; }
.trace-broadcast { grid-row: 5; }.trace-broadcast .contribution-chips span { border-color: var(--mk-network); background: color-mix(in srgb, var(--mk-network) 12%, transparent); color: var(--mk-network); }
.layout-detail { margin-top: 1.1rem; border-top: 1px solid var(--diagram-line); padding-top: .75rem; }.layout-detail summary { cursor: pointer; font-size: .9rem; }.layout-detail[open] summary { margin-bottom: 1rem; }
@media (max-width: 600px) { .reduction-trace { grid-template-columns: minmax(0, 1fr) 34px minmax(0, 1fr); }.contribution-chips { grid-template-columns: repeat(4, minmax(0, 1fr)); }.trace-reduce { font-size: .78rem; }.trace-combine span { font-size: .75rem; } }
.node-board { border: 1px solid var(--diagram-line); border-radius: 8px; padding: .7rem; }
.node-title { display: flex; justify-content: space-between; gap: .4rem; align-items: baseline; margin-bottom: .7rem; }
.node-title span { font-size: .8rem; color: var(--diagram-muted); }
.matrix { display: grid; grid-template-columns: 44px repeat(8, minmax(0, 1fr)); gap: 3px; align-items: center; }
.corner { font-size: .7rem; color: var(--diagram-muted); }
.matrix .col-head { min-height: 25px; font-size: .8rem; padding: 0; border-color: transparent; }
.row-label { font-size: .8rem; text-align: center; color: var(--diagram-muted); }
.row-label.owner { font-weight: 700; color: var(--mk-network); }
.matrix-cell { display: flex; align-items: center; justify-content: center; height: 26px; border: 1px solid transparent; border-radius: 3px; color: var(--diagram-muted); font-size: .8rem; }
.matrix-cell.occupied { background: color-mix(in srgb, var(--mk-compute) 15%, transparent); color: var(--mk-compute); }
.matrix-cell.occupied.local { background: color-mix(in srgb, var(--mk-local) 18%, transparent); color: var(--mk-local); }
.matrix-cell.occupied.complete { background: color-mix(in srgb, var(--mk-network) 18%, transparent); color: var(--mk-network); }
.matrix-cell.selected { border-color: var(--diagram-muted); }
.matrix-cell.selected.occupied { border-color: currentColor; font-weight: 700; }
.exchange { display: flex; justify-content: space-around; align-items: center; gap: .3rem; margin: 1rem 0; padding: .5rem; border-block: 1px dashed var(--diagram-line); font-size: .875rem; color: var(--diagram-muted); }
.exchange strong { font-size: 1.35rem; white-space: nowrap; }
.exchange.active { color: var(--mk-network); border-color: var(--mk-network); }
.traffic { display: grid; grid-template-columns: 1fr; gap: .45rem; font-size: .875rem; }
.partitioned { display: grid; grid-template-columns: repeat(8, 1fr); height: 29px; gap: 2px; }
.partitioned span { display: grid; place-items: center; border: 1px solid var(--mk-network); color: var(--mk-network); background: color-mix(in srgb, var(--mk-network) 10%, transparent); }
.partitioned .chosen { background: color-mix(in srgb, var(--mk-network) 30%, transparent); font-weight: 700; }
@media (max-width: 600px) { .node-board { padding: .6rem; }.matrix { grid-template-columns: 40px repeat(8, minmax(0, 1fr)); gap: 2px; }.exchange { flex-wrap: wrap; } }
</style>
