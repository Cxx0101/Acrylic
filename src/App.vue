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
.app-header {
  height: 78px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 32px;
  background: #fff;
  border-bottom: 1px solid #e1e6e2;
  position: sticky;
  top: 0;
  z-index: 10;
}
.app-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  font-size: 21px;
  letter-spacing: 2px;
}
.app-brand > span {
  display: grid;
  place-items: center;
  width: 40px;
  height: 43px;
  border-radius: 12px 12px 12px 3px;
  background: #244941;
  color: #fff;
  font-size: 22px;
}
.app-brand small {
  display: block;
  margin-top: 3px;
  color: #88918d;
  font-size: 8px;
  letter-spacing: 1.5px;
}
.app-header nav {
  display: flex;
  gap: 7px;
  padding: 4px;
  background: #f0f3f1;
  border-radius: 10px;
}
.app-header nav a {
  text-decoration: none;
  color: #68746f;
  padding: 9px 18px;
  border-radius: 7px;
  font-size: 14px;
}
.app-header nav a.router-link-exact-active {
  background: #fff;
  color: #244f43;
  box-shadow: 0 2px 9px #2e483a12;
}
.header-actions-slot {
  justify-self: end;
}
.header-action {
  justify-self: end;
  border: 0;
  border-radius: 8px;
  background: #285348;
  color: #fff;
  padding: 11px 18px;
  cursor: pointer;
}
.header-action:disabled {
  opacity: 0.45;
  cursor: wait;
}
.header-action--ghost {
  background: #fff;
  color: #285348;
  border: 1px solid #cfd9d5;
}
.header-actions {
  justify-self: end;
  display: flex;
  gap: 10px;
}
@media (max-width: 700px) {
  .app-header {
    height: auto;
    min-height: 70px;
    padding: 10px 14px;
    grid-template-columns: 1fr auto;
  }
  .app-brand small {
    display: none;
  }
  .app-header nav {
    order: 3;
    grid-column: 1/-1;
    margin-top: 9px;
  }
  .app-header nav a {
    flex: 1;
    text-align: center;
    padding: 8px;
  }
  .header-action {
    padding: 10px;
    font-size: 12px;
  }
}
</style>
