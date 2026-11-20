import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3001,
    proxy: {
      '/api': 'http://127.0.0.1:9000',
      '/snapshots': 'http://127.0.0.1:9000',
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})

