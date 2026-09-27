<script setup lang="ts">
import { ref } from 'vue'
const available = ref(2)
const phases = ['本 GPU 就绪', '同节点就绪', '首块远端就绪', '全部就绪']
const origins = ['本 GPU', '同节点 GPU', '远端 GPU 0', '远端 GPU 1']
</script>
<template>
  <figure class="mk-figure gather-demo" aria-label="AllGather 输入行与 GEMM 输出行沿 M 轴对齐的分块图">
    <figcaption><strong>A 的一段行到齐，就能算对应的 C</strong><span>单 GPU 视角 · 逻辑分块示意</span></figcaption>
    <div class="mk-toolbar" role="group" aria-label="选择输入到达阶段">
      <button v-for="(phase, i) in phases" :key="phase" :aria-pressed="available === i + 1" @click="available = i + 1">{{ phase }}</button>
    </div>
    <div class="gemm-board">
      <div class="mapping-key"><strong>Cᵢ = Aᵢ B</strong><span>同一份本地 B<br>用于各段 A 的计算</span><span>M 轴 ↓<br>每段 m 行</span></div>
      <div class="weights">
        <strong>B · K × Nₗ</strong>
        <span class="axis-label">Nₗ →</span>
        <div class="weight-grid" role="img" aria-label="本 GPU 已可用的 B，纵轴 K，横轴本地输出列 Nₗ"><span v-for="i in 16" :key="i"></span></div>
        <span class="weight-k">K ↓</span>
        <div class="column-arrows" aria-hidden="true"><span v-for="i in 4" :key="i">↓</span></div>
      </div>
      <div class="matrix-title a-title"><strong>A · M × K</strong><span>K →</span></div>
      <div class="matrix-title c-title"><strong>C · M × Nₗ</strong><span>Nₗ →</span></div>
      <template v-for="(origin, row) in origins" :key="origin">
        <div class="row-block input-block" :class="[`origin-${row}`, { available: row < available }]" :data-row="row">
          <span class="row-label">A{{ row }} · {{ origin }}</span>
          <div class="row-cells" aria-hidden="true"><span v-for="i in 4" :key="i"></span></div>
          <span class="row-state">{{ row < available ? '✓ 输入可用' : '… 输入未到' }}</span>
        </div>
        <span class="row-link" :class="{ available: row < available }" aria-hidden="true">→</span>
        <div class="row-block output-block" :class="[`origin-${row}`, { available: row < available }]" :data-row="row">
          <span class="row-label">C{{ row }} · 对应 m 行</span>
          <div class="row-cells" aria-hidden="true"><span v-for="i in 4" :key="i"></span></div>
          <span class="row-state">{{ row < available ? '可计算' : `等待 A${row}` }}</span>
        </div>
      </template>
    </div>
    <div class="availability-compare" aria-label="相同输入状态下可计算的输出行块比较">
      <div v-for="fused in [false, true]" :key="String(fused)" class="eligibility-row">
        <strong>{{ fused ? '局部放行' : '等完整 AllGather' }}</strong>
        <div class="eligibility-tiles"><span v-for="i in 4" :key="i" :class="{ eligible: fused ? i <= available : available === 4 }">C{{ i - 1 }}</span></div>
        <b>{{ fused ? available : available === 4 ? 4 : 0 }}/4</b>
      </div>
    </div>
    <div class="mk-readout" aria-live="polite">{{ available }}/4 段输入已可用；局部放行允许计算 {{ available }}/4 段输出。<template v-if="available < 4">其余行继续等输入。</template><template v-else>所有行都可计算，先前已可用的行无需等到此刻。</template></div>
    <p class="mk-note">教学布局缩为 2 节点 × 2 GPU，M = 4m；Nₗ 是本 rank 的输出列数。填色表示具备计算条件，不表示已经算完。每段输出仍需其 A 行的全部 K 贡献；实际可沿 K 更细地检查就绪。</p>
  </figure>
</template>
<style scoped>
.gemm-board { display: grid; grid-template-columns: minmax(0, 1fr) 32px minmax(0, 1fr); gap: 8px 0; }
.mapping-key { grid-column: 1; display: flex; flex-direction: column; justify-content: space-around; gap: .7rem; padding: .4rem 0; font-size: .875rem; color: var(--diagram-muted); }
.mapping-key strong { font-size: 1.15rem; color: var(--vp-c-text); }
.weights { grid-column: 3; position: relative; }
.weights > strong { font-size: .9rem; display: block; }
.axis-label { display: block; text-align: right; font-size: .8rem; color: var(--diagram-muted); }
.weight-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px; height: 80px; border: 1px solid var(--mk-control); padding: 4px; }
.weight-grid span { background: color-mix(in srgb, var(--mk-control) 20%, transparent); border: 1px solid color-mix(in srgb, var(--mk-control) 40%, transparent); }
.weight-k { position: absolute; left: -26px; top: 69px; font-size: .75rem; color: var(--diagram-muted); }
.column-arrows { display: grid; grid-template-columns: repeat(4, 1fr); text-align: center; color: var(--mk-control); }
.matrix-title { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .2rem; font-size: .9rem; }
.matrix-title span { color: var(--diagram-muted); font-size: .8rem; }.a-title { grid-column: 1; }.c-title { grid-column: 3; }
.row-block { --origin: var(--mk-network); padding: .5rem; border: 1px dashed var(--diagram-line); border-radius: 4px; color: var(--diagram-muted); }
.origin-0 { --origin: var(--mk-compute); }.origin-1 { --origin: var(--mk-local); }
.input-block { grid-column: 1; }.output-block { grid-column: 3; }
.row-block.available { border-style: solid; border-color: var(--origin); background: color-mix(in srgb, var(--origin) 5%, transparent); color: var(--vp-c-text); }
.row-label { display: block; font-size: .85rem; }.row-state { display: block; font-size: .8rem; margin-top: .25rem; }
.row-cells { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px; height: 14px; margin-top: .35rem; }
.row-cells span { border: 1px dashed var(--diagram-line); background: var(--vp-c-bg-alt); }
.available .row-cells span { border: 1px solid var(--origin); background: color-mix(in srgb, var(--origin) 20%, transparent); }
.row-link { display: grid; place-items: center; grid-column: 2; color: var(--diagram-line); font-size: 1.4rem; }.row-link.available { color: var(--diagram-muted); }
.availability-compare { border-top: 1px solid var(--diagram-line); margin-top: 1.1rem; padding-top: .7rem; }
.eligibility-row { display: grid; grid-template-columns: 132px 1fr 28px; gap: .6rem; align-items: center; margin: .4rem 0; font-size: .8rem; }.eligibility-row strong { font-weight: 500; }.eligibility-row b { text-align: right; }
.eligibility-tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }.eligibility-tiles span { text-align: center; border: 1px dashed var(--diagram-line); border-radius: 3px; color: var(--diagram-muted); padding: .2rem 0; }.eligibility-tiles .eligible { border: 1px solid var(--mk-compute); background: color-mix(in srgb, var(--mk-compute) 16%, transparent); color: var(--mk-compute); }
@media (max-width: 600px) { .gemm-board { grid-template-columns: minmax(0, 1fr) 26px minmax(0, 1fr); }.mapping-key { font-size: .8rem; }.row-block { padding: .4rem; }.row-label { font-size: .78rem; }.matrix-title strong { font-size: .85rem; }.eligibility-row { grid-template-columns: 1fr 28px; gap: .3rem; }.eligibility-row strong { grid-column: 1 / -1; }.weight-k { left: -23px; } }
</style>
