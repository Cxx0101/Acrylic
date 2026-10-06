<template>
  <div>
    <AppHeader>
      <template #actions>
        <button
          class="header-action"
          :disabled="!editorReady"
          @click="triggerImportPlan"
        >
          导入方案 JSON
        </button>
        <button
          class="header-action"
          :disabled="!editorReady"
          @click="exportPlan"
        >
          导出方案 JSON
        </button>
        <input
          ref="planFile"
          type="file"
          accept=".json,application/json"
          style="display: none"
          @change="onPlanFile"
        />
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
    // 拉到方案后走 applyPlan 复原（同导入 JSON 一条链路）。
    restorePlan() {},
    // ---- 导入方案 JSON：复原效果参数、背景资产与板块布局 ----
    triggerImportPlan() {
      const input = this.$refs.planFile;
      if (!input) return;
      input.value = "";
      input.click();
    },
    async onPlanFile(e) {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      let plan;
      try {
        plan = JSON.parse(await file.text());
      } catch (err) {
        this.onError(Error("方案 JSON 解析失败：" + err.message));
        return;
      }
      await this.applyPlan(plan);
      console.log("🚀 ~ plan:", plan)
    },
    // 应用方案数据（文件导入与后续接口共用）。兼容两种形态：
    // v5 方案 {version, options, boards, assets, export} 与纯 v4 配置。
    // 错误经编辑器 reportError 显示在侧栏（格式错/资产非法均不崩页）。
    async applyPlan(plan) {
      const editor = this.$refs.editor;
      if (!editor || !editor.loadConfig) return;
      editor.error = "";
      const fail = (err) => {
        if (editor.reportError) editor.reportError(err);
        else console.error(err);
      };
      if (!plan || typeof plan !== "object" || !plan.options) {
        fail(Error("方案 JSON 格式不正确。"));
        return;
      }
      try {
        await editor.loadConfig(plan);
      } catch (err) {
        fail(err);
        return;
      }
      if (Array.isArray(plan.boards)) {
        // 布局复原：写回共享 planBoards（BoardLayoutEditor 即时显示，
        // 首页 unionBoards 同步联动）。板块设计图不在 JSON 数据域内
        // （设计态属首页内存），画布按复原后的参数渲染场景。
        sharedState.planBoards = JSON.parse(JSON.stringify(plan.boards));
        this.settingsBoardId = null;
        if (editor.setEditingBoard) editor.setEditingBoard(null, null, "");
      }
    },
  },
};
</script>
