'use strict';

// Runs from app/build.gradle. Reads only an explicitly supplied private file;
// never discovers credentials in the environment or prints descriptor contents.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const repositoryRoot = path.resolve(__dirname, '../../..');
const fail = (code) => { throw new Error(`SOE_RELEASE_${code}`); };
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const within = (root, file) => file === root || file.startsWith(root + path.sep);

function privateFile(filename, root, maximum, label) {
  if (typeof filename !== 'string' || !path.isAbsolute(filename)) fail(`${label}_ABSOLUTE_PATH_REQUIRED`);
  let real, info;
  try {
    info = fs.lstatSync(filename);
    real = fs.realpathSync(filename);
  } catch { fail(`${label}_UNAVAILABLE`); }
  if (info.isSymbolicLink() || real !== path.resolve(filename) || !info.isFile()) fail(`${label}_REGULAR_FILE_REQUIRED`);
  if (within(root, real)) fail(`${label}_MUST_BE_OUTSIDE_CHECKOUT`);
  if ((info.mode & 0o077) !== 0) fail(`${label}_PRIVATE_PERMISSIONS_REQUIRED`);
  if (info.size === 0 || info.size > maximum) fail(`${label}_SIZE_INVALID`);
  let fd;
  try {
    fd = fs.openSync(real, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.dev !== info.dev || opened.ino !== info.ino || opened.size !== info.size) fail(`${label}_CHANGED`);
    const bytes = fs.readFileSync(fd);
    if (bytes.length !== info.size || fs.fstatSync(fd).mtimeMs !== opened.mtimeMs) fail(`${label}_CHANGED`);
    return { real, bytes };
  } catch (error) {
    if (/^SOE_RELEASE_/.test(error.message)) throw error;
    fail(`${label}_UNAVAILABLE`);
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

function validateReleaseConfig(filename, options = {}) {
  const root = fs.realpathSync(options.repositoryRoot || repositoryRoot);
  if (!filename) fail('EXPLICIT_CONFIG_REQUIRED');
  const config = privateFile(filename, root, 16384, 'CONFIG');
  const configSha256 = digest(config.bytes);
  if (options.expectedSha256 && options.expectedSha256 !== configSha256) fail('CONFIG_CHANGED');
  let data;
  try { data = JSON.parse(config.bytes.toString('utf8')); } catch { fail('CONFIG_JSON_INVALID'); }
  const fields = ['version', 'applicationId', 'applicationIdOwnership', 'signingKeyOwnership', 'storeFile', 'storeSha256', 'keyAlias', 'storePassword', 'keyPassword'];
  if (!data || Array.isArray(data) || typeof data !== 'object' ||
      Object.keys(data).length !== fields.length || fields.some(key => !Object.hasOwn(data, key))) fail('CONFIG_FIELDS_INVALID');
  if (data.version !== 1) fail('CONFIG_VERSION_INVALID');
  if (typeof data.applicationId !== 'string' || data.applicationId.length > 200 ||
      !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(data.applicationId) ||
      data.applicationId.split('.').some(part => /^(anonymous|example|synthetic|demo|debug|test|invalid|blocked)$/i.test(part))) fail('OWNED_APPLICATION_ID_REQUIRED');
  if (data.applicationIdOwnership !== 'owner-confirmed' || data.signingKeyOwnership !== 'owner-confirmed') fail('OWNERSHIP_CONFIRMATION_REQUIRED');
  if (typeof data.keyAlias !== 'string' || data.keyAlias.length > 200 ||
      !/^[A-Za-z0-9_.-]+$/.test(data.keyAlias) || /^androiddebugkey$/i.test(data.keyAlias)) fail('NON_DEBUG_ALIAS_REQUIRED');
  for (const key of ['storePassword', 'keyPassword']) {
    if (typeof data[key] !== 'string' || !data[key].trim() || data[key].length > 1024 ||
        /[\u0000-\u001f\u007f]/.test(data[key]) || data[key] === 'android') fail('NON_DEBUG_PASSWORDS_REQUIRED');
  }
  if (typeof data.storeSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(data.storeSha256)) fail('KEYSTORE_HASH_REQUIRED');
  if (typeof data.storeFile !== 'string' || /^(debug\.keystore|debug\.jks)$/i.test(path.basename(data.storeFile))) fail('NON_DEBUG_KEYSTORE_REQUIRED');
  const store = privateFile(data.storeFile, root, 16 * 1024 * 1024, 'KEYSTORE');
  const storeSha256 = digest(store.bytes);
  if (storeSha256 !== data.storeSha256) fail('KEYSTORE_HASH_MISMATCH');
  const debugFile = options.debugKeystore || path.join(__dirname, 'app/debug.keystore');
  if (fs.existsSync(debugFile) && digest(fs.readFileSync(debugFile)) === storeSha256) fail('DEBUG_KEYSTORE_FORBIDDEN');
  // Deliberately omit both passwords; Gradle reads the already validated file.
  return { applicationId: data.applicationId, storeFile: store.real, keyAlias: data.keyAlias, storeSha256, configSha256 };
}

module.exports = { validateReleaseConfig };
if (require.main === module) {
  try {
    if (process.argv.length < 3 || process.argv.length > 4) fail('EXPLICIT_CONFIG_REQUIRED');
    const result = validateReleaseConfig(process.argv[2], { expectedSha256: process.argv[3] });
    process.stdout.write(JSON.stringify(result));
  } catch (error) {
    // JSON parser, filesystem and credential values never enter the log.
    process.stderr.write(/^SOE_RELEASE_[A-Z_]+$/.test(error.message) ? error.message + '\n' : 'SOE_RELEASE_CONFIG_REJECTED\n');
    process.exitCode = 1;
  }
}
