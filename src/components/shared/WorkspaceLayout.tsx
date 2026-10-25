'use client'

import Link from 'next/link'
import Image from 'next/image'
import { BookOpen, CalendarDays, Compass, FileText, LayoutDashboard, LogOut, Menu, Settings, Users, X, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from '@/lib/i18n/use-translation'
import { CourseSearch } from '@/components/shared/CourseSearch'
import { PreferenceControls } from '@/components/shared/PreferenceSwitcher'

type WorkspaceLayoutProps = {
  role: 'admin' | 'student' | null
  active: 'dashboard' | 'exams' | 'groups' | 'exam-room'
  children: ReactNode
  focusMode?: boolean
  dashboardHref?: string
  dashboardMode?: boolean
  userName?: string
  onSignOut?: () => void
}

export function WorkspaceLayout({ role, active, children, focusMode = false, dashboardHref, dashboardMode = false, userName = '', onSignOut }: WorkspaceLayoutProps) {
  const { t, language } = useTranslation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const skipMenuFocusReturn = useRef(false)
  const admin = role === 'admin'
  const links = admin
    ? [
        { key: 'dashboard', href: dashboardHref ?? '/admin', label: t('nav.dashboard') },
        { key: 'exams', href: '/admin#exam-list', label: t('admin.exams.title') },
        { key: 'groups', href: '/admin/groups', label: t('admin.groups.title') },
      ]
    : [
        { key: 'dashboard', href: dashboardHref ?? '/student', label: t('nav.dashboard') },
        { key: 'exams', href: '/student#open-exams-title', label: t('student.exam.available') },
        { key: 'groups', href: '/student/join-group', label: t('dashboard.joinGroup') },
      ]

  useEffect(() => {
    if (!dashboardMode || !mobileMenuOpen) return
    const menuButton = menuButtonRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
      if (skipMenuFocusReturn.current) skipMenuFocusReturn.current = false
      else menuButton?.focus()
    }
  }, [dashboardMode, mobileMenuOpen])

  const keepFocusInMobileMenu = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return
    const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
    )
    if (focusable.length === 0) return
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

  if (dashboardMode && !focusMode) {
    return (
      <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="dashboard-shell testo-workspace-dashboard">
        <header className="dashboard-header">
          <Link className="dashboard-header-brand" href="/dashboard" aria-label={t('nav.dashboard')}>
            <span className="dashboard-brand-mark"><Image src="/testo-mark.png" alt="" fill sizes="36px" /></span><strong>Testo</strong>
          </Link>
          <CourseSearch isDrawerOpen={mobileMenuOpen} onSearchOpen={() => { if (mobileMenuOpen) { skipMenuFocusReturn.current = true; setMobileMenuOpen(false) } }} />
          <div className="dashboard-header-actions">
            <button
              ref={menuButtonRef}
              type="button"
              className={`dashboard-menu-toggle${mobileMenuOpen ? ' is-open' : ''}`}
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label={mobileMenuOpen ? t('common.close') : t('common.menu')}
              aria-expanded={mobileMenuOpen}
              aria-controls="dashboard-navigation-drawer"
            >
              {mobileMenuOpen ? <X size={20} strokeWidth={2} aria-hidden="true" /> : <Menu size={20} strokeWidth={2} aria-hidden="true" />}
            </button>
            <PreferenceControls />
          </div>
        </header>
        <button className={`dashboard-drawer-backdrop${mobileMenuOpen ? ' is-visible' : ''}`} type="button" aria-label={t('common.close')} onClick={() => setMobileMenuOpen(false)} tabIndex={-1} aria-hidden={!mobileMenuOpen} />
        <aside
          id="dashboard-navigation-drawer"
          className={`dashboard-drawer${mobileMenuOpen ? ' is-open' : ''}`}
          role="dialog"
          aria-modal={mobileMenuOpen}
          aria-label={t('nav.dashboard')}
          onKeyDown={mobileMenuOpen ? keepFocusInMobileMenu : undefined}
        >
          <div className="dashboard-drawer-header">
            <Link className="dashboard-header-brand" href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
              <span className="dashboard-brand-mark"><Image src="/testo-mark.png" alt="" fill sizes="36px" /></span><strong>Testo</strong>
            </Link>
            <button ref={closeButtonRef} className="dashboard-drawer-close" type="button" aria-label={t('common.close')} onClick={() => setMobileMenuOpen(false)}>
              <X size={20} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
          <nav className="dashboard-nav" aria-label={t('nav.dashboard')}>
            <ul>
              <li><Link className={`dashboard-nav-item${active === 'dashboard' ? ' is-active' : ''}`} href={dashboardHref ?? '/dashboard'} aria-current={active === 'dashboard' ? 'page' : undefined} onClick={() => setMobileMenuOpen(false)}><WorkspaceIcon name="dashboard" /><span>{t('nav.dashboard')}</span></Link></li>
              <li><button className="dashboard-nav-item is-disabled" type="button" disabled aria-disabled="true"><WorkspaceIcon name="courses" /><span>{t('dashboard.myCourses')}</span><small>{t('nav.soon')}</small></button></li>
              <li><button className="dashboard-nav-item is-disabled" type="button" disabled aria-disabled="true"><WorkspaceIcon name="explore" /><span>{t('dashboard.exploreCourses')}</span><small>{t('nav.soon')}</small></button></li>
              {role && <li><Link className={`dashboard-nav-item${active === 'groups' ? ' is-active' : ''}`} href={admin ? '/admin/groups' : '/student/join-group'} aria-current={active === 'groups' ? 'page' : undefined} onClick={() => setMobileMenuOpen(false)}><WorkspaceIcon name="groups" /><span>{t('dashboard.myGroups')}</span></Link></li>}
              {role && <li><Link className={`dashboard-nav-item${active === 'exams' ? ' is-active' : ''}`} href={admin ? '/admin#exam-list' : '/student#open-exams-title'} aria-current={active === 'exams' ? 'page' : undefined} onClick={() => setMobileMenuOpen(false)}><WorkspaceIcon name="exams" /><span>{t('dashboard.studentExams')}</span></Link></li>}
              <li><button className="dashboard-nav-item is-disabled" type="button" disabled aria-disabled="true"><WorkspaceIcon name="settings" /><span>{t('dashboard.settings')}</span><small>{t('nav.soon')}</small></button></li>
            </ul>
          </nav>
          <div className="dashboard-account-card">
            <span className="dashboard-account-avatar" aria-hidden="true">{userName.trim().charAt(0).toLocaleUpperCase(language) || 'T'}</span>
            <span className="dashboard-account-copy" title={userName || undefined}><strong>{userName || t('dashboard.account')}</strong><small>{role ? admin ? t('nav.adminRole') : t('dashboard.studentRole') : t('common.loading')}</small></span>
            {onSignOut && <button className="dashboard-account-signout" type="button" onClick={() => { setMobileMenuOpen(false); onSignOut() }} aria-label={t('dashboard.logout')} title={t('dashboard.logout')}><WorkspaceIcon name="logout" size={16} /><span>{t('dashboard.logout')}</span></button>}
          </div>
        </aside>
        <main className="dashboard-main"><div className="testo-page-content">{children}</div></main>
      </div>
    )
  }

  return (
    <div dir={language === 'ar' ? 'rtl' : 'ltr'} className={`testo-workspace${focusMode ? ' testo-workspace-focus' : ''}`}>
      <div className="testo-main">
        {!dashboardMode && <header className="testo-topbar">
          {!focusMode && <div className="testo-breadcrumb">{admin ? (language === 'ar' ? 'مساحة المدرسة' : 'School workspace') : t('student.exam.dashboardTitle')} <span>/</span> {links.find((item) => item.key === active)?.label}</div>}
          {focusMode && <span className="testo-saved-indicator"><i />{t('student.exam.autosaveHint')}</span>}
        </header>}
        <div className="testo-page-content">{children}</div>
      </div>
    </div>
  )
}

type WorkspaceIconName = 'dashboard' | 'courses' | 'explore' | 'groups' | 'exams' | 'settings' | 'calendar' | 'logout';
type WorkspaceIconProps = { name: string; size?: 16 | 20 | 24; className?: string };

export function WorkspaceIcon({ name, size = 20, className }: WorkspaceIconProps) {
  const icons: Record<WorkspaceIconName, LucideIcon> = {
    dashboard: LayoutDashboard,
    courses: BookOpen,
    explore: Compass,
    groups: Users,
    exams: FileText,
    settings: Settings,
    calendar: CalendarDays,
    logout: LogOut,
  };
  const Icon = icons[name as WorkspaceIconName] ?? LayoutDashboard;
  return <Icon size={size} strokeWidth={2} className={className} aria-hidden="true" />;
}
