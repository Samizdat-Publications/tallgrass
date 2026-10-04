import { realpathSync } from 'node:fs';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

// a git worktree (scratch/wt) links node_modules to the main checkout's: let the dev server read through that link, or it
// refuses the font files and captures fall back to system fonts
const modules = (() => { try { return [realpathSync('node_modules')]; } catch { return []; } })();

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  // don't scan or watch the big non-source folders: with them, a dev server (and every capture tool built on one) took
  // minutes to start
  server: {
    port: 5199,
    strictPort: true,
    watch: { ignored: ['**/scratch/**', '**/.venv/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**'] },
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), ...modules] },
  },
  optimizeDeps: { entries: ['index.html'] },
  preview: { port: 5198, strictPort: true },
});
