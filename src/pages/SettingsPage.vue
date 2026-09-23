<template>
  <div>
    <AppHeader>
      <template #actions>
        <button
          class="header-action"
          :disabled="!editorReady"
          @click="exportPlan"
        >
          导出方案 JSON
        </button>
      </template>
    </AppHeader>
    <AcrylicEditor
      ref="editor"
      :initial-options="options"
      mode="settings"
      :show-header="false"
      @ready="onReady"
      @change="onChange"
      @error="onError"
      @board-o-change="onBoardOChange"
      ><template slot="layout-layer">
        <BoardLayoutEditor
          :boards="layoutBoards"
          :scene="editorOptions || {}"
          @change="onBoardsChange"
          @select="onLayoutSelect"
        />
      </template></AcrylicEditor>
  </div>
</template>
<script>
import AcrylicEditor from "../components/AcrylicEditor";
import AppHeader from "../components/AppHeader.vue";
import BoardLayoutEditor from "../components/BoardLayoutEditor.vue";
import {
  planStore,
  planBoardsOrLayoutDefault,
  assemblePlan,
  readPlanCache,
} from "../planStore.js";

export default {
  name: "SettingsPage",
  components: { AcrylicEditor, AppHeader, BoardLayoutEditor },
  data() {
    return {
      options: { material: "glitter", intensity: 85, thickness: 4 },
      editorOptions: null,
      editorReady: false,
    };
  },
  computed: {
    planBoards() {
      return planStore.planBoards;
    },
    layoutBoards() {
      return planBoardsOrLayoutDefault();
    },
    sharedOptions() {
      return planStore.sharedOptions;
    },
  },
  watch: {
    // 首页修改的全局效果参数同步到本页编辑器（等值时收敛，见 PreviewPage）。
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
    onError(error) {
      console.error(error);
    },
    // 导出「板块布局 + 效果参数」方案（version 5 = v4 配置 + boards）。
    exportPlan() {
      const editor = this.$refs.editor;
      if (!editor || !editor.createConfig) return;
      const config = assemblePlan(
        editor.createConfig(),
        planBoardsOrLayoutDefault(),
      );
      const blob = new Blob([JSON.stringify(config, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "acrylic-plan.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    // 布局编辑器的每次改动都同步进共享 planBoards。
    onBoardsChange(boards) {
      planStore.planBoards = boards;
    },
    // 选中板块 → 编辑器进入该板块的参数编辑。
    onLayoutSelect(id) {
      planStore.settingsBoardId = id;
      const board = planBoardsOrLayoutDefault().find((b) => b.id === id);
      if (this.$refs.editor && this.$refs.editor.setEditingBoard) {
        this.$refs.editor.setEditingBoard(
          id,
          board && board.o,
          board && board.name,
        );
      }
    },
    // 每板块参数编辑回写 planBoards（随方案 JSON 导出）。
    onBoardOChange({ id, o }) {
      const board = planBoardsOrLayoutDefault().find((b) => b.id === id);
      if (board) this.$set(board, "o", o);
    },
    // 页面加载时恢复上次导入的方案（与首页共用缓存，boards 恢复幂等）。
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
  },
};
</script>
