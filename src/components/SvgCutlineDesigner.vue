<template>
  <div class="svg-cutline-designer">
    <!-- 右侧竖排容器：与 PatternDesigner 同构——slot（效果图走马灯）+ 组件操作区，
         默认 display:contents 不影响原布局；预览页穿透后成为右列卡片 -->
    <div class="pd-side-stack">
      <slot></slot>
      <div class="pillow-demo">
        <div class="actions">
        <div class="face-switch" role="group" aria-label="图案面切换">
          <button
            type="button"
            :class="{ active: activeFace === 'front' }"
            :disabled="processing || !imageObject"
            @click="switchFace('front')"
          >
            正面
          </button>
          <button
            type="button"
            :class="{ active: activeFace === 'back' }"
            :disabled="processing || !imageObject"
            @click="switchFace('back')"
          >
            反面
          </button>
        </div>
        <button
          v-if="readyToDesign && imageObject && !isComplete"
          type="button"
          class="svg-btn svg-btn--primary"
          @click="finishDesign"
        >
          确定组件
        </button>
        <button
          v-if="isComplete"
          type="button"
          class="svg-btn"
          @click="reopenDesign"
        >
          重新编辑
        </button>
        <button
          type="button"
          class="svg-btn"
          :disabled="!imageObject || isComplete || processing"
          @click="resetImagePosition"
        >
          重置组件
        </button>
        <button
          type="button"
          class="svg-btn"
          :disabled="!artworkBlob || processing"
          @click="downloadImages"
        >
          下载图片
        </button>
        </div>
      </div>
    </div>
    <div class="canvas-panel">
      <div class="canvas-panel-title">
        <span>设计画布</span>
        <button
          type="button"
          class="apply-design-action"
          :disabled="!canApply"
          @click="$emit('apply-design')"
        >
          生成效果图
        </button>
      </div>
      <div class="canvas-stage">
        <div class="svg-canvas-wrap">
          <canvas ref="canvas" />
          <template v-if="isComplete">
            <div class="svg-dim svg-dim--v" :style="vDimStyle">
              <i /><span>{{ heightLabel }}</span
              ><i />
            </div>
            <div class="svg-dim svg-dim--h" :style="hDimStyle">
              <i /><span>{{ widthLabel }}</span
              ><i />
            </div>
          </template>
        </div>
        <div v-if="!cutlineSvg" class="svg-empty">
          <strong>该板块未上传刀线 SVG</strong>
        </div>
        <div v-else-if="!imageObject" class="svg-empty">
          <strong>刀线已就绪</strong>
          <span>上传图片，图片会按刀线轮廓裁剪并支持拖拽缩放</span>
        </div>
      </div>
    </div>
  </div>
</template>
<script>
// SVG 刀线板块的设计画布（移植 demo-2）：白色刀线形状垫底 → 上传图片以
// 刀线轮廓为 clipPath 裁剪（可拖拽/缩放）→ 完成设计后锁定并叠加红色刀线
// 与物理尺寸标注。对 DesignWorkspace 暴露与 PatternDesigner 相同的接口：
// artworkBlob / processing / file / getDesignShapeRegion / getDesignHole /
// handleFileChange，使合成管线无需感知板块类型。
import { fabric } from "fabric";
import { downloadBlob } from "./PatternDesigner/pillowContour";
import { cropResizeToPngBlob } from "./downloadImage";

const CANVAS_SIZE = 600;
const STAGE_PADDING = 30;

