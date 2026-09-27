<script setup lang="ts">
import { computed, ref } from 'vue'

const stage = ref(2)
const steps = ['还缺一个 tile', '本节点计算就绪', '本地归约完成', '远端部分和到达', '最终结果已发布']
const localReady = computed(() => stage.value >= 2)
const remoteReady = computed(() => stage.value >= 3)
const published = computed(() => stage.value >= 4)
const complete = (gpu: number, tile: number) => stage.value > 0 || gpu !== 7 || tile !== 3
const explanations = [
  'GPU 7 的这个 chunk 还缺 tile 3，尚未发出本轮 chunk 就绪信号；owner 等待全部 8 张 GPU。',
  '8 张 GPU 都已发出本轮信号，owner 可以读取并归约这组贡献；本地部分和此时尚未发布。',
  'owner 已把部分和写入 C_local 和 staging_buf，并发布 local_done_flag。可以提交发送，但最终归约仍等远端。',
  '本地和远端两份部分和都已就绪，最终归约具备执行条件；这还不表示 C_final 已发布。',
  '最终归约把 L + R 写入 C_final 的组播映射，这个 chunk 的结果复制到节点内 8 张 GPU。',
]
</script>

<template>
  <figure class="mk-figure ar-chunk-trace" aria-label="一个 AllReduce chunk 的本地贡献、缓冲区和就绪条件">
    <figcaption><strong>同一个 chunk：两份部分和都到齐，才能发布结果</strong><span>2 节点 × 8 GPU · 跟踪节点 0 的 owner GPU 2</span></figcaption>
    <div class="mk-toolbar" role="group" aria-label="选择 AllReduce chunk 阶段">
      <button v-for="(name, i) in steps" :key="name" :aria-pressed="stage === i" @click="stage = i">{{ i + 1 }}. {{ name }}</button>
    </div>
    <div class="chunk-scope"><strong>输出行 1024–1151 · 列 0–1023</strong><span>4 个 128 × 256 的 BF16 tile = 256 KiB</span></div>
    <div class="trace-layout">
      <div class="contribution-panel">
        <div class="panel-label">本节点 8 份贡献的计算进度</div>
        <div class="contribution-matrix" role="group" aria-label="8 张 GPU 对同一 chunk 的四个 tile 的计算完成情况">
          <span class="muted">来源</span><span v-for="t in 4" :key="`h${t}`" class="muted">t{{ t - 1 }}</span><span class="muted">完成</span>
          <template v-for="g in 8" :key="g">
            <span class="gpu-label">GPU {{ g - 1 }}</span>
            <span v-for="t in 4" :key="t" class="contribution" :class="{ ready: complete(g - 1, t - 1) }" :aria-label="`GPU ${g - 1} tile ${t - 1} ${complete(g - 1, t - 1) ? '已完成' : '未完成'}`">{{ complete(g - 1, t - 1) ? '✓' : '…' }}</span>
            <span class="tile-count">{{ stage === 0 && g === 8 ? '3' : '4' }}/4</span>
          </template>
        </div>
        <div class="signal-count">已发出本轮信号：<strong>{{ stage === 0 ? 7 : 8 }}/8 GPU</strong></div>
        <div class="local-reduction">↓ NVSwitch 归约到 owner</div>
        <div class="dual-store">同一份部分和写入两处</div>
        <div class="local-buffers">
          <div class="buffer-branch">
            <div class="buffer-name">C_local <span>矩阵布局</span></div>
            <div class="four-tiles" :class="{ 'local-ready': localReady }"><span v-for="t in 4" :key="t">{{ localReady ? `L${t - 1}` : '—' }}</span></div>
            <div class="buffer-purpose">留给最终归约</div>
          </div>
          <div class="buffer-branch">
            <div class="buffer-name">staging_buf <span>tile 连续排列</span></div>
            <div class="four-tiles staging" :class="{ 'local-ready': localReady }"><span v-for="t in 4" :key="t">{{ localReady ? `L${t - 1}` : '—' }}</span></div>
            <div class="send-status" :class="{ enabled: localReady }">{{ localReady ? '→ 可提交发送' : '发送等待归约' }}</div>
          </div>
        </div>
      </div>
      <div class="remote-panel">
        <div class="panel-label">owner GPU 2 的接收与发布</div>
        <div class="remote-origin">另一节点 GPU 2 的部分和 R</div>
        <div class="network-arrow" :class="{ arrived: remoteReady }">↓ RDMA</div>
        <div class="buffer-name">C_recv <span>远端接收缓冲区</span></div>
        <div class="four-tiles receive" :class="{ 'remote-ready': remoteReady }"><span v-for="t in 4" :key="t">{{ remoteReady ? `R${t - 1}` : '—' }}</span></div>
        <div class="readiness-gate">
          <div class="flag" :class="{ set: localReady }"><span>local_done_flag</span><b>{{ localReady ? 1 : 0 }}</b></div>
          <div class="and-symbol">且</div>
          <div class="flag" :class="{ set: remoteReady }"><span>remote_arrived_flag</span><b>{{ remoteReady ? 1 : 0 }}</b></div>
          <strong class="gate-result">{{ published ? '本轮已经执行最终归约' : localReady && remoteReady ? '可以执行最终归约' : '最终归约等待中' }}</strong>
        </div>
        <div class="buffer-name">C_final <span>最终结果：L + R</span></div>
        <div class="four-tiles final" :class="{ published }"><span v-for="t in 4" :key="t">{{ published ? `Σ${t - 1}` : '—' }}</span></div>
        <div class="replica-label">节点内组播 · 仅展示这一 chunk</div>
        <div class="output-replicas"><span v-for="g in 8" :key="g" :class="{ published }">G{{ g - 1 }}<b>{{ published ? 'Σ' : '—' }}</b></span></div>
      </div>
    </div>
    <div class="mk-readout" aria-live="polite">{{ explanations[stage] }}</div>
    <p class="mk-note">L、R 分别是两个节点的部分和；空格表示本轮数据尚不可用。左侧格子记录计算进度，缓冲区按逻辑 tile 绘制。图示采用小规模静态归属分支，展示一种合法先后顺序；远端也可能先到。</p>
  </figure>
