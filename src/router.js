import Vue from 'vue';
import VueRouter from 'vue-router';
import PreviewPage from './pages/PreviewPage.vue';
import SettingsPage from './pages/SettingsPage.vue';

Vue.use(VueRouter);

export default new VueRouter({
  mode:'hash',
  routes:[
    {path:'/',component:PreviewPage,meta:{page:'preview'}},
    {path:'/settings',component:SettingsPage,meta:{page:'settings'}},
    {path:'*',redirect:'/'}
  ]
});
