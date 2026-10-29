import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const server = 'http://127.0.0.1:7700';

// NIX_ROOM_ALLOWED_HOSTS (in .env): extra host names the dev server answers, like the server's own list.
const allowedHosts = (loadEnv('', repoRoot, 'NIX_ROOM_').NIX_ROOM_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

export default defineConfig({
  root: 'web',
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    allowedHosts,
    // web/ imports from ../shared
    fs: { allow: [repoRoot] },
    proxy: {
      '/ws': { target: server, ws: true },
      '/api': server,
      '/scenes': server,
    },
  },
});
