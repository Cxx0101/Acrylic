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
      @change="importPlans($event.target.files); $event.target.value = ''"
    />
    <AcrylicEditor
      ref="editor"
      :src="artwork"
      :initial-options="options"
      mode="preview"
      :show-header="false"
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
    /></AcrylicEditor>
    <!-- 多效果图画廊：每份导入的方案一张，按板块标识匹配分发 -->
    <div v-if="plans.length" class="plan-gallery">
      <div class="plan-gallery-title">
        效果图（{{ plans.length }}）
        <span class="plan-gallery-hint">按板块标识匹配</span>
      </div>
      <div
        v-for="plan in plans"
        :key="plan.id"
        :class="['plan-card', { active: activePlan && plan.id === activePlan.id }]"
        @click="activatePlan(plan)"
      >
        <div class="plan-thumb">
          <img v-if="plan.imageUrl" :src="plan.imageUrl" alt="效果图" />
          <span v-else class="plan-thumb-empty">未生成</span>
        </div>
        <div class="plan-meta">
          <span class="plan-name" :title="plan.name">{{ plan.name }}</span>
          <span class="plan-tags">
            {{ planBoardTags(plan).join(" / ") }}
          </span>
          <span class="plan-actions">
            <button
              v-if="plan.imageUrl"
              type="button"
              @click.stop="viewLarge(plan)"
            >
              查看大图
            </button>
            <button type="button" @click.stop="removePlan(plan)">删除</button>
          </span>
        </div>
      </div>
    </div>
    <div v-if="largeViewUrl" class="plan-lightbox" @click="closeLargeView">
      <img :src="largeViewUrl" alt="效果图大图" @click.stop />
    </div>
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
      largeViewUrl: null,
      distributing: false,
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
    planBoardTags(plan) {
      const tags = (plan.config.boards || []).map((b) => boardTag(b));
      return [...new Set(tags)];
    },
    // ---- 多方案：导入 / 激活 / 删除 ----
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
    removePlan(plan) {
      const index = planStore.plans.indexOf(plan);
      if (index < 0) return;
      if (plan.imageUrl) URL.revokeObjectURL(plan.imageUrl);
      planStore.plans.splice(index, 1);
      writePlansCache(planStore.plans);
      if (planStore.activePlanId === plan.id) {
        const next = this.plans[0] || null;
        if (next) this.activatePlan(next);
        else if (this.$refs.editor && this.$refs.editor.setBoards) {
          this.$refs.editor.setBoards([]);
        }
      }
    },
    viewLarge(plan) {
      if (!plan.imageUrl) return;
      this.closeLargeView();
      this.largeViewUrl = plan.imageUrl;
    },
    closeLargeView() {
      this.largeViewUrl = null;
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
          const first = this.plans.find(
            (p) => p.id === planStore.activePlanId,
          ) || this.plans[0];
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
    async getResultBlob() {
      return this.$refs.editor.exportImage({ size: 1500, format: "png" });
    },
  },
  beforeDestroy() {
    if (this.artworkObjectUrl) URL.revokeObjectURL(this.artworkObjectUrl);
    this.revokeBoardUrls();
  },
};
</script>
<style scoped>
.plan-gallery {
  position: fixed;
  top: 74px;
  right: 14px;
  z-index: 60;
  width: 210px;
  max-height: calc(100vh - 100px);
  overflow: auto;
  display: grid;
  gap: 10px;
  padding: 10px;
  border: 1px solid #e4eaf3;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 30px rgba(35, 55, 80, 0.14);
}
.plan-gallery-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  color: #172033;
  font-size: 13px;
  font-weight: 700;
}
.plan-gallery-hint {
  color: #8a94a6;
  font-size: 11px;
  font-weight: 400;
}
.plan-card {
  display: grid;
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
  min-height: 90px;
  border-radius: 8px;
  overflow: hidden;
  background: #f4f7fb;
}
.plan-thumb img {
  width: 100%;
  display: block;
}
.plan-thumb-empty {
  color: #8a94a6;
  font-size: 12px;
}
.plan-meta {
  display: grid;
  gap: 2px;
  font-size: 11px;
  color: #40506a;
}
.plan-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.plan-tags {
  color: #8a94a6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.plan-actions {
  display: flex;
  gap: 6px;
}
.plan-actions button {
  border: 1px solid #d7dedb;
  border-radius: 6px;
  background: #fff;
  color: #40506a;
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
}
.plan-lightbox {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.72);
  cursor: zoom-out;
}
.plan-lightbox img {
  max-width: 92vw;
  max-height: 92vh;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}
</style>
