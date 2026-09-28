<template>
  <div id="demo-app">
    <!-- 两页各自持有编辑器实例；keep-alive 保证切页不销毁、设计状态不丢 -->
    <keep-alive>
      <router-view />
    </keep-alive>
  </div>
</template>
<script>
export default {
  name: "App",
};
</script>
<style>
/* 仅保留真正的全局基础样式；header/导航样式随两页各自的 AppHeader.vue 走，
   首页（home/）与设置页（settings/）互不共用。 */
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
</style>
