<template>
  <div class="preview-page">
    <AppHeader>
      <template #actions>
        <div class="header-actions">
          <button class="header-action" @click="$refs.planInput.click()">
            导入方案
          </button>
          <button
            v-if="plans.length"
            class="header-action header-action--ghost"
            @click="clearPlan"
          >
            清除方案
          </button>
        </div>
      </template>
    </AppHeader>
    <input
      ref="planInput"
      type="file"
      accept="application/json,.json"
      multiple
      style="display: none"
      @change="
        importPlans($event.target.files);
        $event.target.value = '';
      "
    />
    <!-- 首页不再展示 mockup 预览块：无论有无方案，右列固定为 效果图 + 组件设置 -->
    <AcrylicEditor
      ref="editor"
      :src="artwork"
      :initial-options="options"
      mode="preview"
      :preview-replace="true"
      defer-artwork-upload
      @ready="onReady"
      @change="onChange"
      @error="onError"
      @upload="applyPatternFile"
      ><DesignWorkspace
        ref="designWorkspace"
        slot="design-canvas"
        embedded
        :plan-boards="unionBoards.length ? unionBoards : null"
        :white-border="patternWhiteBorder"
        :cut-line="patternCutLine"
        :dpi="patternDpi"
        :component-size="patternComponentSize"
        :sticker-pattern-assets="stickerPatternAssets"
        :sticker-enabled="stickerEnabledSetting"
        :spec-size="patternSpecSize"
        :interface-tab-enabled="patternInterfaceTabEnabled"
        :interface-guide-width="patternInterfaceGuideWidth"
        :interface-guide-height="patternInterfaceGuideHeight"
        :interface-tab-width="patternInterfaceTabWidth"
        :interface-tab-height="patternInterfaceTabHeight"
        @apply-design="applyDesign"
      >
        <!-- 效果图走马灯：经 slot 进入 PatternDesigner 的 pd-side-stack，
             与组件设置面板（pillow-demo）同处一个父容器，宽度一致、文档流内 -->
        <div class="plan-carousel">
          <div class="plan-carousel-title">效果图（{{ plans.length }}）</div>
          <el-carousel
            v-if="plans.length"
            class="plan-carousel-el"
            :autoplay="false"
            arrow="always"
            indicator-position="outside"
            :loop="false"
          >
            <el-carousel-item v-for="plan in plans" :key="plan.id">
              <div
                :class="[
                  'plan-card',
                  { active: activePlan && plan.id === activePlan.id },
                ]"
                @click="activatePlan(plan)"
              >
                <div class="plan-thumb">
                  <img v-if="plan.imageUrl" :src="plan.imageUrl" alt="效果图" />
                  <span v-else class="plan-thumb-empty">未生成</span>
                </div>
              </div>
            </el-carousel-item>
          </el-carousel>
          <div v-else class="plan-carousel-empty">
            暂无效果图，完成设计后点击「生成效果图」
          </div>
        </div>
      </DesignWorkspace>
    </AcrylicEditor>
  </div>
</template>
<script>
import AcrylicEditor from "../home/AcrylicEditor";
import AppHeader from "../home/AppHeader.vue";
import DesignWorkspace from "../home/DesignWorkspace.vue";
import { specRatio, SPEC_DEFAULT_SIZE } from "../utils/home/render";
import { sharedState } from "../sharedState.js";

// ---- 板块工具（纯函数，随首页域就近维护）----
// 板块跨方案匹配标识：优先显式 tag，兜底板块名（兼容旧 JSON）。
function boardTag(board) {
  return (board && (board.tag || board.name)) || "";
}
// 效果图板块变换：板顶不动点 + 规格比例缩放。缩放以「板顶」为不动点
// （板顶恒对齐锚点 by）：挂扣贴板顶孔位、任何规格下都完整可见。
function boardTransform(board, editorOptions) {
  const sceneX = Number(editorOptions && editorOptions.productX) || 0;
  const sceneY = Number(editorOptions && editorOptions.productY) || 0;
  const sceneScale =
    (Number(editorOptions && editorOptions.productScale) || 100) / 100;
  const boardScale = Number(board.scale) || 1;
  const s = sceneScale * boardScale;
  const rawSpec = Number.isFinite(
    Number(editorOptions && editorOptions.specSize),
  )
    ? Number(editorOptions.specSize)
    : Number(board.specSize);
  const k = specRatio(rawSpec);
  const S = s * k;
  // 注意不能用 `|| 默认值`：0 是合法坐标（画布左/上边缘）。
  const bx = Number.isFinite(Number(board.x)) ? Number(board.x) : 250;
  const by = Number.isFinite(Number(board.y)) ? Number(board.y) : 255;
  return {
    offsetX: Math.round(bx - 250 - sceneX),
    offsetY: Math.round(by - 5 * S - 250 - sceneY),
    scale: boardScale * k,
    rotation: Number(board.rotation) || 0,
    z: Number(board.z) || 0,
  };
}

