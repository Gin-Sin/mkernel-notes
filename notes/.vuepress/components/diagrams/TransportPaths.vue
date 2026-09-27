<script setup lang="ts">
import { ref, useId } from 'vue'
const mode = ref<'proxy' | 'ibgda'>('proxy')
const id = useId()
</script>
<template>
  <figure class="mk-figure transport-demo" aria-label="控制命令与 GPU payload 的分离路径">
    <figcaption><strong>CPU 搬的是命令，NIC 搬的是数据</strong><span>责任与内存位置示意</span></figcaption>
    <div class="mk-toolbar" role="group" aria-label="选择网络提交后端">
      <button :aria-pressed="mode === 'proxy'" @click="mode = 'proxy'">Host proxy</button>
      <button :aria-pressed="mode === 'ibgda'" @click="mode = 'ibgda'">IBGDA</button>
    </div>
    <div class="transport-layout">
      <svg class="transport-wide" viewBox="0 0 700 330" role="img" :aria-label="mode === 'proxy' ? 'GPU 发出小命令给 CPU，CPU 提交 NIC；payload 从 GPU 经 NIC 到远端 GPU' : 'GPU 直接控制 NIC，payload 仍从 GPU 经 NIC 到远端 GPU'">
        <defs>
          <marker :id="`${id}-control`" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--mk-control)" /></marker>
          <marker :id="`${id}-data`" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--mk-network)" /></marker>
        </defs>
        <rect x="8" y="14" width="410" height="299" rx="10" class="node-bg" /><rect x="432" y="14" width="260" height="299" rx="10" class="node-bg" />
        <text x="24" y="39" class="node-label">节点 0</text><text x="448" y="39" class="node-label">节点 1</text>
        <rect x="235" y="52" width="158" height="76" rx="7" class="cpu-box" :class="{ muted: mode === 'ibgda' }" />
        <text x="248" y="76" class="small">CPU · {{ mode === 'proxy' ? 'proxy' : '不参与提交' }}</text>
        <g v-if="mode === 'proxy'"><rect v-for="i in 8" :key="i" :x="247 + (i - 1) * 17" y="89" width="12" height="22" rx="2" class="command" /></g>
        <g v-for="node in [0, 1]" :key="node" :transform="`translate(${node ? 513 : 28}, 154)`">
          <rect width="158" height="137" rx="8" class="gpu-box" />
          <text x="12" y="25">{{ node ? '远端 GPU' : '本地 GPU' }}</text>
          <text x="12" y="48" class="small">HBM · payload</text>
          <rect v-for="i in 12" :key="i" :x="12 + (i - 1) % 4 * 33" :y="61 + Math.floor((i - 1) / 4) * 20" width="29" height="16" rx="2" class="payload-cell" />
        </g>
        <rect x="250" y="204" width="72" height="50" rx="5" class="nic" /><text x="286" y="235" text-anchor="middle">NIC</text>
        <rect x="437" y="204" width="62" height="50" rx="5" class="nic" /><text x="468" y="235" text-anchor="middle">NIC</text>
        <path d="M 188 229 H 246 M 326 229 H 432 M 501 229 H 511" class="data-path" :marker-end="`url(#${id}-data)`" />
        <text x="379" y="282" text-anchor="middle" class="small">RDMA · 256 KiB chunk 示例</text>
        <g v-if="mode === 'proxy'">
          <path d="M 105 150 V 89 H 230" class="control-path" :marker-end="`url(#${id}-control)`" />
          <text x="119" y="76" class="small control-text">48 B 命令</text>
          <path d="M 313 132 V 169 H 286 V 199" class="control-path" :marker-end="`url(#${id}-control)`" />
          <text x="324" y="160" class="small control-text">批量提交</text>
        </g>
        <g v-else>
          <path d="M 106 150 V 100 H 204 V 177 H 286 V 199" class="control-path" :marker-end="`url(#${id}-control)`" />
          <text x="28" y="76" class="small control-text">GPU fence + doorbell</text>
        </g>
      </svg>
      <svg class="transport-mobile" viewBox="0 0 330 484" role="img" :aria-label="mode === 'proxy' ? '上方本地节点：GPU 发命令给 CPU proxy，由 CPU 提交 NIC；payload 经 NIC 直接到下方远端 GPU' : '上方 GPU 直接提交 NIC，payload 经 NIC 直接到下方远端 GPU'">
        <defs>
          <marker :id="`${id}-mobile-control`" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--mk-control)" /></marker>
          <marker :id="`${id}-mobile-data`" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--mk-network)" /></marker>
        </defs>
        <rect x="8" y="10" width="314" height="285" rx="10" class="node-bg" /><rect x="8" y="326" width="314" height="148" rx="10" class="node-bg" />
        <text x="24" y="34" class="node-label">节点 0</text><text x="24" y="350" class="node-label">节点 1</text>
        <rect x="179" y="58" width="129" height="70" rx="7" class="cpu-box" :class="{ muted: mode === 'ibgda' }" />
        <text x="190" y="82" class="small">{{ mode === 'proxy' ? 'CPU · proxy' : 'CPU（不提交）' }}</text>
        <g v-if="mode === 'proxy'"><rect v-for="i in 8" :key="i" :x="190 + (i - 1) * 13" y="96" width="9" height="20" rx="2" class="command" /></g>
        <g v-for="node in [0, 1]" :key="node" :transform="`translate(24, ${node ? 359 : 159})`">
          <rect width="127" height="105" rx="7" class="gpu-box" />
          <text x="12" y="23" class="small">{{ node ? '远端 GPU' : '本地 GPU' }}</text>
          <text x="12" y="44" class="small">HBM · payload</text>
          <rect v-for="i in 8" :key="i" :x="12 + (i - 1) % 4 * 26" :y="61 + Math.floor((i - 1) / 4) * 20" width="22" height="13" rx="2" class="payload-cell" />
        </g>
        <rect x="212" y="181" width="78" height="48" rx="5" class="nic" /><text x="251" y="211" text-anchor="middle">NIC</text>
        <rect x="212" y="386" width="78" height="48" rx="5" class="nic" /><text x="251" y="416" text-anchor="middle">NIC</text>
        <path v-for="path in ['M 155 214 H 207', 'M 251 234 V 381', 'M 207 410 H 155']" :key="path" :d="path" class="data-path" :marker-end="`url(#${id}-mobile-data)`" />
        <text x="24" y="316" class="small">RDMA · 256 KiB 示例</text>
        <g v-if="mode === 'proxy'">
          <path v-for="path in ['M 87 154 V 93 H 174', 'M 244 133 V 176']" :key="path" :d="path" class="control-path" :marker-end="`url(#${id}-mobile-control)`" />
          <text x="35" y="81" class="small control-text">48 B 命令</text>
          <text x="252" y="157" class="small control-text">提交</text>
        </g>
        <g v-else>
          <path d="M 87 154 V 115 H 165 V 150 H 251 V 176" class="control-path" :marker-end="`url(#${id}-mobile-control)`" />
          <text x="24" y="81" class="small control-text">fence + doorbell</text>
        </g>
      </svg>
    </div>
    <div class="mk-legend"><span><i style="--swatch: var(--mk-control)"></i>虚线：控制请求</span><span><i style="--swatch: var(--mk-network)"></i>实线：GPU payload</span></div>
    <div class="mk-readout" aria-live="polite">{{ mode === 'proxy' ? 'GPU 决定何时有数据可发；CPU 可把多个就绪请求一并提交。payload 留在 GPU 内存中。' : 'GPU 直接提交 NIC，省去 CPU proxy；逐 chunk 的 fence 与 doorbell 仍有成本。数据路径没有因此变短。' }}</div>
    <p class="mk-note">线宽区分控制与数据，不表示字节比例或带宽；图只比较提交责任，不预测性能。</p>
  </figure>
