import { defineConfig } from 'vite';

// Relative base so the build runs from any folder on a static HTTP server,
// not just the domain root (contest judges may serve it from a subpath).
// server.host: true binds 0.0.0.0 so the Windows browser can reach the WSL2
// dev server when localhost forwarding isn't working (use the WSL IP).
export default defineConfig({ base: './', server: { host: true } });
