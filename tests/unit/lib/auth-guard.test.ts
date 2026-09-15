import { describe, expect, it } from 'vitest'
import { resolveAuthRedirect } from '../../../src/lib/auth-guard'

describe('Auth Guard Routing Logic', () => {
  it('redirects unauthenticated users to /login for protected routes', () => {
    expect(resolveAuthRedirect('/dashboard', false)).toBe('/login')
    expect(resolveAuthRedirect('/admin', false)).toBe('/login')
  })

  it('allows unauthenticated users on public routes', () => {
    expect(resolveAuthRedirect('/login', false)).toBeNull()
    expect(resolveAuthRedirect('/register', false)).toBeNull()
    expect(resolveAuthRedirect('/reset-password', false)).toBeNull()
  })

  it('redirects authenticated users from /login and /register to /dashboard', () => {
    expect(resolveAuthRedirect('/login', true)).toBe('/dashboard')
    expect(resolveAuthRedirect('/register', true)).toBe('/dashboard')
  })

  it('redirects authenticated users from root (/) to /dashboard', () => {
    expect(resolveAuthRedirect('/', true)).toBe('/dashboard')
  })

  it('allows authenticated users on /reset-password', () => {
    // Crucial fix: authenticated users MUST be able to reach /reset-password
    expect(resolveAuthRedirect('/reset-password', true)).toBeNull()
  })

  it('allows authenticated users on protected routes', () => {
    expect(resolveAuthRedirect('/dashboard', true)).toBeNull()
    expect(resolveAuthRedirect('/admin', true)).toBeNull()
  })
})
