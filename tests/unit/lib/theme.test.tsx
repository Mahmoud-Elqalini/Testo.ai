import { describe, it, expect, afterEach, beforeAll } from 'vitest'
import { render, renderHook, act, waitFor } from '@testing-library/react'
import { ThemeProvider, useTheme } from '../../../src/lib/theme/provider'
import { signUp, signOut } from '../../../src/lib/auth'
import { adminClient } from '../helpers/supabase-admin'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

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

  // ─── T018-C: Fallback when no initial theme ───────────────────────────────
  it('falls back to "light" (matchMedia returns false in jsdom mock) when no initialTheme', async () => {
    render(<ThemeProvider><div>Test</div></ThemeProvider>)
    // matchMedia is mocked to return matches: false in setup.ts → should fall back to light
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    }, { timeout: 3000 })
  })

  it('keeps a cached dark preference when no initialTheme is provided', async () => {
    localStorage.setItem('testo_theme', 'dark')

    render(<ThemeProvider><div>Test</div></ThemeProvider>)

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })
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
