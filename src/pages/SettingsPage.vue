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
import AcrylicEditor from "../settings/AcrylicEditor";
import AppHeader from "../settings/AppHeader.vue";
import BoardLayoutEditor from "../settings/BoardLayoutEditor.vue";
// ---- 板块工具（纯函数，随设置页域就近维护）----
// 板块默认锚点（顶部中心）：x 水平居中，y = 250 − 框高 220/2，垂直居中。
const BOARD_DEFAULT_X = 250;
const BOARD_DEFAULT_Y = 140;
// 旧版默认锚点（y=255 使占位框偏下方），恢复缓存时迁移到居中位置。
const LEGACY_DEFAULT_Y = 255;
// 未手动挪过位的旧默认板块归位到垂直居中（幂等）。
function migrateLegacyBoard(board) {
  if (
    board &&
    Number(board.x) === BOARD_DEFAULT_X &&
    Number(board.y) === LEGACY_DEFAULT_Y
  ) {
    board.y = BOARD_DEFAULT_Y;
  }
  return board;
}
// 导出「板块布局 + 效果参数」方案（version 5 = v4 配置 + boards）。
function assemblePlan(config, boards) {
  return Object.assign({}, config, {
    version: 5,
    boards: JSON.parse(JSON.stringify(boards)),
  });
}

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
      return this.$store.state.planBoards;
    },
    layoutBoards() {
      return this.$store.getters.layoutBoards;
    },
    sharedOptions() {
      return this.$store.state.sharedOptions;
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
      if (
        JSON.stringify(this.$store.state.sharedOptions) ===
        JSON.stringify(options)
      )
        return;
      this.$store.commit("setSharedOptions", options);
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
        this.$store.getters.layoutBoards,
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
      this.$store.commit("setPlanBoards", boards);
      // 工具栏改名后同步左侧参数面板标题（仅名称变化时重设，避免频繁重建编辑态）
      const id = this.$store.state.settingsBoardId;
      if (id && this.$refs.editor && this.$refs.editor.setEditingBoard) {
        const board = boards.find((b) => b.id === id);
        if (
          board &&
          board.name &&
          board.name !== this.$refs.editor.boardEditingName
        ) {
          this.$refs.editor.setEditingBoard(id, board.o, board.name);
        }
      }
    },
    // 选中板块 → 编辑器进入该板块的参数编辑。
    onLayoutSelect(id) {
      this.$store.commit("setSettingsBoardId", id);
      const board = this.$store.getters.layoutBoards.find(
        (b) => b.id === id,
      );
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
      const board = this.$store.getters.layoutBoards.find(
        (b) => b.id === id,
      );
      if (board) this.$set(board, "o", o);
    },
    // 页面加载时恢复上次导入的方案（与首页共用缓存，boards 恢复幂等）。
    async restorePlan() {
      try {
        const config = await this.$store.dispatch("readPlanCache");
        if (!config) return;
        if (
          Array.isArray(config.boards) &&
          config.boards.length &&
          !this.$store.state.planBoards.length
        ) {
          config.boards.forEach(migrateLegacyBoard);
          this.$store.commit("setPlanBoards", config.boards);
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
