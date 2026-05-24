import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { handlers } from './tests/mocks/dummyjson'

// MSW intercepts fetch globally; tests that don't hit DummyJSON simply
// don't trigger a handler. `bypass` lets non-DummyJSON requests pass through.
const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())

// jsdom doesn't implement scrollIntoView — stub it so components that auto-
// scroll on mount don't blow up under test.
if (typeof window !== 'undefined' && !window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {}
}
