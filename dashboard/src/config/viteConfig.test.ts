/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import config from '../../vite.config';

describe('production source map policy', () => {
  it('disables public source maps and does not inject arbitrary environment values', () => {
    expect(config.build?.sourcemap).toBe(false);
    expect(config.envPrefix).toBe('VITE_');
    expect(config.define).toBeUndefined();
  });

  it('leaves the Vite development server available for browser debugging', () => {
    expect(config.server).toBeDefined();
  });
});
