import { defineConfig } from 'vite';

// Relative base so the build runs from any folder on a static HTTP server,
// not just the domain root (contest judges may serve it from a subpath).
export default defineConfig({ base: './' });
