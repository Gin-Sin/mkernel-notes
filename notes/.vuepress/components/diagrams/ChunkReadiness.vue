<script setup lang="ts">
import { computed, ref, useId } from 'vue'
const uid = useId()
const size = ref(4)
const ready = ref(7)
const selected = ref(0)
const groups = computed(() => Array.from({length: 16 / size.value}, (_, index) => ({index, count: Math.max(0, Math.min(size.value, ready.value - index * size.value))})))
const messages = computed(() => Math.floor(ready.value / size.value))
const batches = computed(() => Array.from({length: Math.ceil(messages.value / 8)}, (_, i) => Math.min(8, messages.value - i * 8)))
</script>
<template>
  <figure class="mk-figure chunk-demo" aria-label="计算 tile、网络 chunk 和提交 batch 的不同分组">
    <figcaption><strong>tile 已经算完，什么时候能发？</strong><span>16 个 tile 的就绪示意</span></figcaption>
    <div class="mk-toolbar" role="group" aria-label="选择每个网络 chunk 的 tile 数">
      <span>一个 chunk 包含</span>
      <button v-for="n in [1, 4, 8]" :key="n" :aria-pressed="size === n" @click="size = n; selected = 0">{{ n }} tiles</button>
    </div>
    <label :for="`${uid}-ready`">本地已完成：<strong>{{ ready }} / 16 tiles</strong></label>
    <input :id="`${uid}-ready`" v-model.number="ready" type="range" min="0" max="16" />
    <div class="chunk-grid" :style="{ '--group-cols': size }">
      <button v-for="group in groups" :key="group.index" class="chunk-box" :class="{ sendable: group.count === size, selected: selected === group.index }" :aria-pressed="selected === group.index" :aria-label="`追踪 chunk C${group.index}，${group.count}/${size} 个 tile 完成`" @click="selected = group.index">
        <span class="chunk-name">C{{ group.index }}</span>
        <span class="tile-row">
          <span v-for="tile in size" :key="tile" class="tile-square" :class="{ ready: tile <= group.count }">{{ group.index * size + tile }}</span>
        </span>
        <span class="chunk-counter">{{ group.count }}/{{ size }} <b v-if="group.count === size">✓</b></span>
      </button>
    </div>
    <div class="mk-legend"><span><i style="--swatch: var(--mk-local)"></i>tile 完成</span><span><i style="--swatch: var(--mk-network)"></i>实线框：chunk 可发送</span><span>粗框：同一个 chunk 与命令</span></div>
    <div class="mapping-link" aria-live="polite">C{{ selected }} · {{ groups[selected].count }}/{{ size }} <span aria-hidden="true">↓</span> {{ groups[selected].count === size ? `对应下方命令 C${selected}` : '尚无可提交命令' }}</div>
    <div class="submission">
      <span class="submission-label">Proxy 提交</span>
      <div v-if="!messages" class="empty">还没有完整 chunk</div>
      <div v-for="(count, i) in batches" :key="i" class="batch">
        <div class="commands"><span v-for="cmd in count" :key="cmd" class="command" :class="{ selected: selected === i * 8 + cmd - 1 }">C{{ i * 8 + cmd - 1 }}</span></div>
        <span>一次提交 · {{ count }} 条独立命令</span>
      </div>
    </div>
    <div class="mk-readout" aria-live="polite"><strong>{{ messages }} 个 chunk 可以发送</strong>，{{ ready % size }} 个已完成 tile 还在等待同组数据。每个命令保留独立的到达通知。</div>
    <p class="mk-note">C0、C1 等为 chunk 编号；点击块可追踪对应命令。顺序就绪仅为示意。下方按同连接命令同时可见、最多 8 条分批；少于 8 条也可提交。论文默认 4 tiles / 256 KiB，1、8 tiles 为交互对照。</p>
  </figure>
</template>
<style scoped>
.chunk-demo label { font-size: .95rem; }.chunk-demo input { margin-bottom: 1.1rem; }
.chunk-grid { display: flex; flex-wrap: wrap; gap: .65rem; }
.chunk-grid .chunk-box { flex: 0 1 auto; padding: .3rem; border: 1px dashed var(--diagram-line); border-radius: 5px; min-width: 0; color: inherit; background: transparent; }
.chunk-name { display: block; font-size: .8rem; margin-bottom: .3rem; color: var(--diagram-muted); }
.chunk-grid .chunk-box.selected, .command.selected { outline: 2px solid var(--vp-c-text); outline-offset: 2px; }
.chunk-grid { padding: 4px; }
.mapping-link { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; padding: .3rem 0 .9rem; font-size: .85rem; }
.mapping-link > span { font-size: 1.5rem; color: var(--mk-control); }
.chunk-grid .chunk-box.sendable { border: 2px solid var(--mk-network); padding: calc(.3rem - 1px); background: color-mix(in srgb, var(--mk-network) 5%, transparent); }
.tile-row { display: grid; grid-template-columns: repeat(var(--group-cols), 1fr); gap: 3px; }
.tile-square { display: grid; place-items: center; width: 29px; height: 31px; background: var(--vp-c-bg-alt); border: 1px solid var(--diagram-line); color: var(--diagram-muted); border-radius: 3px; font-size: .8rem; }
.tile-square.ready { background: color-mix(in srgb, var(--mk-local) 18%, transparent); color: var(--mk-local); border-color: var(--mk-local); }
.chunk-counter { display: block; text-align: center; font-size: .75rem; color: var(--diagram-muted); margin-top: .2rem; }
.chunk-counter b { color: var(--mk-network); }
.submission { border-top: 1px solid var(--diagram-line); padding-top: 1rem; display: flex; flex-wrap: wrap; gap: .7rem; align-items: center; }
.submission-label { font-size: .9rem; margin-right: .3rem; }
.batch { padding: .5rem; border: 1px solid var(--mk-control); border-radius: 6px; }
.commands { display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: .3rem; }
.command { width: 30px; height: 30px; border: 1px solid var(--mk-control); color: var(--mk-control); text-align: center; line-height: 28px; font-size: .75rem; border-radius: 2px; }
.batch > span, .empty { font-size: .875rem; color: var(--diagram-muted); }
@media (max-width: 400px) { .tile-square { width: 24px; }.chunk-grid { gap: .5rem; } }
</style>
