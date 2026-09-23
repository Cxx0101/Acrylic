<template>
  <div id="demo-app">
    <header class="app-header">
      <div class="app-brand">
        <span>D</span>
        <div>亚克力Demo<small>ACRYLIC STUDIO</small></div>
      </div>
      <nav aria-label="主导航">
        <router-link exact to="/">预览首页</router-link>
        <router-link to="/settings">效果设置</router-link>
      </nav>
      <button
        v-if="isSettings"
        class="header-action"
        :disabled="!editorReady"
        @click="exportPlan"
      >
        导出方案 JSON
      </button>
      <div v-else class="header-actions">
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
      <input
        ref="planInput"
        type="file"
        accept="application/json,.json"
        style="display: none"
        @change="importPlan($event.target.files[0])"
      />
      <!-- <button
        v-else
        class="header-action"
        :disabled="!editorReady"
        @click="downloadImage"
      >
        下载效果图
      </button> -->
    </header>
    <div class="page-heading">
      <!-- <div><span>{{isSettings?'DESIGN SETTINGS':'QUICK PREVIEW'}}</span><h1>{{isSettings?'设置效果图参数':'导入方案并预览效果'}}</h1></div>
      <p>{{isSettings?'设置完成后导出带背景的 JSON，再回到首页验证效果。':'导入 JSON，选择透明图案和材质，即时查看成品。'}}</p> -->
    </div>
    <AcrylicEditor
      ref="editor"
      :src="artwork"
      :initial-options="options"
      :mode="isSettings ? 'settings' : 'preview'"
      :show-header="false"
      :defer-artwork-upload="!isSettings"
      @ready="onReady"
      @change="onChange"
      @export="onExport"
      @error="onError"
      @upload="applyPatternFile"
      @board-o-change="onBoardOChange"
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
      /><template slot="layout-layer">
        <BoardLayoutEditor
          v-if="isSettings"
          :boards="layoutBoards"
          :scene="editorOptions || {}"
          @change="onBoardsChange"
          @select="onLayoutSelect"
        />
      </template></AcrylicEditor>
  </div>
