import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE_PATH || (mode === 'production' ? '/zbxt/' : '/'),
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',  // 允许局域网访问
    allowedHosts: ['localhost', '.trycloudflare.com'],  // 允许 Cloudflare Tunnel 域名
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
}))
