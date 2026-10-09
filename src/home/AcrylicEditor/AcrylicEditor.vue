<script>
import {
  loadImage,
  prepareArt,
  makeShape,
  render,
  composeScene,
  holeOffsetsFromPoint,
} from "../../utils/home/render";
import { SPEC_SIZES, SPEC_DEFAULT_SIZE } from "../../utils/home/render";
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
  // 默认规格 = SPEC_SIZES[0]（5cm）。
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
// 材质列表（materials prop 的默认内置项）：项 {id, label, src}。
// src 为空 = 内置程序化材质（id 驱动 render.js 渲染分支 + 缩略图融合类）；
// src 为网络材质纹理图 = 选中后画布直接用该图渲染（material-thumb 缩略图）。
// 数组内容由 materials prop 整体传入，接口接入后覆盖默认项。
const MATERIALS = [
  { id: "clear", label: "透明", src: "" },
  { id: "glitter", label: "彩色亮片", src: "" },
  { id: "frost", label: "磨砂", src: "" },
  { id: "tinted", label: "彩色透明", src: "" },
  { id: "pearl", label: "珠光", src: "" },
];
// 挂扣列表由外部传入（hookOptions prop，接口返回什么渲染什么）：
// 项结构 {id, label, src}，src 为网络图片地址；src 为空表示"无挂扣"。
// hookUrl 仅为画布默认渲染资产（BUILTIN.hook），不参与选择器。
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
    mode: {
      type: String,
      default: "full",
      validator: (value) => ["full", "preview"].includes(value),
    },
    deferArtworkUpload: { type: Boolean, default: false },
    // 预览页用走马灯替换 mockup 预览时置 true：canvas-wrap 仅隐藏不销毁，
    // exportImage / setBoards 渲染链不受影响。
    previewReplace: { type: Boolean, default: false },
    // 挂扣列表（动态）：项 {id, label, src}，src 为网络图片地址；
    // src 为空的项表示"无挂扣"。数组内容不固定，由调用方/接口传入。
    hookOptions: {
      type: Array,
      default: () => [{ id: "1", label: "橙色挂扣", src: "https://youzongplatform.oss-cn-guangzhou.aliyuncs.com/uploads/images/20261006/20261006151116c7a640836.png" }],
    },
    // 材质列表（动态）：项 {id, label, src}。src 为网络材质纹理图——选中后
    // 画布直接用该图渲染；src 为空走内置程序化材质（o.material 驱动）。
    // 默认给内置五项保持 UI 可用，接口接入后整体覆盖。
    materials: {
      type: Array,
      default: () => MATERIALS.map((item) => Object.assign({}, item)),
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
      // 规格表来自 render.js（含 scale 放大倍数），克隆防组件间串改。
      specSizes: SPEC_SIZES.map((item) => Object.assign({}, item)),
      scenePreset: "studio",
      exportSize: 1500,
      exportFormat: "png",
      dragging: false,
      // 网络图片链接导入：输入 URL 后由前端 fetch 转成 File 走统一上传链。
      urlInput: "",
      urlLoading: false,
      // 当前选中挂扣：id 对应 hookOptions 项；"none"=无挂扣、"custom"=上传。
      // null = 尚未选择（画布按 BUILTIN.hook 默认渲染）。
      hookName: "",
      selectedHookId: null,
      // loadConfig 恢复配置期间为 true（suppress 内部触发的 change 通知）。
      loadingConfig: false,
    };
  },
  computed: {
    isPreview() {
      return this.mode === "preview";
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
      assetData: { background: null, hook: null, materialTexture: null },
      assetNames: {
        background: "background.png",
        hook: "hook.png",
        materialTexture: "",
      },
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
      // 全局「无挂扣」是否决项：方案 options.hook=false 时，板块 o.hook 的
      // 残留 true 不能把它翻回来（导入旧方案 / 板块参数先于全局设置时会出现）。
      // 多组件例外：多个挂孔必须画出挂件，否则孔位上没有实体。
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
        if (key === "material" && !this.materials.some((m) => m.id === value))
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
    // 网络图片链接导入：前端 fetch 拉取（需图片服务器允许 CORS），转成
    // File 后复用统一上传链（PNG 校验、deferArtworkUpload 转发等全复用）。
    async uploadFromUrl() {
      const url = this.urlInput.trim();
      if (!url || this.urlLoading) return;
      if (!/^https?:\/\/.+/i.test(url)) {
        this.reportError(Error("请输入以 http(s):// 开头的网络图片链接。"));
        return;
      }
      this.urlLoading = true;
      this.error = "";
      try {
        const resp = await fetch(url, { mode: "cors" });
        if (!resp.ok) {
          throw Error("网络图片下载失败（HTTP " + resp.status + "）。");
        }
        const blob = await resp.blob();
        if (!/^image\//.test(blob.type)) {
          throw Error("链接指向的不是图片文件。");
        }
        const name = (
          url.split("#")[0].split("?")[0].split("/").pop() || "network.png"
        ).slice(0, 80);
        const file = new File([blob], name, {
          type: blob.type || "image/png",
        });
        this.urlInput = "";
        await this.upload(file);
      } catch (e) {
        const msg = e && e.message ? e.message : "网络图片加载失败。";
        this.reportError(
          Error(
            /Failed to fetch|NetworkError|CORS/i.test(msg)
              ? "网络图片加载失败：图片服务器不允许跨域访问（CORS），请使用直链或先下载后上传。"
              : msg,
          ),
        );
      } finally {
        this.urlLoading = false;
      }
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
          this.o.hook = true;
          this.hookName = file.name;
          this.selectedHookId = "custom";
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
          // 回到内置默认挂扣资产；默认钩不在动态 hookOptions 数组中，
          // 选择状态清空（UI 无高亮）。
          this.hookName = "";
          this.selectedHookId = null;
        }
        this.redraw();
      }
    },
    // 挂扣变更通知：loadConfig 恢复期间不发（外层效果图重渲依赖它）。
    notifyHookChange() {
      if (!this.loadingConfig) this.$emit("change", Object.assign({}, this.o));
    },
    // 切换材质：src 有值（外部材质项）→ 直接加载当前材质图片作为画布
    // 纹理渲染（按 id 缓存）；src 为空（内置项）→ 清纹理图，回退
    // o.material 驱动的程序化材质渲染。
    async selectMaterial(m) {
      if (!m || !m.id) return;
      const engine = this.engine;
      if (!m.src) {
        delete this.engine.assetOverrides.materialTexture;
        delete this.engine.assets.materialTexture;
        this.engine.assetData.materialTexture = null;
        this.engine.assetNames.materialTexture = "";
        this.o.material = m.id;
        this.redraw();
        return;
      }
      try {
        engine.materialImgCache = engine.materialImgCache || {};
        let cached = engine.materialImgCache[m.id];
        if (!cached) {
          const img = await loadImage(m.src, this.crossOrigin);
          if (img.width * img.height > 25000000)
            throw Error("材质图片像素过大。");
          let dataUrl = null;
          try {
            dataUrl = imageToDataUrl(img);
          } catch (e) {
            dataUrl = null;
          }
          cached = { img, dataUrl };
          engine.materialImgCache[m.id] = cached;
        }
        const { img, dataUrl } = cached;
        this.engine.assetOverrides.materialTexture = img;
        this.engine.assets.materialTexture = img;
        this.engine.assetData.materialTexture = dataUrl;
        this.engine.assetNames.materialTexture = (m.label || m.id) + ".png";
        this.o.material = m.id;
        this.redraw();
      } catch (e) {
        this.reportError(e);
      }
    },
    // 切换挂扣：直接使用当前挂扣项的图片渲染。src 为空（"无挂扣"项）时
    // 关闭挂扣；有 src 时加载网络图，按 id 缓存（engine 与组件同生命周期），
    // dataUrl 供导出配置跨页恢复（跨域污染时降级为 null，不影响渲染）。
    async selectHook(option) {
      if (!option || !option.id) return;
      const src = option.src || "";
      if (!src) {
        this.o.hook = false;
        this.selectedHookId = option.id;
        this.hookName = option.label || "无挂扣";
        // 清掉挂扣图资产：仅置 o.hook=false 不足以撤销上一方案残留的挂扣图
        // （renderProduct 会照旧画 assets.hook），方案导入/切换必须彻底重置。
        delete this.engine.assetOverrides.hook;
        this.engine.assets.hook = null;
        this.engine.assetData.hook = null;
        this.engine.assetNames.hook = "";
        this.redraw();
        this.notifyHookChange();
        return;
      }
      try {
        const engine = this.engine;
        engine.hookImgCache = engine.hookImgCache || {};
        let cached = engine.hookImgCache[option.id];
        if (!cached) {
          const img = await loadImage(src, this.crossOrigin);
          if (img.width * img.height > 25000000)
            throw Error("挂扣图片像素过大。");
          let dataUrl = null;
          try {
            dataUrl = imageToDataUrl(img);
          } catch (e) {
            dataUrl = null;
          }
          cached = { img, dataUrl };
          engine.hookImgCache[option.id] = cached;
        }
        const { img, dataUrl } = cached;
        this.engine.assetOverrides.hook = img;
        this.engine.assets.hook = img;
        this.engine.assetData.hook = dataUrl;
        this.engine.assetNames.hook = (option.label || option.id) + ".png";
        this.o.hook = true;
        this.selectedHookId = option.id;
        this.hookName = option.label || "";
        this.redraw();
        this.notifyHookChange();
      } catch (e) {
        this.reportError(e);
      }
    },
    hookOptionStyle(option) {
      const src = option && option.src;
      return src
        ? { backgroundImage: 'url("' + String(src).replace(/"/g, "") + '")' }
        : {};
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
            builtin: !!this.hookOptions.find(
              (item) => item.id === this.selectedHookId,
            ),
            selection: this.selectedHookId,
          },
          // 外部材质纹理图（仅当当前材质为图片驱动时有值；内置程序化
          // 材质为 null，恢复方回退程序化渲染）。
          materialTexture: {
            name: this.engine.assetNames.materialTexture || null,
            dataUrl: this.engine.assetData.materialTexture || null,
          },
        },
      };
    },
    async loadConfig(config) {
      if (!config || typeof config !== "object" || !config.options)
        throw Error("配置文件格式不正确。");
      // 加载期 suppress selectHook 的 change 通知：重放挂扣选择属于
      // 配置恢复而非用户操作，避免触发外层的方案重渲反馈环。
      this.loadingConfig = true;
      try {
        await this.applyLoadConfig(config);
      } finally {
        this.loadingConfig = false;
      }
    },
    async applyLoadConfig(config) {
      for (const name of ["background", "hook"]) {
        const embedded = config.assets && config.assets[name];
        if (name === "hook" && embedded && embedded.selection === "none") {
          // 「无挂扣」是显式方案状态，必须完整重放：选「无挂扣」只改 o.hook
          // 和 selectedHookId，不会清 engine 里的挂扣图，导入时若不重置，
          // 上一方案的挂扣图会残留并被画到效果图上。
          this.selectHook({ id: "none", label: "无挂扣", src: "" });
          continue;
        }
        if (name === "hook" && embedded && embedded.builtin) {
          const selected = this.hookOptions.find(
            (item) => item.id === embedded.selection,
          );
          if (selected) await this.selectHook(selected);
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
          this.hookName = this.engine.assetNames[name];
          // 自定义上传图不在动态数组中，选择态固定 custom。
          this.selectedHookId = this.hookOptions.find(
            (item) => item.id === embedded.selection,
          )
            ? embedded.selection
            : "custom";
        }
      }
      // 材质纹理图：随方案恢复（图片驱动材质）；无嵌入则清空，
      // 回退 o.material 驱动的程序化材质渲染。
      const mt = config.assets && config.assets.materialTexture;
      if (mt && mt.dataUrl) {
        if (
          typeof mt.dataUrl !== "string" ||
          mt.dataUrl.length > 22 * 1024 * 1024 ||
          !/^data:image\/(png|jpeg|webp);base64,/i.test(mt.dataUrl)
        )
          throw Error("方案中的材质图片无效或过大。");
        const img = await loadImage(mt.dataUrl, "");
        if (img.width * img.height > 25000000)
          throw Error("方案中的图片像素过大。");
        this.engine.assetOverrides.materialTexture = img;
        this.engine.assets.materialTexture = img;
        this.engine.assetData.materialTexture = mt.dataUrl;
        this.engine.assetNames.materialTexture = String(
          mt.name || "material.png",
        ).slice(0, 120);
      } else {
        delete this.engine.assetOverrides.materialTexture;
        delete this.engine.assets.materialTexture;
        this.engine.assetData.materialTexture = null;
        this.engine.assetNames.materialTexture = "";
      }
      this.setOptions(config.options);
      if (!this.o.hook) {
        this.selectedHookId = "none";
        this.hookName = "无挂扣";
      }
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
    <main
      :class="[
        'editor-' + mode,
        { 'has-replace': mode === 'preview' && previewReplace },
      ]"
    >
      <aside>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <section>
          <h2>导入图案</h2>
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
            <span class="upload-icon">＋</span><strong>选择透明图案</strong
            ><small>点击或拖入 PNG · 最大 20 MB</small>
          </button>
          <div class="file-info">
            <span class="file-name">{{ filename }}</span
            ><span>{{ dimensions }}</span>
          </div>
          <div class="url-import">
            <input
              v-model.trim="urlInput"
              class="url-import-input"
              type="text"
              placeholder="或粘贴网络图片链接（http/https）"
              @keyup.enter="uploadFromUrl"
            /><button
              class="url-import-button"
              :disabled="urlLoading || !urlInput"
              @click="uploadFromUrl"
            >
              {{ urlLoading ? "加载中…" : "加载链接" }}
            </button>
          </div>
        </section>
        <section>
          <h2>规格</h2>
          <div class="spec-options">
            <button
              v-for="size in specSizes"
              :key="size.value"
              :class="['spec-option', { active: o.specSize === size.value }]"
              :aria-pressed="o.specSize === size.value"
              @click="o.specSize = size.value"
            >
              {{ size.label }}
            </button>
          </div>
        </section>
        <section>
          <h2>板材材质</h2>
          <div class="materials">
            <button
              v-for="m in materials"
              :key="m.id"
              :class="['material', { active: o.material === m.id }]"
              :aria-pressed="o.material === m.id"
              @click="selectMaterial(m)"
            >
              <i
                :class="m.src ? 'material-thumb' : m.id"
                :style="
                  m.src ? { backgroundImage: 'url(' + m.src + ')' } : null
                "
              ></i
              ><span>{{ m.label }}</span
              ><b v-if="o.material === m.id">✓</b>
            </button>
          </div>
        </section>
        <section v-if="isPreview">
          <h2>挂扣选择</h2>
          <div class="hook-options">
            <button
              key="none"
              :class="{ active: selectedHookId === 'none' }"
              @click="selectHook({ id: 'none', label: '无挂扣', src: '' })"
            >
              <i class="hook-none">×</i><span>无挂扣</span>
            </button>
            <button
              v-for="option in hookOptions"
              :key="option.id"
              :class="{ active: selectedHookId === option.id }"
              @click="selectHook(option)"
            >
              <i
                :class="option.src ? 'hook-preset' : 'hook-none'"
                :style="hookOptionStyle(option)"
                >{{ option.src ? "" : "×" }}</i
              ><span>{{ option.label }}</span>
            </button>
            <!-- <label :class="{ active: selectedHookId === 'custom' }"
              ><i class="hook-upload">＋</i
              ><span>{{
                selectedHookId === "custom" ? hookName : "自定义上传"
              }}</span
              ><input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                @change="
                  uploadAsset('hook', $event.target.files[0]);
                  $event.target.value = '';
                "
            /></label> -->
          </div>
        </section>
      </aside>
      <section v-if="isPreview" class="design-canvas">
        <slot name="design-canvas"></slot>
      </section>
      <div :class="['workspace', { vacant: previewReplace }]">
        <div
          :class="['canvas-wrap', { 'canvas-wrap--replaced': previewReplace }]"
        >
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
