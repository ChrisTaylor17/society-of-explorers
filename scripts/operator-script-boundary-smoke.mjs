import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const failures = [];
const allowedFetchScripts = new Set(['scripts/capital-route-smoke.mjs']);
const allowedChildProcessScripts = new Set([
  'scripts/operator-smoke.mjs',
  'prompts-mvp/scripts/operator-smoke.mjs',
]);
const promptAtlasBoundaryOptInSmokeScripts = new Set([
  'prompts-mvp:db:readiness:smoke',
  'prompts-mvp:execute:live:smoke',
  'prompts-mvp:stripe:live:smoke',
  'prompts-mvp:ui:smoke',
  'prompts-mvp:vercel:env:smoke',
]);
const smokeCommandPattern = /^node (scripts\/[-\w]+\.mjs)$/;
const sensitiveEnvFileNames = new Set([
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
  '.env.test',
  '.env.test.local',
]);
const fileSystemMutationCalls = new Set([
  'appendFile',
  'appendFileSync',
  'chmod',
  'chmodSync',
  'chown',
  'chownSync',
  'copyFile',
  'copyFileSync',
  'cp',
  'cpSync',
  'createWriteStream',
  'fchmod',
  'fchmodSync',
  'fchown',
  'fchownSync',
  'ftruncate',
  'ftruncateSync',
  'mkdir',
  'mkdirSync',
  'mkdtemp',
  'mkdtempSync',
  'open',
  'openSync',
  'rename',
  'renameSync',
  'rm',
  'rmSync',
  'truncate',
  'truncateSync',
  'unlink',
  'unlinkSync',
  'utimes',
  'utimesSync',
  'write',
  'writeSync',
  'writeFile',
  'writeFileSync',
]);
const blockedModuleNames = new Set([
  '@anthropic-ai/sdk',
  '@supabase/supabase-js',
  'axios',
  'child_process',
  'dgram',
  'dns',
  'got',
  'http2',
  'net',
  'node-fetch',
  'node:child_process',
  'node:dgram',
  'node:dns',
  'node:http',
  'node:http2',
  'node:https',
  'node:net',
  'node:process',
  'node:tls',
  'http',
  'https',
  'process',
  'resend',
  'stripe',
  'tls',
  'undici',
  'worker_threads',
  'ws',
  'node:worker_threads',
]);
const blockedCommonJsRequireModuleNames = new Set([
  ...blockedModuleNames,
  'fs',
  'fs/promises',
  'module',
  'node:fs',
  'node:fs/promises',
  'node:module',
  'node:process',
  'process',
]);
const commonJsRequireSourceModules = new Set(['module', 'node:module']);
const childProcessSourceModules = new Set(['child_process', 'node:child_process']);
const childProcessExecutionCalls = new Set(['exec', 'execFile', 'execFileSync', 'execSync', 'spawn', 'spawnSync']);
const fileReadSourceModules = new Set(['fs', 'fs/promises', 'node:fs', 'node:fs/promises']);
const fetchCallExpressions = new Set(['fetch', 'globalThis.fetch', 'global.fetch', 'window.fetch', 'self.fetch']);
const fetchNamespaceExpressions = new Set(['global', 'globalThis', 'self', 'window']);
const httpClientRequestCallExpressions = new Set(['http.get', 'http.request', 'https.get', 'https.request']);
const httpClientRequestMembers = new Set(['get', 'request']);
const httpClientRequestNamespaces = new Set(['http', 'https']);
const dynamicCodeGlobalMembers = new Set(['eval', 'Function']);
const dynamicCodeGlobalNamespaceExpressions = new Set(['global', 'globalThis', 'self', 'window']);
const dynamicCodeVmMembers = new Set(['compileFunction', 'runInThisContext']);
const dynamicCodeVmSourceModules = new Set(['vm', 'node:vm']);
const constructorNamespaceExpressions = new Set(['global', 'globalThis', 'self', 'window']);
const timerGlobalMembers = new Set(['setInterval', 'setTimeout']);
const timerNamespaceExpressions = new Set(['global', 'globalThis', 'self', 'window']);
const blockedDynamicCodeCallExpressions = new Set([
  'eval',
  'Function',
  'global.eval',
  'global.Function',
  'globalThis.eval',
  'globalThis.Function',
  'self.eval',
  'self.Function',
  'window.eval',
  'window.Function',
  'vm.compileFunction',
  'vm.runInThisContext',
]);
const timerCallExpressions = new Set([
  'setInterval',
  'setTimeout',
  'global.setInterval',
  'global.setTimeout',
  'globalThis.setInterval',
  'globalThis.setTimeout',
  'self.setInterval',
  'self.setTimeout',
  'window.setInterval',
  'window.setTimeout',
]);
const globalObjectExpressionNames = new Set(['global', 'globalThis']);
const processExpressionNames = new Set(['process', 'global.process', 'globalThis.process']);
const providerHelperCalls = new Set(['createAnthropicClient', 'createClient', 'getResend', 'getSupabaseAdmin']);
const emailSendCallExpressions = new Set(['sendPublicLeadNotification']);
const stripeMutationCallSuffixes = new Set([
  'charges.create',
  'checkout.sessions.create',
  'paymentIntents.create',
  'webhookEndpoints.create',
]);
const stripeMutationNamespaceSuffixes = new Set([
  'charges',
  'checkout.sessions',
  'paymentIntents',
  'webhookEndpoints',
]);
const processEnvMutationCallExpressions = new Set([
  'Object.assign',
  'Object.defineProperty',
  'Reflect.deleteProperty',
  'Reflect.set',
]);
const processEnvMutationNamespaces = new Set(['Object', 'Reflect']);
const reflectApplyCallExpressions = new Set(['Reflect.apply']);
const reflectApplyMembers = new Set(['apply']);
const reflectApplyNamespaces = new Set(['Reflect']);
const reflectConstructCallExpressions = new Set(['Reflect.construct']);
const reflectConstructMembers = new Set(['construct']);
const reflectConstructNamespaces = new Set(['Reflect']);

const blockedCallRules = [
  {
    label: 'runtime fetch',
    matches: (expressionText) => fetchCallExpressions.has(expressionText),
    allowed: (scriptPath) => allowedFetchScripts.has(scriptPath),
  },
  {
    label: 'HTTP client request',
    matches: (expressionText) => isHttpClientRequestCall(expressionText),
  },
  {
    label: 'child process execution',
    matches: (expressionText) =>
      childProcessExecutionCalls.has(expressionText) ||
      ['.execFile', '.execFileSync', '.execSync', '.spawn', '.spawnSync'].some((suffix) =>
        expressionText.endsWith(suffix),
      ),
    allowed: (scriptPath, _node, _sourceFile, expressionText) =>
      allowedChildProcessScripts.has(scriptPath) &&
      expressionText === 'spawnSync' &&
      expressionName(_node.expression, _sourceFile) === expressionText,
  },
  {
    label: 'file-system mutation',
    matches: (expressionText) => isFileSystemMutationCall(expressionText),
  },
  {
    label: 'email send',
    matches: (expressionText) => isEmailSendCall(expressionText),
  },
  {
    label: 'Stripe mutation',
    matches: (expressionText) => isStripeMutationCall(expressionText),
  },
  {
    label: 'provider or database client helper',
    matches: (expressionText) => isProviderHelperCall(expressionText),
  },
  {
    label: 'dynamic code execution',
    matches: (expressionText) => isDynamicCodeCall(expressionText),
  },
];

const blockedNewExpressions = new Set([
  'Anthropic',
  'EventSource',
  'Function',
  'Resend',
  'SharedWorker',
  'Stripe',
  'WebSocket',
  'Worker',
  'XMLHttpRequest',
]);
const fileReadCalls = new Set(['read', 'readText', 'readFile', 'readFileSync']);
const assignmentOperatorKinds = new Set([
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.AsteriskAsteriskEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.CaretEqualsToken,
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.LessThanLessThanEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
]);

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

const expectedAllowedChildProcessScripts = [
  'scripts/operator-smoke.mjs',
  'prompts-mvp/scripts/operator-smoke.mjs',
];
const expectedPromptAtlasBoundaryOptInSmokeScripts = [
  'prompts-mvp:db:readiness:smoke',
  'prompts-mvp:execute:live:smoke',
  'prompts-mvp:stripe:live:smoke',
  'prompts-mvp:ui:smoke',
  'prompts-mvp:vercel:env:smoke',
];

assert(
  allowedChildProcessScripts.size === expectedAllowedChildProcessScripts.length &&
    expectedAllowedChildProcessScripts.every((scriptPath) => allowedChildProcessScripts.has(scriptPath)),
  'child-process execution must stay limited to the root and Prompt Atlas operator runners',
);
assert(
  promptAtlasBoundaryOptInSmokeScripts.size === expectedPromptAtlasBoundaryOptInSmokeScripts.length &&
    expectedPromptAtlasBoundaryOptInSmokeScripts.every((scriptName) =>
      promptAtlasBoundaryOptInSmokeScripts.has(scriptName),
    ),
  'Prompt Atlas boundary opt-ins must stay limited to browser, production database, live execution, Vercel env, and live Stripe checks',
);

function literalText(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function templateExpressionStringValue(node, literalStringBindings = new Map()) {
  let value = node.head.text;
  for (const span of node.templateSpans) {
    const spanValue = literalStringValue(span.expression, literalStringBindings);
    if (spanValue === null) {
      return null;
    }
    value += `${spanValue}${span.literal.text}`;
  }
  return value;
}

function isStringRawTag(node) {
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    return node.expression.text === 'String' && node.name.text === 'raw';
  }

  if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)) {
    return node.expression.text === 'String' && literalText(node.argumentExpression) === 'raw';
  }

  return false;
}

function literalStringValue(node, literalStringBindings = new Map()) {
  const text = literalText(node);
  if (text !== null) {
    return text;
  }

  if (ts.isIdentifier(node)) {
    return literalStringBindings.get(node.text) ?? null;
  }

  if (ts.isParenthesizedExpression(node)) {
    return literalStringValue(node.expression, literalStringBindings);
  }

  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = literalStringValue(node.left, literalStringBindings);
    const right = literalStringValue(node.right, literalStringBindings);
    return left !== null && right !== null ? `${left}${right}` : null;
  }

  if (ts.isTemplateExpression(node)) {
    return templateExpressionStringValue(node, literalStringBindings);
  }

  if (ts.isTaggedTemplateExpression(node) && isStringRawTag(node.tag)) {
    const templateText = literalText(node.template);
    if (templateText !== null) {
      return templateText;
    }

    if (ts.isTemplateExpression(node.template)) {
      return templateExpressionStringValue(node.template, literalStringBindings);
    }
  }

  return null;
}

function literalTexts(node, literalStringBindings = new Map()) {
  const text = literalStringValue(node, literalStringBindings);
  if (text !== null) {
    return [text];
  }

  if (ts.isCallExpression(node)) {
    return node.arguments.flatMap((argument) => literalTexts(argument, literalStringBindings));
  }

  if (ts.isNewExpression(node)) {
    return (node.arguments ?? []).flatMap((argument) => literalTexts(argument, literalStringBindings));
  }

  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.flatMap((element) => literalTexts(element, literalStringBindings));
  }

  return [];
}

function collectLiteralStringBindings(sourceFile) {
  const literalStringBindings = new Map();

  function collectAliases(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const value = literalStringValue(node.initializer, literalStringBindings);
      if (value !== null) {
        literalStringBindings.set(node.name.text, value);
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      const value = literalStringValue(node.right, literalStringBindings);
      if (value !== null) {
        literalStringBindings.set(node.left.text, value);
      }
    }

    ts.forEachChild(node, collectAliases);
  }

  collectAliases(sourceFile);

  return literalStringBindings;
}

function isFileReadCall(expressionText, fileReadIdentifiers = new Set()) {
  return (
    fileReadIdentifiers.has(expressionText) ||
    fileReadCalls.has(expressionText) ||
    [...fileReadCalls].some((callName) => expressionText.endsWith(`.${callName}`))
  );
}

function isFileSystemMutationCall(expressionText, fileMutationIdentifiers = new Set()) {
  return (
    fileMutationIdentifiers.has(expressionText) ||
    fileSystemMutationCalls.has(expressionText) ||
    [...fileSystemMutationCalls].some((callName) => expressionText.endsWith(`.${callName}`))
  );
}

function isChildProcessExecutionCall(expressionText, childProcessExecutionIdentifiers = new Set()) {
  return (
    childProcessExecutionIdentifiers.has(expressionText) ||
    childProcessExecutionCalls.has(expressionText) ||
    [...childProcessExecutionCalls].some((callName) => expressionText.endsWith(`.${callName}`))
  );
}

function isHttpClientRequestCall(expressionText, httpClientRequestIdentifiers = new Set()) {
  return httpClientRequestIdentifiers.has(expressionText) || httpClientRequestCallExpressions.has(expressionText);
}

function isNamespaceMemberExpression(expressionText, namespaceIdentifiers, memberNames) {
  return [...namespaceIdentifiers].some((namespaceIdentifier) =>
    [...memberNames].some((memberName) => expressionText === `${namespaceIdentifier}.${memberName}`),
  );
}

function isDynamicCodeCall(expressionText, dynamicCodeIdentifiers = new Set()) {
  return (
    dynamicCodeIdentifiers.has(expressionText) ||
    blockedDynamicCodeCallExpressions.has(expressionText) ||
    isConstructorChainDynamicCodeExpression(expressionText)
  );
}

function isTimerCall(expressionText, timerIdentifiers = new Set()) {
  return timerIdentifiers.has(expressionText) || timerCallExpressions.has(expressionText);
}

function isProviderHelperCall(expressionText, providerHelperIdentifiers = new Set()) {
  return (
    providerHelperIdentifiers.has(expressionText) ||
    providerHelperCalls.has(expressionText) ||
    expressionText.endsWith('.createClient')
  );
}

function isEmailSendCall(expressionText, emailSendIdentifiers = new Set()) {
  return (
    emailSendIdentifiers.has(expressionText) ||
    emailSendCallExpressions.has(expressionText) ||
    expressionText.endsWith('.emails.send') ||
    expressionText.endsWith('.sendPublicLeadNotification')
  );
}

function isStripeMutationCall(expressionText, stripeMutationIdentifiers = new Set()) {
  return (
    stripeMutationIdentifiers.has(expressionText) ||
    [...stripeMutationCallSuffixes].some(
      (suffix) => expressionText === suffix || expressionText.endsWith(`.${suffix}`),
    )
  );
}

function isBlockedConstructorExpression(expressionText, blockedConstructorIdentifiers = new Set()) {
  return (
    blockedConstructorIdentifiers.has(expressionText) ||
    blockedNewExpressions.has(expressionText) ||
    [...blockedNewExpressions].some((blockedExpression) => expressionText.endsWith(`.${blockedExpression}`))
  );
}

function isReflectConstructCall(expressionText, reflectConstructIdentifiers = new Set()) {
  return reflectConstructIdentifiers.has(expressionText) || reflectConstructCallExpressions.has(expressionText);
}

function isReflectApplyCall(expressionText, reflectApplyIdentifiers = new Set()) {
  return reflectApplyIdentifiers.has(expressionText) || reflectApplyCallExpressions.has(expressionText);
}

