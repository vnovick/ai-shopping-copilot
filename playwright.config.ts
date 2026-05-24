import { defineConfig } from '@playwright/test'

// E2E uses its own port + production build to be hermetic:
//   - port 3100 keeps it clear of any running `pnpm dev` on 3000
//   - `next start` avoids Next's "another dev server is already running"
//     lock that fires across ports
//   - `next build` is included so a fresh checkout produces the right
//     bundle. Subsequent runs reuse .next/ until source changes.
const E2E_PORT = 3100
const E2E_URL = `http://localhost:${E2E_PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: E2E_URL,
  },
  webServer: {
    command: `pnpm exec next build && pnpm exec next start --port ${E2E_PORT}`,
    url: E2E_URL,
    reuseExistingServer: !process.env.CI,
    // Production build can take ~30s on a cold cache.
    timeout: 120_000,
    env: {
      DATABASE_FILE: './local-e2e.db',
    },
  },
})
