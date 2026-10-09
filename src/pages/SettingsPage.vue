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
      </template>
      <template slot="aside-extra">
        <section>
          <h2><span>05</span> 组件设置</h2>
          <div class="sticker-setting">
            <div class="sticker-pattern-list">
              <div
                v-for="item in stickerPatterns"
                :key="item.id"
                class="sticker-pattern-item"
              >
                <img :src="item.src" :alt="item.label" />
                <span :title="item.label">{{ item.label }}</span>
                <button
                  type="button"
                  class="sticker-pattern-remove"
                  :aria-label="'删除' + item.label"
                  @click="removeStickerPattern(item.id)"
                >
                  ×
                </button>
              </div>
              <label class="sticker-pattern-upload"
                ><i>＋</i><span>上传 SVG</span
                ><input
                  type="file"
                  accept=".svg,image/svg+xml"
                  @change="
                    uploadStickerPattern($event.target.files[0]);
                    $event.target.value = '';
                  "
              /></label>
            </div>
            <label class="number-setting"
              >组件大小(px)
              <input
                type="number"
                min="1"
                step="1"
                :value="stickerComponentSize"
                @change="onStickerComponentSize($event)"
              /> </label
            ><span class="sticker-setting-hint"
              >留空则使用首页侧栏的组件大小</span
            >
            <label class="toggle-label"
              >是否启用组件
              <input
                type="checkbox"
                :checked="stickerEnabled === true"
                @change="stickerEnabled = $event.target.checked"
              /> </label
            ><span class="sticker-setting-hint"
              >开启后首页设计器自动启用组件（随方案 JSON 复原）</span
            >
            <label class="toggle-label"
              >启用多个组件
              <input
                type="checkbox"
                :checked="stickerMulti === true"
                @change="stickerMulti = $event.target.checked"
              /> </label
            ><span class="sticker-setting-hint"
              >开启后预览页同一画布插入两次组件，默认在图片上/下方</span
            >
          </div>
        </section>
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
      // 首屏就以sharedState 为基线：AcrylicEditor.created 里会拿这份
      // initial-options 调 setOptions，若此处只有材质三项，挂扣开关等
      // 字段会回退 DEFAULTS（hook=true）。
      options: Object.assign(
        { material: "glitter", intensity: 85, thickness: 4 },
        sharedState.sharedOptions || {},
      ),
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
    // 组件设置（aside-extra 区块）：上传图案与组件大小，随 sharedState 跨页。
    stickerPatterns() {
      return sharedState.stickerPatterns;
    },
    stickerComponentSize() {
      return sharedState.componentSize;
    },
    // 可写 computed：模板不能直接引用模块级 sharedState（未挂到实例上），
    // 早期版本 `sharedState.x = $event.target.checked` 会静默失败——DOM 勾上了
    // 但 sharedState 没变，导出 JSON 仍是旧值。统一走 setter 写回。
    stickerEnabled: {
      get() {
        return sharedState.stickerEnabled;
      },
      set(value) {
        sharedState.stickerEnabled = value;
      },
    },
    stickerMulti: {
      get() {
        return sharedState.multiSticker;
      },
      set(value) {
        sharedState.multiSticker = value;
      },
    },
  },
  watch: {
    // 首页修改的全局效果参数同步到本页编辑器（等值时收敛，见 PreviewPage）。
    sharedOptions: {
      deep: true,
      handler(options) {
        const editor = this.$refs.editor;
        if (!options || !editor || !editor.setOptions) return;
        editor.setOptions(Object.assign({}, options));
        // keep-alive 二次进入本页时 onReady 不会重跑，挂扣资产要在这里同步清：
        // 首页选「无挂扣」只改 o.hook，本页 assets.hook 仍是内置图，
        // 导出的 assets.hook.dataUrl 会让首页导入侧把挂扣复原。
        if (options.hook === false && editor.clearHookAsset) {
          editor.clearHookAsset();
          editor.redraw();
        }
      },
    },
  },
  methods: {
    onReady() {
      this.editorReady = true;
      // 效果参数（含 hook 挂扣开关）以 sharedState 为准再灌一次编辑器：
      // 方案数据后续由后端接口提供（restorePlan 目前是空壳），此时 sharedOptions
      // 可能为 null（首页没动过效果参数），那保持编辑器默认值即可。
      const shared = sharedState.sharedOptions;
      const editor = this.$refs.editor;
      if (shared && editor && editor.setOptions) {
        editor.setOptions(Object.assign({}, shared));
        // 挂扣为「无」时同步清空本页 editor 的挂扣资产，保证 createConfig()
        // 导出的 assets.hook 与 options.hook 自洽（否则首页导入会把挂扣复原）。
        if (shared.hook === false && editor.clearHookAsset) {
          editor.clearHookAsset();
          editor.redraw();
        }
      }
      this.restorePlan();
    },
    onChange(options) {
      this.editorOptions = options;
      this.syncSharedOptions(options);
    },
    syncSharedOptions(options) {
      if (!options || !this.editorReady) return;
      if (JSON.stringify(sharedState.sharedOptions) === JSON.stringify(options))
        return;
      sharedState.sharedOptions = options;
    },
    onError(error) {
      console.error(error);
    },
    // 导出「板块布局 + 效果参数」方案（version 5 = v4 配置 + boards）。
    // 组装「板块布局 + 效果参数 + 组件设置」方案对象（v5 + sticker）。
    // 导出与探针共用：sticker 字段承载组件图案列表与组件大小，
    // 导入时经 applyPlan 复原回 sharedState。
    buildPlan() {
      const editor = this.$refs.editor;
      if (!editor || !editor.createConfig) return null;
      const boards = JSON.parse(JSON.stringify(this.layoutBoards));
      // 挂扣归一化：全局 o.hook 是最终裁决（首页选择器 / 本页板块下拉都写它），
      // 但板块 o.hook 在首页 blockOptions 里优先级更高——若残留 true，导入后
      // 会把「无挂扣」覆盖回「需要挂扣」。故导出时按全局值对齐所有板块。
      const hook = editor.o ? editor.o.hook : null;
      if (typeof hook === "boolean") {
        boards.forEach((b) => {
          if (!b.o) this.$set(b, "o", {});
          b.o.hook = hook;
        });
      }
      const plan = assemblePlan(editor.createConfig(), boards);
      plan.sticker = {
        patterns: JSON.parse(JSON.stringify(sharedState.stickerPatterns)),
        componentSize: sharedState.componentSize,
        enabled: sharedState.stickerEnabled,
        multi: sharedState.multiSticker,
      };
      return plan;
    },
    exportPlan() {
      const plan = this.buildPlan();
      if (!plan) return;
      const blob = new Blob([JSON.stringify(plan, null, 2)], {
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
      console.log("🚀 ~ id:", id)
      const board = this.layoutBoards.find((b) => b.id === id);
      console.log("🚀 ~ board:", board)
      if (board) this.$set(board, "o", o);
    },
    // 页面加载时恢复方案数据。本地缓存已移除：后续在此处调用后端接口
    // 拉到方案后走 applyPlan 复原（同导入 JSON 一条链路）。
    restorePlan() {},
    // ---- 组件设置：上传组件图案（SVG 矢量）+ 组件大小（写 sharedState 跨页）----
    uploadStickerPattern(file) {
      if (!file) return;
      // 组件贴片为矢量图形：仅接受 SVG（fabric 渲染与轮廓链路都吃 SVG 源）。
      if (!/\.svg$/i.test(file.name) && file.type !== "image/svg+xml") {
        this.onError(Error("组件图案请上传 SVG 矢量文件。"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        sharedState.stickerPatterns = sharedState.stickerPatterns.concat({
          id: "sp-" + Date.now().toString(36),
          label: file.name.replace(/\.svg$/i, ""),
          src: String(reader.result),
        });
      };
      reader.readAsDataURL(file);
    },
    removeStickerPattern(id) {
      sharedState.stickerPatterns = sharedState.stickerPatterns.filter(
        (item) => item.id !== id,
      );
    },
    onStickerComponentSize(e) {
      const raw = Number(e.target.value);
      // 空值/非法值 = 未设置，首页回退侧栏的组件大小。
      sharedState.componentSize =
        Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
    },
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
      if (plan.sticker && typeof plan.sticker === "object") {
        // 组件设置复原：上传图案列表 + 组件大小 + 是否启用组件
        // （首页 PatternDesigner 消费）。
        sharedState.stickerPatterns = Array.isArray(plan.sticker.patterns)
          ? JSON.parse(JSON.stringify(plan.sticker.patterns))
          : [];
        const size = Number(plan.sticker.componentSize);
        sharedState.componentSize =
          Number.isFinite(size) && size > 0 ? Math.round(size) : null;
        sharedState.stickerEnabled =
          typeof plan.sticker.enabled === "boolean"
            ? plan.sticker.enabled
            : null;
        sharedState.multiSticker =
          typeof plan.sticker.multi === "boolean"
            ? plan.sticker.multi
            : false;
      }
    },
  },
};
</script>
