import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { // dev: forward API calls to the backend
      '/auth': 'http://localhost:4000',
      '/members': 'http://localhost:4000',
      '/categories': 'http://localhost:4000',
      '/transactions': 'http://localhost:4000',
      '/loans': 'http://localhost:4000',
      '/summary': 'http://localhost:4000',
    },
  },
});
