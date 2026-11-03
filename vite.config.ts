/// <reference types="vitest/config" />
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let commitId = 'unknown';
try { commitId = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {
  // Source archives may not contain Git metadata.
}

export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  // GitHub Pages serves the repo under /safety/, not the domain root (issue #31).
  // `npm run preview` also serves dist/, whose assets are already built under /safety/,
  // so it needs the same base — only `command === 'build'` missed that (Codex review,
  // PR #33). `npm run dev` is unaffected either way and keeps serving at `/`.
  base: command === 'build' || isPreview ? '/safety/' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __COMMIT_ID__: JSON.stringify(commitId),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
}));
