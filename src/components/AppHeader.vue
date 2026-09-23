<template>
  <header class="app-header">
    <div class="app-brand">
      <span>D</span>
      <div>亚克力Demo<small>ACRYLIC STUDIO</small></div>
    </div>
    <nav aria-label="主导航">
      <router-link exact to="/">预览首页</router-link>
      <router-link to="/settings">效果设置</router-link>
    </nav>
    <div class="header-actions-slot"><slot name="actions" /></div>
  </header>
</template>
<script>
export default {
  name: "AppHeader",
};
</script>
