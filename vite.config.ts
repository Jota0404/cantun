import fs from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/salmodia/' : '/',

  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'CANTUM',
        short_name: 'CANTUM',
        description:
          'Cifras, repertórios e modo palco offline para músicos de igreja.',
        start_url: './',
        display: 'standalone',
        background_color: '#121212',
        theme_color: '#121212',
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
    ...(fs.existsSync('./10.190.119.79+2-key.pem') &&
    fs.existsSync('./10.190.119.79+2.pem')
      ? {
          https: {
            key: fs.readFileSync('./10.190.119.79+2-key.pem'),
            cert: fs.readFileSync('./10.190.119.79+2.pem'),
          },
        }
      : {}),
  },

  test: {
    environment: 'node',
  },
})
