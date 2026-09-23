<template>
  <div class="board-layout">
    <div
      v-for="board in boards"
      :key="board.id"
      :class="['board-placeholder', { selected: board.id === selectedId }]"
      :style="placeholderStyle(board)"
      @pointerdown.stop.prevent="startDrag(board, $event)"
    >
      <span class="board-label">{{ board.name }}</span>
    </div>

    <div class="board-toolbar" @pointerdown.stop>
      <button type="button" class="board-tool" @click="addBoard">+ 板块</button>
      <button
        type="button"
        class="board-tool"
        :disabled="!selected"
        @click="removeBoard"
      >
        删除
      </button>
      <template v-if="selected">
        <label class="board-prop">
          X<input
            type="number"
            step="1"
            :value="selected.x"
            @input="setProp('x', $event.target.value)"
          />
        </label>
        <label class="board-prop">
          Y<input
            type="number"
            step="1"
            :value="selected.y"
            @input="setProp('y', $event.target.value)"
          />
        </label>
        <label class="board-prop">
          大小<input
            type="number"
            step="0.05"
            min="0.3"
            max="2.5"
            :value="selected.scale"
            @input="setProp('scale', $event.target.value)"
          />
        </label>
        <label class="board-prop">
          角度<input
            type="number"
            step="1"
            :value="selected.rotation"
            @input="setProp('rotation', $event.target.value)"
          />
        </label>
        <label class="board-prop">
          层级<input
            type="number"
            step="1"
            :value="selected.z"
            @input="setProp('z', $event.target.value)"
          />
        </label>
      </template>
    </div>
  </div>
</template>

<script>
// 设置页的板块布局编辑器：叠在效果图画布上的 DOM 覆盖层。
// 每块占位板 = 一个可拖拽/缩放/旋转的矩形；坐标统一使用 500x500 画布空间，
// 与 render.js composeScene 的 transform 语义一一对应。
const BASE_W = 200;
// 板体经 makeShape 适配后的最大高度（fit 上限 220），占位框 = 板体可能区域。
const BASE_H = 220;
const SCALE_MIN = 0.3;
const SCALE_MAX = 2.5;
let boardSeq = 0;

