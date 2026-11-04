'use strict';
// Build-time PUBLIC policy validator, also exercised directly by offline tests.
// It reads no files, environment, signing material or account configuration.
function memberConfig(origin, storageKey) {
  if (typeof origin !== 'string' || typeof storageKey !== 'string') throw Error('Invalid public member policy');
  if (origin === '' && storageKey === '') return { origin: '', storageKey: '' };
  if (!/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[1-9][0-9]{0,4})?$/.test(origin) || origin.length > 300
    || !/^[A-Za-z0-9._-]{1,160}$/.test(storageKey)) throw Error('Invalid public member policy');
  const parsed = new URL(origin);
  if (parsed.origin !== origin || parsed.hostname.split('.').some(label => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-')))
    throw Error('Invalid public member policy');
  return { origin, storageKey };
}
module.exports = { memberConfig };
if (require.main === module) {
  try {
    if (process.argv.length !== 4) throw Error('Invalid public member policy');
    process.stdout.write(JSON.stringify(memberConfig(process.argv[2], process.argv[3])));
  } catch { process.stderr.write('SoE member public configuration rejected.\n'); process.exitCode = 1; }
}
