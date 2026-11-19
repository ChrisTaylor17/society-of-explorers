// Canonical TypeScript with actual cached AuthClient and SSR implementations.
// HTTP, cookies, clock and browser notifications are injected by the tests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import Module, { createRequire } from 'node:module';
import { createHash, webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../../', import.meta.url));
assert(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')));
const require = createRequire(root + 'package.json');
export function bytes(file) {
  const info = fs.lstatSync(file);
  assert(info.isFile() && !info.isSymbolicLink() && (!info.size || info.blocks), 'Refuse linked or offloaded input: ' + file);
  return fs.readFileSync(file);
}
for (const ext of ['.js', '.json']) {
  const original = Module._extensions[ext];
  Module._extensions[ext] = (module, file) => { bytes(file); return original(module, file); };
}
const ts = require('typescript');
export const actualSdk = require('@supabase/auth-js');
export const actualSsr = require('@supabase/ssr');
export const actualCookies = require('@supabase/ssr/dist/main/cookies.js');
export const sourceBindings = {};
export function runtimeBindings() {
  return Object.fromEntries(Object.keys(require.cache).filter(file => file.includes('/node_modules/')).map(file => [file, createHash('sha256').update(bytes(file)).digest('hex')]));
}

export function loadWebAccount({ crypto = webcrypto } = {}) {
  const timers = new Set(), cache = new Map();
  const context = vm.createContext({ console, URL, URLSearchParams, Headers, Request, Response, TextEncoder, TextDecoder,
    Uint8Array, AbortController, queueMicrotask, crypto, atob, btoa, process: { env: {} },
    setTimeout(callback, delay, ...args) { const timer = setTimeout(() => { timers.delete(timer); callback(...args); }, delay); timers.add(timer); return timer; },
    clearTimeout(timer) { timers.delete(timer); clearTimeout(timer); },
  });
  function source(relative) {
    const full = path.resolve(root, relative);
    assert(full.startsWith(root), 'Canonical source only');
    if (cache.has(full)) return cache.get(full).exports;
    const input = bytes(full), compiledModule = { exports: {} }; cache.set(full, compiledModule);
    sourceBindings[path.relative(root, full)] = createHash('sha256').update(input).digest('hex');
    const compiled = ts.transpileModule(input.toString(), { fileName: full, compilerOptions: { module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const localRequire = name => {
      if (name === '@supabase/auth-js') return actualSdk;
      if (name === '@supabase/ssr') return actualSsr;
      // Actual pinned CJS build of the same SSR helper; no substitute storage.
      if (/^@supabase\/ssr\/dist\/module\/cookies(?:\.js)?$/.test(name)) return actualCookies;
      if (name.startsWith('.') || name.startsWith('@/')) {
        const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(full), name);
        const target = ['.ts', '.tsx', '.mjs', '.js'].map(ext => base + ext).find(file => fs.existsSync(file)) ?? base;
        return source(path.relative(root, target));
      }
      return require(name);
    };
    new vm.Script('(function(require,module,exports){' + compiled + '\n})', { filename: full }).runInContext(context)(localRequire, compiledModule, compiledModule.exports);
    return compiledModule.exports;
  }
  return { api: source('lib/auth/webAccount.ts'), timers };
}
