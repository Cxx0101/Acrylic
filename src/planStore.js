import Vue from "vue";

// 首页 / 设置页共享的方案状态。Vue.observable 保证跨页面组件的响应式。
export const planStore = Vue.observable({
  // 设置页布局编辑器产出 / 首页导入的板块布局（JSON boards）。
  planBoards: [],
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
  // 设置页当前选中、正在编辑参数的板块。
  settingsBoardId: null,
  // 两页编辑器共享的全局效果参数（材质类型/阴影/工艺等整包同步）。
  sharedOptions: null,
});

export const PLAN_CACHE_KEY = "acrylic-board-plan";

export function planBoardsOrLayoutDefault() {
  return planStore.planBoards.length
    ? planStore.planBoards
    : planStore.layoutDefault;
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
  localStorage.setItem(PLAN_CACHE_KEY, JSON.stringify(config));
}

export function clearPlanCache() {
  localStorage.removeItem(PLAN_CACHE_KEY);
}
