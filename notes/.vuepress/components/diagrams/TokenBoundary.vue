<script setup lang="ts">
import { computed, ref } from 'vue'
const left = ref(true)
const right = ref(false)
const waiting = computed(() => !left.value && !right.value ? '等待两个 chunk' : `等待 chunk ${left.value ? 1 : 0}`)
</script>
<template>
  <figure class="mk-figure boundary-demo" aria-label="一个 token 横跨两个网络 chunk 的字节布局">
    <figcaption><strong>跨界 token，要等两块数据到齐</strong><span>字节布局 · 示意 token 为 16 KiB</span></figcaption>
    <div class="mk-toolbar" role="group" aria-label="切换两个 chunk 的到达状态">
      <button :aria-pressed="left" @click="left = !left">chunk 0：{{ left ? '已到达' : '未到达' }}</button>
      <button :aria-pressed="right" @click="right = !right">chunk 1：{{ right ? '已到达' : '未到达' }}</button>
    </div>
    <div class="buffer-view">
      <div :class="{ arrived: left }">chunk 0 · 512 KiB</div><div :class="{ arrived: right }">chunk 1 · 512 KiB</div>
      <i class="tiny-token"></i>
      <i class="zoom-window" aria-hidden="true"></i>
    </div>
    <div class="buffer-axis"><span>0</span><span>512 KiB</span><span>1024 KiB</span></div>
    <div class="zoom-connector"><svg viewBox="0 0 100 16" preserveAspectRatio="none" aria-hidden="true"><path d="M46.875 0 L0 16 M53.125 0 L100 16" /></svg><span>480–544 KiB · 横向放大 16 倍</span></div>
    <div class="zoom-view">
      <div class="chunk-halves"><span :class="{ arrived: left }"></span><span :class="{ arrived: right }"></span></div>
      <div class="token-parts"><span :class="{ arrived: left }"></span><span :class="{ arrived: right }"></span></div>
      <span class="boundary-line"></span>
      <span class="token-label">token · 504–520 KiB</span>
    </div>
    <div class="buffer-axis"><span>480</span><span>512 KiB</span><span>544</span></div>
    <div class="consume-state" :class="{ allowed: left && right }" aria-live="polite"><strong>{{ left && right ? '✓ 完整 token 可消费' : waiting }}</strong><span>前 8 KiB {{ left ? '✓' : '…' }}　后 8 KiB {{ right ? '✓' : '…' }}</span></div>
    <p class="mk-note">紫条是同一个 token；两图各按所标字节范围画比例。chunk 为论文的 512 KiB，token 的位置与大小为教学示例。</p>
  </figure>
</template>
<style scoped>
.buffer-view { display: flex; position: relative; height: 64px; }.buffer-view > div { width: 50%; display: grid; place-items: center; border: 1px dashed var(--diagram-line); color: var(--diagram-muted); font-size: .875rem; }.buffer-view > div.arrived { border: 1px solid var(--mk-local); background: color-mix(in srgb, var(--mk-local) 15%, transparent); color: var(--mk-local); }.tiny-token { position: absolute; left: 49.21875%; width: 1.5625%; height: 18px; bottom: 0; background: var(--mk-control); }
.buffer-axis { display: flex; justify-content: space-between; color: var(--diagram-muted); font-size: .8rem; margin-top: .35rem; }
.zoom-window { position: absolute; left: 46.875%; width: 6.25%; height: 100%; border: 1px dashed var(--mk-control); }
.zoom-connector { position: relative; height: 65px; color: var(--diagram-muted); font-size: .8rem; text-align: center; }
.zoom-connector svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.zoom-connector path { fill: none; stroke: var(--diagram-muted); stroke-width: 1; vector-effect: non-scaling-stroke; stroke-dasharray: 4 3; }
.zoom-connector > span { position: relative; top: 25px; padding: .2rem .4rem; background: var(--vp-c-bg); }
.zoom-view { height: 116px; position: relative; border: 1px solid var(--diagram-line); border-radius: 5px; overflow: hidden; }.chunk-halves { height: 100%; display: flex; }.chunk-halves span { width: 50%; background: var(--vp-c-bg-alt); }.chunk-halves span.arrived { background: color-mix(in srgb, var(--mk-local) 9%, transparent); }.boundary-line { position: absolute; left: 50%; height: 100%; top: 0; border-left: 1px dashed var(--diagram-muted); }.token-parts { position: absolute; left: 37.5%; width: 25%; top: 40px; height: 30px; display: flex; z-index: 1; }.token-parts span { width: 50%; border: 2px dashed var(--mk-control); background: var(--vp-c-bg); }.token-parts span.arrived { background: color-mix(in srgb, var(--mk-control) 35%, var(--vp-c-bg)); border-style: solid; }.token-label { position: absolute; bottom: 5px; width: 100%; text-align: center; color: var(--mk-control); font-size: .875rem; }.consume-state { margin-top: 1rem; padding: .7rem; display: flex; flex-wrap: wrap; justify-content: space-between; gap: .5rem; background: var(--vp-c-bg-alt); border: 1px dashed var(--diagram-line); font-size: .9rem; }.consume-state.allowed { color: var(--mk-local); border: 1px solid var(--mk-local); }
</style>
