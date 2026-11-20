

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// import tailwindcss from 'tailwindcss';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'icon-192x192.png', 'icon-512x512.png'],
    workbox: {
      maximumFileSizeToCacheInBytes: 10 * 1024 * 1024 // 10 MB
    },
    manifest: {
      name: 'Infiverse - AI Workflow Management',
      short_name: 'Infiverse',
      description: 'Blackhole Infiverse AI-powered workflow management platform',
      theme_color: '#10b981',
      background_color: '#070b14',
      display: 'standalone',
      start_url: '/',
      icons: [
        {
          src: 'icon-192x192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: 'icon-512x512.png',
          sizes: '512x512',
          type: 'image/png'
        }
      ]
    }
  })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
