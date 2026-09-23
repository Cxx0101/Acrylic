const path = require('path');
const fs = require('fs');
const VueLoaderPlugin = require('vue-loader/lib/plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
// Copies public/workers/** into the bundle so the contour Worker keeps its
// stable /workers/... URL in production builds (dev serves public/ directly).
class CopyPublicWorkersPlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap('CopyPublicWorkersPlugin', (compilation) => {
      compilation.hooks.processAssets.tapAsync(
        {
          name: 'CopyPublicWorkersPlugin',
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
        },
        (assets, cb) => {
          const srcDir = path.resolve(__dirname, 'public/workers');
          if (!fs.existsSync(srcDir)) return cb();
          const walk = (dir, prefix) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
              const full = path.join(dir, entry.name);
              if (entry.isDirectory()) walk(full, prefix + entry.name + '/');
              else assets['workers/' + prefix + entry.name] = new compiler.webpack.sources.RawSource(fs.readFileSync(full));
            }
          };
          walk(srcDir, '');
          cb();
        }
      );
    });
  }
}
// 线上部署在 /acrylic/ 二级目录：生产构建固定 publicPath；dev 保持 auto
// 以便本机 8080 根路径访问。Worker URL 通过 __webpack_public_path__ 跟随。
module.exports = (env, argv = {}) => {
  const isProd = argv.mode === 'production';
  return {
    entry: './src/main.js',
    output: { path: path.resolve(__dirname, 'dist'), filename: 'js/[name].[contenthash:8].js', publicPath: isProd ? '/acrylic/' : 'auto', clean: true },
    resolve: { extensions: ['.js', '.vue'], alias: { 'vue$': 'vue/dist/vue.runtime.esm.js' } },
    module: { rules: [{ test: /\.vue$/, enforce: 'post', resourceQuery: query => !query, use: path.resolve(__dirname, 'build/vue-style-imports-loader.cjs') }, { test: /\.vue$/, loader: 'vue-loader' }, { test: /\.css$/, use: ['vue-style-loader', { loader: 'css-loader', options: { esModule: false } }] }, { test: /\.(png|jpe?g)$/, type: 'asset/resource', generator: { filename: 'assets/[name].[contenthash:8][ext]' } }] },
    plugins: [new VueLoaderPlugin(), new HtmlWebpackPlugin({ template: './public/index.html' }), new CopyPublicWorkersPlugin()],
    devServer: { port: 8080, open: false }, performance: { hints: false }
  };
};
