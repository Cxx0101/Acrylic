<template>
  <section :class="['design-workspace', { embedded }]">
    <!-- <div class="design-toolbar">
      <div>
        <span class="eyebrow">PATTERN DESIGNER</span>
        <h2>设计图案</h2>
        <p>完成组件合并后，可将可印刷图案直接带入效果编辑器。</p>
      </div>
    </div> -->
    <PatternDesigner
      ref="designer"
      :embedded="embedded"
      :can-apply="canApply"
      :white-border="whiteBorder"
      :cut-line="cutLine"
      :dpi="dpi"
      :component-size="componentSize"
      :interface-tab-enabled="interfaceTabEnabled"
      :interface-guide-width-setting="interfaceGuideWidth"
      :interface-guide-height-setting="interfaceGuideHeight"
      :interface-tab-width-setting="interfaceTabWidth"
      :interface-tab-height-setting="interfaceTabHeight"
      @apply-design="applyDesign"
    />
  </section>
</template>

<script>
import PatternDesigner from "./PatternDesigner/PatternDesigner.vue";

export default {
  name: "DesignWorkspace",
  components: { PatternDesigner },
  props: {
    embedded: { type: Boolean, default: false },
    whiteBorder: { type: Number, default: 16 },
    cutLine: { type: Number, default: 4 },
    dpi: { type: Number, default: 300 },
    componentSize: { type: Number, default: 50 },
    interfaceTabEnabled: { type: Boolean, default: false },
    interfaceGuideWidth: { type: Number, default: 300 },
    interfaceGuideHeight: { type: Number, default: 52 },
    interfaceTabWidth: { type: Number, default: 100 },
    interfaceTabHeight: { type: Number, default: 52 },
  },
  data() {
    return { canApply: false };
  },
  mounted() {
    const syncApplyState = () => {
      const designer = this.$refs.designer;
      this.canApply = Boolean(designer.artworkBlob && !designer.processing);
    };
    this.$refs.designer.$watch("artworkBlob", syncApplyState);
    this.$refs.designer.$watch("processing", syncApplyState);
  },
  methods: {
    setPatternFile(file) {
      if (!file || !this.$refs.designer) return;
      this.$refs.designer.handleFileChange({ target: { files: [file] } });
    },
    applyDesign() {
      const designer = this.$refs.designer;
      if (!designer || designer.processing || !designer.artworkBlob) return;
      this.$emit("apply-design", {
        blob: designer.artworkBlob,
        filename: (designer.file && designer.file.name) || "designed-pattern.png",
      });
    },
  },
};
</script>

<style scoped>
.design-workspace{max-width:1370px;margin:0 auto;padding:22px 38px 42px}.design-toolbar{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:8px}.eyebrow{font-size:10px;letter-spacing:2px;color:#8c9993}.design-toolbar h2{margin:6px 0;font-size:25px;color:#25302c}.design-toolbar p{margin:0;color:#77827d;font-size:13px}.design-workspace.embedded{max-width:none;padding:0}.embedded .design-toolbar{padding:2px 4px 18px}.embedded .design-toolbar h2{font-size:21px}@media(max-width:700px){.design-workspace{padding:18px 16px}.design-toolbar{align-items:flex-start}.design-toolbar h2{font-size:21px}.design-toolbar p{line-height:1.6}}
</style>
