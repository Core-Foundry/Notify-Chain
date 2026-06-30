const { resetWorkerManager } = require('./src/services/worker-manager');

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  resetWorkerManager();
});
