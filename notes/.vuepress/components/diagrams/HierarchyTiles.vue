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
function value(node: number) { return stage.value === 0 ? (node ? 'b' : 'a') : stage.value === 1 ? (node ? 'B' : 'A') : 'Σ' }
</script>
<template>
  <figure class="mk-figure hierarchy-demo" aria-label="两个节点上 GPU 与输出分片的数据布局">
    <figcaption><strong>8 份局部贡献，怎样只跨网发送 1 份？</strong><span>2 节点 × 8 GPU · 布局示意</span></figcaption>
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
    <div class="exchange" :class="{ active: stage === 2 }">
      <span>GPU {{ selected }} · 节点 0</span><strong>{{ stage === 2 ? 'A ⇄ B' : '⇄' }}</strong><span>GPU {{ selected }} · 节点 1</span>
    </div>
    <div class="traffic">
      <span>交换阶段 · 一个节点的输出 D</span>
      <div class="partitioned"><span v-for="i in 8" :key="i" :class="{ chosen: selected === i - 1 }">{{ i - 1 }}</span></div>
      <span>每 GPU 发 D/8；全节点共发 D</span>
    </div>
    <div class="mk-readout" aria-live="polite">{{ descriptions[stage] }}</div>
    <p class="mk-note">a / b：单 GPU 贡献；A / B：节点内和；Σ = A + B。空格省略非 owner 的存储状态，不表示清空 buffer；逻辑分组不代表实际地址连续。</p>
  </figure>
</template>
<style scoped>
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
