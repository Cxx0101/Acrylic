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
      :show-header="false"
      :preview-replace="true"
      defer-artwork-upload
      @ready="onReady"
      @change="onChange"
      @export="onExport"
      @error="onError"
      @upload="applyPatternFile"
      ><DesignWorkspace
        ref="designWorkspace"
        slot="design-canvas"
        embedded
        :plan-boards="plans.length ? unionBoards : null"
        :white-border="patternWhiteBorder"
        :cut-line="patternCutLine"
        :dpi="patternDpi"
        :component-size="patternComponentSize"
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
import AcrylicEditor from "../components/AcrylicEditor";
import AppHeader from "../components/AppHeader.vue";
import DesignWorkspace from "../components/DesignWorkspace.vue";
import {
  planStore,
  boardTag,
  boardTransform,
  readPlansCache,
  writePlansCache,
  clearPlansCache,
  readPlanCache,
  migrateLegacyBoard,
} from "../planStore.js";

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
      // 编辑器每次 setBoards 重初始化都会再发 ready，方案恢复只执行一次。
      restored: false,
    };
  },
  computed: {
    plans() {
      return planStore.plans;
    },
    activePlan() {
      return (
        this.plans.find((p) => p.id === planStore.activePlanId) ||
        this.plans[0] ||
        null
      );
    },
    // 设计画布板块 = 多方案板块并集（按标识去重，首个出现者为准）。
    unionBoards() {
      const seen = new Set();
      const out = [];
      for (const plan of this.plans) {
        for (const board of plan.config.boards || []) {
          const tag = boardTag(board);
          if (!tag || seen.has(tag)) continue;
          seen.add(tag);
          out.push(Object.assign({}, board, { tag }));
        }
      }
      return out;
    },
    sharedOptions() {
      return planStore.sharedOptions;
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
      const value = Number(
        this.editorOptions && this.editorOptions.stickerSize,
      );
      return Number.isFinite(value) ? value : 50;
    },
    patternSpecSize() {
      const value = Number(this.editorOptions && this.editorOptions.specSize);
      return Number.isFinite(value) ? value : 10;
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
      if (!planStore.plans.length) return;
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
      planStore.plans.forEach((plan) => {
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
      if (JSON.stringify(planStore.sharedOptions) === JSON.stringify(options))
        return;
      planStore.sharedOptions = options;
    },
    onExport({ blob, filename }) {
      console.log("已导出", filename, blob.size);
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
          planStore.plans.push(plan);
          if (!firstNew) firstNew = plan;
        } catch (e) {
          console.error("导入方案失败", e);
        }
      }
      writePlansCache(planStore.plans);
      if (firstNew) await this.activatePlan(firstNew);
    },
    async activatePlan(plan) {
      if (!plan) return;
      planStore.activePlanId = plan.id;
      const editor = this.$refs.editor;
      if (!editor || !editor.loadConfig) return;
      try {
        await editor.loadConfig(plan.config);
      } catch (e) {
        console.error("方案加载失败", e);
      }
      this.applyPlanBoards(plan);
    },
    // 把已设计完成的板块（按标识匹配）铺到指定方案的编辑器场景。
    applyPlanBoards(plan) {
      const editor = this.$refs.editor;
      if (!editor || !editor.setBoards) return;
      this.revokeBoardUrls();
      const matched = (plan.config.boards || []).filter(
        (p) => planStore.designStates[boardTag(p)],
      );
      if (!matched.length) {
        editor.setBoards([]);
        return;
      }
      const list = matched.map((p) => {
        const state = planStore.designStates[boardTag(p)];
        const url = URL.createObjectURL(state.blob);
        this.boardUrls.push(url);
        return {
          id: p.id,
          src: url,
          hole: state.hole || null,
          shapeRegion: state.shapeRegion || null,
          transform: boardTransform(p, plan.config.options),
        };
      });
      editor.setBoards(list);
    },
    // ---- 分发：设计完成的板块按标识分发到各效果图 ----
    async applyDesign({ boards }) {
      if (!Array.isArray(boards) || !boards.length) return;
      boards.forEach((b) => {
        planStore.designStates[b.tag] = {
          blob: b.blob,
          hole: b.hole || null,
          shapeRegion: b.shapeRegion || null,
          filename: b.filename || b.tag + ".png",
        };
      });
      // 未导入方案时自动建一个「默认方案」：以当前设计板块为布局，
      // 保证「生成效果图」在没有导入 JSON 时也有产出落点。
      if (!planStore.plans.length) {
        planStore.plans.push({
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
          },
          imageUrl: "",
          imageBlob: null,
          generatedAt: 0,
        });
        planStore.activePlanId = planStore.plans[0].id;
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
        (p) => planStore.designStates[boardTag(p)],
      );
      if (!matched.length) return;
      await editor.loadConfig(plan.config);
      this.revokeBoardUrls();
      const list = matched.map((p) => {
        const state = planStore.designStates[boardTag(p)];
        const url = URL.createObjectURL(state.blob);
        this.boardUrls.push(url);
        return {
          id: p.id,
          src: url,
          hole: state.hole || null,
          shapeRegion: state.shapeRegion || null,
          transform: boardTransform(p, plan.config.options),
        };
      });
      editor.setBoards(list);
      await this.waitForEditor();
      const blob = await editor.exportImage({ size: 1000, format: "png" });
      if (plan.imageUrl) URL.revokeObjectURL(plan.imageUrl);
      plan.imageUrl = URL.createObjectURL(blob);
      plan.imageBlob = blob;
      plan.generatedAt = Date.now();
      this.writePlansCacheSafe();
    },
    writePlansCacheSafe() {
      // 生成结果不持久化，但方案列表有变化时同步一次缓存。
      writePlansCache(planStore.plans);
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
    // 页面加载时恢复上次导入的方案（切页/刷新不丢）。
    restorePlan() {
      try {
        const cachedPlans = readPlansCache();
        if (cachedPlans && cachedPlans.length) {
          cachedPlans.forEach((p) => {
            if (!Array.isArray(p.config.boards)) return;
            p.config.boards.forEach((b) => {
              b.tag = b.tag || b.name;
              migrateLegacyBoard(b);
            });
            planStore.plans.push({
              id: p.id,
              name: p.name,
              config: p.config,
              imageUrl: "",
              imageBlob: null,
              generatedAt: 0,
            });
          });
        } else {
          const config = readPlanCache();
          if (
            config &&
            Array.isArray(config.boards) &&
            config.boards.length &&
            !planStore.plans.length
          ) {
            config.boards.forEach((b) => {
              b.tag = b.tag || b.name;
              migrateLegacyBoard(b);
            });
            planStore.plans.push({
              id: "p-legacy",
              name: "方案",
              config,
              imageUrl: "",
              imageBlob: null,
              generatedAt: 0,
            });
          }
        }
        if (planStore.plans.length) {
          const first =
            this.plans.find((p) => p.id === planStore.activePlanId) ||
            this.plans[0];
          this.activatePlan(first);
        }
      } catch (e) {
        console.error("方案缓存恢复失败", e);
      }
    },
    clearPlan() {
      planStore.plans = [];
      planStore.activePlanId = null;
      planStore.designStates = {};
      clearPlansCache();
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
