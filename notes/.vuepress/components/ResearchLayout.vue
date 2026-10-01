<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, resolveComponent, watch } from "vue"
import { RouteLink, usePageData } from "vuepress/client"
import { useDarkMode } from "@vuepress/theme-default/client"
import VPPage from "./VPPage.vue"
import ResearchHero from "./ResearchHero.vue"
import { chapters } from "./chapters"

const page = usePageData()
const isDark = useDarkMode()
const SearchBox = resolveComponent("SearchBox")
const index = computed(() => chapters.findIndex(chapter => chapter.path === page.value.path))
const chapter = computed(() => chapters[index.value] ?? chapters[0])
const isHome = computed(() => index.value === 0)
const menu = ref<HTMLDialogElement>()
const menuButton = ref<HTMLButtonElement>()
const progress = ref(0)
let frame = 0
let observer: ResizeObserver | undefined

const updateProgress = () => {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    const article = document.querySelector("#content")
    if (!article) return
    const rect = article.getBoundingClientRect()
    const available = rect.height - window.innerHeight + 120
    progress.value = available > 0 ? Math.min(100, Math.max(0, (120 - rect.top) / available * 100)) : 100
  })
}
const openMenu = () => {
  menu.value?.showModal()
  document.body.style.overflow = "hidden"
}
const closeMenu = () => menu.value?.close()
const restoreMenu = () => {
  document.body.style.overflow = ""
  menuButton.value?.focus({ preventScroll: true })
}
watch(() => page.value.path, async () => {
  closeMenu()
  await nextTick()
  observer?.disconnect()
  const article = document.querySelector("#content")
  if (article) observer?.observe(article)
  updateProgress()
})
onMounted(() => {
  window.addEventListener("scroll", updateProgress, { passive: true })
  window.addEventListener("resize", updateProgress, { passive: true })
  observer = new ResizeObserver(updateProgress)
  const article = document.querySelector("#content")
  if (article) observer.observe(article)
  updateProgress()
})
onUnmounted(() => {
  window.removeEventListener("scroll", updateProgress)
  window.removeEventListener("resize", updateProgress)
  cancelAnimationFrame(frame)
  observer?.disconnect()
  document.body.style.overflow = ""
})
</script>

<template>
  <div class="vp-theme-container research-site no-sidebar" :class="{ 'research-home': isHome }" vp-container>
    <a class="skip-to-content" href="#content">跳到正文</a>
    <header class="research-header">
      <RouteLink to="/" class="research-brand" aria-label="mKernel 论文笔记首页">
        <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M3 10 16 3l13 7-13 7Z M3 17l13 7 13-7 M3 24l13 7 13-7" /></svg>
        <span>mKernel<span class="brand-dot">.</span></span>
        <small>研究笔记</small>
      </RouteLink>
      <nav class="header-shortcuts" aria-label="常用章节">
        <RouteLink to="/mechanisms.html" :aria-current="index === 1 ? 'page' : undefined">理解机制</RouteLink>
        <RouteLink to="/code-walkthrough.html" :aria-current="chapter.path === '/code-walkthrough.html' ? 'page' : undefined">走进源码</RouteLink>
      </nav>
      <div class="header-actions">
        <SearchBox />
        <button class="theme-button icon-button" :aria-label="isDark ? '切换浅色主题' : '切换深色主题'" @click="isDark = !isDark">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" /></svg>
        </button>
        <button ref="menuButton" class="menu-button" aria-haspopup="dialog" aria-controls="chapter-menu" @click="openMenu">目录 <span class="menu-glyph" aria-hidden="true"><i /><i /></span></button>
      </div>
      <div class="reading-progress" role="progressbar" aria-label="正文阅读进度" :aria-valuenow="Math.round(progress)" :aria-valuemin="0" :aria-valuemax="100"><span :style="{ transform: `scaleX(${progress / 100})` }" /></div>
    </header>

    <ResearchHero v-if="isHome" />
    <div v-else class="chapter-heading site-container">
      <RouteLink to="/" class="chapter-back">研究笔记 <span aria-hidden="true">/</span></RouteLink>
      <span>{{ chapter.label }}</span><span class="chapter-position">{{ chapter.id }} — 06</span>
    </div>
    <VPPage :key="page.path">
      <template #content-top><div class="article-kicker"><span>{{ chapter.tag }}</span><span>CHAPTER {{ chapter.id }}</span></div></template>
    </VPPage>

    <nav class="chapter-pagination site-container" aria-label="章节翻页">
      <RouteLink v-if="index > 0" :to="chapters[index - 1].path" class="previous-chapter"><span>← 上一章</span><strong>{{ chapters[index - 1].label }}</strong></RouteLink>
      <RouteLink v-if="index < chapters.length - 1" :to="chapters[index + 1].path" class="next-chapter"><span>继续阅读 / {{ chapters[index + 1].id }}</span><strong>{{ chapters[index + 1].title }} <span aria-hidden="true">↗</span></strong></RouteLink>
      <RouteLink v-else to="/" class="next-chapter"><span>回到起点</span><strong>重新看完整主线 <span aria-hidden="true">↗</span></strong></RouteLink>
    </nav>
    <footer class="research-footer site-container"><RouteLink to="/" class="footer-brand">mKernel.</RouteLink><p>理解设计，也理解它成立的条件。</p><a href="https://github.com/Gin-Sin/mkernel-notes">GitHub ↗</a><span class="footer-credit">GIN-SIN · RESEARCH NOTES</span></footer>

    <dialog id="chapter-menu" ref="menu" class="chapter-dialog" aria-labelledby="menu-title" @close="restoreMenu" @click="event => { if (event.target === menu) closeMenu() }">
      <div class="dialog-top"><span id="menu-title">阅读目录 <small>INDEX / 06</small></span><button class="icon-button" aria-label="关闭目录" @click="closeMenu">×</button></div>
      <nav aria-label="全部章节"><RouteLink v-for="item in chapters" :key="item.id" :to="item.path" class="chapter-menu-link" :aria-current="item.id === chapter.id ? 'page' : undefined" @click="closeMenu"><span class="chapter-number">{{ item.id }}</span><span><strong>{{ item.label }}</strong><small>{{ item.detail }}</small></span><span aria-hidden="true">↗</span></RouteLink></nav>
      <div class="dialog-bottom"><span>从动机到机制，从实现到证据。</span><a href="https://github.com/Gin-Sin/mkernel-notes">GitHub ↗</a></div>
    </dialog>
  </div>
</template>
