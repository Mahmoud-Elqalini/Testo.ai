const PUBLIC_PATHS = new Set(['/login', '/register', '/reset-password']);

/**
 * Pure function to resolve auth redirects.
 * Returns the destination path to redirect to, or null if no redirect is needed.
 * 
 * Rules:
 * 1. Authenticated users on /login, /register, or root (/) -> redirect to /dashboard
 * 2. Unauthenticated users on non-public paths -> redirect to /login
 */
export function resolveAuthRedirect(pathname: string, isAuthenticated: boolean): string | null {
  const isPublicPath = PUBLIC_PATHS.has(pathname);

  // Authenticated users
  if (isAuthenticated) {
    if (pathname === '/' || pathname === '/login' || pathname === '/register') {
      return '/dashboard';
    }
    // /reset-password is allowed for authenticated users to change their password
    return null;
  }

  // Unauthenticated users
  if (!isAuthenticated && !isPublicPath) {
    return '/login';
  }

  return null;
}
