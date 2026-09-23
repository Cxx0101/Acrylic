<template>
  <div>
    <AppHeader>
      <template #actions>
        <div class="header-actions">
          <button class="header-action" @click="$refs.planInput.click()">
            导入方案
          </button>
          <button
            v-if="planBoards.length"
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
      style="display: none"
      @change="importPlan($event.target.files[0])"
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
        :plan-boards="planBoards.length ? planBoards : null"
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
  </div>
</template>
<script>
import AcrylicEditor from "../components/AcrylicEditor";
import AppHeader from "../components/AppHeader.vue";
import DesignWorkspace from "../components/DesignWorkspace.vue";
import {
  planStore,
  boardTransform,
  assemblePlan,
  readPlanCache,
  writePlanCache,
  clearPlanCache,
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
    };
  },
  computed: {
    planBoards() {
      return planStore.planBoards;
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
    applyDesign({ boards }) {
      if (!Array.isArray(boards) || !boards.length) return;
      // Each plate gets its own object URL; the editor composites them by the
      // per-plate assembly transform (offset / rotation / z).
      this.revokeBoardUrls();
      const list = boards.map((board) => {
        const url = URL.createObjectURL(board.blob);
        this.boardUrls.push(url);
        return {
          id: board.id,
          src: url,
          hole: board.hole || null,
          shapeRegion: board.shapeRegion || null,
          o: board.o ? Object.assign({}, board.o) : null,
          transform: boardTransform(board, this.editorOptions),
        };
      });
      if (this.$refs.editor && this.$refs.editor.setBoards) {
        this.$refs.editor.setBoards(list);
      } else if (list[0]) {
        // Fallback for a single-plate editor build.
        this.setSingleArtwork(list[0]);
      }
      this.editorReady = false;
      if (this.$route.path !== "/") this.$router.push("/");
    },
    setSingleArtwork(item) {
      if (this.$refs.editor && this.$refs.editor.setDesignHole)
        this.$refs.editor.setDesignHole(item.hole);
      if (this.$refs.editor && this.$refs.editor.setDesignShapeRegion)
        this.$refs.editor.setDesignShapeRegion(item.shapeRegion);
      this.artwork = item.src;
    },
    revokeBoardUrls() {
      this.boardUrls.forEach((url) => URL.revokeObjectURL(url));
      this.boardUrls = [];
    },
    // 首页：导入方案 → 应用效果参数 + 板块布局，并写入本地缓存。
    importPlan(file) {
      if (!file) return;
      file
        .text()
        .then((text) => {
          const config = JSON.parse(text);
          if (!Array.isArray(config.boards) || !config.boards.length) {
            throw Error("JSON 中没有板块布局（boards）。");
          }
          planStore.planBoards = config.boards;
          writePlanCache(config);
          if (this.$refs.editor && this.$refs.editor.loadConfig) {
            return this.$refs.editor.loadConfig({
              version: 4,
              options: config.options,
              assets: config.assets,
            });
          }
        })
        .catch((e) => console.error("导入方案失败", e));
    },
    // 页面加载时恢复上次导入的方案（切页/刷新不丢）。
    restorePlan() {
      try {
        const config = readPlanCache();
        if (!config) return;
        if (
          Array.isArray(config.boards) &&
          config.boards.length &&
          !planStore.planBoards.length
        ) {
          planStore.planBoards = config.boards;
        }
        if (
          config.options &&
          this.$refs.editor &&
          this.$refs.editor.loadConfig
        ) {
          this.$refs.editor.loadConfig({
            version: 4,
            options: config.options,
            assets: config.assets,
          });
        }
      } catch (e) {
        console.error("方案缓存恢复失败", e);
      }
    },
    clearPlan() {
      planStore.planBoards = [];
      clearPlanCache();
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
