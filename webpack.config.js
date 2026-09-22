const path=require('path');
const VueLoaderPlugin=require('vue-loader/lib/plugin');
const HtmlWebpackPlugin=require('html-webpack-plugin');
module.exports={
 entry:'./src/main.js',
 output:{path:path.resolve(__dirname,'dist'),filename:'js/[name].[contenthash:8].js',publicPath:'auto',clean:true},
 resolve:{extensions:['.js','.vue'],alias:{'vue$':'vue/dist/vue.runtime.esm.js'}},
 module:{rules:[{test:/\.vue$/,enforce:'post',resourceQuery:query=>!query,use:path.resolve(__dirname,'build/vue-style-imports-loader.cjs')},{test:/\.vue$/,loader:'vue-loader'},{test:/\.css$/,use:['vue-style-loader',{loader:'css-loader',options:{esModule:false}}]},{test:/\.(png|jpe?g)$/,type:'asset/resource',generator:{filename:'assets/[name].[contenthash:8][ext]'}}]},
 plugins:[new VueLoaderPlugin(),new HtmlWebpackPlugin({template:'./public/index.html'})],
 devServer:{port:8080,open:false},performance:{hints:false}
};
