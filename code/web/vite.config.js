import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    // host: true lets you access from 0.0.0.0 — useful on Termux/Kali
    host: true,
    port: 5173,

    // Dev proxy — forwards /api/* to backend during local development
    // This avoids CORS issues when testing locally.
    // In production (Vercel), VITE_API_BASE_URL is used directly.
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  // Expose env variables prefixed with VITE_
  // VITE_API_BASE_URL is used by src/api/auth.api.js
  envPrefix: 'VITE_',
})