</template>

<style scoped>
.chunk-scope { display: grid; gap: .25rem; margin-bottom: 1rem; font-size: .9rem; }
.chunk-scope span, .muted { color: var(--diagram-muted); font-size: .8rem; }
.trace-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
.contribution-panel, .remote-panel { min-width: 0; padding: .85rem; border: 1px solid var(--diagram-line); border-radius: 8px; }
.panel-label { font-weight: 650; font-size: .95rem; margin-bottom: .7rem; }
.contribution-matrix { display: grid; grid-template-columns: 50px repeat(4, minmax(0,1fr)) 30px; gap: 4px; align-items: center; text-align: center; }
.gpu-label, .tile-count { font-size: .75rem; }
.contribution { min-height: 24px; border: 1px dashed var(--diagram-line); color: var(--diagram-muted); border-radius: 3px; }
.contribution.ready { border-style: solid; border-color: var(--mk-compute); background: color-mix(in srgb,var(--mk-compute) 12%,transparent); color: var(--mk-compute); }
.signal-count { margin-top: .5rem; font-size: .8rem; }
.local-reduction, .dual-store { text-align: center; color: var(--mk-local); margin: .65rem 0; font-size: .85rem; }
.local-buffers { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; padding-top: .6rem; }
.buffer-branch { position: relative; min-width: 0; padding-top: 1rem; }
.buffer-branch::before { content: ''; position: absolute; top: 0; width: calc(50% + .5rem); height: .7rem; border-top: 1px solid var(--mk-local); }
.buffer-branch:first-child::before { left: 50%; border-left: 1px solid var(--mk-local); }
.buffer-branch:last-child::before { right: 50%; border-right: 1px solid var(--mk-local); }
.buffer-branch::after { content: '↓'; position: absolute; top: .15rem; left: calc(50% - .3rem); color: var(--mk-local); }
.buffer-branch .buffer-name { display: grid; gap: .25rem; }
.buffer-purpose { margin-top: .65rem; font-size: .8rem; color: var(--diagram-muted); }
.buffer-name { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .25rem; font-size: .85rem; font-weight: 650; margin: .5rem 0; }
.buffer-name span { color: var(--diagram-muted); font-size: .75rem; font-weight: 400; }
.four-tiles { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 3px; }
.four-tiles > span { display: grid; place-items: center; min-height: 32px; border: 1px dashed var(--diagram-line); border-radius: 3px; color: var(--diagram-muted); }
.four-tiles.local-ready > span { color: var(--mk-local); border: 1px solid var(--mk-local); background: color-mix(in srgb,var(--mk-local) 10%,transparent); }
.send-status { margin-top: .65rem; font-size: .8rem; color: var(--diagram-muted); }.send-status.enabled { color: var(--mk-network); }
.remote-origin { padding: .7rem; border: 1px solid var(--mk-network); border-radius: 6px; color: var(--mk-network); text-align: center; }
.network-arrow { text-align: center; margin: 1.25rem 0; color: var(--diagram-muted); }.network-arrow.arrived { color: var(--mk-network); }
.four-tiles.remote-ready > span { border: 1px solid var(--mk-network); background: color-mix(in srgb,var(--mk-network) 10%,transparent); color: var(--mk-network); }
.readiness-gate { margin: 1.1rem 0; padding: .8rem; border: 1px solid var(--diagram-line); border-radius: 6px; }
.flag { display: flex; justify-content: space-between; align-items: center; gap: .35rem; font-size: .8rem; color: var(--diagram-muted); }.flag.set { color: var(--mk-local); }
.flag b { font-size: 1rem; border: 1px solid currentColor; padding: 0 .45rem; border-radius: 3px; }
.and-symbol { text-align: center; font-size: .75rem; color: var(--diagram-muted); }.gate-result { display: block; text-align: center; margin-top: .6rem; font-size: .85rem; }
.four-tiles.published > span, .output-replicas > span.published { color: var(--mk-control); background: color-mix(in srgb,var(--mk-control) 10%,transparent); border: 1px solid var(--mk-control); }
.replica-label { font-size: .8rem; color: var(--diagram-muted); margin: .75rem 0 .4rem; }
.output-replicas { display: grid; grid-template-columns: repeat(4,1fr); gap: 4px; }.output-replicas > span { display: grid; justify-items: center; padding: .2rem; border: 1px dashed var(--diagram-line); border-radius: 3px; font-size: .7rem; color: var(--diagram-muted); }.output-replicas b { font-size: 1rem; }
@media(max-width: 650px) { .trace-layout { grid-template-columns: 1fr; }.contribution-panel, .remote-panel { padding: .65rem; }.network-arrow { margin: .6rem 0; } }
</style>