export default {
  name: "PreviewPage",
  components: { AcrylicEditor, AppHeader, DesignWorkspace },
  data() {
    return {
      // 空字符串 = 初始只渲染场景背景，不带默认示例产品。
      artwork: "",
      options: { material: "glitter", intensity: 85, thickness: 4 },
      editorOptions: null,
      editorReady: false,
      artworkObjectUrl: "",
      boardUrls: [],
      distributing: false,
      effectsSyncTimer: null,
      // 多效果图方案：{ id, name, config, imageUrl, imageBlob, generatedAt }。
      // 仅运行时数据，不持久化；后续将改由后端接口提供。
      plans: [],
      // 当前激活（主画布实时预览）的方案 id。
      activePlanId: null,
      // 设计完成状态：tag -> { blob, hole, shapeRegion, filename }（仅运行时）。
      designStates: {},
      // 编辑器每次 setBoards 重初始化都会再发 ready，方案恢复只执行一次。
      restored: false,
    };
  },
  computed: {
    activePlan() {
      return (
        this.plans.find((p) => p.id === this.activePlanId) ||
        this.plans[0] ||
        null
      );
    },
    // 设计画布板块：优先设置页布局（跨页共享），否则多方案板块并集
    // （按标识去重，首个出现者为准）。
    unionBoards() {
      const seen = new Set();
      const out = [];
      const source = sharedState.planBoards.length
        ? sharedState.planBoards
        : this.plans;
      const collect = (board) => {
        const tag = boardTag(board);
        if (!tag || seen.has(tag)) return;
        seen.add(tag);
        out.push(Object.assign({}, board, { tag }));
      };
      if (Array.isArray(source) && source.length && source[0].config) {
        for (const plan of source) {
          for (const board of plan.config.boards || []) collect(board);
        }
      } else {
        for (const board of source || []) collect(board);
      }
      return out;
    },
    sharedOptions() {
      return sharedState.sharedOptions;
    },
    patternWhiteBorder() {
      const border = Number(this.editorOptions && this.editorOptions.border);
      return Number.isFinite(border) ? border : 16;
    },
    patternCutLine() {
      const value = Number(this.editorOptions && this.editorOptions.cutLine);
      return Number.isFinite(value) ? value : 4;
    },
    patternDpi() {
      const value = Number(this.editorOptions && this.editorOptions.dpi);
      return Number.isFinite(value) ? value : 300;
    },
    patternComponentSize() {
      // 设置页「组件大小」优先；未设置回退首页侧栏的组件大小。
      const fromSettings = Number(sharedState.componentSize);
      if (Number.isFinite(fromSettings) && fromSettings > 0)
        return fromSettings;
      const value = Number(
        this.editorOptions && this.editorOptions.stickerSize,
      );
      return Number.isFinite(value) ? value : 50;
    },
    // 设置页上传的组件图案列表（PatternDesigner 内与内置图案并列可选）。
    stickerPatternAssets() {
      return sharedState.stickerPatterns;
    },
    // 是否启用组件：settings/方案明确设置时为 true/false；未设置 null
    // （首页保持本地手动勾选行为）。
    stickerEnabledSetting() {
      return sharedState.stickerEnabled;
    },
    patternSpecSize() {
      const value = Number(this.editorOptions && this.editorOptions.specSize);
      return Number.isFinite(value) ? value : SPEC_DEFAULT_SIZE;
    },
    patternInterfaceTabEnabled() {
      return Boolean(
        this.editorOptions && this.editorOptions.interfaceTabEnabled,
      );
    },
    patternInterfaceGuideWidth() {
      const value = Number(
        this.editorOptions && this.editorOptions.interfaceGuideWidth,
      );
      return Number.isFinite(value) ? value : 300;
    },
    patternInterfaceGuideHeight() {
      const value = Number(
        this.editorOptions && this.editorOptions.interfaceGuideHeight,
      );
      return Number.isFinite(value) ? value : 52;
    },
    patternInterfaceTabWidth() {
      const value = Number(
        this.editorOptions && this.editorOptions.interfaceTabWidth,
      );
      return Number.isFinite(value) ? value : 100;
    },
    patternInterfaceTabHeight() {
      const value = Number(
        this.editorOptions && this.editorOptions.interfaceTabHeight,
      );
      return Number.isFinite(value) ? value : 52;
    },
  },
  watch: {
    // 设置页修改的全局效果参数同步到本页编辑器（等值时 setOptions 不再
    // 触发 change，同步链自然收敛）。
    sharedOptions: {
      deep: true,
      handler(options) {
        if (options && this.$refs.editor && this.$refs.editor.setOptions) {
          this.$refs.editor.setOptions(Object.assign({}, options));
        }
      },
    },
  },
  methods: {
    onReady() {
      if (this.restored) return;
      this.restored = true;
      this.editorReady = true;
      console.log("亚克力编辑器已就绪");
      this.restorePlan();
    },
    onChange(options) {
      this.editorOptions = options;
      this.syncSharedOptions(options);
      // 侧栏材质/参数变化 → 防抖写回方案并重渲效果图
      this.scheduleEffectsSync();
    },
    // 侧栏切换材质/挂扣后，效果图必须跟着变：把编辑器当前的
    // options 与挂扣资产写回每个方案 config，再走完整出图链路。
    scheduleEffectsSync() {
      if (this.effectsSyncTimer) clearTimeout(this.effectsSyncTimer);
      this.effectsSyncTimer = setTimeout(() => {
        this.effectsSyncTimer = null;
        this.syncPlanOptionsAndRerender();
      }, 400);
    },
    async syncPlanOptionsAndRerender() {
      if (this.distributing) return;
      if (!this.plans.length) return;
      const editor = this.$refs.editor;
      if (!editor || !editor.createConfig || !this.editorOptions) return;
      const options = this.editorOptions;
      const hook = editor.createConfig().assets.hook || null;
      // 挂扣只比对身份字段（选择/文件名/是否内置）：
      // dataURL 每次重编码可能存在字节差异，不能参与等值判断。
      const hookKey = (h) =>
        h
          ? JSON.stringify({
              selection: h.selection,
              name: h.name,
              builtin: h.builtin,
            })
          : "";
      let dirty = false;
      this.plans.forEach((plan) => {
        if (
          JSON.stringify(plan.config.options) !== JSON.stringify(options)
        ) {
          plan.config.options = Object.assign({}, options);
          dirty = true;
        }
        if (hook) {
          const prev = plan.config.assets && plan.config.assets.hook;
          if (hookKey(prev) !== hookKey(hook)) {
            plan.config.assets = Object.assign({}, plan.config.assets, {
              hook,
            });
            dirty = true;
          }
        }
      });
      if (!dirty) return;
      await this.distributeEffects();
    },
    syncSharedOptions(options) {
      if (!options) return;
      if (JSON.stringify(sharedState.sharedOptions) === JSON.stringify(options))
        return;
      sharedState.sharedOptions = options;
    },
    onError(error) {
      console.error(error);
    },
    applyPatternFile(file) {
      if (this.$refs.designWorkspace)
        this.$refs.designWorkspace.setPatternFile(file);
    },
    // ---- 多方案：导入 / 激活 ----
    async importPlans(files) {
      const list = Array.from(files || []);
      let firstNew = null;
      for (const file of list) {
        try {
          const config = JSON.parse(await file.text());
          if (!Array.isArray(config.boards) || !config.boards.length) {
            throw Error("JSON 中没有板块布局（boards）。");
          }
          // 兼容旧 JSON：无 tag 时用板块名兜底。
          config.boards.forEach((b) => {
            b.tag = b.tag || b.name;
          });
          const plan = {
            id:
              "p" +
              Date.now().toString(36) +
              "-" +
              Math.random().toString(36).slice(2, 7),
            name: file.name,
            config,
            imageUrl: "",
            imageBlob: null,
            generatedAt: 0,
          };
          this.plans.push(plan);
          if (!firstNew) firstNew = plan;
        } catch (e) {
          console.error("导入方案失败", e);
        }
      }
      if (firstNew) await this.activatePlan(firstNew);
    },
    async activatePlan(plan) {
      if (!plan) return;
      this.activePlanId = plan.id;
      const editor = this.$refs.editor;
      if (!editor || !editor.loadConfig) return;
      try {
        await editor.loadConfig(plan.config);
      } catch (e) {
        console.error("方案加载失败", e);
      }
      this.applyPlanBoards(plan);
      this.applyPlanSticker(plan);
    },
    // 方案携带组件设置（settings 导出的 sticker 字段）时写回 sharedState：
    // 上传图案列表 + 组件大小 + 是否启用组件（PatternDesigner 经 props 消费）。
    // 旧 JSON 无此字段时保持现状不清空，避免冲掉设置页上传的内容。
    applyPlanSticker(plan) {
      const sticker = plan && plan.config && plan.config.sticker;
      if (!sticker || typeof sticker !== "object") return;
      if (Array.isArray(sticker.patterns))
        sharedState.stickerPatterns = JSON.parse(
          JSON.stringify(sticker.patterns),
        );
      const size = Number(sticker.componentSize);
      sharedState.componentSize =
        Number.isFinite(size) && size > 0 ? Math.round(size) : null;
      sharedState.stickerEnabled =
        typeof sticker.enabled === "boolean" ? sticker.enabled : null;
    },
    // 把已设计完成的板块（按标识匹配）铺到指定方案的编辑器场景。
    applyPlanBoards(plan) {
      const editor = this.$refs.editor;
      if (!editor || !editor.setBoards) return;
      this.revokeBoardUrls();
      const matched = (plan.config.boards || []).filter(
        (p) => this.designStates[boardTag(p)],
      );
      if (!matched.length) {
        editor.setBoards([]);
        return;
      }
      const list = matched.map((p) => {
        const state = this.designStates[boardTag(p)];
        const url = URL.createObjectURL(state.blob);
        this.boardUrls.push(url);
        return {
          id: p.id,
          src: url,
          hole: state.hole || null,
          shapeRegion: state.shapeRegion || null,
          transform: boardTransform(p, plan.config.options),
          // 板块级参数（settings 页「无需挂扣」等）随铺板传入，
          // blockOptions 会以 board.o 覆盖全局效果参数。
          o: p.o || null,
        };
      });
      editor.setBoards(list);
    },
    // ---- 分发：设计完成的板块按标识分发到各效果图 ----
    async applyDesign({ boards }) {
      if (!Array.isArray(boards) || !boards.length) return;
      boards.forEach((b) => {
        this.$set(this.designStates, b.tag, {
          blob: b.blob,
          hole: b.hole || null,
          shapeRegion: b.shapeRegion || null,
          filename: b.filename || b.tag + ".png",
        });
      });
      // 未导入方案时自动建一个「默认方案」：以当前设计板块为布局，
      // 保证「生成效果图」在没有导入 JSON 时也有产出落点。
      if (!this.plans.length) {
        const plan = {
          id: "p-auto-" + Date.now().toString(36),
          name: "默认方案",
          config: {
            version: 5,
            options: Object.assign({}, this.editorOptions || this.options),
            boards: boards.map((b) => ({
              id: b.id,
              tag: b.tag,
              name: b.name || b.tag,
              x: b.x,
              y: b.y,
              scale: b.scale,
              rotation: b.rotation,
              z: b.z,
              o: b.o,
              specSize: b.specSize,
            })),
            // 当前组件设置随方案保留（重激活/导出时不丢）。
            sticker: {
              patterns: JSON.parse(
                JSON.stringify(sharedState.stickerPatterns || []),
              ),
              componentSize: sharedState.componentSize,
            },
          },
          imageUrl: "",
          imageBlob: null,
          generatedAt: 0,
        };
        this.plans.push(plan);
        this.activePlanId = plan.id;
      }
      await this.distributeEffects();
    },
    async distributeEffects() {
      if (this.distributing) return;
      const editor = this.$refs.editor;
      if (!editor || !editor.loadConfig) return;
      this.distributing = true;
      const active = this.activePlan;
      try {
        for (const plan of this.plans) {
          await this.renderPlanEffect(plan);
        }
      } catch (e) {
        console.error("效果图生成失败", e);
      } finally {
        // 恢复激活方案的实时预览。
        if (active) await this.activatePlan(active);
        this.distributing = false;
      }
    },
    // 单张效果图：取该方案内「有设计状态」的板块逐个合成导出；
    // 方案没有任何已设计板块则跳过不处理。
    async renderPlanEffect(plan) {
      const editor = this.$refs.editor;
      const matched = (plan.config.boards || []).filter(
        (p) => this.designStates[boardTag(p)],
      );
      if (!matched.length) return;
      await editor.loadConfig(plan.config);
      this.revokeBoardUrls();
      const list = matched.map((p) => {
        const state = this.designStates[boardTag(p)];
        const url = URL.createObjectURL(state.blob);
        this.boardUrls.push(url);
        return {
          id: p.id,
          src: url,
          hole: state.hole || null,
          shapeRegion: state.shapeRegion || null,
          transform: boardTransform(p, plan.config.options),
          // 板块级参数（settings 页「无需挂扣」等）随铺板传入。
          o: p.o || null,
        };
      });
      editor.setBoards(list);
      await this.waitForEditor();
      const blob = await editor.exportImage({ size: 1000, format: "png" });
      if (plan.imageUrl) URL.revokeObjectURL(plan.imageUrl);
      plan.imageUrl = URL.createObjectURL(blob);
      plan.imageBlob = blob;
      plan.generatedAt = Date.now();
    },
    waitForEditor() {
      return new Promise((resolve) => {
        const start = Date.now();
        const check = () => {
          const ed = this.$refs.editor;
          if ((ed && ed.ready && !ed.busy) || Date.now() - start > 30000) {
            resolve();
          } else {
            setTimeout(check, 120);
          }
        };
        check();
      });
    },
    revokeBoardUrls() {
      this.boardUrls.forEach((url) => URL.revokeObjectURL(url));
      this.boardUrls = [];
    },
    // 页面加载时恢复方案数据。本地缓存已移除：后续在此处调用后端接口
    // 拉取方案列表（拉到后 push 进 this.plans 并激活），当前为空实现。
    async restorePlan() {
      if (this.plans.length) {
        const first = this.activePlan || this.plans[0];
        this.activatePlan(first);
      }
    },
    clearPlan() {
      this.plans = [];
      this.activePlanId = null;
      this.designStates = {};
      this.revokeBoardUrls();
      if (this.$refs.editor && this.$refs.editor.setBoards) {
        this.$refs.editor.setBoards([]);
      }
    },
  },
  beforeDestroy() {
    if (this.artworkObjectUrl) URL.revokeObjectURL(this.artworkObjectUrl);
    this.revokeBoardUrls();
  },
};
</script>
<style scoped>
/* 走马灯在 pd-side-stack 父卡片内部，自身不再带卡片样式（边框/底色由父容器统一） */
.plan-carousel {
  width: 100%;
  margin-bottom: 12px;
}
.plan-carousel-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  color: #172033;
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 8px;
}
/* 无方案空态：替代走马灯占位，避免渲染一整个空白 1:1 方块 */
.plan-carousel-empty {
  border: 1px dashed #d7dedb;
  border-radius: 10px;
  background: #f8faf9;
  padding: 28px 0;
  text-align: center;
  color: #8a94a6;
  font-size: 12px;
  height: 400px;
  display: grid;
  place-items: center;
}
.plan-carousel-el {
  border-radius: 10px;
  overflow: hidden;
}
/* 高度跟随宽度：正方形区域 */
.plan-carousel-el {
  height: auto !important;
}
.plan-carousel ::v-deep .el-carousel__container {
  height: auto !important;
  aspect-ratio: 1 / 1;
}
/* 让每张卡片撑满走马灯单项高度，图片区自适应剩余空间 */
.plan-carousel ::v-deep .el-carousel__item {
  display: flex;
}
.plan-carousel ::v-deep .el-carousel__item > .plan-card {
  flex: 1 1 auto;
  min-width: 0;
}
.plan-card {
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 6px;
  padding: 8px;
  border: 1px solid #e4eaf3;
  border-radius: 10px;
  cursor: pointer;
  background: #fff;
}
.plan-card.active {
  border-color: #285348;
  box-shadow: 0 0 0 2px rgba(40, 83, 72, 0.18);
}
.plan-thumb {
  display: grid;
  place-items: center;
  border-radius: 8px;
  overflow: hidden;
  background: #f4f7fb;
}
.plan-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.plan-thumb-empty {
  color: #8a94a6;
  font-size: 12px;
}
</style>

