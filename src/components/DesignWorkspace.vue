<template>
  <section :class="['design-workspace', { embedded }]">
    <!-- 板块条：一个产品可拼装多块亚克力，每块独立设计 -->
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
      <template v-if="isSettingsMode">
        <button
          type="button"
          class="board-action"
          :disabled="boards.length >= maxBoards"
          @click="addBoard"
        >
          + 新增板块
        </button>
        <button
          type="button"
          class="board-action"
          :disabled="boards.length <= 1"
          @click="removeBoard(activeBoardId)"
        >
          删除
        </button>
      </template>
    </div>

    <!-- 当前板块的装配参数：决定它在合成效果图里的位置与层级（仅设置页可改） -->
    <div v-if="isSettingsMode && currentBoard" class="board-transform">
      <span class="board-transform-title">「{{ currentBoard.name }}」装配</span>
      <label class="transform-field">
        偏移X
        <input v-model.number="currentBoard.transform.offsetX" type="number" step="1" />
      </label>
      <label class="transform-field">
        偏移Y
        <input v-model.number="currentBoard.transform.offsetY" type="number" step="1" />
      </label>
      <label class="transform-field">
        旋转
        <input v-model.number="currentBoard.transform.rotation" type="number" step="1" />
      </label>
      <label class="transform-field">
        层级
        <input v-model.number="currentBoard.transform.z" type="number" step="1" />
      </label>
      <label class="transform-field">
        尺寸(cm)
        <select v-model.number="currentBoard.specSize">
          <option :value="5">5</option>
          <option :value="10">10</option>
          <option :value="20">20</option>
        </select>
      </label>
      <button type="button" class="board-action" @click="resetTransform">居中</button>
    </div>

    <!-- 每个板块一个独立的 PatternDesigner 实例；非当前板块离屏保活以保留设计状态 -->
    <div
      v-for="board in boards"
      :key="board.id"
      :class="['board-pane', { active: board.id === activeBoardId }]"
    >
      <PatternDesigner
        :ref="'designer-' + board.id"
        :embedded="embedded"
        :can-apply="Boolean(canApplyMap[board.id])"
        :white-border="whiteBorder"
        :cut-line="cutLine"
        :dpi="dpi"
        :component-size="componentSize"
        :spec-size="board.specSize"
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

let boardSeq = 0;

export default {
  name: "DesignWorkspace",
  components: { PatternDesigner },
  props: {
    embedded: { type: Boolean, default: false },
    // 'settings' = 设置板块（增删 + 装配参数）；'preview' = 切换板块做设计。
    mode: { type: String, default: "preview" },
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
    const first = this.createBoard("板块1");
    return {
      boards: [first],
      activeBoardId: first.id,
      // 每个板块的“使用此图案”可用性（该块已完成设计且不在处理中）。
      canApplyMap: {},
      maxBoards: 6,
    };
  },
  computed: {
    currentBoard() {
      return this.boards.find((b) => b.id === this.activeBoardId) || null;
    },
    isSettingsMode() {
      return this.mode === "settings";
    },
  },
  mounted() {
    this.bindWatchers();
  },
  methods: {
    createBoard(name) {
      boardSeq += 1;
      return {
        id: "b" + boardSeq,
        name: name || "板块" + boardSeq,
        specSize: Number(this.specSize) || 10,
        // 相对产品中心的装配变换（500 画布像素 / 角度 / 层级）。
        transform: { offsetX: 0, offsetY: 0, rotation: 0, z: 0 },
      };
    },
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
    addBoard() {
      if (this.boards.length >= this.maxBoards) return;
      const board = this.createBoard("板块" + (this.boards.length + 1));
      this.boards.push(board);
      this.activeBoardId = board.id;
      this.$nextTick(() => this.bindWatchers());
    },
    removeBoard(id) {
      if (this.boards.length <= 1) return;
      const index = this.boards.findIndex((b) => b.id === id);
      if (index < 0) return;
      this.boards.splice(index, 1);
      this.$delete(this.canApplyMap, id);
      if (this.activeBoardId === id) this.activeBoardId = this.boards[0].id;
    },
    resetTransform() {
      const board = this.currentBoard;
      if (board) board.transform = { offsetX: 0, offsetY: 0, rotation: 0, z: 0 };
    },
    // 供上层（App 的 upload 事件）把文件交给当前板块的设计器。
    setPatternFile(file) {
      const designer = this.getDesigner(this.activeBoardId);
      if (file && designer) {
        designer.handleFileChange({ target: { files: [file] } });
      }
    },
    // 汇总所有已完成设计的板块，交给效果图合成。
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
          name: board.name,
          blob: designer.artworkBlob,
          hole: designer.getDesignHole ? designer.getDesignHole() : null,
          shapeRegion,
          transform: Object.assign({}, board.transform),
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
.board-action {
  border: 1px dashed #b9c4c0;
  background: #fafcfb;
  color: #4a5652;
  border-radius: 8px;
  padding: 7px 13px;
  cursor: pointer;
  font-size: 13px;
}
.board-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.board-transform {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px 12px;
  margin: 0 4px 14px;
  background: #f4f7f6;
  border-radius: 10px;
}
.board-transform-title {
  font-size: 12px;
  color: #6d7a75;
  font-weight: 600;
}
.transform-field {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #6d7a75;
}
.transform-field input,
.transform-field select {
  width: 62px;
  padding: 4px 6px;
  border: 1px solid #d7dedb;
  border-radius: 6px;
  font: inherit;
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
