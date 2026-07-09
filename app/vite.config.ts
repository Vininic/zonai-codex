import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // dataset e demo save são grandes; cacheia sob demanda em runtime
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg}'],
        runtimeCaching: [
          {
            urlPattern: /\/data\/.*\.json$/,
            handler: 'CacheFirst',
            options: { cacheName: 'zonai-data' },
          },
          {
            urlPattern: /\/map\/.*\.webp$/,
            handler: 'CacheFirst',
            options: { cacheName: 'zonai-map' },
          },
        ],
      },
      manifest: {
        name: 'Zonai Codex',
        short_name: 'Zonai Codex',
        description: 'Tears of the Kingdom 100% tracker, save editor & companion',
        theme_color: '#0b1210',
        background_color: '#0b1210',
        display: 'standalone',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
})
