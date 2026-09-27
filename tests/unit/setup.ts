import '@testing-library/jest-dom'
import { webcrypto } from 'node:crypto'
import { TextEncoder } from 'node:util'

// Auth integration tests run against the local app as a secure browser context.
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto })
Object.defineProperty(globalThis, 'TextEncoder', { configurable: true, value: TextEncoder })
Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })

// Mock window.matchMedia — jsdom does not implement it.
// This is required by the ThemeProvider which checks prefers-color-scheme.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, // default: light mode
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})
