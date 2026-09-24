<template>
  <div class="board-layout">
    <div
      v-for="board in boards"
      :key="board.id"
      :class="[
        'board-placeholder',
        { selected: board.id === selectedId, 'board-placeholder--svg': Boolean(board.cutlineSvg) },
      ]"
      :style="placeholderStyle(board)"
      @pointerdown.stop.prevent="startDrag(board, $event)"
      @wheel.prevent="onWheel($event, board)"
    >
      <span class="board-label">{{ board.name }}</span>
      <template v-if="board.id === selectedId">
        <div
          class="board-handle board-handle--scale"
          title="拖拽缩放"
          @pointerdown.stop.prevent="startHandle(board, 'scale', $event)"
        ></div>
        <div
          class="board-handle board-handle--rotate"
          title="拖拽旋转"
          @pointerdown.stop.prevent="startHandle(board, 'rotate', $event)"
        ></div>
      </template>
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
      <label class="board-tool board-tool--file">
        上传刀线 SVG
        <input
          accept=".svg,image/svg+xml"
          type="file"
          @change="onSvgFile($event.target.files[0]); $event.target.value = ''"
        />
      </label>
      <button
        v-if="selected && selected.cutlineSvg"
        type="button"
        class="board-tool"
        @click="removeCutline"
      >
        移除刀线
      </button>
      <template v-if="selected">
        <label class="board-prop">
          标识<input
            type="text"
            :value="selected.tag"
            @change="setTag($event.target.value)"
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
// 读取 SVG 根节点的物理尺寸（支持 mm/cm/in/px），随方案 JSON 传给设计端做标注。
function readSvgSize(svgText) {
  const root = new DOMParser().parseFromString(svgText, "image/svg+xml")
    .documentElement;
  const viewBox = (root.getAttribute("viewBox") || "")
    .trim()
    .split(/[ ,]+/)
    .map(Number);
  const parse = (value, fallback) => {
    const match = (value || "").match(/^\s*([\d.]+)\s*(mm|cm|in|px)?/i);
    return match
      ? { value: Number(match[1]), unit: (match[2] || "px").toLowerCase() }
      : { value: fallback, unit: "px" };
  };
  const width = parse(root.getAttribute("width"), viewBox[2] || 0);
  const height = parse(root.getAttribute("height"), viewBox[3] || 0);
  return {
    width: width.value,
    height: height.value,
    widthUnit: width.unit,
    heightUnit: height.unit,
  };
}
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
      // 手柄拖拽状态：scale / rotate 直接操作。
      handleState: null,
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
      const { w, h } = this.boardSize(board);
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
    // 板块占位框在 500 空间的宽高（SVG 刀线板块按宽高比适配）。
    boardSize(board) {
      let baseW = BASE_W;
      let baseH = BASE_H;
      if (
        board.cutlineSvg &&
        board.svgAspect &&
        board.svgAspect.w &&
        board.svgAspect.h
      ) {
        const fit = Math.min(
          BASE_W / board.svgAspect.w,
          BASE_H / board.svgAspect.h,
        );
        baseW = board.svgAspect.w * fit;
        baseH = board.svgAspect.h * fit;
      }
      const s = this.sceneScale * (Number(board.scale) || 1);
      return { w: baseW * s, h: baseH * s };
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
      if (this.handleState) {
        this.onHandleMove(e);
        return;
      }
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
      this.handleState = null;
    },
    // 手柄按下：记录旋转/缩放轴心与初始值。
    // 缩放轴心 = 顶部中心锚点（x,y，与合成端缩放一致）；
    // 旋转轴心 = 板块中心——合成端绕顶部中心旋转，因此拖拽时同步反算
    // x/y（A = C − R(θ)·(0,h/2)），让存储值在合成端复现「绕中心旋转」。
    startHandle(board, mode, e) {
      this.selectedId = board.id;
      const canvas = this.getCanvas();
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const toScreen = (p) => ({
        x: rect.left + (p.x / 500) * rect.width,
        y: rect.top + (p.y / 500) * rect.height,
      });
      const base = {
        mode,
        board,
        startX: e.clientX,
        startY: e.clientY,
        origScale: Number(board.scale) || 1,
        origRotation: Number(board.rotation) || 0,
      };
      if (mode === "scale") {
        this.handleState = {
          ...base,
          pivot: toScreen({ x: board.x, y: board.y }),
          center500: null,
          h500: 0,
        };
      } else {
        const { h } = this.boardSize(board);
        const rad = (base.origRotation * Math.PI) / 180;
        const center500 = {
          x: (Number(board.x) || 0) - Math.sin(rad) * (h / 2),
          y: (Number(board.y) || 0) + Math.cos(rad) * (h / 2),
        };
        this.handleState = {
          ...base,
          pivot: toScreen(center500),
          center500,
          h500: h,
        };
      }
    },
    onHandleMove(e) {
      const h = this.handleState;
      if (!h) return;
      if (h.mode === "scale") {
        const startDist =
          Math.hypot(h.startX - h.pivot.x, h.startY - h.pivot.y) || 1;
        const dist = Math.hypot(e.clientX - h.pivot.x, e.clientY - h.pivot.y);
        let next = h.origScale * (dist / startDist);
        next = Math.max(SCALE_MIN, Math.min(SCALE_MAX, next));
        h.board.scale = Math.round(next * 100) / 100;
      } else {
        // 屏幕坐标 y 向下：atan2(dx, dy) 以轴心正下方为 0°、向右为正；
        // 而 CSS rotate 正角为顺时针（正下方 → 左侧），方向相反，故取负号。
        const startAngle = Math.atan2(
          h.startX - h.pivot.x,
          h.startY - h.pivot.y,
        );
        const angle = Math.atan2(
          e.clientX - h.pivot.x,
          e.clientY - h.pivot.y,
        );
        let deg = h.origRotation - ((angle - startAngle) * 180) / Math.PI;
        deg = ((deg % 360) + 360) % 360;
        h.board.rotation = Math.round(deg);
        // 绕中心旋转：由新角度反算顶部中心锚点位置，保持板块中心不动。
        const rad = (deg * Math.PI) / 180;
        h.board.x = Math.round(
          Math.max(
            0,
            Math.min(500, h.center500.x + Math.sin(rad) * (h.h500 / 2)),
          ),
        );
        h.board.y = Math.round(
          Math.max(
            0,
            Math.min(500, h.center500.y - Math.cos(rad) * (h.h500 / 2)),
          ),
        );
      }
      this.emitChange();
    },
    onWheel(e, board) {
      const target = board || this.selected;
      if (!target) return;
      this.selectedId = target.id;
      e.preventDefault();
      const dir = e.deltaY > 0 ? -0.05 : 0.05;
      const next = Math.max(
        SCALE_MIN,
        Math.min(SCALE_MAX, (Number(target.scale) || 1) + dir),
      );
      target.scale = Math.round(next * 100) / 100;
      this.emitChange();
    },
    addBoard() {
      boardSeq += 1;
      // 板块标识：A/B/C… 顺延跳过已占用，跨方案 JSON 按该标识匹配板块。
      const used = new Set(
        this.boards.map((b) => b.tag).filter(Boolean),
      );
      let code = 65;
      while (code <= 90 && used.has(String.fromCharCode(code))) code += 1;
      const tag =
        code <= 90 ? String.fromCharCode(code) : "T" + (this.boards.length + 1);
      const board = {
        id: "b" + boardSeq + "-" + Date.now(),
        tag,
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
    setTag(value) {
      const board = this.selected;
      const tag = String(value || "").trim();
      if (!board || !tag) return;
      board.tag = tag;
      this.emitChange();
    },
    removeBoard() {
      if (!this.selected) return;
      const index = this.boards.indexOf(this.selected);
      if (index >= 0) this.boards.splice(index, 1);
      this.selectedId = this.boards.length ? this.boards[0].id : null;
      this.emitChange();
    },
    // 上传刀线 SVG：原文随方案 JSON 走，设计端用 demo-2 方式出图；
    // 占位区域按 SVG 宽高比适配（先按根节点尺寸，再以渲染尺寸兜底）。
    onSvgFile(file) {
      const board = this.selected;
      if (!board || !file) return;
      if (!/\.svg$/i.test(file.name) && file.type !== "image/svg+xml") return;
      file.text().then((text) => {
        const size = readSvgSize(text);
        board.cutlineSvg = text;
        board.cutlineName = file.name;
        board.sourceSize = size;
        board.svgAspect = { w: size.width || 100, h: size.height || 100 };
        this.emitChange();
        const image = new Image();
        image.onload = () => {
          board.svgAspect = {
            w: image.naturalWidth || board.svgAspect.w,
            h: image.naturalHeight || board.svgAspect.h,
          };
          this.emitChange();
        };
        image.src = "data:image/svg+xml;utf8," + encodeURIComponent(text);
      });
    },
    removeCutline() {
      const board = this.selected;
      if (!board) return;
      this.$delete(board, "cutlineSvg");
      this.$delete(board, "cutlineName");
      this.$delete(board, "sourceSize");
      this.$delete(board, "svgAspect");
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
      if (key === "rotation") {
        // 与旋转手柄一致：绕板块中心旋转，中心不动，反算锚点位置。
        next = ((Math.round(next) % 360) + 360) % 360;
        const { h } = this.boardSize(board);
        const rad = (next * Math.PI) / 180;
        const oldRad = (Number(board.rotation) || 0) * (Math.PI / 180);
        const cx = (Number(board.x) || 0) - Math.sin(oldRad) * (h / 2);
        const cy = (Number(board.y) || 0) + Math.cos(oldRad) * (h / 2);
        board.x = Math.round(
          Math.max(0, Math.min(500, cx + Math.sin(rad) * (h / 2))),
        );
        board.y = Math.round(
          Math.max(0, Math.min(500, cy - Math.cos(rad) * (h / 2))),
        );
        board.rotation = next;
        this.emitChange();
        return;
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
  padding:  10px;
  cursor: pointer;
  font-size: 12px;
}
.board-tool:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.board-tool--file {
  position: relative;
  overflow: hidden;
  color: #2a7d6e;
  border-color: #8fb3aa;
  user-select: none;
}
.board-tool--file input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.board-placeholder--svg {
  border-style: solid;
  border-color: #8fb3aa;
  background: rgba(255, 255, 255, 0.5);
}
.board-handle {
  position: absolute;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid #2a7d6e;
  box-shadow: 0 1px 4px rgba(40, 60, 52, 0.25);
  touch-action: none;
  z-index: 2;
}
.board-handle--scale {
  right: -9px;
  bottom: -9px;
  cursor: nwse-resize;
}
.board-handle--rotate {
  left: 50%;
  bottom: -30px;
  margin-left: -8px;
  background: #2a7d6e;
  cursor: grab;
}
.board-handle--rotate::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: 14px;
  width: 2px;
  height: 14px;
  margin-left: -1px;
  background: #2a7d6e;
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
