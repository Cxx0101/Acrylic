<template>
  <div id="demo-app">
    <header class="app-header">
      <div class="app-brand"><span>透</span><div>透物<small>ACRYLIC STUDIO</small></div></div>
      <nav aria-label="主导航">
        <router-link exact to="/">预览首页</router-link>
        <router-link to="/settings">效果设置</router-link>
      </nav>
      <button v-if="isSettings" class="header-action" :disabled="!editorReady" @click="exportConfig">导出 JSON</button>
      <button v-else class="header-action" :disabled="!editorReady" @click="downloadImage">下载效果图</button>
    </header>
    <div class="page-heading">
      <div><span>{{isSettings?'DESIGN SETTINGS':'QUICK PREVIEW'}}</span><h1>{{isSettings?'设置效果图参数':'导入方案并预览效果'}}</h1></div>
      <p>{{isSettings?'设置完成后导出带背景的 JSON，再回到首页验证效果。':'导入 JSON，选择透明图案和材质，即时查看成品。'}}</p>
    </div>
    <AcrylicEditor
      ref="editor"
      :src="artwork"
      :initial-options="options"
      :mode="isSettings?'settings':'preview'"
      :show-header="false"
      @ready="onReady"
      @change="onChange"
      @export="onExport"
      @error="onError"
    />
  </div>
</template>
<script>
import AcrylicEditor from './components/AcrylicEditor';
import artwork from './components/AcrylicEditor/assets/artwork.png';
export default {
  name:'App',components:{AcrylicEditor},
  data(){return {
    artwork,
    options:{material:'glitter',intensity:85,thickness:4},
    editorOptions:null,
    editorReady:false
  };},
  computed:{isSettings(){return this.$route.path==='/settings';}},
  methods:{
    onReady(){this.editorReady=true;console.log('亚克力编辑器已就绪');},
    onChange(options){this.editorOptions=options;},
    onExport({blob,filename}){console.log('已导出',filename,blob.size);},
    onError(error){console.error(error);},
    downloadImage(){this.$refs.editor.download();},
    exportConfig(){this.$refs.editor.exportConfig();},
    async getResultBlob(){return this.$refs.editor.exportImage({size:1500,format:'png'});}
  }
};
</script>
<style>
*{box-sizing:border-box}body{margin:0;background:#f2f3f3;color:#25302c;font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif}button{font:inherit}#demo-app{min-height:100vh}.app-header{height:78px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 32px;background:#fff;border-bottom:1px solid #e1e6e2;position:sticky;top:0;z-index:10}.app-brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:21px;letter-spacing:2px}.app-brand>span{display:grid;place-items:center;width:40px;height:43px;border-radius:12px 12px 12px 3px;background:#244941;color:#fff;font-size:22px}.app-brand small{display:block;margin-top:3px;color:#88918d;font-size:8px;letter-spacing:1.5px}.app-header nav{display:flex;gap:7px;padding:4px;background:#f0f3f1;border-radius:10px}.app-header nav a{text-decoration:none;color:#68746f;padding:9px 18px;border-radius:7px;font-size:14px}.app-header nav a.router-link-exact-active{background:#fff;color:#244f43;box-shadow:0 2px 9px #2e483a12}.header-action{justify-self:end;border:0;border-radius:8px;background:#285348;color:#fff;padding:11px 18px;cursor:pointer}.header-action:disabled{opacity:.45;cursor:wait}.page-heading{max-width:1370px;margin:0 auto;display:flex;align-items:end;justify-content:space-between;padding:28px 38px 10px;gap:25px}.page-heading span{font-size:10px;letter-spacing:2px;color:#8c9993}.page-heading h1{font-size:24px;margin:7px 0 0;font-weight:600}.page-heading p{font-size:13px;color:#77827d;margin:0;max-width:420px;text-align:right;line-height:1.7}@media(max-width:700px){.app-header{height:auto;min-height:70px;padding:10px 14px;grid-template-columns:1fr auto}.app-brand small{display:none}.app-header nav{order:3;grid-column:1/-1;margin-top:9px}.app-header nav a{flex:1;text-align:center;padding:8px}.header-action{padding:10px;font-size:12px}.page-heading{padding:20px 16px 8px;display:block}.page-heading p{margin-top:8px;text-align:left}.page-heading h1{font-size:20px}}
</style>
