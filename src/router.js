import Vue from 'vue';
import VueRouter from 'vue-router';

Vue.use(VueRouter);

const EmptyRoute={render:h=>h('span',{style:{display:'none'}})};

export default new VueRouter({
  mode:'hash',
  routes:[
    {path:'/',component:EmptyRoute,meta:{page:'preview'}},
    {path:'/settings',component:EmptyRoute,meta:{page:'settings'}},
    {path:'*',redirect:'/'}
  ]
});
