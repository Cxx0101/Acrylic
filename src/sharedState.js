import Vue from "vue";

// ------------------------------------------------------------------
// 跨页共享的运行时状态（keep-alive 下两页共存，Vue.observable 保证响应式）。
// 不做任何本地持久化——方案/布局等数据后续将改由后端接口提供，页面
// 自身的数据（plans/designStates/settingsBoardId 等）都在各自 data 中。
// ------------------------------------------------------------------
export const sharedState = Vue.observable({
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
  // 两页编辑器共享的全局效果参数（材质类型/阴影/工艺等整包同步）。
  sharedOptions: null,
});