</template>
<style scoped>
svg { width: 100%; font-size: 16px; }.transport-mobile { display: none; }
@media (max-width: 600px) { .transport-wide { display: none; }.transport-mobile { display: block; } }
.node-bg { fill: var(--vp-c-bg-alt); stroke: var(--diagram-line); }.node-label { font-weight: 600; }.small { font-size: 14px; }
.cpu-box { fill: color-mix(in srgb, var(--mk-control) 7%, var(--vp-c-bg)); stroke: var(--mk-control); }.cpu-box.muted { fill: var(--vp-c-bg); stroke: var(--diagram-line); }
.command { fill: color-mix(in srgb, var(--mk-control) 25%, var(--vp-c-bg)); stroke: var(--mk-control); }
.gpu-box { fill: var(--vp-c-bg); stroke: var(--diagram-line); }.payload-cell { fill: color-mix(in srgb, var(--mk-network) 30%, var(--vp-c-bg)); stroke: var(--mk-network); }
.nic { fill: var(--vp-c-bg); stroke: var(--diagram-muted); }.data-path { stroke: var(--mk-network); stroke-width: 5; fill: none; }.control-path { stroke: var(--mk-control); stroke-width: 2; stroke-dasharray: 5 4; fill: none; }.control-text { fill: var(--mk-control); }
</style>
