const path=require('node:path');
const ts=require(path.resolve(__dirname,'../../../node_modules/typescript'));
module.exports=function(source){
 if(this.resourcePath.endsWith('.css'))return 'export default new Proxy({}, {get:(_,key)=>key});';
 return ts.transpileModule(source,{fileName:this.resourcePath,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
};
