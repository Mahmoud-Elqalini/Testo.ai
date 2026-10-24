'use client'

import Link from 'next/link'
import { BookOpen, CalendarDays, Compass, FileText, Home, Menu, Moon, Settings, Sun, UsersRound, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from '@/lib/i18n/use-translation'
import { useTheme } from '@/lib/theme/provider'

type WorkspaceLayoutProps = {
  role: 'admin' | 'student'
  active: 'dashboard' | 'exams' | 'groups' | 'exam-room'
  children: ReactNode
  focusMode?: boolean
  dashboardHref?: string
  dashboardMode?: boolean
  userName?: string
  onSignOut?: () => void
}

export function WorkspaceLayout({ role, active, children, focusMode = false, dashboardHref, dashboardMode = false, userName = '', onSignOut }: WorkspaceLayoutProps) {
  const { t, language, setLanguage } = useTranslation()
  const { theme, setTheme } = useTheme()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const admin = role === 'admin'
  const links = dashboardMode
    ? [
        { key: 'dashboard', href: dashboardHref ?? '/dashboard', label: t('nav.dashboard') },
        { key: 'courses', href: '#continue-learning-title', label: t('dashboard.myCourses') },
        { key: 'explore', href: '#featured-courses-title', label: t('dashboard.exploreCourses') },
        { key: 'groups', href: admin ? '/admin/groups' : '/student/join-group', label: t('dashboard.myGroups') },
        { key: 'exams', href: admin ? '/admin#exam-list' : '/student#open-exams-title', label: t('dashboard.studentExams') },
        { key: 'settings', href: '#dashboard-settings', label: t('dashboard.settings') },
      ]
    : admin
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
    if (!mobileMenuOpen) return
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
      menuButton?.focus()
    }
  }, [mobileMenuOpen])

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

  return (
    <div dir={language === 'ar' ? 'rtl' : 'ltr'} className={`testo-workspace${focusMode ? ' testo-workspace-focus' : ''}${dashboardMode ? ' testo-workspace-dashboard' : ''}`}>
      {!focusMode && dashboardMode && <header id="dashboard-settings" className="testo-mobile-header">
        <button ref={menuButtonRef} type="button" className={`testo-mobile-menu-button${mobileMenuOpen ? ' is-open' : ''}`} onClick={() => setMobileMenuOpen((open) => !open)} aria-label={mobileMenuOpen ? t('common.close') : t('common.menu')} aria-expanded={mobileMenuOpen} aria-controls="testo-mobile-navigation">
          <WorkspaceIcon name={mobileMenuOpen ? 'close' : 'menu'} size={20} />
        </button>
        <Link className="testo-mobile-brand" href={dashboardHref ?? (admin ? '/admin' : '/student')}>
          <span className="testo-brand-mark"><img src="/testo-mark.png" alt="" /></span><strong>Testo</strong>
        </Link>
        <div className="testo-mobile-header-actions">
          <button type="button" className="testo-mobile-language" onClick={() => void setLanguage(language === 'en' ? 'ar' : 'en').catch(() => {})} aria-label={t('preferences.language')}>
            {language === 'en' ? 'AR' : 'EN'}
          </button>
          <button type="button" className="testo-mobile-theme-icon" onClick={() => void setTheme(theme === 'light' ? 'dark' : 'light').catch(() => {})} aria-label={t('preferences.theme')} aria-pressed={theme === 'dark'}>
            <WorkspaceIcon name={theme === 'light' ? 'moon' : 'sun'} />
          </button>
        </div>
      </header>}
      {!focusMode && dashboardMode && <button className={`testo-mobile-backdrop${mobileMenuOpen ? ' is-visible' : ''}`} type="button" aria-label={t('common.close')} onClick={() => setMobileMenuOpen(false)} tabIndex={mobileMenuOpen ? 0 : -1} aria-hidden={!mobileMenuOpen} />}
      {!focusMode && <aside id={dashboardMode ? 'testo-mobile-navigation' : undefined} className={`testo-sidebar${dashboardMode && mobileMenuOpen ? ' is-open' : ''}`} role={dashboardMode && mobileMenuOpen ? 'dialog' : undefined} aria-modal={dashboardMode && mobileMenuOpen ? true : undefined} aria-label={dashboardMode && mobileMenuOpen ? t('nav.dashboard') : undefined} onKeyDown={dashboardMode && mobileMenuOpen ? keepFocusInMobileMenu : undefined}>
        {dashboardMode && <div className="testo-mobile-drawer-header">
          <Link className="testo-mobile-brand" href={dashboardHref ?? (admin ? '/admin' : '/student')} onClick={() => setMobileMenuOpen(false)}>
            <span className="testo-brand-mark"><img src="/testo-mark.png" alt="" /></span><strong>Testo</strong>
          </Link>
          <button ref={closeButtonRef} type="button" className="testo-mobile-close-button" onClick={() => setMobileMenuOpen(false)} aria-label={t('common.close')}><WorkspaceIcon name="close" size={20} /></button>
        </div>}
        <Link className="testo-brand" href={dashboardHref ?? (admin ? '/admin' : '/student')}>
          <span className="testo-brand-mark"><img src="/testo-mark.png" alt="" /></span><span><strong>Testo</strong>{!dashboardMode && <small>{language === 'ar' ? 'مساحة المدرسة' : 'School workspace'}</small>}</span>
        </Link>
        {!dashboardMode && <p className="testo-nav-label">{t('nav.dashboard')}</p>}
        <nav className="testo-nav" aria-label={t('nav.dashboard')}>
          {links.map((item) => item.href ? <Link key={item.key} className={`testo-nav-item${active === item.key ? ' is-active' : ''}`} href={item.href} onClick={() => setMobileMenuOpen(false)}>
            <span className="testo-nav-icon" aria-hidden="true"><WorkspaceIcon name={item.key} /></span><span>{item.label}</span>
          </Link> : null)}
        </nav>
        <div className="testo-sidebar-spacer" />
        {dashboardMode ? <>
          <div className="testo-account-card">
            <span className="testo-account-avatar" aria-hidden="true">{userName.trim().charAt(0).toLocaleUpperCase(language) || 'T'}</span>
            <span className="testo-account-copy"><strong>{userName || t('dashboard.account')}</strong><small>{admin ? t('dashboard.teacherAccount') : t('dashboard.studentAccount')}</small></span>
            {onSignOut && <button type="button" className="testo-account-signout" onClick={onSignOut} aria-label={t('dashboard.logout')} title={t('dashboard.logout')}>{t('dashboard.logout')}</button>}
          </div>
        </> : <div className="testo-help-card"><span className="testo-help-icon">?</span><span><strong>{language === 'ar' ? 'مركز المساعدة' : 'Help center'}</strong><small>{language === 'ar' ? 'نحن هنا لمساعدتك' : 'We’re here to help'}</small></span></div>}
      </aside>}
      <div className="testo-main">
        {!dashboardMode && <header className="testo-topbar">
          {focusMode ? <Link className="testo-brand testo-brand-compact" href="/student"><span className="testo-brand-mark">✦</span><strong>testo</strong></Link> : <div className="testo-breadcrumb">{admin ? (language === 'ar' ? 'مساحة المدرسة' : 'School workspace') : t('student.exam.dashboardTitle')} <span>/</span> {links.find((item) => item.key === active)?.label}</div>}
          {focusMode && <span className="testo-saved-indicator"><i />{t('student.exam.autosaveHint')}</span>}
        </header>}
        <div className="testo-page-content">{children}</div>
      </div>
    </div>
  )
}

type WorkspaceIconName = 'dashboard' | 'courses' | 'explore' | 'groups' | 'exams' | 'settings' | 'moon' | 'sun' | 'calendar' | 'menu' | 'close';
type WorkspaceIconProps = { name: string; size?: 16 | 20 | 24; className?: string };

export function WorkspaceIcon({ name, size = 20, className }: WorkspaceIconProps) {
  const icons: Record<WorkspaceIconName, typeof Home> = {
    dashboard: Home,
    courses: BookOpen,
    explore: Compass,
    groups: UsersRound,
    exams: FileText,
    settings: Settings,
    moon: Moon,
    sun: Sun,
    calendar: CalendarDays,
    menu: Menu,
    close: X,
  };
  const Icon = icons[name as WorkspaceIconName] ?? Home;
  return <Icon size={size} strokeWidth={2} className={className} aria-hidden="true" />;
}
