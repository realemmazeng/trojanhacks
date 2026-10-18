import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev` proxies API calls to safety_server.py, so the app works the same in dev
// (http://localhost:5173) and when the built app is served by the backend (port 8000).
const backend = process.env.SAFETY_PATH_BACKEND || 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/path': backend,
      '/api': backend,
    },
  },
});
