# 亚克力效果编辑器 · Vue 2 组件版

这是适合接入现有 Vue 2 项目的单文件组件。3.2 版在异形轮廓、挂孔和五种二维材质基础上，加入可创作的材质预设、场景模板、素材替换、产品变换、阴影编辑、数组化挂扣选择和方案 JSON。

## 两个页面

完整示例使用 `vue-router@3` 提供两个 Hash 路由：

- `#/`：预览首页。导入带背景和挂扣的 JSON、选择透明 PNG 图案、切换五种材质、选择橙色/无/自定义挂扣，并下载效果图。
- `#/settings`：效果设置页。调整材质细节、轮廓、挂孔、场景、产品位置、阴影与素材，并导出 JSON。

两个路由共用 `App.vue` 中同一个 `AcrylicEditor` 实例，所以在页面间切换时，当前图案、嵌入背景和参数会保留。浏览器整页刷新后会恢复默认状态，持久方案请导出 JSON。

如果只复制 `src/components/AcrylicEditor` 到已有项目，组件不依赖 Vue Router；使用 `mode="preview"` 或 `mode="settings"` 控制两种界面，`show-header="false"` 可隐藏组件自带页头。

## 3.0 新增能力

- 调整材质底色、底色透明度、亮片大小与纹理透明度，并保存为浏览器本地材质预设。
- 窗帘桌面、近景、白底与透明底四套场景模板。
- 整件产品统一移动、缩放和旋转；阴影位置、模糊与透明度可调。
- 临时替换背景、挂扣、亮片和反光素材，随时恢复内置素材。
- 导出/导入 JSON 设计方案。方案会以 Data URL 嵌入当前背景和挂扣，换设备导入时一起恢复。
- 轮廓缓存：只有原图、留边、圆滑或孔位变化时才重新计算蒙版。

## 接入现有项目（推荐）

1. 将 `src/components/AcrylicEditor` **整个目录**复制到你的项目 `src/components/` 中。包含组件、渲染算法、样式和五张 PNG，不要只复制 `.vue` 文件。
2. 在页面中注册并使用：

```vue
<template>
  <div>
    <AcrylicEditor
      ref="acrylic"
      :src="artworkUrl"
      :initial-options="options"
      :hook-options="hookOptions"
      @ready="onReady"
      @change="onChange"
      @export="onExport"
      @error="onError"
    />
  </div>
</template>
<script>
import AcrylicEditor from '@/components/AcrylicEditor'
export default {
  components: { AcrylicEditor },
  data() {
    return {
      // 留空使用本包附带的用户原图；也可使用 require('@/assets/人物.png')。
      artworkUrl: '',
      options: { material: 'glitter', intensity: 85, thickness: 4 },
      hookOptions: [
        { id: 'orange', label: '橙色挂扣', type: 'builtin' },
        { id: 'none', label: '无挂扣', type: 'none' },
        { id: 'custom', label: '自定义上传', type: 'upload' }
      ]
    }
  },
  methods: {
    onReady() { /* 原图与素材已就绪 */ },
    onChange(options) { /* 可以保存参数；不要再无条件回写同一参数 */ },
    onExport({ blob, filename }) { /* 编辑器已启动下载，同时返回 Blob */ },
    onError(error) { console.error(error.message) },
    async saveToYourServer() {
      const blob = await this.$refs.acrylic.exportImage({ size: 1500, format: 'png' })
      const form = new FormData()
      form.append('file', blob, 'acrylic.png')
      // 在这里调用你的上传接口；组件自身不发送图片。
      return form
    },
    changeMaterial() {
      this.$refs.acrylic.setOptions({ material: 'frost', intensity: 90 })
    }
  }
}
</script>
```

无需在已有项目中安装本包的 Webpack 或替换项目 package.json。只要你的 Vue 2 项目能加载 `.vue`、CSS 和 PNG，就可以复制使用；渲染算法无第三方运行时依赖。

## 兼容范围与构建

