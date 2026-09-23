<script>
import {
  loadImage,
  prepareArt,
  makeShape,
  render,
  composeScene,
  holeOffsetsFromPoint,
} from "./render";
import backgroundUrl from "./assets/background.png";
import hookUrl from "./assets/hook.png";
import glitterUrl from "./assets/glitter.png";
import reflectionUrl from "./assets/reflection.png";
import redHookUrl from "./assets/redHook.png";
import blueHookUrl from "./assets/blueHook.png";
import greenHookUrl from "./assets/greenHook.png";
import purpleHookUrl from "./assets/purpleHook.png";

const DEFAULTS = {
  border: 16,
  smooth: 5,
  cutLine: 4,
  dpi: 300,
  stickerSize: 50,
  specSize: 10,
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
const MATERIALS = [
  ["clear", "透明", "clear"],
  ["glitter", "彩色亮片", "glitter"],
  ["frost", "磨砂", "frost"],
  ["tinted", "彩色透明", "tinted"],
  ["pearl", "珠光", "pearl"],
];
const DEFAULT_HOOK_OPTIONS = [
  { id: "orange", label: "橙色挂扣", type: "builtin", src: hookUrl },
  { id: "blue", label: "蓝色挂扣", type: "builtin", src: blueHookUrl },
  { id: "green", label: "绿色挂扣", type: "builtin", src: greenHookUrl },
  { id: "purple", label: "紫色挂扣", type: "builtin", src: purpleHookUrl },
  { id: "red", label: "红色挂扣", type: "builtin", src: redHookUrl },
  { id: "none", label: "无挂扣", type: "none" },
  { id: "custom", label: "自定义上传", type: "upload" },
];
const BUILTIN_HOOK_SOURCES = {
  orange: hookUrl,
  blue: blueHookUrl,
  green: greenHookUrl,
  purple: purpleHookUrl,
  red: redHookUrl,
};
const SCENES = {
  studio: {
    label: "窗帘桌面",
    options: {
      background: "scene",
      productX: 0,
      productY: 0,
      productScale: 100,
      productRotation: 0,
      shadowX: -7,
      shadowY: 8,
      shadowBlur: 5,
      shadowOpacity: 20,
    },
  },
  closeup: {
    label: "近景展示",
    options: {
      background: "scene",
      productX: 0,
      productY: 34,
      productScale: 122,
      productRotation: -2,
      shadowX: -5,
      shadowY: 9,
      shadowBlur: 7,
      shadowOpacity: 24,
    },
  },
  white: {
    label: "白底商品图",
    options: {
      background: "white",
      productX: 0,
      productY: 8,
      productScale: 108,
      productRotation: 0,
      shadowX: 2,
      shadowY: 9,
      shadowBlur: 9,
      shadowOpacity: 16,
    },
  },
  transparent: {
    label: "透明底",
    options: {
      background: "transparent",
      productX: 0,
      productY: 0,
      productScale: 100,
      productRotation: 0,
    },
  },
};
const BUILTIN = {
  background: backgroundUrl,
  hook: hookUrl,
  glitter: glitterUrl,
  reflection: reflectionUrl,
  redHook: redHookUrl,
  blueHook: blueHookUrl,
  greenHook: greenHookUrl,
  purpleHook: purpleHookUrl,
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
    mode: {
      type: String,
      default: "full",
      validator: (value) => ["full", "preview", "settings"].includes(value),
    },
    showHeader: { type: Boolean, default: true },
    deferArtworkUpload: { type: Boolean, default: false },
    hookOptions: {
      type: Array,
      default: () =>
        DEFAULT_HOOK_OPTIONS.map((item) => Object.assign({}, item)),
    },
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
      materials: MATERIALS,
      scenes: SCENES,
      specSizes: [5, 10, 20],
      scenePreset: "studio",
      detail: false,
      exportSize: 1500,
      exportFormat: "png",
      dragging: false,
      largeViewUrl: null,
      presetName: "",
      customPresets: [],
      hookName: "橙色挂扣",
      selectedHookId: "orange",
      // True while the current artwork carries a design-canvas-derived hole
      // position; the settings sliders are then replaced by a hint.
      holeFromDesign: false,
      // Per-plate parameter editing (settings page): the currently selected
      // board and its responsive parameter override object.
      boardEditingId: null,
      boardEditingName: "",
      boardEditingO: {},
    };
  },
  computed: {
    materialLabel() {
      const m = this.materials.find((m) => m[0] === this.o.material);
      return m ? m[1] : "";
    },
    isPreview() {
      return this.mode === "preview";
    },
    isSettings() {
      return this.mode === "settings";
    },
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
    const builtin = this.hookOptions.find((item) => item.type === "builtin");
    if (builtin) {
      this.selectedHookId = builtin.id;
      this.hookName = builtin.label;
    }
    this.setOptions(this.initialOptions);
    try {
      this.customPresets = JSON.parse(
        localStorage.getItem("acrylic-material-presets") || "[]",
      );
    } catch (e) {
      this.customPresets = [];
    }
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
    this.closeLargeView();
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
      const merged = board.o ? Object.assign({}, shared, board.o) : shared;
      if (!board.hole || !board.art || !board.art.box) return merged;
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
      this.boardEditingO = id
        ? Object.assign({}, o || this.pickBoardODefaults())
        : {};
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
      this.$emit("board-o-change", {
        id: this.boardEditingId,
        o: Object.assign({}, this.boardEditingO),
      });
      this.scheduleRedraw();
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
          shapeRegionUrl,
          transform: item.transform || null,
          o: item.o || null,
        };
      });
      this.initialize();
    },
    // Receives the component position picked on the design canvas, expressed
    // in the pixel space of the artwork blob that is about to be applied.
    setDesignHole(hole) {
      const valid =
        hole &&
        Number.isFinite(Number(hole.x)) &&
        Number.isFinite(Number(hole.y));
      this.engine.designHole = valid
        ? {
            x: Number(hole.x),
            y: Number(hole.y),
            shape: hole.shape === "square" ? "square" : "ring",
          }
        : null;
      this.holeFromDesign = valid;
    },
    // Receives the merged component area captured on the design canvas. It
    // only extends the product silhouette (the shape mask), so the acrylic
    // material stays translucent over the added ear and the punched hole
    // remains see-through. The printable artwork layer is never altered.
    setDesignShapeRegion(blob) {
      const engine = this.engine;
      if (engine.designShapeRegionUrl) {
        URL.revokeObjectURL(engine.designShapeRegionUrl);
      }
      engine.designShapeRegionUrl =
        blob instanceof Blob ? URL.createObjectURL(blob) : null;
      engine.shapeKey = "";
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
        if (key === "material" && !MATERIALS.some((m) => m[0] === value))
          return;
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
    reset() {
      this.setOptions(DEFAULTS);
    },
    async upload(file) {
      if (!file || this.busy || !this.ready) return;
      this.error = "";
      if (file.type !== "image/png") {
        this.reportError(Error("请选择透明背景 PNG 图片。"));
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        this.reportError(Error("请选择小于 20 MB 的图片。"));
        return;
      }
      // In the combined workspace, the left upload feeds the design canvas.
      // The effect preview is only replaced after the user applies that design.
      if (this.deferArtworkUpload) {
        this.filename = file.name;
        this.dimensions = "";
        this.$emit("upload", file);
        if (this.$refs.fileInput) this.$refs.fileInput.value = "";
        return;
      }
      const engine = this.engine,
        id = ++engine.loadId,
        url = URL.createObjectURL(file);
      this.busy = true;
      try {
        const img = await loadImage(url);
        if (img.width * img.height > 25000000)
          throw Error("图片过大，请缩小到 2500 万像素以内。");
        const candidate = prepareArt(img);
        if (engine.destroyed || id !== engine.loadId) return;
        engine.boards = [
          {
            id: "b0",
            hole: null,
            shapeRegionUrl: null,
            transform: null,
            art: candidate,
            artVersion: engine.artVersion + 1,
            shapeKey: "",
            shape: null,
            width: img.width,
            height: img.height,
          },
        ];
        engine.artVersion++;
        engine.boardConfigs = null;
        // A directly uploaded PNG has no design-canvas component; fall back
        // to the manual hole settings.
        engine.designHole = null;
        this.holeFromDesign = false;
        this.setDesignShapeRegion(null);
        this.filename = file.name;
        this.dimensions = img.width + " × " + img.height;
        this.o.holeX = 0;
        this.o.holeY = 0;
        this.redraw();
        this.$emit("upload", file);
      } catch (e) {
        if (!engine.destroyed && id === engine.loadId) this.reportError(e);
      } finally {
        URL.revokeObjectURL(url);
        if (!engine.destroyed && id === engine.loadId) {
          this.busy = false;
          if (this.$refs.fileInput) this.$refs.fileInput.value = "";
        }
      }
    },
    applyScene(name) {
      if (SCENES[name]) {
        this.scenePreset = name;
        this.setOptions(SCENES[name].options);
      }
    },
    saveMaterialPreset() {
      const name = this.presetName.trim();
      if (!name) {
        this.reportError(Error("请先填写材质名称。"));
        return;
      }
      const keys = [
        "material",
        "density",
        "shine",
        "intensity",
        "thickness",
        "tint",
        "baseColor",
        "baseOpacity",
        "textureScale",
        "textureOpacity",
      ];
      const item = { name, options: {} };
      keys.forEach((k) => {
        item.options[k] = k === "material" ? this.o[k] : this.boardEditingO[k];
      });
      const index = this.customPresets.findIndex((p) => p.name === name);
      if (index >= 0) this.customPresets.splice(index, 1, item);
      else this.customPresets.push(item);
      this.customPresets = this.customPresets.slice();
      localStorage.setItem(
        "acrylic-material-presets",
        JSON.stringify(this.customPresets),
      );
      this.presetName = "";
      this.$emit("preset-save", item);
    },
    applyMaterialPreset(item) {
      if (!item || !item.options) return;
      // Material type stays global; the rest land on the selected plate.
      const rest = Object.assign({}, item.options);
      if (rest.material) {
        this.setOptions({ material: rest.material });
        delete rest.material;
      }
      Object.keys(rest).forEach((k) => {
        if (rest[k] !== undefined) this.$set(this.boardEditingO, k, rest[k]);
      });
    },
    removeMaterialPreset(index) {
      this.customPresets.splice(index, 1);
      this.customPresets = this.customPresets.slice();
      localStorage.setItem(
        "acrylic-material-presets",
        JSON.stringify(this.customPresets),
      );
    },
    async uploadAsset(name, file) {
      if (!file) return;
      if (!["background", "hook", "glitter", "reflection"].includes(name))
        return;
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
        if (name === "background" || name === "hook") {
          this.engine.assetData[name] = imageToDataUrl(
            img,
            name === "background" ? "image/jpeg" : "image/png",
          );
          this.engine.assetNames[name] = file.name;
        }
        if (name === "background") {
          this.o.background = "scene";
          this.scenePreset = "custom";
        }
        if (name === "hook") {
          const upload = this.hookOptions.find(
            (item) => item.type === "upload",
          );
          this.o.hook = true;
          this.hookName = file.name;
          this.selectedHookId = upload ? upload.id : "custom";
        }
        this.redraw();
        this.$emit("asset-change", { name, file });
      } catch (e) {
        this.reportError(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    resetAsset(name) {
      if (this.engine.builtinAssets[name]) {
        delete this.engine.assetOverrides[name];
        this.engine.assets[name] = this.engine.builtinAssets[name];
        if (name === "background" || name === "hook") {
          try {
            this.engine.assetData[name] = imageToDataUrl(
              this.engine.builtinAssets[name],
              name === "background" ? "image/jpeg" : "image/png",
            );
            this.engine.assetNames[name] = name + ".png";
          } catch (e) {
            this.engine.assetData[name] = null;
          }
        }
        if (name === "hook") {
          const builtin =
            this.hookOptions.find((item) => item.type === "builtin") ||
            DEFAULT_HOOK_OPTIONS[0];
          this.hookName = builtin.label;
          this.selectedHookId = builtin.id;
        }
        this.redraw();
      }
    },
    resetAllAssets() {
      ["background", "hook", "glitter", "reflection"].forEach((name) =>
        this.resetAsset(name),
      );
    },
    async selectHook(option) {
      if (!option || !option.id) return;
      if (option.type === "none") {
        this.o.hook = false;
        this.selectedHookId = option.id;
        this.hookName = option.label;
        return;
      }
      if (option.type === "upload") return;
      const src = this.hookOptionSrc(option);
      if (!src) {
        this.o.hook = true;
        this.resetAsset("hook");
        this.selectedHookId = option.id;
        this.hookName = option.label;
        return;
      }
      try {
        const img = await loadImage(src, this.crossOrigin);
        if (img.width * img.height > 25000000)
          throw Error("挂扣图片像素过大。");
        this.engine.assetOverrides.hook = img;
        this.engine.assets.hook = img;
        this.engine.assetData.hook = imageToDataUrl(img);
        this.engine.assetNames.hook = option.label + ".png";
        this.o.hook = true;
        this.selectedHookId = option.id;
        this.hookName = option.label;
        this.redraw();
      } catch (e) {
        this.reportError(e);
      }
    },
    hookOptionStyle(option) {
      const src = option.preview || this.hookOptionSrc(option);
      return src
        ? { backgroundImage: 'url("' + String(src).replace(/"/g, "") + '")' }
        : {};
    },
    hookOptionSrc(option) {
      if (!option) return "";
      // Every builtin option is immediately usable. A caller may override the
      // bundled source with `src`; otherwise resolve its id from local assets.
      if (option.type === "builtin")
        return option.src || BUILTIN_HOOK_SOURCES[option.id] || hookUrl;
      return option.src || "";
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
            builtin:
              (
                this.hookOptions.find(
                  (item) => item.id === this.selectedHookId,
                ) || {}
              ).type === "builtin",
            selection: this.selectedHookId,
          },
        },
      };
    },
    async loadConfig(config) {
      if (!config || typeof config !== "object" || !config.options)
        throw Error("配置文件格式不正确。");
      for (const name of ["background", "hook"]) {
        const embedded = config.assets && config.assets[name];
        if (name === "hook" && embedded && embedded.builtin) {
          const selected = this.hookOptions.find(
            (item) => item.id === embedded.selection,
          );
          if (selected && selected.type === "builtin")
            await this.selectHook(selected);
          else this.resetAsset("hook");
          continue;
        }
        if (!embedded || !embedded.dataUrl) continue;
        if (
          typeof embedded.dataUrl !== "string" ||
          embedded.dataUrl.length > 22 * 1024 * 1024 ||
          !/^data:image\/(png|jpeg|webp);base64,/i.test(embedded.dataUrl)
        )
          throw Error(
            "方案中的" +
              (name === "background" ? "背景" : "挂扣") +
              "图片无效或过大。",
          );
        const img = await loadImage(embedded.dataUrl, "");
        if (img.width * img.height > 25000000)
          throw Error("方案中的图片像素过大。");
        this.engine.assetOverrides[name] = img;
        this.engine.assets[name] = img;
        this.engine.assetData[name] = embedded.dataUrl;
        this.engine.assetNames[name] = String(
          embedded.name || name + ".png",
        ).slice(0, 120);
        if (name === "hook") {
          const selected = this.hookOptions.find(
              (item) => item.id === embedded.selection,
            ),
            upload = this.hookOptions.find((item) => item.type === "upload");
          this.hookName = this.engine.assetNames[name];
          this.selectedHookId = selected
            ? selected.id
            : upload
            ? upload.id
            : "custom";
        }
      }
      this.setOptions(config.options);
      if (!this.o.hook) {
        const none = this.hookOptions.find((item) => item.type === "none");
        if (none) {
          this.selectedHookId = none.id;
          this.hookName = none.label;
        }
      }
      if (config.export) {
        if ([1000, 1500, 2000].includes(Number(config.export.size)))
          this.exportSize = Number(config.export.size);
        if (["png", "jpeg"].includes(config.export.format))
          this.exportFormat = config.export.format;
      }
      this.scenePreset = config.scenePreset || "custom";
      this.redraw();
      this.$emit("config-load", this.createConfig());
    },
    exportConfig() {
      const blob = new Blob([JSON.stringify(this.createConfig(), null, 2)], {
          type: "application/json",
        }),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "acrylic-design.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    async importConfig(file) {
      if (!file) return;
      try {
        if (file.size > 24 * 1024 * 1024)
          throw Error("方案文件不能超过 24 MB。");
        await this.loadConfig(JSON.parse(await file.text()));
      } catch (e) {
        this.reportError(e);
      } finally {
        if (this.$refs.configInput) this.$refs.configInput.value = "";
      }
    },
    // Renders the current preview at high resolution and shows it in a
    // lightbox overlay, so the small live panel can be inspected closely.
    async openLargeView() {
      if (!this.ready || this.busy) return;
      try {
        const blob = await this.exportImage({ size: 1500, format: "png" });
        if (this.engine.destroyed) return;
        this.closeLargeView();
        this.largeViewUrl = URL.createObjectURL(blob);
      } catch (e) {
        this.reportError(e);
      }
    },
    closeLargeView() {
      if (this.largeViewUrl) URL.revokeObjectURL(this.largeViewUrl);
      this.largeViewUrl = null;
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
  <div :class="['acrylic-editor', { 'lightbox-open': largeViewUrl }]">
    <header v-if="showHeader">
      <div class="brand">
        <span class="logo">透</span
        ><span>透物 <small>ACRYLIC STUDIO</small></span>
      </div>
      <span class="header-note">亚克力挂件 · 二维效果编辑器</span
      ><button class="primary" :disabled="!ready || busy" @click="download">
        ↓ 导出效果图
      </button>
    </header>
    <main :class="'editor-' + mode">
      <aside>
        <div class="panel-title">
          <h1>{{ isSettings ? "效果参数" : "快速预览" }}</h1>
          <button class="text-button" @click="reset">重置参数</button>
        </div>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <section v-if="!isSettings">
          <h2><span>01</span> 导入与图案</h2>
          <input
            ref="fileInput"
            class="hidden"
            type="file"
            accept="image/png"
            @change="upload($event.target.files[0])"
          /><button
            class="upload"
            @click="$refs.fileInput.click()"
            @dragover.prevent
            @drop.prevent="upload($event.dataTransfer.files[0])"
          >
            <span class="upload-icon">＋</span
            ><strong>{{ busy ? "正在处理…" : "选择透明图案" }}</strong
            ><small>点击或拖入 PNG · 最大 20 MB</small>
          </button>
          <div class="file-info">
            <span class="file-name">{{ filename }}</span
            ><span>{{ dimensions }}</span>
          </div>
          <!-- <button
            v-if="isPreview"
            class="json-import"
            @click="$refs.configInput.click()"
          >
            导入 JSON 方案</button
          > -->
          <input
            v-if="isPreview"
            ref="configInput"
            class="hidden"
            type="file"
            accept="application/json,.json"
            @change="importConfig($event.target.files[0])"
          />
        </section>
        <section v-if="!isSettings">
          <h2><span>02</span> 规格</h2>
          <div class="spec-options">
            <button
              v-for="size in specSizes"
              :key="size"
              :class="['spec-option', { active: o.specSize === size }]"
              :aria-pressed="o.specSize === size"
              @click="o.specSize = size"
            >
              {{ size }}cm
            </button>
          </div>
        </section>
        <section>
          <h2 v-if="!isSettings">
            <span>{{ isSettings ? "01" : "03" }}</span> 板材材质
          </h2>
          <div class="materials" v-if="!isSettings">
            <button
              v-for="m in materials"
              :key="m[0]"
              :class="['material', { active: o.material === m[0] }]"
              :aria-pressed="o.material === m[0]"
              @click="o.material = m[0]"
            >
              <i :class="m[2]"></i><span>{{ m[1] }}</span
              ><b v-if="o.material === m[0]">✓</b>
            </button>
          </div>
          <template v-if="!isPreview">
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
            <!-- <div class="preset-save">
              <input
                v-model.trim="presetName"
                maxlength="24"
                placeholder="材质预设名称"
              /><button @click="saveMaterialPreset">保存材质</button>
            </div> -->
            <div v-if="customPresets.length" class="preset-list">
              <span v-for="(preset, index) in customPresets" :key="preset.name"
                ><button @click="applyMaterialPreset(preset)">
                  {{ preset.name }}</button
                ><button title="删除预设" @click="removeMaterialPreset(index)">
                  ×
                </button></span
              >
            </div>
          </template>
        </section>
        <section v-if="isPreview">
          <h2><span>04</span> 挂扣选择</h2>
          <div class="hook-options">
            <template v-for="option in hookOptions"
              ><label
                v-if="option.type === 'upload'"
                :key="option.id"
                :class="{ active: selectedHookId === option.id }"
                ><i class="hook-upload">＋</i
                ><span>{{
                  selectedHookId === option.id ? hookName : option.label
                }}</span
                ><input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  @change="
                    uploadAsset('hook', $event.target.files[0]);
                    $event.target.value = '';
                  " /></label
              ><button
                v-else
                :key="option.id"
                :class="{ active: selectedHookId === option.id }"
                @click="selectHook(option)"
              >
                <i v-if="option.type === 'none'" class="hook-none">×</i
                ><i
                  v-else
                  :class="option.src ? 'hook-preset' : 'hook-thumb'"
                  :style="hookOptionStyle(option)"
                ></i
                ><span>{{ option.label }}</span>
              </button></template
            >
          </div>
          <!-- <p class="hint">
            挂扣列表由 hook-options 数组生成；自定义挂扣建议使用透明背景
            PNG，并会随 JSON 一起保存。
          </p> -->
        </section>
        <template v-if="!isPreview">
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
            <!-- <template v-if="o.hook">
              <template
                ><label class="range-label"
                  >挂孔水平位置 <output>{{ o.holeX }}</output
                  ><input
                    type="range"
                    min="-90"
                    max="90"
                    v-model.number="o.holeX" /></label
                ><label class="range-label"
                  >挂孔垂直位置 <output>{{ o.holeY }}</output
                  ><input
                    type="range"
                    min="-30"
                    max="45"
                    v-model.number="o.holeY"
                /></label>
              </template>
              <p v-if="holeFromDesign" class="hint">
                挂孔位置已按设计画布中组件的位置自动确定；在预览中拖动连接环可微调。
              </p>
              <p class="hint">
                当前挂扣：{{ hookName }}。也可在预览中拖动连接环调整孔位。
              </p>
            </template>
            <p v-else class="hint">
              首页当前选择了“无挂扣”；需要挂孔时请返回首页选择挂扣。
            </p> -->
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
          <section>
            <!-- <h2><span>05</span> 素材与方案</h2>
            <p class="hint">
              导出的 JSON 会嵌入当前背景与挂扣，首页重新导入时会一起恢复。
            </p> -->
            <!-- <div class="asset-grid">
              <label
                >背景<input
                  type="file"
                  accept="image/*"
                  @change="
                    uploadAsset('background', $event.target.files[0]);
                    $event.target.value = '';
                  "
              /></label>
              <label
                >亮片纹理<input
                  type="file"
                  accept="image/*"
                  @change="
                    uploadAsset('glitter', $event.target.files[0]);
                    $event.target.value = '';
                  "
              /></label>
              <label
                >反光纹理<input
                  type="file"
                  accept="image/*"
                  @change="
                    uploadAsset('reflection', $event.target.files[0]);
                    $event.target.value = '';
                  "
              /></label>
            </div> -->
            <!-- <button class="reset-assets" @click="resetAllAssets">
              恢复内置素材
            </button> -->
            <!-- <div class="config-actions">
              <button @click="exportConfig">导出完整方案</button
              ><button @click="$refs.configInput.click()">导入方案</button
              ><input
                ref="configInput"
                class="hidden"
                type="file"
                accept="application/json,.json"
                @change="importConfig($event.target.files[0])"
              />
            </div> -->
          </section>
        </template>
      </aside>
      <section v-if="isPreview" class="design-canvas">
        <slot name="design-canvas"></slot>
      </section>
      <div class="workspace">
        <!-- <div class="workspace-top">
          <div>
            <span class="eyebrow">LIVE PREVIEW</span>
            <h2>你的设计，正在成形</h2>
          </div>
          <button
            class="preview-badge detail-toggle"
            :aria-pressed="detail"
            @click="detail = !detail"
          >
            {{ detail ? "查看整体" : "放大材质细节" }}
          </button>
        </div> -->
        <div :class="['canvas-wrap', { detail }]">
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
          <button
            v-if="ready"
            class="view-large-action"
            :disabled="busy"
            @click="openLargeView"
          >
            查看大图
          </button>
        </div>
        <!-- <div class="preview-footer">
          <span>✧ {{ materialLabel }}</span
          ><span>原图保留 · 自动异形轮廓</span>
        </div> -->
        <!-- <div class="bottom-settings">
          <label
            >场景背景<select
              v-model="o.background"
              @change="scenePreset = 'custom'"
            >
              <option value="scene">窗帘与木桌</option>
              <option value="white">简洁白底</option>
              <option value="transparent">透明背景</option>
            </select></label
          ><label
            >导出尺寸<select v-model="exportSize">
              <option :value="1000">1000 × 1000</option>
              <option :value="1500">1500 × 1500</option>
              <option :value="2000">2000 × 2000</option>
            </select></label
          ><label
            >文件格式<select v-model="exportFormat">
              <option value="png">PNG</option>
              <option value="jpeg">JPG</option>
            </select></label
          >
        </div> -->
        <!-- <p class="export-note">
          图片仅在本机浏览器处理。导出清晰度受原图分辨率限制。{{
            exportFormat === "jpeg" && o.background === "transparent"
              ? "JPG 不支持透明背景，将导出白底。"
              : ""
          }}
        </p> -->
      </div>
    </main>
    <div
      v-if="largeViewUrl"
      class="large-view-overlay"
      role="dialog"
      aria-label="效果图大图"
      @click="closeLargeView"
    >
      <button
        class="large-view-close"
        type="button"
        aria-label="关闭大图"
        @click.stop="closeLargeView"
      >
        ×
      </button>
      <img :src="largeViewUrl" alt="亚克力挂件效果图大图" @click.stop />
    </div>
    <div v-if="notice" class="toast" role="status">✓ {{ notice }}</div>
  </div>
</template>
<style scoped src="./style.css"></style>