function isSensitiveEnvFilePath(pathText) {
  const fileName = pathText.replaceAll('\\', '/').split('/').pop();
  return Boolean(fileName && sensitiveEnvFileNames.has(fileName));
}

function isConstructorChainDynamicCodeExpression(expressionText) {
  return expressionText === 'constructor.constructor' || expressionText.endsWith('.constructor.constructor');
}

function expressionName(node, sourceFile) {
  if (!node) return null;

  if (ts.isIdentifier(node)) {
    return node.text;
  }

  if (ts.isPropertyAccessExpression(node)) {
    const baseName = expressionName(node.expression, sourceFile);
    return baseName ? `${baseName}.${node.name.text}` : node.getText(sourceFile);
  }

  if (ts.isElementAccessExpression(node)) {
    const baseName = expressionName(node.expression, sourceFile);
    const propertyName = literalText(node.argumentExpression);
    return baseName && propertyName ? `${baseName}.${propertyName}` : node.getText(sourceFile);
  }

  if (ts.isParenthesizedExpression(node)) {
    return expressionName(node.expression, sourceFile);
  }

  return node.getText(sourceFile);
}

function isProcessExpression(node, sourceFile, processIdentifiers = new Set()) {
  const expressionText = expressionName(node, sourceFile);
  return processExpressionNames.has(expressionText) || processIdentifiers.has(expressionText);
}

function isProcessEnvExpression(node, sourceFile, processEnvIdentifiers = new Set(), processIdentifiers = new Set()) {
  const expressionText = expressionName(node, sourceFile);
  const processEnvExpressionNames = [
    ...[...processExpressionNames].map((expressionNameText) => `${expressionNameText}.env`),
    ...[...processIdentifiers].map((expressionNameText) => `${expressionNameText}.env`),
  ];
  if (
    processEnvExpressionNames.some(
      (envExpressionName) =>
        expressionText === envExpressionName ||
        expressionText.startsWith(`${envExpressionName}.`) ||
        expressionText.startsWith(`${envExpressionName}[`),
    )
  ) {
    return true;
  }

  for (const identifier of processEnvIdentifiers) {
    if (
      expressionText === identifier ||
      expressionText.startsWith(`${identifier}.`) ||
      expressionText.startsWith(`${identifier}[`)
    ) {
      return true;
    }
  }

  return false;
}

function processEnvMutationHelperName(expressionText, processEnvMutationHelpers = new Map()) {
  if (processEnvMutationCallExpressions.has(expressionText)) {
    return expressionText;
  }

  return processEnvMutationHelpers.get(expressionText) ?? null;
}

function boundProcessEnvMutationHelperName(
  node,
  sourceFile,
  processEnvMutationHelpers = new Map(),
  helperNameForExpression = (expressionText) =>
    processEnvMutationHelperName(expressionText, processEnvMutationHelpers),
) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
    return null;
  }

  if (node.expression.name.text !== 'bind') {
    return null;
  }

  return helperNameForExpression(expressionName(node.expression.expression, sourceFile));
}

function bindingPropertyNameText(bindingElement) {
  const propertyName = bindingElement.propertyName ?? bindingElement.name;
  return literalText(propertyName) ?? (ts.isIdentifier(propertyName) ? propertyName.text : null);
}

function isGlobalObjectExpression(node, sourceFile) {
  return globalObjectExpressionNames.has(expressionName(node, sourceFile));
}

function processBindingName(bindingName) {
  if (!ts.isObjectBindingPattern(bindingName)) {
    return null;
  }

  const processBinding = bindingName.elements.find((element) => bindingPropertyNameText(element) === 'process');
  if (processBinding && ts.isIdentifier(processBinding.name)) {
    return processBinding.name.text;
  }

  return null;
}

function processEnvBindingName(bindingName) {
  if (ts.isIdentifier(bindingName)) {
    return bindingName.text;
  }

  if (ts.isObjectBindingPattern(bindingName)) {
    const envBinding = bindingName.elements.find((element) => bindingPropertyNameText(element) === 'env');

    if (envBinding && ts.isIdentifier(envBinding.name)) {
      return envBinding.name.text;
    }
  }

  return null;
}

function nestedProcessEnvBindingName(bindingName) {
  if (!ts.isObjectBindingPattern(bindingName)) {
    return null;
  }

  const processBinding = bindingName.elements.find((element) => bindingPropertyNameText(element) === 'process');
  if (processBinding && ts.isObjectBindingPattern(processBinding.name)) {
    return processEnvBindingName(processBinding.name);
  }

  return null;
}

function isCreateRequireExpression(expression, sourceFile, createRequireIdentifiers, moduleNamespaceIdentifiers) {
  if (ts.isIdentifier(expression)) {
    return createRequireIdentifiers.has(expression.text);
  }

  if (ts.isPropertyAccessExpression(expression) && expression.name.text === 'createRequire') {
    const targetText = expressionName(expression.expression, sourceFile);
    return moduleNamespaceIdentifiers.has(targetText);
  }

  return false;
}

function collectCommonJsRequireIdentifiers(sourceFile) {
  const createRequireIdentifiers = new Set();
  const moduleNamespaceIdentifiers = new Set();
  const requireIdentifiers = new Set(['require']);

  function isRequireLikeExpression(expression) {
    if (ts.isIdentifier(expression)) {
      return requireIdentifiers.has(expression.text);
    }

    if (ts.isCallExpression(expression)) {
      return isCreateRequireExpression(
        expression.expression,
        sourceFile,
        createRequireIdentifiers,
        moduleNamespaceIdentifiers,
      );
    }

    return false;
  }

  function isBoundRequireExpression(expression) {
    return (
      ts.isCallExpression(expression) &&
      ts.isPropertyAccessExpression(expression.expression) &&
      expression.expression.name.text === 'bind' &&
      isRequireLikeExpression(expression.expression.expression)
    );
  }

  function collectImports(node) {
    if (ts.isImportDeclaration(node) && commonJsRequireSourceModules.has(literalText(node.moduleSpecifier))) {
      const namedBindings = node.importClause?.namedBindings;
      if (namedBindings && ts.isNamespaceImport(namedBindings)) {
        moduleNamespaceIdentifiers.add(namedBindings.name.text);
      }
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          const importedName = element.propertyName?.text ?? element.name.text;
          if (importedName === 'createRequire') {
            createRequireIdentifiers.add(element.name.text);
          }
        }
      }
    }

    ts.forEachChild(node, collectImports);
  }

  function collectRequireAliases(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (
        ts.isCallExpression(node.initializer) &&
        isCreateRequireExpression(node.initializer.expression, sourceFile, createRequireIdentifiers, moduleNamespaceIdentifiers)
      ) {
        requireIdentifiers.add(node.name.text);
      }

      if (ts.isIdentifier(node.initializer) && requireIdentifiers.has(node.initializer.text)) {
        requireIdentifiers.add(node.name.text);
      }

      if (isBoundRequireExpression(node.initializer)) {
        requireIdentifiers.add(node.name.text);
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      if (ts.isIdentifier(node.right) && requireIdentifiers.has(node.right.text)) {
        requireIdentifiers.add(node.left.text);
      }

      if (isBoundRequireExpression(node.right)) {
        requireIdentifiers.add(node.left.text);
      }
    }

    ts.forEachChild(node, collectRequireAliases);
  }

  collectImports(sourceFile);
  collectRequireAliases(sourceFile);

  return { createRequireIdentifiers, moduleNamespaceIdentifiers, requireIdentifiers };
}

function collectChildProcessExecutionIdentifiers(sourceFile) {
  const childProcessExecutionIdentifiers = new Set();
  const childProcessNamespaceIdentifiers = new Set();

  function collectImports(node) {
    if (ts.isImportDeclaration(node) && childProcessSourceModules.has(literalText(node.moduleSpecifier))) {
      if (node.importClause?.name) {
        childProcessNamespaceIdentifiers.add(node.importClause.name.text);
      }

      const namedBindings = node.importClause?.namedBindings;
      if (namedBindings && ts.isNamespaceImport(namedBindings)) {
        childProcessNamespaceIdentifiers.add(namedBindings.name.text);
      }

      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          const importedName = element.propertyName?.text ?? element.name.text;
          if (childProcessExecutionCalls.has(importedName) && element.name.text !== importedName) {
            childProcessExecutionIdentifiers.add(element.name.text);
          }
        }
      }
    }

    ts.forEachChild(node, collectImports);
  }

  function collectAliases(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const initializerText = expressionName(node.initializer, sourceFile);

      if (ts.isIdentifier(node.name)) {
        if (childProcessNamespaceIdentifiers.has(initializerText)) {
          childProcessNamespaceIdentifiers.add(node.name.text);
        }

        if (
          isChildProcessExecutionCall(initializerText, childProcessExecutionIdentifiers) &&
          !childProcessExecutionCalls.has(node.name.text)
        ) {
          childProcessExecutionIdentifiers.add(node.name.text);
        }
      }

      if (ts.isObjectBindingPattern(node.name) && childProcessNamespaceIdentifiers.has(initializerText)) {
        for (const element of node.name.elements) {
          const propertyName = bindingPropertyNameText(element);
          if (
            propertyName &&
            childProcessExecutionCalls.has(propertyName) &&
            ts.isIdentifier(element.name) &&
            element.name.text !== propertyName
          ) {
            childProcessExecutionIdentifiers.add(element.name.text);
          }
        }
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      const rightText = expressionName(node.right, sourceFile);
      if (childProcessNamespaceIdentifiers.has(rightText)) {
        childProcessNamespaceIdentifiers.add(node.left.text);
      }

      if (
        isChildProcessExecutionCall(rightText, childProcessExecutionIdentifiers) &&
        !childProcessExecutionCalls.has(node.left.text)
      ) {
        childProcessExecutionIdentifiers.add(node.left.text);
      }
    }

    ts.forEachChild(node, collectAliases);
  }

  collectImports(sourceFile);
  collectAliases(sourceFile);

  return childProcessExecutionIdentifiers;
}

function collectHttpClientRequestIdentifiers(sourceFile) {
  const httpClientRequestIdentifiers = new Set();
  const httpClientRequestNamespaceIdentifiers = new Set(httpClientRequestNamespaces);

  function addHttpClientRequestNamespaceIdentifier(identifier) {
    httpClientRequestNamespaceIdentifiers.add(identifier);
    for (const memberName of httpClientRequestMembers) {
      httpClientRequestIdentifiers.add(`${identifier}.${memberName}`);
    }
  }

  function isHttpClientRequestExpression(expressionText) {
    return (
      isHttpClientRequestCall(expressionText, httpClientRequestIdentifiers) ||
      isNamespaceMemberExpression(
        expressionText,
        httpClientRequestNamespaceIdentifiers,
        httpClientRequestMembers,
      )
    );
  }

  function collectAliases(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const initializerText = expressionName(node.initializer, sourceFile);

      if (ts.isIdentifier(node.name)) {
        if (httpClientRequestNamespaceIdentifiers.has(initializerText)) {
          addHttpClientRequestNamespaceIdentifier(node.name.text);
        }

        if (isHttpClientRequestExpression(initializerText)) {
          httpClientRequestIdentifiers.add(node.name.text);
        }
      }

      if (ts.isObjectBindingPattern(node.name) && httpClientRequestNamespaceIdentifiers.has(initializerText)) {
        for (const element of node.name.elements) {
          const propertyName = bindingPropertyNameText(element);
          if (propertyName && httpClientRequestMembers.has(propertyName) && ts.isIdentifier(element.name)) {
            httpClientRequestIdentifiers.add(element.name.text);
          }
        }
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      const rightText = expressionName(node.right, sourceFile);
      if (httpClientRequestNamespaceIdentifiers.has(rightText)) {
        addHttpClientRequestNamespaceIdentifier(node.left.text);
      }

      if (isHttpClientRequestExpression(rightText)) {
        httpClientRequestIdentifiers.add(node.left.text);
      }
    }

    ts.forEachChild(node, collectAliases);
  }

  collectAliases(sourceFile);

  return httpClientRequestIdentifiers;
}

function collectDynamicCodeIdentifiers(sourceFile) {
  const dynamicCodeIdentifiers = new Set();
  const globalNamespaceIdentifiers = new Set(dynamicCodeGlobalNamespaceExpressions);
  const vmNamespaceIdentifiers = new Set();

  function isDynamicCodeExpression(expressionText) {
    return (
      isDynamicCodeCall(expressionText, dynamicCodeIdentifiers) ||
      isNamespaceMemberExpression(expressionText, globalNamespaceIdentifiers, dynamicCodeGlobalMembers) ||
      isNamespaceMemberExpression(expressionText, vmNamespaceIdentifiers, dynamicCodeVmMembers)
    );
  }

  function collectImports(node) {
    if (ts.isImportDeclaration(node) && dynamicCodeVmSourceModules.has(literalText(node.moduleSpecifier))) {
      if (node.importClause?.name) {
        vmNamespaceIdentifiers.add(node.importClause.name.text);
      }

      const namedBindings = node.importClause?.namedBindings;
      if (namedBindings && ts.isNamespaceImport(namedBindings)) {
        vmNamespaceIdentifiers.add(namedBindings.name.text);
      }

      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          const importedName = element.propertyName?.text ?? element.name.text;
          if (dynamicCodeVmMembers.has(importedName)) {
            dynamicCodeIdentifiers.add(element.name.text);
          }
        }
      }
    }

    ts.forEachChild(node, collectImports);
  }

  function collectAliases(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const initializerText = expressionName(node.initializer, sourceFile);

      if (ts.isIdentifier(node.name)) {
        if (globalNamespaceIdentifiers.has(initializerText)) {
          globalNamespaceIdentifiers.add(node.name.text);
        }

        if (vmNamespaceIdentifiers.has(initializerText)) {
          vmNamespaceIdentifiers.add(node.name.text);
        }

        if (isDynamicCodeExpression(initializerText) && !blockedDynamicCodeCallExpressions.has(node.name.text)) {
          dynamicCodeIdentifiers.add(node.name.text);
        }
      }

      if (ts.isObjectBindingPattern(node.name)) {
        const isGlobalNamespace = globalNamespaceIdentifiers.has(initializerText);
        const isVmNamespace = vmNamespaceIdentifiers.has(initializerText);

        for (const element of node.name.elements) {
          const propertyName = bindingPropertyNameText(element);
          if (!propertyName || !ts.isIdentifier(element.name)) {
            continue;
          }

          if (
            ((isGlobalNamespace && dynamicCodeGlobalMembers.has(propertyName)) ||
              (isVmNamespace && dynamicCodeVmMembers.has(propertyName))) &&
            !blockedDynamicCodeCallExpressions.has(element.name.text)
          ) {
            dynamicCodeIdentifiers.add(element.name.text);
          }
        }
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      const rightText = expressionName(node.right, sourceFile);

      if (globalNamespaceIdentifiers.has(rightText)) {
        globalNamespaceIdentifiers.add(node.left.text);
      }

      if (vmNamespaceIdentifiers.has(rightText)) {
        vmNamespaceIdentifiers.add(node.left.text);
      }

      if (isDynamicCodeExpression(rightText) && !blockedDynamicCodeCallExpressions.has(node.left.text)) {
        dynamicCodeIdentifiers.add(node.left.text);
      }
    }

    ts.forEachChild(node, collectAliases);
  }

  collectImports(sourceFile);
  collectAliases(sourceFile);

  return dynamicCodeIdentifiers;
}

