'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useTranslation } from '@/lib/i18n/use-translation'

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
  const { t, language } = useTranslation()
  const admin = role === 'admin'
  const links = dashboardMode
    ? [
        { key: 'dashboard', href: dashboardHref ?? '/dashboard', label: t('nav.dashboard'), icon: '⌂' },
        { key: 'courses', href: null, label: t('dashboard.myCourses'), icon: '▣' },
        { key: 'explore', href: null, label: t('dashboard.exploreCourses'), icon: '◉' },
        { key: 'groups', href: admin ? '/admin/groups' : '/student/join-group', label: t('dashboard.myGroups'), icon: '♧' },
        { key: 'exams', href: admin ? '/admin#exam-list' : '/student#open-exams-title', label: t('dashboard.studentExams'), icon: '▤' },
        { key: 'settings', href: null, label: t('dashboard.settings'), icon: '⚙' },
      ]
    : admin
    ? [
        { key: 'dashboard', href: dashboardHref ?? '/admin', label: t('nav.dashboard'), icon: '▦' },
        { key: 'exams', href: '/admin#exam-list', label: t('admin.exams.title'), icon: '▤' },
        { key: 'groups', href: '/admin/groups', label: t('admin.groups.title'), icon: '♧' },
      ]
    : [
        { key: 'dashboard', href: dashboardHref ?? '/student', label: t('nav.dashboard'), icon: '▦' },
        { key: 'exams', href: '/student#open-exams-title', label: t('student.exam.available'), icon: '▤' },
        { key: 'groups', href: '/student/join-group', label: t('dashboard.joinGroup'), icon: '♧' },
      ]

  return (
    <div dir={language === 'ar' ? 'rtl' : 'ltr'} className={`testo-workspace${focusMode ? ' testo-workspace-focus' : ''}${dashboardMode ? ' testo-workspace-dashboard' : ''}`}>
      {!focusMode && <aside className="testo-sidebar">
        <Link className="testo-brand" href={dashboardHref ?? (admin ? '/admin' : '/student')}>
          <span className="testo-brand-mark">T</span><span><strong>Testo</strong>{!dashboardMode && <small>{language === 'ar' ? 'مساحة المدرسة' : 'School workspace'}</small>}</span>
        </Link>
        {!dashboardMode && <p className="testo-nav-label">{t('nav.dashboard')}</p>}
        <nav className="testo-nav" aria-label={t('nav.dashboard')}>
          {links.map((item) => item.href ? <Link key={item.key} className={`testo-nav-item${active === item.key ? ' is-active' : ''}`} href={item.href}>
            <span className="testo-nav-icon" aria-hidden="true"><WorkspaceIcon name={item.key} /></span><span>{item.label}</span>
          </Link> : <span key={item.key} className="testo-nav-item is-disabled" aria-disabled="true" title={t('dashboard.comingSoon')}>
            <span className="testo-nav-icon" aria-hidden="true"><WorkspaceIcon name={item.key} /></span><span>{item.label}</span><small>{t('dashboard.comingSoon')}</small>
          </span>)}
        </nav>
        <div className="testo-sidebar-spacer" />
        {dashboardMode ? <>
          <div className="testo-account-card">
            <span className="testo-account-avatar" aria-hidden="true">{userName.trim().charAt(0).toLocaleUpperCase(language) || 'T'}</span>
            <span className="testo-account-copy"><strong>{userName || t('dashboard.account')}</strong><small>{admin ? t('dashboard.teacherAccount') : t('dashboard.studentAccount')}</small></span>
            {onSignOut && <button type="button" className="testo-account-signout" onClick={onSignOut} aria-label={t('dashboard.logout')} title={t('dashboard.logout')}>⇥</button>}
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

export function WorkspaceIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    dashboard: <><path d="m3.5 10 8.5-7 8.5 7" /><path d="M5.5 9v11h13V9M9 20v-6h6v6" /></>,
    courses: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z" /><path d="M4 5.5v13A2.5 2.5 0 0 1 6.5 16H20M8 7h8M8 10h6" /></>,
    explore: <><circle cx="12" cy="12" r="9" /><path d="m15.7 8.3-2.2 5.2-5.2 2.2 2.2-5.2z" /></>,
    groups: <><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" /><circle cx="10" cy="8" r="3" /><path d="M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M16 5.2a3 3 0 0 1 0 5.6" /></>,
    exams: <><path d="M7 3.5h7l4 4V20H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2z" /><path d="M14 3.5V8h4M9 12h6M9 16h6" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5a7.7 7.7 0 0 0 0-3l1.4-1.1-1.5-2.6-1.7.7a7.6 7.6 0 0 0-2.6-1.5L14.7 4h-3l-.3 2a7.6 7.6 0 0 0-2.6 1.5l-1.7-.7-1.5 2.6L7 10.5a7.7 7.7 0 0 0 0 3l-1.4 1.1 1.5 2.6 1.7-.7a7.6 7.6 0 0 0 2.6 1.5l.3 2h3l.3-2a7.6 7.6 0 0 0 2.6-1.5l1.7.7 1.5-2.6z" /></>,
  }
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.dashboard}</svg>
}
