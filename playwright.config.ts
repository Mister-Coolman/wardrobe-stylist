import { defineConfig, devices } from '@playwright/test'

const PORT = 3100

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, ...devices['iPhone 13'], browserName: 'chromium' },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { NEXT_DIST_DIR: '.next/e2e', MODELS: 'mock', DEV_USER_EMAIL: 'e2e@example.com', LOCAL_DB_PATH: '.data/e2e-db.json', MEDIA_DIR: '.data/e2e-media', SUPABASE_URL: '', WEATHER: 'fixture', NEXT_PUBLIC_FEATURE_POLL: '1', NEXT_PUBLIC_FEATURE_STYLE: '1', WHATSAPP_TOKEN: 'e2e-not-real', WHATSAPP_DISPLAY_NUMBER: '+1 555 0100' },
  },
})
