<template>
  <section :class="['design-workspace', { embedded }]">
    <!-- 板块切换条：板块结构由设置页导出的 JSON（plan-boards）决定，这里只做切换与逐块设计 -->
    <div class="board-bar" role="tablist" aria-label="亚克力板块">
      <button
        v-for="board in boards"
        :key="board.id"
        type="button"
        role="tab"
        :class="['board-tab', { active: board.id === activeBoardId }]"
        :aria-selected="board.id === activeBoardId"
        @click="setActiveBoard(board.id)"
      >
        {{ board.name }}
      </button>
    </div>

    <!-- 每个板块一个独立的 PatternDesigner 实例；非当前板块离屏保活以保留设计状态 -->
    <div
      v-for="board in boards"
      :key="board.id"
      :class="['board-pane', { active: board.id === activeBoardId }]"
    >
      <!-- SVG 刀线板块：设计画布切换为 demo-2 的「图片按刀线裁剪」流程 -->
      <SvgCutlineDesigner
        v-if="board.cutlineSvg"
        :ref="'designer-' + board.id"
        :cutline-svg="board.cutlineSvg"
        :source-size="board.sourceSize || {}"
        :spec-size="Number(specSize) || Number(board.specSize) || 10"
        :dpi="dpi"
        :can-apply="Boolean(canApplyMap[board.id])"
        @apply-design="onApplyDesign()"
      />
      <PatternDesigner
        v-else
        :ref="'designer-' + board.id"
        :embedded="embedded"
        :can-apply="Boolean(canApplyMap[board.id])"
        :white-border="whiteBorder"
        :cut-line="cutLine"
        :dpi="dpi"
        :component-size="componentSize"
        :spec-size="Number(specSize) || Number(board.specSize) || 10"
        :interface-tab-enabled="interfaceTabEnabled"
        :interface-guide-width-setting="interfaceGuideWidth"
        :interface-guide-height-setting="interfaceGuideHeight"
        :interface-tab-width-setting="interfaceTabWidth"
        :interface-tab-height-setting="interfaceTabHeight"
        @apply-design="onApplyDesign()"
      />
    </div>
  </section>
</template>

<script>
import PatternDesigner from "./PatternDesigner/PatternDesigner.vue";
import SvgCutlineDesigner from "./SvgCutlineDesigner.vue";

export default {
  name: "DesignWorkspace",
  components: { PatternDesigner, SvgCutlineDesigner },
  props: {
    embedded: { type: Boolean, default: false },
    // 设置页导出的板块布局（BoardLayoutEditor 的产出）。为空时回退到单块默认，
    // 保持未导入方案时的原有可用性。
    planBoards: { type: Array, default: null },
    whiteBorder: { type: Number, default: 16 },
    cutLine: { type: Number, default: 4 },
    dpi: { type: Number, default: 300 },
    componentSize: { type: Number, default: 50 },
    specSize: { type: Number, default: 10 },
    interfaceTabEnabled: { type: Boolean, default: false },
    interfaceGuideWidth: { type: Number, default: 300 },
    interfaceGuideHeight: { type: Number, default: 52 },
    interfaceTabWidth: { type: Number, default: 100 },
    interfaceTabHeight: { type: Number, default: 52 },
  },
  data() {
    return {
      fallbackBoards: [
        {
          id: "b1",
          tag: "A",
          name: "板块1",
          x: 250,
          y: 255,
          scale: 1,
          rotation: 0,
          z: 0,
          specSize: Number(this.specSize) || 10,
        },
      ],
      activeBoardId: "b1",
      // 每个板块的“使用此图案”可用性（该块已完成设计且不在处理中）。
      canApplyMap: {},
    };
  },
  computed: {
    boards() {
      return this.planBoards && this.planBoards.length
        ? this.planBoards
        : this.fallbackBoards;
    },
  },
  watch: {
    boards: {
      handler(list) {
        if (!list.some((b) => b.id === this.activeBoardId)) {
          this.activeBoardId = list.length ? list[0].id : null;
        }
        this.$nextTick(() => this.bindWatchers());
      },
    },
  },
  mounted() {
    this.bindWatchers();
  },
  methods: {
    // v-for 里的 ref 会被收集为数组，这里统一取出组件实例。
    getDesigner(id) {
      const ref = this.$refs["designer-" + id];
      return Array.isArray(ref) ? ref[0] : ref || null;
    },
    bindWatchers() {
      this.boards.forEach((board) => {
        const designer = this.getDesigner(board.id);
        if (!designer || designer.__boardWatched) return;
        designer.__boardWatched = true;
        const sync = () => {
          this.$set(
            this.canApplyMap,
            board.id,
            Boolean(designer.artworkBlob && !designer.processing),
          );
        };
        designer.$watch("artworkBlob", sync);
        designer.$watch("processing", sync);
        sync();
      });
    },
    setActiveBoard(id) {
      if (this.boards.some((b) => b.id === id)) this.activeBoardId = id;
    },
    // 供上层（App 的 upload 事件）把文件交给当前板块的设计器。
    setPatternFile(file) {
      const designer = this.getDesigner(this.activeBoardId);
      if (file && designer) {
        designer.handleFileChange({ target: { files: [file] } });
      }
    },
    // 汇总所有已完成设计的板块；布局参数原样上抛，由 App 换算成合成 transform。
    async onApplyDesign() {
      const list = [];
      for (const board of this.boards) {
        const designer = this.getDesigner(board.id);
        if (!designer || !designer.artworkBlob || designer.processing) continue;
        const shapeRegion = designer.getDesignShapeRegion
          ? await designer.getDesignShapeRegion()
          : null;
        list.push({
          id: board.id,
          tag: board.tag || board.name,
          name: board.name,
          blob: designer.artworkBlob,
          hole: designer.getDesignHole ? designer.getDesignHole() : null,
          shapeRegion,
          x: Number(board.x) || 250,
          y: Number(board.y) || 255,
          scale: Number(board.scale) || 1,
          rotation: Number(board.rotation) || 0,
          z: Number(board.z) || 0,
          o: board.o ? Object.assign({}, board.o) : null,
          specSize: board.specSize,
          filename:
            (designer.file && designer.file.name) || board.name + ".png",
        });
      }
      if (!list.length) return;
      this.$emit("apply-design", { boards: list });
    },
  },
};
</script>

<style scoped>
.design-workspace {
  max-width: 1370px;
  margin: 0 auto;
  padding: 22px 38px 42px;
  position: relative;
  overflow: hidden;
}
.design-workspace.embedded {
  max-width: none;
  padding: 0;
}
.board-bar {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  padding: 4px 4px 12px;
}
.board-tab {
  border: 1px solid #d7dedb;
  background: #fff;
  color: #4a5652;
  border-radius: 8px;
  padding: 7px 15px;
  cursor: pointer;
  font-size: 13px;
}
.board-tab.active {
  background: #244941;
  border-color: #244941;
  color: #fff;
}
/* 非当前板块离屏保活：保留布局尺寸（fabric 画布需要），但不占位、不可见 */
.board-pane {
  position: absolute;
  left: -100000px;
  top: 0;
  width: 100%;
}
.board-pane.active {
  position: relative;
  left: 0;
}
</style>
