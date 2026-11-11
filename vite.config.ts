import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The API (and its Server-Sent Events stream) runs in its own Node process; see server/index.ts.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
})
