const { resetWorkerManager } = require('./src/services/worker-manager');
const dns = require('dns');

// Default mock for dns.resolve4 and dns.resolve6 in tests to avoid real network queries
dns.resolve4 = (hostname, ...args) => {
  const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
  if (cb) {
    process.nextTick(() => cb(null, ['93.184.216.34']));
  }
};

dns.resolve6 = (hostname, ...args) => {
  const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
  if (cb) {
    const err = Object.assign(new Error('ENODATA'), { code: 'ENODATA' });
    process.nextTick(() => cb(err));
  }
};

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  resetWorkerManager();
});

