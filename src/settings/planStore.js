import Vue from "vue";

// 首页 / 设置页共享的方案状态。Vue.observable 保证跨页面组件的响应式。
// 板块默认锚点（顶部中心）：x 水平居中，y = 250 − 框高 220/2，垂直居中。
export const BOARD_DEFAULT_X = 250;
export const BOARD_DEFAULT_Y = 140;
// 旧版默认锚点（y=255 使占位框偏下方），恢复缓存时迁移到居中位置。
const LEGACY_DEFAULT_Y = 255;

// 未手动挪过位的旧默认板块归位到垂直居中（幂等）。
export function migrateLegacyBoard(board) {
  if (
    board &&
    Number(board.x) === BOARD_DEFAULT_X &&
    Number(board.y) === LEGACY_DEFAULT_Y
  ) {
    board.y = BOARD_DEFAULT_Y;
  }
  return board;
}

export const planStore = Vue.observable({
  // 设置页布局编辑器产出 / 首页导入的板块布局（JSON boards）。
  planBoards: [],
  // 未导入方案时，布局编辑器的默认单块占位。
  layoutDefault: [
    {
      id: "b1",
      tag: "A",
      name: "板块1",
      x: BOARD_DEFAULT_X,
      y: BOARD_DEFAULT_Y,
      scale: 1,
      rotation: 0,
      z: 0,
      // 默认规格 = SPEC_SIZES[0]（5cm）。字面量而非常量引用：本对象在
      // 模块初始化时求值，SPEC_SIZES 定义在其后（避免 TDZ）。
      specSize: 5,
    },
  ],
  // 设置页当前选中、正在编辑参数的板块。
  settingsBoardId: null,
  // 两页编辑器共享的全局效果参数（材质类型/阴影/工艺等整包同步）。
  sharedOptions: null,
  // 多效果图：导入的多份方案 JSON。每项
  // { id, name, config, imageUrl, imageBlob, generatedAt }；
  // config.boards 内板块带 tag（标识），跨方案按标识匹配板块。
  plans: [],
  // 当前激活（主画布实时预览）的方案 id。
  activePlanId: null,
  // 设计完成状态：tag -> { blob, hole, shapeRegion, filename }（仅运行时）。
  designStates: {},
});

// 板块跨方案匹配标识：优先显式 tag，兜底板块名（兼容旧 JSON）。
export function boardTag(board) {
  return (board && (board.tag || board.name)) || "";
}

export const PLAN_CACHE_KEY = "acrylic-board-plan";
export const PLANS_CACHE_KEY = "acrylic-board-plans";

export function planBoardsOrLayoutDefault() {
  if (planStore.planBoards.length) {
    planStore.planBoards.forEach(migrateLegacyBoard);
    return planStore.planBoards;
  }
  return planStore.layoutDefault;
}

// y 是板块区域顶部中心：合成端板体顶相对锚点偏移 +5·S（makeShape 的
// rect top=255 相对画布中心 250），这里把它扣掉，使板体顶对齐框顶。
// 缩放以「板顶」为不动点（板顶恒对齐锚点 by）：挂扣挂在板顶上方，
// 顶不动点保证挂扣在任何规格下都完整可见；大规格板底向下延伸出画布
// （大板撑满画面底部，视觉自然）。若以板体中心为不动点，板顶会上移
// 挤压挂扣空间导致挂扣出画面。
export const SPEC_SIZES = [
  { value: 5, label: "5cm", scale: 1 },
  { value: 10, label: "10cm", scale: 2 },
  { value: 20, label: "20cm", scale: 4 },
];
export const SPEC_DEFAULT_SIZE = SPEC_SIZES[0].value;
const SPEC_SCALE_MAP = new Map(
  SPEC_SIZES.map((item) => [item.value, item.scale]),
);
// 安全 clamp：正常走查表，仅防脏数据（0/负数/异常大值）把画布撑爆。
const SPEC_RATIO_MIN = 0.2;
const SPEC_RATIO_MAX = 8;
// 规格比例：由规格值查 SPEC_SIZES 表得 scale（5cm→1、10cm→2、20cm→4）。
// 未登记的规格值兜底为默认规格的比例。render.js 复用同一函数，保证
// 「板块放大」与「挂扣缩小」两端一致。
export function specRatio(specSize) {
  const v = Number(specSize);
  if (SPEC_SCALE_MAP.has(v)) return SPEC_SCALE_MAP.get(v);
  return SPEC_SCALE_MAP.get(SPEC_DEFAULT_SIZE);
}
// boardTransform(board, options)
// 缩放以「板顶」为不动点（板顶恒对齐锚点 by）：切规格时板块向下生长，
// 挂扣贴板顶孔位、位置恒定且净大小按 scale 缩小，任何规格下都完整可见
// （板顶不动点是三规格中挂扣最靠画布内的情况）。若以板中心为不动点，
// 大规格板顶会飞出画布，挂扣随之出画（10cm 只露一点、20cm 消失）。
export function boardTransform(board, editorOptions) {
  const sceneX = Number(editorOptions && editorOptions.productX) || 0;
  const sceneY = Number(editorOptions && editorOptions.productY) || 0;
  const sceneScale =
    (Number(editorOptions && editorOptions.productScale) || 100) / 100;
  const boardScale = Number(board.scale) || 1;
  const s = sceneScale * boardScale;
  const rawSpec = Number.isFinite(
    Number(editorOptions && editorOptions.specSize),
  )
    ? Number(editorOptions.specSize)
    : Number(board.specSize);
  const k = specRatio(rawSpec);
  const S = s * k;
  // 注意不能用 `|| 默认值`：0 是合法坐标（画布左/上边缘）。
  const bx = Number.isFinite(Number(board.x)) ? Number(board.x) : 250;
  const by = Number.isFinite(Number(board.y)) ? Number(board.y) : 255;
  return {
    offsetX: Math.round(bx - 250 - sceneX),
    offsetY: Math.round(by - 5 * S - 250 - sceneY),
    scale: boardScale * k,
    rotation: Number(board.rotation) || 0,
    z: Number(board.z) || 0,
  };
}

export function assemblePlan(config, boards) {
  return Object.assign({}, config, {
    version: 5,
    boards: JSON.parse(JSON.stringify(boards)),
  });
}

export function readPlanCache() {
  try {
    const raw = localStorage.getItem(PLAN_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// 多方案缓存：仅存方案配置（图片生成结果为运行时 Blob，不持久化）。
export function readPlansCache() {
  try {
    const raw = localStorage.getItem(PLANS_CACHE_KEY);
    const list = raw ? JSON.parse(raw) : null;
    return Array.isArray(list) ? list : null;
  } catch (e) {
    return null;
  }
}

export function writePlansCache(plans) {
  try {
    const data = (plans || []).map((plan) => ({
      id: plan.id,
      name: plan.name,
      config: plan.config,
    }));
    localStorage.setItem(PLANS_CACHE_KEY, JSON.stringify(data));
  } catch (e) {
    // 多份方案可能超出 localStorage 配额，静默降级为仅运行时保留。
    console.warn("多方案缓存写入失败", e);
  }
}

export function clearPlansCache() {
  localStorage.removeItem(PLANS_CACHE_KEY);
}