<style>
/* 穿透链：把 PatternDesigner 的设置面板（pillow-demo）提升为 preview grid
   的 params 区（右列效果图下方）。必须非 scoped——目标元素在
   DesignWorkspace / PatternDesigner 内部，scoped 规则匹配不到。
   全部带 .editor-preview 前缀，不泄漏到设置页。 */
.editor-preview .design-canvas,
.editor-preview .design-canvas > .design-workspace.embedded,
.editor-preview .design-canvas .board-pane.active,
.editor-preview .design-canvas .board-pane.active .embedded,
.editor-preview .design-canvas .board-pane.active .embedded > div:first-child,
/* SVG 刀线板块（SvgCutlineDesigner）：根容器同设为 contents，其
   pd-side-stack / canvas-panel / pillow-demo 与 PatternDesigner 共用下方规则 */
.editor-preview .design-canvas .board-pane.active .svg-cutline-designer {
  display: contents !important;
}
/* 穿透后的 grid item 归位。
   注意：不用 grid-area 命名区——display:contents 链下 named area
   解析不可靠（实测 named 引用失败回退 auto-placement），用显式行列号。 */
.editor-preview .design-canvas .board-bar {
  grid-row: 1;
  grid-column: 2;
}
.editor-preview .design-canvas .board-pane.active .canvas-panel {
  grid-row: 2 / 4;
  grid-column: 2;
  /* 画布恢复原始宽度（原 = 中列 - 设计器设置面板 310 - gap 16），居中 */
  width: 100%;
  max-width: 722px;
  margin: 50px auto;
}
/* 右列唯一父容器：走马灯 + 组件设置面板（pillow-demo）同卡同宽、文档流内 */
.editor-preview .design-canvas .board-pane.active .pd-side-stack {
  display: flex;
  flex-direction: column;
  grid-row: 3;
  grid-column: 3;
  padding: 16px;
  background: #fff;
  border: 1px solid #e4eaf3;
  box-shadow: 0 10px 30px rgba(35, 55, 80, 0.08);
}
/* 有效果图方案时：整个卡片占满右列（从第 1 行顶起，与中列板块条齐平，
   走马灯在顶、设置面板在下），mockup 预览区（.workspace.vacant）同时让位。
   否则会漏出第 1 行（板块条行高）的空隙。 */
.editor-preview.has-replace .design-canvas .board-pane.active .pd-side-stack {
  grid-row: 1 / 4;
}
/* pillow-demo 在父卡片内部，剥离自身卡片样式（含 SvgCutlineDesigner 的 300px 定宽） */
.editor-preview .design-canvas .board-pane.active .pillow-demo {
  margin: 0;
  padding: 0;
  width: auto;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
/* 窄屏 1050 断点：4 行 2 列布局 */
@media (max-width: 1050px) {
  .editor-preview .design-canvas .board-bar {
    grid-row: 1;
    grid-column: 2;
  }
  .editor-preview .design-canvas .board-pane.active .canvas-panel {
    grid-row: 2;
    grid-column: 2;
  }
  .editor-preview .workspace {
    grid-row: 3;
    grid-column: 2;
  }
  .editor-preview .design-canvas .board-pane.active .pd-side-stack {
    grid-row: 4;
    grid-column: 2;
  }
  .editor-preview aside {
    grid-row: 1 / 5;
    grid-column: 1;
  }
}
</style>
