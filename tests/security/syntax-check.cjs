const ts=require('/home/box/.local/lib/node_modules/vercel/node_modules/typescript');const fs=require('fs');let bad=0;
for(const f of process.argv.slice(2)){const r=ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}});
const d=r.diagnostics||[];console.log(f, d.length? 'DIAGNOSTICS '+d.map(x=>ts.flattenDiagnosticMessageText(x.messageText,'\n')).join('; '):'ok');bad+=d.length}
console.log('typescript',ts.version);process.exit(bad?1:0)