</template>
<script>
import AcrylicEditor from "./components/AcrylicEditor";
import DesignWorkspace from "./components/DesignWorkspace.vue";
import BoardLayoutEditor from "./components/BoardLayoutEditor.vue";
export default {
  name: "App",
  components: { AcrylicEditor, DesignWorkspace, BoardLayoutEditor },
  data() {
    return {
      // 空字符串 = 初始只渲染场景背景，不带默认示例产品。
      artwork: "",
      options: { material: "glitter", intensity: 85, thickness: 4 },
      editorOptions: null,
      editorReady: false,
      artworkObjectUrl: "",
      boardUrls: [],
      // 设置页布局编辑器产出 / 首页导入的板块布局（JSON boards）。
      planBoards: [],
      // 设置页当前选中、正在编辑参数的板块。
      settingsBoardId: null,
      // 未导入方案时，布局编辑器的默认单块占位。
      layoutDefault: [
        {
          id: "b1",
          name: "板块1",
          x: 250,
          y: 255,
          scale: 1,
          rotation: 0,
          z: 0,
          specSize: 10,
        },
      ],
    };
  },
  computed: {
    isSettings() {
      return this.$route.path === "/settings";
    },
    layoutBoards() {
      return this.planBoards.length ? this.planBoards : this.layoutDefault;
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
      return Boolean(this.editorOptions && this.editorOptions.interfaceTabEnabled);
    },
    patternInterfaceGuideWidth() {
      const value = Number(this.editorOptions && this.editorOptions.interfaceGuideWidth);
      return Number.isFinite(value) ? value : 300;
    },
    patternInterfaceGuideHeight() {
      const value = Number(this.editorOptions && this.editorOptions.interfaceGuideHeight);
      return Number.isFinite(value) ? value : 52;
    },
    patternInterfaceTabWidth() {
      const value = Number(this.editorOptions && this.editorOptions.interfaceTabWidth);
      return Number.isFinite(value) ? value : 100;
    },
    patternInterfaceTabHeight() {
      const value = Number(this.editorOptions && this.editorOptions.interfaceTabHeight);
      return Number.isFinite(value) ? value : 52;
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
      // JSON 里的 x/y 是板块中心在 500 画布上的绝对坐标；合成引擎的
      // transform 是相对场景摆放（productX/Y）的偏移，这里做一次换算。
      const sceneX =
        Number(this.editorOptions && this.editorOptions.productX) || 0;
      const sceneY =
        Number(this.editorOptions && this.editorOptions.productY) || 0;
      const sceneScale =
        (Number(this.editorOptions && this.editorOptions.productScale) ||
          100) / 100;
      const list = boards.map((board) => {
        const url = URL.createObjectURL(board.blob);
        this.boardUrls.push(url);
        // y 是板块区域顶部中心：合成端板体顶相对锚点偏移 +5·s（makeShape
        // 的 rect top=255），这里把它扣掉，使板体顶精确对齐框顶。
        const s =
          sceneScale * (Number(board.scale) || 1);
        return {
          id: board.id,
          src: url,
          hole: board.hole || null,
          shapeRegion: board.shapeRegion || null,
          o: board.o ? Object.assign({}, board.o) : null,
          transform: {
            offsetX: Math.round((Number(board.x) || 250) - 250 - sceneX),
            offsetY: Math.round(
              (Number(board.y) || 255) - 5 * s - 250 - sceneY,
            ),
            scale: Number(board.scale) || 1,
            rotation: Number(board.rotation) || 0,
            z: Number(board.z) || 0,
          },
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
    // 设置页：导出「板块布局 + 效果参数」方案（version 5 = v4 配置 + boards）。
    exportPlan() {
      const editor = this.$refs.editor;
      if (!editor || !editor.createConfig) return;
      const config = editor.createConfig();
      config.version = 5;
      config.boards = JSON.parse(
        JSON.stringify(this.planBoards.length ? this.planBoards : this.layoutDefault),
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
          this.planBoards = config.boards;
          localStorage.setItem("acrylic-board-plan", JSON.stringify(config));
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
        const raw = localStorage.getItem("acrylic-board-plan");
        if (!raw) return;
        const config = JSON.parse(raw);
        if (Array.isArray(config.boards) && config.boards.length) {
          this.planBoards = config.boards;
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
      this.planBoards = [];
      localStorage.removeItem("acrylic-board-plan");
    },
    // 设置页布局编辑器的每次改动都同步进 planBoards。
    onBoardsChange(boards) {
      this.planBoards = boards;
    },
    // 设置页选中板块 → 编辑器进入该板块的参数编辑。
    onLayoutSelect(id) {
      this.settingsBoardId = id;
      const list = this.planBoards.length ? this.planBoards : this.layoutDefault;
      const board = list.find((b) => b.id === id);
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
      const list = this.planBoards.length ? this.planBoards : this.layoutDefault;
      const board = list.find((b) => b.id === id);
      if (board) this.$set(board, "o", o);
    },
    downloadImage() {
      this.$refs.editor.download();
    },
    exportConfig() {
      this.$refs.editor.exportConfig();
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
<style>
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: #f2f3f3;
  color: #25302c;
  font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
}
button {
  font: inherit;
}
#demo-app {
  min-height: 100vh;
}
.app-header {
  height: 78px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 32px;
  background: #fff;
  border-bottom: 1px solid #e1e6e2;
  position: sticky;
  top: 0;
  z-index: 10;
}
.app-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  font-size: 21px;
  letter-spacing: 2px;
}
.app-brand > span {
  display: grid;
  place-items: center;
  width: 40px;
  height: 43px;
  border-radius: 12px 12px 12px 3px;
  background: #244941;
  color: #fff;
  font-size: 22px;
}
.app-brand small {
  display: block;
  margin-top: 3px;
  color: #88918d;
  font-size: 8px;
  letter-spacing: 1.5px;
}
.app-header nav {
  display: flex;
  gap: 7px;
  padding: 4px;
  background: #f0f3f1;
  border-radius: 10px;
}
.app-header nav a {
  text-decoration: none;
  color: #68746f;
  padding: 9px 18px;
  border-radius: 7px;
  font-size: 14px;
}
.app-header nav a.router-link-exact-active {
  background: #fff;
  color: #244f43;
  box-shadow: 0 2px 9px #2e483a12;
}
.header-action {
  justify-self: end;
  border: 0;
  border-radius: 8px;
  background: #285348;
  color: #fff;
  padding: 11px 18px;
  cursor: pointer;
}
.header-action:disabled {
  opacity: 0.45;
  cursor: wait;
}
.header-action--ghost {
  background: #fff;
  color: #285348;
  border: 1px solid #cfd9d5;
}
.header-actions {
  justify-self: end;
  display: flex;
  gap: 10px;
}
.page-heading {
  max-width: 1370px;
  margin: 0 auto;
  display: flex;
  align-items: end;
  justify-content: space-between;
  padding: 10px 38px 10px;
  gap: 25px;
}
.page-heading span {
  font-size: 10px;
  letter-spacing: 2px;
  color: #8c9993;
}
.page-heading h1 {
  font-size: 24px;
  margin: 7px 0 0;
  font-weight: 600;
}
.page-heading p {
  font-size: 13px;
  color: #77827d;
  margin: 0;
  max-width: 420px;
  text-align: right;
  line-height: 1.7;
}
@media (max-width: 700px) {
  .app-header {
    height: auto;
    min-height: 70px;
    padding: 10px 14px;
    grid-template-columns: 1fr auto;
  }
  .app-brand small {
    display: none;
  }
  .app-header nav {
    order: 3;
    grid-column: 1/-1;
    margin-top: 9px;
  }
  .app-header nav a {
    flex: 1;
    text-align: center;
    padding: 8px;
  }
  .header-action {
    padding: 10px;
    font-size: 12px;
  }
  .page-heading {
    padding: 20px 16px 8px;
    display: block;
  }
  .page-heading p {
    margin-top: 8px;
    text-align: left;
  }
  .page-heading h1 {
    font-size: 20px;
  }
}
</style>
