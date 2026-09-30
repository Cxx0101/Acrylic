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
import { sharedState } from "../sharedState.js";
// ---- 板块工具（纯函数，随设置页域就近维护）----
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
      // 当前选中、正在编辑参数的板块 id。
      settingsBoardId: null,
    };
  },
  computed: {
    planBoards() {
      return sharedState.planBoards;
    },
    layoutBoards() {
      return sharedState.planBoards.length
        ? sharedState.planBoards
        : sharedState.layoutDefault;
    },
    sharedOptions() {
      return sharedState.sharedOptions;
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
      if (JSON.stringify(sharedState.sharedOptions) === JSON.stringify(options))
        return;
      sharedState.sharedOptions = options;
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
        this.layoutBoards,
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
      sharedState.planBoards = boards;
      // 工具栏改名后同步左侧参数面板标题（仅名称变化时重设，避免频繁重建编辑态）
      const id = this.settingsBoardId;
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
      this.settingsBoardId = id;
      const board = this.layoutBoards.find((b) => b.id === id);
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
      const board = this.layoutBoards.find((b) => b.id === id);
      if (board) this.$set(board, "o", o);
    },
    // 页面加载时恢复方案数据。本地缓存已移除：后续在此处调用后端接口
    // 拉取布局与效果参数（拉到后写 sharedState.planBoards 并 loadConfig），
    // 当前为空实现。
    restorePlan() {},
  },
};
</script>
