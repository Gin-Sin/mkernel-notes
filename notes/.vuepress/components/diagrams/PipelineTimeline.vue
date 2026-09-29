<script setup lang="ts">
import { computed, ref, useId } from 'vue'
const uid = useId()
const chunk = ref(2)
const tileCount = 6
const costs = [4, 2, 3]
const stages = ['计算', 'NVLink', '网络']
function schedule(group: number) {
  const lanes: { start: number; end: number; tile: number }[][] = [[], [], []]
  let localEnd = 0
  let networkEnd = 0
  for (let tile = 0; tile < tileCount; tile++) lanes[0].push({ start: tile * 4, end: (tile + 1) * 4, tile })
  for (let begin = 0; begin < tileCount; begin += group) {
    const count = Math.min(group, tileCount - begin)
    const localStart = Math.max((begin + count) * 4, localEnd)
    for (let i = 0; i < count; i++) lanes[1].push({ start: localStart + i * 2, end: localStart + (i + 1) * 2, tile: begin + i })
    localEnd = localStart + count * 2
    const networkStart = Math.max(localEnd, networkEnd)
    for (let i = 0; i < count; i++) lanes[2].push({ start: networkStart + i * 3, end: networkStart + (i + 1) * 3, tile: begin + i })
    networkEnd = networkStart + count * 3
  }
  return { lanes, end: networkEnd, first: lanes[2][0].start }
}
const panels = computed(() => [
  { label: '整块串行', detail: '全部完成后放行', ...schedule(6) },
  { label: '按 chunk 放行', detail: `每 ${chunk.value} 个 tile 放行`, ...schedule(chunk.value) },
  { label: '按 tile 放行', detail: '每个 tile 完成后可放行', ...schedule(1) },
])
function dependency(panel: ReturnType<typeof schedule>, stage: number) {
  const x1 = panel.lanes[stage][0].end * 10
  const x2 = panel.lanes[stage + 1][0].start * 10
  const y = stage * 43 + 25
  return `M ${x1} ${y} V ${y + 8} H ${x2} V ${y + 16}`
}
</script>
<template>
  <figure class="mk-figure pipeline-demo" aria-label="三种数据放行粒度的同尺度执行时间线">
    <figcaption><strong>同样 6 个 tile，等待怎样缩短？</strong><span>调度示意 · 非实测</span></figcaption>
    <div class="mk-toolbar" role="group" aria-label="选择对照方案的 chunk 粒度">
      <span>中间一组每次放行</span>
      <button v-for="size in [2, 3, 6]" :key="size" :aria-pressed="chunk === size" @click="chunk = size">{{ size }} tiles</button>
    </div>
    <div class="mk-legend">
      <span v-for="(stage, i) in stages" :key="stage"><i :style="{ '--swatch': ['var(--mk-compute)', 'var(--mk-local)', 'var(--mk-network)'][i] }"></i>{{ stage }} {{ costs[i] }} μs / tile</span>
    </div>
    <div class="trace-key"><span>粗框与箭头：tile 1 的依赖</span><span class="wait-key">斜线：tile 1 等待同组数据</span><span>淡色区：计算结束后的尾部</span></div>
    <div class="mk-scroll" tabindex="0" role="region" aria-label="执行时间线，窄屏可横向滚动">
      <div class="timeline-canvas">
        <div v-for="(panel, index) in panels" :key="panel.label" class="schedule-panel">
          <div class="schedule-title"><strong>{{ panel.label }}</strong><span>{{ panel.detail }}</span><b>{{ panel.end }} μs</b></div>
          <div class="lanes">
          <div class="tail-band" :style="{ left: `calc(var(--lane-label) + (100% - var(--lane-label)) * 24 / 54)`, width: `calc((100% - var(--lane-label)) * ${panel.end - 24} / 54)` }"></div>
          <div v-for="(lane, stage) in panel.lanes" :key="stage" class="lane">
            <span class="lane-label">{{ stages[stage] }}</span>
            <div class="lane-track">
              <span v-if="stage > 0 && lane[0].start > panel.lanes[stage - 1][0].end" class="dependency-wait" :style="{ left: `${panel.lanes[stage - 1][0].end / 54 * 100}%`, width: `${(lane[0].start - panel.lanes[stage - 1][0].end) / 54 * 100}%` }"></span>
              <span v-for="task in lane" :key="task.tile" class="tile-task" :class="[`stage-${stage}`, { tracked: task.tile === 0 }]" :style="{ left: `${task.start / 54 * 100}%`, width: `${(task.end - task.start) / 54 * 100}%` }" :title="`tile ${task.tile + 1}：${task.start}–${task.end} μs`">{{ task.tile + 1 }}</span>
              <span class="finish" :style="{ left: `${panel.end / 54 * 100}%` }"></span>
            </div>
          </div>
          <svg class="dependencies" viewBox="0 0 540 111" preserveAspectRatio="none" aria-hidden="true">
            <defs><marker :id="`${uid}-arrow-${index}`" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0 L5 2.5 L0 5 Z" fill="var(--vp-c-text)" /></marker></defs>
            <path v-for="s in [0, 1]" :key="s" :d="dependency(panel, s)" class="dependency-path" :marker-end="`url(#${uid}-arrow-${index})`" />
          </svg>
          </div>
          <div class="tail-label">计算在 24 μs 结束 · 尾部 {{ panel.end - 24 }} μs</div>
        </div>
        <div class="axis"><span v-for="tick in [0, 9, 18, 27, 36, 45, 54]" :key="tick" :style="{ left: `${tick / 54 * 100}%` }">{{ tick }}</span></div>
        <div class="axis-label">从同一时刻开始 → 时间 / μs</div>
      </div>
    </div>
    <div class="mk-readout">网络首发：<strong>36 μs</strong> → <strong>{{ panels[1].first }} μs</strong> → <strong>6 μs</strong>。</div>
    <p class="mk-note">三组共用时间轴，假设各层串行、层间并行，忽略 SM 竞争和通知成本。mKernel 的网络 chunk 可含多个 tile；末组仅展示最细放行关系。</p>
  </figure>
