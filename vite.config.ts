import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const roomEnv = loadEnv('', repoRoot, 'NIX_ROOM_');
// The game server Vite proxies to (NIX_ROOM_PORT, as the server reads it), and Vite's own port (VITE_PORT):
// a scratch copy runs both off the usual 7700/5173.
const server = `http://127.0.0.1:${roomEnv.NIX_ROOM_PORT || 7700}`;

// NIX_ROOM_ALLOWED_HOSTS (in .env): extra host names the dev server answers, like the server's own list.
const allowedHosts = (roomEnv.NIX_ROOM_ALLOWED_HOSTS ?? '')
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
    port: Number(process.env.VITE_PORT) || 5173,
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
