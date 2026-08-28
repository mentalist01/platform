import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replace(/\\/g, '/')
          if (!moduleId.includes('/node_modules/')) return undefined
          if (moduleId.includes('/monaco-editor/') || moduleId.includes('/@monaco-editor/')) return 'editor-vendor'
          if (moduleId.includes('/yjs/') || moduleId.includes('/y-websocket/') || moduleId.includes('/y-monaco/')) return 'collaboration-vendor'
          if (moduleId.includes('/prismjs/')) return 'syntax-vendor'
          if (moduleId.includes('/lucide-react/')) return 'icons-vendor'
          if (moduleId.includes('/react/') || moduleId.includes('/react-dom/') || moduleId.includes('/scheduler/')) return 'react-vendor'
          return undefined
        },
      },
    },
  },
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
