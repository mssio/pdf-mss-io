import { defineConfig, devices } from '@playwright/test'

// Runs against the production build (`npm run test:e2e` builds first). See spec section 9.
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  tsconfig: './tsconfig.app.json',
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
  },
  use: {
    baseURL: 'http://localhost:4173',
    // Service workers would serve cached chunks and bypass page.route(); only offline.spec.ts enables them.
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: /offline\.spec\.ts/ },
  ],
})
