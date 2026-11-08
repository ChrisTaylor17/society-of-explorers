// Test-only transpilation/CSS port for the already installed Next Webpack.
const path = require('node:path');
const { createHash } = require('node:crypto');
module.exports = function source(source) {
  const ts = require(require.resolve('typescript', { paths: [this.rootContext] }));
  if (this.resourcePath.endsWith('.css')) {
    const prefix = 'fixture_' + createHash('sha256').update(path.relative(this.rootContext, this.resourcePath)).digest('hex').slice(0, 10) + '_';
    const names = {};
    const css = source.replace(/\.([_a-zA-Z][-_a-zA-Z0-9]*)/g, (_, name) => '.' + (names[name] ??= prefix + name));
    globalThis.__soeResidentFixtureCss.set(this.resourcePath, css);
    return 'export default ' + JSON.stringify(names) + ';';
  }
  return ts.transpileModule(source, { fileName: this.resourcePath, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true, isolatedModules: true,
  } }).outputText;
};