- Options API，目标 Vue 2.6 / 2.7。随附示例固定使用 Vue **2.6.14** 和同版本 `vue-template-compiler`，按这个组合验证构建。
- 现有项目使用其他 Vue 2 版本时，保留原来的 Vue 版本，确保项目自己的模板编译器与 Vue 版本一致。
- 不使用 Vue 3、Composition API 或 `<script setup>`；模板中也不使用可选链。
- 算法包含 ES2017 语法和现代 Canvas API，面向现代 Chrome/Edge/Firefox/Safari；不承诺 IE 兼容。旧 Webpack 项目需保留 Babel 对 src 文件的常规转译配置。
- 默认素材采用静态 import，打包器会处理文件路径，可部署到子目录；组件样式为 scoped，不修改宿主页面 body。
- 跨域图片服务器必须允许 CORS，否则像素读取和导出会失败。默认 `crossOrigin="anonymous"`；同源图片无需额外配置。图片地址加载失败时触发 `error`。
- 多个组件实例有独立参数、图像与定时器；卸载时清理定时器并忽略未完成请求。

## Props

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| src | String | 空字符串 | 人物透明 PNG 地址；空时用随附原图；地址变化会重新加载 |
| initial-options | Object | 内置默认参数 | 仅初始化生效；后续使用 setOptions 修改 |
| asset-urls | Object | 内置素材 | 可覆盖 background / hook / glitter / reflection 的地址 |
| hook-options | Array | 三个内置选项 | 首页挂扣选项数组，支持 builtin / preset / none / upload |
| cross-origin | String | anonymous | 图片跨域模式；设置前须保证服务器允许跨域 |

自定义素材示例：

```vue
<AcrylicEditor :src="myPng" :asset-urls="{ background: myBackground, hook: myHook }" />
```

挂扣数组的每项需要唯一 `id`、显示文字 `label` 和 `type`。`builtin` 使用组件自带橙色挂扣，`none` 关闭挂扣，`upload` 显示上传入口；新增预设图片时使用 `preset` 并传入 `src`，可选 `preview` 作为缩略图：

```js
hookOptions: [
  { id: 'orange', label: '橙色挂扣', type: 'builtin' },
  { id: 'black', label: '黑色挂扣', type: 'preset', src: require('@/assets/black-hook.png') },
  { id: 'none', label: '无挂扣', type: 'none' },
  { id: 'custom', label: '自定义上传', type: 'upload' }
]
```

选择值会写入导出的 JSON `assets.hook.selection`，再次导入时会按数组中的同名 `id` 恢复；若预设已从数组删除，则自动落到可用的内置或上传选项。

## 参数（initial-options / setOptions）

| 参数 | 范围 / 可选值 | 默认 |
| --- | --- | --- |
| material | clear / glitter / frost / tinted / pearl | glitter |
| border | 3–25 | 16 |
| smooth | 0–12 | 5 |
| density | 10–100 | 85 |
| shine | 0–80 | 55 |
| intensity | 0–100 | 80 |
| thickness | 1–7 | 4 |
| tint | 六位十六进制颜色 | #8c68df |
| holeX | -90–90 | 0 |
| holeY | -30–45 | 0 |
| hook | Boolean | true |
| background | scene / white / transparent | scene |
| baseColor / baseOpacity | 颜色 / 0–100 | #ffffff / 0 |
| textureScale / textureOpacity | 20–300 / 0–100 | 100 / 100 |
| productX / productY | -150–150 | 0 / 0 |
| productScale / productRotation | 50–180 / -30–30 | 100 / 0 |
| shadowX / shadowY | -30–30 | -7 / 8 |
| shadowBlur / shadowOpacity | 0–30 / 0–70 | 5 / 20 |

border、thickness 和孔位偏移使用 500 × 500 逻辑画布坐标，并非实际生产毫米数。

## 事件与方法

| 事件 | 参数 | 时机 |
| --- | --- | --- |
| ready | 无 | 原图与素材加载并完成首次渲染 |
| change | 当前参数副本 | 参数发生变化 |
| upload | File | 用户替换原图成功 |
| export | { blob, filename } | 点击内置导出按钮完成生成 |
| error | Error | 图片验证、加载、绘制或下载失败 |

