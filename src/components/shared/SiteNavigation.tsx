'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BookOpen, Compass, FileText, LayoutDashboard, LogOut, Menu, Settings, Users, X, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { CourseSearch } from '@/components/shared/CourseSearch'
import { PreferenceControls } from '@/components/shared/PreferenceSwitcher'
import { useTranslation } from '@/lib/i18n/use-translation'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/lib/types'

type Account = { role: UserRole; fullName: string }
type NavigationIcon = 'dashboard' | 'courses' | 'explore' | 'groups' | 'exams' | 'settings' | 'logout'

const navigationIcons: Record<NavigationIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  courses: BookOpen,
  explore: Compass,
  groups: Users,
  exams: FileText,
  settings: Settings,
  logout: LogOut,
}

function NavigationIconView({ name, size = 20 }: { name: NavigationIcon; size?: 16 | 20 | 24 }) {
  const Icon = navigationIcons[name]
  return <Icon size={size} strokeWidth={2} aria-hidden="true" />
}

export function SiteNavigation({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { language, t } = useTranslation()
  const [account, setAccount] = useState<Account | null>(null)
  const [authResolved, setAuthResolved] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const skipFocusReturn = useRef(false)
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const isDashboardRoute = pathname === '/dashboard'

  useEffect(() => {
    const supabase = createClient()
    supabaseRef.current = supabase
    let mounted = true
    let requestId = 0

    const loadAccount = async (userId: string | null) => {
      const currentRequest = ++requestId
      if (!userId) {
        if (mounted && currentRequest === requestId) {
          setAccount(null)
          setAuthResolved(true)
        }
        return
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', userId)
        .maybeSingle()

      if (!mounted || currentRequest !== requestId) return
      if (error || (profile?.role !== 'admin' && profile?.role !== 'student')) {
        setAccount(null)
      } else {
        setAccount({ role: profile.role, fullName: profile.full_name ?? '' })
      }
      setAuthResolved(true)
    }

    void supabase.auth.getUser()
      .then(({ data: { user } }: { data: { user: User | null } }) => loadAccount(user?.id ?? null))
      .catch(() => loadAccount(null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      window.setTimeout(() => void loadAccount(session?.user.id ?? null), 0)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const menuButton = menuButtonRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
      if (skipFocusReturn.current) skipFocusReturn.current = false
      else menuButton?.focus()
    }
  }, [menuOpen])

  const keepFocusInDrawer = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return
    const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
    )
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const closeForNavigation = () => {
    skipFocusReturn.current = true
    setMenuOpen(false)
  }

  const handleSignOut = async () => {
    closeForNavigation()
    const supabase = supabaseRef.current
    if (!supabase) return
    await supabase.auth.signOut()
    setAccount(null)
    router.push('/login')
    router.refresh()
  }

  const isAdmin = account?.role === 'admin'
  const groupHref = isAdmin ? '/admin/groups' : '/student/join-group'
  const examsHref = isAdmin ? '/admin#exam-list' : '/student#open-exams-title'
  const isGroupsRoute = isAdmin
    ? pathname.startsWith('/admin/groups')
    : pathname === '/student/join-group'
  const isExamsRoute = isAdmin
    ? pathname === '/admin' || pathname.startsWith('/admin/exams')
    : pathname === '/student'
      || pathname.startsWith('/student/exam/')
      || pathname.startsWith('/student/results/')

  return (
    <div className={`dashboard-shell global-app-shell${isDashboardRoute ? ' is-dashboard-route' : ''}`} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {!isDashboardRoute && <>
        <header className="dashboard-header global-site-header">
          <Link className="dashboard-header-brand" href="/dashboard" aria-label={t('nav.home')}>
            <span className="dashboard-brand-mark"><Image src="/testo-mark.png" alt="" fill sizes="36px" /></span><strong>Testo</strong>
          </Link>
          <CourseSearch isDrawerOpen={menuOpen} onSearchOpen={() => { if (menuOpen) closeForNavigation() }} />
          <div className="dashboard-header-actions">
            <button
              ref={menuButtonRef}
              type="button"
              className={`dashboard-menu-toggle${menuOpen ? ' is-open' : ''}`}
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? t('common.close') : t('common.menu')}
              aria-expanded={menuOpen}
              aria-controls="site-navigation-drawer"
            >
              {menuOpen ? <X size={20} strokeWidth={2} aria-hidden="true" /> : <Menu size={20} strokeWidth={2} aria-hidden="true" />}
            </button>
            <PreferenceControls />
          </div>
        </header>

        <button className={`dashboard-drawer-backdrop${menuOpen ? ' is-visible' : ''}`} type="button" aria-label={t('common.close')} onClick={() => setMenuOpen(false)} tabIndex={-1} aria-hidden={!menuOpen} inert={!menuOpen} />
        <aside
          id="site-navigation-drawer"
          className={`dashboard-drawer${menuOpen ? ' is-open' : ''}`}
          role="dialog"
          aria-modal={menuOpen}
          aria-label={t('nav.dashboard')}
          aria-hidden={!menuOpen}
          inert={!menuOpen}
          onKeyDown={menuOpen ? keepFocusInDrawer : undefined}
        >
          <div className="dashboard-drawer-header">
            <Link className="dashboard-header-brand" href="/dashboard" onClick={closeForNavigation}>
              <span className="dashboard-brand-mark"><Image src="/testo-mark.png" alt="" fill sizes="36px" /></span><strong>Testo</strong>
            </Link>
            <button ref={closeButtonRef} className="dashboard-drawer-close" type="button" aria-label={t('common.close')} onClick={() => setMenuOpen(false)}>
              <X size={20} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
          <nav className="dashboard-nav" aria-label={t('nav.dashboard')}>
            <ul>
              {authResolved && account ? <>
                <li><Link className={`dashboard-nav-item${pathname === '/dashboard' ? ' is-active' : ''}`} href="/dashboard" aria-current={pathname === '/dashboard' ? 'page' : undefined} onClick={closeForNavigation}><NavigationIconView name="dashboard" /><span>{t('nav.dashboard')}</span></Link></li>
                <li><button className="dashboard-nav-item is-disabled" type="button" disabled><NavigationIconView name="courses" /><span>{t('dashboard.myCourses')}</span><small>{t('nav.soon')}</small></button></li>
                <li><button className="dashboard-nav-item is-disabled" type="button" disabled><NavigationIconView name="explore" /><span>{t('dashboard.exploreCourses')}</span><small>{t('nav.soon')}</small></button></li>
                <li><Link className={`dashboard-nav-item${isGroupsRoute ? ' is-active' : ''}`} href={groupHref} aria-current={isGroupsRoute ? 'page' : undefined} onClick={closeForNavigation}><NavigationIconView name="groups" /><span>{t('dashboard.myGroups')}</span></Link></li>
                <li><Link className={`dashboard-nav-item${isExamsRoute ? ' is-active' : ''}`} href={examsHref} aria-current={isExamsRoute ? 'page' : undefined} onClick={closeForNavigation}><NavigationIconView name="exams" /><span>{t('dashboard.studentExams')}</span></Link></li>
                <li><button className="dashboard-nav-item is-disabled" type="button" disabled><NavigationIconView name="settings" /><span>{t('dashboard.settings')}</span><small>{t('nav.soon')}</small></button></li>
              </> : authResolved ? <>
                <li><Link className={`dashboard-nav-item${pathname === '/login' ? ' is-active' : ''}`} href="/login" onClick={closeForNavigation}><NavigationIconView name="dashboard" /><span>{t('auth.login')}</span></Link></li>
                <li><Link className={`dashboard-nav-item${pathname === '/register' ? ' is-active' : ''}`} href="/register" onClick={closeForNavigation}><NavigationIconView name="groups" /><span>{t('auth.register')}</span></Link></li>
              </> : <li><span className="dashboard-nav-item" role="status">{t('common.loading')}</span></li>}
            </ul>
          </nav>
          {account && <div className="dashboard-account-card">
            <span className="dashboard-account-avatar" aria-hidden="true">{account.fullName.trim().charAt(0).toLocaleUpperCase(language) || 'T'}</span>
            <span className="dashboard-account-copy" title={account.fullName || undefined}><strong>{account.fullName || t('dashboard.account')}</strong><small>{isAdmin ? t('nav.adminRole') : t('dashboard.studentRole')}</small></span>
            <button className="dashboard-account-signout" type="button" onClick={() => void handleSignOut()} aria-label={t('dashboard.logout')} title={t('dashboard.logout')}><NavigationIconView name="logout" size={16} /><span>{t('dashboard.logout')}</span></button>
          </div>}
        </aside>
      </>}
      <div className="global-app-content">{children}</div>
    </div>
  )
}