export default {
  name: "SvgCutlineDesigner",
  props: {
    cutlineSvg: { type: String, default: "" },
    sourceSize: {
      type: Object,
      default: () => ({
        width: 0,
        height: 0,
        widthUnit: "px",
        heightUnit: "px",
      }),
    },
    // 与 PatternDesigner 的「使用此图案」按钮同一语义。
    canApply: { type: Boolean, default: false },
    // 板块规格尺寸（cm）：标注按刀线宽高比映射到该规格。
    specSize: { type: Number, default: 10 },
    // 导出 DPI：下载图片的长边像素 = specSize / 2.54 × dpi。
    dpi: { type: Number, default: 300 },
  },
  data() {
    return {
      fabricCanvas: null,
      cutlineGroup: null,
      clipGroup: null,
      backdropObject: null,
      imageObject: null,
      outlineObject: null,
      cutlineBounds: null,
      imageName: "",
      isComplete: false,
      // 与 PatternDesigner 对齐：正面保留原图，反面为左右镜像预览。
      activeFace: "front",
      // 与 PatternDesigner 对齐的对外状态。
      artworkBlob: null,
      processing: false,
      file: null,
      loadError: "",
    };
  },
  computed: {
    readyToDesign() {
      return Boolean(this.cutlineSvg);
    },
    // 物理标注：刀线宽高比映射到板块规格（长边 = specSize cm），
    // 与无刀线页「尺寸(cm)」作用于长边的语义一致，不直接用 SVG 像素值。
    physicalSize() {
      const bounds = this.cutlineBounds;
      const spec = Number(this.specSize);
      if (!bounds || !bounds.width || !bounds.height || !spec) return null;
      const scale = spec / Math.max(bounds.width, bounds.height);
      return {
        width: bounds.width * scale,
        height: bounds.height * scale,
        unit: "cm",
      };
    },
    widthLabel() {
      if (this.physicalSize) {
        return this.formatDimension(this.physicalSize.width, this.physicalSize.unit);
      }
      return this.formatDimension(
        this.sourceSize.width,
        this.sourceSize.widthUnit,
      );
    },
    heightLabel() {
      if (this.physicalSize) {
        return this.formatDimension(this.physicalSize.height, this.physicalSize.unit);
      }
      return this.formatDimension(
        this.sourceSize.height,
        this.sourceSize.heightUnit,
      );
    },
    vDimStyle() {
      if (!this.cutlineBounds) return {};
      return {
        left: `${this.cutlineBounds.left - 16}px`,
        top: `${this.cutlineBounds.top}px`,
        height: `${this.cutlineBounds.height}px`,
      };
    },
    hDimStyle() {
      if (!this.cutlineBounds) return {};
      return {
        left: `${this.cutlineBounds.left}px`,
        top: `${this.cutlineBounds.top + this.cutlineBounds.height + 24}px`,
        width: `${this.cutlineBounds.width}px`,
      };
    },
  },
  watch: {
    cutlineSvg: {
      immediate: true,
      handler(value) {
        if (!value) return;
        this.$nextTick(() => this.setupCutline(value));
      },
    },
  },
  mounted() {
    // 多实例安全：fabric 必须绑定本实例的 canvas 元素（禁止全局 id）。
    this.fabricCanvas = new fabric.Canvas(this.$refs.canvas, {
      preserveObjectStacking: true,
      selection: false,
      backgroundColor: "transparent",
    });
    this.fabricCanvas.setDimensions({
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
    });
    // 初次加载由 watch(immediate) 的 nextTick 触发，这里不再重复调用，
    // 否则异步竞态会在画布上叠出两个白色垫底。
  },
  beforeDestroy() {
    if (this.fabricCanvas) this.fabricCanvas.dispose();
    this.fabricCanvas = null;
  },
  methods: {
    async setupCutline(svgText) {
      this.processing = true;
      // watch(immediate) 与 mounted 可能双触发，异步解析期间用 token 防竞态，
      // 避免画布上叠两个垫底/裁剪组（历史 bug：白色垫底重复添加）。
      const token = (this._setupToken = (this._setupToken || 0) + 1);
      try {
        const loaded = await this.loadSvg(svgText);
        if (token !== this._setupToken) return;
        const group = fabric.util.groupSVGElements(
          loaded.objects,
          loaded.options,
        );
        if (!group.width || !group.height) throw new Error("empty cutline");
        this.removeOutline();
        if (this.imageObject) this.fabricCanvas.remove(this.imageObject);
        this.imageObject = null;
        this.artworkBlob = null;
        this.isComplete = false;
        this.activeFace = "front";
        this.cutlineGroup = group;
        this.clipGroup = await this.cloneObject(group);
        if (token !== this._setupToken) return;
        this.styleAsMask(this.clipGroup);
        this.setupCanvasForCutline();
        await this.addWhiteBackdrop();
        if (token !== this._setupToken) return;
        this.loadError = "";
      } catch (e) {
        this.loadError = "无法解析此 SVG 刀线";
        console.error("SVG 刀线解析失败", e);
      } finally {
        this.processing = false;
      }
    },
    setupCanvasForCutline() {
      const group = this.clipGroup;
      const available = CANVAS_SIZE - STAGE_PADDING * 2;
      const scale = Math.min(
        available / group.width,
        available / group.height,
        1,
      );
      const left = (CANVAS_SIZE - group.width * scale) / 2;
      const top = (CANVAS_SIZE - group.height * scale) / 2;
      [this.cutlineGroup, this.clipGroup].forEach((shape) => {
        shape.set({
          left,
          top,
          originX: "left",
          originY: "top",
          scaleX: scale,
          scaleY: scale,
          absolutePositioned: true,
        });
      });
      this.fabricCanvas.clipPath = null;
      this.cutlineBounds = {
        left,
        top,
        width: group.width * scale,
        height: group.height * scale,
      };
      this.fabricCanvas.requestRenderAll();
    },
    async addWhiteBackdrop() {
      this.removeWhiteBackdrop();
      // 垫底用位图而非 fabric Group：fabric 5.3 下 SVG 组 flipX 的填充渲染
      // 会把凹形缺口填成凸包，Image 翻转才可靠。
      const url = await this.rasterizeWhiteShape();
      const image = await this.loadImage(url);
      image.set({
        left: 0,
        top: 0,
        originX: "left",
        originY: "top",
        selectable: false,
        evented: false,
        flipX: this.activeFace === "back",
      });
      this.backdropObject = image;
      this.fabricCanvas.add(image);
      this.fabricCanvas.sendToBack(image);
      this.fabricCanvas.requestRenderAll();
    },
    // 把白色刀线形状栅格化成整幅画布尺寸的透明底 PNG。
    async rasterizeWhiteShape() {
      const shaped = await this.cloneObject(this.clipGroup);
      this.styleAsWhiteBackdrop(shaped);
      const temp = new fabric.StaticCanvas(null, {
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
      });
      temp.add(shaped);
      temp.renderAll();
      const url = temp.toDataURL({ format: "png", multiplier: 1 });
      temp.dispose();
      return url;
    },
    removeWhiteBackdrop() {
      if (this.backdropObject && this.fabricCanvas)
        this.fabricCanvas.remove(this.backdropObject);
      this.backdropObject = null;
    },
    // 与 PatternDesigner.handleFileChange 对齐的入口。
    async handleFileChange(event) {
      const files = (event && event.target && event.target.files) || [];
      await this.loadImageFile(files[0]);
    },
    async loadImageFile(file) {
      if (!file) return;
      if (!this.cutlineSvg) return;
      const imageUrl = URL.createObjectURL(file);
      try {
        const image = await this.loadImage(imageUrl);
        if (this.imageObject) this.fabricCanvas.remove(this.imageObject);
        this.removeOutline();
        this.imageObject = image;
        this.file = file;
        this.imageName = file.name;
        this.isComplete = false;
        this.activeFace = "front";
        this.artworkBlob = null;
        this.fabricCanvas.add(image);
        this.resetImagePosition();
      } catch (e) {
        console.error("图片读取失败", e);
      } finally {
        URL.revokeObjectURL(imageUrl);
      }
    },
    resetImagePosition() {
      if (!this.imageObject || !this.cutlineBounds) return;
      const bounds = this.cutlineBounds;
      const image = this.imageObject;
      image.clipPath = this.clipGroup;
      const scale = Math.max(
        bounds.width / image.width,
        bounds.height / image.height,
      );
      image.set({
        left: bounds.left + bounds.width / 2,
        top: bounds.top + bounds.height / 2,
        originX: "center",
        originY: "center",
        scaleX: scale,
        scaleY: scale,
      });
      image.setCoords();
      this.fabricCanvas.setActiveObject(image);
      this.fabricCanvas.requestRenderAll();
    },
    // 正面/反面：反面为左右镜像预览，图片、红色刀线轮廓、裁剪区域、白色垫底
    // 一起翻转（物理翻面时缺口同样镜像）；导出刀模形状时由
    // getDesignShapeRegion 临时翻回，保证合成端拿到真实刀模。
    async switchFace(face) {
      if (face !== "front" && face !== "back") return;
      if (!this.imageObject || this.activeFace === face) return;
      this.activeFace = face;
      const flip = face === "back";
      this.imageObject.set({ flipX: flip });
      if (this.outlineObject) this.outlineObject.set({ flipX: flip });
      if (this.backdropObject) this.backdropObject.set({ flipX: flip });
      // 重新生成裁剪轮廓：反面时刀线形状镜像，保证裁剪区域与轮廓一致。
      // 每次克隆出新 clip，避免污染正面用的 this.clipGroup。
      if (this.clipGroup) {
        const clip = await this.cloneObject(this.clipGroup);
        clip.set({ flipX: flip });
        this.imageObject.clipPath = clip;
      }
      this.imageObject.setCoords();
      this.fabricCanvas.requestRenderAll();
      // 已确定组件后切换面，导出内容需跟随当前面重新生成。
      if (this.isComplete) await this.exportArtworkBlob();
    },
    // 下载图片：与无刀线页 downloadImages 同一套逻辑——
    // 物理尺寸 = 宽高 cm 各自 round(cm/2.54 × dpi)（长边 = 规格尺寸），
    // 源画布裁到刀线 bbox 后高质量缩放，PNG 写入 DPI 元数据。
    // 图案取当前面，mask 始终为真实刀模；与「生成效果图」的 artworkBlob 解耦。
    async downloadImages() {
      if (!this.artworkBlob || this.processing) return;
      const phys = this.physicalSize;
      const bounds = this.cutlineBounds;
      if (!phys || !bounds) return;
      const dpi = Math.max(1, Math.round(Number(this.dpi) || 300));
      const targetWidth = Math.max(1, Math.round((phys.width / 2.54) * dpi));
      const targetHeight = Math.max(1, Math.round((phys.height / 2.54) * dpi));
      const crop = {
        left: bounds.left,
        top: bounds.top,
        right: bounds.left + bounds.width,
        bottom: bounds.top + bounds.height,
      };
      this.processing = true;
      try {
        const baseName =
          (this.imageName || "cutline-design").replace(/\.[^.]+$/, "") ||
          "cutline-design";
        const artwork = await this.exportRegionBlob(
          { hiddenObjects: [this.backdropObject, this.outlineObject] },
          bounds,
          crop,
          targetWidth,
          targetHeight,
          dpi,
        );
        if (artwork) downloadBlob(artwork, `${baseName}.png`);
        const mask = await this.exportRegionBlob(
          {
            hiddenObjects: [this.imageObject, this.outlineObject],
            backdropUnflip: true,
          },
          bounds,
          crop,
          targetWidth,
          targetHeight,
          dpi,
        );
        if (mask) downloadBlob(mask, `${baseName}_mask.png`);
      } catch (err) {
        console.error(err);
      } finally {
        this.processing = false;
      }
    },
    // 导出画布指定区域：临时隐藏对象（/翻回垫底）→ toCanvasElement 快照 →
    // 复用无刀线页的 crop + 缩放 + DPI 管线。
    async exportRegionBlob(
      { hiddenObjects = [], backdropUnflip = false },
      bounds,
      crop,
      targetWidth,
      targetHeight,
      dpi,
    ) {
      const canvas = this.fabricCanvas;
      if (!canvas || !bounds) return null;
      const hidden = [];
      hiddenObjects.forEach((object) => {
        if (object) {
          hidden.push([object, object.visible]);
          object.visible = false;
        }
      });
      let backdropFlip = null;
      if (backdropUnflip && this.backdropObject) {
        backdropFlip = this.backdropObject.flipX;
        this.backdropObject.flipX = false;
      }
      canvas.renderAll();
      const source = canvas.toCanvasElement(1);
      if (backdropFlip !== null && this.backdropObject) {
        this.backdropObject.flipX = backdropFlip;
      }
      hidden.forEach(([object, visible]) => {
        object.visible = visible;
      });
      canvas.requestRenderAll();
      return cropResizeToPngBlob(source, crop, targetWidth, targetHeight, dpi);
    },
    async finishDesign() {
      if (this.isComplete || !this.imageObject) return;
      this.isComplete = true;
      this.imageObject.set({
        selectable: false,
        evented: false,
        hasControls: false,
        hasBorders: false,
        lockMovementX: true,
        lockMovementY: true,
        lockRotation: true,
        lockScalingX: true,
        lockScalingY: true,
      });
      this.fabricCanvas.discardActiveObject();
      this.addOutline();
      this.fabricCanvas.requestRenderAll();
      await this.exportArtworkBlob();
    },
    reopenDesign() {
      if (!this.imageObject) return;
      this.isComplete = false;
      this.imageObject.set({
        selectable: true,
        evented: true,
        hasControls: true,
        hasBorders: true,
        lockMovementX: false,
        lockMovementY: false,
        lockRotation: false,
        lockScalingX: false,
        lockScalingY: false,
      });
      this.removeOutline();
      this.artworkBlob = null;
      this.fabricCanvas.setActiveObject(this.imageObject);
      this.fabricCanvas.requestRenderAll();
    },
    addOutline() {
      if (!this.cutlineGroup || this.outlineObject) return;
      this.cutlineGroup.clone((outline) => {
        this.styleAsOutline(outline);
        outline.set({
          selectable: false,
          evented: false,
          absolutePositioned: false,
          // 反面预览时轮廓跟随图片一起镜像。
          flipX: this.activeFace === "back",
        });
        this.outlineObject = outline;
        this.fabricCanvas.add(outline);
        this.fabricCanvas.bringToFront(outline);
        this.fabricCanvas.requestRenderAll();
      });
    },
    removeOutline() {
      if (this.outlineObject && this.fabricCanvas)
        this.fabricCanvas.remove(this.outlineObject);
      this.outlineObject = null;
    },
    // 导出可印刷图案：隐藏垫底与刀线，只保留裁剪后的图片（透明底）。
    async exportArtworkBlob() {
      this.processing = true;
      try {
        const canvas = this.fabricCanvas;
        const hidden = [];
        [this.backdropObject, this.outlineObject].forEach((object) => {
          if (object) {
            hidden.push([object, object.visible]);
            object.visible = false;
          }
        });
        const dataUrl = canvas.toDataURL({ format: "png", multiplier: 1 });
        hidden.forEach(([object, visible]) => {
          object.visible = visible;
        });
        canvas.requestRenderAll();
        this.artworkBlob = await this.dataUrlToBlob(dataUrl);
      } finally {
        this.processing = false;
      }
    },
    // 刀线内部填充（白色形状、其余透明），供合成端 makeShape 使用。
    // 反面预览时垫底是镜像的，导出前临时翻回真实刀模形状。
    async getDesignShapeRegion() {
      if (!this.fabricCanvas || !this.backdropObject) return null;
      const canvas = this.fabricCanvas;
      const hidden = [];
      [this.imageObject, this.outlineObject].forEach((object) => {
        if (object) {
          hidden.push([object, object.visible]);
          object.visible = false;
        }
      });
      const backdropFlip = this.backdropObject.flipX;
      this.backdropObject.flipX = false;
      const dataUrl = canvas.toDataURL({ format: "png", multiplier: 1 });
      this.backdropObject.flipX = backdropFlip;
      hidden.forEach(([object, visible]) => {
        object.visible = visible;
      });
      canvas.requestRenderAll();
      return this.dataUrlToBlob(dataUrl);
    },
    // 挂孔取刀线 bbox 顶部中心附近（挂扣挂在板体上方）。
    getDesignHole() {
      if (!this.cutlineBounds) return null;
      const bounds = this.cutlineBounds;
      return {
        x: Math.round(bounds.left + bounds.width / 2),
        y: Math.round(bounds.top + Math.max(12, bounds.height * 0.06)),
        shape: "ring",
      };
    },
    async dataUrlToBlob(dataUrl) {
      const response = await fetch(dataUrl);
      return response.blob();
    },
    styleAsOutline(object) {
      if (object._objects)
        object._objects.forEach((child) => this.styleAsOutline(child));
      object.set({
        fill: "rgba(0,0,0,0)",
        stroke: "#f5222d",
        strokeWidth: 2,
        strokeUniform: true,
      });
    },
    styleAsMask(object) {
      if (object._objects)
        object._objects.forEach((child) => this.styleAsMask(child));
      object.set({ fill: "#000", stroke: null, strokeWidth: 0 });
    },
    styleAsWhiteBackdrop(object) {
      if (object._objects)
        object._objects.forEach((child) => this.styleAsWhiteBackdrop(child));
      object.set({ fill: "#fff", stroke: null, strokeWidth: 0 });
    },
    cloneObject(object) {
      return new Promise((resolve) => object.clone(resolve));
    },
    loadSvg(svgText) {
      return new Promise((resolve, reject) => {
        fabric.loadSVGFromString(svgText, (objects, options) => {
          if (!objects || !objects.length) reject(new Error("empty SVG"));
          else resolve({ objects, options });
        });
      });
    },
    loadImage(url) {
      return new Promise((resolve, reject) => {
        fabric.Image.fromURL(url, (image) => {
          if (image) resolve(image);
          else reject(new Error("invalid image"));
        });
      });
    },
    formatDimension(value, unit) {
      if (!value) return "—";
      const rounded = Math.round(value * 100) / 100;
      return `${rounded}${unit}`;
    },
  },
};
</script>
<style scoped>
/* 默认不影响布局；预览页穿透链把它提升为右列卡片（与 PatternDesigner 一致） */
.pd-side-stack {
  display: contents;
}
.pillow-demo {
  margin: 0 auto;
  padding: 28px;
  border: 1px solid #e4eaf3;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(35, 55, 80, 0.08);
  width: 300px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.actions button {
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: #33415a;
  font-size: 14px;
  font-weight: 600;
  background: #eef2f7;
  cursor: pointer;
  transition: transform 0.15s ease, background-color 0.2s ease,
    border-color 0.2s ease, box-shadow 0.2s ease;
}

.actions button:hover:not(:disabled) {
  transform: translateY(-1px);
  background: #e2eaf5;
  box-shadow: 0 4px 10px rgba(34, 62, 95, 0.12);
}

.actions button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.svg-cutline-designer {
  font-size: 13px;
  color: #4a5652;
  display: flex;
}
.svg-btn {
  border: 1px solid #d7dedb;
  border-radius: 7px;
  padding: 7px 12px;
  background: #fff;
  color: #4a5652;
  cursor: pointer;
}
.svg-btn:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}
.face-switch {
  display: flex;
}
.face-switch button {
  border: 1px solid #d7dedb;
  background: #fff;
  color: #4a5652;
  padding: 7px 14px;
  cursor: pointer;
  font-size: 13px;
}
.face-switch button:first-child {
  border-radius: 7px 0 0 7px;
}
.face-switch button:last-child {
  border-radius: 0 7px 7px 0;
  border-left: 0;
}
.face-switch button.active {
  border-color: #285348;
  background: #285348;
  color: #fff;
}
.face-switch button:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}
.svg-btn--primary {
  border-color: #285348;
  background: #285348;
  color: #fff;
}
.canvas-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 30px;
  min-height: 660px;
  overflow: auto;
  background-color: #f4f7fb;
  background-image: linear-gradient(45deg, #e9eef6 25%, transparent 25%),
    linear-gradient(-45deg, #e9eef6 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e9eef6 75%),
    linear-gradient(-45deg, transparent 75%, #e9eef6 75%);
  background-size: 24px 24px;
  background-position: 0 0, 0 12px, 12px -12px, -12px 0;
}
.canvas-panel {
  /* 与无刀线页一致：面板宽度收敛到画布内容，不横向撑满整行 */
  width: fit-content;
  min-width: 420px;
  margin: 4px 0 28px;
  overflow: hidden;
  border: 1px solid #e4eaf3;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(35, 55, 80, 0.08);
}
.canvas-panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 56px;
  padding: 0 22px;
  border-bottom: 1px solid #e8edf5;
  color: #172033;
  font-size: 15px;
  font-weight: 700;
}
.apply-design-action {
  min-height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  background: #285348;
  box-shadow: 0 4px 10px rgba(40, 83, 72, 0.2);
  cursor: pointer;
}
.apply-design-action:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}
.svg-canvas-wrap {
  position: relative;
  width: 600px;
  height: 600px;
}
.svg-canvas-wrap ::v-deep .canvas-container {
  overflow: hidden;
  border: 1px solid #d4deed;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 12px 26px rgba(28, 50, 80, 0.16);
}
.svg-canvas-wrap ::v-deep .lower-canvas,
.svg-canvas-wrap ::v-deep .upper-canvas {
  border-radius: 9px;
}
.svg-empty {
  position: absolute;
  display: grid;
  gap: 6px;
  place-items: center;
  color: #77827d;
  text-align: center;
  pointer-events: none;
}
.svg-empty strong {
  color: #334155;
}
.svg-dim {
  position: absolute;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #1677ff;
  font-size: 12px;
  pointer-events: none;
}
.svg-dim i {
  display: block;
  background: #1677ff;
}
.svg-dim span {
  border-radius: 4px;
  padding: 3px 6px;
  color: #fff;
  background: #1677ff;
  white-space: nowrap;
}
.svg-dim--v {
  width: 14px;
  flex-direction: column;
  transform: translateX(-100%);
  border-left: 1px dashed #1677ff;
}
.svg-dim--v i {
  width: 10px;
  height: 1px;
  margin-left: -1px;
}
.svg-dim--v span {
  transform: rotate(-90deg);
}
.svg-dim--h {
  height: 14px;
  border-top: 1px dashed #1677ff;
  transform: translateY(-100%);
}
.svg-dim--h i {
  width: 1px;
  height: 10px;
  margin-top: -1px;
}
</style>