function collectTimerIdentifiers(sourceFile) {
  const timerIdentifiers = new Set();
  const timerNamespaceIdentifiers = new Set(timerNamespaceExpressions);

  function isTimerExpression(expressionText) {
    return (
      isTimerCall(expressionText, timerIdentifiers) ||
      isNamespaceMemberExpression(expressionText, timerNamespaceIdentifiers, timerGlobalMembers)
    );
  }

  function collectAliases(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const initializerText = expressionName(node.initializer, sourceFile);

      if (ts.isIdentifier(node.name)) {
        if (timerNamespaceIdentifiers.has(initializerText)) {
          timerNamespaceIdentifiers.add(node.name.text);
        }

        if (isTimerExpression(initializerText)) {
          timerIdentifiers.add(node.name.text);
        }
      }

      if (ts.isObjectBindingPattern(node.name) && timerNamespaceIdentifiers.has(initializerText)) {
        for (const element of node.name.elements) {
          const propertyName = bindingPropertyNameText(element);
          if (propertyName && timerGlobalMembers.has(propertyName) && ts.isIdentifier(element.name)) {
            timerIdentifiers.add(element.name.text);
          }
        }
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      const rightText = expressionName(node.right, sourceFile);
      if (timerNamespaceIdentifiers.has(rightText)) {
        timerNamespaceIdentifiers.add(node.left.text);
      }

      if (isTimerExpression(rightText)) {
        timerIdentifiers.add(node.left.text);
      }
    }

    ts.forEachChild(node, collectAliases);
  }

  collectAliases(sourceFile);

  return timerIdentifiers;
}

function collectProviderHelperIdentifiers(sourceFile) {
  const providerHelperIdentifiers = new Set();

  function collectAliases(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const initializerText = expressionName(node.initializer, sourceFile);

      if (ts.isIdentifier(node.name) && isProviderHelperCall(initializerText, providerHelperIdentifiers)) {
        providerHelperIdentifiers.add(node.name.text);
      }

      if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          const propertyName = bindingPropertyNameText(element);
          if (propertyName && providerHelperCalls.has(propertyName) && ts.isIdentifier(element.name)) {
            providerHelperIdentifiers.add(element.name.text);
          }
        }
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      isProviderHelperCall(expressionName(node.right, sourceFile), providerHelperIdentifiers)
    ) {
      providerHelperIdentifiers.add(node.left.text);
    }

    ts.forEachChild(node, collectAliases);
  }

  collectAliases(sourceFile);

  return providerHelperIdentifiers;
}

function collectEmailSendIdentifiers(sourceFile) {
  const emailSendIdentifiers = new Set();
  const emailNamespaceIdentifiers = new Set();

  function isEmailNamespaceExpression(expressionText) {
    return emailNamespaceIdentifiers.has(expressionText) || expressionText.endsWith('.emails');
  }

  function collectAliases(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const initializerText = expressionName(node.initializer, sourceFile);

      if (ts.isIdentifier(node.name)) {
        if (isEmailNamespaceExpression(initializerText)) {
          emailNamespaceIdentifiers.add(node.name.text);
          emailSendIdentifiers.add(`${node.name.text}.send`);
        }

        if (isEmailSendCall(initializerText, emailSendIdentifiers)) {
          emailSendIdentifiers.add(node.name.text);
        }
      }

      if (ts.isObjectBindingPattern(node.name) && isEmailNamespaceExpression(initializerText)) {
        for (const element of node.name.elements) {
          const propertyName = bindingPropertyNameText(element);
          if (propertyName === 'send' && ts.isIdentifier(element.name)) {
            emailSendIdentifiers.add(element.name.text);
          }
        }
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      const rightText = expressionName(node.right, sourceFile);
      if (isEmailNamespaceExpression(rightText)) {
        emailNamespaceIdentifiers.add(node.left.text);
        emailSendIdentifiers.add(`${node.left.text}.send`);
      }

      if (isEmailSendCall(rightText, emailSendIdentifiers)) {
        emailSendIdentifiers.add(node.left.text);
      }
    }

    ts.forEachChild(node, collectAliases);
  }

  collectAliases(sourceFile);

  return emailSendIdentifiers;
}

function collectStripeMutationIdentifiers(sourceFile) {
  const stripeMutationIdentifiers = new Set();
  const stripeMutationNamespaceIdentifiers = new Set();

  function isStripeMutationNamespaceExpression(expressionText) {
    return (
      stripeMutationNamespaceIdentifiers.has(expressionText) ||
      [...stripeMutationNamespaceSuffixes].some(
        (suffix) => expressionText === suffix || expressionText.endsWith(`.${suffix}`),
      )
    );
  }

  function collectAliases(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const initializerText = expressionName(node.initializer, sourceFile);

      if (ts.isIdentifier(node.name)) {
        if (isStripeMutationNamespaceExpression(initializerText)) {
          stripeMutationNamespaceIdentifiers.add(node.name.text);
          stripeMutationIdentifiers.add(`${node.name.text}.create`);
        }

        if (isStripeMutationCall(initializerText, stripeMutationIdentifiers)) {
          stripeMutationIdentifiers.add(node.name.text);
        }
      }

      if (ts.isObjectBindingPattern(node.name) && isStripeMutationNamespaceExpression(initializerText)) {
        for (const element of node.name.elements) {
          const propertyName = bindingPropertyNameText(element);
          if (propertyName === 'create' && ts.isIdentifier(element.name)) {
            stripeMutationIdentifiers.add(element.name.text);
          }
        }
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      const rightText = expressionName(node.right, sourceFile);
      if (isStripeMutationNamespaceExpression(rightText)) {
        stripeMutationNamespaceIdentifiers.add(node.left.text);
        stripeMutationIdentifiers.add(`${node.left.text}.create`);
      }

      if (isStripeMutationCall(rightText, stripeMutationIdentifiers)) {
        stripeMutationIdentifiers.add(node.left.text);
      }
    }

    ts.forEachChild(node, collectAliases);
  }

  collectAliases(sourceFile);

  return stripeMutationIdentifiers;
}

function collectBlockedConstructorIdentifiers(sourceFile) {
  const blockedConstructorIdentifiers = new Set();
  const constructorNamespaceIdentifiers = new Set(constructorNamespaceExpressions);

  function collectAliases(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const initializerText = expressionName(node.initializer, sourceFile);

      if (ts.isIdentifier(node.name)) {
        if (constructorNamespaceIdentifiers.has(initializerText)) {
          constructorNamespaceIdentifiers.add(node.name.text);
        }

        if (isBlockedConstructorExpression(initializerText, blockedConstructorIdentifiers)) {
          blockedConstructorIdentifiers.add(node.name.text);
        }
      }

      if (ts.isObjectBindingPattern(node.name) && constructorNamespaceIdentifiers.has(initializerText)) {
        for (const element of node.name.elements) {
          const propertyName = bindingPropertyNameText(element);
          if (propertyName && blockedNewExpressions.has(propertyName) && ts.isIdentifier(element.name)) {
            blockedConstructorIdentifiers.add(element.name.text);
          }
        }
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      const rightText = expressionName(node.right, sourceFile);
      if (constructorNamespaceIdentifiers.has(rightText)) {
        constructorNamespaceIdentifiers.add(node.left.text);
      }

      if (isBlockedConstructorExpression(rightText, blockedConstructorIdentifiers)) {
        blockedConstructorIdentifiers.add(node.left.text);
      }
    }

    ts.forEachChild(node, collectAliases);
  }

  collectAliases(sourceFile);

  return blockedConstructorIdentifiers;
}

function collectFileReadIdentifiers(sourceFile) {
  const fileReadIdentifiers = new Set(fileReadCalls);

  function collectImports(node) {
    if (ts.isImportDeclaration(node) && fileReadSourceModules.has(literalText(node.moduleSpecifier))) {
      const namedBindings = node.importClause?.namedBindings;
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          const importedName = element.propertyName?.text ?? element.name.text;
          if (fileReadCalls.has(importedName)) {
            fileReadIdentifiers.add(element.name.text);
          }
        }
      }
    }

    ts.forEachChild(node, collectImports);
  }

  function collectAliases(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const initializerText = expressionName(node.initializer, sourceFile);
      if (isFileReadCall(initializerText, fileReadIdentifiers)) {
        fileReadIdentifiers.add(node.name.text);
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      isFileReadCall(expressionName(node.right, sourceFile), fileReadIdentifiers)
    ) {
      fileReadIdentifiers.add(node.left.text);
    }

    ts.forEachChild(node, collectAliases);
  }

  collectImports(sourceFile);
  collectAliases(sourceFile);

  return fileReadIdentifiers;
}

function collectFileMutationIdentifiers(sourceFile) {
  const fileMutationIdentifiers = new Set();
  const fileSystemNamespaceIdentifiers = new Set();

  function collectImports(node) {
    if (ts.isImportDeclaration(node) && fileReadSourceModules.has(literalText(node.moduleSpecifier))) {
      if (node.importClause?.name) {
        fileSystemNamespaceIdentifiers.add(node.importClause.name.text);
      }

      const namedBindings = node.importClause?.namedBindings;
      if (namedBindings && ts.isNamespaceImport(namedBindings)) {
        fileSystemNamespaceIdentifiers.add(namedBindings.name.text);
      }

      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          const importedName = element.propertyName?.text ?? element.name.text;
          if (fileSystemMutationCalls.has(importedName)) {
            fileMutationIdentifiers.add(element.name.text);
          }
        }
      }
    }

    ts.forEachChild(node, collectImports);
  }

  function collectAliases(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const initializerText = expressionName(node.initializer, sourceFile);

      if (ts.isIdentifier(node.name)) {
        if (fileSystemNamespaceIdentifiers.has(initializerText)) {
          fileSystemNamespaceIdentifiers.add(node.name.text);
        }

        if (isFileSystemMutationCall(initializerText, fileMutationIdentifiers)) {
          fileMutationIdentifiers.add(node.name.text);
        }
      }

      if (ts.isObjectBindingPattern(node.name) && fileSystemNamespaceIdentifiers.has(initializerText)) {
        for (const element of node.name.elements) {
          const propertyName = bindingPropertyNameText(element);
          if (propertyName && fileSystemMutationCalls.has(propertyName) && ts.isIdentifier(element.name)) {
            fileMutationIdentifiers.add(element.name.text);
          }
        }
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      const rightText = expressionName(node.right, sourceFile);
      if (fileSystemNamespaceIdentifiers.has(rightText)) {
        fileSystemNamespaceIdentifiers.add(node.left.text);
      }

      if (isFileSystemMutationCall(rightText, fileMutationIdentifiers)) {
        fileMutationIdentifiers.add(node.left.text);
      }
    }

    ts.forEachChild(node, collectAliases);
  }

  collectImports(sourceFile);
  collectAliases(sourceFile);

  return fileMutationIdentifiers;
}

function collectProcessIdentifiers(sourceFile) {
  const processIdentifiers = new Set();

  function collectAliases(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name) && isProcessExpression(node.initializer, sourceFile, processIdentifiers)) {
        processIdentifiers.add(node.name.text);
      }

      const destructuredProcessName = processBindingName(node.name);
      if (destructuredProcessName && isGlobalObjectExpression(node.initializer, sourceFile)) {
        processIdentifiers.add(destructuredProcessName);
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      isProcessExpression(node.right, sourceFile, processIdentifiers)
    ) {
      processIdentifiers.add(node.left.text);
    }

    ts.forEachChild(node, collectAliases);
  }

  collectAliases(sourceFile);

  return processIdentifiers;
}

function collectProcessEnvIdentifiers(sourceFile, processIdentifiers) {
  const processEnvIdentifiers = new Set();

  function collectAliases(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const bindingName = ts.isIdentifier(node.name) ? node.name.text : null;
      const destructuredEnvName = ts.isObjectBindingPattern(node.name) ? processEnvBindingName(node.name) : null;
      const nestedDestructuredEnvName = ts.isObjectBindingPattern(node.name) ? nestedProcessEnvBindingName(node.name) : null;

      if (
        bindingName &&
        isProcessEnvExpression(node.initializer, sourceFile, processEnvIdentifiers, processIdentifiers)
      ) {
        processEnvIdentifiers.add(bindingName);
      }

      if (destructuredEnvName && isProcessExpression(node.initializer, sourceFile, processIdentifiers)) {
        processEnvIdentifiers.add(destructuredEnvName);
      }

      if (nestedDestructuredEnvName && isGlobalObjectExpression(node.initializer, sourceFile)) {
        processEnvIdentifiers.add(nestedDestructuredEnvName);
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      isProcessEnvExpression(node.right, sourceFile, processEnvIdentifiers, processIdentifiers)
    ) {
      processEnvIdentifiers.add(node.left.text);
    }

    ts.forEachChild(node, collectAliases);
  }

  collectAliases(sourceFile);

  return processEnvIdentifiers;
}

function collectProcessEnvMutationHelpers(sourceFile) {
  const processEnvMutationHelpers = new Map();
  const processEnvMutationNamespaceAliases = new Map();

  function addNamespaceAlias(aliasName, canonicalNamespaceName) {
    processEnvMutationNamespaceAliases.set(aliasName, canonicalNamespaceName);

    for (const helperName of processEnvMutationCallExpressions) {
      if (helperName.startsWith(`${canonicalNamespaceName}.`)) {
        const memberName = helperName.slice(canonicalNamespaceName.length + 1);
        processEnvMutationHelpers.set(`${aliasName}.${memberName}`, helperName);
      }
    }
  }

  for (const namespaceName of processEnvMutationNamespaces) {
    addNamespaceAlias(namespaceName, namespaceName);
  }

  function namespaceCanonicalName(expressionText) {
    return processEnvMutationNamespaceAliases.get(expressionText) ?? null;
  }

  function helperNameForExpression(expressionText) {
    return processEnvMutationHelperName(expressionText, processEnvMutationHelpers);
  }

  function collectAliases(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name)) {
        const namespaceName = namespaceCanonicalName(expressionName(node.initializer, sourceFile));
        if (namespaceName) {
          addNamespaceAlias(node.name.text, namespaceName);
        }

        const helperName =
          helperNameForExpression(expressionName(node.initializer, sourceFile)) ??
          boundProcessEnvMutationHelperName(
            node.initializer,
            sourceFile,
            processEnvMutationHelpers,
            helperNameForExpression,
          );
        if (helperName) {
          processEnvMutationHelpers.set(node.name.text, helperName);
        }
      }

      if (ts.isObjectBindingPattern(node.name) && namespaceCanonicalName(expressionName(node.initializer, sourceFile))) {
        const namespaceName = namespaceCanonicalName(expressionName(node.initializer, sourceFile));
        for (const element of node.name.elements) {
          const propertyName = bindingPropertyNameText(element);
          if (!propertyName || !ts.isIdentifier(element.name)) {
            continue;
          }

          const helperName = helperNameForExpression(`${namespaceName}.${propertyName}`);
          if (helperName) {
            processEnvMutationHelpers.set(element.name.text, helperName);
          }
        }
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      const namespaceName = namespaceCanonicalName(expressionName(node.right, sourceFile));
      if (namespaceName) {
        addNamespaceAlias(node.left.text, namespaceName);
      }

      const helperName =
        helperNameForExpression(expressionName(node.right, sourceFile)) ??
        boundProcessEnvMutationHelperName(
          node.right,
          sourceFile,
          processEnvMutationHelpers,
          helperNameForExpression,
        );
      if (helperName) {
        processEnvMutationHelpers.set(node.left.text, helperName);
      }
    }

    ts.forEachChild(node, collectAliases);
  }

  collectAliases(sourceFile);

  return processEnvMutationHelpers;
}

