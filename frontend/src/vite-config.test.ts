// @vitest-environment node

import { describe, expect, it } from 'vitest';
import config from '../vite.config';

describe('production source map policy', () => {
  it('disables public source maps while keeping Vite client variables explicit', () => {
    expect(config.build?.sourcemap).toBe(false);
    expect(config.envPrefix).toBe('VITE_');
    expect(config.define).toBeUndefined();
  });
});
