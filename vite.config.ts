/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

import { testBuildLabel } from './src/lib/build-label.ts'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// `npm run build:test` (TEST_BUILD=1) adds the commit and build time to the footer, so a build served to
// test on a device can be told apart from a cached one. Plain `npm run build` leaves it empty.
const git = (args: string) => execSync(`git ${args}`, { encoding: 'utf8' }).trim()
const buildLabel = process.env.TEST_BUILD
  ? testBuildLabel({ commit: git('rev-parse --short HEAD'), dirty: git('status --porcelain') !== '', builtAt: new Date() })
  : ''

// https://vite.dev/config/
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version), __APP_BUILD_LABEL__: JSON.stringify(buildLabel) },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'PDF Toolbox',
        short_name: 'PDF Toolbox',
        description: 'Private PDF tools that run entirely in your browser.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm,webmanifest,webp}'],
        // qpdf.wasm is ~2.2 MB, above Workbox's 2 MiB default; without this the build fails.
        maximumFileSizeToCacheInBytes: 3_000_000,
        navigateFallback: '/index.html',
        // The first install takes over the open page as soon as it finishes, so the first visit works
        // offline without a relaunch. Updates still wait for "Update now" (registerType 'prompt').
        clientsClaim: true,
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    testTimeout: 30_000,
  },
})
