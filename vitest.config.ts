import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const alias = { '@': resolve(__dirname, './') }
const setupFiles = ['./vitest.setup.ts']
const exclude = ['node_modules', '.next', 'tests/e2e']

// Two projects so node-side unit tests and React component tests can each
// use the right environment.
export default defineConfig({
  test: {
    // MSW's fetch interception is sensitive to worker pools — forks reliably
    // applies the patched globalThis.fetch before test modules load it.
    pool: 'forks',
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['**/*.test.ts'],
          exclude,
          setupFiles,
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['**/*.test.tsx'],
          exclude,
          setupFiles,
        },
      },
    ],
  },
})