- `this.$refs.acrylic.exportImage({ size:1500, format:'png' })`：返回 `Promise<Blob>`，不自动下载，不触发 export 事件。size 可为 100–4096 整数，format 为 png / jpeg；失败需 catch。
- `this.$refs.acrylic.download()`：按界面当前设置下载并触发 export。
- `this.$refs.acrylic.setOptions({ material:'pearl' })`：部分更新并校验参数。
- `this.$refs.acrylic.reset()`：重置材质与轮廓参数，保留当前图案。
- `this.$refs.acrylic.applyScene('white')`：应用 studio / closeup / white / transparent 场景模板。
- `this.$refs.acrylic.createConfig()`：取得当前配置对象，其中包含嵌入式背景和挂扣。
- `await this.$refs.acrylic.loadConfig(config)`：加载并校验配置对象，同时恢复背景和挂扣；兼容没有 assets 字段的旧方案。
- `this.$refs.acrylic.exportConfig()`：下载完整 JSON 方案。背景会使 JSON 文件体积增大。
- `this.$refs.acrylic.uploadAsset(name, file)`：临时替换 background / hook / glitter / reflection 素材。
- `this.$refs.acrylic.resetAsset(name)`：恢复某项内置素材。

## 单独运行随附示例

建议 Node.js 18.12+：

```bash
npm install
npm run dev
```

打开终端显示的本地地址（默认 http://localhost:8080）。

```bash
npm test
npm run test:build
npm run build
```

`npm test` 验证组件逻辑；`npm run test:build` 同时验证开发和生产 Webpack 均为 0 errors / 0 warnings。`dist/` 为构建输出。压缩包不含 node_modules、dist 或任何网站发布凭据。

## 素材与效果说明

`assets/artwork.png` 是用户提供的原人物图（170 × 352）；background、hook、glitter、reflection 是本次对话生成素材。大尺寸输出不会恢复原图没有的细节。

二维材质是视觉近似，不是生产刀模或真实三维折射。分离过远的元素仍需预先整理；挂扣穿孔为正面近似。透明 PNG 导出不带场景投影；JPG 透明背景自动改为白底。浏览器本地处理图片，不会自动上传。

效果图导出会按照“场景背景”当前选择绘制背景：选择窗帘桌面时会带上内置或自定义背景，选择白底时导出白底，选择透明背景并导出 PNG 时保持透明。方案 JSON 会嵌入背景和挂扣；自定义亮片与反光素材仍需另外保存。

## 样式模块警告修复版

修复 Webpack 5 + vue-loader 15 的 `export 'default' (imported as 'style0') was not found` 警告。

根因：vue-loader 为普通 style 生成默认导入，但其样式代理模块只使用 export *，不转发默认导出。仅切换 CSS loader 的 esModule 设置不能修复这层代理关系。

本包保留 vue-loader 15.11.1、vue-style-loader 和原有 scoped 样式，增加 `build/vue-style-imports-loader.cjs`，仅将未使用的普通样式默认导入改为副作用导入。CSS 注入仍会执行；实际使用的 CSS Modules / SSR / shadow-root 绑定不会转换。没有修改 node_modules，也没有配置 ignoreWarnings。

旧示例更新步骤：

1. 复制本包的 `build/` 目录。
2. 替换 `webpack.config.js`（若自己改过配置，则合并第一条 enforce: post 规则）。
3. 停止旧开发服务，执行 `npm install`、`npm run dev`。

直接使用完整修复包也可以。组件源码和素材不变。接入你自己的 Webpack 项目时，规则中 loader 路径需指向复制后的兼容文件；不要覆盖已有的其他规则。

验证：`npm test` 检查组件，`node tests/build.cjs` 检查开发模式（含 HMR 插件）及生产模式，两个模式均要求 0 errors / 0 warnings，发现警告会使检查失败。构建检查不等于浏览器交互实测。
