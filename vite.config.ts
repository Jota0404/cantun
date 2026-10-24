import fs from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// HTTPS opcional no `vite preview` para testes em dispositivo na rede local.
// Defina PREVIEW_HTTPS_KEY e PREVIEW_HTTPS_CERT (ver .env.example).
const previewHttpsKey = process.env.PREVIEW_HTTPS_KEY
const previewHttpsCert = process.env.PREVIEW_HTTPS_CERT
const previewHttps =
  previewHttpsKey &&
  previewHttpsCert &&
  fs.existsSync(previewHttpsKey) &&
  fs.existsSync(previewHttpsCert)
    ? { key: previewHttpsKey, cert: previewHttpsCert }
    : null

// https://vite.dev/config/
export default defineConfig({

  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      // Padrão do Workbox + woff2: a Nunito Sans (ADR-066) precisa estar no cache para o app abrir offline.
      workbox: { globPatterns: ['**/*.{js,css,html,woff2}'] },
      manifest: {
        name: 'CANTUM',
        short_name: 'CANTUM',
        description:
          'Cifras, repertórios e modo palco offline para músicos de igreja.',
        start_url: './',
        display: 'standalone',
        background_color: '#0d1620',
        theme_color: '#0d1620',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],

  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    ...(previewHttps
      ? {
          https: {
            key: fs.readFileSync(previewHttps.key),
            cert: fs.readFileSync(previewHttps.cert),
          },
        }
      : {}),
  },

  test: {
    environment: 'node',
  },
})
