<template>
  <div :class="{ embedded }" style="display: flex; margin: 0 auto; padding: 20px">
    <div style="width: 60%; margin-right: 20px">
      <!-- 右侧竖排容器：默认 display:contents 不影响原布局；
           预览页覆盖为真实卡片，内含（slot 传入的）效果图走马灯 + 组件设置面板 -->
      <div class="pd-side-stack">
        <slot></slot>
        <div class="pillow-demo">
        <div v-if="!embedded" class="row">
          <label class="file-upload">
            <input
              class="file-upload-input"
              type="file"
              accept="image/png"
              @change="handleFileChange"
            />
            <span class="file-upload-button">上传 PNG</span>
            <span class="file-upload-name">
              {{ file ? file.name : "请选择透明背景 PNG 图片" }}
            </span>
          </label>
        </div>

        <div class="form-grid">
          <label v-if="!embedded">
            尺寸(cm)
            <input
              v-model.number="maximumSizeCm"
              type="number"
              min="0.1"
              step="0.1"
              :disabled="!fabricCanvas || processing"
              @change="applyPhysicalSize"
            />
          </label>

          <label>
            内轮廓白边(px)
            <input
              v-model.number="form.innerHoleWhiteBorder"
              type="number"
              :disabled="processing || !form.includeInnerHoles"
              @input="schedulePreviewRegeneration"
            />
          </label>
          <!-- <label>
          轮廓圆滑(px，0=自动)
          <input v-model.number="form.contourSmoothing" type="number" min="0" />
        </label> -->
        </div>
        <div>
          <label class="toggle-label">
            <input
              v-model="form.includeInnerHoles"
              type="checkbox"
              :disabled="processing"
              @change="schedulePreviewRegeneration"
            />
            内部镂空
          </label>
        </div>
        <div
          v-show="activeFace === 'front'"
          style="
            margin-top: 20px;
            display: flex;
            justify-content: space-between;
          "
        >
          <div style="font-weight: bold">组件设置</div>
          <label class="toggle-label">
            <input
              v-model="enableEdgeSticker"
              type="checkbox"
              :disabled="processing || !contentBlob"
              @change="toggleEdgeSticker"
            />
            启用组件
          </label>
        </div>

        <div
          v-show="activeFace === 'front'"
          class="form-grid"
          style="margin-top: 10px"
        >
          <label class="sticker-pattern-field">
            <span>组件图案</span>
            <span
              class="sticker-pattern-buttons"
              role="radiogroup"
              aria-label="组件图案"
            >
              <button
                type="button"
                :class="{ active: stickerPattern === 'ring' }"
                :aria-checked="stickerPattern === 'ring'"
                :disabled="processing || !enableEdgeSticker"
                role="radio"
                @click="selectStickerPattern('ring')"
              >
                <svg
                  t="1787904690542"
                  class="icon"
                  viewBox="0 0 1024 1024"
                  version="1.1"
                  xmlns="http://www.w3.org/2000/svg"
                  p-id="1708"
                  width="48"
                  height="48"
                >
                  <path
                    d="M512 44.8C252.8 44.8 44.8 256 44.8 512S252.8 979.2 512 979.2 976 768 976 512 768 44.8 512 44.8z m0 870.4C288 915.2 108.8 732.8 108.8 512S288 108.8 512 108.8C732.8 108.8 915.2 288 915.2 512S732.8 915.2 512 915.2z"
                    fill="#1296db"
                    p-id="1709"
                  ></path>
                  <path
                    d="M512 236.8c-150.4 0-272 124.8-272 278.4 0 153.6 121.6 278.4 272 278.4s272-124.8 272-278.4c0-153.6-121.6-278.4-272-278.4z m0 496c-115.2 0-208-96-208-214.4s92.8-214.4 208-214.4 208 96 208 214.4-92.8 214.4-208 214.4z"
                    fill="#1296db"
                    p-id="1710"
                  ></path>
                </svg>
                <span>图案一</span>
              </button>
              <button
                type="button"
                :class="{ active: stickerPattern === 'square' }"
                :aria-checked="stickerPattern === 'square'"
                :disabled="processing || !enableEdgeSticker"
                role="radio"
                @click="selectStickerPattern('square')"
              >
                <svg
                  width="64"
                  height="64"
                  viewBox="0 0 64 64"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <!-- 外框 -->
                  <path
                    d="M4 62 V32 A28 28 0 0 1 60 32 V62 H4 Z"
                    fill="none"
                    stroke="#1296DB"
                    stroke-width="6"
                  />

                  <!-- 内部圆环 -->
                  <circle
                    cx="32"
                    cy="28"
                    r="11"
                    fill="none"
                    stroke="#1296DB"
                    stroke-width="4"
                  />
                </svg>
                <span>图案二</span>
              </button>
            </span>
          </label>
        </div>

        <div class="actions">
          <div class="face-switch" role="group" aria-label="图案面切换">
            <button
              type="button"
              :class="{ active: activeFace === 'front' }"
              :disabled="
                processing || !fabricCanvas || !fabricCanvas.backgroundImage
              "
              @click="switchFace('front')"
            >
              正面
            </button>
            <button
              type="button"
              :class="{ active: activeFace === 'back' }"
              :disabled="
                processing || !fabricCanvas || !fabricCanvas.backgroundImage
              "
              @click="switchFace('back')"
            >
              反面
            </button>
          </div>
          <button
            v-if="false"
            :disabled="!file || processing"
            @click="generate"
          >
            {{ processing ? "处理中..." : "生成" }}
          </button>
          <button
            class="primary-action"
            :disabled="
              activeFace !== 'front' ||
              (!edgeSticker && !interfaceTab) ||
              processing ||
              !contentBlob
            "
            @click="mergeStickerIntoContour"
          >
            确定组件
          </button>
          <button
            class="secondary-action"
            :disabled="activeFace !== 'front' || !preMergeState || processing"
            @click="resetEdgeSticker"
          >
            重置组件
          </button>
          <button
            class="secondary-action"
            :disabled="!finish"
            @click="downloadImages"
          >
            下载图片
          </button>
        </div>
        <div v-if="interfaceTab" class="interface-hint">
          拖动蓝色矩形可调整底部插口位置
        </div>

        <div v-if="processing || progress > 0" class="progress-wrap">
          <div class="progress-text">{{ progress }}% · {{ stage }}</div>
          <progress :value="progress" max="100"></progress>
        </div>
        <div v-if="error" class="error" role="alert">
          {{ error }}
        </div>
      </div>
      </div>
    </div>
    <div class="canvas-panel">
      <div class="canvas-panel-title">
        <span>设计画布</span>
        <div class="canvas-panel-hint">
          <!-- <button
            class="secondary-action"
            :disabled="
              processing ||
              savingCanvasScreenshot ||
              !fabricCanvas ||
              !fabricCanvas.backgroundImage
            "
            @click="saveCanvasScreenshot"
          >
            {{ savingCanvasScreenshot ? "正在保存…" : "保存画布截图" }}
          </button> -->
          <button
            v-if="embedded"
            class="apply-design-action"
            :disabled="!canApply"
            @click="$emit('apply-design')"
          >
            生成效果图
          </button>
          <!-- <button
            class="primary-action"
            :disabled="
              processing || !fabricCanvas || !fabricCanvas.backgroundImage
            "
            @click="openReplaceImagePicker"
          >
            替换图片
          </button> -->
          <input
            ref="replacementInput"
            class="file-upload-input"
            type="file"
            accept="image/png"
            @change="handleReplacementFileChange"
          />
        </div>
      </div>
      <div
        class="canvas-stage"
        :class="{ 'is-finalizing-component': isFinalizingComponent }"
      >
        <canvas ref="canvasEditor" class="canvas-editor"></canvas>
        <div v-if="isFinalizingComponent" class="canvas-processing-mask">
          正在生成最终效果…
        </div>
      </div>
    </div>
  </div>
</template>
<script>
import { buildPillowSheetContour, downloadBlob } from "./pillowContour";
import { fabric } from "fabric";
import {
  getMaximumDiameterPair,
  getTransformedMaskCoverage,
  insetMaskPixels,
  mergeLocalContourPixels,
  selectSmoothContourPoint,
} from "./localContour";

function buildStickerSvg(pattern, cutLine, renderedSize) {
  const size = Math.max(1, Number(renderedSize) || 1);
  const visibleStroke = Math.max(0, Number(cutLine) || 0);
  if (pattern === "square") {
    const strokeWidth = Math.min(64, (visibleStroke / size) * 64);
    const halfStroke = strokeWidth / 2;
    const left = halfStroke;
    const right = 64 - halfStroke;
    const radius = Math.max(0, (right - left) / 2);
    const topY = 32;
    const bottom = 64 - halfStroke;
    return `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <path d="M${left} ${bottom} V${topY} A${radius} ${radius} 0 0 1 ${right} ${topY} V${bottom} H${left} Z"
        fill="none" stroke="#1296DB" stroke-width="${strokeWidth}" stroke-linejoin="round" />
      <circle cx="32" cy="28" r="11" fill="none" stroke="#1296DB" stroke-width="4" />
    </svg>`;
  }
  // Keep one outer loop and one inner hole. The previous SVG combined a
  // separate outer circle with a second, overlapping compound ring, which
  // made the contour tracer treat the component as multiple loops.
  const strokeWidth = Math.max(3, Math.min(12, (visibleStroke / size) * 64));
  const radius = 32 - strokeWidth / 2;
  return `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="${radius}" fill="none" stroke="#1296DB" stroke-width="${strokeWidth}" />
    <circle cx="32" cy="32" r="11" fill="none" stroke="#1296DB" stroke-width="4" />
  </svg>`;
}

function renderStickerRotateControl(ctx, left, top, styleOverride, target) {
  const size = (styleOverride && styleOverride.cornerSize) || 24;
  const radius = size / 2;
  ctx.save();
  ctx.translate(left, top);
  ctx.rotate(fabric.util.degreesToRadians(target.angle || 0));
  ctx.fillStyle = "#285348";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, radius - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, radius / 2.6, Math.PI * 0.2, Math.PI * 1.55);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(radius / 2.6, -1);
  ctx.lineTo(radius / 2.6 + 2.5, 3);
  ctx.lineTo(radius / 2.6 - 2.5, 3.5);
  ctx.closePath();
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.restore();
}

