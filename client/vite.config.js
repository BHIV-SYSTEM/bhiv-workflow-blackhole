

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// import tailwindcss from 'tailwindcss';
import { VitePWA } from 'vite-plugin-pwa';
import { ESLint } from 'eslint'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Permanent guard against `ReferenceError: X is not defined` from JSX.
 *
 * Vite compiles `<X />` with an undefined `X` without error, so the failure
 * only appears at runtime. ESLint's core `no-undef` also skips JSX element
 * names. This plugin lints every source module with react/jsx-no-undef during
 * dev HMR and production builds, and fails fast with the file and line.
 */
function undefinedJsxGuard() {
  let eslint

  return {
    name: 'undefined-jsx-guard',
    enforce: 'pre',
    configResolved() {
      eslint = new ESLint({
        overrideConfigFile: path.resolve(__dirname, 'eslint.undefined.config.js'),
      })
    },
    async transform(code, id) {
      const normalizedId = id.replace(/\\/g, '/')
      if (!eslint || !normalizedId.includes('/src/') || !/\.[jt]sx?$/.test(normalizedId)) {
        return null
      }

      const [result] = await eslint.lintText(code, { filePath: id })
      const messages = (result?.messages || []).filter(
        (message) =>
          message.severity === 2 &&
          (message.ruleId === 'no-undef' || message.ruleId === 'react/jsx-no-undef')
      )

      if (messages.length) {
        const details = messages
          .map((message) => `${id}:${message.line}:${message.column} ${message.message}`)
          .join('\n')
        throw new Error(`Undefined identifier(s) in JSX:\n${details}`)
      }

      return null
    },
  }
}

export default defineConfig({
  plugins: [undefinedJsxGuard(), react(), tailwindcss(), VitePWA({
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
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
      },
    },
  },
})
