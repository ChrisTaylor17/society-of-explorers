import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
// Reuse the established native composition and the installed locked compiler.
// Bun is absent on this host; this performs no dependency acquisition.
const require = createRequire(import.meta.url);
const { webpack } = require('next/dist/compiled/webpack/webpack'), root = process.cwd();
const out = path.resolve('verification/web/evidence/native-source-size-fixture');
const base = fs.readFileSync('platforms/tests/bundle-native-source-reading.mjs', 'utf8');
let primitive = base.split('const primitive=`')[1]?.split('`;\nconst result=')[0];
if (!primitive) throw Error('Review changed source-reader composition');
primitive = primitive.replace("Platform={OS:'android'}", "Platform={OS:new URLSearchParams(location.search).get('platform')==='ios'?'ios':'android'}")
  .replace("'./platforms/tests/native-source-reader-double'", JSON.stringify(path.resolve('platforms/tests/native-source-reader-double.tsx')));
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(out + '/primitives.mjs', primitive);
const run = webpack({ context: root, mode: 'development', devtool: false, target: 'web',
  entry: './platforms/tests/native-source-size-entry.tsx', output: { path: out, filename: 'page.js' },
  resolve: { extensions: ['.tsx', '.ts', '.mjs', '.js', '.json'], alias: { 'react-native$': out + '/primitives.mjs', '@': root,
    'react$': path.resolve('node_modules/react/index.js'), 'react/jsx-runtime$': path.resolve('node_modules/react/jsx-runtime.js'),
    'react/jsx-dev-runtime$': path.resolve('node_modules/react/jsx-dev-runtime.js') } },
  module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.resolve('platforms/tests/native-source-size-loader.cjs') }] },
  plugins: [new webpack.DefinePlugin({ 'process.env.NODE_ENV': JSON.stringify('development') })],
});
const stats = await new Promise((resolve, reject) => run.run((error, result) => error ? reject(error) : resolve(result)));
await new Promise((resolve, reject) => run.close(error => error ? reject(error) : resolve()));
if (stats.hasErrors()) throw Error(stats.toString({ all: false, errors: true }));
const sha = bytes => createHash('sha256').update(bytes).digest('hex'), hashes = {};
for (const file of stats.compilation.fileDependencies) {
  if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile() || file.includes('/node_modules/')) continue;
  hashes[path.relative(root, file)] = sha(fs.readFileSync(file));
}
for (const name of ['platforms/tests/bundle-native-source-reading.mjs', 'platforms/tests/bundle-native-source-size.mjs']) hashes[name] = sha(fs.readFileSync(name));
fs.writeFileSync(out + '/source-manifest.json', JSON.stringify({ hashes, bundle: sha(fs.readFileSync(out + '/page.js')),
  scope: 'Actual SourceReadingScreen/controller/SourceReader, existing native primitives and iframe Fabric doubles; synthetic owner only. No account, provider, save transport or native runtime.' }, null, 2) + '\n');
console.log('Built focused native reader sizing composition with installed webpack.');