export default {
  props: {
    embedded: { type: Boolean, default: false },
    canApply: { type: Boolean, default: false },
    // 与效果设置中的“透明留边”共用同一个值，避免两处设置不一致。
    whiteBorder: { type: Number, default: 16 },
    cutLine: { type: Number, default: 4 },
    dpi: { type: Number, default: 300 },
    componentSize: { type: Number, default: 50 },
    // 成品最长边的物理规格（cm），与左侧栏“规格”选择联动。
    specSize: { type: Number, default: 10 },
    interfaceTabEnabled: { type: Boolean, default: false },
    interfaceGuideWidthSetting: { type: Number, default: 300 },
    interfaceGuideHeightSetting: { type: Number, default: 52 },
    interfaceTabWidthSetting: { type: Number, default: 100 },
    interfaceTabHeightSetting: { type: Number, default: 52 },
  },
  data() {
    return {
      fabricCanvas: null,
      // 正面始终保留为原始设计；反面仅以左右镜像方式预览该设计。
      activeFace: "front",
      // 未设置反面资源时，反面使用正面图案的镜像。
      faceAssets: {
        front: null,
        back: null,
      },
      // 仅包含与图片外部透明区域相邻的边界点，不会吸到镂空区域。
      snapContour: [],
      // Source-coordinate contour from the cut-line layer. The merged white
      // layer fills the canvas, so it must never be used for snapping.
      previewSourceContour: [],
      // Rasterized die line used to keep an SVG component attached while it
      // is dragged on either the inside or the outside of the artwork.
      cutLineBoundaryMask: null,
      edgeSticker: null,
      interfaceTab: null,
      interfaceGuide: null,
      // 正面尚未“确定组件”时，切到反面预览前保留完整编辑态，
      // 避免重新插入图片后改变组件相对位置。
      frontEditorSnapshot: null,
      dimensionAnnotation: [],
      enableEdgeSticker: !this.interfaceTabEnabled,
      enableInterfaceTab: this.interfaceTabEnabled,
      stickerPattern: "ring",
      interfaceGuideWidth: this.interfaceGuideWidthSetting,
      interfaceGuideHeight: this.interfaceGuideHeightSetting,
      interfaceTabWidth: this.interfaceTabWidthSetting,
      interfaceTabHeight: this.interfaceTabHeightSetting,
      stickerSize: this.componentSize,
      maximumSizeCm: 10,
      actualImageWidthCm: 0,
      actualImageHeightCm: 0,
      browserDpi: 96,
      previewRegenerationTimer: null,
      file: null,
      resultBlob: null,
      // Non-destructive artwork layer. The backing remains in contentBlob;
      // artworkMaskBlob reveals only the printable portion of this layer.
      artworkBlob: null,
      artworkMaskBlob: null,
      contentBlob: null,
      pathBlob: null,
      // External-only cut path. It is reused by the reverse side so it never
      // receives the front component's internal detail lines.
      outerPathBlob: null,
      // Replacements reuse this original subject mask and placement so the
      // existing artwork frame (size, white border and cut line) never moves.
      replacementFrame: null,
      // Keep intermediate front/back merge renders off the visible canvas.
      isFinalizingComponent: false,
      preMergeState: null,
      processing: false,
      savingCanvasScreenshot: false,
      progress: 0,
      stage: "",
      error: "",
      form: {
        cutLine: this.cutLine,
        dpi: this.dpi,
        // 开启时，内部透明孔洞也生成独立的刀线轮廓。
        includeInnerHoles: false,
        // 从透明孔洞边缘向内保留的白边宽度。
        innerHoleWhiteBorder: 0,
        // 0 会按图片短边的 6% 自动合并细小间隙。
        contourSmoothing: 0,
      },
      finish: false,
    };
  },

  watch: {
    cutLine(value) {
      const next = Number(value);
      this.form.cutLine = Number.isFinite(next) ? Math.max(0, next) : 0;
      this.schedulePreviewRegeneration();
    },
    dpi(value) {
      const next = Number(value);
      this.form.dpi = Number.isFinite(next) ? Math.max(1, next) : 72;
    },
    componentSize(value) {
      const next = Number(value);
      this.stickerSize = Number.isFinite(next) ? Math.max(1, Math.round(next)) : 50;
      if (this.edgeSticker && !this.processing) this.applyStickerSize();
    },
    specSize(value) {
      const next = Number(value);
      if (!Number.isFinite(next) || next <= 0) return;
      if (next === this.maximumSizeCm) return;
      this.maximumSizeCm = next;
      // 画布尚未就绪时只更新数值，下次 generate 会按新规格布局。
      if (this.fabricCanvas && !this.processing) this.applyPhysicalSize();
    },
    interfaceTabEnabled(value) {
      this.enableInterfaceTab = Boolean(value);
      if (this.fabricCanvas && !this.processing) this.toggleInterfaceTab();
    },
    interfaceGuideWidthSetting(value) {
      this.interfaceGuideWidth = Math.max(1, Math.round(Number(value) || 1));
      this.applyInterfaceSize();
    },
    interfaceGuideHeightSetting(value) {
      this.interfaceGuideHeight = Math.max(1, Math.round(Number(value) || 1));
      this.applyInterfaceSize();
    },
    interfaceTabWidthSetting(value) {
      this.interfaceTabWidth = Math.max(1, Math.round(Number(value) || 1));
      this.applyInterfaceSize();
    },
    interfaceTabHeightSetting(value) {
      this.interfaceTabHeight = Math.max(1, Math.round(Number(value) || 1));
      this.applyInterfaceSize();
    },
  },

  methods: {
    schedulePreviewRegeneration() {
      if (!this.file || this.processing) return;
      if (this.previewRegenerationTimer) {
        clearTimeout(this.previewRegenerationTimer);
      }
      this.previewRegenerationTimer = setTimeout(() => {
        this.previewRegenerationTimer = null;
        this.generate();
      }, 300);
    },

    isBackFace() {
      return this.activeFace === "back";
    },

    shouldMirrorActiveFace() {
      // 镜像方案保留：如需恢复反面镜像，可改回下一行。
      // return this.isBackFace() && !this.faceAssets.back;
      return false;
    },

    storeFaceAsset(face = this.activeFace) {
      this.$set(this.faceAssets, face, {
        file: this.file,
        resultBlob: this.resultBlob,
        artworkBlob: this.artworkBlob,
        artworkMaskBlob: this.artworkMaskBlob,
        contentBlob: this.contentBlob,
        pathBlob: this.pathBlob,
        outerPathBlob: this.outerPathBlob,
        replacementFrame: this.replacementFrame,
        preMergeState: this.preMergeState,
        finish: this.finish,
        contourLayout: this.getCanvasContourBounds(),
        previewLayout: this.getCanvasPreviewLayout(),
      });
    },

    loadFaceAsset(asset) {
      this.file = asset.file;
      this.resultBlob = asset.resultBlob;
      this.artworkBlob = asset.artworkBlob || null;
      this.artworkMaskBlob = asset.artworkMaskBlob || null;
      this.contentBlob = asset.contentBlob;
      this.pathBlob = asset.pathBlob;
      this.outerPathBlob = asset.outerPathBlob || asset.pathBlob || null;
      this.replacementFrame = asset.replacementFrame || null;
      this.preMergeState = asset.preMergeState || null;
      this.designHole = asset.designHole || null;
      this.finish = Boolean(asset.finish);
    },

    getCanvasPreviewLayout() {
      const background = this.fabricCanvas && this.fabricCanvas.backgroundImage;
      if (!background) return null;
      return {
        left: background.left,
        top: background.top,
        scaleX: background.scaleX,
        scaleY: background.scaleY,
        actualImageWidthCm: this.actualImageWidthCm,
        actualImageHeightCm: this.actualImageHeightCm,
      };
    },

    getCanvasContourBounds() {
      const background = this.fabricCanvas && this.fabricCanvas.backgroundImage;
      if (!background) return null;
      return this.getContourBounds(this.snapContour, {
        left: background.left,
        top: background.top,
        right: background.left + background.getScaledWidth(),
        bottom: background.top + background.getScaledHeight(),
      });
    },

    alignCanvasContourTo(targetBounds) {
      const background = this.fabricCanvas && this.fabricCanvas.backgroundImage;
      const currentBounds = this.getCanvasContourBounds();
      if (!background || !currentBounds || !targetBounds) return;

      const currentWidth = Math.max(
        1,
        currentBounds.right - currentBounds.left,
      );
      const currentHeight = Math.max(
        1,
        currentBounds.bottom - currentBounds.top,
      );
      const targetWidth = Math.max(1, targetBounds.right - targetBounds.left);
      const targetHeight = Math.max(1, targetBounds.bottom - targetBounds.top);
      const scaleX = targetWidth / currentWidth;
      const scaleY = targetHeight / currentHeight;
      background.set({
        left:
          targetBounds.left + (background.left - currentBounds.left) * scaleX,
        top: targetBounds.top + (background.top - currentBounds.top) * scaleY,
        scaleX: (background.scaleX || 1) * scaleX,
        scaleY: (background.scaleY || 1) * scaleY,
      });
      this.snapContour = this.snapContour.map((point) => ({
        ...point,
        x: targetBounds.left + (point.x - currentBounds.left) * scaleX,
        y: targetBounds.top + (point.y - currentBounds.top) * scaleY,
      }));
      this.updateDimensionAnnotation();
      this.fabricCanvas.requestRenderAll();
    },

    mirrorContourHorizontally(points, axisX) {
      return points.map((point) => ({
        ...point,
        x: axisX * 2 - point.x,
        normalX: -point.normalX,
      }));
    },

    setAccessoryEditingState(isEditable) {
      [this.edgeSticker, this.interfaceTab].forEach((object) => {
        if (!object) return;
        object.set({
          visible: isEditable,
          selectable: isEditable,
          evented: isEditable,
        });
        object.setCoords();
      });
      if (this.interfaceGuide) {
        this.interfaceGuide.set({ visible: isEditable });
        this.interfaceGuide.setCoords();
      }
      if (!isEditable) this.fabricCanvas.discardActiveObject();
    },

    captureFrontEditorSnapshot() {
      const background = this.fabricCanvas.backgroundImage;
      if (!background) return;
      const getObjectState = (object) =>
        object
          ? {
              left: object.left,
              top: object.top,
              scaleX: object.scaleX,
              scaleY: object.scaleY,
              angle: object.angle,
              visible: object.visible,
              selectable: object.selectable,
              evented: object.evented,
            }
          : null;
      this.frontEditorSnapshot = {
        asset: {
          file: this.file,
          resultBlob: this.resultBlob,
          artworkBlob: this.artworkBlob,
          artworkMaskBlob: this.artworkMaskBlob,
          contentBlob: this.contentBlob,
          pathBlob: this.pathBlob,
          outerPathBlob: this.outerPathBlob,
          replacementFrame: this.replacementFrame,
          preMergeState: this.preMergeState,
          finish: this.finish,
        },
        background: {
          left: background.left,
          top: background.top,
          scaleX: background.scaleX,
          scaleY: background.scaleY,
          flipX: background.flipX,
        },
        snapContour: this.snapContour.map((point) => ({ ...point })),
        edgeSticker: getObjectState(this.edgeSticker),
        interfaceTab: getObjectState(this.interfaceTab),
        interfaceGuide: getObjectState(this.interfaceGuide),
      };
    },

    async restoreFrontEditorSnapshot() {
      const snapshot = this.frontEditorSnapshot;
      if (!snapshot || !snapshot.asset.resultBlob) return false;
      this.loadFaceAsset(snapshot.asset);
      await this.insertImage(snapshot.asset.resultBlob, {
        addSticker: false,
        preserveAccessories: true,
      });
      const background = this.fabricCanvas.backgroundImage;
      background.set(snapshot.background);
      background.setCoords();
      this.snapContour = snapshot.snapContour.map((point) => ({ ...point }));
      [
        [this.edgeSticker, snapshot.edgeSticker],
        [this.interfaceTab, snapshot.interfaceTab],
        [this.interfaceGuide, snapshot.interfaceGuide],
      ].forEach(([object, state]) => {
        if (!object || !state) return;
        object.set(state);
        object.setCoords();
      });
      if (this.edgeSticker) this.snapObjectToContour(this.edgeSticker);
      this.setAccessoryEditingState(true);
      this.frontEditorSnapshot = null;
      this.updateDimensionAnnotation();
      this.fabricCanvas.requestRenderAll();
      return true;
    },

    async switchFace(face, { preserveFrontEditor = true } = {}) {
      if (face !== "front" && face !== "back") return;
      const background = this.fabricCanvas && this.fabricCanvas.backgroundImage;
      if (!background || this.activeFace === face) return;

      if (
        preserveFrontEditor &&
        face === "back" &&
        this.activeFace === "front" &&
        (this.edgeSticker || this.interfaceTab)
      ) {
        this.captureFrontEditorSnapshot();
      }
      if (preserveFrontEditor && face === "front" && this.frontEditorSnapshot) {
        this.activeFace = "front";
        await this.restoreFrontEditorSnapshot();
        return;
      }

      const targetAsset = this.faceAssets[face];
      if (targetAsset && targetAsset.resultBlob) {
        this.activeFace = face;
        this.loadFaceAsset(targetAsset);
        const layoutAsset =
          face === "back" && this.faceAssets.front
            ? this.faceAssets.front
            : targetAsset;
        await this.insertImage(targetAsset.resultBlob, {
          addSticker: false,
          preserveAccessories: true,
          previewLayout: layoutAsset.previewLayout,
        });
        // The reverse side uses the front-side cut layout. It has no
        // independently editable component or slot geometry.
        const contourLayout =
          face === "back" && this.faceAssets.front
            ? this.faceAssets.front.contourLayout
            : targetAsset.contourLayout;
        if (!layoutAsset.previewLayout) this.alignCanvasContourTo(contourLayout);
        this.setAccessoryEditingState(face === "front");
        if (face === "front" && this.interfaceTab && this.interfaceGuide) {
          this.keepInterfaceTabAttached(this.interfaceTab);
        }
        this.fabricCanvas.requestRenderAll();
        return;
      }

      this.activeFace = face;
      background.set({ flipX: this.shouldMirrorActiveFace() });
      this.setAccessoryEditingState(face === "front");
      this.updateDimensionAnnotation();
      this.fabricCanvas.requestRenderAll();

      /*
       * 保留原来的反面镜像实现：若将 shouldMirrorActiveFace 恢复为 true，
       * 同时恢复以下代码，即可让轮廓、贴边孔和插槽一起左右镜像。
       *
      const previousContourBounds = this.getContourBounds(this.snapContour, {
        left: background.left,
        top: background.top,
        right: background.left + background.getScaledWidth(),
        bottom: background.top + background.getScaledHeight(),
      });

      const axisX = background.left + background.getScaledWidth() / 2;
      const mirroredContour = this.mirrorContourHorizontally(
        this.snapContour,
        axisX,
      );
      const mirroredBounds = this.getContourBounds(
        mirroredContour,
        previousContourBounds,
      );
      const offsetX = previousContourBounds.left - mirroredBounds.left;
      background.set({ left: background.left + offsetX });
      this.snapContour = mirroredContour.map((point) => ({
        ...point,
        x: point.x + offsetX,
      }));
      // The edge hole and bottom slot belong to the same physical design, so
      // mirror them with the artwork while applying the identical re-anchor.
      [this.edgeSticker, this.interfaceGuide, this.interfaceTab].forEach(
        (object) => {
          if (!object) return;
          object.set({ left: axisX * 2 - object.left + offsetX });
          object.setCoords();
        },
      );
      this.updateDimensionAnnotation();
      this.fabricCanvas.requestRenderAll();
      */
    },

    /**
     * 从带透明通道的 PNG 提取外轮廓。
     * 算法先从四条边 flood-fill 外部透明像素，再只保留和它相邻的不透明像素。
     */
    getOuterContour(image, offsetX, offsetY, scaleX, scaleY) {
      const element = image.getElement();
      const width = element.naturalWidth || element.width;
      const height = element.naturalHeight || element.height;
      const bitmap = document.createElement("canvas");
      bitmap.width = width;
      bitmap.height = height;
      const context = bitmap.getContext("2d", { willReadFrequently: true });
      context.drawImage(element, 0, 0, width, height);

      const alpha = context.getImageData(0, 0, width, height).data;
      const pixelCount = width * height;
      const outside = new Uint8Array(pixelCount);
      const queue = new Int32Array(pixelCount);
      const alphaThreshold = 16;
      let head = 0;
      let tail = 0;

      const isTransparent = (index) => alpha[index * 4 + 3] < alphaThreshold;
      const pushOutside = (index) => {
        if (!outside[index] && isTransparent(index)) {
          outside[index] = 1;
          queue[tail++] = index;
        }
      };

      for (let x = 0; x < width; x += 1) {
        pushOutside(x);
        pushOutside((height - 1) * width + x);
      }
      for (let y = 1; y < height - 1; y += 1) {
        pushOutside(y * width);
        pushOutside(y * width + width - 1);
      }

      while (head < tail) {
        const index = queue[head++];
        const x = index % width;
        const y = Math.floor(index / width);
        if (x > 0) pushOutside(index - 1);
        if (x < width - 1) pushOutside(index + 1);
        if (y > 0) pushOutside(index - width);
        if (y < height - 1) pushOutside(index + width);
      }

      const contour = [];
      const adjacentToOutside = (x, y) =>
        x < 0 ||
        x >= width ||
        y < 0 ||
        y >= height ||
        outside[y * width + x] === 1;

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = y * width + x;
          if (isTransparent(index)) continue;
          const outsideLeft = adjacentToOutside(x - 1, y);
          const outsideRight = adjacentToOutside(x + 1, y);
          const outsideTop = adjacentToOutside(x, y - 1);
          const outsideBottom = adjacentToOutside(x, y + 1);
          if (outsideLeft || outsideRight || outsideTop || outsideBottom) {
            // 从不透明像素指向外部透明像素的方向，即轮廓外法线。
            const normalX =
              ((outsideRight ? 1 : 0) - (outsideLeft ? 1 : 0)) * scaleX;
            const normalY =
              ((outsideBottom ? 1 : 0) - (outsideTop ? 1 : 0)) * scaleY;
            const normalLength = Math.hypot(normalX, normalY) || 1;
            contour.push({
              x: offsetX + (x + 0.5) * scaleX,
              y: offsetY + (y + 0.5) * scaleY,
              normalX: normalX / normalLength,
              normalY: normalY / normalLength,
            });
          }
        }
      }
      return contour;
    },

    getContourBounds(points, fallbackBounds) {
      return points.length
        ? points.reduce(
            (bounds, point) => ({
              left: Math.min(bounds.left, point.x),
              top: Math.min(bounds.top, point.y),
              right: Math.max(bounds.right, point.x),
              bottom: Math.max(bounds.bottom, point.y),
            }),
            {
              left: Infinity,
              top: Infinity,
              right: -Infinity,
              bottom: -Infinity,
            },
          )
        : fallbackBounds;
    },

    scaleContour(points, offsetX, offsetY, scaleX, scaleY) {
      return points.map((point) => ({
        ...point,
        x: offsetX + point.x * scaleX,
        y: offsetY + point.y * scaleY,
      }));
    },

    getBrowserDpi() {
      const ratio =
        typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
      return Math.round(ratio * 96 * 100) / 100;
    },

    setPhysicalDimensions(width, height) {
      const largestSide = Math.max(width, height, 1);
      const maximumSizeCm = Math.max(0.1, Number(this.maximumSizeCm) || 0.1);
      this.maximumSizeCm = maximumSizeCm;
      this.actualImageWidthCm = (maximumSizeCm * width) / largestSide;
      this.actualImageHeightCm = (maximumSizeCm * height) / largestSide;
      this.browserDpi = this.getBrowserDpi();
      return {
        widthPx: (this.actualImageWidthCm / 2.54) * this.browserDpi,
        heightPx: (this.actualImageHeightCm / 2.54) * this.browserDpi,
      };
    },

    getFabricPreviewMetrics(
      image,
      contourImage = image,
      sourceContourOverride = null,
      previewLayout = null,
    ) {
      const element = image.getElement ? image.getElement() : image._element;
      const sourceWidth = element.naturalWidth || element.width;
      const sourceHeight = element.naturalHeight || element.height;
      const unmirroredContour =
        sourceContourOverride || this.getOuterContour(contourImage, 0, 0, 1, 1);
      const sourceContour = this.shouldMirrorActiveFace()
        ? this.mirrorContourHorizontally(unmirroredContour, sourceWidth / 2)
        : unmirroredContour;
      // A contour edit changes source geometry, not its placement on screen.
      // Still extract the new contour for snapping, without fitting it again.
      if (previewLayout) {
        return { ...previewLayout, sourceContour, unmirroredContour };
      }
      const contourBounds = this.getContourBounds(sourceContour, {
        left: 0,
        top: 0,
        right: sourceWidth,
        bottom: sourceHeight,
      });
      const contourWidth = contourBounds.right - contourBounds.left;
      const contourHeight = contourBounds.bottom - contourBounds.top;
      const physicalPixels = this.setPhysicalDimensions(
        contourWidth,
        contourHeight,
      );
      const canvasWidth = this.fabricCanvas ? this.fabricCanvas.width : 600;
      const canvasHeight = this.fabricCanvas ? this.fabricCanvas.height : 600;
      const previewLimit = Math.min(canvasWidth, canvasHeight) * 0.7;
      const previewZoom =
        previewLimit /
        Math.max(physicalPixels.widthPx, physicalPixels.heightPx);
      const scale =
        (physicalPixels.widthPx / Math.max(contourWidth, 1)) * previewZoom;
      return {
        scale,
        left: (canvasWidth - sourceWidth * scale) / 2,
        top: (canvasHeight - sourceHeight * scale) / 2,
        sourceContour,
        unmirroredContour,
      };
    },

    applyPhysicalSize() {
      const background = this.fabricCanvas && this.fabricCanvas.backgroundImage;
      if (!background) return;

      const stickerPosition = this.edgeSticker
        ? {
            x:
              (this.edgeSticker.left - background.left) /
              (background.scaleX || 1),
            y:
              (this.edgeSticker.top - background.top) /
              (background.scaleY || 1),
          }
        : null;
      const tabPosition = this.interfaceTab
        ? (this.interfaceTab.left - background.left) / (background.scaleX || 1)
        : null;
      const metrics = this.getFabricPreviewMetrics(
        background,
        background,
        this.previewSourceContour.length ? this.previewSourceContour : null,
      );
      background.set({
        scaleX: metrics.scale,
        scaleY: metrics.scale,
        left: metrics.left,
        top: metrics.top,
      });
      this.snapContour = this.scaleContour(
        metrics.sourceContour,
        metrics.left,
        metrics.top,
        metrics.scale,
        metrics.scale,
      );
      if (this.edgeSticker && stickerPosition) {
        this.edgeSticker.set({
          left: metrics.left + stickerPosition.x * metrics.scale,
          top: metrics.top + stickerPosition.y * metrics.scale,
        });
        this.snapObjectToContour(this.edgeSticker);
      }
      if (this.interfaceTab && this.interfaceGuide) {
        this.interfaceTab.set({
          left: metrics.left + tabPosition * metrics.scale,
        });
        this.keepInterfaceTabAttached(this.interfaceTab);
      }
      this.fitArtworkToDimensionLimit();
    },

    getArtworkBounds() {
      const background = this.fabricCanvas.backgroundImage;
      const fallbackBounds = {
        left: background.left,
        top: background.top,
        right: background.left + background.getScaledWidth(),
        bottom: background.top + background.getScaledHeight(),
      };
      const contourBounds = this.getContourBounds(
        this.snapContour,
        fallbackBounds,
      );
      const bounds = { ...contourBounds };
      [this.edgeSticker, this.interfaceTab].forEach((object) => {
        if (!object) return;
        const rectangle = object.getBoundingRect(true, true);
        bounds.left = Math.min(bounds.left, rectangle.left);
        bounds.top = Math.min(bounds.top, rectangle.top);
        bounds.right = Math.max(bounds.right, rectangle.left + rectangle.width);
        bounds.bottom = Math.max(
          bounds.bottom,
          rectangle.top + rectangle.height,
        );
      });
      return bounds;
    },

    fitArtworkToDimensionLimit() {
      const background = this.fabricCanvas && this.fabricCanvas.backgroundImage;
      if (!background) return;

      const bounds = this.getArtworkBounds();
      const width = Math.max(1, bounds.right - bounds.left);
      const height = Math.max(1, bounds.bottom - bounds.top);
      const targetSize =
        Math.min(this.fabricCanvas.width, this.fabricCanvas.height) * 0.7;
      const factor = Math.min(1, targetSize / Math.max(width, height));
      const centerX = (bounds.left + bounds.right) / 2;
      const centerY = (bounds.top + bounds.bottom) / 2;
      const canvasCenterX = this.fabricCanvas.width / 2;
      const canvasCenterY = this.fabricCanvas.height / 2;
      const scaleObject = (object) => {
        if (!object) return;
        object.set({
          left: canvasCenterX + (object.left - centerX) * factor,
          top: canvasCenterY + (object.top - centerY) * factor,
          scaleX: (object.scaleX || 1) * factor,
          scaleY: (object.scaleY || 1) * factor,
        });
        object.setCoords();
      };

      scaleObject(background);
      scaleObject(this.edgeSticker);
      scaleObject(this.interfaceGuide);
      scaleObject(this.interfaceTab);
      if (this.edgeSticker) {
        this.edgeSticker.contourSnapRadius *= factor;
        if (this.edgeSticker.intersectingStickerCenter) {
          this.edgeSticker.intersectingStickerCenter = {
            x:
              canvasCenterX +
              (this.edgeSticker.intersectingStickerCenter.x - centerX) *
                factor,
            y:
              canvasCenterY +
              (this.edgeSticker.intersectingStickerCenter.y - centerY) *
                factor,
          };
        }
      }
      this.snapContour = this.snapContour.map((point) => ({
        ...point,
        x: canvasCenterX + (point.x - centerX) * factor,
        y: canvasCenterY + (point.y - centerY) * factor,
      }));
      if (this.interfaceTab && this.interfaceGuide) {
        this.keepInterfaceTabAttached(this.interfaceTab);
      }
      this.setPhysicalDimensions(width * factor, height * factor);
      this.updateDimensionAnnotation();
      this.fabricCanvas.requestRenderAll();
    },

    formatDimension(value) {
      if (!Number.isFinite(value) || value <= 0) return "";
      const precision =
        value < 10 && Math.abs(value - Math.round(value)) > 0.05 ? 1 : 0;
      return `${value.toFixed(precision)}mm`;
    },

    clearDimensionAnnotation() {
      this.dimensionAnnotation.forEach((object) =>
        this.fabricCanvas.remove(object),
      );
      this.dimensionAnnotation = [];
    },

    createDimensionLabel(text, left, top, angle = 0) {
      const labelText = new fabric.Text(text, {
        originX: "center",
        originY: "center",
        fontFamily: "Arial",
        fontSize: 13,
        fontWeight: "bold",
        fill: "#fff",
      });
      const labelBackground = new fabric.Rect({
        width: labelText.width + 12,
        height: labelText.height + 7,
        rx: 4,
        ry: 4,
        originX: "center",
        originY: "center",
        fill: "#123dff",
      });
      return new fabric.Group([labelBackground, labelText], {
        left,
        top,
        angle,
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false,
        excludeFromExport: true,
      });
    },

    updateDimensionAnnotation() {
      if (!this.fabricCanvas) return;
      this.clearDimensionAnnotation();
      const background = this.fabricCanvas.backgroundImage;
      if (!background) return;
      const contourBounds = this.getArtworkBounds();
      const widthLabel = this.formatDimension(this.actualImageWidthCm * 10);
      const heightLabel = this.formatDimension(this.actualImageHeightCm * 10);
      const blue = "#3d52ff";
      const backgroundLeft = contourBounds.left;
      const backgroundTop = contourBounds.top;
      const backgroundRight = contourBounds.right;
      const backgroundBottom = contourBounds.bottom;
      const horizontalY = Math.min(
        this.fabricCanvas.height - 18,
        backgroundBottom + 36,
      );
      const verticalX = Math.max(18, backgroundLeft - 28);
      const lineOptions = {
        stroke: blue,
        strokeWidth: 1,
        selectable: false,
        evented: false,
        excludeFromExport: true,
      };
      const objects = [
        new fabric.Line(
          [backgroundLeft, horizontalY, backgroundRight, horizontalY],
          lineOptions,
        ),
        new fabric.Line(
          [
            backgroundLeft,
            backgroundBottom + 7,
            backgroundLeft,
            horizontalY + 10,
          ],
          lineOptions,
        ),
        new fabric.Line(
          [
            backgroundRight,
            backgroundBottom + 7,
            backgroundRight,
            horizontalY + 10,
          ],
          lineOptions,
        ),
        this.createDimensionLabel(
          widthLabel,
          (backgroundLeft + backgroundRight) / 2,
          horizontalY,
        ),
        new fabric.Line(
          [verticalX, backgroundTop, verticalX, backgroundBottom],
          lineOptions,
        ),
        new fabric.Line(
          [verticalX - 10, backgroundTop, backgroundLeft - 7, backgroundTop],
          lineOptions,
        ),
        new fabric.Line(
          [
            verticalX - 10,
            backgroundBottom,
            backgroundLeft - 7,
            backgroundBottom,
          ],
          lineOptions,
        ),
        this.createDimensionLabel(
          heightLabel,
          verticalX,
          (backgroundTop + backgroundBottom) / 2,
          -90,
        ),
      ];
      objects.forEach((object) => {
        this.fabricCanvas.add(object);
      });
      this.dimensionAnnotation = objects;
      this.fabricCanvas.requestRenderAll();
    },

    findNearestContourPoint(point) {
      let nearest = null;
      let shortestDistance = Infinity;
      this.snapContour.forEach((candidate) => {
        const distance =
          (candidate.x - point.x) * (candidate.x - point.x) +
          (candidate.y - point.y) * (candidate.y - point.y);
        if (distance < shortestDistance) {
          shortestDistance = distance;
          nearest = candidate;
        }
      });
      return nearest;
    },

    async refreshCutLineBoundaryMask() {
      const sourceBlob = this.pathBlob;
      if (!sourceBlob) {
        this.cutLineBoundaryMask = null;
        return;
      }
      const boundaryImage = await this.loadFabricImage(sourceBlob);
      // A new preview may have been generated while the image decoded.
      if (this.pathBlob !== sourceBlob) return;
      const boundarySource = boundaryImage.getElement
        ? boundaryImage.getElement()
        : boundaryImage._element;
      const boundaryCanvas = document.createElement("canvas");
      boundaryCanvas.width =
        boundarySource.naturalWidth || boundarySource.width;
      boundaryCanvas.height =
        boundarySource.naturalHeight || boundarySource.height;
      const boundaryContext = boundaryCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      boundaryContext.drawImage(
        boundarySource,
        0,
        0,
        boundaryCanvas.width,
        boundaryCanvas.height,
      );
      const boundaryPixels = boundaryContext.getImageData(
        0,
        0,
        boundaryCanvas.width,
        boundaryCanvas.height,
      ).data;
      // Retain only the opaque stroke connected to the image's exterior.
      // Inner-hole/detail paths must not make a floating component appear
      // attached to the image outline.
      const outerData = new Uint8Array(
        boundaryCanvas.width * boundaryCanvas.height,
      );
      const outerQueue = new Int32Array(outerData.length);
      let outerHead = 0;
      let outerTail = 0;
      const enqueueOuterPixel = (index) => {
        if (
          outerData[index] ||
          boundaryPixels[index * 4 + 3] < 16
        ) {
          return;
        }
        outerData[index] = 255;
        outerQueue[outerTail++] = index;
      };
      this.getOuterContour(boundaryImage, 0, 0, 1, 1).forEach((point) => {
        const x = Math.max(
          0,
          Math.min(boundaryCanvas.width - 1, Math.floor(point.x)),
        );
        const y = Math.max(
          0,
          Math.min(boundaryCanvas.height - 1, Math.floor(point.y)),
        );
        enqueueOuterPixel(y * boundaryCanvas.width + x);
      });
      while (outerHead < outerTail) {
        const index = outerQueue[outerHead++];
        const x = index % boundaryCanvas.width;
        const y = (index - x) / boundaryCanvas.width;
        if (x > 0) enqueueOuterPixel(index - 1);
        if (x < boundaryCanvas.width - 1) enqueueOuterPixel(index + 1);
        if (y > 0) enqueueOuterPixel(index - boundaryCanvas.width);
        if (y < boundaryCanvas.height - 1) {
          enqueueOuterPixel(index + boundaryCanvas.width);
        }
      }
      this.cutLineBoundaryMask = {
        sourceBlob,
        width: boundaryCanvas.width,
        height: boundaryCanvas.height,
        data: boundaryPixels,
        outerData,
      };
    },

    getStickerMaskData(target, width, height, { fillInterior = true } = {}) {
      const maskWidth = Math.max(1, Math.ceil(width));
      const maskHeight = Math.max(1, Math.ceil(height));
      const cacheKey = `${fillInterior ? "filled" : "outline"}:` +
        `${maskWidth}x${maskHeight}`;
      const cache = target.outerMaskCache || {};
      if (cache[cacheKey]) return cache[cacheKey];

      const mask = this.createStickerPrimaryMask(maskWidth, maskHeight, {
        // Use the complete outer loop when finding its attachment point; use
        // only the painted outline when verifying actual line overlap.
        fillInterior,
      });
      if (!mask) return null;
      const context = mask.getContext("2d", { willReadFrequently: true });
      const maskData = {
        width: mask.width,
        height: mask.height,
        data: context.getImageData(0, 0, mask.width, mask.height).data,
      };
      cache[cacheKey] = maskData;
      target.outerMaskCache = cache;
      return maskData;
    },

    getStickerOuterSnapDistance(target, normalX, normalY) {
      const width = Math.max(1, target.getScaledWidth());
      const height = Math.max(1, target.getScaledHeight());
      const mask = this.getStickerMaskData(target, width, height);
      if (!mask) return Math.max(width, height) / 2;

      const radians = fabric.util.degreesToRadians(target.angle || 0);
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      let furthestProjection = -Infinity;
      for (let y = 0; y < mask.height; y += 1) {
        for (let x = 0; x < mask.width; x += 1) {
          if (mask.data[(y * mask.width + x) * 4 + 3] < 32) continue;
          const localX = x + 0.5 - mask.width / 2;
          const localY = y + 0.5 - mask.height / 2;
          const rotatedX = localX * cos - localY * sin;
          const rotatedY = localX * sin + localY * cos;
          furthestProjection = Math.max(
            furthestProjection,
            rotatedX * normalX + rotatedY * normalY,
          );
        }
      }
      // Account for the anti-aliased outermost pixel when attaching to the
      // die line from either side.
      return Math.max(0, furthestProjection) + 0.5;
    },

    getStickerSnapCenter(
      target,
      contourPoint,
      currentCenter = target.getCenterPoint(),
    ) {
      const normalLength =
        Math.hypot(contourPoint.normalX, contourPoint.normalY) || 1;
      const normalX = contourPoint.normalX / normalLength;
      const normalY = contourPoint.normalY / normalLength;
      // Keep the side selected by the drag: the SVG may sit outside the
      // artwork, but one of its outline segments must remain on the die line.
      const side =
        (currentCenter.x - contourPoint.x) * normalX +
          (currentCenter.y - contourPoint.y) * normalY >=
        0
          ? 1
          : -1;
      const distance = this.getStickerOuterSnapDistance(
        target,
        -side * normalX,
        -side * normalY,
      );
      const overlapInset = Math.min(
        4,
        Math.max(1, Math.min(target.getScaledWidth(), target.getScaledHeight()) * 0.06),
      );
      return {
        x: contourPoint.x + side * normalX * (distance - overlapInset),
        y: contourPoint.y + side * normalY * (distance - overlapInset),
        normalX,
        normalY,
        side,
      };
    },

    getStickerOutlineCutLineOverlap(target, center) {
      const background = this.fabricCanvas && this.fabricCanvas.backgroundImage;
      const boundaryMask = this.cutLineBoundaryMask;
      if (
        !background ||
        !boundaryMask ||
        boundaryMask.sourceBlob !== this.pathBlob
      ) {
        return null;
      }
      const scaleX = Math.abs(background.scaleX || 1);
      const scaleY = Math.abs(background.scaleY || 1);
      const width = Math.max(1, target.getScaledWidth() / scaleX);
      const height = Math.max(1, target.getScaledHeight() / scaleY);
      const mask = this.getStickerMaskData(target, width, height, {
        fillInterior: false,
      });
      if (!mask) return null;

      const radians = fabric.util.degreesToRadians(target.angle || 0);
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const centerX = (center.x - background.left) / scaleX;
      const centerY = (center.y - background.top) / scaleY;
      let overlapPixels = 0;
      for (let y = 0; y < mask.height; y += 1) {
        for (let x = 0; x < mask.width; x += 1) {
          if (mask.data[(y * mask.width + x) * 4 + 3] < 32) continue;
          const localX = x + 0.5 - mask.width / 2;
          const localY = y + 0.5 - mask.height / 2;
          const targetX = Math.round(centerX + localX * cos - localY * sin);
          const targetY = Math.round(centerY + localX * sin + localY * cos);
          if (
            targetX >= 0 &&
            targetX < boundaryMask.width &&
            targetY >= 0 &&
            targetY < boundaryMask.height &&
            boundaryMask.outerData[
              targetY * boundaryMask.width + targetX
            ] >= 32
          ) {
            overlapPixels += 1;
          }
        }
      }
      return overlapPixels;
    },

    isStickerIntersectingCutLine(target, center) {
      const overlap = this.getStickerOutlineCutLineOverlap(target, center);
      // The geometric snap keeps the component on the die line until the
      // raster is ready; afterwards require a real outline overlap.
      if (overlap == null) return true;
      const requiredOverlap = Math.max(
        3,
        Math.ceil(
          Math.min(target.getScaledWidth(), target.getScaledHeight()) * 0.03,
        ),
      );
      return overlap >= requiredOverlap;
    },

    findIntersectingStickerSnapCenter(target, contourPoint) {
      const snapCenter = this.getStickerSnapCenter(target, contourPoint);
      if (this.isStickerIntersectingCutLine(target, snapCenter)) {
        return snapCenter;
      }

      // Increase the overlap on the side the user selected. This permits the
      // SVG to extend outside the image, while preventing it from detaching.
      const maximumOverlap = Math.ceil(
        Math.min(
          16,
          Math.min(target.getScaledWidth(), target.getScaledHeight()) * 0.35,
        ),
      );
      for (let inset = 1; inset <= maximumOverlap; inset += 1) {
        const candidate = {
          ...snapCenter,
          x: snapCenter.x - snapCenter.side * snapCenter.normalX * inset,
          y: snapCenter.y - snapCenter.side * snapCenter.normalY * inset,
        };
        if (this.isStickerIntersectingCutLine(target, candidate)) {
          return candidate;
        }
      }
      return null;
    },

    findAnyIntersectingStickerSnapCenter(target) {
      // If a highly curved point cannot form an overlap, try representative
      // die-line points before reverting to the last attached position.
      const step = Math.max(1, Math.floor(this.snapContour.length / 160));
      for (let index = 0; index < this.snapContour.length; index += step) {
        const center = this.getStickerSnapCenter(
          target,
          this.snapContour[index],
        );
        if (this.isStickerIntersectingCutLine(target, center)) return center;
      }
      return null;
    },

    snapObjectToContour(target) {
      if (!target.snapToOuterContour || !this.snapContour.length) return;
      const center = target.getCenterPoint();
      // A component may be positioned freely as long as its outer SVG loop
      // really intersects the image's exterior die line.
      if (this.isStickerIntersectingCutLine(target, center)) {
        target.intersectingStickerCenter = { x: center.x, y: center.y };
        target.setCoords();
        return;
      }
      const nearest = this.findNearestContourPoint(center);
      if (!nearest) return;
      let snapCenter = this.findIntersectingStickerSnapCenter(target, nearest);
      if (!snapCenter) {
        snapCenter = this.findAnyIntersectingStickerSnapCenter(target);
      }
      if (!snapCenter) {
        snapCenter = target.intersectingStickerCenter;
      }
      if (!snapCenter) return;
      target.setPositionByOrigin(
        new fabric.Point(snapCenter.x, snapCenter.y),
        "center",
        "center",
      );
      if (this.isStickerIntersectingCutLine(target, snapCenter)) {
        target.intersectingStickerCenter = {
          x: snapCenter.x,
          y: snapCenter.y,
        };
      }
      target.setCoords();
    },

    onObjectMoving(event) {
      if (event.target === this.interfaceTab) {
        this.keepInterfaceTabAttached(event.target);
        return;
      }
      this.snapObjectToContour(event.target);
    },

    onObjectRotating(event) {
      this.snapObjectToContour(event.target);
    },

    onObjectModified(event) {
      this.snapObjectToContour(event.target);
      this.fitArtworkToDimensionLimit();
    },

    keepInterfaceTabAttached(tab) {
      const background = this.fabricCanvas.backgroundImage;
      const guide = this.interfaceGuide;
      if (!background || !guide) return;
      // snapContour follows the visible outer cut line. The blue editing range
      // is positioned directly against that outer edge.
      const nearbyBottom = this.snapContour.reduce(
        (bottom, point) =>
          Math.abs(point.x - guide.left) <= guide.getScaledWidth() / 2 + 4
            ? Math.max(bottom, point.y)
            : bottom,
        -Infinity,
      );
      const boundaryY = Number.isFinite(nearbyBottom)
        ? nearbyBottom
        : background.top + background.getScaledHeight();
      guide.set({
        left: background.left + background.getScaledWidth() / 2,
        // The guide's top edge is the visible outer cut-line edge.
        top: boundaryY + guide.getScaledHeight() / 2,
      });
      guide.setCoords();
      const guideLeft = guide.left - guide.getScaledWidth() / 2;
      const guideRight = guide.left + guide.getScaledWidth() / 2;
      tab.set({
        left: Math.max(
          guideLeft + tab.getScaledWidth() / 2,
          Math.min(guideRight - tab.getScaledWidth() / 2, tab.left),
        ),
        top: guide.top,
      });
      tab.setCoords();
    },

    getStickerSvgUrl() {
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        buildStickerSvg(
          this.stickerPattern,
          this.form.cutLine,
          this.stickerSize,
        ),
      )}`;
    },

    refreshStickerSvgSource() {
      if (!this.edgeSticker) return Promise.resolve();
      return new Promise((resolve) => {
        this.edgeSticker.outerMaskCache = null;
        this.edgeSticker.intersectingStickerCenter = null;
        this.edgeSticker.setSrc(this.getStickerSvgUrl(), resolve, {
          crossOrigin: "anonymous",
        });
      });
    },

    async applyStickerSize({ refreshSvg = true } = {}) {
      if (!this.edgeSticker) return;
      // stickerSize is specified in Fabric preview pixels. The background is
      // fitted independently for every source image, but this control must
      // always look exactly like the value the user entered.
      const size = Math.max(1, Math.round(Number(this.stickerSize) || 50));
      this.stickerSize = size;
      if (refreshSvg) await this.refreshStickerSvgSource();
      const sourceWidth = this.edgeSticker.width || 64;
      const scale = size / sourceWidth;
      this.edgeSticker.set({
        scaleX: scale,
        scaleY: scale,
        contourSnapRadius:
          size * (this.edgeSticker.contourSnapRadiusRatio || 0.5),
      });
      this.edgeSticker.intersectingStickerCenter = null;
      this.snapObjectToContour(this.edgeSticker);
      this.edgeSticker.setCoords();
      this.fitArtworkToDimensionLimit();
    },

    async selectStickerPattern(pattern) {
      if (
        pattern === this.stickerPattern ||
        this.processing ||
        this.isBackFace() ||
        !this.enableEdgeSticker
      ) {
        return;
      }
      this.stickerPattern = pattern;
      await this.changeStickerPattern();
    },

    createStickerControls() {
      return {
        tr: new fabric.Control({
          // Center the rotate handle exactly on the component's top-right
          // vertex.
          x: 0.5,
          y: -0.5,
          offsetX: 0,
          offsetY: 0,
          cursorStyle: "crosshair",
          actionName: "rotate",
          actionHandler: fabric.controlsUtils.rotationWithSnapping,
          cornerSize: 24,
          render: renderStickerRotateControl,
        }),
      };
    },

    async changeStickerPattern() {
      if (!this.enableEdgeSticker || !this.edgeSticker) return;
      await this.addDefaultSticker();
    },

    async addDefaultSticker() {
      if (!this.snapContour.length) return;
      const currentPosition = this.edgeSticker
        ? {
            left: this.edgeSticker.left,
            top: this.edgeSticker.top,
            angle: this.edgeSticker.angle || 0,
          }
        : null;
      if (this.edgeSticker) {
        this.fabricCanvas.remove(this.edgeSticker);
      }

      const sticker = await this.loadFabricImage(
        this.getStickerSvgUrl(),
      );
      sticker.set({
        left: currentPosition ? currentPosition.left : this.snapContour[0].x,
        top: currentPosition ? currentPosition.top : this.snapContour[0].y,
        originX: "center",
        originY: "center",
        snapToOuterContour: true,
        stickerPattern: this.stickerPattern,
        contourSnapRadiusRatio: 0.5,
        contourSnapRadius: this.stickerSize * 0.5,
        angle: currentPosition ? currentPosition.angle : 0,
        hasControls: true,
        hasBorders: true,
        borderColor: "#285348",
        borderDashArray: [4, 3],
        controls: this.createStickerControls(),
        lockScalingX: true,
        lockScalingY: true,
        lockRotation: false,
        hoverCursor: "move",
      });
      // Fabric does not serialize arbitrary properties consistently, so keep
      // the pattern identifier directly on the live image as well.
      sticker.stickerPattern = this.stickerPattern;
      this.fabricCanvas.add(sticker);
      this.edgeSticker = sticker;
      await this.applyStickerSize({ refreshSvg: false });
      this.snapObjectToContour(sticker);
      this.fabricCanvas.setActiveObject(sticker);
      this.fitArtworkToDimensionLimit();
    },

    async toggleEdgeSticker() {
      if (this.isBackFace()) return;
      if (this.enableEdgeSticker) {
        // 组件与底部插口互斥：启用组件时清理已启用的插口。
        this.enableInterfaceTab = false;
        if (this.interfaceTab) this.fabricCanvas.remove(this.interfaceTab);
        if (this.interfaceGuide) this.fabricCanvas.remove(this.interfaceGuide);
        this.interfaceTab = null;
        this.interfaceGuide = null;
        if (!this.fabricCanvas.backgroundImage) return;
        await this.addDefaultSticker();
      } else if (this.edgeSticker) {
        this.fabricCanvas.remove(this.edgeSticker);
        this.edgeSticker = null;
        this.applyPhysicalSize();
      }
    },

    toggleInterfaceTab() {
      if (this.isBackFace()) return;
      if (this.enableInterfaceTab) {
        // 组件与底部插口互斥：启用插口时清理已启用的组件。
        this.enableEdgeSticker = false;
        if (this.edgeSticker) this.fabricCanvas.remove(this.edgeSticker);
        this.edgeSticker = null;
        if (!this.fabricCanvas.backgroundImage) return;
        this.addDefaultInterfaceTab();
      } else {
        if (this.interfaceTab) this.fabricCanvas.remove(this.interfaceTab);
        if (this.interfaceGuide) this.fabricCanvas.remove(this.interfaceGuide);
        this.interfaceTab = null;
        this.interfaceGuide = null;
        this.applyPhysicalSize();
      }
    },

    applyInterfaceSize() {
      if (!this.interfaceGuide || !this.interfaceTab) return;
      const guideWidth = Math.max(
        1,
        Math.round(Number(this.interfaceGuideWidth) || 1),
      );
      const guideHeight = Math.max(
        1,
        Math.round(Number(this.interfaceGuideHeight) || 1),
      );
      const tabWidth = Math.min(
        guideWidth,
        Math.max(1, Math.round(Number(this.interfaceTabWidth) || 1)),
      );
      const tabHeight = Math.min(
        guideHeight,
        Math.max(1, Math.round(Number(this.interfaceTabHeight) || 1)),
      );
      this.interfaceGuide.set({
        width: guideWidth,
        height: guideHeight,
        scaleX: 1,
        scaleY: 1,
      });
      this.interfaceTab.set({
        width: tabWidth,
        height: tabHeight,
        scaleX: 1,
        scaleY: 1,
      });
      this.interfaceGuideWidth = guideWidth;
      this.interfaceGuideHeight = guideHeight;
      this.interfaceTabWidth = tabWidth;
      this.interfaceTabHeight = tabHeight;
      this.keepInterfaceTabAttached(this.interfaceTab);
      this.fitArtworkToDimensionLimit();
    },

    addDefaultInterfaceTab() {
      const background = this.fabricCanvas.backgroundImage;
      if (!background) return;
      if (this.interfaceTab) this.fabricCanvas.remove(this.interfaceTab);
      if (this.interfaceGuide) this.fabricCanvas.remove(this.interfaceGuide);

      const guide = new fabric.Rect({
        width: this.interfaceGuideWidth,
        height: this.interfaceGuideHeight,
        originX: "center",
        originY: "center",
        fill: "rgba(50, 121, 255, 0.12)",
        stroke: "#6da0ff",
        strokeWidth: 1,
        strokeDashArray: [5, 4],
        selectable: false,
        evented: false,
      });
      guide.set({
        left: background.left + background.getScaledWidth() / 2,
        top: background.top + background.getScaledHeight(),
      });

      const tab = new fabric.Rect({
        width: Math.min(this.interfaceTabWidth, this.interfaceGuideWidth),
        height: Math.min(this.interfaceTabHeight, this.interfaceGuideHeight),
        originX: "center",
        originY: "center",
        fill: "rgba(50, 121, 255, 0.14)",
        stroke: "#285348",
        strokeWidth: 1,
        hasControls: false,
        hasBorders: false,
        lockScalingX: true,
        lockScalingY: true,
        lockRotation: true,
        lockMovementY: true,
        hoverCursor: "ew-resize",
      });
      tab.set({
        left:
          background.left +
          background.getScaledWidth() / 2 -
          this.interfaceGuideWidth / 2 +
          Math.min(this.interfaceTabWidth, this.interfaceGuideWidth) / 2,
        top: background.top + background.getScaledHeight(),
      });
      this.fabricCanvas.add(guide);
      this.fabricCanvas.add(tab);
      this.interfaceGuide = guide;
      this.interfaceTab = tab;
      this.keepInterfaceTabAttached(tab);
      this.fabricCanvas.setActiveObject(tab);
      this.fitArtworkToDimensionLimit();
    },

    handleFileChange(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      if (file.type && file.type !== "image/png") {
        this.error = "请使用带透明通道的 PNG 图片";
        return;
      }

      if (this.previewRegenerationTimer) {
        clearTimeout(this.previewRegenerationTimer);
        this.previewRegenerationTimer = null;
      }
      this.file = file;
      this.activeFace = "front";
      this.faceAssets.front = null;
      this.faceAssets.back = null;
      this.error = "";
      this.progress = 0;
      this.stage = "";
      this.resultBlob = null;
      this.artworkBlob = null;
      this.designHole = null;
      this.artworkMaskBlob = null;
      this.contentBlob = null;
      this.pathBlob = null;
      this.outerPathBlob = null;
      this.replacementFrame = null;
      this.preMergeState = null;
      this.frontEditorSnapshot = null;
      this.finish = false;

      this.generate();
    },

    openReplaceImagePicker() {
      if (this.processing || !this.file || !this.$refs.replacementInput) return;
      this.$refs.replacementInput.click();
    },

    async createHorizontallyMirroredFile(file) {
      const image = await this.loadFabricImage(file);
      const source = image.getElement ? image.getElement() : image._element;
      const width = source.naturalWidth || source.width;
      const height = source.naturalHeight || source.height;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.translate(width, 0);
      context.scale(-1, 1);
      context.drawImage(source, 0, 0, width, height);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error("替换图片镜像处理失败"));
        }, "image/png");
      });
      return new File([blob], file.name, {
        type: "image/png",
        lastModified: file.lastModified,
      });
    },

    async createReplacementFrame() {
      if (!this.file || !this.contentBlob) return null;
      const [sourceImage, contentImage] = await Promise.all([
        this.loadFabricImage(this.file),
        this.loadFabricImage(this.contentBlob),
      ]);
      const source = sourceImage.getElement
        ? sourceImage.getElement()
        : sourceImage._element;
      const content = contentImage.getElement
        ? contentImage.getElement()
        : contentImage._element;
      const sourceWidth = source.naturalWidth || source.width;
      const sourceHeight = source.naturalHeight || source.height;
      const contentWidth = content.naturalWidth || content.width;
      const contentHeight = content.naturalHeight || content.height;
      if (contentWidth < sourceWidth || contentHeight < sourceHeight) {
        throw new Error("无法保留当前图片的替换框架");
      }
      return {
        // Keep the first image as the alpha mask. Subsequent replacements are
        // clipped to it, so they cannot change the existing outer silhouette.
        maskFile: this.file,
        sourceWidth,
        sourceHeight,
        offsetX: Math.round((contentWidth - sourceWidth) / 2),
        offsetY: Math.round((contentHeight - sourceHeight) / 2),
      };
    },

    getOpaqueBounds(image) {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      let left = width;
      let top = height;
      let right = -1;
      let bottom = -1;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (pixels[(y * width + x) * 4 + 3] < 32) continue;
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
      }
      if (right < left || bottom < top) {
        throw new Error("替换图片没有可用的非透明内容");
      }
      return {
        left,
        top,
        width: right - left + 1,
        height: bottom - top + 1,
      };
    },

    canvasToPngBlob(canvas) {
      return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("替换图片处理失败"));
        }, "image/png");
      });
    },

    async getBlobDimensions(blob) {
      const image = await this.loadFabricImage(blob);
      const source = image.getElement ? image.getElement() : image._element;
      return {
        width: source.naturalWidth || source.width,
        height: source.naturalHeight || source.height,
      };
    },

    async padLayerBlob(blob, { left = 0, top = 0, right = 0, bottom = 0 }) {
      if (!blob || (!left && !top && !right && !bottom)) return blob;
      const image = await this.loadFabricImage(blob);
      const source = image.getElement ? image.getElement() : image._element;
      const width = source.naturalWidth || source.width;
      const height = source.naturalHeight || source.height;
      const canvas = document.createElement("canvas");
      canvas.width = width + left + right;
      canvas.height = height + top + bottom;
      canvas.getContext("2d").drawImage(source, left, top, width, height);
      return this.canvasToPngBlob(canvas);
    },

    getStickerSourcePosition(offsetX = 0, offsetY = 0) {
      const background = this.fabricCanvas && this.fabricCanvas.backgroundImage;
      if (!background || !this.edgeSticker) return null;
      return {
        x:
          (this.edgeSticker.left - background.left) /
            (background.scaleX || 1) +
          offsetX,
        y:
          (this.edgeSticker.top - background.top) /
            (background.scaleY || 1) +
          offsetY,
        width:
          this.edgeSticker.getScaledWidth() / (background.scaleX || 1),
        height:
          this.edgeSticker.getScaledHeight() / (background.scaleY || 1),
        angle: this.edgeSticker.angle || 0,
      };
    },

    // Component center in the pixel space shared by artworkBlob/contentBlob/
    // pathBlob; the effect editor uses it to place the hanging hole exactly
    // where the component sits on the design canvas. After the component is
    // merged (and removed from the canvas) the captured position is used.
    getDesignHole() {
      if (this.edgeSticker) {
        const position = this.getStickerSourcePosition();
        if (position) {
          return {
            x: position.x,
            y: position.y,
            shape: this.edgeSticker.stickerPattern || this.stickerPattern,
          };
        }
      }
      return this.designHole || null;
    },

    // Product silhouette for the effect editor: the enclosed interior of the
    // current die line plus the line band itself, painted opaque white. The
    // preview contour then matches the design canvas exactly instead of
    // being re-derived from the artwork alpha with a simulated border.
    async getDesignShapeRegion() {
      if (!this.pathBlob) return null;
      const interior = await this.getCutLineInteriorMask(this.pathBlob);
      const pathImage = await this.loadFabricImage(this.pathBlob);
      const path = pathImage.getElement
        ? pathImage.getElement()
        : pathImage._element;
      const context = interior.getContext("2d");
      context.globalCompositeOperation = "source-over";
      context.drawImage(path, 0, 0);
      context.globalCompositeOperation = "source-in";
      context.fillStyle = "#fff";
      context.fillRect(0, 0, interior.width, interior.height);
      return this.canvasToPngBlob(interior);
    },

    getStickerFramePadding(position, sourceWidth, sourceHeight) {
      const radians = fabric.util.degreesToRadians(position.angle || 0);
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const halfWidth = position.width / 2;
      const halfHeight = position.height / 2;
      const corners = [
        [-halfWidth, -halfHeight],
        [halfWidth, -halfHeight],
        [halfWidth, halfHeight],
        [-halfWidth, halfHeight],
      ].map(([x, y]) => ({
        x: position.x + x * cos - y * sin,
        y: position.y + x * sin + y * cos,
      }));
      const bounds = corners.reduce(
        (result, point) => ({
          left: Math.min(result.left, point.x),
          top: Math.min(result.top, point.y),
          right: Math.max(result.right, point.x),
          bottom: Math.max(result.bottom, point.y),
        }),
        {
          left: Infinity,
          top: Infinity,
          right: -Infinity,
          bottom: -Infinity,
        },
      );
      // Keep a small transparent raster gutter around the SVG so its
      // anti-aliased outer stroke is never clipped by the old image frame.
      const gutter = 2;
      return {
        left: Math.max(0, Math.ceil(gutter - bounds.left)),
        top: Math.max(0, Math.ceil(gutter - bounds.top)),
        right: Math.max(0, Math.ceil(bounds.right + gutter - sourceWidth)),
        bottom: Math.max(0, Math.ceil(bounds.bottom + gutter - sourceHeight)),
      };
    },

    async composeLayeredResult({
      backingBlob = this.contentBlob,
      artworkBlob = this.artworkBlob,
      pathBlob = this.pathBlob,
    } = {}) {
      if (!backingBlob || !pathBlob) {
        throw new Error("分层轮廓尚未准备好");
      }
      const images = await Promise.all([
        this.loadFabricImage(backingBlob),
        pathBlob ? this.loadFabricImage(pathBlob) : null,
        artworkBlob ? this.loadFabricImage(artworkBlob) : null,
      ]);
      const getElement = (image) =>
        image && (image.getElement ? image.getElement() : image._element);
      const backing = getElement(images[0]);
      const path = getElement(images[1]);
      const artwork = getElement(images[2]);
      const width = backing.naturalWidth || backing.width;
      const height = backing.naturalHeight || backing.height;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      // Bottom: pristine artwork, never rewritten by contour processing.
      if (artwork) {
        context.drawImage(artwork, 0, 0, width, height);
      }
      // Middle: inverse white field. It covers everything from the cut line
      // to the canvas edge and leaves the complete inside transparent.
      context.drawImage(backing, 0, 0, width, height);
      // Top: red cut line and independent SVG closed-path details.
      context.drawImage(path, 0, 0, width, height);
      return this.canvasToPngBlob(canvas);
    },

    async composeContentAndPath(contentBlob, pathBlob) {
      return this.composeLayeredResult({
        backingBlob: contentBlob,
        artworkBlob: null,
        artworkMaskBlob: null,
        pathBlob,
      });
    },

    async createArtworkLayerInFrame(file, frame, width, height) {
      if (!file || !frame || !frame.maskFile) {
        throw new Error("原图层框架尚未准备好");
      }
      const [artworkImage, maskImage] = await Promise.all([
        this.loadFabricImage(file),
        this.loadFabricImage(frame.maskFile),
      ]);
      const getElement = (image) =>
        image.getElement ? image.getElement() : image._element;
      const artwork = getElement(artworkImage);
      const mask = getElement(maskImage);
      const originalBounds = this.getOpaqueBounds(mask);
      const artworkBounds = this.getOpaqueBounds(artwork);
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = width;
      maskCanvas.height = height;
      const maskContext = maskCanvas.getContext("2d");
      maskContext.drawImage(
        mask,
        frame.offsetX,
        frame.offsetY,
        frame.sourceWidth,
        frame.sourceHeight,
      );
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.drawImage(
        artwork,
        artworkBounds.left,
        artworkBounds.top,
        artworkBounds.width,
        artworkBounds.height,
        frame.offsetX + originalBounds.left,
        frame.offsetY + originalBounds.top,
        originalBounds.width,
        originalBounds.height,
      );
      context.globalCompositeOperation = "destination-in";
      context.drawImage(maskCanvas, 0, 0);
      return this.canvasToPngBlob(canvas);
    },

    async replaceArtworkWithinExistingFrame(file, frame) {
      if (!this.contentBlob || !this.pathBlob || !frame || !frame.maskFile) {
        throw new Error("当前图片的轮廓框架尚未准备好");
      }
      const contentImage = await this.loadFabricImage(this.contentBlob);
      const content = contentImage.getElement
        ? contentImage.getElement()
        : contentImage._element;
      const width = content.naturalWidth || content.width;
      const height = content.naturalHeight || content.height;
      const artworkBlob = await this.createArtworkLayerInFrame(
        file,
        frame,
        width,
        height,
      );
      const blob = await this.composeLayeredResult({
        backingBlob: this.contentBlob,
        artworkBlob,
        artworkMaskBlob: this.artworkMaskBlob,
        pathBlob: this.pathBlob,
      });
      return {
        artworkBlob,
        blob,
      };
    },

    async createBackAssetFromFrontFrame(frontAsset, backAsset) {
      if (!frontAsset || !backAsset || !backAsset.file) return null;
      const previousState = {
        artworkBlob: this.artworkBlob,
        artworkMaskBlob: this.artworkMaskBlob,
        contentBlob: this.contentBlob,
        pathBlob: this.pathBlob,
        replacementFrame: this.replacementFrame,
      };
      try {
        // Reuse the completed front frame, replacing only its artwork pixels.
        // backAsset.file is already mirrored when it came from “替换图片”.
        this.artworkBlob = frontAsset.artworkBlob;
        this.artworkMaskBlob = frontAsset.artworkMaskBlob;
        this.contentBlob = frontAsset.contentBlob;
        this.pathBlob = frontAsset.pathBlob;
        this.replacementFrame = frontAsset.replacementFrame;
        const result = await this.replaceArtworkWithinExistingFrame(
          backAsset.file,
          frontAsset.replacementFrame,
        );
        return {
          ...backAsset,
          resultBlob: result.blob,
          artworkBlob: result.artworkBlob,
          artworkMaskBlob: frontAsset.artworkMaskBlob,
          contentBlob: frontAsset.contentBlob,
          pathBlob: frontAsset.pathBlob,
          outerPathBlob: frontAsset.outerPathBlob,
          replacementFrame: frontAsset.replacementFrame,
          finish: true,
          contourLayout: frontAsset.contourLayout,
          previewLayout: frontAsset.previewLayout,
        };
      } finally {
        this.artworkBlob = previousState.artworkBlob;
        this.artworkMaskBlob = previousState.artworkMaskBlob;
        this.contentBlob = previousState.contentBlob;
        this.pathBlob = previousState.pathBlob;
        this.replacementFrame = previousState.replacementFrame;
      }
    },

    async handleReplacementFileChange(event) {
      const replacement = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!replacement || this.processing) return;
      if (replacement.type && replacement.type !== "image/png") {
        this.error = "请使用带透明通道的 PNG 图片";
        return;
      }

      const targetContourLayout = this.getCanvasContourBounds();

      this.processing = true;
      this.error = "";
      this.progress = 0;
      this.stage = "镜像替换图片";
      try {
        const mirroredReplacement = await this.createHorizontallyMirroredFile(
          replacement,
        );
        this.stage = "处理替换图片";
        const frame =
          this.replacementFrame || (await this.createReplacementFrame());
        const result = await this.replaceArtworkWithinExistingFrame(
          mirroredReplacement,
          frame,
        );
        this.file = mirroredReplacement;
        this.resultBlob = result.blob;
        this.artworkBlob = result.artworkBlob;
        this.replacementFrame = frame;
        this.preMergeState = null;
        this.finish = false;
        await this.insertImage(result.blob, {
          addSticker: false,
          preserveAccessories: true,
        });
        this.alignCanvasContourTo(targetContourLayout);
        this.storeFaceAsset();
      } catch (err) {
        console.error(err);
        this.error = err.message || "替换图片失败";
      } finally {
        this.processing = false;
        this.stage = "";
      }
    },

    getPreviewWorkerOptions(width, height, options, whiteBorder, cutLine) {
      const requestedWhiteBorder = Number(whiteBorder) || 0;
      const requestedCutLine = Math.max(0, Number(cutLine) || 0);
      const requestedInnerHoleWhiteBorder =
        Number(options.innerHoleWhiteBorder) || 0;
      const requestedSmoothing = Number(options.contourSmoothing) || 0;
      const smoothing =
        requestedSmoothing > 0
          ? Math.round(requestedSmoothing)
          : requestedWhiteBorder === 0
            ? 0
            : Math.max(32, Math.round(Math.min(width, height) * 0.06));

      // Worker distances are source pixels, while Fabric fits every output
      // into a 500px square. Solve the fit scale first, then convert the
      // requested Fabric-pixel widths to source pixels. This keeps the white
      // border and cut line visually constant for differently sized images.
      const fitScale = Math.max(
        0.01,
        (500 - 2 * (Math.max(0, requestedWhiteBorder) + requestedCutLine)) /
          (Math.max(width, height) + smoothing * 2),
      );

      return {
        ...options,
        whiteBorder: Math.round(requestedWhiteBorder / fitScale),
        cutLine: Math.round(requestedCutLine / fitScale),
        innerHoleWhiteBorder: Math.round(
          requestedInnerHoleWhiteBorder / fitScale,
        ),
      };
    },

    crc32(bytes) {
      let crc = 0xffffffff;
      for (let index = 0; index < bytes.length; index += 1) {
        crc ^= bytes[index];
        for (let bit = 0; bit < 8; bit += 1) {
          crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
        }
      }
      return (crc ^ 0xffffffff) >>> 0;
    },

    createPngChunk(type, data) {
      const typeBytes = new Uint8Array(
        type.split("").map((char) => char.charCodeAt(0)),
      );
      const payload = new Uint8Array(typeBytes.length + data.length);
      payload.set(typeBytes);
      payload.set(data, typeBytes.length);
      const chunk = new Uint8Array(data.length + 12);
      const view = new DataView(chunk.buffer);
      view.setUint32(0, data.length);
      chunk.set(payload, 4);
      view.setUint32(8 + data.length, this.crc32(payload));
      return chunk;
    },

    async setPngDpi(blob, dpi) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
      if (pngSignature.some((value, index) => bytes[index] !== value)) {
        return blob;
      }

      const pixelsPerMeter = Math.round(Math.max(1, dpi) / 0.0254);
      const physicalData = new Uint8Array(9);
      const physicalView = new DataView(physicalData.buffer);
      physicalView.setUint32(0, pixelsPerMeter);
      physicalView.setUint32(4, pixelsPerMeter);
      physicalData[8] = 1;
      const physicalChunk = this.createPngChunk("pHYs", physicalData);
      const chunks = [bytes.slice(0, 8)];
      let offset = 8;
      let inserted = false;

      while (offset + 12 <= bytes.length) {
        const length = new DataView(
          bytes.buffer,
          bytes.byteOffset + offset,
          4,
        ).getUint32(0);
        const chunkEnd = offset + 12 + length;
        if (chunkEnd > bytes.length) return blob;
        const type = String.fromCharCode(
          bytes[offset + 4],
          bytes[offset + 5],
          bytes[offset + 6],
          bytes[offset + 7],
        );
        if (type !== "pHYs") chunks.push(bytes.slice(offset, chunkEnd));
        if (type === "IHDR" && !inserted) {
          chunks.push(physicalChunk);
          inserted = true;
        }
        offset = chunkEnd;
      }
      return new Blob(chunks, { type: "image/png" });
    },

    async resizeDownloadBlob(blob, crop, targetWidth, targetHeight, dpi) {
      const image = await this.loadFabricImage(blob);
      const element = image.getElement ? image.getElement() : image._element;
      const sourceWidth = element.naturalWidth || element.width;
      const sourceHeight = element.naturalHeight || element.height;
      const cropLeft = Math.max(0, Math.floor(crop.left));
      const cropTop = Math.max(0, Math.floor(crop.top));
      const cropWidth = Math.min(
        sourceWidth - cropLeft,
        Math.max(1, Math.ceil(crop.right) - cropLeft),
      );
      const cropHeight = Math.min(
        sourceHeight - cropTop,
        Math.max(1, Math.ceil(crop.bottom) - cropTop),
      );
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext("2d");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(
        element,
        cropLeft,
        cropTop,
        cropWidth,
        cropHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const output = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error("Failed to resize the download image"));
        }, "image/png");
      });
      return this.setPngDpi(output, dpi);
    },

    getDownloadBaseName(file) {
      const originalName = file && file.name ? file.name : "pattern.png";
      const extensionIndex = originalName.lastIndexOf(".");
      return extensionIndex > 0
        ? originalName.slice(0, extensionIndex)
        : originalName;
    },

    async getResizedDownloadImages({ contentBlob, pathBlob }) {
      if (!contentBlob || !pathBlob) {
        throw new Error("The separated contour images are not ready");
      }

      const dpi = Math.max(1, Math.round(Number(this.form.dpi) || 72));
      const pathImage = await this.loadFabricImage(pathBlob);
      const pathElement = pathImage.getElement
        ? pathImage.getElement()
        : pathImage._element;
      const sourceWidth = pathElement.naturalWidth || pathElement.width;
      const sourceHeight = pathElement.naturalHeight || pathElement.height;
      const contourBounds = this.getContourBounds(
        this.getOuterContour(pathImage, 0, 0, 1, 1),
        { left: 0, top: 0, right: sourceWidth, bottom: sourceHeight },
      );
      const targetWidthPx = Math.max(
        1,
        Math.round((this.actualImageWidthCm / 2.54) * dpi),
      );
      const targetHeightPx = Math.max(
        1,
        Math.round((this.actualImageHeightCm / 2.54) * dpi),
      );
      const crop = {
        left: contourBounds.left,
        top: contourBounds.top,
        right: contourBounds.right,
        bottom: contourBounds.bottom,
      };
      const [resizedContentBlob, resizedPathBlob] = await Promise.all([
        this.resizeDownloadBlob(
          contentBlob,
          crop,
          targetWidthPx,
          targetHeightPx,
          dpi,
        ),
        this.resizeDownloadBlob(
          pathBlob,
          crop,
          targetWidthPx,
          targetHeightPx,
          dpi,
        ),
      ]);

      return { resizedContentBlob, resizedPathBlob };
    },

    async downloadSeparatedImages(asset) {
      const { resizedContentBlob, resizedPathBlob } =
        await this.getResizedDownloadImages(asset);
      const baseName = this.getDownloadBaseName(asset.file);

      // Content keeps the original filename; the contour-only PNG follows the
      // requested "pattern-name_mask.png" convention.
      downloadBlob(resizedContentBlob, `${baseName}.png`);
      downloadBlob(resizedPathBlob, `${baseName}_mask.png`);
    },

    async getResizedArtworkImage(asset) {
      if (!asset || !asset.artworkBlob || !asset.pathBlob) {
        throw new Error("正反面原始内容图未准备好");
      }
      const dpi = Math.max(1, Math.round(Number(this.form.dpi) || 72));
      // The artwork and cut-line layers share the same full-size coordinate
      // system. This keeps the downloaded pixels aligned with _mask instead
      // of stretching the original upload's opaque bounds to fill it.
      const image = await this.loadFabricImage(asset.pathBlob);
      const element = image.getElement ? image.getElement() : image._element;
      const sourceWidth = element.naturalWidth || element.width;
      const sourceHeight = element.naturalHeight || element.height;
      const contourBounds = this.getContourBounds(
        this.getOuterContour(image, 0, 0, 1, 1),
        { left: 0, top: 0, right: sourceWidth, bottom: sourceHeight },
      );
      const targetWidthPx = Math.max(
        1,
        Math.round((this.actualImageWidthCm / 2.54) * dpi),
      );
      const targetHeightPx = Math.max(
        1,
        Math.round((this.actualImageHeightCm / 2.54) * dpi),
      );
      return this.resizeDownloadBlob(
        asset.artworkBlob,
        {
          left: contourBounds.left,
          top: contourBounds.top,
          right: contourBounds.right,
          bottom: contourBounds.bottom,
        },
        targetWidthPx,
        targetHeightPx,
        dpi,
      );
    },

    async downloadImages() {
      if (!this.contentBlob || !this.pathBlob || this.processing) return;

      this.processing = true;
      this.error = "";
      this.stage = "准备下载";
      try {
        const currentAsset = {
          file: this.file,
          artworkBlob: this.artworkBlob,
          contentBlob: this.contentBlob,
          pathBlob: this.pathBlob,
        };
        const frontAsset = this.faceAssets.front || currentAsset;
        const backAsset = this.faceAssets.back || frontAsset;
        const [frontImages, resizedFrontArtwork, resizedBackArtwork] =
          await Promise.all([
            this.getResizedDownloadImages(frontAsset),
            this.getResizedArtworkImage(frontAsset),
            this.getResizedArtworkImage(backAsset),
          ]);
        const baseName = this.getDownloadBaseName(frontAsset.file);
        downloadBlob(resizedFrontArtwork, `${baseName}.png`);
        downloadBlob(frontImages.resizedPathBlob, `${baseName}_mask.png`);
        downloadBlob(resizedBackArtwork, `${baseName}_back.png`);
      } catch (err) {
        console.error(err);
        this.error = err.message || "图片下载失败";
      } finally {
        this.processing = false;
        this.stage = "";
      }
    },

    async saveCanvasScreenshot() {
      if (
        !this.fabricCanvas ||
        !this.fabricCanvas.backgroundImage ||
        this.processing ||
        this.savingCanvasScreenshot
      ) {
        return;
      }

      this.savingCanvasScreenshot = true;
      this.error = "";
      try {
        // Fabric renders the design objects and dimension annotations, but
        // deliberately omits the transient selection handles from the PNG.
        this.fabricCanvas.renderAll();
        const screenshotCanvas = this.fabricCanvas.toCanvasElement(1);
        const screenshotBlob = await this.canvasToPngBlob(screenshotCanvas);
        const baseName = this.getDownloadBaseName(this.file);
        downloadBlob(
          screenshotBlob,
          `${baseName}_${this.activeFace}_canvas.png`,
        );
      } catch (err) {
        console.error(err);
        this.error = err.message || "保存画布截图失败";
      } finally {
        this.savingCanvasScreenshot = false;
      }
    },

    getPrimarySvgComponent(imageData, width, height) {
      const pixelCount = width * height;
      const labels = new Int32Array(pixelCount);
      const componentSizes = [];
      const componentBounds = [];
      let label = 0;
      for (let start = 0; start < pixelCount; start += 1) {
        if (labels[start] || imageData[start * 4 + 3] < 32) continue;
        label += 1;
        let size = 0;
        const bounds = {
          left: width,
          top: height,
          right: -1,
          bottom: -1,
        };
        const queue = [start];
        labels[start] = label;
        while (queue.length) {
          const index = queue.pop();
          size += 1;
          const pixelX = index % width;
          const pixelY = (index - pixelX) / width;
          bounds.left = Math.min(bounds.left, pixelX);
          bounds.top = Math.min(bounds.top, pixelY);
          bounds.right = Math.max(bounds.right, pixelX);
          bounds.bottom = Math.max(bounds.bottom, pixelY);
          const neighbors = [
            index - 1,
            index + 1,
            index - width,
            index + width,
          ];
          neighbors.forEach((neighbor) => {
            const neighborX = neighbor % width;
            if (
              neighbor < 0 ||
              neighbor >= pixelCount ||
              Math.abs(neighborX - pixelX) > 1 ||
              labels[neighbor] ||
              imageData[neighbor * 4 + 3] < 32
            ) {
              return;
            }
            labels[neighbor] = label;
            queue.push(neighbor);
          });
        }
        componentSizes[label] = size;
        componentBounds[label] = bounds;
      }
      const primaryLabel = componentBounds.reduce((largest, bounds, index) => {
        if (!bounds) return largest;
        const area =
          (bounds.right - bounds.left + 1) * (bounds.bottom - bounds.top + 1);
        const largestBounds = componentBounds[largest];
        const largestArea = largestBounds
          ? (largestBounds.right - largestBounds.left + 1) *
            (largestBounds.bottom - largestBounds.top + 1)
          : 0;
        return area > largestArea ? index : largest;
      }, 0);
      return { labels, primaryLabel };
    },

    createStickerPrimaryMask(width, height, { fillInterior = false } = {}) {
      const element = this.edgeSticker.getElement
        ? this.edgeSticker.getElement()
        : this.edgeSticker._element;
      if (!element || width <= 0 || height <= 0) return null;

      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = Math.max(1, Math.ceil(width));
      maskCanvas.height = Math.max(1, Math.ceil(height));
      const maskContext = maskCanvas.getContext("2d");
      maskContext.drawImage(element, 0, 0, maskCanvas.width, maskCanvas.height);
      // Preserve the selected SVG/PNG's alpha shape while keeping the
      // component out of the exported artwork colours.
      maskContext.globalCompositeOperation = "source-in";
      maskContext.fillStyle = "#fff";
      maskContext.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
      const maskPixels = maskContext.getImageData(
        0,
        0,
        maskCanvas.width,
        maskCanvas.height,
      );
      const { labels, primaryLabel } = this.getPrimarySvgComponent(
        maskPixels.data,
        maskCanvas.width,
        maskCanvas.height,
      );
      for (let index = 0; index < labels.length; index += 1) {
        if (labels[index] && labels[index] !== primaryLabel) {
          maskPixels.data[index * 4 + 3] = 0;
        }
      }
      if (fillInterior) {
        // The die line must be removed from the whole area enclosed by the
        // primary SVG outline, not only from the painted SVG stroke. Flooding
        // transparent pixels from the canvas edge distinguishes exterior
        // transparency from holes enclosed by a closed component outline.
        const { width: maskWidth, height: maskHeight, data } = maskPixels;
        const pixelCount = maskWidth * maskHeight;
        const exterior = new Uint8Array(pixelCount);
        const queue = new Int32Array(pixelCount);
        let head = 0;
        let tail = 0;
        const enqueueExterior = (index) => {
          if (exterior[index] || data[index * 4 + 3] >= 32) return;
          exterior[index] = 1;
          queue[tail++] = index;
        };
        for (let x = 0; x < maskWidth; x += 1) {
          enqueueExterior(x);
          enqueueExterior((maskHeight - 1) * maskWidth + x);
        }
        for (let y = 0; y < maskHeight; y += 1) {
          enqueueExterior(y * maskWidth);
          enqueueExterior(y * maskWidth + maskWidth - 1);
        }
        while (head < tail) {
          const index = queue[head++];
          const x = index % maskWidth;
          const y = (index - x) / maskWidth;
          if (x > 0) enqueueExterior(index - 1);
          if (x < maskWidth - 1) enqueueExterior(index + 1);
          if (y > 0) enqueueExterior(index - maskWidth);
          if (y < maskHeight - 1) enqueueExterior(index + maskWidth);
        }
        for (let index = 0; index < pixelCount; index += 1) {
          if (!exterior[index]) data[index * 4 + 3] = 255;
        }
      }
      maskContext.putImageData(maskPixels, 0, 0);
      return maskCanvas;
    },

    drawStickerMask(context, { x, y, width, height, angle = 0 }) {
      const maskCanvas = this.createStickerPrimaryMask(width, height);
      if (!maskCanvas) return;
      context.save();
      // The component may extend the cut contour outside the artwork, but it
      // must never paint over existing image pixels. Drawing behind the
      // source keeps the overlapping portion visually transparent.
      context.globalCompositeOperation = "destination-over";
      context.translate(x, y);
      context.rotate(fabric.util.degreesToRadians(angle));
      context.drawImage(maskCanvas, -width / 2, -height / 2, width, height);
      context.restore();
    },

    async clearStickerConnectionLine(blob, { x, y, width, height, angle = 0 }) {
      const image = await this.loadFabricImage(blob);
      const source = image.getElement ? image.getElement() : image._element;
      const outputWidth = source.naturalWidth || source.width;
      const outputHeight = source.naturalHeight || source.height;
      const maskCanvas = this.createStickerPrimaryMask(width, height, {
        fillInterior: true,
      });
      if (!maskCanvas) return blob;

      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = outputWidth;
      outputCanvas.height = outputHeight;
      const outputContext = outputCanvas.getContext("2d");
      outputContext.drawImage(source, 0, 0, outputWidth, outputHeight);
      // pathBlob is a dedicated die-line layer. Remove every original path
      // pixel covered by the closed outer SVG loop, rather than keying the
      // operation to a particular red value. This leaves the SVG/component
      // intersection genuinely transparent and also works for a custom
      // cut-line colour.
      outputContext.save();
      outputContext.globalCompositeOperation = "destination-out";
      outputContext.translate(x, y);
      outputContext.rotate(fabric.util.degreesToRadians(angle));
      outputContext.drawImage(maskCanvas, -width / 2, -height / 2, width, height);
      outputContext.restore();

      return new Promise((resolve, reject) => {
        outputCanvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error("Failed to clear component connection line"));
        }, "image/png");
      });
    },

    async restoreOriginalStickerOverlap(
      blob,
      sourceBlob,
      {
        x,
        y,
        width,
        height,
        angle = 0,
        sourceLeft,
        sourceTop,
        padding = 0,
        useBoundingBox = false,
      },
    ) {
      const [outputImage, sourceImage] = await Promise.all([
        this.loadFabricImage(blob),
        this.loadFabricImage(sourceBlob),
      ]);
      const output = outputImage.getElement
        ? outputImage.getElement()
        : outputImage._element;
      const source = sourceImage.getElement
        ? sourceImage.getElement()
        : sourceImage._element;
      const outputWidth = output.naturalWidth || output.width;
      const outputHeight = output.naturalHeight || output.height;
      const sourceWidth = source.naturalWidth || source.width;
      const sourceHeight = source.naturalHeight || source.height;
      const maskCanvas = useBoundingBox
        ? (() => {
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.ceil(width));
            canvas.height = Math.max(1, Math.ceil(height));
            canvas.getContext("2d").fillRect(0, 0, canvas.width, canvas.height);
            return canvas;
          })()
        : this.createStickerPrimaryMask(width, height);
      if (!maskCanvas) return blob;

      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = outputWidth;
      outputCanvas.height = outputHeight;
      const outputContext = outputCanvas.getContext("2d");
      outputContext.drawImage(output, 0, 0, outputWidth, outputHeight);

      const originalLayer = document.createElement("canvas");
      originalLayer.width = outputWidth;
      originalLayer.height = outputHeight;
      const originalContext = originalLayer.getContext("2d");
      originalContext.drawImage(
        source,
        sourceLeft,
        sourceTop,
        sourceWidth,
        sourceHeight,
      );
      // Restore the original pixels only within the component's connection
      // area. A small expansion also covers the smoothed white join.
      originalContext.globalCompositeOperation = "destination-in";
      originalContext.save();
      originalContext.translate(x, y);
      originalContext.rotate(fabric.util.degreesToRadians(angle));
      originalContext.drawImage(
        maskCanvas,
        -width / 2 - padding,
        -height / 2 - padding,
        width + padding * 2,
        height + padding * 2,
      );
      originalContext.restore();
      outputContext.drawImage(originalLayer, 0, 0);

      return new Promise((resolve, reject) => {
        outputCanvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error("Failed to restore component overlap"));
        }, "image/png");
      });
    },

    async addStickerInnerDetails(blob, { x, y, width, height, angle = 0 }) {
      const image = await this.loadFabricImage(blob);
      const source = image.getElement ? image.getElement() : image._element;
      const outputWidth = source.naturalWidth || source.width;
      const outputHeight = source.naturalHeight || source.height;
      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = outputWidth;
      outputCanvas.height = outputHeight;
      const outputContext = outputCanvas.getContext("2d");
      outputContext.drawImage(source, 0, 0, outputWidth, outputHeight);

      const stickerElement = this.edgeSticker.getElement
        ? this.edgeSticker.getElement()
        : this.edgeSticker._element;
      const detailCanvas = document.createElement("canvas");
      detailCanvas.width = Math.max(1, Math.ceil(width));
      detailCanvas.height = Math.max(1, Math.ceil(height));
      const detailContext = detailCanvas.getContext("2d");
      detailContext.drawImage(
        stickerElement,
        0,
        0,
        detailCanvas.width,
        detailCanvas.height,
      );

      const pixels = detailContext.getImageData(
        0,
        0,
        detailCanvas.width,
        detailCanvas.height,
      );
      const { data } = pixels;
      const pixelCount = detailCanvas.width * detailCanvas.height;
      const { labels, primaryLabel } = this.getPrimarySvgComponent(
        data,
        detailCanvas.width,
        detailCanvas.height,
      );

      const detailPixels = detailContext.createImageData(
        detailCanvas.width,
        detailCanvas.height,
      );
      for (let index = 0; index < pixelCount; index += 1) {
        if (!labels[index] || labels[index] === primaryLabel) continue;
        const offset = index * 4;
        detailPixels.data[offset] = 227;
        detailPixels.data[offset + 1] = 76;
        detailPixels.data[offset + 2] = 87;
        detailPixels.data[offset + 3] = data[offset + 3];
      }
      detailContext.clearRect(0, 0, detailCanvas.width, detailCanvas.height);
      detailContext.putImageData(detailPixels, 0, 0);
      outputContext.save();
      outputContext.translate(x, y);
      outputContext.rotate(fabric.util.degreesToRadians(angle));
      outputContext.drawImage(
        detailCanvas,
        -width / 2,
        -height / 2,
        width,
        height,
      );
      outputContext.restore();

      return new Promise((resolve, reject) => {
        outputCanvas.toBlob((output) => {
          if (output) resolve(output);
          else reject(new Error("Failed to add component details"));
        }, "image/png");
      });
    },

    async getCutLineInteriorMask(blob) {
      const image = await this.loadFabricImage(blob);
      const source = image.getElement ? image.getElement() : image._element;
      const width = source.naturalWidth || source.width;
      const height = source.naturalHeight || source.height;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(source, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height);
      const { data } = pixels;
      const pixelCount = width * height;
      const exterior = new Uint8Array(pixelCount);
      const queue = new Int32Array(pixelCount);
      let head = 0;
      let tail = 0;
      const enqueueExterior = (index) => {
        if (exterior[index] || data[index * 4 + 3] >= 32) return;
        exterior[index] = 1;
        queue[tail++] = index;
      };
      for (let x = 0; x < width; x += 1) {
        enqueueExterior(x);
        enqueueExterior((height - 1) * width + x);
      }
      for (let y = 0; y < height; y += 1) {
        enqueueExterior(y * width);
        enqueueExterior(y * width + width - 1);
      }
      while (head < tail) {
        const index = queue[head++];
        const x = index % width;
        const y = (index - x) / width;
        if (x > 0) enqueueExterior(index - 1);
        if (x < width - 1) enqueueExterior(index + 1);
        if (y > 0) enqueueExterior(index - width);
        if (y < height - 1) enqueueExterior(index + width);
      }
      for (let index = 0; index < pixelCount; index += 1) {
        const offset = index * 4;
        const isInterior = !exterior[index] && data[offset + 3] < 32;
        data[offset] = 255;
        data[offset + 1] = 255;
        data[offset + 2] = 255;
        // Keep the original boundary outside this mask. The source die line
        // has already been cleared beneath the component, but retaining this
        // one-pixel edge lets the surviving SVG contour meet it cleanly
        // instead of losing an anti-aliased segment at the intersection.
        data[offset + 3] = isInterior ? 255 : 0;
      }
      context.putImageData(pixels, 0, 0);
      return canvas;
    },

    async findStickerCutLineConnection(
      pathBlob,
      { x, y, width, height, angle = 0 },
    ) {
      const pathImage = await this.loadFabricImage(pathBlob);
      const path = pathImage.getElement
        ? pathImage.getElement()
        : pathImage._element;
      const pathWidth = path.naturalWidth || path.width;
      const pathHeight = path.naturalHeight || path.height;
      const pathCanvas = document.createElement("canvas");
      pathCanvas.width = pathWidth;
      pathCanvas.height = pathHeight;
      const pathContext = pathCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      pathContext.drawImage(path, 0, 0, pathWidth, pathHeight);
      const pathPixels = pathContext.getImageData(
        0,
        0,
        pathWidth,
        pathHeight,
      ).data;
      const primaryMask = this.createStickerPrimaryMask(width, height);
      if (!primaryMask) return null;
      const maskContext = primaryMask.getContext("2d", {
        willReadFrequently: true,
      });
      const maskPixels = maskContext.getImageData(
        0,
        0,
        primaryMask.width,
        primaryMask.height,
      ).data;
      const cutLineWidth = Math.max(1, Number(this.form.cutLine) || 1);
      const maxDistance = Math.max(
        cutLineWidth * 4,
        Math.min(width, height) * 0.55,
        12,
      );
      const minX = Math.max(0, Math.floor(x - width / 2 - maxDistance));
      const maxX = Math.min(
        pathWidth - 1,
        Math.ceil(x + width / 2 + maxDistance),
      );
      const minY = Math.max(0, Math.floor(y - height / 2 - maxDistance));
      const maxY = Math.min(
        pathHeight - 1,
        Math.ceil(y + height / 2 + maxDistance),
      );
      const cutLinePoints = [];
      for (let py = minY; py <= maxY; py += 1) {
        for (let px = minX; px <= maxX; px += 1) {
          if (pathPixels[(py * pathWidth + px) * 4 + 3] >= 32) {
            cutLinePoints.push({ x: px + 0.5, y: py + 0.5 });
          }
        }
      }
      if (!cutLinePoints.length) return null;

      const radians = fabric.util.degreesToRadians(angle);
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      let nearest = null;
      for (let sy = 0; sy < primaryMask.height; sy += 1) {
        for (let sx = 0; sx < primaryMask.width; sx += 1) {
          if (maskPixels[(sy * primaryMask.width + sx) * 4 + 3] < 32) {
            continue;
          }
          const localX = sx + 0.5 - primaryMask.width / 2;
          const localY = sy + 0.5 - primaryMask.height / 2;
          const componentX = x + localX * cos - localY * sin;
          const componentY = y + localX * sin + localY * cos;
          for (let index = 0; index < cutLinePoints.length; index += 1) {
            const cutPoint = cutLinePoints[index];
            const distanceSquared =
              (componentX - cutPoint.x) ** 2 + (componentY - cutPoint.y) ** 2;
            if (!nearest || distanceSquared < nearest.distanceSquared) {
              nearest = {
                componentX,
                componentY,
                cutX: cutPoint.x,
                cutY: cutPoint.y,
                distanceSquared,
              };
            }
          }
        }
      }
      return nearest && Math.sqrt(nearest.distanceSquared) <= maxDistance
        ? nearest
        : null;
    },

    async findStickerDiameterConnections(
      pathBlob,
      position,
      interiorMask,
    ) {
      const pathImage = await this.loadFabricImage(pathBlob);
      const path = pathImage.getElement
        ? pathImage.getElement()
        : pathImage._element;
      const pathWidth = path.naturalWidth || path.width;
      const pathHeight = path.naturalHeight || path.height;
      const pathCanvas = document.createElement("canvas");
      pathCanvas.width = pathWidth;
      pathCanvas.height = pathHeight;
      const pathContext = pathCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      pathContext.drawImage(path, 0, 0, pathWidth, pathHeight);
      const pathPixels = pathContext.getImageData(
        0,
        0,
        pathWidth,
        pathHeight,
      ).data;
      const interiorPixels = interiorMask
        .getContext("2d", { willReadFrequently: true })
        .getImageData(0, 0, pathWidth, pathHeight).data;
      const primaryMask = this.createStickerPrimaryMask(
        position.width,
        position.height,
      );
      if (!primaryMask) return null;
      const primaryPixels = primaryMask
        .getContext("2d", { willReadFrequently: true })
        .getImageData(0, 0, primaryMask.width, primaryMask.height).data;
      const radians = fabric.util.degreesToRadians(position.angle || 0);
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const outerPoints = [];
      const componentBoundaryPoints = [];
      const isComponentPixel = (x, y) =>
        x >= 0 &&
        x < primaryMask.width &&
        y >= 0 &&
        y < primaryMask.height &&
        primaryPixels[(y * primaryMask.width + x) * 4 + 3] >= 32;
      for (let y = 0; y < primaryMask.height; y += 1) {
        for (let x = 0; x < primaryMask.width; x += 1) {
          if (primaryPixels[(y * primaryMask.width + x) * 4 + 3] < 32) {
            continue;
          }
          const localX = x + 0.5 - primaryMask.width / 2;
          const localY = y + 0.5 - primaryMask.height / 2;
          const point = {
            x: position.x + localX * cos - localY * sin,
            y: position.y + localX * sin + localY * cos,
          };
          const sampleX = Math.round(point.x);
          const sampleY = Math.round(point.y);
          if (
            sampleX < 0 ||
            sampleX >= pathWidth ||
            sampleY < 0 ||
            sampleY >= pathHeight ||
            interiorPixels[(sampleY * pathWidth + sampleX) * 4 + 3] < 32
          ) {
              outerPoints.push(point);
          }
          if (
            !isComponentPixel(x - 1, y) ||
            !isComponentPixel(x + 1, y) ||
            !isComponentPixel(x, y - 1) ||
            !isComponentPixel(x, y + 1)
          ) {
            componentBoundaryPoints.push(point);
          }
        }
      }
      if (outerPoints.length < 2) return null;

      const maxDistance = Math.max(
        (Number(this.form.cutLine) || 1) * 4,
        Math.min(position.width, position.height) * 1.25,
        12,
      );
      const minX = Math.max(
        0,
        Math.floor(position.x - position.width / 2 - maxDistance),
      );
      const maxX = Math.min(
        pathWidth - 1,
        Math.ceil(position.x + position.width / 2 + maxDistance),
      );
      const minY = Math.max(
        0,
        Math.floor(position.y - position.height / 2 - maxDistance),
      );
      const maxY = Math.min(
        pathHeight - 1,
        Math.ceil(position.y + position.height / 2 + maxDistance),
      );
      const contourPoints = this.getOuterContour(
        pathImage,
        0,
        0,
        1,
        1,
      ).filter(
        (point) =>
          point.x >= minX &&
          point.x <= maxX &&
          point.y >= minY &&
          point.y <= maxY,
      );
      if (!contourPoints.length) return null;
      const smoothRadius = Math.max(
        4,
        Math.min(position.width, position.height) * 0.12,
      );
      const smoothRadiusSquared = smoothRadius * smoothRadius;
      const smoothCandidates = contourPoints.map((point) => {
        let normalX = 0;
        let normalY = 0;
        let neighborCount = 0;
        contourPoints.forEach((neighbor) => {
          if (
            (neighbor.x - point.x) ** 2 + (neighbor.y - point.y) ** 2 >
            smoothRadiusSquared
          ) {
            return;
          }
          normalX += neighbor.normalX;
          normalY += neighbor.normalY;
          neighborCount += 1;
        });
        const normalMagnitude = Math.hypot(normalX, normalY);
        const normalLength = normalMagnitude || 1;
        return {
          ...point,
          normalX: normalX / normalLength,
          normalY: normalY / normalLength,
          tangentX: -normalY / normalLength,
          tangentY: normalX / normalLength,
          // Consistent neighboring normals indicate a straight or gently
          // curved section; corners and noisy pixels receive a lower score.
          smoothness: neighborCount ? normalMagnitude / neighborCount : 0,
        };
      });
      const centerConnection = smoothCandidates.reduce((nearest, candidate) => {
        const distanceSquared =
          (position.x - candidate.x) ** 2 +
          (position.y - candidate.y) ** 2;
        return !nearest || distanceSquared < nearest.distanceSquared
          ? { ...candidate, distanceSquared }
          : nearest;
      }, null);
      const diameter = getMaximumDiameterPair(outerPoints, {
        x: position.x - centerConnection.x,
        y: position.y - centerConnection.y,
      });
      if (!diameter) return null;
      const componentTangentAt = (endpoint) => {
        const nearest = componentBoundaryPoints.reduce(
          (best, boundaryPoint) => {
            const distanceSquared =
              (boundaryPoint.x - endpoint.x) ** 2 +
              (boundaryPoint.y - endpoint.y) ** 2;
            return !best || distanceSquared < best.distanceSquared
              ? { point: boundaryPoint, distanceSquared }
              : best;
          },
          null,
        );
        if (!nearest) return null;
        const tangentRadius = Math.max(
          3,
          Math.min(position.width, position.height) * 0.1,
        );
        const nearby = componentBoundaryPoints.filter(
          (point) =>
            (point.x - nearest.point.x) ** 2 +
              (point.y - nearest.point.y) ** 2 <=
            tangentRadius ** 2,
        );
        if (nearby.length < 2) return null;
        const mean = nearby.reduce(
          (total, point) => ({
            x: total.x + point.x / nearby.length,
            y: total.y + point.y / nearby.length,
          }),
          { x: 0, y: 0 },
        );
        const covariance = nearby.reduce(
          (total, point) => {
            const dx = point.x - mean.x;
            const dy = point.y - mean.y;
            return {
              xx: total.xx + dx * dx,
              xy: total.xy + dx * dy,
              yy: total.yy + dy * dy,
            };
          },
          { xx: 0, xy: 0, yy: 0 },
        );
        const angle =
          Math.atan2(covariance.xy * 2, covariance.xx - covariance.yy) / 2;
        return { x: Math.cos(angle), y: Math.sin(angle) };
      };
      const componentTangents = diameter.map(componentTangentAt);
      const firstCutPoint = selectSmoothContourPoint(
        smoothCandidates,
        diameter[0],
        maxDistance,
      );
      if (!firstCutPoint) return null;
      const minimumSeparation = Math.min(
        Math.hypot(
          diameter[1].x - diameter[0].x,
          diameter[1].y - diameter[0].y,
        ) * 0.25,
        smoothRadius * 2,
      );
      const secondCutPoint = selectSmoothContourPoint(
        smoothCandidates,
        diameter[1],
        maxDistance,
        firstCutPoint,
        minimumSeparation,
      );
      if (!secondCutPoint) return null;
      return [
        {
          componentPoint: diameter[0],
          componentTangent: componentTangents[0],
          cutPoint: firstCutPoint,
        },
        {
          componentPoint: diameter[1],
          componentTangent: componentTangents[1],
          cutPoint: secondCutPoint,
        },
      ];
    },

    async addSmoothStickerCutLineJoin(blob, position, originalCutLineBlob) {
      const connection = await this.findStickerCutLineConnection(
        originalCutLineBlob,
        position,
      );
      if (!connection) return blob;
      const image = await this.loadFabricImage(blob);
      const source = image.getElement ? image.getElement() : image._element;
      const width = source.naturalWidth || source.width;
      const height = source.naturalHeight || source.height;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.drawImage(source, 0, 0, width, height);
      // A round-capped bridge closes small exterior gaps and overlaps both
      // surviving contour ends, preventing an anti-aliased break at the join.
      context.save();
      context.strokeStyle = "#e34c57";
      const joinWidth = Math.max(
        Number(this.form.cutLine) || 1,
        Math.min(position.width, position.height) * 0.1,
      );
      context.lineWidth = joinWidth;
      context.lineCap = "round";
      if (Math.sqrt(connection.distanceSquared) <= joinWidth) {
        // Canvas may skip a zero-length stroke. A filled round cap makes
        // components sitting directly on the die line join visibly and
        // smoothly in that case.
        context.fillStyle = "#e34c57";
        context.beginPath();
        context.arc(
          connection.cutX,
          connection.cutY,
          joinWidth / 2,
          0,
          Math.PI * 2,
        );
        context.fill();
      } else {
        context.beginPath();
        context.moveTo(connection.cutX, connection.cutY);
        context.lineTo(connection.componentX, connection.componentY);
        context.stroke();
      }
      context.restore();
      return this.canvasToPngBlob(canvas);
    },

    async cropPathLayer(blob, left, top, width, height) {
      const image = await this.loadFabricImage(blob);
      const source = image.getElement ? image.getElement() : image._element;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.drawImage(source, left, top, width, height, 0, 0, width, height);
      return this.canvasToPngBlob(canvas);
    },

    async preserveCutLineOutsideComponent(
      blob,
      componentMask,
      radius,
      feather,
      originalPathBlob = this.pathBlob,
    ) {
      const [originalImage, rebuiltImage] = await Promise.all([
        this.loadFabricImage(originalPathBlob),
        this.loadFabricImage(blob),
      ]);
      const { width, height } = componentMask;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const getPixels = (image) => {
        context.clearRect(0, 0, width, height);
        context.drawImage(
          image.getElement ? image.getElement() : image._element,
          0,
          0,
        );
        return context.getImageData(0, 0, width, height);
      };
      const original = getPixels(originalImage);
      const rebuilt = getPixels(rebuiltImage);
      const mask = componentMask
        .getContext("2d")
        .getImageData(0, 0, width, height);
      original.data.set(
        mergeLocalContourPixels(
          original.data,
          rebuilt.data,
          mask.data,
          width,
          height,
          radius,
          feather,
        ),
      );
      context.putImageData(original, 0, 0);
      return this.canvasToPngBlob(canvas);
    },

    async rebuildStickerCutLine(position, { pathBlob = this.pathBlob } = {}) {
      const originalInterior = await this.getCutLineInteriorMask(pathBlob);
      const width = originalInterior.width;
      const height = originalInterior.height;
      const previewScale = Math.max(
        0.01,
        Math.abs(this.fabricCanvas.backgroundImage.scaleX || 1),
      );
      const cutLine = Math.max(
        0,
        Math.round((Number(this.form.cutLine) || 0) / previewScale),
      );
      // The component and the original contour meet at two small concave
      // corners. Use a slightly broader local radius than the line-width
      // inset so the joined contour eases into both shapes instead of
      // retaining a visible kink at either connection.
      const localJoinSmoothing = Math.max(
        12,
        cutLine * 2.5,
        Math.min(position.width, position.height) * 0.24,
      );
      const requestedSmoothing = Number(this.form.contourSmoothing);
      const smoothing = Math.round(
        requestedSmoothing > 0
          ? Math.max(requestedSmoothing, localJoinSmoothing)
          : localJoinSmoothing,
      );
      const unionCanvas = document.createElement("canvas");
      unionCanvas.width = width;
      unionCanvas.height = height;
      const unionContext = unionCanvas.getContext("2d");
      // Use the original die-line interior as the base shape. The white
      // backing is deliberately never touched by this operation.
      unionContext.drawImage(originalInterior, 0, 0);
      const primaryMask = this.createStickerPrimaryMask(
        position.width,
        position.height,
        { fillInterior: true },
      );
      if (!primaryMask) return pathBlob;
      const componentMask = document.createElement("canvas");
      componentMask.width = width;
      componentMask.height = height;
      const componentContext = componentMask.getContext("2d");
      const tracePrimaryMask = document.createElement("canvas");
      tracePrimaryMask.width = primaryMask.width;
      tracePrimaryMask.height = primaryMask.height;
      const tracePrimaryContext = tracePrimaryMask.getContext("2d");
      const primaryPixels = primaryMask
        .getContext("2d", { willReadFrequently: true })
        .getImageData(0, 0, primaryMask.width, primaryMask.height);
      primaryPixels.data.set(
        insetMaskPixels(
          primaryPixels.data,
          primaryMask.width,
          primaryMask.height,
          cutLine,
        ),
      );
      tracePrimaryContext.putImageData(primaryPixels, 0, 0);
      const traceComponentMask = document.createElement("canvas");
      traceComponentMask.width = width;
      traceComponentMask.height = height;
      const traceComponentContext = traceComponentMask.getContext("2d");
      componentContext.save();
      componentContext.translate(position.x, position.y);
      componentContext.rotate(fabric.util.degreesToRadians(position.angle));
      componentContext.drawImage(
        primaryMask,
        -position.width / 2,
        -position.height / 2,
        position.width,
        position.height,
      );
      componentContext.restore();
      traceComponentContext.save();
      traceComponentContext.translate(position.x, position.y);
      traceComponentContext.rotate(
        fabric.util.degreesToRadians(position.angle),
      );
      traceComponentContext.drawImage(
        tracePrimaryMask,
        -position.width / 2,
        -position.height / 2,
        position.width,
        position.height,
      );
      traceComponentContext.restore();
      // Keep the non-inset component where it overlaps the existing interior.
      // This preserves a solid union while only constraining its exposed edge.
      const overlapCanvas = document.createElement("canvas");
      overlapCanvas.width = width;
      overlapCanvas.height = height;
      const overlapContext = overlapCanvas.getContext("2d");
      overlapContext.drawImage(componentMask, 0, 0);
      overlapContext.globalCompositeOperation = "destination-in";
      overlapContext.drawImage(originalInterior, 0, 0);
      traceComponentContext.drawImage(overlapCanvas, 0, 0);

      // Join from the maximum-diameter endpoints of the component segment
      // outside the artwork. Two sides produce a stable silhouette and avoid
      // the narrow bump created by a single nearest-point bridge.
      const connections = await this.findStickerDiameterConnections(
        pathBlob,
        position,
        originalInterior,
      );
      if (connections) {
        const drawConnector = (context, insetEndpoints) => {
          const componentPoints = connections.map(({ componentPoint }) => {
            if (!insetEndpoints || cutLine <= 0) return componentPoint;
            const dx = position.x - componentPoint.x;
            const dy = position.y - componentPoint.y;
            const length = Math.hypot(dx, dy) || 1;
            return {
              x: componentPoint.x + (dx / length) * cutLine,
              y: componentPoint.y + (dy / length) * cutLine,
            };
          });
          const cutPoints = connections.map(({ cutPoint }) => cutPoint);
          const normalize = (x, y) => {
            const length = Math.hypot(x, y) || 1;
            return { x: x / length, y: y / length };
          };
          const diameterLength = Math.hypot(
            componentPoints[1].x - componentPoints[0].x,
            componentPoints[1].y - componentPoints[0].y,
          );
          const componentDiameter = normalize(
            componentPoints[1].x - componentPoints[0].x,
            componentPoints[1].y - componentPoints[0].y,
          );
          const componentTangent = {
            x: -componentDiameter.y,
            y: componentDiameter.x,
          };
          const arcHandles = componentPoints.map((componentPoint, index) => {
            const cutPoint = cutPoints[index];
            const chordX = componentPoint.x - cutPoint.x;
            const chordY = componentPoint.y - cutPoint.y;
            const chordLength = Math.hypot(chordX, chordY) || 1;
            const chord = normalize(chordX, chordY);
            const pointToward = (tangent, direction) => {
              const normalized = normalize(tangent.x, tangent.y);
              return normalized.x * direction.x + normalized.y * direction.y >=
                0
                ? normalized
                : { x: -normalized.x, y: -normalized.y };
            };
            // A bridge must leave and arrive exactly on the tangents of the
            // two existing contours. Mixing in the chord direction here makes
            // the join only position-continuous, which is the small notch at
            // the top of the heart-shaped cut line.
            const startDirection = pointToward(
              { x: cutPoint.tangentX, y: cutPoint.tangentY },
              chord,
            );
            const endDirection = pointToward(
              connections[index].componentTangent || componentTangent,
              chord,
            );
            const handleLength = Math.min(
              chordLength * 0.56,
              diameterLength * 0.3,
            );
            return {
              start: {
                x: cutPoint.x + startDirection.x * handleLength,
                y: cutPoint.y + startDirection.y * handleLength,
              },
              end: {
                x: componentPoint.x - endDirection.x * handleLength,
                y: componentPoint.y - endDirection.y * handleLength,
              },
            };
          });
          context.save();
          context.fillStyle = "#fff";
          context.beginPath();
          context.moveTo(cutPoints[0].x, cutPoints[0].y);
          context.bezierCurveTo(
            arcHandles[0].start.x,
            arcHandles[0].start.y,
            arcHandles[0].end.x,
            arcHandles[0].end.y,
            componentPoints[0].x,
            componentPoints[0].y,
          );
          context.lineTo(componentPoints[1].x, componentPoints[1].y);
          context.bezierCurveTo(
            arcHandles[1].end.x,
            arcHandles[1].end.y,
            arcHandles[1].start.x,
            arcHandles[1].start.y,
            cutPoints[1].x,
            cutPoints[1].y,
          );
          context.closePath();
          context.fill();
          context.restore();
        };
        drawConnector(componentContext, false);
        drawConnector(traceComponentContext, true);
      }

      unionContext.drawImage(traceComponentMask, 0, 0);
      // Confirmation is a local edit. Do not derive another large smoothing
      // radius or refit the stroke width from the full, already padded image.
      const workerOptions = { ...this.form, cutLine };
      const padding = Math.max(0, workerOptions.cutLine) + smoothing;
      const pixels = unionContext.getImageData(0, 0, width, height);
      const result = await buildPillowSheetContour(
        { data: pixels.data, width, height },
        {
          ...workerOptions,
          whiteBorder: 0,
          minObstacleArea: 16,
          alphaThreshold: 32,
          contourSmoothing: smoothing,
        },
      );
      const croppedPath = await this.cropPathLayer(
        result.pathBlob,
        padding,
        padding,
        width,
        height,
      );
      // The worker antialiases the local join. Keep all other source pixels
      // instead of simplifying and rounding the entire closed outline again.
      return this.preserveCutLineOutsideComponent(
        croppedPath,
        componentMask,
        smoothing * 2 + cutLine + 2,
        Math.max(2, cutLine * 2),
        pathBlob,
      );
    },

    async isStickerOuterLoopInsideCutLine(
      position,
      { pathBlob = this.pathBlob } = {},
    ) {
      const interiorMask = await this.getCutLineInteriorMask(pathBlob);
      const interiorContext = interiorMask.getContext("2d", {
        willReadFrequently: true,
      });
      const interiorPixels = interiorContext.getImageData(
        0,
        0,
        interiorMask.width,
        interiorMask.height,
      ).data;
      const primaryMask = this.createStickerPrimaryMask(
        position.width,
        position.height,
        // Check the complete area enclosed by the outer SVG loop. Testing only
        // painted pixels can classify an outer loop that crosses the die line
        // as "inside" when its visible stroke happens to miss the boundary.
        { fillInterior: true },
      );
      if (!primaryMask) return false;
      const primaryContext = primaryMask.getContext("2d", {
        willReadFrequently: true,
      });
      const primaryPixels = primaryContext.getImageData(
        0,
        0,
        primaryMask.width,
        primaryMask.height,
      ).data;
      const coverage = getTransformedMaskCoverage(
        primaryPixels,
        primaryMask.width,
        primaryMask.height,
        interiorPixels,
        interiorMask.width,
        interiorMask.height,
        position,
      );
      return coverage >= 0.92;
    },

    async addStickerOutline(
      blob,
      { x, y, width, height, angle = 0 },
      originalCutLineBlob,
    ) {
      const image = await this.loadFabricImage(blob);
      const source = image.getElement ? image.getElement() : image._element;
      const outputWidth = source.naturalWidth || source.width;
      const outputHeight = source.naturalHeight || source.height;

      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = outputWidth;
      outputCanvas.height = outputHeight;
      const outputContext = outputCanvas.getContext("2d");
      outputContext.drawImage(source, 0, 0, outputWidth, outputHeight);

      // Only the outer SVG loop participates in the silhouette union. Its
      // inner loops are added separately and must remain complete details.
      const outlineCanvas = document.createElement("canvas");
      outlineCanvas.width = Math.max(1, Math.ceil(width));
      outlineCanvas.height = Math.max(1, Math.ceil(height));
      const outlineContext = outlineCanvas.getContext("2d");
      const primaryMask = this.createStickerPrimaryMask(width, height);
      if (!primaryMask) return blob;
      outlineContext.drawImage(primaryMask, 0, 0);
      outlineContext.globalCompositeOperation = "source-in";
      outlineContext.fillStyle = "#e34c57";
      outlineContext.fillRect(0, 0, outlineCanvas.width, outlineCanvas.height);

      const outerLayer = document.createElement("canvas");
      outerLayer.width = outputWidth;
      outerLayer.height = outputHeight;
      const outerContext = outerLayer.getContext("2d");
      outerContext.save();
      outerContext.translate(x, y);
      outerContext.rotate(fabric.util.degreesToRadians(angle));
      outerContext.drawImage(
        outlineCanvas,
        -width / 2,
        -height / 2,
        width,
        height,
      );
      outerContext.restore();
      // The component outer loop is visible only outside the original die
      // line. Do not clip its edge lying exactly on that line: preserving one
      // raster edge prevents a visibly broken SVG contour at the join.
      if (originalCutLineBlob) {
        const interiorMask = await this.getCutLineInteriorMask(
          originalCutLineBlob,
        );
        outerContext.globalCompositeOperation = "destination-out";
        outerContext.drawImage(interiorMask, 0, 0, outputWidth, outputHeight);
      }
      outputContext.drawImage(outerLayer, 0, 0);

      return this.canvasToPngBlob(outputCanvas);
    },

    async mergeStickerOutlineIntoCutLine({
      pathBlob = this.pathBlob,
      offsetX = 0,
      offsetY = 0,
    } = {}) {
      const background = this.fabricCanvas.backgroundImage;
      if (!background || !this.edgeSticker || !pathBlob) {
        throw new Error("组件刀线尚未准备好");
      }
      if (
        !this.cutLineBoundaryMask ||
        this.cutLineBoundaryMask.sourceBlob !== this.pathBlob
      ) {
        await this.refreshCutLineBoundaryMask();
      }
      // Reapply the attachment constraint immediately before export in case a
      // drag or rotation completed while the die-line mask was refreshing.
      this.snapObjectToContour(this.edgeSticker);
      if (
        !this.isStickerIntersectingCutLine(
          this.edgeSticker,
          this.edgeSticker.getCenterPoint(),
        )
      ) {
        throw new Error("组件必须与刀线保留重合或相交区域");
      }

      const position = this.getStickerSourcePosition(offsetX, offsetY);
      if (!position) throw new Error("组件位置尚未准备好");

      if (
        await this.isStickerOuterLoopInsideCutLine(position, { pathBlob })
      ) {
        // An almost entirely embedded component must not alter the product
        // outline. Keep the existing image die line and output only the
        // authored, disconnected inner SVG details.
        return this.addStickerInnerDetails(pathBlob, position);
      }

      // Trace the union of the original interior and the attached outer SVG
      // loop. This replaces both overlapping segments with one continuous
      // cut contour, so there is neither a doubled red line nor a detached
      // component. Independent inner SVG loops remain detail cut lines.
      const outerUnionPath = await this.rebuildStickerCutLine(position, {
        pathBlob,
      });
      return this.addStickerInnerDetails(outerUnionPath, position);
    },

    async buildResultForFile(file) {
      const requestedOptions = {
        ...this.form,
        dpi:
          this.form.dpi === "" || this.form.dpi == null
            ? null
            : Number(this.form.dpi),
      };
      const sourceImage = await this.loadFabricImage(file);
      const options = this.getPreviewWorkerOptions(
        sourceImage.width,
        sourceImage.height,
        requestedOptions,
        this.whiteBorder,
        this.form.cutLine,
      );
      return buildPillowSheetContour(file, options, {
        onProgress: ({ progress, stage }) => {
          this.progress = progress;
          this.stage = stage;
        },
      });
    },

    async generate() {
      if (!this.file || this.processing) return;

      this.processing = true;
      this.error = "";
      this.progress = 0;
      this.stage = "准备";
      this.resultBlob = null;
      this.artworkBlob = null;
      this.designHole = null;
      this.artworkMaskBlob = null;
      this.contentBlob = null;
      this.pathBlob = null;
      this.outerPathBlob = null;
      this.replacementFrame = null;
      this.preMergeState = null;
      this.finish = false;

      try {
        const result = await this.buildResultForFile(this.file);

        this.contentBlob = result.backingBlob || result.contentBlob;
        this.artworkMaskBlob = result.artworkMaskBlob;
        this.pathBlob = result.pathBlob;
        this.outerPathBlob = result.pathBlob;
        this.replacementFrame = await this.createReplacementFrame();
        this.artworkBlob = await this.createArtworkLayerInFrame(
          this.file,
          this.replacementFrame,
          result.width,
          result.height,
        );
        this.resultBlob = await this.composeLayeredResult();
        await this.insertImage(this.resultBlob);
        this.storeFaceAsset();
      } catch (err) {
        console.error(err);
        this.error = err.message || "处理失败";
      } finally {
        this.processing = false;
      }
    },

    async createStickerComposite() {
      if (!this.contentBlob || (!this.edgeSticker && !this.interfaceTab)) {
        throw new Error("No contour adjustment is available to merge");
      }

      const background = this.fabricCanvas.backgroundImage;
      if (!background) throw new Error("The pattern background is not ready");

      // Start with the clean content PNG instead of the visible Fabric canvas.
      // The visible canvas already includes the old anti-aliased red contour.
      const contentImage = await this.loadFabricImage(this.contentBlob);
      const content = contentImage.getElement
        ? contentImage.getElement()
        : contentImage._element;
      const sourceWidth = content.naturalWidth || content.width;
      const sourceHeight = content.naturalHeight || content.height;
      // contentBlob is the white backing layer. Components must be traced
      // with the independent artwork layer instead; using the backing here
      // loses the picture completely after confirming a component.
      const artworkImage = this.artworkBlob
        ? await this.loadFabricImage(this.artworkBlob)
        : contentImage;
      const artwork = artworkImage.getElement
        ? artworkImage.getElement()
        : artworkImage._element;
      const artworkWidth = artwork.naturalWidth || artwork.width;
      const artworkHeight = artwork.naturalHeight || artwork.height;
      let artworkLeft = 0;
      let artworkTop = 0;
      const artworkFile = this.artworkBlob || this.contentBlob;
      const stickerX = this.edgeSticker
        ? (this.edgeSticker.left - background.left) / (background.scaleX || 1)
        : null;
      const stickerY = this.edgeSticker
        ? (this.edgeSticker.top - background.top) / (background.scaleY || 1)
        : null;
      const stickerWidth = this.edgeSticker
        ? this.edgeSticker.getScaledWidth() / (background.scaleX || 1)
        : 0;
      const stickerHeight = this.edgeSticker
        ? this.edgeSticker.getScaledHeight() / (background.scaleY || 1)
        : 0;
      const stickerAngle = this.edgeSticker ? this.edgeSticker.angle || 0 : 0;
      const stickerRadians = fabric.util.degreesToRadians(stickerAngle);
      const stickerHalfWidth =
        (Math.abs(Math.cos(stickerRadians)) * stickerWidth +
          Math.abs(Math.sin(stickerRadians)) * stickerHeight) /
        2;
      const stickerHalfHeight =
        (Math.abs(Math.sin(stickerRadians)) * stickerWidth +
          Math.abs(Math.cos(stickerRadians)) * stickerHeight) /
        2;
      const tabX = this.interfaceTab
        ? (this.interfaceTab.left - background.left) / (background.scaleX || 1)
        : null;
      const tabY = this.interfaceTab
        ? (this.interfaceTab.top - background.top) / (background.scaleY || 1)
        : null;
      const tabWidth = this.interfaceTab
        ? this.interfaceTab.getScaledWidth() / (background.scaleX || 1)
        : 0;
      const tabHeight = this.interfaceTab
        ? this.interfaceTab.getScaledHeight() / (background.scaleY || 1)
        : 0;
      // The editor keeps the tab's top on the outer red cut line. Move the
      // actual white tab inward by the cut-line thickness before tracing so
      // it overlaps the backing and becomes one continuous shape.
      const attachedTabY = this.interfaceTab
        ? tabY -
          ((Number(this.form.cutLine) || 0) + 3) / (background.scaleY || 1)
        : null;

      // Expand the working image just enough for the draggable component
      // to protrude beyond its original bounds; otherwise Canvas would clip
      // the new contour before the worker can trace it.
      const minX = Math.floor(
        Math.min(
          0,
          ...(this.edgeSticker ? [stickerX - stickerHalfWidth] : []),
          ...(this.interfaceTab ? [tabX - tabWidth / 2] : []),
        ),
      );
      const minY = Math.floor(
        Math.min(
          0,
          ...(this.edgeSticker ? [stickerY - stickerHalfHeight] : []),
          ...(this.interfaceTab ? [attachedTabY - tabHeight / 2] : []),
        ),
      );
      const maxX = Math.ceil(
        Math.max(
          sourceWidth,
          ...(this.edgeSticker ? [stickerX + stickerHalfWidth] : []),
          ...(this.interfaceTab ? [tabX + tabWidth / 2] : []),
        ),
      );
      const maxY = Math.ceil(
        Math.max(
          sourceHeight,
          ...(this.edgeSticker ? [stickerY + stickerHalfHeight] : []),
          ...(this.interfaceTab ? [attachedTabY + tabHeight / 2] : []),
        ),
      );
      const offsetX = -minX;
      const offsetY = -minY;
      const renderedCanvas = document.createElement("canvas");
      renderedCanvas.width = maxX - minX;
      renderedCanvas.height = maxY - minY;
      const context = renderedCanvas.getContext("2d");
      context.imageSmoothingEnabled = true;
      context.drawImage(
        artwork,
        offsetX + artworkLeft,
        offsetY + artworkTop,
        artworkWidth,
        artworkHeight,
      );
      const artworkPixels = context.getImageData(
        0,
        0,
        renderedCanvas.width,
        renderedCanvas.height,
      );

      const compositeStickerX = this.edgeSticker ? stickerX + offsetX : null;
      const compositeStickerY = this.edgeSticker ? stickerY + offsetY : null;

      if (this.edgeSticker) {
        this.drawStickerMask(context, {
          x: compositeStickerX,
          y: compositeStickerY,
          width: stickerWidth,
          height: stickerHeight,
          angle: stickerAngle,
        });
      }

      if (this.interfaceTab) {
        context.save();
        // On the reverse side, the tab is only allowed to extend the outer
        // silhouette. Any area shared with the artwork stays transparent here
        // so the reverse image is never covered by the component.
        if (this.isBackFace()) {
          context.globalCompositeOperation = "destination-over";
        }
        context.fillStyle = "#fff";
        context.fillRect(
          tabX - tabWidth / 2 + offsetX,
          attachedTabY - tabHeight / 2 + offsetY,
          tabWidth,
          tabHeight,
        );
        context.restore();
      }

      // The sticker is used only to extend the contour. Do not bake its red
      // center marker into the separated content PNG.

      const pixels = context.getImageData(
        0,
        0,
        renderedCanvas.width,
        renderedCanvas.height,
      );

      return {
        data: pixels.data,
        artworkData: artworkPixels.data,
        width: renderedCanvas.width,
        height: renderedCanvas.height,
        offsetX,
        offsetY,
        stickerX: compositeStickerX,
        stickerY: compositeStickerY,
        stickerWidth,
        stickerHeight,
        stickerAngle,
        stickerPattern: this.edgeSticker
          ? this.edgeSticker.stickerPattern || this.stickerPattern
          : null,
        artworkLeft,
        artworkTop,
        artworkFile,
      };
    },

    async mergeStickerIntoContour({
      mergeBothFaces = true,
      keepComponents = false,
    } = {}) {
      if (
        (!this.edgeSticker && !this.interfaceTab) ||
        !this.contentBlob ||
        this.processing
      ) {
        return;
      }

      // The reverse-side pass is invoked only from the front-side merge. The
      // reverse-side UI itself never exposes editable component controls.
      if (this.isBackFace() && mergeBothFaces) return;
      if (mergeBothFaces) this.isFinalizingComponent = true;
      const originalFace = this.activeFace;
      const otherFace = originalFace === "front" ? "back" : "front";
      const shouldMergeOtherFace =
        mergeBothFaces &&
        originalFace === "front" &&
        Boolean(this.faceAssets.front && this.faceAssets.back);
      let mergedSuccessfully = false;
      const previousState = {
        previewLayout: this.getCanvasPreviewLayout(),
        resultBlob: this.resultBlob,
        artworkBlob: this.artworkBlob,
        artworkMaskBlob: this.artworkMaskBlob,
        contentBlob: this.contentBlob,
        pathBlob: this.pathBlob,
        outerPathBlob: this.outerPathBlob,
        replacementFrame: this.replacementFrame,
        designHole: this.designHole,
        sticker: this.edgeSticker
          ? {
              x:
                (this.edgeSticker.left -
                  this.fabricCanvas.backgroundImage.left) /
                (this.fabricCanvas.backgroundImage.scaleX || 1),
              y:
                (this.edgeSticker.top - this.fabricCanvas.backgroundImage.top) /
                (this.fabricCanvas.backgroundImage.scaleY || 1),
              size: this.edgeSticker.getScaledWidth(),
              angle: this.edgeSticker.angle || 0,
            }
          : null,
        interfaceTab: this.interfaceTab
          ? {
              x:
                (this.interfaceTab.left -
                  this.fabricCanvas.backgroundImage.left) /
                (this.fabricCanvas.backgroundImage.scaleX || 1),
              width: this.interfaceTab.getScaledWidth(),
            }
          : null,
      };
      this.processing = true;
      this.error = "";
      this.progress = 0;
      this.stage = "编辑组件";
      try {
        if (this.edgeSticker) {
          // Confirming an SVG component must not regenerate its white backing.
          // It only replaces the covered die-line segment and appends the SVG
          // outline to the existing cut-line layer.
          this.snapObjectToContour(this.edgeSticker);
          const stickerPosition = this.getStickerSourcePosition();
          const { width: pathWidth, height: pathHeight } =
            await this.getBlobDimensions(this.pathBlob);
          const componentPadding = this.getStickerFramePadding(
            stickerPosition,
            pathWidth,
            pathHeight,
          );
          const [paddedContentBlob, paddedPathBlob, paddedArtworkBlob] =
            await Promise.all([
              this.padLayerBlob(this.contentBlob, componentPadding),
              this.padLayerBlob(this.pathBlob, componentPadding),
              this.artworkBlob
                ? this.padLayerBlob(this.artworkBlob, componentPadding)
                : Promise.resolve(null),
            ]);
          this.pathBlob = await this.mergeStickerOutlineIntoCutLine({
            pathBlob: paddedPathBlob,
            offsetX: componentPadding.left,
            offsetY: componentPadding.top,
          });
          this.contentBlob = paddedContentBlob;
          this.artworkBlob = paddedArtworkBlob;
          // The sticker is removed after the merge; remember where the hole
          // belongs in the padded layer so the effect editor can place it.
          this.designHole = {
            x: stickerPosition.x + componentPadding.left,
            y: stickerPosition.y + componentPadding.top,
            shape: this.edgeSticker.stickerPattern || this.stickerPattern,
          };
          if (this.replacementFrame) {
            this.replacementFrame = {
              ...this.replacementFrame,
              offsetX: this.replacementFrame.offsetX + componentPadding.left,
              offsetY: this.replacementFrame.offsetY + componentPadding.top,
            };
          }
          this.outerPathBlob = this.pathBlob;
          this.resultBlob = await this.composeLayeredResult();
          await this.insertImage(this.resultBlob, {
            addSticker: false,
            preserveAccessories: keepComponents || shouldMergeOtherFace,
            // Padding moves the original pixels within the source image.
            // Compensate its Fabric origin so the design stays visually fixed
            // while the newly exposed component contour remains in frame.
            previewLayout: previousState.previewLayout
              ? {
                  ...previousState.previewLayout,
                  left:
                    previousState.previewLayout.left -
                    componentPadding.left * previousState.previewLayout.scaleX,
                  top:
                    previousState.previewLayout.top -
                    componentPadding.top * previousState.previewLayout.scaleY,
                }
              : null,
          });
        } else {
          const composite = await this.createStickerComposite();
          // The component silhouette and the original image need to be treated
          // as a single rounded outline. A one-pixel radius leaves a concave
          // seam at the tag's lower corners, so use the same joining radius as
          // the standard component contour.
          const smoothing =
            Number(this.form.contourSmoothing) > 0
              ? Number(this.form.contourSmoothing) * 2
              : 48;
          const workerOptions = this.getPreviewWorkerOptions(
            composite.width,
            composite.height,
            { ...this.form, contourSmoothing: smoothing },
            this.whiteBorder,
            this.form.cutLine,
          );
          const componentPadding =
            Math.max(0, workerOptions.whiteBorder) +
            Math.max(0, workerOptions.cutLine) +
            smoothing;
          const result = await buildPillowSheetContour(
            composite,
            {
              ...workerOptions,
              whiteBorder: workerOptions.whiteBorder,
              minObstacleArea: 1,
              alphaThreshold: 64,
              contourSmoothing: smoothing,
              dpi:
                this.form.dpi === "" || this.form.dpi == null
                  ? null
                  : Number(this.form.dpi),
            },
            {
              onProgress: ({ progress, stage }) => {
                this.progress = progress;
                this.stage = stage;
              },
            },
          );

          const outerPathBlob = result.pathBlob;
          const nextReplacementFrame = previousState.replacementFrame
            ? {
                ...previousState.replacementFrame,
                offsetX:
                  componentPadding +
                  composite.offsetX +
                  previousState.replacementFrame.offsetX,
                offsetY:
                  componentPadding +
                  composite.offsetY +
                  previousState.replacementFrame.offsetY,
              }
            : null;
          const nextArtworkBlob = nextReplacementFrame
            ? await this.createArtworkLayerInFrame(
                this.file,
                nextReplacementFrame,
                result.width,
                result.height,
              )
            : null;
          this.contentBlob = result.backingBlob || result.contentBlob;
          this.artworkBlob = nextArtworkBlob;
          this.artworkMaskBlob = result.artworkMaskBlob;
          this.pathBlob = result.pathBlob;
          this.outerPathBlob = outerPathBlob;
          this.replacementFrame = nextReplacementFrame;
          this.resultBlob = await this.composeLayeredResult();
          await this.insertImage(this.resultBlob, {
            addSticker: false,
            preserveAccessories: keepComponents || shouldMergeOtherFace,
            // The original pixels moved within the padded output; compensate
            // the background origin so they stay at the same canvas position.
            previewLayout: previousState.previewLayout
              ? {
                  ...previousState.previewLayout,
                  left:
                    previousState.previewLayout.left -
                    (componentPadding + composite.offsetX) *
                      previousState.previewLayout.scaleX,
                  top:
                    previousState.previewLayout.top -
                    (componentPadding + composite.offsetY) *
                      previousState.previewLayout.scaleY,
                }
              : null,
          });
        }
        this.preMergeState = previousState;
        this.finish = true;
        this.frontEditorSnapshot = null;
        this.storeFaceAsset();
        mergedSuccessfully = true;
      } catch (err) {
        console.error(err);
        this.error = err.message || "合并轮廓失败";
      } finally {
        this.processing = false;
      }

      if (mergedSuccessfully && shouldMergeOtherFace) {
        try {
          this.stage = "同步反面组件效果";
          const syncedBackAsset = await this.createBackAssetFromFrontFrame(
            this.faceAssets.front,
            this.faceAssets.back,
          );
          if (syncedBackAsset) {
            this.$set(this.faceAssets, otherFace, syncedBackAsset);
          }
        } catch (err) {
          console.error(err);
          this.error = err.message || "反面轮廓同步失败";
        }
      }

      // The first pass may briefly render before the reverse-side pass is
      // complete. Reveal the editor only after all requested faces are ready.
      if (mergeBothFaces) {
        this.isFinalizingComponent = false;
        this.fabricCanvas.requestRenderAll();
      }
    },

    async resetEdgeSticker() {
      if (!this.preMergeState || this.processing) return;
      this.finish = false;
      const previous = this.preMergeState;
      this.processing = true;
      this.error = "";
      this.progress = 0;
      this.stage = "恢复孔";
      try {
        this.resultBlob = previous.resultBlob;
        this.artworkBlob = previous.artworkBlob || null;
        this.artworkMaskBlob = previous.artworkMaskBlob || null;
        this.contentBlob = previous.contentBlob;
        this.pathBlob = previous.pathBlob;
        this.outerPathBlob = previous.outerPathBlob || previous.pathBlob;
        this.replacementFrame = previous.replacementFrame || null;
        this.designHole = previous.designHole || null;
        await this.insertImage(previous.resultBlob);
        if (this.edgeSticker) {
          const background = this.fabricCanvas.backgroundImage;
          this.stickerSize = Math.max(1, Math.round(previous.sticker.size));
          await this.applyStickerSize();
          this.edgeSticker.set({
            left:
              background.left + previous.sticker.x * (background.scaleX || 1),
            top: background.top + previous.sticker.y * (background.scaleY || 1),
            angle: previous.sticker.angle || 0,
          });
          this.snapObjectToContour(this.edgeSticker);
          this.edgeSticker.setCoords();
          this.fabricCanvas.setActiveObject(this.edgeSticker);
          this.fabricCanvas.requestRenderAll();
        }
        if (this.interfaceTab && previous.interfaceTab) {
          const background = this.fabricCanvas.backgroundImage;
          this.interfaceTab.set({
            left:
              background.left +
              previous.interfaceTab.x * (background.scaleX || 1),
          });
          this.keepInterfaceTabAttached(this.interfaceTab);
          this.interfaceTab.setCoords();
          this.fabricCanvas.requestRenderAll();
        }
        this.fitArtworkToDimensionLimit();
        this.preMergeState = null;
        this.storeFaceAsset();
        this.stage = "";
      } catch (err) {
        console.error(err);
        this.error = err.message || "重置孔失败";
      } finally {
        this.processing = false;
      }
    },

    loadFabricImage(value) {
      return new Promise((resolve, reject) => {
        const shouldRevokeUrl = typeof value !== "string";
        let url =
          typeof value === "string" ? value : URL.createObjectURL(value);
        try {
          fabric.Image.fromURL(
            url,
            (imgObj) => {
              if (shouldRevokeUrl) {
                this.revokeObjectURL(url);
              }
              resolve(imgObj);
            },
            {
              crossOrigin: "anonymous",
            },
          );
        } catch (error) {
          if (shouldRevokeUrl) {
            this.revokeObjectURL(url);
          }
          reject(error);
        }
      });
    },
    revokeObjectURL(url) {
      if (typeof url === "string" && url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
      }
    },
    async insertImage(
      blob,
      {
        addSticker = true,
        preserveAccessories = false,
        previewLayout = null,
      } = {},
    ) {
      if (!blob) return;
      const [image, contourImage] = await Promise.all([
        this.loadFabricImage(blob),
        this.pathBlob ? this.loadFabricImage(this.pathBlob) : null,
      ]);
      const metrics = this.getFabricPreviewMetrics(
        image,
        contourImage || image,
        null,
        previewLayout,
      );
      const scaleX = metrics.scaleX == null ? metrics.scale : metrics.scaleX;
      const scaleY = metrics.scaleY == null ? metrics.scale : metrics.scaleY;
      if (previewLayout) {
        this.actualImageWidthCm = previewLayout.actualImageWidthCm;
        this.actualImageHeightCm = previewLayout.actualImageHeightCm;
      }
      this.previewSourceContour = metrics.unmirroredContour.map((point) => ({
        ...point,
      }));
      this.snapContour = this.scaleContour(
        metrics.sourceContour,
        metrics.left,
        metrics.top,
        scaleX,
        scaleY,
      );
      await this.refreshCutLineBoundaryMask();
      this.fabricCanvas.setBackgroundImage(
        image,
        () => {
          this.updateDimensionAnnotation();
          this.fabricCanvas.renderAll();
        },
        {
          scaleX,
          scaleY,
          left: metrics.left,
          top: metrics.top,
          flipX: this.shouldMirrorActiveFace(),
          originX: "left",
          originY: "top",
        },
      );
      if (addSticker) {
        if (this.enableEdgeSticker) {
          await this.addDefaultSticker();
        } else if (this.enableInterfaceTab) {
          this.addDefaultInterfaceTab();
        }
      } else if (!preserveAccessories) {
        if (this.edgeSticker) {
          this.fabricCanvas.remove(this.edgeSticker);
          this.edgeSticker = null;
        }
        if (this.interfaceTab) {
          this.fabricCanvas.remove(this.interfaceTab);
          this.interfaceTab = null;
        }
        if (this.interfaceGuide) {
          this.fabricCanvas.remove(this.interfaceGuide);
          this.interfaceGuide = null;
        }
      }
      this.fabricCanvas.renderAll();
    },
  },

  async mounted() {
    // 按实例引用初始化：绝不能用全局 id，多板块多实例时 fabric 会把所有
    // 实例都绑到文档中第一个同名 id 的画布上（板 2 画进板 1 的 bug 根因）。
    this.fabricCanvas = new fabric.Canvas(this.$refs.canvasEditor, {
      fireRightClick: true,
      stopContextMenu: true,
      controlsAboveOverlay: true,
      imageSmoothingEnabled: true,
      centeredRotation: true,
      preserveObjectStacking: true,
      selection: false,
      backgroundColor: "",
      width: 600,
      height: 600,
    });
    this.fabricCanvas.on("object:moving", this.onObjectMoving);
    this.fabricCanvas.on("object:rotating", this.onObjectRotating);
    this.fabricCanvas.on("object:modified", this.onObjectModified);
  },
};
</script>
<style scoped>
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
}

.pillow-demo h2 {
  margin: 0;
  color: #172033;
  font-size: 22px;
  line-height: 1.35;
}

.row,
.actions,
.progress-wrap {
  margin: 20px 0;
}

.file-upload {
  display: flex;
  align-items: center;
  width: min(100%, 560px);
  min-height: 44px;
  overflow: hidden;
  border: 1px dashed #b7c5db;
  border-radius: 10px;
  color: #68758a;
  background: #f8faff;
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease,
    box-shadow 0.2s ease;
}

.file-upload:hover,
.file-upload:focus-within {
  border-color: #285348;
  background: #f3f7ff;
  box-shadow: 0 0 0 3px rgba(50, 121, 255, 0.12);
}

.file-upload-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.file-upload-button {
  display: inline-flex;
  align-items: center;
  align-self: stretch;
  padding: 0 16px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  background: #285348;
}

.file-upload-name {
  min-width: 0;
  padding: 0 14px;
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.interface-hint {
  margin-top: -8px;
  color: #5d6b82;
  font-size: 13px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 16px;
}

.form-grid label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #40506a;
  font-size: 13px;
  font-weight: 600;
}

.form-grid .toggle-label {
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}

.form-grid .sticker-pattern-field {
  gap: 8px;
}

.sticker-pattern-buttons {
  display: flex;
  gap: 8px;
}

.sticker-pattern-buttons button {
  display: inline-flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  border: 1px solid #cbd5e3;
  border-radius: 8px;
  color: #40506a;
  font: inherit;
  font-weight: 600;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease,
    background-color 0.2s ease, box-shadow 0.2s ease;
}

.sticker-pattern-buttons button:hover:not(:disabled) {
  border-color: #8db1ff;
  color: #1d5fd0;
  background: #f5f8ff;
}

.sticker-pattern-buttons button.active {
  border-color: #285348;
  color: #1d5fd0;
  background: #edf4ff;
  box-shadow: 0 0 0 3px rgba(50, 121, 255, 0.13);
}

.sticker-pattern-buttons button:disabled {
  border-color: #e2e8f0;
  color: #9aa7b8;
  background: #f3f5f8;
  cursor: not-allowed;
}

.sticker-pattern-buttons svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.form-grid input,
.form-grid select {
  box-sizing: border-box;
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 1px solid #cbd5e3;
  border-radius: 8px;
  outline: none;
  color: #172033;
  font-size: 14px;
  background: #fff;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.form-grid input:hover,
.form-grid select:hover {
  border-color: #9db1cc;
}

.form-grid input:focus,
.form-grid select:focus {
  border-color: #285348;
  box-shadow: 0 0 0 3px rgba(50, 121, 255, 0.13);
}

.form-grid input:disabled,
.form-grid select:disabled {
  border-color: #e2e8f0;
  color: #9aa7b8;
  background: #f3f5f8;
  cursor: not-allowed;
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

.actions .primary-action {
  color: #fff;
  background: #285348;
  box-shadow: 0 4px 10px rgba(50, 121, 255, 0.22);
}

.actions .primary-action:hover:not(:disabled) {
  background: #2469e8;
}

.actions .secondary-action {
  border-color: #cbd5e3;
  background: #fff;
}

.face-switch {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid #cbd5e3;
  border-radius: 8px;
  background: #fff;
}

.face-switch button {
  min-width: 72px;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
}

.face-switch button + button {
  border-left: 1px solid #cbd5e3;
}

.face-switch button.active {
  color: #fff;
  background: #285348;
}

.toggle-label {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  margin-right: 20px;
  color: #40506a;
  font-size: 14px;
  cursor: pointer;
}

.toggle-label input {
  width: 16px;
  height: 16px;
  margin: 0 8px 0 0;
  accent-color: #285348;
  cursor: pointer;
}

.toggle-label input:disabled {
  cursor: not-allowed;
}

.canvas-panel {
  width: 100%;
  margin: 20px 0 28px;
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

.canvas-panel-hint {
  display: flex;
  gap: 8px;
  align-items: center;
  color: #7a879a;
  font-size: 13px;
  font-weight: 400;
}
.canvas-panel-hint button {
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
.canvas-panel-hint .primary-action {
  color: #fff;
  background: #285348;
  box-shadow: 0 4px 10px rgba(50, 121, 255, 0.22);
  cursor: pointer;
}
.canvas-panel-hint .apply-design-action{min-height:40px;padding:0 16px;border:0;border-radius:8px;color:#fff;font-size:14px;font-weight:600;background:#285348;box-shadow:0 4px 10px rgba(40,83,72,.2);cursor:pointer}.canvas-panel-hint .apply-design-action:disabled{opacity:.48;cursor:not-allowed}

.canvas-stage {
  position: relative;
  display: flex;
  justify-content: center;
  padding: 30px;
  overflow: auto;
  background-color: #f4f7fb;
  background-image: linear-gradient(45deg, #e9eef6 25%, transparent 25%),
    linear-gradient(-45deg, #e9eef6 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e9eef6 75%),
    linear-gradient(-45deg, transparent 75%, #e9eef6 75%);
  background-position: 0 0, 0 12px, 12px -12px, -12px 0;
  background-size: 24px 24px;
}

.canvas-editor {
  display: block;
  border: 0;
  border-radius: 10px;
  background: transparent;
}

.canvas-stage.is-finalizing-component ::v-deep .canvas-container {
  visibility: hidden;
}

.canvas-processing-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #40506a;
  font-size: 14px;
  font-weight: 600;
  background: rgba(244, 247, 251, 0.88);
}

.canvas-stage ::v-deep .canvas-container {
  overflow: hidden;
  border: 1px solid #d4deed;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 12px 26px rgba(28, 50, 80, 0.16);
}

.canvas-stage ::v-deep .lower-canvas,
.canvas-stage ::v-deep .upper-canvas {
  border-radius: 9px;
}

progress {
  width: 100%;
  height: 18px;
}

.progress-text {
  margin-bottom: 6px;
}

.error {
  margin-top: 14px;
  padding: 11px 14px;
  border: 1px solid #ffc7c7;
  border-radius: 8px;
  color: #b42318;
  font-size: 14px;
  line-height: 1.5;
  background: #fff2f1;
  white-space: pre-wrap;
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 20px;
}

.preview-bg {
  min-height: 300px;
  padding: 12px;
  overflow: auto;
  background-color: #ddd;
  background-image: linear-gradient(45deg, #bbb 25%, transparent 25%),
    linear-gradient(-45deg, #bbb 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #bbb 75%),
    linear-gradient(-45deg, transparent 75%, #bbb 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0;
}

.preview-bg img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}

.meta {
  margin-top: 8px;
  font-size: 13px;
}
.flex {
  display: flex;
}
.embedded{display:grid!important;grid-template-columns:minmax(250px,310px) minmax(0,1fr)!important;gap:16px;padding:0!important}.embedded>div:first-child{width:auto!important;margin-right:0!important}.embedded .pillow-demo{padding:20px}.embedded .canvas-panel{width:auto;margin:0}.embedded .canvas-stage{min-height:650px;padding:24px}.embedded .canvas-panel-title{padding:0 16px}@media(max-width:900px){.embedded{grid-template-columns:1fr!important}.embedded .canvas-stage{min-height:500px}}
</style>