</template>
<style scoped>
.timeline-canvas { min-width: 590px; padding: 0 .5rem .3rem 0; }
.schedule-panel + .schedule-panel { margin-top: 1.15rem; }
.schedule-title { display: flex; align-items: baseline; gap: .7rem; margin-bottom: .5rem; }
.schedule-title strong { font-size: .95rem; }
.schedule-title span { color: var(--diagram-muted); font-size: .875rem; }
.schedule-title b { margin-left: auto; font-size: 1rem; }
.lanes { --lane-label: 66px; position: relative; }
.lane { display: grid; grid-template-columns: 58px 1fr; align-items: center; gap: 8px; margin-bottom: 18px; position: relative; }
.lane:nth-of-type(4) { margin-bottom: 0; }
.tail-band { position: absolute; top: 0; bottom: 0; border-left: 1px dashed var(--diagram-muted); background: color-mix(in srgb, var(--mk-network) 7%, transparent); }
.dependencies { position: absolute; left: var(--lane-label); top: 0; width: calc(100% - var(--lane-label)); height: 111px; overflow: visible; pointer-events: none; }
.dependency-path { fill: none; stroke: var(--vp-c-text); stroke-width: 1.3; vector-effect: non-scaling-stroke; }
.dependency-wait { position: absolute; height: 25px; background: repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, var(--diagram-muted) 20%, transparent) 4px 6px); }
.trace-key { display: flex; flex-wrap: wrap; gap: .3rem 1rem; color: var(--diagram-muted); font-size: .8rem; margin-bottom: 1rem; }
.wait-key::before { content: ''; display: inline-block; width: 14px; height: 10px; margin-right: .3rem; background: repeating-linear-gradient(135deg, transparent 0 3px, var(--diagram-line) 3px 5px); }
.tail-label { text-align: right; color: var(--diagram-muted); font-size: .8rem; margin-top: .45rem; }
.lane-label { font-size: .875rem; color: var(--diagram-muted); }
.lane-track { height: 25px; position: relative; background: repeating-linear-gradient(to right, var(--diagram-line) 0, var(--diagram-line) 1px, transparent 1px, transparent 16.66667%); }
.tile-task { position: absolute; top: 0; height: 25px; border: 1px solid var(--tone); border-radius: 3px; background: color-mix(in srgb, var(--tone) 20%, var(--vp-c-bg)); color: var(--vp-c-text); font-size: .8rem; text-align: center; line-height: 23px; }
.stage-0 { --tone: var(--mk-compute); }.stage-1 { --tone: var(--mk-local); }.stage-2 { --tone: var(--mk-network); }
.tile-task.tracked { border: 2px solid var(--vp-c-text); line-height: 21px; background: color-mix(in srgb, var(--tone) 32%, var(--vp-c-bg)); }
.finish { position: absolute; top: -1px; height: 27px; border-left: 1px dashed var(--diagram-muted); }
.axis { position: relative; height: 24px; margin: .65rem 0 0 66px; color: var(--diagram-muted); font-size: .8rem; }
.axis span { position: absolute; transform: translateX(-50%); }.axis span:last-child { transform: translateX(-100%); }
.axis-label { text-align: right; font-size: .875rem; color: var(--diagram-muted); }
@media (max-width: 600px) {
.timeline-canvas { min-width: 0; }
.schedule-title { display: grid; grid-template-columns: 1fr auto; gap: .2rem; }
.schedule-title span { grid-column: 1 / -1; grid-row: 2; }
.schedule-title b { grid-column: 2; grid-row: 1; }
.lanes { --lane-label: 53px; }
.lane { grid-template-columns: 48px 1fr; gap: 5px; }
.tile-task { font-size: 0; }
.axis { margin-left: 53px; }
}
</style>
