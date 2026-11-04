// Private build guard: no external network or provider request is permitted.
const denied = () => { throw Error('EXTERNAL_NETWORK_DISABLED_IN_PRIVATE_BUILD'); };
globalThis.fetch = denied;
for (const name of ['node:http', 'node:https']) {
  const module = require(name); module.request = denied; module.get = denied;
}
const net = require('node:net');
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = args[0];
  const host = first && typeof first === 'object' ? first.host : typeof args[1] === 'string' ? args[1] : undefined;
  if (host && !['localhost', '127.0.0.1', '::1'].includes(host)) return denied();
  return connect.apply(this, args);
};
