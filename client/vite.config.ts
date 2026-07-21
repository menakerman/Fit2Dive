import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy target is overridable so the e2e harness can use a non-default port.
      '/api': process.env.VITE_API_PROXY || 'http://localhost:3001',
    },
  },
});
