// Lightweight uuid stub for tests — replaces the missing uuid package.
let counter = 0;
module.exports = {
  v4: () => `test-uuid-${String(++counter).padStart(4, '0')}`,
};