function collectReflectConstructIdentifiers(sourceFile) {
  const reflectConstructIdentifiers = new Set();
  const reflectNamespaceIdentifiers = new Set(reflectConstructNamespaces);

  function isReflectConstructExpression(expressionText) {
    return (
      isReflectConstructCall(expressionText, reflectConstructIdentifiers) ||
      isNamespaceMemberExpression(expressionText, reflectNamespaceIdentifiers, reflectConstructMembers)
    );
  }

  function collectAliases(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const initializerText = expressionName(node.initializer, sourceFile);

      if (ts.isIdentifier(node.name)) {
        if (reflectNamespaceIdentifiers.has(initializerText)) {
          reflectNamespaceIdentifiers.add(node.name.text);
        }

        if (isReflectConstructExpression(initializerText)) {
          reflectConstructIdentifiers.add(node.name.text);
        }
      }

      if (ts.isObjectBindingPattern(node.name) && reflectNamespaceIdentifiers.has(initializerText)) {
        for (const element of node.name.elements) {
          const propertyName = bindingPropertyNameText(element);
          if (propertyName && reflectConstructMembers.has(propertyName) && ts.isIdentifier(element.name)) {
            reflectConstructIdentifiers.add(element.name.text);
          }
        }
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      const rightText = expressionName(node.right, sourceFile);
      if (reflectNamespaceIdentifiers.has(rightText)) {
        reflectNamespaceIdentifiers.add(node.left.text);
      }

      if (isReflectConstructExpression(rightText)) {
        reflectConstructIdentifiers.add(node.left.text);
      }
    }

    ts.forEachChild(node, collectAliases);
  }

  collectAliases(sourceFile);

  return reflectConstructIdentifiers;
}

function collectReflectApplyIdentifiers(sourceFile) {
  const reflectApplyIdentifiers = new Set(reflectApplyCallExpressions);
  const reflectNamespaceIdentifiers = new Set(reflectApplyNamespaces);

  function addReflectNamespaceIdentifier(identifier) {
    reflectNamespaceIdentifiers.add(identifier);
    for (const memberName of reflectApplyMembers) {
      reflectApplyIdentifiers.add(`${identifier}.${memberName}`);
    }
  }

  function isReflectApplyExpression(expressionText) {
    return (
      isReflectApplyCall(expressionText, reflectApplyIdentifiers) ||
      isNamespaceMemberExpression(expressionText, reflectNamespaceIdentifiers, reflectApplyMembers)
    );
  }

  function collectAliases(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const initializerText = expressionName(node.initializer, sourceFile);

      if (ts.isIdentifier(node.name)) {
        if (reflectNamespaceIdentifiers.has(initializerText)) {
          addReflectNamespaceIdentifier(node.name.text);
        }

        if (isReflectApplyExpression(initializerText)) {
          reflectApplyIdentifiers.add(node.name.text);
        }
      }

      if (ts.isObjectBindingPattern(node.name) && reflectNamespaceIdentifiers.has(initializerText)) {
        for (const element of node.name.elements) {
          const propertyName = bindingPropertyNameText(element);
          if (propertyName && reflectApplyMembers.has(propertyName) && ts.isIdentifier(element.name)) {
            reflectApplyIdentifiers.add(element.name.text);
          }
        }
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      const rightText = expressionName(node.right, sourceFile);
      if (reflectNamespaceIdentifiers.has(rightText)) {
        addReflectNamespaceIdentifier(node.left.text);
      }

      if (isReflectApplyExpression(rightText)) {
        reflectApplyIdentifiers.add(node.left.text);
      }
    }

    ts.forEachChild(node, collectAliases);
  }

  collectAliases(sourceFile);

  return reflectApplyIdentifiers;
}

function collectRuntimeFetchIdentifiers(sourceFile) {
  const runtimeFetchIdentifiers = new Set();
  const runtimeFetchNamespaceIdentifiers = new Set(fetchNamespaceExpressions);

  function addRuntimeFetchNamespaceIdentifier(identifier) {
    runtimeFetchNamespaceIdentifiers.add(identifier);
    runtimeFetchIdentifiers.add(`${identifier}.fetch`);
  }

  function isRuntimeFetchExpression(expressionText) {
    return (
      fetchCallExpressions.has(expressionText) ||
      runtimeFetchIdentifiers.has(expressionText) ||
      isNamespaceMemberExpression(expressionText, runtimeFetchNamespaceIdentifiers, new Set(['fetch']))
    );
  }

  function collectAliases(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const initializerText = expressionName(node.initializer, sourceFile);

      if (ts.isIdentifier(node.name)) {
        if (runtimeFetchNamespaceIdentifiers.has(initializerText)) {
          addRuntimeFetchNamespaceIdentifier(node.name.text);
        }

        if (isRuntimeFetchExpression(initializerText)) {
          runtimeFetchIdentifiers.add(node.name.text);
        }
      }

      if (ts.isObjectBindingPattern(node.name) && runtimeFetchNamespaceIdentifiers.has(initializerText)) {
        for (const element of node.name.elements) {
          if (bindingPropertyNameText(element) === 'fetch' && ts.isIdentifier(element.name)) {
            runtimeFetchIdentifiers.add(element.name.text);
          }
        }
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      const rightText = expressionName(node.right, sourceFile);
      if (runtimeFetchNamespaceIdentifiers.has(rightText)) {
        addRuntimeFetchNamespaceIdentifier(node.left.text);
      }

      if (isRuntimeFetchExpression(rightText)) {
        runtimeFetchIdentifiers.add(node.left.text);
      }
    }

    ts.forEachChild(node, collectAliases);
  }

  collectAliases(sourceFile);

  return runtimeFetchIdentifiers;
}

function isCommonJsRequireExpression(expression, sourceFile, commonJsBindings) {
  if (ts.isIdentifier(expression)) {
    return commonJsBindings.requireIdentifiers.has(expression.text);
  }

  if (ts.isCallExpression(expression)) {
    return isCreateRequireExpression(
      expression.expression,
      sourceFile,
      commonJsBindings.createRequireIdentifiers,
      commonJsBindings.moduleNamespaceIdentifiers,
    );
  }

  return false;
}

function commonJsRequireInvocation(callExpression, sourceFile, commonJsBindings, reflectApplyIdentifiers = new Set()) {
  const { expression } = callExpression;

  if (isCommonJsRequireExpression(expression, sourceFile, commonJsBindings)) {
    return { matched: true, argument: callExpression.arguments[0] ?? null };
  }

  if (
    ts.isPropertyAccessExpression(expression) &&
    ['apply', 'bind', 'call'].includes(expression.name.text) &&
    isCommonJsRequireExpression(expression.expression, sourceFile, commonJsBindings)
  ) {
    if (expression.name.text === 'bind' && callExpression.arguments.length <= 1) {
      return { matched: false, argument: null };
    }

    return {
      matched: true,
      argument: expression.name.text === 'apply'
        ? callExpression.arguments[1] ?? null
        : callExpression.arguments[1] ?? null,
    };
  }

  if (
    isReflectApplyCall(expressionName(expression, sourceFile), reflectApplyIdentifiers) &&
    callExpression.arguments[0] &&
    isCommonJsRequireExpression(callExpression.arguments[0], sourceFile, commonJsBindings)
  ) {
    return { matched: true, argument: callExpression.arguments[2] ?? null };
  }

  return { matched: false, argument: null };
}

function fileReadInvocation(callExpression, sourceFile, fileReadIdentifiers, reflectApplyIdentifiers = new Set()) {
  const { expression } = callExpression;
  const expressionText = expressionName(expression, sourceFile);

  if (isFileReadCall(expressionText, fileReadIdentifiers)) {
    return { matched: true, arguments: callExpression.arguments };
  }

  if (ts.isPropertyAccessExpression(expression) && isFileReadCall(expressionName(expression.expression, sourceFile), fileReadIdentifiers)) {
    if (['bind', 'call'].includes(expression.name.text)) {
      return { matched: true, arguments: callExpression.arguments.slice(1) };
    }

    if (expression.name.text === 'apply') {
      return { matched: true, arguments: [callExpression.arguments[1]].filter(Boolean) };
    }
  }

  if (
    isReflectApplyCall(expressionText, reflectApplyIdentifiers) &&
    callExpression.arguments[0] &&
    isFileReadCall(expressionName(callExpression.arguments[0], sourceFile), fileReadIdentifiers)
  ) {
    return { matched: true, arguments: [callExpression.arguments[2]].filter(Boolean) };
  }

  return { matched: false, arguments: [] };
}

function firstArrayArgument(node) {
  if (node && ts.isArrayLiteralExpression(node)) {
    return node.elements[0] ?? null;
  }

  return node ?? null;
}

function processEnvMutationInvocation(
  callExpression,
  sourceFile,
  expressionText,
  processEnvMutationHelpers = new Map(),
  reflectApplyIdentifiers = new Set(),
) {
  const { expression } = callExpression;
  const directHelper = processEnvMutationHelperName(expressionText, processEnvMutationHelpers);

  if (directHelper) {
    return { matched: true, target: callExpression.arguments[0] ?? null, helper: directHelper };
  }

  const wrappedHelper = ts.isPropertyAccessExpression(expression)
    ? processEnvMutationHelperName(expressionName(expression.expression, sourceFile), processEnvMutationHelpers)
    : null;
  if (
    ts.isPropertyAccessExpression(expression) &&
    wrappedHelper
  ) {
    if (['bind', 'call'].includes(expression.name.text)) {
      return { matched: true, target: callExpression.arguments[1] ?? null, helper: wrappedHelper };
    }

    if (expression.name.text === 'apply') {
      return { matched: true, target: firstArrayArgument(callExpression.arguments[1]), helper: wrappedHelper };
    }
  }

  const reflectApplyHelper = callExpression.arguments[0]
    ? processEnvMutationHelperName(expressionName(callExpression.arguments[0], sourceFile), processEnvMutationHelpers)
    : null;
  if (
    isReflectApplyCall(expressionText, reflectApplyIdentifiers) &&
    callExpression.arguments[0] &&
    reflectApplyHelper
  ) {
    return {
      matched: true,
      target: firstArrayArgument(callExpression.arguments[2]),
      helper: reflectApplyHelper,
    };
  }

  return { matched: false, target: null, helper: null };
}

function reflectConstructInvocation(
  callExpression,
  sourceFile,
  expressionText,
  reflectConstructIdentifiers = new Set(),
  reflectApplyIdentifiers = new Set(),
) {
  const { expression } = callExpression;
  const directHelper = isReflectConstructCall(expressionText, reflectConstructIdentifiers) ? expressionText : null;

  if (directHelper) {
    return { matched: true, target: callExpression.arguments[0] ?? null, helper: directHelper };
  }

  const wrappedHelper = ts.isPropertyAccessExpression(expression) &&
    isReflectConstructCall(expressionName(expression.expression, sourceFile), reflectConstructIdentifiers)
    ? expressionName(expression.expression, sourceFile)
    : null;
  if (ts.isPropertyAccessExpression(expression) && wrappedHelper) {
    if (['bind', 'call'].includes(expression.name.text)) {
      return { matched: true, target: callExpression.arguments[1] ?? null, helper: wrappedHelper };
    }

    if (expression.name.text === 'apply') {
      return { matched: true, target: firstArrayArgument(callExpression.arguments[1]), helper: wrappedHelper };
    }
  }

  const reflectApplyHelper = callExpression.arguments[0] &&
    isReflectConstructCall(expressionName(callExpression.arguments[0], sourceFile), reflectConstructIdentifiers)
    ? expressionName(callExpression.arguments[0], sourceFile)
    : null;
  if (isReflectApplyCall(expressionText, reflectApplyIdentifiers) && reflectApplyHelper) {
    return {
      matched: true,
      target: firstArrayArgument(callExpression.arguments[2]),
      helper: reflectApplyHelper,
    };
  }

  return { matched: false, target: null, helper: null };
}

function timerInvocation(callExpression, sourceFile, candidateExpressionText, reflectApplyIdentifiers = new Set()) {
  const { expression } = callExpression;
  const expressionText = expressionName(expression, sourceFile);

  if (expressionText === candidateExpressionText) {
    return { matched: true, arguments: [callExpression.arguments[0]].filter(Boolean) };
  }

  if (
    ts.isPropertyAccessExpression(expression) &&
    expressionName(expression.expression, sourceFile) === candidateExpressionText
  ) {
    if (['bind', 'call'].includes(expression.name.text)) {
      return { matched: true, arguments: [callExpression.arguments[1]].filter(Boolean) };
    }

    if (expression.name.text === 'apply') {
      return { matched: true, arguments: [firstArrayArgument(callExpression.arguments[1])].filter(Boolean) };
    }
  }

  if (
    isReflectApplyCall(expressionText, reflectApplyIdentifiers) &&
    callExpression.arguments[0] &&
    expressionName(callExpression.arguments[0], sourceFile) === candidateExpressionText
  ) {
    return { matched: true, arguments: [firstArrayArgument(callExpression.arguments[2])].filter(Boolean) };
  }

  return { matched: false, arguments: [] };
}

function wrappedCallTargetText(callExpression, sourceFile, reflectApplyIdentifiers = new Set()) {
  const { expression } = callExpression;

  if (
    isReflectApplyCall(expressionName(expression, sourceFile), reflectApplyIdentifiers) &&
    callExpression.arguments[0]
  ) {
    return expressionName(callExpression.arguments[0], sourceFile);
  }

  if (
    ts.isPropertyAccessExpression(expression) &&
    ['apply', 'bind', 'call'].includes(expression.name.text)
  ) {
    return expressionName(expression.expression, sourceFile);
  }

  return null;
}

function candidateCallExpressionTexts(callExpression, sourceFile, reflectApplyIdentifiers = new Set()) {
  const expressionTexts = new Set([expressionName(callExpression.expression, sourceFile)]);
  const wrappedTargetText = wrappedCallTargetText(callExpression, sourceFile, reflectApplyIdentifiers);
  if (wrappedTargetText) {
    expressionTexts.add(wrappedTargetText);
  }
  return [...expressionTexts];
}

