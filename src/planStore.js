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
      specSize: 10,
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

// y 是板块区域顶部中心：合成端板体顶相对锚点偏移 +5·s（makeShape 的
// rect top=255 相对画布中心 250），这里把它扣掉，使板体顶对齐框顶。
export function boardTransform(board, editorOptions) {
  const sceneX = Number(editorOptions && editorOptions.productX) || 0;
  const sceneY = Number(editorOptions && editorOptions.productY) || 0;
  const sceneScale =
    (Number(editorOptions && editorOptions.productScale) || 100) / 100;
  const s = sceneScale * (Number(board.scale) || 1);
  return {
    offsetX: Math.round((Number(board.x) || 250) - 250 - sceneX),
    offsetY: Math.round((Number(board.y) || 255) - 5 * s - 250 - sceneY),
    scale: Number(board.scale) || 1,
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

export function writePlanCache(config) {
  try {
    localStorage.setItem(PLAN_CACHE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn("方案缓存写入失败", e);
  }
}

export function clearPlanCache() {
  localStorage.removeItem(PLAN_CACHE_KEY);
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
