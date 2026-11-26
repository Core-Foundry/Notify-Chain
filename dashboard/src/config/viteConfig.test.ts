import { execFileSync } from 'node:child_process';
import { describe, expect, it } from '@jest/globals';

const config = JSON.parse(
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { resolve } from 'node:path';
import { loadConfigFromFile } from 'vite';
const loaded = await loadConfigFromFile(
  { command: 'build', mode: 'production' },
  resolve(process.cwd(), 'vite.config.ts'),
);
if (!loaded) throw new Error('Vite configuration could not be loaded');
console.log(JSON.stringify({
  build: loaded.config.build,
  envPrefix: loaded.config.envPrefix,
  define: loaded.config.define,
  server: loaded.config.server,
}));`,
    ],
    { cwd: process.cwd(), encoding: 'utf8' },
  ),
);

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