export default {
  name: "BoardLayoutEditor",
  props: {
    boards: { type: Array, required: true },
    // 全局场景摆放（productX/Y/scale/rotation），用于所见即所得的显示换算。
    scene: { type: Object, default: () => ({}) },
  },
  data() {
    return {
      selectedId: null,
      dragging: null,
    };
  },
  computed: {
    selected() {
      return this.boards.find((b) => b.id === this.selectedId) || null;
    },
    sceneScale() {
      const s = Number(this.scene.productScale);
      return (Number.isFinite(s) ? s : 100) / 100;
    },
    sceneRotation() {
      const r = Number(this.scene.productRotation);
      return Number.isFinite(r) ? r : 0;
    },
  },
  watch: {
    // 选中板块变化时通知外层（用于按板块编辑材质/轮廓参数）。
    selectedId(value) {
      if (value) this.$emit("select", value);
    },
  },
  mounted() {
    if (!this.selectedId && this.boards.length) {
      this.selectedId = this.boards[0].id;
    }
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.endDrag);
  },
  beforeDestroy() {
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.endDrag);
  },
  methods: {
    emitChange() {
      this.$emit("change", this.boards);
    },
    // 覆盖层正好铺在 canvas-wrap 上，取其中 canvas 的矩形做坐标换算。
    getCanvas() {
      const el = this.$el;
      if (!el || !el.closest) return null;
      const wrap = el.closest(".canvas-wrap");
      return wrap ? wrap.querySelector("canvas") : null;
    },
    placeholderStyle(board) {
      const w = BASE_W * this.sceneScale * board.scale;
      const h = BASE_H * this.sceneScale * board.scale;
      return {
        left: (board.x / 5) + "%",
        top: (board.y / 5) + "%",
        width: (w / 5) + "%",
        height: (h / 5) + "%",
        // y 是板块区域顶部：框从该点向下延展、旋转绕顶部中心，
        // 与合成端“板体顶对齐框顶”的锚点保持一致。
        transform:
          "translate(-50%, 0) rotate(" +
          (Number(board.rotation) + this.sceneRotation) +
          "deg)",
        transformOrigin: "50% 0",
        zIndex: 10 + (Number(board.z) || 0),
      };
    },
    startDrag(board, e) {
      this.selectedId = board.id;
      const canvas = this.getCanvas();
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      this.dragging = {
        board,
        rect,
        startX: e.clientX,
        startY: e.clientY,
        origX: Number(board.x) || 0,
        origY: Number(board.y) || 0,
      };
    },
    onPointerMove(e) {
      const d = this.dragging;
      if (!d) return;
      const dx = ((e.clientX - d.startX) / d.rect.width) * 500;
      const dy = ((e.clientY - d.startY) / d.rect.height) * 500;
      d.board.x = Math.round(Math.max(0, Math.min(500, d.origX + dx)));
      d.board.y = Math.round(Math.max(0, Math.min(500, d.origY + dy)));
      this.emitChange();
    },
    endDrag() {
      this.dragging = null;
    },
    onWheel(e) {
      const board = this.selected;
      if (!board) return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? -0.05 : 0.05;
      const next = Math.max(
        SCALE_MIN,
        Math.min(SCALE_MAX, (Number(board.scale) || 1) + dir),
      );
      board.scale = Math.round(next * 100) / 100;
      this.emitChange();
    },
    addBoard() {
      boardSeq += 1;
      const board = {
        id: "b" + boardSeq + "-" + Date.now(),
        name: "板块" + (this.boards.length + 1),
        x: 250,
        y: 255,
        scale: 1,
        rotation: 0,
        z: this.boards.length,
        specSize: 10,
      };
      this.boards.push(board);
      this.selectedId = board.id;
      this.emitChange();
    },
    removeBoard() {
      if (!this.selected) return;
      const index = this.boards.indexOf(this.selected);
      if (index >= 0) this.boards.splice(index, 1);
      this.selectedId = this.boards.length ? this.boards[0].id : null;
      this.emitChange();
    },
    setProp(key, value) {
      const board = this.selected;
      if (!board) return;
      let next = Number(value);
      if (!Number.isFinite(next)) return;
      if (key === "scale") {
        next = Math.max(SCALE_MIN, Math.min(SCALE_MAX, next));
        next = Math.round(next * 100) / 100;
      }
      if (key === "x" || key === "y") {
        next = Math.max(0, Math.min(500, Math.round(next)));
      }
      board[key] = next;
      this.emitChange();
    },
  },
};
</script>

<style scoped>
.board-layout {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}
.board-placeholder {
  position: absolute;
  pointer-events: auto;
  cursor: move;
  border: 2px dashed #9fb3ae;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
}
.board-placeholder.selected {
  border: 2px solid #2a7d6e;
  background: rgba(42, 125, 110, 0.12);
  box-shadow: 0 0 0 3px rgba(42, 125, 110, 0.18);
}
.board-label {
  font-size: 12px;
  color: #4a5652;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 6px;
  padding: 2px 8px;
  pointer-events: none;
  user-select: none;
}
.board-toolbar {
  position: absolute;
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #fff;
  border: 1px solid #e1e6e2;
  border-radius: 10px;
  box-shadow: 0 4px 14px rgba(40, 60, 52, 0.12);
  pointer-events: auto;
  flex-wrap: wrap;
  max-width: 96%;
}
.board-tool {
  border: 1px solid #d7dedb;
  background: #fafcfb;
  color: #4a5652;
  border-radius: 7px;
  padding: 5px 10px;
  cursor: pointer;
  font-size: 12px;
}
.board-tool:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.board-prop {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #6d7a75;
}
.board-prop input {
  width: 56px;
  padding: 3px 5px;
  border: 1px solid #d7dedb;
  border-radius: 6px;
  font: inherit;
}
</style>
