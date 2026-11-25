import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest'
import { hydrateRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { render, renderHook, act, fireEvent, waitFor } from '@testing-library/react'
import { ThemeProvider, useTheme, type Theme } from '../../../src/lib/theme/provider'
import { themeBootstrapScript } from '../../../src/lib/theme/bootstrap-script'
import { signUp, signOut } from '../../../src/lib/auth'
import { adminClient } from '../helpers/supabase-admin'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

function ThemeLogoProbe() {
  const { theme, setTheme } = useTheme()
  return (
    <>
      <div data-testid="theme-logo-light" className="manjam-logo-light" data-src="/images/logo/manjam-logo-horizontal-light.svg" />
      <div data-testid="theme-logo-dark" className="manjam-logo-dark" data-src="/images/logo/manjam-logo-horizontal-dark.svg" />
      <button onClick={() => void setTheme(theme === 'light' ? 'dark' : 'light')}>Switch theme</button>
    </>
  )
}

function ThemeSnapshotProbe() {
  const { theme } = useTheme()
  return <span data-testid="theme-snapshot" data-theme={theme} />
}

async function isSupabaseReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/health`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

// Resolved in beforeAll so it.skipIf() can use a plain boolean (no top-level await)
let supabaseReachable = false

describe('Theme Provider', () => {
  let testUserId: string | undefined

  beforeAll(async () => {
    supabaseReachable = await isSupabaseReachable()
  })

  afterEach(async () => {
    if (testUserId) {
      await adminClient.auth.admin.deleteUser(testUserId)
      testUserId = undefined
    }
    await signOut()
    localStorage.removeItem('testo_theme')
    document.cookie = 'testo_theme=; path=/; max-age=0'
    // Clean up class applied to <html>
    document.documentElement.classList.remove('dark')
  })

  // ─── T018-A: Class toggling ───────────────────────────────────────────────
  it('adds "dark" class to <html> when initialTheme is "dark"', async () => {
    render(<ThemeProvider initialTheme="dark"><div>Test</div></ThemeProvider>)
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })
  })

  it('does NOT add "dark" class to <html> when initialTheme is "light"', async () => {
    render(<ThemeProvider initialTheme="light"><div>Test</div></ThemeProvider>)
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })
  })

  // ─── T018-B: setTheme toggling via hook ──────────────────────────────────
  it('useTheme hook allows toggling from light to dark', async () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider initialTheme="light">{children}</ThemeProvider>,
    })

    expect(result.current.theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    act(() => { result.current.setTheme('dark') })

    await waitFor(() => {
      expect(result.current.theme).toBe('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })
    expect(document.cookie).toContain('testo_theme=dark')
  })

  it('useTheme hook allows toggling from dark back to light', async () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider initialTheme="dark">{children}</ThemeProvider>,
    })

    act(() => { result.current.setTheme('light') })

    await waitFor(() => {
      expect(result.current.theme).toBe('light')
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })
  })

  it('updates the rendered logo immediately when the theme changes', () => {
    const { getByRole, getByTestId } = render(
      <ThemeProvider initialTheme="light"><ThemeLogoProbe /></ThemeProvider>,
    )

    expect(getByTestId('theme-logo-light')).toHaveAttribute('data-src', '/images/logo/manjam-logo-horizontal-light.svg')
    expect(getByTestId('theme-logo-dark')).toHaveAttribute('data-src', '/images/logo/manjam-logo-horizontal-dark.svg')
    fireEvent.click(getByRole('button', { name: 'Switch theme' }))
    expect(getByTestId('theme-logo-light')).toBeInTheDocument()
    expect(getByTestId('theme-logo-dark')).toBeInTheDocument()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  // ─── T018-C: Fallback when no initial theme ───────────────────────────────
  it('falls back to "light" (matchMedia returns false in jsdom mock) when no initialTheme', async () => {
    render(<ThemeProvider><div>Test</div></ThemeProvider>)
    // matchMedia is mocked to return matches: false in setup.ts → should fall back to light
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    }, { timeout: 3000 })
  })

  it('bootstraps a cached dark theme before hydration and persists it for the next request', async () => {
    document.cookie = 'testo_theme=; path=/; max-age=0'
    localStorage.setItem('testo_theme', 'dark')
    expect(document.cookie).not.toContain('testo_theme=')

    const serverMarkup = renderToStaticMarkup(
      <ThemeProvider><ThemeSnapshotProbe /></ThemeProvider>,
    )
    expect(serverMarkup).toContain('data-theme="light"')

    new Function('window', 'document', themeBootstrapScript)(window, document)

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.cookie).toContain('testo_theme=dark')

    const container = document.createElement('div')
    container.innerHTML = serverMarkup
    document.body.append(container)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const root = hydrateRoot(container, <ThemeProvider><ThemeSnapshotProbe /></ThemeProvider>)

    await waitFor(() => {
      expect(container.querySelector('[data-testid="theme-snapshot"]')).toHaveAttribute('data-theme', 'dark')
    })
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/hydration|did not match/i)
    root.unmount()
    container.remove()
    consoleError.mockRestore()

    const cookieTheme = document.cookie.match(/(?:^|; )testo_theme=(light|dark)/)?.[1] as Theme
    const nextServerMarkup = renderToStaticMarkup(
      <ThemeProvider initialTheme={cookieTheme}><ThemeSnapshotProbe /></ThemeProvider>,
    )
    expect(nextServerMarkup).toContain('data-theme="dark"')
  })

  it.each(['light', 'dark'] as const)('prefers the %s cookie over a stale localStorage value', (theme) => {
    const staleTheme = theme === 'light' ? 'dark' : 'light'
    document.cookie = `testo_theme=${theme}; path=/; max-age=31536000; samesite=lax`
    localStorage.setItem('testo_theme', staleTheme)

    new Function('window', 'document', themeBootstrapScript)(window, document)

    expect(document.documentElement.classList.contains('dark')).toBe(theme === 'dark')
    expect(localStorage.getItem('testo_theme')).toBe(theme)
  })

  // ─── T018-D: useTheme throws outside provider ─────────────────────────────
  it('useTheme throws when used outside ThemeProvider', () => {
    expect(() => {
      renderHook(() => useTheme())
    }).toThrow('useTheme must be used within a ThemeProvider')
  })

  // ─── T018-E: Profile integration (requires local Supabase + Docker) ───────
  it('reads preferred_theme from profile for a logged-in user', async (ctx) => {
      if (!supabaseReachable) {
        ctx.skip()
        return
      }
      const email = `theme-${crypto.randomUUID()}@testo.local`
      const { data: { user }, error: signUpError } = await signUp(email, 'Password123!', { preferred_theme: 'dark' })
      expect(signUpError).toBeNull()
      testUserId = user?.id

      // Wait for the Supabase Postgres trigger to create the profile row
      await new Promise(resolve => setTimeout(resolve, 500))
      // A cache from this device must not suppress the authenticated profile
      // preference that was changed elsewhere.
      localStorage.setItem('testo_theme', 'light')

      render(<ThemeProvider><div>Test</div></ThemeProvider>)

      await waitFor(() => {
        expect(localStorage.getItem('testo_theme')).toBe('dark')
        expect(document.documentElement.classList.contains('dark')).toBe(true)
      }, { timeout: 10000 })
    }, 20000)
})
