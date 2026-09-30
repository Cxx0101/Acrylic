import Vue from "vue";
import Vuex from "vuex";

Vue.use(Vuex);

// ------------------------------------------------------------------
// 本地缓存 key：与历史版本保持一致，旧缓存数据可直接恢复。
// ------------------------------------------------------------------
export const PLAN_CACHE_KEY = "acrylic-board-plan";
export const PLANS_CACHE_KEY = "acrylic-board-plans";
export const MATERIAL_PRESETS_KEY = "acrylic-material-presets";

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    // 超出配额等写入失败：静默降级为仅运行时保留。
    console.warn("本地缓存写入失败", key, e);
    return false;
  }
}

// ------------------------------------------------------------------
// State。两页（keep-alive 共存）共享同一响应式状态。
// ------------------------------------------------------------------
const state = () => ({
  // 设置页布局编辑器产出 / 首页导入的板块布局（JSON boards）。
  planBoards: [],
  // 未导入方案时，布局编辑器的默认单块占位。
  layoutDefault: [
    {
      id: "b1",
      tag: "A",
      name: "板块1",
      x: 250,
      y: 140,
      scale: 1,
      rotation: 0,
      z: 0,
      // 默认规格 = 5cm。
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
  // 设计完成状态：tag -> { blob, hole, shapeRegion, filename }。
  // blob 等为运行时对象，不持久化（见持久化插件的白名单）。
  designStates: {},
  // 自定义材质参数预设（设置页板块参数面板）。
  materialPresets: [],
});

// ------------------------------------------------------------------
// Mutations。
// ------------------------------------------------------------------
const mutations = {
  setPlanBoards(state, boards) {
    state.planBoards = boards;
  },
  setSettingsBoardId(state, id) {
    state.settingsBoardId = id;
  },
  setSharedOptions(state, options) {
    state.sharedOptions = options;
  },
  setPlans(state, plans) {
    state.plans = plans;
  },
  addPlan(state, plan) {
    state.plans.push(plan);
  },
  setActivePlanId(state, id) {
    state.activePlanId = id;
  },
  setDesignState(state, { tag, value }) {
    Vue.set(state.designStates, tag, value);
  },
  resetDesignStates(state) {
    state.designStates = {};
  },
  setMaterialPresets(state, list) {
    state.materialPresets = list;
  },
  // 效果参数/挂扣身份变化写回方案 config（跨方案整包同步）。
  updatePlanOptions(state, { plan, options }) {
    plan.config.options = Object.assign({}, options);
  },
  updatePlanHook(state, { plan, hook }) {
    plan.config.assets = Object.assign({}, plan.config.assets, { hook });
  },
  // 空体 mutation：仅作为持久化插件的触发信号，把 plans 序列化落缓存。
  savePlans() {},
};

// ------------------------------------------------------------------
// Actions：页面唯一合法的缓存读写入口（页面不再直接碰 localStorage）。
// ------------------------------------------------------------------
const actions = {
  // 单方案缓存原文（v4/v5 配置）。迁移与落 state 由页面用各自域的
  // migrateLegacyBoard 完成，store 保持与业务转换解耦。
  readPlanCache() {
    return readJson(PLAN_CACHE_KEY);
  },
  // 多方案缓存原文（[{ id, name, config }]）。
  readPlansCache() {
    const list = readJson(PLANS_CACHE_KEY);
    return Array.isArray(list) ? list : null;
  },
  clearPlans({ commit }) {
    commit("setPlans", []);
    commit("setActivePlanId", null);
    commit("resetDesignStates");
    try {
      localStorage.removeItem(PLANS_CACHE_KEY);
    } catch (e) {
      /* ignore */
    }
  },
  loadMaterialPresets({ commit }) {
    const list = readJson(MATERIAL_PRESETS_KEY);
    commit("setMaterialPresets", Array.isArray(list) ? list : []);
  },
};

// ------------------------------------------------------------------
// 持久化插件：订阅 mutation，白名单字段自动写本地缓存。
// plans 只序列化 { id, name, config }（imageUrl/imageBlob/generatedAt
// 为运行时数据，不持久化）。
// ------------------------------------------------------------------
const persistencePlugin = (store) => {
  store.subscribe((mutation, state) => {
    if (mutation.type === "addPlan" || mutation.type === "setPlans") {
      const data = state.plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        config: plan.config,
      }));
      writeJson(PLANS_CACHE_KEY, data);
    } else if (mutation.type === "setMaterialPresets") {
      writeJson(MATERIAL_PRESETS_KEY, state.materialPresets);
    }
  });
};

const getters = {
  // 布局编辑器消费的板块列表：有布局用布局，否则回退默认单块占位。
  layoutBoards(state) {
    return state.planBoards.length ? state.planBoards : state.layoutDefault;
  },
  // 当前激活（主画布实时预览）的方案；无激活 id 时回退第一份。
  activePlan(state) {
    return (
      state.plans.find((plan) => plan.id === state.activePlanId) ||
      state.plans[0] ||
      null
    );
  },
};

export default new Vuex.Store({
  state,
  getters,
  mutations,
  actions,
  plugins: [persistencePlugin],
});
