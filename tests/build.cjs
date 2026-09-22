const webpack=require('webpack');
const base=require('../webpack.config');
(async()=>{
 for(const mode of ['development','production']){
  await new Promise((resolve,reject)=>{
   const config={...base,mode,plugins:[...base.plugins]};
   if(mode==='development')config.plugins.push(new webpack.HotModuleReplacementPlugin());
   const compiler=webpack(config);
   compiler.run((error,stats)=>compiler.close(closeError=>{
    if(error||closeError)return reject(error||closeError);
    const report=stats.toJson({all:false,errors:true,warnings:true});
    if(stats.hasErrors()||stats.hasWarnings())return reject(new Error(JSON.stringify(report)));
    console.log(mode+': 0 errors, 0 warnings');resolve();
   }));
  });
 }
})().catch(e=>{console.error(e);process.exitCode=1});
