import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['apps/api/src/server.ts'],
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  outDir: 'dist/api',
  noExternal: ['@vaultline/contracts'],
  clean: true,
  sourcemap: true,
});
