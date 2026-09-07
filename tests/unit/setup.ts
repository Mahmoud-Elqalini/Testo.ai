import '@testing-library/jest-dom'

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