function scanSmokeScriptSource(scriptPath, sourceText, recordFailure = fail) {
  const sourceFile = ts.createSourceFile(scriptPath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const literalStringBindings = collectLiteralStringBindings(sourceFile);
  const commonJsBindings = collectCommonJsRequireIdentifiers(sourceFile);
  const blockedConstructorIdentifiers = collectBlockedConstructorIdentifiers(sourceFile);
  const childProcessExecutionIdentifiers = collectChildProcessExecutionIdentifiers(sourceFile);
  const dynamicCodeIdentifiers = collectDynamicCodeIdentifiers(sourceFile);
  const emailSendIdentifiers = collectEmailSendIdentifiers(sourceFile);
  const fileReadIdentifiers = collectFileReadIdentifiers(sourceFile);
  const fileMutationIdentifiers = collectFileMutationIdentifiers(sourceFile);
  const httpClientRequestIdentifiers = collectHttpClientRequestIdentifiers(sourceFile);
  const processIdentifiers = collectProcessIdentifiers(sourceFile);
  const processEnvIdentifiers = collectProcessEnvIdentifiers(sourceFile, processIdentifiers);
  const processEnvMutationHelpers = collectProcessEnvMutationHelpers(sourceFile);
  const providerHelperIdentifiers = collectProviderHelperIdentifiers(sourceFile);
  const reflectApplyIdentifiers = collectReflectApplyIdentifiers(sourceFile);
  const reflectConstructIdentifiers = collectReflectConstructIdentifiers(sourceFile);
  const runtimeFetchIdentifiers = collectRuntimeFetchIdentifiers(sourceFile);
  const stripeMutationIdentifiers = collectStripeMutationIdentifiers(sourceFile);
  const timerIdentifiers = collectTimerIdentifiers(sourceFile);

  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const moduleName = literalText(node.moduleSpecifier);
      if (
        moduleName &&
        blockedModuleNames.has(moduleName) &&
        !(allowedChildProcessScripts.has(scriptPath) && childProcessSourceModules.has(moduleName))
      ) {
        recordFailure(`${scriptPath} imports blocked external/provider module ${moduleName}`);
      }
    }

    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const moduleName = literalText(node.moduleSpecifier);
      if (moduleName && blockedModuleNames.has(moduleName)) {
        recordFailure(`${scriptPath} re-exports blocked external/provider module ${moduleName}`);
      }
      if (moduleName && commonJsRequireSourceModules.has(moduleName)) {
        recordFailure(`${scriptPath} re-exports CommonJS require source module ${moduleName}`);
      }
    }

    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const moduleName = literalText(node.arguments[0]);
        if (moduleName && blockedModuleNames.has(moduleName)) {
          recordFailure(`${scriptPath} dynamically imports blocked external/provider module ${moduleName}`);
        }
        if (moduleName && commonJsRequireSourceModules.has(moduleName)) {
          recordFailure(`${scriptPath} dynamically imports CommonJS require source module ${moduleName}`);
        }
        recordFailure(`${scriptPath} contains dynamic import escape ${moduleName ?? '<dynamic specifier>'}`);
      }

      const expressionText = expressionName(node.expression, sourceFile);
      const commonJsRequireCall = commonJsRequireInvocation(node, sourceFile, commonJsBindings, reflectApplyIdentifiers);
      if (commonJsRequireCall.matched) {
        const moduleNames = commonJsRequireCall.argument
          ? literalTexts(commonJsRequireCall.argument, literalStringBindings)
          : [];
        const blockedModuleName = moduleNames.find((moduleName) =>
          blockedCommonJsRequireModuleNames.has(moduleName),
        );
        if (moduleNames.length === 0) {
          recordFailure(`${scriptPath} contains dynamic CommonJS require specifier via ${expressionText}`);
        } else if (blockedModuleName) {
          recordFailure(`${scriptPath} CommonJS-requires blocked module ${blockedModuleName}`);
        }
      }

      const fileReadCall = fileReadInvocation(node, sourceFile, fileReadIdentifiers, reflectApplyIdentifiers);
      if (fileReadCall.matched) {
        const sensitivePath = fileReadCall.arguments
          .flatMap((argument) => literalTexts(argument, literalStringBindings))
          .find(isSensitiveEnvFilePath);
        if (sensitivePath) {
          recordFailure(`${scriptPath} reads sensitive env file path ${sensitivePath}`);
        }
      }

      const processEnvMutationCall = processEnvMutationInvocation(
        node,
        sourceFile,
        expressionText,
        processEnvMutationHelpers,
        reflectApplyIdentifiers,
      );
      if (
        processEnvMutationCall.matched &&
        processEnvMutationCall.target &&
        isProcessEnvExpression(processEnvMutationCall.target, sourceFile, processEnvIdentifiers, processIdentifiers)
      ) {
        recordFailure(`${scriptPath} mutates process.env via ${processEnvMutationCall.helper}`);
      }

      const reflectConstructCall = reflectConstructInvocation(
        node,
        sourceFile,
        expressionText,
        reflectConstructIdentifiers,
        reflectApplyIdentifiers,
      );
      if (reflectConstructCall.matched && reflectConstructCall.target) {
        const targetText = expressionName(reflectConstructCall.target, sourceFile);
        if (isDynamicCodeCall(targetText, dynamicCodeIdentifiers)) {
          recordFailure(`${scriptPath} constructs dynamic code constructor ${targetText} via ${reflectConstructCall.helper}`);
        } else if (isBlockedConstructorExpression(targetText, blockedConstructorIdentifiers)) {
          recordFailure(`${scriptPath} constructs blocked external/provider client ${targetText} via ${reflectConstructCall.helper}`);
        }
      }

      for (const candidateExpressionText of candidateCallExpressionTexts(node, sourceFile, reflectApplyIdentifiers)) {
        if (runtimeFetchIdentifiers.has(candidateExpressionText) && !allowedFetchScripts.has(scriptPath)) {
          recordFailure(`${scriptPath} contains blocked runtime call ${candidateExpressionText} (runtime fetch)`);
        }

        if (childProcessExecutionIdentifiers.has(candidateExpressionText)) {
          recordFailure(`${scriptPath} contains blocked runtime call ${candidateExpressionText} (child process execution)`);
        }

        if (dynamicCodeIdentifiers.has(candidateExpressionText)) {
          recordFailure(`${scriptPath} contains blocked runtime call ${candidateExpressionText} (dynamic code execution)`);
        }

        if (emailSendIdentifiers.has(candidateExpressionText)) {
          recordFailure(`${scriptPath} contains blocked runtime call ${candidateExpressionText} (email send)`);
        }

        if (providerHelperIdentifiers.has(candidateExpressionText)) {
          recordFailure(`${scriptPath} contains blocked runtime call ${candidateExpressionText} (provider or database client helper)`);
        }

        if (stripeMutationIdentifiers.has(candidateExpressionText)) {
          recordFailure(`${scriptPath} contains blocked runtime call ${candidateExpressionText} (Stripe mutation)`);
        }

        if (
          fileMutationIdentifiers.has(candidateExpressionText) &&
          !isFileSystemMutationCall(candidateExpressionText)
        ) {
          recordFailure(`${scriptPath} contains blocked runtime call ${candidateExpressionText} (file-system mutation)`);
        }

        if (httpClientRequestIdentifiers.has(candidateExpressionText)) {
          recordFailure(`${scriptPath} contains blocked runtime call ${candidateExpressionText} (HTTP client request)`);
        }

        const timerCall = timerInvocation(node, sourceFile, candidateExpressionText, reflectApplyIdentifiers);
        if (
          isTimerCall(candidateExpressionText, timerIdentifiers) &&
          timerCall.matched &&
          timerCall.arguments.some((argument) => literalText(argument))
        ) {
          recordFailure(`${scriptPath} contains string timer dynamic code via ${candidateExpressionText}`);
        }

        for (const rule of blockedCallRules) {
          if (!rule.matches(candidateExpressionText)) {
            continue;
          }
          if (rule.allowed?.(scriptPath, node, sourceFile, candidateExpressionText)) {
            continue;
          }
          recordFailure(`${scriptPath} contains blocked runtime call ${candidateExpressionText} (${rule.label})`);
        }
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      assignmentOperatorKinds.has(node.operatorToken.kind) &&
      isProcessEnvExpression(node.left, sourceFile, processEnvIdentifiers, processIdentifiers)
    ) {
      recordFailure(`${scriptPath} mutates process.env via assignment`);
    }

    if (
      typeof ts.isDeleteExpression === 'function' &&
      ts.isDeleteExpression(node) &&
      isProcessEnvExpression(node.expression, sourceFile, processEnvIdentifiers, processIdentifiers)
    ) {
      recordFailure(`${scriptPath} mutates process.env via delete`);
    }

    if (ts.isNewExpression(node)) {
      const expressionText = expressionName(node.expression, sourceFile);
      if (dynamicCodeIdentifiers.has(expressionText)) {
        recordFailure(`${scriptPath} constructs dynamic code constructor ${expressionText}`);
      } else if (isConstructorChainDynamicCodeExpression(expressionText)) {
        recordFailure(`${scriptPath} constructs dynamic code constructor ${expressionText}`);
      } else if (isBlockedConstructorExpression(expressionText, blockedConstructorIdentifiers)) {
        recordFailure(`${scriptPath} constructs blocked external/provider client ${expressionText}`);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function scanSmokeScript(scriptPath) {
  scanSmokeScriptSource(scriptPath, read(scriptPath));
}

function collectFixtureFailures(label, sourceText, scriptPath = `scripts/operator-script-boundary-fixtures/${label}.mjs`) {
  const fixtureFailures = [];
  scanSmokeScriptSource(
    scriptPath,
    sourceText,
    (message) => fixtureFailures.push(message),
  );
  return fixtureFailures;
}

function assertFixtureFails(label, sourceText, expectedMessagePart, scriptPath) {
  const fixtureFailures = collectFixtureFailures(label, sourceText, scriptPath);
  assert(
    fixtureFailures.some((message) => message.includes(expectedMessagePart)),
    `operator script boundary must reject ${label}`,
  );
}

function assertFixturePasses(label, sourceText, scriptPath) {
  const fixtureFailures = collectFixtureFailures(label, sourceText, scriptPath);
  assert(
    fixtureFailures.length === 0,
    `operator script boundary fixture ${label} should pass, got: ${fixtureFailures.join('; ')}`,
  );
}

const packageJson = JSON.parse(read('package.json'));
const packageScripts = packageJson.scripts ?? {};
const promptAtlasPackageJson = JSON.parse(read('prompts-mvp/package.json'));
const promptAtlasPackageScripts = promptAtlasPackageJson.scripts ?? {};
const operatorSmoke = read('scripts/operator-smoke.mjs');
const docs = [
  'docs/soe-operator-system.md',
  'docs/soe-current-thread-handoff.md',
  'docs/soe-privacy-threat-model.md',
  'docs/92b-capital-launch-runbook.md',
];

assert(
  packageScripts['operator:script-boundary:smoke'] === 'node scripts/operator-script-boundary-smoke.mjs',
  'package.json must expose operator:script-boundary:smoke',
);
assert(
  operatorSmoke.includes("command: ['npm', 'run', 'operator:script-boundary:smoke']"),
  'operator smoke must run operator:script-boundary:smoke',
);
assert(
  docs.every((docPath) => read(docPath).includes('operator:script-boundary:smoke')),
  'operator docs, handoff, threat model, and 92B runbook must reference operator:script-boundary:smoke',
);
assert(
  docs.slice(0, 3).every((docPath) => read(docPath).includes('file-system mutation')),
  'operator docs, handoff, and threat model must describe the file-system mutation boundary',
);
assert(
  docs.slice(0, 3).every((docPath) => read(docPath).includes('secret env-file reads') && read(docPath).includes('process.env mutation')),
  'operator docs, handoff, and threat model must describe secret env-file read and process.env mutation boundaries',
);
assert(
  docs.slice(0, 3).every((docPath) => read(docPath).includes('process module imports')),
  'operator docs, handoff, and threat model must describe process module import boundaries',
);
assert(
  docs.slice(0, 3).every((docPath) => read(docPath).includes('namespaced fetch') && read(docPath).includes('browser network constructors')),
  'operator docs, handoff, and threat model must describe namespaced fetch and browser network constructor boundaries',
);
assert(
  docs.slice(0, 3).every((docPath) => read(docPath).includes('socket/DNS/http2 network modules')),
  'operator docs, handoff, and threat model must describe socket/DNS/http2 network module boundaries',
);
assert(
  docs.slice(0, 3).every((docPath) => read(docPath).includes('worker thread/browser worker execution')),
  'operator docs, handoff, and threat model must describe worker execution boundaries',
);
assert(
  docs.slice(0, 3).every((docPath) => read(docPath).includes('CommonJS require')),
  'operator docs, handoff, and threat model must describe the CommonJS require boundary',
);
assert(
  docs.slice(0, 3).every((docPath) => read(docPath).includes('dynamic import escapes')),
  'operator docs, handoff, and threat model must describe the dynamic import boundary',
);
assert(
  docs.slice(0, 3).every((docPath) => read(docPath).includes('static re-export escapes')),
  'operator docs, handoff, and threat model must describe the static re-export boundary',
);
assert(
  docs.slice(0, 3).every((docPath) => read(docPath).includes('dynamic code execution')),
  'operator docs, handoff, and threat model must describe the dynamic code execution boundary',
);

const routeSmoke = read('scripts/capital-route-smoke.mjs');
assert(
  routeSmoke.includes("const DEFAULT_BASE_URL = 'http://localhost:3000'") &&
    routeSmoke.includes('assertLocalBaseUrl') &&
    routeSmoke.includes("'localhost'") &&
    routeSmoke.includes("'127.0.0.1'") &&
    routeSmoke.includes("'::1'"),
  'capital route smoke must stay localhost-only when using fetch',
);

assertFixtureFails(
  'direct-require-provider',
  `
const supabase = require('@supabase/supabase-js');
`,
  'CommonJS-requires blocked module @supabase/supabase-js',
);
assertFixtureFails(
  'constant-require-provider',
  `
const providerModule = '@supabase/supabase-js';
const supabase = require(providerModule);
`,
  'CommonJS-requires blocked module @supabase/supabase-js',
);
assertFixtureFails(
  'composed-require-provider',
  `
const providerScope = '@supabase/';
const providerModule = providerScope + 'supabase-js';
const supabase = require(providerModule);
`,
  'CommonJS-requires blocked module @supabase/supabase-js',
);
assertFixtureFails(
  'template-require-provider',
  `
const providerPackage = 'supabase-js';
const supabase = require(` + "`@supabase/${providerPackage}`" + `);
`,
  'CommonJS-requires blocked module @supabase/supabase-js',
);
assertFixtureFails(
  'string-raw-require-provider',
  `
const providerModule = String.raw` + "`@supabase/supabase-js`" + `;
const supabase = require(providerModule);
`,
  'CommonJS-requires blocked module @supabase/supabase-js',
);
assertFixtureFails(
  'helper-call-require-provider-candidate',
  `
function chooseModule(_localName, providerModule) {
  return providerModule;
}
const supabase = require(chooseModule('./local-fixture.mjs', '@supabase/supabase-js'));
`,
  'CommonJS-requires blocked module @supabase/supabase-js',
);
assertFixtureFails(
  'bound-commonjs-require-provider',
  `
const loadModule = require.bind(null);
loadModule('@supabase/supabase-js');
`,
  'CommonJS-requires blocked module @supabase/supabase-js',
);
assertFixtureFails(
  'assigned-bound-commonjs-require-network',
  `
let loadModule;
loadModule = require.bind(null);
loadModule('node:https');
`,
  'CommonJS-requires blocked module node:https',
);
assertFixturePasses(
  'local-commonjs-require-fixture',
  `
const localHelper = require('./operator-local-fixture.cjs');
void localHelper;
`,
);
assertFixturePasses(
  'local-bound-commonjs-require-fixture',
  `
const loadModule = require.bind(null);
const localHelper = loadModule('./operator-local-fixture.cjs');
void localHelper;
`,
);
assertFixtureFails(
  'create-require-network',
  `
import { createRequire as makeRequire } from 'node:module';
const nodeRequire = makeRequire(import.meta.url);
nodeRequire('node:https');
`,
  'CommonJS-requires blocked module node:https',
);
assertFixtureFails(
  'create-require-constant-provider',
  `
import { createRequire } from 'node:module';
const nodeRequire = createRequire(import.meta.url);
const providerModule = '@supabase/' + 'supabase-js';
nodeRequire(providerModule);
`,
  'CommonJS-requires blocked module @supabase/supabase-js',
);
assertFixtureFails(
  'bound-create-require-network',
  `
import { createRequire } from 'node:module';
const nodeRequire = createRequire(import.meta.url);
const loadModule = nodeRequire.bind(null);
loadModule('node:https');
`,
  'CommonJS-requires blocked module node:https',
);
assertFixtureFails(
  'create-require-dynamic-specifier',
  `
import { createRequire } from 'node:module';
const nodeRequire = createRequire(import.meta.url);
nodeRequire(specifier);
`,
  'contains dynamic CommonJS require specifier',
);
assertFixtureFails(
  'create-require-call-network',
  `
import { createRequire } from 'node:module';
const nodeRequire = createRequire(import.meta.url);
nodeRequire.call(null, 'node:https');
`,
  'CommonJS-requires blocked module node:https',
);
assertFixtureFails(
  'create-require-apply-network',
  `
import { createRequire } from 'node:module';
const nodeRequire = createRequire(import.meta.url);
nodeRequire.apply(null, ['node:https']);
`,
  'CommonJS-requires blocked module node:https',
);
assertFixtureFails(
  'create-require-reflect-apply-network',
  `
import { createRequire } from 'node:module';
const nodeRequire = createRequire(import.meta.url);
Reflect.apply(nodeRequire, null, ['node:https']);
`,
  'CommonJS-requires blocked module node:https',
);
assertFixtureFails(
  'aliased-reflect-apply-create-require-network',
  `
import { createRequire } from 'node:module';
const nodeRequire = createRequire(import.meta.url);
const runtimeReflect = Reflect;
runtimeReflect.apply(nodeRequire, null, ['node:https']);
`,
  'CommonJS-requires blocked module node:https',
);
assertFixtureFails(
  'destructured-reflect-apply-create-require-provider',
  `
import { createRequire } from 'node:module';
const nodeRequire = createRequire(import.meta.url);
const { apply: reflectApply } = Reflect;
reflectApply(nodeRequire, null, ['@supabase/supabase-js']);
`,
  'CommonJS-requires blocked module @supabase/supabase-js',
);
assertFixtureFails(
  'create-require-bind-dynamic-specifier',
  `
import { createRequire } from 'node:module';
const nodeRequire = createRequire(import.meta.url);
nodeRequire.bind(null, specifier);
`,
  'contains dynamic CommonJS require specifier',
);
assertFixtureFails(
  'namespace-create-require-dynamic-specifier',
  `
import * as moduleApi from 'node:module';
const nodeRequire = moduleApi.createRequire(import.meta.url);
nodeRequire(process.argv[2]);
`,
  'contains dynamic CommonJS require specifier',
);
assertFixtureFails(
  'dynamic-import-require-source',
  `
await import('node:module');
`,
  'dynamically imports CommonJS require source module node:module',
);
assertFixtureFails(
  'dynamic-import-local-module',
  `
await import('../lib/side-effectful-local-module.mjs');
`,
  'contains dynamic import escape ../lib/side-effectful-local-module.mjs',
);
assertFixtureFails(
  'dynamic-import-dynamic-specifier',
  `
await import(specifier);
`,
  'contains dynamic import escape <dynamic specifier>',
);
assertFixtureFails(
  're-export-blocked-provider-module',
  `
export { default as Anthropic } from '@anthropic-ai/sdk';
`,
  're-exports blocked external/provider module @anthropic-ai/sdk',
);
assertFixtureFails(
  're-export-network-module',
  `
export * from 'node:https';
`,
  're-exports blocked external/provider module node:https',
);
assertFixtureFails(
  're-export-commonjs-require-source',
  `
export { createRequire } from 'node:module';
`,
  're-exports CommonJS require source module node:module',
);
assertFixtureFails(
  'process-module-import',
  `
import processApi from 'node:process';
processApi.env.SECRET_TOKEN = 'unsafe';
`,
  'imports blocked external/provider module node:process',
);
assertFixtureFails(
  'process-module-dynamic-import',
  `
await import('process');
`,
  'dynamically imports blocked external/provider module process',
);
assertFixtureFails(
  'socket-network-module-import',
  `
import net from 'node:net';
net.connect(443, 'example.com');
`,
  'imports blocked external/provider module node:net',
);
assertFixtureFails(
  'http2-network-module-dynamic-import',
  `
await import('node:http2');
`,
  'dynamically imports blocked external/provider module node:http2',
);
assertFixtureFails(
  'common-network-client-require',
  `
const got = require('got');
`,
  'CommonJS-requires blocked module got',
);
assertFixtureFails(
  'worker-thread-module-import',
  `
import { Worker } from 'node:worker_threads';
new Worker(new URL('./fixture-worker.mjs', import.meta.url));
`,
  'imports blocked external/provider module node:worker_threads',
);
assertFixtureFails(
  'worker-thread-module-dynamic-import',
  `
await import('worker_threads');
`,
  'dynamically imports blocked external/provider module worker_threads',
);
assertFixtureFails(
  'fetch-call-wrapper',
  `
fetch.call(null, 'https://example.com');
`,
  'contains blocked runtime call fetch (runtime fetch)',
);
assertFixtureFails(
  'bracket-fetch',
  `
globalThis['fetch']('https://example.com');
`,
  'contains blocked runtime call globalThis.fetch (runtime fetch)',
);
assertFixtureFails(
  'aliased-fetch-call',
  `
const request = fetch;
request('https://example.com');
`,
  'contains blocked runtime call request (runtime fetch)',
);
assertFixtureFails(
  'assigned-fetch-call-wrapper',
  `
let request;
request = globalThis.fetch;
request.call(null, 'https://example.com');
`,
  'contains blocked runtime call request (runtime fetch)',
);
assertFixtureFails(
  'destructured-window-fetch-call',
  `
const { fetch: request } = window;
request('https://example.com');
`,
  'contains blocked runtime call request (runtime fetch)',
);
assertFixtureFails(
  'destructured-self-fetch-reflect-apply',
  `
const { fetch: request } = self;
Reflect.apply(request, null, ['https://example.com']);
`,
  'contains blocked runtime call request (runtime fetch)',
);
assertFixtureFails(
  'aliased-reflect-apply-fetch',
  `
const { fetch: request } = self;
const runtimeReflect = Reflect;
runtimeReflect.apply(request, null, ['https://example.com']);
`,
  'contains blocked runtime call request (runtime fetch)',
);
assertFixtureFails(
  'namespace-aliased-fetch-call',
  `
const runtimeGlobal = globalThis;
runtimeGlobal.fetch('https://example.com');
`,
  'contains blocked runtime call runtimeGlobal.fetch (runtime fetch)',
);
assertFixtureFails(
  'namespace-aliased-fetch-call-wrapper',
  `
const runtimeGlobal = window;
runtimeGlobal.fetch.call(null, 'https://example.com');
`,
  'contains blocked runtime call runtimeGlobal.fetch (runtime fetch)',
);
assertFixtureFails(
  'namespace-aliased-fetch-variable',
  `
const runtimeGlobal = globalThis;
const request = runtimeGlobal.fetch;
request('https://example.com');
`,
  'contains blocked runtime call request (runtime fetch)',
);
assertFixtureFails(
  'namespace-aliased-destructured-fetch',
  `
const runtimeGlobal = self;
const { fetch: request } = runtimeGlobal;
request('https://example.com');
`,
  'contains blocked runtime call request (runtime fetch)',
);
assertFixtureFails(
  'assigned-namespace-aliased-fetch-call-wrapper',
  `
let runtimeGlobal;
runtimeGlobal = globalThis;
runtimeGlobal.fetch.call(null, 'https://example.com');
`,
  'contains blocked runtime call runtimeGlobal.fetch (runtime fetch)',
);
assertFixtureFails(
  'bracket-http-request',
  `
https['request']('https://example.com');
`,
  'contains blocked runtime call https.request (HTTP client request)',
);
assertFixtureFails(
  'aliased-http-request',
  `
const request = https.request;
request('https://example.com');
`,
  'contains blocked runtime call request (HTTP client request)',
);
assertFixtureFails(
  'http-client-namespace-alias',
  `
const httpClient = http;
httpClient.get('http://example.com');
`,
  'contains blocked runtime call httpClient.get (HTTP client request)',
);
assertFixtureFails(
  'destructured-http-request',
  `
const { request } = https;
request('https://example.com');
`,
  'contains blocked runtime call request (HTTP client request)',
);
assertFixtureFails(
  'assigned-http-client-namespace-alias',
  `
let httpClient;
httpClient = https;
httpClient.request.call(null, 'https://example.com');
`,
  'contains blocked runtime call httpClient.request (HTTP client request)',
);
assertFixtureFails(
  'aliased-http-request-reflect-apply',
  `
const request = http.request;
Reflect.apply(request, null, ['http://example.com']);
`,
  'contains blocked runtime call request (HTTP client request)',
);
assertFixtureFails(
  'spawn-apply-wrapper',
  `
import { spawnSync } from 'node:child_process';
spawnSync.apply(null, ['npm', ['run', 'operator:smoke']]);
`,
  'contains blocked runtime call spawnSync (child process execution)',
);
assertFixtureFails(
  'spawn-reflect-apply-wrapper',
  `
import { spawnSync } from 'node:child_process';
Reflect.apply(spawnSync, null, ['npm', ['run', 'operator:smoke']]);
`,
  'contains blocked runtime call spawnSync (child process execution)',
);
assertFixturePasses(
  'operator-smoke-direct-spawn-sync',
  `
import { spawnSync } from 'node:child_process';
spawnSync('npm', ['run', 'operator:smoke']);
`,
  'scripts/operator-smoke.mjs',
);
assertFixtureFails(
  'prompt-atlas-nested-fetch',
  `
fetch('https://example.com');
`,
  'contains blocked runtime call fetch (runtime fetch)',
  'prompts-mvp/scripts/privacy-accounting-smoke.mjs',
);
assertFixtureFails(
  'prompt-atlas-nested-provider-import',
  `
import Stripe from 'stripe';
void Stripe;
`,
  'imports blocked external/provider module stripe',
  'prompts-mvp/scripts/billing-price-smoke.mjs',
);
assertFixtureFails(
  'prompt-atlas-nested-child-process',
  `
import { spawnSync } from 'node:child_process';
spawnSync(process.execPath, ['scripts/privacy-accounting-smoke.mjs']);
`,
  'contains blocked runtime call spawnSync (child process execution)',
  'prompts-mvp/scripts/privacy-accounting-smoke.mjs',
);
assertFixturePasses(
  'prompt-atlas-operator-direct-spawn-sync',
  `
import { spawnSync } from 'node:child_process';
spawnSync(process.execPath, ['scripts/privacy-accounting-smoke.mjs']);
`,
  'prompts-mvp/scripts/operator-smoke.mjs',
);
assertFixtureFails(
  'prompt-atlas-operator-spawn-call-wrapper',
  `
import { spawnSync } from 'node:child_process';
spawnSync.call(null, process.execPath, ['scripts/privacy-accounting-smoke.mjs']);
`,
  'contains blocked runtime call spawnSync (child process execution)',
  'prompts-mvp/scripts/operator-smoke.mjs',
);
assertFixtureFails(
  'prompt-atlas-operator-spawn-reflect-apply',
  `
import { spawnSync } from 'node:child_process';
Reflect.apply(spawnSync, null, [process.execPath, ['scripts/privacy-accounting-smoke.mjs']]);
`,
  'contains blocked runtime call spawnSync (child process execution)',
  'prompts-mvp/scripts/operator-smoke.mjs',
);
assertFixtureFails(
  'prompt-atlas-operator-aliased-spawn-import',
  `
import { spawnSync as runCommand } from 'node:child_process';
runCommand(process.execPath, ['scripts/privacy-accounting-smoke.mjs']);
`,
  'contains blocked runtime call runCommand (child process execution)',
  'prompts-mvp/scripts/operator-smoke.mjs',
);
assertFixtureFails(
  'operator-smoke-spawn-call-wrapper',
  `
import { spawnSync } from 'node:child_process';
spawnSync.call(null, 'npm', ['run', 'operator:smoke']);
`,
  'contains blocked runtime call spawnSync (child process execution)',
  'scripts/operator-smoke.mjs',
);
assertFixtureFails(
  'operator-smoke-spawn-reflect-apply',
  `
import { spawnSync } from 'node:child_process';
Reflect.apply(spawnSync, null, ['npm', ['run', 'operator:smoke']]);
`,
  'contains blocked runtime call spawnSync (child process execution)',
  'scripts/operator-smoke.mjs',
);
assertFixtureFails(
  'operator-smoke-aliased-spawn-import',
  `
import { spawnSync as runCommand } from 'node:child_process';
runCommand('npm', ['run', 'operator:smoke']);
`,
  'contains blocked runtime call runCommand (child process execution)',
  'scripts/operator-smoke.mjs',
);
assertFixtureFails(
  'operator-smoke-aliased-spawn-variable',
  `
import { spawnSync } from 'node:child_process';
const runCommand = spawnSync;
runCommand.call(null, 'npm', ['run', 'operator:smoke']);
`,
  'contains blocked runtime call runCommand (child process execution)',
  'scripts/operator-smoke.mjs',
);
assertFixtureFails(
  'operator-smoke-destructured-spawn-namespace',
  `
import * as childProcess from 'node:child_process';
const { spawnSync: runCommand } = childProcess;
Reflect.apply(runCommand, null, ['npm', ['run', 'operator:smoke']]);
`,
  'contains blocked runtime call runCommand (child process execution)',
  'scripts/operator-smoke.mjs',
);
assertFixtureFails(
  'file-mutation-call-wrapper',
  `
import { writeFileSync } from 'node:fs';
writeFileSync.call(null, 'tmp.txt', 'unsafe');
`,
  'contains blocked runtime call writeFileSync (file-system mutation)',
);
assertFixtureFails(
  'bracket-file-mutation',
  `
fs['writeFileSync']('tmp.txt', 'unsafe');
`,
  'contains blocked runtime call fs.writeFileSync (file-system mutation)',
);
assertFixtureFails(
  'aliased-file-mutation-import',
  `
import { writeFileSync as writeUnsafe } from 'node:fs';
writeUnsafe('tmp.txt', 'unsafe');
`,
  'contains blocked runtime call writeUnsafe (file-system mutation)',
);
assertFixtureFails(
  'aliased-file-mutation-variable',
  `
import { writeFileSync } from 'node:fs';
const writeUnsafe = writeFileSync;
writeUnsafe('tmp.txt', 'unsafe');
`,
  'contains blocked runtime call writeUnsafe (file-system mutation)',
);
assertFixtureFails(
  'assigned-file-mutation-alias',
  `
import { writeFileSync } from 'node:fs';
let writeUnsafe;
writeUnsafe = writeFileSync;
writeUnsafe.call(null, 'tmp.txt', 'unsafe');
`,
  'contains blocked runtime call writeUnsafe (file-system mutation)',
);
assertFixtureFails(
  'destructured-file-mutation-namespace',
  `
import * as fs from 'node:fs';
const { writeFileSync: writeUnsafe } = fs;
Reflect.apply(writeUnsafe, null, ['tmp.txt', 'unsafe']);
`,
  'contains blocked runtime call writeUnsafe (file-system mutation)',
);
assertFixtureFails(
  'file-open-write-handle',
  `
import { openSync } from 'node:fs';
openSync('tmp.txt', 'w');
`,
  'contains blocked runtime call openSync (file-system mutation)',
);
assertFixtureFails(
  'file-descriptor-write',
  `
import { writeSync } from 'node:fs';
writeSync(1, 'unsafe');
`,
  'contains blocked runtime call writeSync (file-system mutation)',
);
assertFixtureFails(
  'file-truncate-namespace-alias',
  `
import * as fs from 'node:fs';
const fileApi = fs;
fileApi.ftruncateSync(1, 0);
`,
  'contains blocked runtime call fileApi.ftruncateSync (file-system mutation)',
);
assertFixtureFails(
  'aliased-env-file-read-import',
  `
import { readFileSync as readSecret } from 'node:fs';
readSecret('.env.local', 'utf8');
`,
  'reads sensitive env file path .env.local',
);
assertFixtureFails(
  'aliased-env-file-read-variable',
  `
import { readFileSync } from 'node:fs';
const readSecret = readFileSync;
readSecret('./.env.production', 'utf8');
`,
  'reads sensitive env file path ./.env.production',
);
assertFixtureFails(
  'assigned-env-file-read-alias',
  `
import { readFileSync } from 'node:fs';
let readSecret;
readSecret = readFileSync;
readSecret('../.env.test', 'utf8');
`,
  'reads sensitive env file path ../.env.test',
);
assertFixtureFails(
  'env-file-read-call-wrapper',
  `
import { readFileSync } from 'node:fs';
readFileSync.call(null, '.env.local', 'utf8');
`,
  'reads sensitive env file path .env.local',
);
assertFixtureFails(
  'env-file-read-apply-wrapper',
  `
import { readFileSync } from 'node:fs';
readFileSync.apply(null, ['./.env.production', 'utf8']);
`,
  'reads sensitive env file path ./.env.production',
);
assertFixtureFails(
  'env-file-read-bind-wrapper',
  `
import { readFileSync } from 'node:fs';
readFileSync.bind(null, '../.env.test', 'utf8');
`,
  'reads sensitive env file path ../.env.test',
);
assertFixtureFails(
  'env-file-read-reflect-apply-wrapper',
  `
import { readFileSync } from 'node:fs';
Reflect.apply(readFileSync, null, ['.env', 'utf8']);
`,
  'reads sensitive env file path .env',
);
assertFixtureFails(
  'env-file-read-aliased-reflect-apply-wrapper',
  `
import { readFileSync } from 'node:fs';
const runtimeReflect = Reflect;
runtimeReflect.apply(readFileSync, null, ['.env.local', 'utf8']);
`,
  'reads sensitive env file path .env.local',
);
assertFixtureFails(
  'env-file-read-constant-apply-wrapper',
  `
import { readFileSync } from 'node:fs';
const secretPath = './.env.' + 'production';
readFileSync.apply(null, [secretPath, 'utf8']);
`,
  'reads sensitive env file path ./.env.production',
);
assertFixtureFails(
  'env-file-read-constant-reflect-apply-wrapper',
  `
import { readFileSync } from 'node:fs';
const secretPath = '.env.' + 'test';
Reflect.apply(readFileSync, null, [secretPath, 'utf8']);
`,
  'reads sensitive env file path .env.test',
);
assertFixtureFails(
  'env-file-read-url-wrapper',
  `
import { readFileSync } from 'node:fs';
readFileSync(new URL('.env.local', import.meta.url), 'utf8');
`,
  'reads sensitive env file path .env.local',
);
assertFixtureFails(
  'env-file-read-constant-path',
  `
import { readFileSync } from 'node:fs';
const secretPath = '.env.local';
readFileSync(secretPath, 'utf8');
`,
  'reads sensitive env file path .env.local',
);
assertFixtureFails(
  'env-file-read-assigned-constant-path',
  `
import { readFileSync } from 'node:fs';
let secretPath;
secretPath = '../.env.production';
readFileSync(secretPath, 'utf8');
`,
  'reads sensitive env file path ../.env.production',
);
assertFixtureFails(
  'env-file-read-constant-url-wrapper',
  `
import { readFileSync } from 'node:fs';
const secretPath = '.env.test';
readFileSync(new URL(secretPath, import.meta.url), 'utf8');
`,
  'reads sensitive env file path .env.test',
);
assertFixtureFails(
  'env-file-read-composed-path',
  `
import { readFileSync } from 'node:fs';
const envSuffix = 'local';
const secretPath = '.env.' + envSuffix;
readFileSync(secretPath, 'utf8');
`,
  'reads sensitive env file path .env.local',
);
assertFixtureFails(
  'env-file-read-template-path',
  `
import { readFileSync } from 'node:fs';
const envSuffix = 'production';
const secretPath = ` + "`.env.${envSuffix}`" + `;
readFileSync(secretPath, 'utf8');
`,
  'reads sensitive env file path .env.production',
);
assertFixtureFails(
  'env-file-read-string-raw-path',
  `
import { readFileSync } from 'node:fs';
readFileSync(String.raw` + "`.env.local`" + `, 'utf8');
`,
  'reads sensitive env file path .env.local',
);
assertFixtureFails(
  'bracket-email-send',
  `
resend['emails']['send']({});
`,
  'contains blocked runtime call resend.emails.send (email send)',
);
assertFixtureFails(
  'aliased-email-send',
  `
const sendEmail = resend.emails.send;
sendEmail({});
`,
  'contains blocked runtime call sendEmail (email send)',
);
assertFixtureFails(
  'email-send-namespace-alias',
  `
const emailApi = resend.emails;
emailApi.send({});
`,
  'contains blocked runtime call emailApi.send (email send)',
);
assertFixtureFails(
  'destructured-email-send',
  `
const { send: sendEmail } = resend.emails;
sendEmail({});
`,
  'contains blocked runtime call sendEmail (email send)',
);
assertFixtureFails(
  'aliased-public-lead-notification-send',
  `
const notify = sendPublicLeadNotification;
notify({});
`,
  'contains blocked runtime call notify (email send)',
);
assertFixtureFails(
  'bracket-stripe-mutation',
  `
stripe['checkout']['sessions']['create']({});
`,
  'contains blocked runtime call stripe.checkout.sessions.create (Stripe mutation)',
);
assertFixtureFails(
  'aliased-stripe-session-create',
  `
const createSession = stripe.checkout.sessions.create;
createSession({});
`,
  'contains blocked runtime call createSession (Stripe mutation)',
);
assertFixtureFails(
  'stripe-sessions-namespace-alias',
  `
const sessions = stripe.checkout.sessions;
sessions.create({});
`,
  'contains blocked runtime call sessions.create (Stripe mutation)',
);
assertFixtureFails(
  'destructured-stripe-session-create',
  `
const { create: createSession } = stripe.checkout.sessions;
createSession({});
`,
  'contains blocked runtime call createSession (Stripe mutation)',
);
assertFixtureFails(
  'assigned-stripe-payment-intent-create',
  `
let createPaymentIntent;
createPaymentIntent = stripe.paymentIntents.create;
createPaymentIntent({});
`,
  'contains blocked runtime call createPaymentIntent (Stripe mutation)',
);
assertFixtureFails(
  'provider-helper-bind-wrapper',
  `
getSupabaseAdmin.bind(null);
`,
  'contains blocked runtime call getSupabaseAdmin (provider or database client helper)',
);
assertFixtureFails(
  'bracket-provider-helper',
  `
supabase['createClient']();
`,
  'contains blocked runtime call supabase.createClient (provider or database client helper)',
);
assertFixtureFails(
  'aliased-provider-helper',
  `
const makeAdmin = getSupabaseAdmin;
makeAdmin();
`,
  'contains blocked runtime call makeAdmin (provider or database client helper)',
);
assertFixtureFails(
  'assigned-provider-helper',
  `
let makeResend;
makeResend = getResend;
makeResend.call(null);
`,
  'contains blocked runtime call makeResend (provider or database client helper)',
);
assertFixtureFails(
  'aliased-member-create-client',
  `
const makeClient = supabase.createClient;
makeClient();
`,
  'contains blocked runtime call makeClient (provider or database client helper)',
);
assertFixtureFails(
  'destructured-provider-helper',
  `
const { createClient: makeClient } = supabase;
Reflect.apply(makeClient, null, []);
`,
  'contains blocked runtime call makeClient (provider or database client helper)',
);
assertFixtureFails(
  'bracket-process-env-assignment',
  `
process['env']['SECRET_TOKEN'] = 'unsafe';
`,
  'mutates process.env via assignment',
);
assertFixtureFails(
  'bracket-process-env-reflect-set',
  `
Reflect.set(process['env'], 'SECRET_TOKEN', 'unsafe');
`,
  'mutates process.env via Reflect.set',
);
assertFixtureFails(
  'aliased-process-env-assignment',
  `
const env = process.env;
env.SECRET_TOKEN = 'unsafe';
`,
  'mutates process.env via assignment',
);
assertFixtureFails(
  'aliased-process-env-object-assign',
  `
const env = process['env'];
Object.assign(env, { SECRET_TOKEN: 'unsafe' });
`,
  'mutates process.env via Object.assign',
);
assertFixtureFails(
  'aliased-process-env-reflect-set',
  `
let env;
env = process.env;
Reflect.set(env, 'SECRET_TOKEN', 'unsafe');
`,
  'mutates process.env via Reflect.set',
);
assertFixtureFails(
  'aliased-process-env-delete',
  `
const env = process.env;
delete env.SECRET_TOKEN;
`,
  'mutates process.env via delete',
);
assertFixtureFails(
  'global-process-env-assignment',
  `
globalThis.process.env.SECRET_TOKEN = 'unsafe';
`,
  'mutates process.env via assignment',
);
assertFixtureFails(
  'aliased-process-object-env-assignment',
  `
const proc = globalThis.process;
proc.env.SECRET_TOKEN = 'unsafe';
`,
  'mutates process.env via assignment',
);
assertFixtureFails(
  'assigned-process-object-env-object-assign',
  `
let proc;
proc = process;
Object.assign(proc.env, { SECRET_TOKEN: 'unsafe' });
`,
  'mutates process.env via Object.assign',
);
assertFixtureFails(
  'destructured-global-process-env-assignment',
  `
const { process: nodeProcess } = globalThis;
nodeProcess.env.SECRET_TOKEN = 'unsafe';
`,
  'mutates process.env via assignment',
);
assertFixtureFails(
  'destructured-global-process-env-object-assign',
  `
const { 'process': nodeProcess } = global;
Object.assign(nodeProcess.env, { SECRET_TOKEN: 'unsafe' });
`,
  'mutates process.env via Object.assign',
);
assertFixtureFails(
  'destructured-process-env-assignment',
  `
const { env } = process;
env.SECRET_TOKEN = 'unsafe';
`,
  'mutates process.env via assignment',
);
assertFixtureFails(
  'renamed-destructured-process-env-define-property',
  `
const { env: runtimeEnv } = process;
Object.defineProperty(runtimeEnv, 'SECRET_TOKEN', { value: 'unsafe' });
`,
  'mutates process.env via Object.defineProperty',
);
assertFixtureFails(
  'nested-destructured-global-process-env-assignment',
  `
const { process: { env } } = globalThis;
env.SECRET_TOKEN = 'unsafe';
`,
  'mutates process.env via assignment',
);
assertFixtureFails(
  'renamed-nested-destructured-global-process-env-reflect-set',
  `
const { process: { env: runtimeEnv } } = globalThis;
Reflect.set(runtimeEnv, 'SECRET_TOKEN', 'unsafe');
`,
  'mutates process.env via Reflect.set',
);
assertFixtureFails(
  'process-env-reflect-delete-property',
  `
Reflect.deleteProperty(process.env, 'SECRET_TOKEN');
`,
  'mutates process.env via Reflect.deleteProperty',
);
assertFixtureFails(
  'process-env-object-assign-call-wrapper',
  `
Object.assign.call(null, process.env, { SECRET_TOKEN: 'unsafe' });
`,
  'mutates process.env via Object.assign',
);
assertFixtureFails(
  'process-env-object-assign-bracket-call-wrapper',
  `
Object['assign'].call(null, process.env, { SECRET_TOKEN: 'unsafe' });
`,
  'mutates process.env via Object.assign',
);
assertFixtureFails(
  'process-env-object-define-property-apply-wrapper',
  `
Object.defineProperty.apply(null, [process.env, 'SECRET_TOKEN', { value: 'unsafe' }]);
`,
  'mutates process.env via Object.defineProperty',
);
assertFixtureFails(
  'process-env-reflect-delete-property-bind-wrapper',
  `
Reflect.deleteProperty.bind(null, process.env, 'SECRET_TOKEN');
`,
  'mutates process.env via Reflect.deleteProperty',
);
assertFixtureFails(
  'process-env-reflect-set-reflect-apply-wrapper',
  `
Reflect.apply(Reflect.set, null, [process.env, 'SECRET_TOKEN', 'unsafe']);
`,
  'mutates process.env via Reflect.set',
);
assertFixtureFails(
  'process-env-reflect-set-aliased-reflect-apply-wrapper',
  `
const runtimeReflect = Reflect;
runtimeReflect.apply(Reflect.set, null, [process.env, 'SECRET_TOKEN', 'unsafe']);
`,
  'mutates process.env via Reflect.set',
);
assertFixtureFails(
  'aliased-object-assign-process-env',
  `
const assignEnv = Object.assign;
assignEnv(process.env, { SECRET_TOKEN: 'unsafe' });
`,
  'mutates process.env via Object.assign',
);
assertFixtureFails(
  'assigned-reflect-set-process-env',
  `
let setEnv;
setEnv = Reflect.set;
setEnv(process.env, 'SECRET_TOKEN', 'unsafe');
`,
  'mutates process.env via Reflect.set',
);
assertFixtureFails(
  'destructured-object-define-property-process-env',
  `
const { defineProperty } = Object;
defineProperty(process.env, 'SECRET_TOKEN', { value: 'unsafe' });
`,
  'mutates process.env via Object.defineProperty',
);
assertFixtureFails(
  'renamed-destructured-reflect-delete-property-process-env',
  `
const { deleteProperty: deleteEnv } = Reflect;
deleteEnv(process.env, 'SECRET_TOKEN');
`,
  'mutates process.env via Reflect.deleteProperty',
);
assertFixtureFails(
  'aliased-reflect-set-call-wrapper-process-env',
  `
const setEnv = Reflect.set;
setEnv.call(null, process.env, 'SECRET_TOKEN', 'unsafe');
`,
  'mutates process.env via Reflect.set',
);
assertFixtureFails(
  'bound-object-assign-helper-process-env',
  `
const assignEnv = Object.assign.bind(null);
assignEnv(process.env, { SECRET_TOKEN: 'unsafe' });
`,
  'mutates process.env via Object.assign',
);
assertFixtureFails(
  'assigned-bound-reflect-set-helper-process-env',
  `
let setEnv;
setEnv = Reflect.set.bind(null);
setEnv(process.env, 'SECRET_TOKEN', 'unsafe');
`,
  'mutates process.env via Reflect.set',
);
assertFixtureFails(
  'aliased-object-namespace-process-env',
  `
const runtimeObject = Object;
runtimeObject.assign(process.env, { SECRET_TOKEN: 'unsafe' });
`,
  'mutates process.env via Object.assign',
);
assertFixtureFails(
  'assigned-reflect-namespace-process-env',
  `
let runtimeReflect;
runtimeReflect = Reflect;
runtimeReflect.set(process.env, 'SECRET_TOKEN', 'unsafe');
`,
  'mutates process.env via Reflect.set',
);
assertFixtureFails(
  'destructured-aliased-object-namespace-process-env',
  `
const runtimeObject = Object;
const { defineProperty } = runtimeObject;
defineProperty(process.env, 'SECRET_TOKEN', { value: 'unsafe' });
`,
  'mutates process.env via Object.defineProperty',
);
assertFixtureFails(
  'bracket-network-constructor',
  `
new globalThis['WebSocket']('wss://example.com');
`,
  'constructs blocked external/provider client globalThis.WebSocket',
);
assertFixtureFails(
  'browser-worker-constructor',
  `
new Worker('data:text/javascript,postMessage(1)');
`,
  'constructs blocked external/provider client Worker',
);
assertFixtureFails(
  'bracket-browser-worker-constructor',
  `
new globalThis['SharedWorker']('https://example.com/worker.js');
`,
  'constructs blocked external/provider client globalThis.SharedWorker',
);
assertFixtureFails(
  'aliased-network-constructor',
  `
const Socket = WebSocket;
new Socket('wss://example.com');
`,
  'constructs blocked external/provider client Socket',
);
assertFixtureFails(
  'assigned-provider-constructor',
  `
let StripeClient;
StripeClient = Stripe;
new StripeClient('sk_test_123');
`,
  'constructs blocked external/provider client StripeClient',
);
assertFixtureFails(
  'destructured-worker-constructor',
  `
const { Worker: BrowserWorker } = globalThis;
new BrowserWorker('https://example.com/worker.js');
`,
  'constructs blocked external/provider client BrowserWorker',
);
assertFixtureFails(
  'namespace-aliased-xhr-constructor',
  `
const runtimeGlobal = window;
const Xhr = runtimeGlobal.XMLHttpRequest;
new Xhr();
`,
  'constructs blocked external/provider client Xhr',
);
assertFixtureFails(
  'reflect-construct-function-dynamic-code',
  `
Reflect.construct(Function, ['return fetch("https://example.com")']);
`,
  'constructs dynamic code constructor Function via Reflect.construct',
);
assertFixtureFails(
  'aliased-reflect-construct-function-dynamic-code',
  `
const constructUnsafe = Reflect.construct;
constructUnsafe(Function, ['return fetch("https://example.com")']);
`,
  'constructs dynamic code constructor Function via constructUnsafe',
);
assertFixtureFails(
  'destructured-reflect-construct-blocked-provider',
  `
const { construct: constructUnsafe } = Reflect;
constructUnsafe(Stripe, ['sk_test_123']);
`,
  'constructs blocked external/provider client Stripe via constructUnsafe',
);
assertFixtureFails(
  'reflect-construct-apply-blocked-constructor',
  `
Reflect.construct.apply(null, [WebSocket, ['wss://example.com']]);
`,
  'constructs blocked external/provider client WebSocket via Reflect.construct',
);
assertFixtureFails(
  'reflect-apply-reflect-construct-blocked-constructor',
  `
Reflect.apply(Reflect.construct, null, [globalThis.WebSocket, ['wss://example.com']]);
`,
  'constructs blocked external/provider client globalThis.WebSocket via Reflect.construct',
);
assertFixtureFails(
  'aliased-reflect-apply-reflect-construct-blocked-constructor',
  `
const runtimeReflect = Reflect;
runtimeReflect.apply(Reflect.construct, null, [globalThis.WebSocket, ['wss://example.com']]);
`,
  'constructs blocked external/provider client globalThis.WebSocket via Reflect.construct',
);
assertFixtureFails(
  'eval-dynamic-code',
  `
eval('fetch("https://example.com")');
`,
  'contains blocked runtime call eval (dynamic code execution)',
);
assertFixtureFails(
  'bracket-eval-dynamic-code',
  `
globalThis['eval']('fetch("https://example.com")');
`,
  'contains blocked runtime call globalThis.eval (dynamic code execution)',
);
assertFixtureFails(
  'function-constructor-dynamic-code',
  `
new Function('return fetch("https://example.com")');
`,
  'constructs blocked external/provider client Function',
);
assertFixtureFails(
  'function-call-dynamic-code',
  `
Function('return fetch("https://example.com")');
`,
  'contains blocked runtime call Function (dynamic code execution)',
);
assertFixtureFails(
  'aliased-eval-dynamic-code',
  `
const runCode = eval;
runCode('fetch("https://example.com")');
`,
  'contains blocked runtime call runCode (dynamic code execution)',
);
assertFixtureFails(
  'assigned-function-dynamic-code',
  `
let makeFunction;
makeFunction = Function;
makeFunction('return fetch("https://example.com")');
`,
  'contains blocked runtime call makeFunction (dynamic code execution)',
);
assertFixtureFails(
  'new-aliased-function-dynamic-code',
  `
const DynamicFunction = globalThis.Function;
new DynamicFunction('return fetch("https://example.com")');
`,
  'constructs dynamic code constructor DynamicFunction',
);
assertFixtureFails(
  'destructured-window-function-reflect-apply',
  `
const { Function: makeFunction } = window;
Reflect.apply(makeFunction, null, ['return fetch("https://example.com")']);
`,
  'contains blocked runtime call makeFunction (dynamic code execution)',
);
assertFixtureFails(
  'aliased-constructor-chain-dynamic-code',
  `
const makeFunction = globalThis.constructor.constructor;
makeFunction('return fetch("https://example.com")');
`,
  'contains blocked runtime call makeFunction (dynamic code execution)',
);
assertFixtureFails(
  'string-timeout-dynamic-code',
  `
setTimeout('fetch("https://example.com")', 10);
`,
  'contains string timer dynamic code via setTimeout',
);
assertFixtureFails(
  'string-timeout-call-wrapper-dynamic-code',
  `
setTimeout.call(null, 'fetch("https://example.com")', 10);
`,
  'contains string timer dynamic code via setTimeout',
);
assertFixtureFails(
  'string-timeout-apply-wrapper-dynamic-code',
  `
setTimeout.apply(null, ['fetch("https://example.com")', 10]);
`,
  'contains string timer dynamic code via setTimeout',
);
assertFixtureFails(
  'string-timeout-bind-wrapper-dynamic-code',
  `
setTimeout.bind(null, 'fetch("https://example.com")', 10);
`,
  'contains string timer dynamic code via setTimeout',
);
assertFixtureFails(
  'string-timeout-reflect-apply-wrapper-dynamic-code',
  `
Reflect.apply(setTimeout, null, ['fetch("https://example.com")', 10]);
`,
  'contains string timer dynamic code via setTimeout',
);
assertFixtureFails(
  'string-timeout-aliased-reflect-apply-wrapper-dynamic-code',
  `
const runtimeReflect = Reflect;
runtimeReflect.apply(setTimeout, null, ['fetch("https://example.com")', 10]);
`,
  'contains string timer dynamic code via setTimeout',
);
assertFixtureFails(
  'bracket-string-interval-dynamic-code',
  `
globalThis['setInterval']('fetch("https://example.com")', 10);
`,
  'contains string timer dynamic code via globalThis.setInterval',
);
assertFixtureFails(
  'aliased-string-timeout-dynamic-code',
  `
const later = setTimeout;
later('fetch("https://example.com")', 10);
`,
  'contains string timer dynamic code via later',
);
assertFixtureFails(
  'assigned-string-timeout-call-wrapper-dynamic-code',
  `
let later;
later = globalThis.setTimeout;
later.call(null, 'fetch("https://example.com")', 10);
`,
  'contains string timer dynamic code via later',
);
assertFixtureFails(
  'destructured-string-interval-reflect-apply-dynamic-code',
  `
const { setInterval: repeat } = window;
Reflect.apply(repeat, null, ['fetch("https://example.com")', 10]);
`,
  'contains string timer dynamic code via repeat',
);
assertFixtureFails(
  'namespace-aliased-string-timeout-dynamic-code',
  `
const runtimeGlobal = globalThis;
const { setTimeout: later } = runtimeGlobal;
later('fetch("https://example.com")', 10);
`,
  'contains string timer dynamic code via later',
);
assertFixtureFails(
  'vm-compile-function-dynamic-code',
  `
vm['compileFunction']('return fetch("https://example.com")');
`,
  'contains blocked runtime call vm.compileFunction (dynamic code execution)',
);
assertFixtureFails(
  'aliased-vm-compile-function-dynamic-code',
  `
import runtimeVm from 'node:vm';
const compileUnsafe = runtimeVm.compileFunction;
compileUnsafe('return fetch("https://example.com")');
`,
  'contains blocked runtime call compileUnsafe (dynamic code execution)',
);
assertFixtureFails(
  'destructured-vm-run-in-this-context-dynamic-code',
  `
import * as runtimeVm from 'node:vm';
const { runInThisContext: runUnsafe } = runtimeVm;
runUnsafe('fetch("https://example.com")');
`,
  'contains blocked runtime call runUnsafe (dynamic code execution)',
);
assertFixtureFails(
  'constructor-chain-dynamic-code',
  `
globalThis.constructor.constructor('return fetch("https://example.com")')();
`,
  'contains blocked runtime call globalThis.constructor.constructor (dynamic code execution)',
);
assertFixtureFails(
  'bracket-constructor-chain-dynamic-code',
  `
globalThis['constructor']['constructor']('return fetch("https://example.com")')();
`,
  'contains blocked runtime call globalThis.constructor.constructor (dynamic code execution)',
);
assertFixtureFails(
  'new-constructor-chain-dynamic-code',
  `
new globalThis.constructor.constructor('return fetch("https://example.com")');
`,
  'constructs dynamic code constructor globalThis.constructor.constructor',
);
assertFixturePasses(
  'create-require-local-crypto-harness',
  `
import { createRequire } from 'node:module';
const nodeRequire = createRequire(import.meta.url);
nodeRequire('crypto');
`,
);
assertFixturePasses(
  'vm-run-in-new-context-harness',
  `
import vm from 'node:vm';
vm.runInNewContext('module.exports = 1', { module: { exports: {} } });
`,
);
assertFixturePasses(
  'callback-timeout',
  `
setTimeout(() => {}, 10);
`,
);
assertFixturePasses(
  'callback-timeout-string-delay',
  `
setTimeout(() => {}, '10');
`,
);
assertFixturePasses(
  'callback-timeout-apply-string-delay',
  `
setTimeout.apply(null, [() => {}, '10']);
`,
);
assertFixturePasses(
  'aliased-callback-timeout',
  `
const later = setTimeout;
later(() => {}, 10);
`,
);
assertFixturePasses(
  'provider-helper-property-not-called',
  `
const mockSupabaseModule = {
  createClient: () => {
    throw new Error('not called');
  },
};
void mockSupabaseModule;
`,
);
assertFixturePasses(
  'blocked-constructor-property-not-constructed',
  `
const browserMocks = {
  WebSocket: class MockWebSocket {},
};
void browserMocks;
`,
);
assertFixturePasses(
  'local-reflect-construct-harness',
  `
class LocalHarness {}
Reflect.construct(LocalHarness, []);
`,
);
assertFixturePasses(
  'bound-object-assign-local-object',
  `
const assignLocal = Object.assign.bind(null);
const localObject = {};
assignLocal(localObject, { safe: true });
`,
);
assertFixturePasses(
  'aliased-object-namespace-local-object',
  `
const runtimeObject = Object;
const localObject = {};
runtimeObject.assign(localObject, { safe: true });
`,
);
assertFixturePasses(
  'read-only-file-alias',
  `
import { readFileSync as readText } from 'node:fs';
readText('docs/soe-operator-system.md', 'utf8');
`,
);
assertFixturePasses(
  'read-only-url-file',
  `
import { readFileSync } from 'node:fs';
readFileSync(new URL('../docs/soe-operator-system.md', import.meta.url), 'utf8');
`,
);
assertFixturePasses(
  'read-only-constant-file-path',
  `
import { readFileSync } from 'node:fs';
const docPath = 'docs/soe-operator-system.md';
readFileSync(docPath, 'utf8');
`,
);
assertFixturePasses(
  'read-only-composed-file-path',
  `
import { readFileSync } from 'node:fs';
const docDir = 'docs/';
const docPath = docDir + 'soe-operator-system.md';
readFileSync(docPath, 'utf8');
`,
);
assertFixturePasses(
  'read-only-composed-apply-file-path',
  `
import { readFileSync } from 'node:fs';
const docPath = 'docs/' + 'soe-operator-system.md';
readFileSync.apply(null, [docPath, 'utf8']);
`,
);
assertFixturePasses(
  'read-only-string-raw-file-path',
  `
import { readFileSync } from 'node:fs';
readFileSync(String.raw` + "`docs/soe-operator-system.md`" + `, 'utf8');
`,
);

function collectSmokeScriptTargets(scripts, packageRoot) {
  return Object.entries(scripts)
    .filter(([scriptName]) => scriptName.endsWith(':smoke'))
    .map(([scriptName, command]) => {
      const match = typeof command === 'string' ? command.match(smokeCommandPattern) : null;
      const packageLabel = packageRoot || 'root';
      const targetName = `${packageLabel}:${scriptName}`;
      assert(
        Boolean(match),
        `${packageLabel} ${scriptName} must use a simple local node smoke command so operator:script-boundary:smoke can scan it`,
      );
      return {
        optional: promptAtlasBoundaryOptInSmokeScripts.has(targetName),
        scriptName: targetName,
        scriptPath: match?.[1] ? join(packageRoot, match[1]) : undefined,
      };
    });
}

const allSmokeScriptTargets = [
  ...collectSmokeScriptTargets(packageScripts, ''),
  ...collectSmokeScriptTargets(promptAtlasPackageScripts, 'prompts-mvp'),
];
const promptAtlasOptInSmokeTargets = allSmokeScriptTargets.filter((target) => target.optional);
assert(
  promptAtlasOptInSmokeTargets.length === promptAtlasBoundaryOptInSmokeScripts.size &&
    promptAtlasOptInSmokeTargets.every((target) => promptAtlasBoundaryOptInSmokeScripts.has(target.scriptName)),
  'Prompt Atlas boundary opt-ins must match real package smoke scripts exactly',
);

const smokeScriptTargets = allSmokeScriptTargets.filter((target) => !target.optional);

for (const target of smokeScriptTargets) {
  assert(
    Boolean(target.scriptPath) && existsSync(join(root, target.scriptPath)),
    `${target.scriptName} points at missing ${target.scriptPath ?? '<unresolved>'}`,
  );
  if (target.scriptPath && existsSync(join(root, target.scriptPath))) {
    scanSmokeScript(target.scriptPath);
  }
}

if (failures.length > 0) {
  console.error('Operator script boundary smoke failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Operator script boundary smoke passed: ${smokeScriptTargets.length} smoke script(s) scanned.`);
