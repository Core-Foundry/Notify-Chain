/// <reference types="vite/client" />
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { buildSecurityHeaders } from './src/security/csp';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // '' prefix: read CSP_* as well as VITE_* from .env files and the environment.
  // Includes the Content-Security-Policy (see docs/security/content-security-policy.md).
  const securityHeaders = buildSecurityHeaders(loadEnv(mode, rootDir, ''), mode);

  return {
    plugins: [react()],
    server: {
      port: 5173,
      headers: securityHeaders,
      // Workspace path contains ':' (Core-Foundry:Notify-Chain), which breaks Vite's default fs allow checks.
      fs: {
        strict: false,
        allow: [rootDir],
      },
    },
    preview: {
      headers: securityHeaders,
    },
  };
});
