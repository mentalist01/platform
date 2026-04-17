import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://localhost:5175',
      '/uploads': 'http://localhost:5175',
      '/collab': {
        target: 'http://localhost:5175',
        ws: true,
      },
      '/rtc': {
        target: 'http://localhost:5175',
        ws: true,
      },
    },
  },
  preview: {
    proxy: {
      '/api': 'http://localhost:5175',
      '/uploads': 'http://localhost:5175',
      '/collab': {
        target: 'http://localhost:5175',
        ws: true,
      },
      '/rtc': {
        target: 'http://localhost:5175',
        ws: true,
      },
    },
  },
})
