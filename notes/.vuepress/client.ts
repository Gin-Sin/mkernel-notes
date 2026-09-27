import { defineMermaidConfig } from "@vuepress/plugin-markdown-chart/client"
import { defineClientConfig } from "vuepress/client"

import SmAllocationDemo from "./components/diagrams/SmAllocationDemo.vue"

import PipelineTimeline from "./components/diagrams/PipelineTimeline.vue"

import HierarchyTiles from "./components/diagrams/HierarchyTiles.vue"

import ChunkReadiness from "./components/diagrams/ChunkReadiness.vue"

import TransportPaths from "./components/diagrams/TransportPaths.vue"

import TokenBoundary from "./components/diagrams/TokenBoundary.vue"

import AttentionRing from "./components/diagrams/AttentionRing.vue"

import PeakComparison from "./components/diagrams/PeakComparison.vue"

import "katex/dist/katex.min.css"

defineMermaidConfig({
  flowchart: {
    curve: "linear",
    htmlLabels: true,
    useMaxWidth: true,
  },
  themeVariables: (isDarkMode) =>
    isDarkMode
      ? {
          background: "#1b1b1f",
          fontFamily: "inherit",
          lineColor: "#a8a8ad",
          primaryBorderColor: "#68686d",
          primaryColor: "#252529",
          primaryTextColor: "#dfdfe4",
          secondaryBorderColor: "#68686d",
          secondaryColor: "#303035",
          secondaryTextColor: "#dfdfe4",
          tertiaryBorderColor: "#68686d",
          tertiaryColor: "#252529",
          tertiaryTextColor: "#dfdfe4",
        }
      : {
          background: "#ffffff",
          fontFamily: "inherit",
          lineColor: "#60646c",
          primaryBorderColor: "#c2c2c4",
          primaryColor: "#ffffff",
          primaryTextColor: "#2c2c30",
          secondaryBorderColor: "#c2c2c4",
          secondaryColor: "#f6f6f7",
          secondaryTextColor: "#2c2c30",
          tertiaryBorderColor: "#c2c2c4",
          tertiaryColor: "#ffffff",
          tertiaryTextColor: "#2c2c30",
        },
})

export default defineClientConfig({
  enhance({ app }) {
    app.component("PipelineTimeline", PipelineTimeline)
    app.component("HierarchyTiles", HierarchyTiles)
    app.component("ChunkReadiness", ChunkReadiness)
    app.component("TransportPaths", TransportPaths)
    app.component("TokenBoundary", TokenBoundary)
    app.component("AttentionRing", AttentionRing)
    app.component("PeakComparison", PeakComparison)
    app.component("SmAllocationDemo", SmAllocationDemo)
  },
})
