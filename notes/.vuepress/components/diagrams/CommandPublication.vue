<script setup lang="ts">
import { ref } from 'vue'
const stage = ref(1)
const steps = ['空槽位', '写入内容', '发布命令头', 'CPU 取走记录']
const fields = ['命令头', 'remote_offset', 'local_offset', 'bytes / src_view', 'row_count', '入队时间']
const values = ['WRITE', '远端位置', '本地位置', '256 KiB / 0', '4 tiles', '时间戳']
const descriptions = [
  'CPU 看到 EMPTY，poll 返回 false。GPU 领取到槽位后，还需满足队列空间条件才能写入。',
  '后 40 字节已经写好，但命令头仍为 EMPTY。CPU 暂不读取这条命令。',
  'GPU 最后发布含 WRITE 的前 8 字节。CPU 观察到非 EMPTY 的类型后，才复制完整记录。',
  'CPU 复制出 48 字节记录并清空 cmd_type。其余字节可以保留旧值；proxy 随后推进 tail 才归还相应队列额度。',
]
</script>

<template>
  <figure class="mk-figure command-publication" aria-label="48 字节命令的内容先写入、命令头后发布">
    <figcaption><strong>40 字节已写好，CPU 为什么还不能取走？</strong><span>同一 FIFO 槽位的先后快照 · 每格 8 字节</span></figcaption>
    <div class="mk-toolbar" role="group" aria-label="选择命令发布阶段"><button v-for="(name, i) in steps" :key="name" :aria-pressed="stage === i" @click="stage = i">{{ i + 1 }}. {{ name }}</button></div>
    <div class="record-label">页锁定主机内存中的 48 字节记录</div>
    <div class="record-words" role="group" aria-label="命令槽位的六个八字节字">
      <div v-for="(field, i) in fields" :key="field" class="word" :class="{ header: i === 0, written: stage > 0 && i > 0, committed: stage === 2 && i === 0, stale: stage === 3 && i > 0 }">
        <span class="byte-range">{{ i * 8 }}–{{ i * 8 + 7 }} B</span>
        <strong>{{ i === 0 ? (stage === 2 ? 'WRITE' : 'EMPTY') : (stage === 0 ? '—' : stage === 3 ? '旧内容' : values[i]) }}</strong>
        <span class="field-name">{{ field }}</span>
      </div>
    </div>
    <div class="publication-order"><span>① 先写后 5 格：40 B</span><span>② 最后发布首格：8 B</span></div>
    <div class="cpu-read" :class="{ allowed: stage === 2, copied: stage === 3 }">
      <span class="cpu-label">CPU poll</span>
      <strong>{{ stage === 3 ? '已有完整命令副本 ✓' : stage === 2 ? '可复制完整 48 B ✓' : 'EMPTY · 暂不读取' }}</strong>
      <span>{{ stage === 3 ? '原槽位的 cmd_type 已清空' : '只凭命令头判断记录是否已发布' }}</span>
    </div>
    <div class="mk-readout" aria-live="polite">{{ descriptions[stage] }}</div>
    <p class="mk-note">图中只有控制记录。256 KiB 数据仍在 GPU 的 staging_buf 中，NIC 根据命令中的位置和长度读取它。字段按 8 字节字分组，部分字内还有其他字段；此图展示发布顺序，内存可见性仍需结合具体平台核对。</p>
  </figure>
</template>

<style scoped>
.record-label { margin-bottom: .65rem; font-size: .9rem; font-weight: 650; }
.record-words { display: grid; grid-template-columns: repeat(6,minmax(0,1fr)); gap: 5px; }
.word { min-width: 0; padding: .55rem .25rem; border: 1px dashed var(--diagram-line); border-radius: 5px; display: grid; justify-items: center; align-content: space-between; gap: .6rem; color: var(--diagram-muted); text-align: center; }
.word.header { border: 2px solid var(--mk-control); }.word.written { border: 1px solid var(--mk-compute); background: color-mix(in srgb,var(--mk-compute) 10%,transparent); color: var(--mk-compute); }
.word.committed { background: color-mix(in srgb,var(--mk-control) 14%,transparent); color: var(--mk-control); }.word.stale { color: var(--diagram-muted); background: var(--vp-c-bg-soft); border-color: var(--diagram-line); }
.word strong { font-size: .8rem; }.byte-range { font-size: .75rem; }.field-name { font-size: .7rem; overflow-wrap: anywhere; }
.publication-order { display: flex; justify-content: space-between; flex-wrap: wrap; gap: .5rem; margin-top: .65rem; font-size: .8rem; color: var(--diagram-muted); }
.cpu-read { display: grid; grid-template-columns: auto 1fr; gap: .35rem 1rem; align-items: center; padding: .85rem; margin: 1rem 0; border: 1px solid var(--diagram-line); border-radius: 6px; }.cpu-read > span:last-child { grid-column: 2; font-size: .8rem; color: var(--diagram-muted); }.cpu-read strong { font-size: .9rem; }.cpu-label { grid-row: span 2; color: var(--mk-control); font-size: .9rem; }.cpu-read.allowed, .cpu-read.copied { border-color: var(--mk-local); }
@media(max-width: 650px) { .record-words { grid-template-columns: repeat(3,minmax(0,1fr)); }.cpu-read { grid-template-columns: 1fr; }.cpu-read > span:last-child { grid-column: 1; }.cpu-label { grid-row: auto; } }
</style>
