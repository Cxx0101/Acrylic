<script>
import {
  loadImage,
  prepareArt,
  makeShape,
  render,
  composeScene,
  holeOffsetsFromPoint,
} from "../../utils/settings/render";
import { SPEC_DEFAULT_SIZE } from "../../utils/settings/render";
import backgroundUrl from "./assets/background.png";
import hookUrl from "./assets/hook.png";
import glitterUrl from "./assets/glitter.png";
import reflectionUrl from "./assets/reflection.png";

const DEFAULTS = {
  border: 16,
  smooth: 5,
  cutLine: 4,
  dpi: 300,
  stickerSize: 50,
  // 默认规格 = 5cm（效果渲染按共享 options 的 specSize 缩放）。
  specSize: SPEC_DEFAULT_SIZE,
  interfaceTabEnabled: false,
  interfaceGuideWidth: 300,
  interfaceGuideHeight: 52,
  interfaceTabWidth: 100,
  interfaceTabHeight: 52,
  material: "glitter",
  density: 85,
  shine: 55,
  intensity: 80,
  thickness: 4,
  tint: "#8c68df",
  baseColor: "#ffffff",
  baseOpacity: 0,
  textureScale: 100,
  textureOpacity: 100,
  holeX: 0,
  holeY: 0,
  holeShape: "ring",
  // 多组件挂孔数组；单孔/无组件时为空，makeShape 回退到下方单孔字段。
  holes: [],
  hook: true,
  background: "scene",
  productX: 0,
  productY: 0,
  productScale: 100,
  productRotation: 0,
  shadowX: -7,
  shadowY: 8,
  shadowBlur: 5,
  shadowOpacity: 20,
};
const BUILTIN = {
  background: backgroundUrl,
  hook: hookUrl,
  glitter: glitterUrl,
  reflection: reflectionUrl,
};
function imageToDataUrl(img, type = "image/png", quality = 0.92) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  return c.toDataURL(type, quality);
}
export default {
  name: "AcrylicEditor",
  props: {
    // Empty src uses the supplied original artwork. Can be changed after mounting.
    src: { type: String, default: "" },
    assetUrls: { type: Object, default: () => ({}) },
    initialOptions: { type: Object, default: () => ({}) },
    crossOrigin: { type: String, default: "anonymous" },
  },
  data() {
    return {
      ready: false,
      busy: false,
      error: "",
      notice: "",
      filename: "切图_05.png",
      dimensions: "",
      o: Object.assign({}, DEFAULTS),
      scenePreset: "studio",
      exportSize: 1500,
      exportFormat: "png",
      dragging: false,
      // Per-plate parameter editing (settings page): the currently selected
      // board and its responsive parameter override object.
      boardEditingId: null,
      boardEditingName: "",
      boardEditingO: {},
    };
  },
  watch: {
    o: {
      deep: true,
      handler() {
        this.scheduleRedraw();
        this.$emit("change", Object.assign({}, this.o));
      },
    },
    boardEditingO: {
      deep: true,
      handler() {
        this.applyBoardEditingO();
      },
    },
    src() {
      this.initialize();
    },
    assetUrls: {
      deep: true,
      handler() {
        this.initialize();
      },
    },
    crossOrigin() {
      this.initialize();
    },
  },
  created() {
    // Keep Image/Canvas objects outside Vue 2's deep observation.
    this.engine = {
      assets: {},
      builtinAssets: {},
      assetOverrides: {},
      assetData: { background: null, hook: null },
      assetNames: { background: "background.png", hook: "hook.png" },
      boards: [],
      boardConfigs: null,
      boardShapeRegionUrls: [],
      art: null,
      artVersion: 0,
      shape: null,
      shapeKey: "",
      timer: null,
      noticeTimer: null,
      loadId: 0,
      destroyed: false,
      designShapeRegionUrl: null,
    };
    this.setOptions(this.initialOptions);
  },
  mounted() {
    this.initialize();
  },
  beforeDestroy() {
    this.engine.destroyed = true;
    this.engine.loadId++;
    clearTimeout(this.engine.timer);
    clearTimeout(this.engine.noticeTimer);
    if (this.engine.designShapeRegionUrl)
      URL.revokeObjectURL(this.engine.designShapeRegionUrl);
    (this.engine.boardShapeRegionUrls || []).forEach((url) =>
      URL.revokeObjectURL(url),
    );
    this.engine.boardShapeRegionUrls = [];
    this.engine.designShapeRegionUrl = null;
  },
  methods: {
    reportError(e) {
      this.error = e.message || String(e);
      this.$emit("error", e);
    },
    async initialize() {
      const engine = this.engine,
        id = ++engine.loadId;
      this.ready = false;
      this.busy = true;
      this.error = "";
      try {
        const urls = Object.assign({}, BUILTIN, this.assetUrls),
          assets = {};
        await Promise.all(
          Object.keys(BUILTIN).map(async (name) => {
            assets[name] = await loadImage(urls[name], this.crossOrigin);
          }),
        );
        // Multi-plate: boardConfigs carries one entry per plate (set via
        // setBoards). Without it we build a single plate from the `src` prop,
        // keeping the legacy path byte-identical.
        // No propagated src and no plan boards => render the scene background
        // only; no default demo plate until the user actually designs one.
        const configs =
          engine.boardConfigs && engine.boardConfigs.length
            ? engine.boardConfigs
            : this.src
            ? [
                {
                  id: "b0",
                  src: this.src,
                  hole: engine.designHole,
                  shapeRegionUrl: engine.designShapeRegionUrl,
                  transform: null,
                },
              ]
            : [];
        const boards = [];
        for (const cfg of configs) {
          const source = cfg.src || this.src;
          const img = await loadImage(source, this.crossOrigin);
          if (img.width * img.height > 25000000)
            throw Error("图片过大，请缩小到 2500 万像素以内。");
          let shapeRegionImg = null;
          if (cfg.shapeRegionUrl) {
            try {
              shapeRegionImg = await loadImage(
                cfg.shapeRegionUrl,
                this.crossOrigin,
              );
            } catch (e) {
              shapeRegionImg = null;
            }
          }
          if (engine.destroyed || id !== engine.loadId) return;
          const art = prepareArt(img);
          if (shapeRegionImg) art.shapeRegion = shapeRegionImg;
          boards.push({
            id: cfg.id || "b" + boards.length,
            hole: cfg.hole || null,
            // 多组件：同一画布多个挂孔（预览页 image 上/下方各一）。
            holes: cfg.holes || null,
            shapeRegionUrl: cfg.shapeRegionUrl || null,
            transform: cfg.transform || null,
            o: cfg.o || null,
            art,
            artVersion: (engine.artVersion = engine.artVersion + 1),
            shapeKey: "",
            shape: null,
            width: img.width,
            height: img.height,
          });
        }
        if (engine.destroyed || id !== engine.loadId) return;
        engine.builtinAssets = assets;
        engine.assets = Object.assign({}, assets, engine.assetOverrides);
        ["background", "hook"].forEach((name) => {
          if (!engine.assetOverrides[name]) {
            try {
              engine.assetData[name] = imageToDataUrl(
                assets[name],
                name === "background" ? "image/jpeg" : "image/png",
              );
              engine.assetNames[name] = name + ".png";
            } catch (e) {
              engine.assetData[name] = null;
            }
          }
        });
        engine.boards = boards;
        // Legacy single-plate path: the design canvas owns the hole position,
        // so derive it into the shared options (drives the settings hint).
        if (boards.length === 1 && !boards[0].hole) {
          this.applyDesignHole(boards[0].art);
        }
        this.filename = this.src ? "传入的图片" : "";
        this.dimensions = boards.length
          ? boards[0].width + " × " + boards[0].height
          : "";
        this.ready = true;
        await this.$nextTick();
        if (engine.destroyed || id !== engine.loadId) return;
        this.redraw();
        this.$emit("ready");
      } catch (e) {
        if (!engine.destroyed && id === engine.loadId) this.reportError(e);
      } finally {
        if (!engine.destroyed && id === engine.loadId) this.busy = false;
      }
    },
    scheduleRedraw() {
      if (!this.engine || this.engine.destroyed) return;
      clearTimeout(this.engine.timer);
      this.engine.timer = setTimeout(() => this.redraw(), 35);
    },
    redraw() {
      if (!this.ready || this.engine.destroyed || !this.$refs.preview) return;
      try {
        const items = this.engine.boards.map((board) => {
          const blockO = this.blockOptions(board);
          const key = [
            board.artVersion,
            blockO.border,
            blockO.smooth,
            blockO.holeX,
            blockO.holeY,
            blockO.holeShape,
            blockO.hook,
            // 多组件时挂孔数组指纹；单孔时为空串，不影响既有缓存。
            (blockO.holes || []).length + "|" + (blockO.holes || []).map((h) => h.holeX + "," + h.holeY + "," + h.holeShape).join(";"),
            // 挂孔在 makeShape 内按规格比例缩放，规格变化必须重算 shape。
            blockO.specSize,
          ].join("|");
          if (key !== board.shapeKey) {
            board.shape = makeShape(board.art, blockO);
            board.shapeKey = key;
          }
          return {
            art: board.art,
            o: blockO,
            shape: board.shape,
            transform: board.transform,
          };
        });
        composeScene(this.$refs.preview, this.engine.assets, this.o, items);
      } catch (e) {
        this.reportError(e);
      }
    },
    // Per-plate options: the shared scene options plus this plate's own hole
    // mapping. A plate without a design hole (the legacy single-plate case)
    // returns the shared options object untouched, so nothing shifts.
    blockOptions(board, base) {
      const shared = base || this.o;
      if (!board) return shared;
      // Per-plate overrides (material/contour/hook) beat the shared options.
      // 复制一份：merged 不能是 shared/this.o 的引用，否则下面的 hook 否决
      // 会直接改写全局 o。
      const merged = Object.assign({}, shared, board.o || {});
      // 全局「无挂扣」是否决项（与首页 blockOptions 同一规则），多组件例外。
      if (shared.hook === false) {
        merged.hook = board.holes && board.holes.length > 1 ? true : false;
      }
      if (!board.art || !board.art.box) return merged;
      // 多组件：同一画布多个挂孔（预览页 image 上/下方各一）；优先于单孔。
      if (board.holes && board.holes.length) {
        const holes = board.holes.map((h) => {
          const off = holeOffsetsFromPoint(board.art.box, h);
          return {
            holeX: off.holeX,
            holeY: off.holeY,
            holeShape: h.shape === "square" ? "square" : "ring",
          };
        });
        // 同步首孔到单孔字段（手动拖拽 / 设置导出链路兼容）。
        return Object.assign({}, merged, {
          holes,
          holeX: holes[0].holeX,
          holeY: holes[0].holeY,
          holeShape: holes[0].holeShape,
          // 多个组件即多个挂孔，必须开启挂件绘制。
          hook: holes.length > 1 ? true : merged.hook,
        });
      }
      if (!board.hole) return merged;
      const offsets = holeOffsetsFromPoint(board.art.box, board.hole);
      return Object.assign({}, merged, {
        holeX: offsets.holeX,
        holeY: offsets.holeY,
        holeShape: board.hole.shape === "square" ? "square" : "ring",
      });
    },
    // Settings page: edit the selected plate's own parameter overrides.
    pickBoardODefaults() {
      const keys = [
        "tint",
        "baseColor",
        "baseOpacity",
        "density",
        "textureScale",
        "textureOpacity",
        "intensity",
        "thickness",
        "shine",
        "border",
        "smooth",
        "hook",
      ];
      const out = {};
      keys.forEach((k) => {
        out[k] = this.o[k];
      });
      return out;
    },
    setEditingBoard(id, o, name) {
      this.boardEditingId = id || null;
      this.boardEditingName = name || "";
      // 未选中板块时也填一份全局参数（导入方案后SettingsPage 会调
      // setEditingBoard(null) 清选中态），否则 boardEditingO 为空对象，
      // 下拉的`boardEditingO.hook === false` 判定落空、回退显示「需要挂扣」，
      // 与实际 o.hook=false 自相矛盾。
      this.boardEditingO = Object.assign(
        {},
        this.pickBoardODefaults(),
        o || {},
      );
      if (!id) {
        this.boardEditingName = "";
      }
    },
    applyBoardEditingO() {
      const engine = this.engine;
      if (this.boardEditingId) {
        const board = (engine.boards || []).find(
          (b) => b.id === this.boardEditingId,
        );
        if (board) {
          board.o = Object.assign({}, this.boardEditingO);
          board.shapeKey = "";
        }
      }
      // 本页没有挂扣选择器，板块参数里的「挂扣」开关就是唯一入口，必须同时
      // 驱动全局 o.hook：createConfig() 的 options.hook 与 assets.hook.selection
      // 都读它，只写 board.o.hook 会让导出 JSON 里 options.hook 仍是 true、
      // selection 为 null（还带着默认图），首页导入 applyLoadConfig 就把挂扣复原。
      // 无选中板块时 boardEditingO 只是全局参数的镜像，不能反向覆盖全局
      // （导入方案后 setEditingBoard(null) 会触发 watcher）。
      if (this.boardEditingId) {
        this.syncGlobalHook(this.boardEditingO && this.boardEditingO.hook);
      }
      this.$emit("board-o-change", {
        id: this.boardEditingId,
        o: Object.assign({}, this.boardEditingO),
      });
      this.scheduleRedraw();
    },
    // 全局挂扣开关与挂扣资产保持自洽：false 时清图（renderProduct 会照旧画
    // assets.hook），true 时恢复内置默认图。
    syncGlobalHook(hook) {
      if (typeof hook !== "boolean" || this.o.hook === hook) return;
      if (hook) {
        this.o.hook = true;
        if (!this.engine.assets.hook) {
          this.engine.assets.hook = this.engine.builtinAssets.hook || null;
        }
      } else {
        this.o.hook = false;
        delete this.engine.assetOverrides.hook;
        this.engine.assets.hook = null;
        this.engine.assetData.hook = null;
        this.engine.assetNames.hook = "";
      }
    },
    // Public API: replace the scene's plates. Each item is
    // { id?, src, hole?, shapeRegion?, transform? }; shapeRegion is a Blob.
    // An empty list resets to the single-plate `src` prop.
    setBoards(list) {
      const engine = this.engine;
      (engine.boardShapeRegionUrls || []).forEach((url) =>
        URL.revokeObjectURL(url),
      );
      engine.boardShapeRegionUrls = [];
      if (!Array.isArray(list) || !list.length) {
        engine.boardConfigs = null;
        this.initialize();
        return;
      }
      engine.boardConfigs = list.map((item, i) => {
        let shapeRegionUrl = null;
        if (item.shapeRegion instanceof Blob) {
          shapeRegionUrl = URL.createObjectURL(item.shapeRegion);
          engine.boardShapeRegionUrls.push(shapeRegionUrl);
        }
        return {
          id: item.id || "b" + i,
          src: item.src,
          hole: item.hole || null,
          // 多组件：同一画布多个挂孔（预览页 image 上/下方各一）。
          holes: Array.isArray(item.holes) ? item.holes : null,
          shapeRegionUrl,
          transform: item.transform || null,
          o: item.o || null,
        };
      });
      this.initialize();
    },
    applyDesignHole(art) {
      const hole = this.engine.designHole;
      if (!hole || !art || !art.box) return;
      const offsets = holeOffsetsFromPoint(art.box, hole);
      this.o.holeX = offsets.holeX;
      this.o.holeY = offsets.holeY;
      this.o.holeShape = hole.shape === "square" ? "square" : "ring";
    },
    setOptions(options) {
      const ranges = {
        border: [3, 25],
        smooth: [0, 12],
        cutLine: [0, 100],
        dpi: [1, 1200],
        stickerSize: [1, 300],
        specSize: [1, 300],
        interfaceGuideWidth: [1, 1200],
        interfaceGuideHeight: [1, 500],
        interfaceTabWidth: [1, 1200],
        interfaceTabHeight: [1, 500],
        density: [10, 100],
        shine: [0, 80],
        intensity: [0, 100],
        thickness: [1, 7],
        baseOpacity: [0, 100],
        textureScale: [20, 300],
        textureOpacity: [0, 100],
        holeX: [-90, 90],
        holeY: [-30, 45],
        productX: [-150, 150],
        productY: [-150, 150],
        productScale: [50, 180],
        productRotation: [-30, 30],
        shadowX: [-30, 30],
        shadowY: [-30, 30],
        shadowBlur: [0, 30],
        shadowOpacity: [0, 70],
      };
      Object.keys(DEFAULTS).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(options || {}, key)) return;
        let value = options[key];
        if (ranges[key]) {
          value = Number(value);
          if (!Number.isFinite(value)) return;
          value = Math.max(ranges[key][0], Math.min(ranges[key][1], value));
        }
        if (
          key === "background" &&
          !["scene", "white", "transparent"].includes(value)
        )
          return;
        if (
          (key === "tint" || key === "baseColor") &&
          !/^#[0-9a-f]{6}$/i.test(value)
        )
          return;
        if (key === "hook" || key === "interfaceTabEnabled")
          value = Boolean(value);
        if (key === "holeShape" && !["ring", "square"].includes(value)) return;
        this.o[key] = value;
      });
    },
    async uploadAsset(name, file) {
      if (!file) return;
      if (!["background", "glitter", "reflection"].includes(name)) return;
      if (!/^image\//.test(file.type)) {
        this.reportError(Error("请选择图片素材。"));
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        this.reportError(Error("素材图片不能超过 15 MB。"));
        return;
      }
      const url = URL.createObjectURL(file);
      try {
        const img = await loadImage(url, "");
        if (img.width * img.height > 25000000)
          throw Error("素材图片过大，请缩小到 2500 万像素以内。");
        this.engine.assetOverrides[name] = img;
        this.engine.assets[name] = img;
        if (name === "background") {
          this.engine.assetData[name] = imageToDataUrl(img, "image/jpeg");
          this.engine.assetNames[name] = file.name;
          this.o.background = "scene";
          this.scenePreset = "custom";
        }
        this.redraw();
        this.$emit("asset-change", { name, file });
      } catch (e) {
        this.reportError(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    createConfig() {
      return {
        version: 4,
        options: Object.assign({}, this.o),
        export: { size: this.exportSize, format: this.exportFormat },
        scenePreset: this.scenePreset,
        assets: {
          background: {
            name: this.engine.assetNames.background || "background.png",
            dataUrl: this.engine.assetData.background || null,
          },
          hook: {
            name: this.engine.assetNames.hook || "hook.png",
            dataUrl: this.engine.assetData.hook || null,
            // 「无挂扣」是显式方案状态：首页 applyLoadConfig 靠 selection==="none"
            // 识别并重放（否则导入后回退成需要挂扣）。本页无挂扣选择器，
            // 由 o.hook 驱动，故 hook=false 时写出 selection="none"。
            selection: this.o.hook ? null : "none",
          },
        },
      };
    },
    // 挂扣为「无」时清掉挂扣图资产：本页没有挂扣选择器，assets.hook 恒为内置
    // 默认图，若不清，导出的 assets.hook.dataUrl 会带回一张图，首页导入侧
    // applyLoadConfig 就会把挂扣复原成「需要挂扣」（与 o.hook=false 矛盾）。
    clearHookAsset() {
      this.o.hook = false;
      delete this.engine.assetOverrides.hook;
      this.engine.assets.hook = null;
      this.engine.assetData.hook = null;
      this.engine.assetNames.hook = "";
    },
    async loadConfig(config) {
      if (!config || typeof config !== "object" || !config.options)
        throw Error("配置文件格式不正确。");
      await this.applyLoadConfig(config);
    },
    async applyLoadConfig(config) {
      // 仅恢复背景资产；挂扣资产随 o.hook 走内置默认（本页无挂扣选择器）。
      const embedded = config.assets && config.assets.background;
      if (embedded && embedded.dataUrl) {
        if (
          typeof embedded.dataUrl !== "string" ||
          embedded.dataUrl.length > 22 * 1024 * 1024 ||
          !/^data:image\/(png|jpeg|webp);base64,/i.test(embedded.dataUrl)
        )
          throw Error("方案中的背景图片无效或过大。");
        const img = await loadImage(embedded.dataUrl, "");
        if (img.width * img.height > 25000000)
          throw Error("方案中的图片像素过大。");
        this.engine.assetOverrides.background = img;
        this.engine.assets.background = img;
        this.engine.assetData.background = embedded.dataUrl;
        this.engine.assetNames.background = String(
          embedded.name || "background.png",
        ).slice(0, 120);
      }
      this.setOptions(config.options);
      if (config.export) {
        if ([1000, 1500, 2000].includes(Number(config.export.size)))
          this.exportSize = Number(config.export.size);
        if (["png", "jpeg"].includes(config.export.format))
          this.exportFormat = config.export.format;
      }
      this.scenePreset = config.scenePreset || "custom";
      this.redraw();
    },
    // Public Promise<Blob> API; does not initiate a download.
    exportImage(options = {}) {
      if (!this.ready || this.busy)
        return Promise.reject(Error("图片尚未加载完成。"));
      const size = Number(options.size || this.exportSize),
        format = options.format || this.exportFormat;
      if (!Number.isInteger(size) || size < 100 || size > 4096)
        return Promise.reject(Error("导出尺寸须为 100–4096 的整数。"));
      if (!["png", "jpeg"].includes(format))
        return Promise.reject(Error("导出格式仅支持 png 或 jpeg。"));
      return new Promise((resolve, reject) => {
        try {
          const c = document.createElement("canvas");
          c.width = c.height = size;
          const opts = Object.assign({}, this.o);
          if (format === "jpeg" && opts.background === "transparent")
            opts.background = "white";
          const items = this.engine.boards.map((board) => {
            const blockO = this.blockOptions(board, opts);
            return {
              art: board.art,
              o: blockO,
              shape: makeShape(board.art, blockO),
              transform: board.transform,
            };
          });
          composeScene(c, this.engine.assets, opts, items);
          c.toBlob(
            (blob) =>
              blob
                ? resolve(blob)
                : reject(Error("导出失败，请检查素材跨域权限。")),
            "image/" + format,
            0.95,
          );
        } catch (e) {
          reject(e);
        }
      });
    },
    async download() {
      try {
        const format = this.exportFormat,
          material = this.o.material;
        const blob = await this.exportImage({ format });
        if (this.engine.destroyed) return;
        const name =
          "亚克力-" + material + "." + (format === "jpeg" ? "jpg" : "png");
        const url = URL.createObjectURL(blob),
          a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.$emit("export", { blob, filename: name });
        this.notice = "图片已导出";
        clearTimeout(this.engine.noticeTimer);
        this.engine.noticeTimer = setTimeout(() => {
          this.notice = "";
        }, 2500);
      } catch (e) {
        if (!this.engine.destroyed) this.reportError(e);
      }
    },
    position(e) {
      const r = this.$refs.preview.getBoundingClientRect(),
        scale = this.o.productScale / 100,
        angle = (-this.o.productRotation * Math.PI) / 180;
      let x = ((e.clientX - r.left) / r.width) * 500 - 250 - this.o.productX,
        y = ((e.clientY - r.top) / r.height) * 500 - 250 - this.o.productY;
      const rx = x * Math.cos(angle) - y * Math.sin(angle),
        ry = x * Math.sin(angle) + y * Math.cos(angle);
      return { x: rx / scale + 250, y: ry / scale + 250 };
    },
    dragStart(e) {
      if (!this.o.hook || !this.ready) return;
      const shapes = this.engine.boards.map((b) => b.shape).filter(Boolean);
      if (!shapes.length) return;
      const p = this.position(e);
      const hit = shapes.some((s) => Math.hypot(p.x - s.hx, p.y - s.hy) < 35);
      if (hit) {
        this.dragging = true;
        e.target.setPointerCapture(e.pointerId);
      }
    },
    dragMove(e) {
      if (!this.dragging) return;
      const p = this.position(e);
      this.o.holeX = Math.max(-90, Math.min(90, Math.round(p.x - 250)));
      this.o.holeY = Math.max(-30, Math.min(45, Math.round(p.y - 240)));
    },
    stopDrag() {
      this.dragging = false;
    },
  },
};
</script>
<template>
  <div class="acrylic-editor">
    <main class="editor-settings">
      <aside>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <section>
          <div class="asset-grid">
            <label
              >背景<input
                type="file"
                accept="image/*"
                @change="
                  uploadAsset('background', $event.target.files[0]);
                  $event.target.value = '';
                "
            /></label>
          </div>
          <details class="advanced" open>
            <summary>
              自定义材质参数{{
                boardEditingName ? " · " + boardEditingName : ""
              }}
            </summary>
            <label v-if="o.material === 'tinted'" class="color-label"
              >板材颜色
              <input type="color" v-model="boardEditingO.tint" /></label
            ><label class="color-label"
              >叠加底色
              <span
                ><input type="color" v-model="boardEditingO.baseColor" />
                {{ boardEditingO.baseOpacity }}%</span
              ></label
            ><input
              type="range"
              min="0"
              max="100"
              v-model.number="boardEditingO.baseOpacity"
            /><label v-if="o.material === 'glitter'" class="range-label"
              >亮片密度 <output>{{ boardEditingO.density }}%</output
              ><input
                type="range"
                min="10"
                max="100"
                v-model.number="boardEditingO.density" /></label
            ><label v-if="o.material === 'glitter'" class="range-label"
              >纹理大小 <output>{{ boardEditingO.textureScale }}%</output
              ><input
                type="range"
                min="20"
                max="300"
                v-model.number="boardEditingO.textureScale" /></label
            ><label v-if="o.material === 'glitter'" class="range-label"
              >纹理透明度 <output>{{ boardEditingO.textureOpacity }}%</output
              ><input
                type="range"
                min="0"
                max="100"
                v-model.number="boardEditingO.textureOpacity" /></label
            ><label class="range-label"
              >材质强度 <output>{{ boardEditingO.intensity }}%</output
              ><input
                type="range"
                min="0"
                max="100"
                v-model.number="boardEditingO.intensity" /></label
            ><label class="range-label"
              >板材厚度 <output>{{ boardEditingO.thickness }} px</output
              ><input
                type="range"
                min="1"
                max="7"
                step="0.5"
                v-model.number="boardEditingO.thickness" /></label
            ><label class="range-label"
              >表面反光 <output>{{ boardEditingO.shine }}%</output
              ><input
                type="range"
                min="0"
                max="80"
                v-model.number="boardEditingO.shine"
            /></label>
          </details>
        </section>
        <section>
          <h2>
            <span>02</span> 轮廓与挂孔{{
              boardEditingName ? " · " + boardEditingName : ""
            }}
          </h2>
          <label class="select-label"
            >挂扣<select
              :value="boardEditingO.hook === false ? 'none' : 'auto'"
              @change="boardEditingO.hook = $event.target.value !== 'none'"
            >
              <option value="auto">需要挂扣</option>
              <option value="none">无需挂扣</option>
            </select></label
          >
          <label class="range-label"
            >透明留边 <output>{{ boardEditingO.border }} px</output
            ><input
              type="range"
              min="3"
              max="25"
              v-model.number="boardEditingO.border" /></label
          ><label class="range-label"
            >轮廓圆滑 <output>{{ boardEditingO.smooth }}</output
            ><input
              type="range"
              min="0"
              max="12"
              v-model.number="boardEditingO.smooth"
          /></label>
        </section>
        <section>
          <h2><span>03</span> 图案工艺</h2>
          <label class="number-setting"
            >刀线(px)
            <input
              v-model.number="o.cutLine"
              type="number"
              min="0"
              step="1"
            /> </label
          ><label class="number-setting"
            >DPI
            <input
              v-model.number="o.dpi"
              type="number"
              min="1"
              step="1"
            /> </label
          ><label class="number-setting"
            >组件大小(px)
            <input
              v-model.number="o.stickerSize"
              type="number"
              min="1"
              step="1"
            /> </label
          ><label class="toggle-label number-setting-toggle"
            >启用底部插口
            <input type="checkbox" v-model="o.interfaceTabEnabled" /> </label
          ><label class="number-setting"
            >插口范围宽(px)
            <input
              v-model.number="o.interfaceGuideWidth"
              type="number"
              min="1"
              step="1"
              :disabled="!o.interfaceTabEnabled"
            /> </label
          ><label class="number-setting"
            >插口范围高(px)
            <input
              v-model.number="o.interfaceGuideHeight"
              type="number"
              min="1"
              step="1"
              :disabled="!o.interfaceTabEnabled"
            /> </label
          ><label class="number-setting"
            >实体插口宽(px)
            <input
              v-model.number="o.interfaceTabWidth"
              type="number"
              min="1"
              step="1"
              :disabled="!o.interfaceTabEnabled"
            /> </label
          ><label class="number-setting"
            >实体插口高(px)
            <input
              v-model.number="o.interfaceTabHeight"
              type="number"
              min="1"
              step="1"
              :disabled="!o.interfaceTabEnabled"
            />
          </label>
        </section>
        <section>
          <h2><span>04</span> 场景与位置</h2>
          <details class="advanced">
            <summary>阴影参数</summary>
            <label class="range-label"
              >阴影透明度 <output>{{ o.shadowOpacity }}%</output
              ><input
                type="range"
                min="0"
                max="70"
                v-model.number="o.shadowOpacity" /></label
            ><label class="range-label"
              >阴影模糊 <output>{{ o.shadowBlur }}</output
              ><input
                type="range"
                min="0"
                max="30"
                v-model.number="o.shadowBlur" /></label
            ><label class="range-label"
              >阴影水平 <output>{{ o.shadowX }}</output
              ><input
                type="range"
                min="-30"
                max="30"
                v-model.number="o.shadowX" /></label
            ><label class="range-label"
              >阴影垂直 <output>{{ o.shadowY }}</output
              ><input
                type="range"
                min="-30"
                max="30"
                v-model.number="o.shadowY"
            /></label>
          </details>
        </section>
        <!-- 页面层注入的侧栏扩展区（如组件图案上传/组件大小设置） -->
        <slot name="aside-extra"></slot>
      </aside>
      <div class="workspace">
        <div class="canvas-wrap">
          <canvas
            ref="preview"
            width="1000"
            height="1000"
            aria-label="亚克力挂件实时效果预览"
            @pointerdown="dragStart"
            @pointermove="dragMove"
            @pointerup="stopDrag"
            @pointercancel="stopDrag"
          ></canvas>
          <!-- Settings-page board layout layer (BoardLayoutEditor) overlays
               the mockup canvas; the design canvas keeps its own slot below. -->
          <slot name="layout-layer"></slot>
          <div v-if="!ready" class="loading">
            {{ error || "正在准备素材…" }}
          </div>
        </div>
      </div>
    </main>
    <div v-if="notice" class="toast" role="status">✓ {{ notice }}</div>
  </div>
</template>
<style scoped src="./style.css"></style>
